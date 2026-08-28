'use client';

import { useMemo, useState } from 'react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import Link from 'next/link';
import {
  CommandButton,
  EmptyState,
  PlatformAdminHeader,
  PlatformSearch,
  PlatformStatGrid,
  PlatformTable,
  StatusChip,
  type PlatformColumn,
} from '@/components/platform/PlatformAdminPrimitives';
import { CommandDialog, type CommandField } from '@/components/platform/commands/CommandDialog';
import { usePlatformCommand } from '@/components/platform/commands/usePlatformCommand';
import { LifecycleCommandDialog, type LifecycleTarget } from '@/components/platform/network/LifecycleCommandDialog';
import type { Team } from '@/types';

/**
 * Team Management as a first-class surface.
 *
 * Points and records come from the official standings projection, never from
 * `team.leaguePoints`. Those stored aggregates were seeded independently of any match and
 * are now repaired and deprecated; reading them here would reintroduce the second source of
 * sporting truth this platform spent a migration removing.
 *
 * Row commands write through the audited platform route rather than from the client. A club
 * that has played an official fixture cannot be deleted, only archived — its results are
 * part of an opponent's record too, and removing the row would change a table nobody
 * intended to touch.
 */
export function TeamManagement() {
  const data = useGoalPlaceData({
    collections: ['teams', 'leagues', 'matches'],
    recordLimit: 500,
  });
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleTarget | null>(null);
  const command = usePlatformCommand('/api/platform/network');

  const rows = useMemo(() => {
    // One standings pass per league, then look each club up in its own table.
    const standingByTeam = new Map<string, { points: number; wins: number; draws: number; losses: number }>();
    for (const league of data.leagues) {
      const leagueTeams = data.teams.filter((team) => team.leagueId === league.id);
      if (!leagueTeams.length) continue;
      const leagueMatches = data.matches.filter((match) => match.leagueId === league.id);
      for (const standing of buildLeagueStandings(leagueTeams, leagueMatches)) {
        standingByTeam.set(standing.teamId, standing);
      }
    }
    const leagueName = new Map(data.leagues.map((league) => [league.id, league.name]));
    return data.teams
      .map((team) => ({
        team,
        lifecycle: (team as Team & { lifecycleStatus?: string }).lifecycleStatus ?? 'active',
        leagueName: leagueName.get(team.leagueId) ?? 'Unassigned',
        standing: standingByTeam.get(team.id),
        orphaned: !leagueName.has(team.leagueId),
      }))
      .filter(({ team, leagueName: name }) =>
        !query.trim()
        || `${team.name} ${team.city} ${name}`.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => a.team.name.localeCompare(b.team.name));
  }, [data.teams, data.leagues, data.matches, query]);

  if (data.loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  const orphaned = rows.filter((row) => row.orphaned).length;
  const unverified = rows.filter((row) => !row.team.verified).length;
  const drafts = rows.filter((row) => row.lifecycle === 'draft').length;

  const leagueOptions = data.leagues
    .map((league) => ({ value: league.id, label: league.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const columns: PlatformColumn<(typeof rows)[number]>[] = [
    {
      header: 'Club',
      primary: true,
      cell: (row) => (
        <Link href={`/admin/network/teams/${row.team.id}`} className="font-semibold text-text-strong hover:text-brand">
          {row.team.name}
        </Link>
      ),
    },
    {
      header: 'League',
      cell: (row) => (
        <span className={row.orphaned ? 'text-[var(--state-disputed)]' : 'text-muted'}>{row.leagueName}</span>
      ),
    },
    { header: 'City', cell: (row) => <span className="text-muted">{row.team.city}</span> },
    {
      header: 'Record',
      align: 'end',
      cell: (row) => (
        <span className="tabular-nums text-muted">
          {row.standing
            ? `${row.standing.wins}-${row.standing.draws}-${row.standing.losses} · ${row.standing.points} pts`
            : 'no official results'}
        </span>
      ),
    },
    {
      header: 'State',
      primary: true,
      cell: (row) => (
        <StatusChip
          label={row.lifecycle}
          tone={row.lifecycle === 'active' ? 'good' : row.lifecycle === 'draft' ? 'neutral' : row.lifecycle === 'suspended' ? 'warn' : 'bad'}
        />
      ),
    },
    {
      header: 'Actions',
      align: 'end',
      primary: true,
      cell: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <CommandButton label="Edit" onClick={() => setEditing(row.team)} />
          {row.lifecycle === 'archived' ? (
            <CommandButton label="Restore" onClick={() => setLifecycle({ kind: 'team', id: row.team.id, name: row.team.name, action: 'restore' })} />
          ) : (
            <>
              {row.lifecycle !== 'active' ? (
                <CommandButton label="Activate" tone="primary" onClick={() => setLifecycle({ kind: 'team', id: row.team.id, name: row.team.name, action: 'activate' })} />
              ) : (
                <CommandButton label="Suspend" onClick={() => setLifecycle({ kind: 'team', id: row.team.id, name: row.team.name, action: 'suspend' })} />
              )}
              <CommandButton label="Archive" tone="destructive" onClick={() => setLifecycle({ kind: 'team', id: row.team.id, name: row.team.name, action: 'archive' })} />
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Network"
        title="Team management"
        description="Every club on the platform. Records come from the official standings projection, not stored counters."
        action={<CommandButton label="Create team" tone="primary" onClick={() => setCreating(true)} />}
      />
      <PlatformStatGrid items={[
        { label: 'Clubs', value: rows.length },
        { label: 'Drafts', value: drafts, tone: drafts ? 'warn' : 'good' },
        { label: 'Unverified', value: unverified, tone: unverified ? 'warn' : 'good' },
        { label: 'Without a league', value: orphaned, tone: orphaned ? 'bad' : 'good' },
      ]} />
      <PlatformSearch value={query} onChange={setQuery} placeholder="Search clubs by name, city or league" />

      {command.success ? <Card className="p-3"><p className="text-sm text-brand">{command.success}</p></Card> : null}
      {command.error && !creating && !editing ? (
        <Card className="p-3"><p className="text-sm text-[var(--state-disputed)]">{command.error}</p></Card>
      ) : null}

      <PlatformTable
        columns={columns}
        rows={rows.slice(0, 200)}
        getKey={(row) => row.team.id}
        empty={<EmptyState title="No clubs match">Adjust the search, or create a club.</EmptyState>}
      />

      {rows.length > 200 ? (
        <p className="text-xs text-subtle">Showing the first 200 of {rows.length}. Narrow the search to see the rest.</p>
      ) : null}

      <CommandDialog
        open={creating}
        title="Create club"
        description="Created as a draft and not publicly visible until activated. The sport is inherited from the league, because a club playing a different sport from its competition is a data error nobody enters deliberately."
        submitLabel="Create club"
        running={command.running}
        error={command.error}
        fields={[
          { name: 'name', label: 'Club name', kind: 'text', required: true, maxLength: 120 },
          { name: 'leagueId', label: 'League', kind: 'select', required: true, options: leagueOptions },
          { name: 'city', label: 'City', kind: 'text', required: true, maxLength: 120 },
          { name: 'description', label: 'Description', kind: 'textarea', maxLength: 1500 },
        ] satisfies CommandField[]}
        onClose={() => { setCreating(false); command.reset(); }}
        onSubmit={async (values, reason) => {
          const ok = await command.run({
            command: 'createTeam',
            reason,
            name: values.name,
            leagueId: values.leagueId,
            city: values.city,
            description: values.description ?? '',
          }, `${values.name} created as a draft club.`);
          if (ok) { setCreating(false); data.retry(); }
        }}
      />

      <CommandDialog
        open={Boolean(editing)}
        title={editing ? `Edit ${editing.name}` : ''}
        description="Only the fields you change are written, and only those appear in the audit trail."
        submitLabel="Save changes"
        running={command.running}
        error={command.error}
        fields={editing ? ([
          { name: 'name', label: 'Club name', kind: 'text', required: true, maxLength: 120, defaultValue: editing.name },
          { name: 'leagueId', label: 'League', kind: 'select', required: true, options: leagueOptions, defaultValue: editing.leagueId },
          { name: 'city', label: 'City', kind: 'text', required: true, maxLength: 120, defaultValue: editing.city },
          { name: 'description', label: 'Description', kind: 'textarea', maxLength: 1500, defaultValue: editing.description },
        ] satisfies CommandField[]) : []}
        onClose={() => { setEditing(null); command.reset(); }}
        onSubmit={async (values, reason) => {
          if (!editing) return;
          const ok = await command.run({
            command: 'updateTeam',
            reason,
            teamId: editing.id,
            patch: {
              name: values.name,
              leagueId: values.leagueId,
              city: values.city,
              description: values.description ?? '',
            },
          }, `${values.name} updated.`);
          if (ok) { setEditing(null); data.retry(); }
        }}
      />

      <LifecycleCommandDialog target={lifecycle} onClose={() => setLifecycle(null)} onDone={data.retry} />
    </section>
  );
}
