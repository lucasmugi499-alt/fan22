'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { isOfficialMatch } from '@/lib/status';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
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
import type { League } from '@/types';

/**
 * League Management as a first-class surface.
 *
 * Counts are read-through: derived from team and match documents, with the official-result
 * count using `isOfficialMatch` rather than a stored aggregate.
 *
 * The commands on each row write through the audited platform route, never from the client.
 * That is the whole architecture in one sentence — this table is a keyboard, and the server
 * decides. Archive is offered where a delete button would normally sit, because a league
 * that ever carried an official result is part of the sporting record and removing the row
 * would silently rewrite standings people have already seen.
 */
export function LeagueManagement() {
  const data = useGoalPlaceData({
    collections: ['leagues', 'teams', 'matches', 'seasons'],
    recordLimit: 500,
  });
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<League | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleTarget | null>(null);
  const command = usePlatformCommand('/api/platform/network');

  const rows = useMemo(() => {
    const teamsByLeague = new Map<string, number>();
    for (const team of data.teams) {
      teamsByLeague.set(team.leagueId, (teamsByLeague.get(team.leagueId) ?? 0) + 1);
    }
    return data.leagues
      .map((league) => {
        const leagueMatches = data.matches.filter((match) => match.leagueId === league.id);
        const official = leagueMatches.filter(isOfficialMatch);
        const leagueTeams = data.teams.filter((team) => team.leagueId === league.id);
        return {
          league,
          lifecycle: (league as League & { lifecycleStatus?: string }).lifecycleStatus ?? 'active',
          // Derived, not read from league.teamsCount — that is a stored aggregate.
          teams: teamsByLeague.get(league.id) ?? 0,
          matches: leagueMatches.length,
          official: official.length,
          // Standings prove the table can actually be built for this league.
          tableRows: buildLeagueStandings(leagueTeams, leagueMatches).length,
          pendingResults: leagueMatches.filter(
            (match) => match.status === 'completed' && match.verificationStatus === 'pending',
          ).length,
        };
      })
      .filter(({ league }) =>
        !query.trim()
        || `${league.name} ${league.city} ${league.sport}`.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => a.league.name.localeCompare(b.league.name));
  }, [data.leagues, data.teams, data.matches, query]);

  if (data.loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  const totalPending = rows.reduce((sum, row) => sum + row.pendingResults, 0);
  const emptyLeagues = rows.filter((row) => row.teams === 0).length;
  const drafts = rows.filter((row) => row.lifecycle === 'draft').length;

  const columns: PlatformColumn<(typeof rows)[number]>[] = [
    {
      header: 'League',
      primary: true,
      cell: (row) => (
        <Link href={`/admin/network/leagues/${row.league.id}`} className="font-semibold text-text-strong hover:text-brand">
          {row.league.name}
        </Link>
      ),
    },
    { header: 'Sport', cell: (row) => <span className="text-muted">{String(row.league.sport)}</span> },
    { header: 'City', cell: (row) => <span className="text-muted">{row.league.city}</span> },
    { header: 'Clubs', align: 'end', cell: (row) => <span className="tabular-nums text-muted">{row.teams}</span> },
    {
      header: 'Official',
      align: 'end',
      cell: (row) => <span className="tabular-nums text-muted">{row.official}/{row.matches}</span>,
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
          <CommandButton label="Edit" onClick={() => setEditing(row.league)} />
          {row.lifecycle === 'archived' ? (
            <CommandButton label="Restore" onClick={() => setLifecycle({ kind: 'league', id: row.league.id, name: row.league.name, action: 'restore' })} />
          ) : (
            <>
              {row.lifecycle !== 'active' ? (
                <CommandButton label="Activate" tone="primary" onClick={() => setLifecycle({ kind: 'league', id: row.league.id, name: row.league.name, action: 'activate' })} />
              ) : (
                <CommandButton label="Suspend" onClick={() => setLifecycle({ kind: 'league', id: row.league.id, name: row.league.name, action: 'suspend' })} />
              )}
              <CommandButton label="Archive" tone="destructive" onClick={() => setLifecycle({ kind: 'league', id: row.league.id, name: row.league.name, action: 'archive' })} />
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
        title="League management"
        description="Every competition on the platform, with the numbers derived from official results rather than stored counters."
        action={<CommandButton label="Create league" tone="primary" onClick={() => setCreating(true)} />}
      />
      <PlatformStatGrid items={[
        { label: 'Leagues', value: rows.length },
        { label: 'Drafts', value: drafts, tone: drafts ? 'warn' : 'good' },
        { label: 'Awaiting verification', value: totalPending, tone: totalPending ? 'warn' : 'good' },
        { label: 'Leagues with no clubs', value: emptyLeagues, tone: emptyLeagues ? 'warn' : 'good' },
      ]} />
      <PlatformSearch value={query} onChange={setQuery} placeholder="Search leagues by name, city or sport" />

      {command.success ? <Card className="p-3"><p className="text-sm text-brand">{command.success}</p></Card> : null}
      {command.error && !creating && !editing ? (
        <Card className="p-3"><p className="text-sm text-[var(--state-disputed)]">{command.error}</p></Card>
      ) : null}

      <PlatformTable
        columns={columns}
        rows={rows}
        getKey={(row) => row.league.id}
        empty={<EmptyState title="No leagues match">Adjust the search, or create a league.</EmptyState>}
      />

      <p className="text-xs text-subtle">
        Counts are derived from team and match documents. A league advertising more clubs
        than it holds is a data problem, not a display one.{' '}
        <Link href="/admin/integrity?tab=quality" className="text-brand hover:underline">Competition integrity</Link>{' '}
        shows results that could not be published.
      </p>

      <CommandDialog
        open={creating}
        title="Create league"
        description="Created as a draft and not publicly visible until activated. Draft is also the only state a mistake can still be deleted from outright."
        submitLabel="Create league"
        running={command.running}
        error={command.error}
        fields={[
          { name: 'name', label: 'League name', kind: 'text', required: true, maxLength: 120 },
          { name: 'sport', label: 'Sport', kind: 'select', required: true, options: [
            { value: 'football', label: 'Football' },
            { value: 'basketball', label: 'Basketball' },
            { value: 'rugby', label: 'Rugby' },
          ] },
          { name: 'city', label: 'City', kind: 'text', required: true, maxLength: 120 },
          { name: 'description', label: 'Description', kind: 'textarea', maxLength: 1500 },
        ] satisfies CommandField[]}
        onClose={() => { setCreating(false); command.reset(); }}
        onSubmit={async (values, reason) => {
          const ok = await command.run({
            command: 'createLeague',
            reason,
            name: values.name,
            sport: values.sport,
            city: values.city,
            description: values.description ?? '',
          }, `${values.name} created as a draft league.`);
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
          { name: 'name', label: 'League name', kind: 'text', required: true, maxLength: 120, defaultValue: editing.name },
          { name: 'city', label: 'City', kind: 'text', required: true, maxLength: 120, defaultValue: editing.city },
          { name: 'description', label: 'Description', kind: 'textarea', maxLength: 1500, defaultValue: editing.description },
        ] satisfies CommandField[]) : []}
        onClose={() => { setEditing(null); command.reset(); }}
        onSubmit={async (values, reason) => {
          if (!editing) return;
          const ok = await command.run({
            command: 'updateLeague',
            reason,
            leagueId: editing.id,
            patch: { name: values.name, city: values.city, description: values.description ?? '' },
          }, `${values.name} updated.`);
          if (ok) { setEditing(null); data.retry(); }
        }}
      />

      <LifecycleCommandDialog target={lifecycle} onClose={() => setLifecycle(null)} onDone={data.retry} />
    </section>
  );
}
