'use client';

import { useMemo, useState } from 'react';
import { athleteLegalName } from '@/lib/athleteIdentity';
import { TruncatedListNotice } from '@/components/platform/TruncatedListNotice';
import Link from 'next/link';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
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
import type { Athlete } from '@/types';

/**
 * Athletes as managed records.
 *
 * This page exists because athletes stopped being account holders. Their name, position,
 * bio and roster status are written by the club that knows them or by Platform, so the
 * console needs a front door to those records exactly as it has one for the leagues and
 * teams that hold them.
 *
 * What is deliberately absent is any control over where an athlete's money goes. That is not
 * an oversight to be filled in later — it is the point of the split. A Team Admin who could
 * both invent an athlete and name the account their supporters pay into is a fraud path, so
 * payout identity is submitted by the athlete or their guardian and verified by someone else
 * again. The note at the bottom of this page says so, because an operator who cannot find
 * the field should learn why rather than assume the console is unfinished.
 */

type AthleteRow = {
  athlete: Athlete;
  teamName: string;
  leagueName: string;
  lifecycle: string;
};

type PendingCommand =
  | { kind: 'create' }
  | { kind: 'edit'; athlete: Athlete };

const AGE_GROUPS = [
  { value: 'U18', label: 'U18' },
  { value: 'U21', label: 'U21' },
  { value: 'Senior', label: 'Senior' },
];

function lifecycleOf(athlete: Athlete & { lifecycleStatus?: string }) {
  return athlete.lifecycleStatus ?? 'active';
}

function lifecycleTone(state: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (state === 'active') return 'good';
  if (state === 'draft') return 'neutral';
  if (state === 'suspended') return 'warn';
  return 'bad';
}

