'use client';

import { useMemo, useState } from 'react';
import { CalendarBlank, CalendarPlus, Check, Copy, QrCode } from '@phosphor-icons/react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, matchesInLeague } from '@/lib/league/leagueContext';
import { isUpcomingMatch } from '@/lib/status';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { MatchCard } from '@/components/core/MatchCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Match } from '@/types';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { currentSeasonFor } from '@/lib/season';
import { teamsInLeague } from '@/lib/league/leagueContext';
import { generateDoubleRoundRobinFixtures, validateFixtureDraft } from '@/lib/fixtureGenerator';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';

const TABS = ['Upcoming', 'Results'] as const;
type Tab = (typeof TABS)[number];

export function LeagueFixtures() {
  const { userProfile, currentUser, isDemoMode, accessContext } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const catalog = useGoalPlaceData({ collections: ['leagues', 'seasons'] });
  const league = useMemo(() => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext), [userProfile, catalog.leagues, isDemoMode, accessContext]);
  const detail = useGoalPlaceData({
    collections: ['teams', 'matches'],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  const seasons = catalog.seasons;
  const { teams, matches, retry } = detail;
  const loading = catalog.loading || (Boolean(league) && detail.loading);
  const [tab, setTab] = useState<Tab>('Upcoming');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstKickoff, setFirstKickoff] = useState('2027-01-16T15:00');
  const [daysBetweenRounds, setDaysBetweenRounds] = useState('7');
  const [attendanceMatch, setAttendanceMatch] = useState<Match | null>(null);
  const [attendanceUrl, setAttendanceUrl] = useState('');
  const [attendanceQr, setAttendanceQr] = useState('');
  const [attendanceExpiry, setAttendanceExpiry] = useState('');

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const buckets = useMemo(() => {
    if (!league) return { Upcoming: [], Results: [] } as Record<Tab, Match[]>;
    const all = matchesInLeague(league.id, matches);
    return {
      Upcoming: all.filter(isUpcomingMatch).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)),
      Results: all.filter((m) => m.status === 'completed').sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)),
    } as Record<Tab, Match[]>;
  }, [league, matches]);
  const season = league ? currentSeasonFor(seasons, league.id, league.currentSeasonId) : undefined;
  const leagueTeams = useMemo(
    () => league ? teamsInLeague(league.id, teams) : [],
    [league, teams],
  );
  const existingSeasonFixtures = season ? matches.filter((match) => match.seasonId === season.id) : [];
  const previewCount = leagueTeams.length * Math.max(0, leagueTeams.length - 1);
  const fixturePreview = useMemo(() => {
    if (!league || !season || leagueTeams.length < 2) return [];
    try {
      return generateDoubleRoundRobinFixtures({
        league,
        season,
        teams: leagueTeams,
        firstKickoff: new Date(firstKickoff).toISOString(),
        daysBetweenRounds: Number(daysBetweenRounds),
      });
    } catch {
      return [];
    }
  }, [daysBetweenRounds, firstKickoff, league, leagueTeams, season]);
  const fixtureConflicts = useMemo(() => validateFixtureDraft(fixturePreview), [fixturePreview]);

  async function generateFixtures() {
    if (!league || !season) {
      toast.error('Open a season before generating fixtures.');
      return;
    }
    setSaving(true);
    try {
      if (fixtureConflicts.length) throw new Error('Resolve the draft conflicts before publishing.');
      await provider.createFixtures(fixturePreview);
      toast.success(`${fixturePreview.length} home-and-away fixtures published.`);
      setGenerating(false);
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Fixtures could not be generated.');
    } finally {
      setSaving(false);
    }
  }

  async function createAttendanceQr(match: Match) {
    if (!currentUser || isDemoMode) {
      toast.error('Venue QR generation is available on the configured Firebase staging build.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}/attendance-token`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await currentUser.getIdToken()}` },
      });
      const body = await response.json().catch(() => ({})) as { error?: string; path?: string; expiresAt?: string };
      if (!response.ok || !body.path) throw new Error(body.error ?? 'Venue QR could not be generated.');
      const url = `${window.location.origin}${body.path}`;
      setAttendanceMatch(match);
      setAttendanceUrl(url);
      setAttendanceExpiry(body.expiresAt ?? '');
      setAttendanceQr(await QRCode.toDataURL(url, { width: 420, margin: 2, color: { dark: '#05070a', light: '#ffffff' } }));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Venue QR could not be generated.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" /></div>;
  }
  const list = buckets[tab];

  return (
    <div className="-mx-[var(--gutter)] md:mx-0">
      <div className="mb-4">
        <div className="flex items-center justify-between px-[var(--gutter)] pb-3 md:px-0">
          <h1 className="text-xl font-semibold text-text-strong">Fixtures</h1>
          <Button size="sm" icon={CalendarPlus} onClick={() => setGenerating(true)}>Generate</Button>
        </div>
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} className="md:px-0" />
      </div>
      <div className="px-[var(--gutter)] md:px-0">
        {list.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {list.map((m) => (
              <div key={m.id} className="space-y-2">
                <MatchCard match={m} home={teamById.get(m.homeTeamId)} away={teamById.get(m.awayTeamId)} href={`/matches/${m.id}`} />
                {m.status === 'scheduled' || m.status === 'live' ? (
                  <Button size="sm" variant="secondary" icon={QrCode} onClick={() => void createAttendanceQr(m)}>Venue QR</Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={CalendarBlank} title={tab === 'Upcoming' ? 'No upcoming fixtures' : 'No results yet'} description={tab === 'Upcoming' ? 'Scheduled matches across the league appear here.' : 'Played matches appear here, each with its verification status.'} />
        )}
      </div>

      <Sheet
        open={generating}
        onClose={() => setGenerating(false)}
        title="Generate fixtures"
        description={season?.name ?? 'No active season'}
        footer={<Button block icon={Check} onClick={generateFixtures} disabled={saving || !season || Boolean(existingSeasonFixtures.length) || Boolean(fixtureConflicts.length)}>{saving ? 'Publishing fixtures...' : `Publish ${previewCount} fixtures`}</Button>}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">A double round-robin schedule gives every team one home and one away match against every opponent.</p>
          <label className="block text-xs font-semibold uppercase text-subtle">First kickoff<input className="field mt-2 normal-case" type="datetime-local" value={firstKickoff} onChange={(event) => setFirstKickoff(event.target.value)} /></label>
          <label className="block text-xs font-semibold uppercase text-subtle">Days between rounds<input className="field mt-2 normal-case" type="number" min="1" value={daysBetweenRounds} onChange={(event) => setDaysBetweenRounds(event.target.value)} /></label>
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm text-muted">
            <strong className="text-text-strong">{leagueTeams.length} teams · {previewCount} fixtures</strong>
            <p className="mt-1">Draft preview checks venue collisions and gives each team at least 48 hours of rest before publication.</p>
          </div>
          {fixturePreview.slice(0, 3).map((fixture) => (
            <p key={fixture.id} className="text-xs text-muted">
              {teamById.get(fixture.homeTeamId)?.name} vs {teamById.get(fixture.awayTeamId)?.name} / {new Date(fixture.scheduledAt).toLocaleString('en-GB')}
            </p>
          ))}
          {fixtureConflicts.slice(0, 4).map((conflict) => <p key={`${conflict.matchId}-${conflict.message}`} className="text-sm text-[var(--state-error)]">{conflict.message}</p>)}
          {existingSeasonFixtures.length ? <p className="text-sm text-[var(--state-error)]">This season already has {existingSeasonFixtures.length} fixtures. Bulk generation is locked to prevent accidental duplicates.</p> : null}
        </div>
      </Sheet>

      <Sheet
        open={Boolean(attendanceMatch)}
        onClose={() => setAttendanceMatch(null)}
        title="Matchday venue QR"
        description={attendanceMatch ? `${teamById.get(attendanceMatch.homeTeamId)?.name ?? 'Home'} vs ${teamById.get(attendanceMatch.awayTeamId)?.name ?? 'Away'}` : ''}
        footer={<Button block variant="secondary" icon={Copy} onClick={() => { void navigator.clipboard.writeText(attendanceUrl); toast.success('Check-in link copied.'); }}>Copy check-in link</Button>}
      >
        <div className="space-y-4 text-center">
          {attendanceQr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attendanceQr} alt="Matchday attendance QR code" className="mx-auto aspect-square w-full max-w-sm rounded-[var(--radius-md)] bg-white p-3" />
          ) : null}
          <p className="text-sm text-muted">Display this code only at the public venue. Each signed-in fan can check in once and receives the same flat participation points.</p>
          {attendanceExpiry ? <p className="text-xs text-subtle">Expires {new Date(attendanceExpiry).toLocaleString('en-GB')}</p> : null}
        </div>
      </Sheet>
    </div>
  );
}
