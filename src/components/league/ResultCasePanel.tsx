'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Sheet } from '@/components/ui/Sheet';
import { useAuth } from '@/context/AuthProvider';
import type { ResultCase, ResultCaseStatus } from '@/server/results/resultCase';
import { cn } from '@/lib/utils';

/**
 * Where a league sees, opens and settles an adjudication of an official result.
 *
 * Until this existed the model was reachable only through the API. The match page said "a
 * change requires a governed correction version rather than an edit" and then offered nothing,
 * which is a sentence describing a door with no handle.
 *
 * ## What this does and does not decide
 *
 * Nothing here decides who may do what. Every action is a POST the server judges — capability,
 * conflict of interest, case status — and a refusal comes back as a message this panel shows
 * rather than a rule it re-implements. A panel that hid the Rule button from a conflicted admin
 * would be duplicating `decideCaseAction` in a second language, and the two would drift. The
 * server says "you are affiliated with a club in this fixture; propose or escalate instead",
 * and the admin reads it.
 *
 * ## Nothing here writes a score
 *
 * A corrected ruling is sent to the server, which records it and runs the finalizer. This
 * component never touches `matches`, `standings` or anything derived. It could not: those are
 * `allow write: if false`.
 */

const STATUS_LABEL: Record<ResultCaseStatus, string> = {
  open: 'Open',
  under_review: 'Under review',
  proposed: 'Resolution proposed',
  escalated: 'Escalated to platform',
  resolved_upheld: 'Upheld',
  resolved_corrected: 'Corrected',
  withdrawn: 'Withdrawn',
  superseded: 'Superseded',
};

const TERMINAL: ReadonlySet<ResultCaseStatus> = new Set([
  'resolved_upheld', 'resolved_corrected', 'withdrawn', 'superseded',
]);

