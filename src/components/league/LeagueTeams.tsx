'use client';

import { useMemo, useState } from 'react';
import { Buildings, Check, FileCsv, UserPlus } from '@phosphor-icons/react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, teamsInLeague, matchesInLeague } from '@/lib/league/leagueContext';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { RichStandings } from '@/components/premium/RichStandings';
import { TeamCard } from '@/components/core/EntityCards';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import type { Team } from '@/types';

const TABS = ['Standings', 'All teams'] as const;
type Tab = (typeof TABS)[number];

export function LeagueTeams() {
  const { userProfile, currentUser, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const catalog = useGoalPlaceData({ collections: ['leagues', 'seasons'] });
  const league = useMemo(() => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode), [userProfile, catalog.leagues, isDemoMode]);
  const detail = useGoalPlaceData({
    collections: ['teams', 'matches'],
    scope: { leagueId: league?.id ?? '__pending__' },
    recordLimit: 250,
  });
  const seasons = catalog.seasons;
  const { teams, matches, retry } = detail;
  const loading = catalog.loading || (Boolean(league) && detail.loading);
  const [tab, setTab] = useState<Tab>('Standings');
  const [mode, setMode] = useState<'invite' | 'import' | null>(null);
  const [saving, setSaving] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [importRows, setImportRows] = useState<Array<{ name: string; city?: string; venue?: string }>>([]);

  const lTeams = useMemo(() => (league ? teamsInLeague(league.id, teams) : []), [league, teams]);
  const standings = useMemo(() => {
    if (!league) return [];
    const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
    return buildLeagueStandings(lTeams, matchesInLeague(league.id, matches), {
      seasonId: season?.id,
      scoring: season ? scoringForSeason(season, league.sport) : undefined,
    });
  }, [league, lTeams, matches, seasons]);
  const activeSeason = league ? currentSeasonFor(seasons, league.id, league.currentSeasonId) : undefined;

  async function saveOperation() {
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!league || !actorUserId) {
      toast.error('Your League Admin account is not ready.');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'invite') {
        if (!teamId || !inviteEmail.includes('@') || !activeSeason) throw new Error('Choose a team, valid email, and active season.');
        await provider.createTeamAdminInvitation({
          id: `${teamId}_${inviteEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          userId: '',
          teamId,
          leagueId: league.id,
          seasonId: activeSeason.id,
          role: 'team_admin',
          status: 'invited',
          invitedByUserId: actorUserId,
          invitedEmail: inviteEmail.trim().toLowerCase(),
          createdAt: new Date().toISOString(),
        });
        toast.success('Team Admin invitation created.');
      } else {
        if (!importRows.length) throw new Error('Choose a CSV containing team names.');
        const now = new Date().toISOString();
        const imported: Team[] = importRows.map((row, index) => ({
          id: `${league.id}_${row.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `team_${index + 1}`}`,
          name: row.name.trim(),
          sport: league.sport,
          leagueId: league.id,
          city: row.city?.trim() || league.city,
          location: row.venue?.trim() || `${row.name.trim()} home venue`,
          country: 'Uganda',
          description: `${row.name.trim()} competes in ${league.name}.`,
          plan: 'free',
          verified: false,
          adminUserIds: [],
          totalSupport: 0,
          supportersCount: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          leaguePoints: 0,
          verificationStatus: 'pending',
          createdAt: now,
        }));
        await provider.createTeams(imported);
        toast.success(`${imported.length} teams imported.`);
      }
      setMode(null);
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'This operation could not be completed.');
    } finally {
      setSaving(false);
    }
  }

  function readCsv(file?: File) {
    if (!file) return;
    Papa.parse<{ name?: string; city?: string; venue?: string }>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, errors }) => {
        if (errors.length) toast.error(errors[0].message);
        setImportRows(data.filter((row): row is { name: string; city?: string; venue?: string } => Boolean(row.name?.trim())));
      },
    });
  }

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" /></div>;
  }

  return (
    <div className="-mx-[var(--gutter)] md:mx-0">
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2 px-[var(--gutter)] pb-3 md:px-0">
          <h1 className="text-xl font-semibold text-text-strong">Teams</h1>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={FileCsv} onClick={() => setMode('import')}>Import</Button>
            <Button size="sm" icon={UserPlus} onClick={() => setMode('invite')}>Invite</Button>
          </div>
        </div>
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} className="md:px-0" />
      </div>

      <div className="px-[var(--gutter)] md:px-0">
        {tab === 'Standings' ? (
          standings.length ? (
            <RichStandings
              rows={standings}
              matches={matches}
              teamById={new Map(teams.map((t) => [t.id, t]))}
              sportById={(id) => String(teams.find((t) => t.id === id)?.sport ?? '')}
              sport={String(league?.sport ?? '')}
            />
          ) : (
            <EmptyState icon={Buildings} title="No standings yet" description="The table fills in as official results are recorded. Pending results never move it." />
          )
        ) : lTeams.length ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {lTeams.map((t) => <TeamCard key={t.id} team={t} />)}
          </div>
        ) : (
          <EmptyState icon={Buildings} title="No teams yet" description="Teams that join this league appear here." />
        )}
      </div>

      <Sheet
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === 'invite' ? 'Invite Team Admin' : 'Import teams'}
        description={mode === 'invite' ? 'Assignment is scoped to one team and season.' : 'CSV columns: name, city, venue'}
        footer={<Button block icon={Check} onClick={saveOperation} disabled={saving}>{saving ? 'Saving...' : mode === 'invite' ? 'Create invitation' : `Import ${importRows.length} teams`}</Button>}
      >
        {mode === 'invite' ? (
          <div className="space-y-4">
            <label className="block text-xs font-semibold uppercase text-subtle">Team<select className="field mt-2 normal-case" value={teamId} onChange={(event) => setTeamId(event.target.value)}><option value="">Choose team</option>{lTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
            <label className="block text-xs font-semibold uppercase text-subtle">Admin email<input className="field mt-2 normal-case" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="admin@example.com" /></label>
            <p className="text-xs text-muted">The recipient signs in with this email and accepts the assignment. A trusted server then issues the Team Admin claim.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-surface-2 p-4 text-center">
              <FileCsv className="h-7 w-7 text-brand" weight="duotone" />
              <span className="mt-2 text-sm font-semibold text-text-strong">Choose team CSV</span>
              <span className="text-xs text-muted">Required: name. Optional: city and venue.</span>
              <input className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => readCsv(event.target.files?.[0])} />
            </label>
            {importRows.length ? <p className="text-sm text-muted">{importRows.length} valid teams ready: {importRows.slice(0, 3).map((row) => row.name).join(', ')}{importRows.length > 3 ? '...' : ''}</p> : null}
          </div>
        )}
      </Sheet>
    </div>
  );
}
