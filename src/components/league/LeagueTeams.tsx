'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Buildings, Check, FileCsv, Plus } from '@phosphor-icons/react';
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
import { AthleteClaiming } from '@/components/athlete/AthleteClaiming';

const TABS = ['Standings', 'All teams'] as const;
type Tab = (typeof TABS)[number];

export function LeagueTeams() {
  const { userProfile, currentUser, isDemoMode, accessContext } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const catalog = useGoalPlaceData({ collections: ['leagues', 'seasons'] });
  const league = useMemo(() => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext), [userProfile, catalog.leagues, isDemoMode, accessContext]);
  const detail = useGoalPlaceData({
    collections: ['teams', 'matches', 'athletes', 'rosters'],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  const seasons = catalog.seasons;
  const { teams, matches, athletes, rosters, retry } = detail;
  const loading = catalog.loading || (Boolean(league) && detail.loading);
  const [tab, setTab] = useState<Tab>('Standings');
  const [mode, setMode] = useState<'team' | 'import' | null>(null);
  const [saving, setSaving] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamCity, setTeamCity] = useState('');
  const [teamVenue, setTeamVenue] = useState('');
  const [importRows, setImportRows] = useState<Array<{ name: string; city?: string; venue?: string }>>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const submittedRosters = rosters.filter((roster) => roster.status === 'submitted');

  async function reviewRoster(rosterId: string, decision: 'confirmed' | 'returned') {
    const roster = rosters.find((item) => item.id === rosterId);
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!roster || !actorUserId) return;
    setSaving(true);
    try {
      await provider.saveRoster({
        ...roster,
        status: decision,
        approvedByUserId: actorUserId,
        updatedAt: new Date().toISOString(),
      });
      toast.success(decision === 'confirmed' ? 'Roster approved and locked.' : 'Roster returned to the team.');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Roster review failed.');
    } finally {
      setSaving(false);
    }
  }

  const lTeams = useMemo(() => (league ? teamsInLeague(league.id, teams) : []), [league, teams]);
  const standings = useMemo(() => {
    if (!league) return [];
    const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
    return buildLeagueStandings(lTeams, matchesInLeague(league.id, matches), {
      seasonId: season?.id,
      scoring: season ? scoringForSeason(season, league.sport) : undefined,
    });
  }, [league, lTeams, matches, seasons]);

  function openOperation(nextMode: 'team' | 'import') {
    setMode(nextMode);
  }

  async function saveOperation() {
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!league || !actorUserId) {
      toast.error('Your League Admin account is not ready.');
      return;
    }
    setSaving(true);

    try {
      if (mode === 'team') {
        const normalizedName = teamName.trim();
        if (normalizedName.length < 2) throw new Error('Enter the team name.');
        if (lTeams.some((team) => team.name.trim().toLowerCase() === normalizedName.toLowerCase())) {
          throw new Error('A team with this name already exists in the league.');
        }
        const now = new Date().toISOString();
        const newTeamId = `${league.id}_${normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
        await provider.createTeams([{
          id: newTeamId,
          name: normalizedName,
          sport: league.sport,
          leagueId: league.id,
          city: teamCity.trim() || league.city,
          location: teamVenue.trim() || `${normalizedName} home venue`,
          country: 'Uganda',
          description: `${normalizedName} competes in ${league.name}.`,
          plan: 'free',
          verified: false,
          totalSupport: 0,
          supportersCount: 0,
          /*
           * No seeded standings aggregates, and no adminUserIds.
           *
           * Writing wins, losses, pointsFor and leaguePoints here is how clubs came to show a
           * record in a competition that had played no matches: these are projections of
           * official results, and a team created today has none. The standings projection is
           * the only authority for a sporting number.
           */
          verificationStatus: 'pending',
          createdAt: now,
        }]);
        /**
         * No administrator to invite. ADR-004 retired the account class, and the server refuses
         * the action outright, so offering the field here would be a control that always fails.
         *
         * The league runs the club now: rosters, athletes and results are all reachable from
         * League Operations without anybody at the club holding an account.
         */
        toast.success('Team created. You manage its roster and results from League Operations.');
      } else {
        if (!importRows.length || importErrors.length) throw new Error('Resolve the CSV validation errors first.');
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
          totalSupport: 0,
          supportersCount: 0,
          /*
           * No seeded standings aggregates, and no adminUserIds.
           *
           * Writing wins, losses, pointsFor and leaguePoints here is how clubs came to show a
           * record in a competition that had played no matches: these are projections of
           * official results, and a team created today has none. The standings projection is
           * the only authority for a sporting number.
           */
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
        const rows = data.filter((row): row is { name: string; city?: string; venue?: string } => Boolean(row.name?.trim()));
        const existingNames = new Set(lTeams.map((team) => team.name.trim().toLowerCase()));
        const seen = new Set<string>();
        const validationErrors: string[] = [];
        for (const row of rows) {
          const normalized = row.name.trim().toLowerCase();
          if (seen.has(normalized)) validationErrors.push(`Duplicate CSV team: ${row.name.trim()}`);
          if (existingNames.has(normalized)) validationErrors.push(`Team already exists: ${row.name.trim()}`);
          seen.add(normalized);
        }
        if (rows.length > 40) validationErrors.push('A single import is limited to 40 teams.');
        setImportRows(rows);
        setImportErrors(validationErrors);
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
            <Button size="sm" variant="secondary" icon={FileCsv} onClick={() => openOperation('import')}>Import</Button>
            <Button size="sm" icon={Plus} onClick={() => openOperation('team')}>Add team</Button>
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
            {lTeams.map((t) => (
              /*
                Wrapped so a club opens the league's own team page rather than the public
                profile. A League Admin clicking a club here wants its roster, not its
                supporter-facing page.
              */
              <Link key={t.id} href={`/league-admin/teams/${encodeURIComponent(t.id)}`} className="block">
                <TeamCard team={t} standing={standings.find((row) => row.teamId === t.id)} />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={Buildings} title="No teams yet" description="Teams that join this league appear here." />
        )}
      </div>

      {league ? (
        <div className="mt-6 px-[var(--gutter)] md:px-0">
          <AthleteClaiming athletes={athletes} scope="league" targetId={league.id} onChanged={retry} />
        </div>
      ) : null}

      {submittedRosters.length ? (
        <section className="mt-6 space-y-3 px-[var(--gutter)] md:px-0">
          <div>
            <h2 className="text-base font-semibold text-text-strong">Roster approvals</h2>
            <p className="text-xs text-muted">Approval locks the submitted squad for this competition season.</p>
          </div>
          {submittedRosters.map((roster) => (
            <div key={roster.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-1 p-4">
              <div>
                <p className="text-sm font-semibold text-text-strong">{teams.find((team) => team.id === roster.teamId)?.name ?? roster.teamId}</p>
                <p className="text-xs text-muted">{roster.athleteIds.length} athletes / {roster.completeness}% complete</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => void reviewRoster(roster.id, 'returned')} disabled={saving}>Return</Button>
                <Button size="sm" icon={Check} onClick={() => void reviewRoster(roster.id, 'confirmed')} disabled={saving}>Approve</Button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <Sheet
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === 'team' ? 'Add team' : 'Import teams'}
        description={mode === 'team' ? 'Create the club record. You manage its roster, athletes and results from League Operations.' : 'CSV columns: name, city, venue'}
        footer={
          <Button
            block
            icon={mode === 'team' ? Plus : Check}
            onClick={saveOperation}
            disabled={saving || Boolean(importErrors.length)}
          >
            {saving ? 'Saving...' : mode === 'team' ? 'Create team' : `Import ${importRows.length} teams`}
          </Button>
        }
      >
        {mode === 'team' ? (
          <div className="space-y-4">
            <label className="block text-xs font-semibold uppercase text-subtle">Team name<input className="field mt-2 normal-case" value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Kampala City Stars" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase text-subtle">City or district<input className="field mt-2 normal-case" value={teamCity} onChange={(event) => setTeamCity(event.target.value)} placeholder={league?.city ?? 'Kampala'} /></label>
              <label className="block text-xs font-semibold uppercase text-subtle">Home venue<input className="field mt-2 normal-case" value={teamVenue} onChange={(event) => setTeamVenue(event.target.value)} placeholder="Public venue" /></label>
            </div>
            {/*
              No administrator to invite. ADR-004 retired the account class and the server
              refuses the action, so the field that used to sit here promised an invitation
              that was never sent and could not have been.
            */}
            <p className="text-xs leading-5 text-muted">The league runs this club. Rosters, athletes and results are all managed from League Operations; nobody at the club needs an account.</p>
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
            {importErrors.map((message) => <p key={message} className="text-sm text-[var(--state-error)]">{message}</p>)}
          </div>
        )}
      </Sheet>
    </div>
  );
}

