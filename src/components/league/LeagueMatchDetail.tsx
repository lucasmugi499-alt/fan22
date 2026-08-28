'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, teamsInLeague } from '@/lib/league/leagueContext';
import { matchOperationalRow } from '@/lib/league/operations';
import { Skeleton } from '@/components/ui/Skeleton';
import { NoAssignment } from '@/components/ui/NoAssignment';
import { StateChip } from '@/components/league/LeagueCommandCentre';
import { AssignFieldManagerSheet } from '@/components/league/AssignFieldManagerSheet';
import { RescheduleSheet } from '@/components/league/RescheduleSheet';
import { EmergencyTakeoverSheet } from '@/components/league/EmergencyTakeoverSheet';
import { PostMatchEntrySheet } from '@/components/league/PostMatchEntrySheet';
import { effectiveCapturePolicy } from '@/lib/capturePolicy';
import { cn } from '@/lib/utils';

/**
 * One fixture, and everything a League Admin can do about it right now.
 *
 * Actions are contextual by state rather than a fixed row of buttons. Before kickoff the
 * question is who is recording it; while it is live the question is whether they still are;
 * afterwards the question is whether the result stands. Showing all three at once is how an
 * admin ends up clicking the wrong one on a touchline.
 */
export function LeagueMatchDetail({ matchId }: { matchId: string }) {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const catalog = useGoalPlaceData({ collections: ['leagues'] });
  const league = useMemo(
    () => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext),
    [userProfile, catalog.leagues, isDemoMode, accessContext],
  );
  const detail = useGoalPlaceData({
    collections: ['teams', 'matches'],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  const [assigning, setAssigning] = useState(false);
  /**
   * Assignment state, loaded from the server.
   *
   * The row was previously built from the match alone, so a fixture somebody had just been
   * assigned to still read "Nobody is assigned". Assignments are not client-readable, so this
   * has to come from the league-scoped endpoint.
   */
  const [assignment, setAssignment] = useState<{
    displayName: string | null;
    lastSyncAt: string | null;
    status: string;
  } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [enteringResult, setEnteringResult] = useState(false);

  const { currentUser } = useAuth();
  useEffect(() => {
    if (isDemoMode || !currentUser) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/history`, {
          headers: { authorization: `Bearer ${token}` }, cache: 'no-store',
        });
        if (!response.ok) return;
        const body = await response.json().catch(() => ({}));
        if (!cancelled) setAssignment(body.assignment ?? null);
      } catch {
        // Operational context, not the record. A failure must not take the page down.
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser, isDemoMode, matchId]);

  const match = detail.matches.find((entry) => entry.id === matchId);
  const row = useMemo(() => {
    if (!match || !league) return null;
    return matchOperationalRow({
      match,
      teams: teamsInLeague(league.id, detail.teams),
      assignment,
      now: new Date().toISOString(),
    });
  }, [assignment, detail.teams, league, match]);

  if (catalog.loading || detail.loading) return <DetailSkeleton />;
  if (!league) return <NoAssignment kind="league" />;
  if (!match || !row) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center">
          <p className="text-base font-semibold text-text-strong">This fixture is not in your league.</p>
          <p className="mt-1 text-sm text-muted">It may have been removed, or it belongs to another competition.</p>
        </div>
      </div>
    );
  }

  const kickoff = new Intl.DateTimeFormat('en-UG', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala',
  }).format(new Date(row.scheduledAt));

  return (
    <div className="space-y-5">
      <BackLink />

      <header className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-text-strong sm:text-2xl">
              {row.homeTeamName}
              <span className="mx-2 text-subtle">v</span>
              {row.awayTeamName}
            </h1>
            <p className="mt-1 text-sm text-muted">{kickoff}</p>
            {row.venue ? <p className="text-sm text-muted">{row.venue}</p> : null}
          </div>
          <div className="shrink-0 text-right">
            {row.score ? (
              <p data-numeric className="text-3xl font-bold tabular-nums text-text-strong">
                {row.score.home}–{row.score.away}
              </p>
            ) : null}
            <StateChip state={row.state} />
          </div>
        </div>
      </header>

      <section aria-label="Field operations" className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Field operations</p>
        <p className="mt-1.5 text-sm text-text">
          {row.fieldManager?.displayName
            ? <>Recorded by <span className="font-semibold text-text-strong">{row.fieldManager.displayName}</span>.</>
            : 'Nobody is assigned to record this match.'}
        </p>
        {/*
          The line above already says nobody is assigned, so the attention string repeats it
          verbatim. Same suppression the match row makes, for the same reason.
        */}
        {row.attention && row.attention !== 'No Field Manager assigned.' ? (
          <p className="mt-1.5 text-sm leading-6 text-[var(--state-pending)]">{row.attention}</p>
        ) : null}
      </section>

      {/* Contextual: only what this state permits. */}
      <section aria-label="Actions" className="space-y-2">
        {(row.state === 'unassigned' || row.state === 'ready') ? (
          <>
            <ActionButton primary onClick={() => setAssigning(true)}>
              {row.fieldManager ? 'Replace Field Manager' : 'Assign Field Manager'}
            </ActionButton>
            <ActionButton onClick={() => setRescheduling(true)}>Reschedule match</ActionButton>
          </>
        ) : null}
        {row.state === 'live' ? (
          <>
            <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm leading-6 text-muted">
              This match is being recorded now. Events are captured by the Field Manager; the
              league does not edit a live event or clock.
            </p>
            {/*
              Offered last and styled as the exception it is. A takeover displaces the only
              person watching, so it must never sit among ordinary controls.
            */}
            <button
              type="button"
              onClick={() => setTakingOver(true)}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--state-error)] px-4 text-sm font-semibold text-[var(--state-error)] transition hover:bg-[color-mix(in_srgb,var(--state-error),transparent_92%)]"
            >
              Emergency takeover
            </button>
          </>
        ) : null}
        {row.state === 'needs_review' ? (
          <Link
            href="/league-admin/matches?filter=review"
            className="flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--state-error)] px-4 text-sm font-semibold text-[var(--state-error)]"
          >
            Review exception
          </Link>
        ) : null}
        {row.state === 'awaiting_result' ? (
          <>
            <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm leading-6 text-muted">
              This match has been played and no official result has arrived. A captured report
              becomes official on its own; enter a result by hand only if none is coming.
            </p>
            <button
              type="button"
              onClick={() => setEnteringResult(true)}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-border px-4 text-sm font-semibold text-text-strong hover:border-border-strong"
            >
              Enter post-match result
            </button>
          </>
        ) : null}
        {row.state === 'official' ? (
          <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm leading-6 text-muted">
            This result is official. Standings are derived from it; a change requires a
            governed correction version rather than an edit.
          </p>
        ) : null}
      </section>

      <MatchHistory matchId={row.matchId} />

      <PostMatchEntrySheet
        open={enteringResult}
        matchId={row.matchId}
        matchLabel={`${row.homeTeamName} v ${row.awayTeamName}`}
        homeTeamName={row.homeTeamName}
        awayTeamName={row.awayTeamName}
        capturePolicy={effectiveCapturePolicy(
          (match as { effectiveCapturePolicy?: unknown }).effectiveCapturePolicy,
          undefined,
        )}
        onClose={() => setEnteringResult(false)}
        onEntered={() => window.location.reload()}
      />

      <EmergencyTakeoverSheet
        open={takingOver}
        matchId={row.matchId}
        matchLabel={`${row.homeTeamName} v ${row.awayTeamName}`}
        fieldManagerName={row.fieldManager?.displayName}
        onClose={() => setTakingOver(false)}
        onTakenOver={() => window.location.reload()}
      />

      <RescheduleSheet
        open={rescheduling}
        matchId={row.matchId}
        matchLabel={`${row.homeTeamName} v ${row.awayTeamName}`}
        currentScheduledAt={row.scheduledAt}
        currentVenue={row.venue}
        onClose={() => setRescheduling(false)}
        onRescheduled={() => window.location.reload()}
      />

      <AssignFieldManagerSheet
        open={assigning}
        matchId={row.matchId}
        matchLabel={`${row.homeTeamName} v ${row.awayTeamName}`}
        clubs={league ? teamsInLeague(league.id, detail.teams).map((team) => ({ id: team.id, name: team.name })) : []}
        kickoffLabel={kickoff}
        onClose={() => {
          setAssigning(false);
          // Refreshed on close, not on success: the link and PIN are shown once and are not
          // retrievable, so reloading the moment the write landed destroyed them before the
          // operator could copy either one.
          window.location.reload();
        }}
      />
    </div>
  );
}

function ActionButton({
  children,
  primary,
  onClick,
}: {
  children: React.ReactNode;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-11 w-full rounded-[var(--radius-md)] px-4 text-sm font-semibold transition',
        primary
          ? 'bg-brand text-[var(--on-brand)] hover:bg-brand-hover'
          : 'border border-border text-text-strong hover:border-border-strong',
      )}
    >
      {children}
    </button>
  );
}

function BackLink() {
  return (
    <Link
      href="/league-admin/matches"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-text-strong"
    >
      <ArrowLeft className="h-4 w-4" /> Matches
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-32 w-full rounded-[var(--radius-lg)]" />
      <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
    </div>
  );
}

/**
 * What has happened to this fixture, in the league's own words.
 *
 * Reads the schedule-change history rather than the raw audit trail: a League Admin asking
 * "why is this on a Sunday" wants one sentence, not a forensic record. The audit entries still
 * exist for anyone who needs them.
 */
function MatchHistory({ matchId }: { matchId: string }) {
  const { currentUser, isDemoMode } = useAuth();
  const [changes, setChanges] = useState<Array<{
    id: string;
    fromScheduledAt: string;
    toScheduledAt: string;
    reason: string;
    createdAt: string;
  }>>([]);

  useEffect(() => {
    if (isDemoMode || !currentUser) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(
          `/api/matches/${encodeURIComponent(matchId)}/history`,
          { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' },
        );
        if (!response.ok) return;
        const body = await response.json().catch(() => ({}));
        if (!cancelled) setChanges(body.changes ?? []);
      } catch {
        // History is context, not the record. A failure here must not take the page down.
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser, isDemoMode, matchId]);

  if (!changes.length) return null;

  const format = (value: string) => new Intl.DateTimeFormat('en-UG', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala',
  }).format(new Date(value));

  return (
    <section aria-label="History" className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">History</p>
      <ol className="mt-2 space-y-3">
        {changes.map((change) => (
          <li key={change.id} className="text-sm leading-6">
            <p className="text-xs text-subtle">{format(change.createdAt)}</p>
            <p className="text-text-strong">Fixture rescheduled</p>
            <p className="text-muted">
              From {format(change.fromScheduledAt)} to {format(change.toScheduledAt)}
            </p>
            <p className="text-muted">Reason: {change.reason}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
