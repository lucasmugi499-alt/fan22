'use client';

import { useState } from 'react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { useReconciliationExceptions } from '@/lib/resultSubmissionQueues';
import { useAuth } from '@/context/AuthProvider';
import type { ReconciliationException } from '@/types';
import { isOfficialMatch } from '@/lib/status';
import { disputedMatches } from '@/lib/platform/platformContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { DirectoryRow, EmptyState, PlatformAdminHeader, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';

export function CompetitionIntegrity() {
  const data = useGoalPlaceData({
    collections: ['matches', 'finalizations', 'leagues', 'teams'],
    recordLimit: 500,
  });
  // The canonical blocked-finalization cases, platform-wide. These come first because they
  // are the only item here where official data was deliberately NOT written and someone has
  // to decide what happens next.
  const { items: blocked, refresh: refreshBlocked } = useReconciliationExceptions(undefined, { platformWide: true });
  const teamName = (id: string) => data.teams.find((team) => team.id === id)?.name ?? id;
  const leagueName = (id: string) => data.leagues.find((league) => league.id === id)?.name ?? id;
  /**
   * A reconciliation exception carries a match, not two teams. Resolving through the match
   * is what turns the row heading into the fixture an operator recognises; feeding the match
   * id to the team lookup produced a confident-looking label for the wrong thing.
   */
  const matchLabel = (matchId: string) => {
    const match = data.matches.find((item) => item.id === matchId);
    return match ? `${teamName(match.homeTeamId)} vs ${teamName(match.awayTeamId)}` : matchId;
  };
  const disputes = disputedMatches(data.matches);
  const failedFinalizations = data.finalizations.filter((item) => item.status === 'failed');
  const overdue = data.matches.filter((item) => item.verificationStatus === 'pending' && item.status === 'completed');
  const official = data.matches.filter(isOfficialMatch);

  if (data.loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Integrity"
        title="Competition integrity"
        description="Supervise disputes, failed finalizations, corrections and projection readiness without manually rewriting official statistics."
      />
      <PlatformStatGrid items={[
        { label: 'Reconciliation exceptions', value: blocked.length, tone: blocked.length ? 'bad' : 'good' },
        { label: 'Result disputes', value: disputes.length, tone: disputes.length ? 'bad' : 'good' },
        { label: 'Failed finalizations', value: failedFinalizations.length, tone: failedFinalizations.length ? 'bad' : 'good' },
        { label: 'Pending confirmations', value: overdue.length, tone: overdue.length ? 'warn' : 'good' },
        { label: 'Verified-result rate', value: `${Math.round((official.length / Math.max(1, data.matches.length)) * 100)}%` },
      ]} />
      <ReconciliationQueue
        cases={blocked}
        matchLabel={matchLabel}
        leagueName={leagueName}
        onChanged={() => {
          // The case list is the thing the action changed, so it is the thing that has to
          // be re-read. The surrounding platform data is refreshed too because a closed
          // case can unblock a finalization.
          void refreshBlocked();
          data.retry();
        }}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Result exceptions</h2>
          <div className="space-y-2.5">
            {[...disputes, ...overdue].slice(0, 20).map((match) => (
              <DirectoryRow
                key={match.id}
                href={`/matches/${match.id}`}
                title={`${match.homeTeamId} vs ${match.awayTeamId}`}
                meta={`${match.venue} · ${match.date ?? match.scheduledAt}`}
                status={match.verificationStatus}
                statusTone={match.verificationStatus === 'disputed' ? 'bad' : 'warn'}
                detail={<StatusChip label="correction requires governed versioning" />}
              />
            ))}
            {!disputes.length && !overdue.length ? (
              <EmptyState title="No result exceptions">Disputed and overdue result records will appear here.</EmptyState>
            ) : null}
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Projection health</h2>
          <div className="space-y-2.5">
            {failedFinalizations.length ? failedFinalizations.map((item) => (
              <DirectoryRow
                key={item.id}
                title={`Finalization ${item.id}`}
                meta={`${item.matchId} · ${item.source} · version ${item.resultVersion}`}
                status={item.status}
                statusTone="bad"
                detail={<StatusChip label="retry must be idempotent" tone="warn" />}
              />
            )) : (
              <EmptyState title="No failed finalizations">Projection jobs are clean in the loaded data window.</EmptyState>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}

/**
 * Blocked finalizations, with the workflow actions Platform actually owns.
 *
 * There is no score field and no way to reach one. Platform can acknowledge that a case is
 * being handled, escalate it, or close it — the sporting outcome is corrected by the
 * governing League through the correction path, which re-runs the finalizer and produces a
 * new official version with its own audit trail. Two authorities able to decide the same
 * fact is the split this platform spent a migration removing.
 */
function ReconciliationQueue({
  cases,
  matchLabel,
  leagueName,
  onChanged,
}: {
  cases: ReconciliationException[];
  matchLabel: (matchId: string) => string;
  leagueName: (id: string) => string;
  onChanged: () => void;
}) {
  const { currentUser } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function transition(exceptionId: string, status: 'acknowledged' | 'escalated' | 'resolved') {
    const note = window.prompt(
      status === 'resolved'
        ? 'Why is this case being closed? The sporting result is not changed by this action.'
        : `Add a note for marking this case ${status}.`,
    );
    if (!note || note.trim().length < 4) return;
    setBusyId(exceptionId);
    setError(null);
    try {
      // The demo persona holds a stand-in user with no token method. Saying so plainly
      // beats letting a TypeError surface as the case's error text.
      if (!currentUser || typeof currentUser.getIdToken !== 'function') {
        throw new Error('Case actions need a signed-in platform operator. The demo session cannot change a case.');
      }
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/platform/competition-integrity', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ exceptionId, status, note: note.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'The case could not be updated.');
      }
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The case could not be updated.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-text-strong">Reconciliation exceptions</h2>
        <span className="text-xs text-muted">Official data was not written for these</span>
      </div>
      {error ? <p className="mb-3 text-sm text-[var(--state-disputed)]">{error}</p> : null}
      <div className="space-y-2.5">
        {cases.length ? cases.map((item) => (
          <div key={item.exceptionId} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text-strong">
                {matchLabel(item.matchId)} — {leagueName(item.leagueId)}
              </p>
              <StatusChip label={item.status} />
            </div>
            <p className="mt-1 text-sm text-muted">
              Submitted <span className="tabular-nums">{item.officialHomeScore}-{item.officialAwayScore}</span>,
              {' '}events reconstruct <span className="tabular-nums">{item.reconstructedHomeScore}-{item.reconstructedAwayScore}</span>
              {' '}({item.homeDifference ? `home +${item.homeDifference}` : ''}
              {item.homeDifference && item.awayDifference ? ', ' : ''}
              {item.awayDifference ? `away +${item.awayDifference}` : ''}).
            </p>
            <p className="mt-1 text-xs text-subtle">
              Version {item.submissionVersion} · {item.evidenceRefs?.length ? `${item.evidenceRefs.length} evidence reference(s)` : 'no evidence attached'} · opened {item.createdAt}
            </p>
            <p className="mt-1 text-xs text-subtle">
              The governing League corrects the result. Platform manages the case only.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {(['acknowledged', 'escalated', 'resolved'] as const).map((next) => (
                <button
                  key={next}
                  type="button"
                  disabled={busyId === item.exceptionId || item.status === next}
                  onClick={() => transition(item.exceptionId, next)}
                  className="rounded-[var(--radius-sm)] border border-border px-2.5 py-1 text-xs font-medium text-text-strong disabled:opacity-40"
                >
                  {next === 'acknowledged' ? 'Acknowledge' : next === 'escalated' ? 'Escalate' : 'Close case'}
                </button>
              ))}
            </div>
          </div>
        )) : (
          <EmptyState title="No blocked finalizations">
            A result whose recorded events contradict its submitted score appears here, unpublished.
          </EmptyState>
        )}
      </div>
    </Card>
  );
}