export function AthleteManagement() {
  const data = useGoalPlaceData({ collections: ['athletes', 'teams', 'leagues'], recordLimit: 500 });
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleTarget | null>(null);
  const command = usePlatformCommand('/api/platform/network');

  const rows = useMemo<AthleteRow[]>(() => {
    const teamName = new Map(data.teams.map((team) => [team.id, team.name]));
    const leagueName = new Map(data.leagues.map((league) => [league.id, league.name]));
    const needle = query.trim().toLowerCase();
    return data.athletes
      .map((athlete) => ({
        athlete,
        teamName: teamName.get(athlete.teamId) ?? athlete.teamId,
        leagueName: leagueName.get(athlete.leagueId) ?? athlete.leagueId,
        lifecycle: lifecycleOf(athlete),
      }))
      .filter((row) => !needle
        || `${row.athlete.legalName} ${row.teamName} ${row.leagueName} ${row.athlete.registeredPosition}`.toLowerCase().includes(needle))
      .sort((a, b) => athleteLegalName(a.athlete).localeCompare(athleteLegalName(b.athlete)));
  }, [data.athletes, data.teams, data.leagues, query]);

  const teamOptions = useMemo(
    () => data.teams.map((team) => ({ value: team.id, label: team.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [data.teams],
  );

  if (data.loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  const drafts = rows.filter((row) => row.lifecycle === 'draft').length;
  const archived = rows.filter((row) => row.lifecycle === 'archived').length;
  const unverified = rows.filter((row) => !row.athlete.verified).length;

  const columns: PlatformColumn<AthleteRow>[] = [
    {
      header: 'Athlete',
      primary: true,
      cell: (row) => (
        <Link href={`/admin/network/athletes/${row.athlete.id}`} className="font-semibold text-text-strong hover:text-brand">
          {row.athlete.legalName}
        </Link>
      ),
    },
    { header: 'Position', cell: (row) => <span className="text-muted">{row.athlete.registeredPosition || '·'}</span> },
    { header: 'Team', cell: (row) => <span className="text-muted">{row.teamName}</span> },
    { header: 'League', cell: (row) => <span className="text-muted">{row.leagueName}</span> },
    {
      header: 'State',
      primary: true,
      cell: (row) => <StatusChip label={row.lifecycle} tone={lifecycleTone(row.lifecycle)} />,
    },
    {
      header: 'Actions',
      align: 'end',
      primary: true,
      cell: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <CommandButton label="Edit" onClick={() => setPending({ kind: 'edit', athlete: row.athlete })} />
          {row.lifecycle === 'archived' ? (
            <CommandButton label="Restore" onClick={() => setLifecycle({ kind: 'athlete', id: row.athlete.id, name: row.athlete.legalName, action: 'restore' })} />
          ) : (
            <>
              {row.lifecycle !== 'active' ? (
                <CommandButton label="Activate" tone="primary" onClick={() => setLifecycle({ kind: 'athlete', id: row.athlete.id, name: row.athlete.legalName, action: 'activate' })} />
              ) : (
                <CommandButton label="Suspend" onClick={() => setLifecycle({ kind: 'athlete', id: row.athlete.id, name: row.athlete.legalName, action: 'suspend' })} />
              )}
              <CommandButton label="Archive" tone="destructive" onClick={() => setLifecycle({ kind: 'athlete', id: row.athlete.id, name: row.athlete.legalName, action: 'archive' })} />
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
        title="Athlete management"
        description="Athletes are managed profiles. Their club or Platform writes the sporting record; an athlete does not need an account to exist in it."
        action={<CommandButton label="Create athlete" tone="primary" onClick={() => setPending({ kind: 'create' })} />}
      />
      <TruncatedListNotice truncated={data.truncated} label="athletes" />

      <PlatformStatGrid items={[
        { label: 'Athletes', value: rows.length },
        { label: 'Drafts', value: drafts, tone: drafts ? 'warn' : 'good' },
        { label: 'Archived', value: archived },
        { label: 'Unverified', value: unverified, tone: unverified ? 'warn' : 'good' },
      ]} />

      <PlatformSearch value={query} onChange={setQuery} placeholder="Search athletes by name, position, team or league" />

      {command.success ? <Card className="p-3"><p className="text-sm text-brand">{command.success}</p></Card> : null}
      {command.error && !pending ? (
        <Card className="p-3"><p className="text-sm text-[var(--state-disputed)]">{command.error}</p></Card>
      ) : null}

      <PlatformTable
        columns={columns}
        rows={rows}
        getKey={(row) => row.athlete.id}
        empty={<EmptyState title="No athletes match">Adjust the search, or create an athlete profile.</EmptyState>}
      />

      <Card className="p-4">
        <h2 className="mb-2 text-[15px] font-semibold text-text-strong">Where money is not managed</h2>
        <p className="text-sm text-muted">
          There is no payout field on this page and there will not be one. An athlete&rsquo;s payout
          identity is submitted by the athlete or their guardian through their own portal and
          verified by a second person, never by whoever created the profile. A club official
          who could both invent an athlete and name the account their supporters pay into is a
          fraud path, not a workflow.
        </p>
        <p className="mt-2 text-sm text-muted">
          Payout state is reported as &ldquo;can be paid&rdquo; or not, and never as an account number, in{' '}
          <Link href="/admin/money?tab=payees" className="text-brand hover:underline">Money operations</Link>.
        </p>
      </Card>

      <CommandDialog
        open={pending?.kind === 'create'}
        title="Create athlete profile"
        description="Created as a draft and not shown publicly until activated. Draft is also the only state a mistake can still be deleted from outright."
        submitLabel="Create athlete"
        running={command.running}
        error={command.error}
        fields={[
          { name: 'name', label: 'Full name', kind: 'text', required: true, maxLength: 120 },
          { name: 'teamId', label: 'Team', kind: 'select', required: true, options: teamOptions },
          { name: 'position', label: 'Position', kind: 'text', required: true, maxLength: 60 },
          { name: 'ageGroup', label: 'Age group', kind: 'select', required: true, options: AGE_GROUPS, defaultValue: 'Senior' },
          { name: 'bio', label: 'Bio', kind: 'textarea', maxLength: 1500 },
        ] satisfies CommandField[]}
        onClose={() => { setPending(null); command.reset(); }}
        onSubmit={async (values, reason) => {
          const ok = await command.run({
            command: 'createAthlete',
            reason,
            name: values.name,
            teamId: values.teamId,
            position: values.position,
            ageGroup: values.ageGroup,
            bio: values.bio ?? '',
          }, `${values.name} created as a draft profile.`);
          if (ok) { setPending(null); data.retry(); }
        }}
      />

      <CommandDialog
        open={pending?.kind === 'edit'}
        title={`Edit ${pending?.kind === 'edit' ? pending.athlete.legalName : 'athlete'}`}
        description="Only the fields you change are written, and only those appear in the audit trail."
        submitLabel="Save changes"
        running={command.running}
        error={command.error}
        fields={pending?.kind === 'edit' ? ([
          { name: 'name', label: 'Full name', kind: 'text', required: true, maxLength: 120, defaultValue: pending.athlete.legalName },
          { name: 'position', label: 'Position', kind: 'text', required: true, maxLength: 60, defaultValue: pending.athlete.registeredPosition },
          { name: 'ageGroup', label: 'Age group', kind: 'select', required: true, options: AGE_GROUPS, defaultValue: pending.athlete.ageGroup },
          { name: 'bio', label: 'Bio', kind: 'textarea', maxLength: 1500, defaultValue: pending.athlete.bio },
        ] satisfies CommandField[]) : []}
        onClose={() => { setPending(null); command.reset(); }}
        onSubmit={async (values, reason) => {
          if (pending?.kind !== 'edit') return;
          const ok = await command.run({
            command: 'updateAthlete',
            reason,
            athleteId: pending.athlete.id,
            patch: {
              name: values.name,
              position: values.position,
              ageGroup: values.ageGroup,
              bio: values.bio ?? '',
            },
          }, `${values.name} updated.`);
          if (ok) { setPending(null); data.retry(); }
        }}
      />

      <LifecycleCommandDialog
        target={lifecycle}
        onClose={() => setLifecycle(null)}
        onDone={data.retry}
      />
    </section>
  );
}