export function ResultCasePanel({
  matchId,
  officialResultVersion,
  currentScore,
}: {
  matchId: string;
  officialResultVersion: number | undefined;
  currentScore: { home: number; away: number } | null;
}) {
  const { currentUser, isDemoMode } = useAuth();
  const [cases, setCases] = useState<ResultCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [ruling, setRuling] = useState<ResultCase | null>(null);
  /** Bumped to refetch after an action, so the effect below is the only place cases are loaded. */
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  /*
   * Loaded in the effect with a promise chain rather than through an async helper. Every
   * setState lands in a `.then`, after the network — a synchronous set at the top of an effect
   * schedules a render for a fact the props already said, and the React compiler rule flags
   * exactly that.
   */
  useEffect(() => {
    if (isDemoMode || !currentUser) return;
    let cancelled = false;
    void currentUser.getIdToken()
      .then((token) => fetch(`/api/matches/${encodeURIComponent(matchId)}/result-cases`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      }))
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'Cases could not be loaded.');
        return (body.cases ?? []) as ResultCase[];
      })
      .then((loaded) => {
        if (cancelled) return;
        setCases(loaded);
        setError(null);
      })
      .catch((cause: Error) => {
        if (cancelled) return;
        setError(cause.message);
        setCases([]);
      });
    return () => { cancelled = true; };
  }, [currentUser, isDemoMode, matchId, reloadToken]);

  // Derived: a session that cannot load cases has none, and `null` means only "not yet".
  const resolved = isDemoMode || !currentUser ? [] : cases;
  const active = resolved?.find((entry) => !TERMINAL.has(entry.status)) ?? null;
  const closed = resolved?.filter((entry) => TERMINAL.has(entry.status)) ?? [];

  if (isDemoMode) {
    return (
      <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm leading-6 text-muted">
        Corrections are adjudicated through result cases. A demo session cannot open one: that
        is a ruling on a real competition.
      </p>
    );
  }

  return (
    <section aria-label="Result cases" className="space-y-3">
      {resolved === null ? (
        <p className="text-sm text-muted">Loading cases…</p>
      ) : active ? (
        <CaseCard resultCase={active} onAct={() => setRuling(active)} />
      ) : (
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
          <p className="text-sm leading-6 text-muted">
            This result is official. Standings are derived from it. If it is wrong, open a case:
            the original evidence stays as it is, and a ruling supersedes it.
          </p>
          <button
            type="button"
            onClick={() => setOpening(true)}
            disabled={!officialResultVersion}
            className="mt-3 min-h-11 w-full rounded-[var(--radius-md)] border border-border px-4 text-sm font-semibold text-text-strong transition hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            Open a correction case
          </button>
        </div>
      )}

      {error ? <p className="text-xs text-[var(--state-error)]">{error}</p> : null}

      {closed.length ? (
        <details className="rounded-[var(--radius-md)] border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-text-strong">
            Previous cases ({closed.length})
          </summary>
          <ul className="divide-y divide-border">
            {closed.map((entry) => (
              <li key={entry.id} className="px-3 py-2.5">
                <p className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-text-strong">Version {entry.subjectVersion}</span>
                  <StatusPill status={entry.status} />
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted">{entry.reason}</p>
                {entry.ruling ? (
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Ruling: {entry.ruling.rationale}
                    {entry.ruling.correctedScore
                      ? ` (${entry.ruling.correctedScore.home}-${entry.ruling.correctedScore.away})`
                      : ''}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <OpenCaseSheet
        open={opening}
        matchId={matchId}
        subjectVersion={officialResultVersion ?? 0}
        onClose={() => setOpening(false)}
        onOpened={reload}
      />
      <CaseActionSheet
        resultCase={ruling}
        currentScore={currentScore}
        onClose={() => setRuling(null)}
        onChanged={reload}
      />
    </section>
  );
}

function CaseCard({ resultCase, onAct }: { resultCase: ResultCase; onAct: () => void }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--state-pending)] bg-surface-1 p-3">
      <p className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text-strong">
          Case on version {resultCase.subjectVersion}
        </span>
        <StatusPill status={resultCase.status} />
      </p>
      <p className="mt-1.5 text-sm leading-6 text-text">{resultCase.reason}</p>
      {resultCase.evidence.length ? (
        <p className="mt-1 text-xs text-muted">
          {resultCase.evidence.length} piece{resultCase.evidence.length === 1 ? '' : 's'} of evidence
          attached
        </p>
      ) : null}
      {(resultCase as { proposedResolution?: string }).proposedResolution ? (
        <p className="mt-2 rounded-[var(--radius-sm)] bg-surface-2 p-2 text-xs leading-5 text-muted">
          Proposed: {(resultCase as { proposedResolution?: string }).proposedResolution}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onAct}
        className="mt-3 min-h-11 w-full rounded-[var(--radius-md)] bg-brand px-4 text-sm font-semibold text-[var(--on-brand)] transition hover:bg-brand-hover"
      >
        Act on this case
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: ResultCaseStatus }) {
  return (
    <span className={cn(
      'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
      status === 'resolved_corrected' && 'border-[var(--state-verified)] text-[var(--state-verified)]',
      status === 'resolved_upheld' && 'border-border text-muted',
      (status === 'open' || status === 'under_review' || status === 'proposed') && 'border-[var(--state-pending)] text-[var(--state-pending)]',
      status === 'escalated' && 'border-[var(--state-error)] text-[var(--state-error)]',
      (status === 'withdrawn' || status === 'superseded') && 'border-border text-subtle',
    )}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Opening a case names the version it challenges.
 *
 * Sent from the client rather than read on the server, deliberately: an admin on a stale page
 * names a version the match has moved past, and the server refuses rather than opening a case
 * about a result that no longer exists.
 */
function OpenCaseSheet({
  open,
  matchId,
  subjectVersion,
  onClose,
  onOpened,
}: {
  open: boolean;
  matchId: string;
  subjectVersion: number;
  onClose: () => void;
  onOpened: () => void;
}) {
  const { currentUser } = useAuth();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!currentUser) return;
    setSubmitting(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/result-cases`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ subjectVersion, reason: reason.trim(), evidence: [] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'The case could not be opened.');
      toast.success('Case opened.');
      setReason('');
      onOpened();
      onClose();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The case could not be opened.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Open a correction case" description={`Challenging official version ${subjectVersion}.`}>
      <label className="block text-sm font-medium text-text">
        What is wrong with this result?
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="The second goal was credited to the wrong club."
          className="mt-1.5 min-h-28 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 p-3 text-sm text-text-strong placeholder:text-subtle"
        />
        <span className="mt-1.5 block text-xs leading-5 text-muted">
          The original report stays exactly as it is. A ruling supersedes it; nothing is edited.
        </span>
      </label>
      <button
        type="button"
        disabled={reason.trim().length < 10 || submitting}
        onClick={() => void submit()}
        className="mt-4 min-h-11 w-full rounded-[var(--radius-md)] bg-brand px-4 text-sm font-semibold text-[var(--on-brand)] transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-subtle"
      >
        {submitting ? 'Opening…' : 'Open case'}
      </button>
    </Sheet>
  );
}

type Action = 'claim' | 'propose' | 'escalate' | 'rule' | 'withdraw';

const ACTION_LABEL: Record<Action, string> = {
  claim: 'Take this case',
  propose: 'Propose a resolution',
  escalate: 'Escalate to platform',
  rule: 'Rule on it',
  withdraw: 'Withdraw the case',
};

/**
 * Every move on a case, in one sheet.
 *
 * Offers every action and lets the server refuse. A conflicted admin who picks "Rule" is told
 * they are affiliated with a club in the fixture and should propose or escalate instead — by
 * the server, in the server's words — rather than finding the option silently missing.
 */
function CaseActionSheet({
  resultCase,
  currentScore,
  onClose,
  onChanged,
}: {
  resultCase: ResultCase | null;
  currentScore: { home: number; away: number } | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { currentUser } = useAuth();
  const [action, setAction] = useState<Action>('claim');
  const [outcome, setOutcome] = useState<'upheld' | 'corrected'>('upheld');
  const [rationale, setRationale] = useState('');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const needsRationale = action !== 'claim' && action !== 'withdraw';
  const needsScore = action === 'rule' && outcome === 'corrected';
  const ready = Boolean(resultCase)
    && (!needsRationale || rationale.trim().length >= 10)
    && (!needsScore || (home !== '' && away !== ''));

  async function submit() {
    if (!resultCase || !currentUser) return;
    setSubmitting(true);
    try {
      const token = await currentUser.getIdToken();
      const payload: Record<string, unknown> = { action };
      if (needsRationale) payload.rationale = rationale.trim();
      if (action === 'rule') payload.outcome = outcome;
      if (needsScore) payload.correctedScore = { home: Number(home), away: Number(away) };

      const response = await fetch(`/api/result-cases/${encodeURIComponent(resultCase.id)}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'The action was refused.');

      /*
       * A corrected ruling reports what the finalizer did with it, and that is worth saying.
       * "Ruled" and "ruled, and the result is now official version 3" are different outcomes,
       * and a `noop` — the match moved on since the case was opened — is one the admin has to
       * hear about rather than infer from a table that did not change.
       */
      const finalization = body.finalization as { action?: string; reason?: string } | undefined;
      if (finalization?.action === 'finalized') {
        toast.success('Ruling recorded and the corrected result is now official.');
      } else if (finalization && finalization.action !== 'finalized') {
        toast.warning(`Ruling recorded, but it was not published: ${finalization.reason ?? finalization.action}.`);
      } else {
        toast.success('Recorded.');
      }
      onChanged();
      onClose();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The action was refused.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={Boolean(resultCase)}
      onClose={onClose}
      mobileFullScreen
      title={resultCase ? `Case on version ${resultCase.subjectVersion}` : 'Case'}
      description="A ruling never edits a score. A correction is finalized through the same path every result takes."
    >
      <div className="space-y-4">
        <label className="block text-sm font-medium text-text">
          Action
          <select
            value={action}
            onChange={(event) => setAction(event.target.value as Action)}
            className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong"
          >
            {(Object.keys(ACTION_LABEL) as Action[]).map((entry) => (
              <option key={entry} value={entry}>{ACTION_LABEL[entry]}</option>
            ))}
          </select>
        </label>

        {action === 'rule' ? (
          <div className="flex gap-2" role="radiogroup" aria-label="Outcome">
            {(['upheld', 'corrected'] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                role="radio"
                aria-checked={outcome === entry}
                onClick={() => setOutcome(entry)}
                className={cn(
                  'min-h-11 flex-1 rounded-[var(--radius-md)] border px-3 text-sm font-semibold transition',
                  outcome === entry ? 'border-brand bg-brand-subtle text-brand' : 'border-border text-muted',
                )}
              >
                {entry === 'upheld' ? 'Result stands' : 'Result is corrected'}
              </button>
            ))}
          </div>
        ) : null}

        {needsScore ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-text">
              Home
              <input
                type="number" min={0} max={500} value={home}
                onChange={(event) => setHome(event.target.value)}
                placeholder={currentScore ? String(currentScore.home) : ''}
                className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong"
              />
            </label>
            <label className="block text-sm font-medium text-text">
              Away
              <input
                type="number" min={0} max={500} value={away}
                onChange={(event) => setAway(event.target.value)}
                placeholder={currentScore ? String(currentScore.away) : ''}
                className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong"
              />
            </label>
          </div>
        ) : null}

        {needsRationale ? (
          <label className="block text-sm font-medium text-text">
            {action === 'rule' ? 'Rationale' : action === 'escalate' ? 'Why platform should decide' : 'Proposed resolution'}
            <textarea
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              className="mt-1.5 min-h-24 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 p-3 text-sm text-text-strong"
            />
            <span className="mt-1.5 block text-xs leading-5 text-muted">
              Recorded on the case for anybody reading it later, including the clubs.
            </span>
          </label>
        ) : null}

        <button
          type="button"
          disabled={!ready || submitting}
          onClick={() => void submit()}
          className="min-h-11 w-full rounded-[var(--radius-md)] bg-brand px-4 text-sm font-semibold text-[var(--on-brand)] transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-subtle"
        >
          {submitting ? 'Working…' : ACTION_LABEL[action]}
        </button>
      </div>
    </Sheet>
  );
}
