'use client';

import { useState } from 'react';
import type { MatchOperationalException } from '@/types';

type QueueRow = MatchOperationalException & {
  conflictContext?: { conflictWithMatch?: boolean; relationships?: string[] };
};

const CODE_LABELS: Record<string, string> = {
  declared_score_mismatch: 'Declared score and events disagree',
  event_sequence_gap: 'An event never reached us',
  unsynced_events_at_submit: 'Events were still on the phone at full time',
  late_events_from_revoked_session: 'A replaced device synced afterwards',
  athlete_not_registered: 'An event names an unregistered athlete',
  athlete_ineligible: 'An event names an ineligible athlete',
  match_abandoned: 'The match was ended early',
  policy_violation: 'The result was entered in a way this competition does not permit',
  lineup_discrepancy_reported: 'A player was missing from the team sheet',
  clock_anomaly: 'The match clock was adjusted',
  post_window_correction: 'An event was corrected after the fact',
  takeover_occurred: 'Capture moved to a second device',
  affiliated_observer: 'The observer is involved with one of these clubs',
  result_never_reported: 'Nobody reported this match',
};

/**
 * The League's review queue.
 *
 * Conflict state is rendered before the controls, not after, and that ordering is the design.
 * An admin who reads "Resolve" and then discovers they may not has been told they are
 * conflicted by a 403, which reads as a bug. An admin who sees "You coach Kampala United" and
 * then finds only "Propose resolution" has been told something true about their position
 * before being asked to act on it.
 */
export function MatchExceptionQueue({ rows }: { rows: QueueRow[] }) {
  const blocking = rows.filter((row) => row.blocking && row.status !== 'resolved');
  const signals = rows.filter((row) => !row.blocking && row.status !== 'resolved');

  if (!blocking.length && !signals.length) {
    return (
      <section className="rounded-2xl border border-white/10 bg-surface-2 p-6 text-center">
        <p className="text-sm font-semibold text-text-strong">Nothing needs you</p>
        {/*
          The measure of success for the whole redesign. On a matchday where everything
          reconciles this panel is empty, because every clean report finalized without a human
          and left the League Admin's attention entirely.
        */}
        <p className="mt-1 text-xs text-muted">Every match today reconciled on its own.</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {blocking.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-state-disputed">
            Blocking · {blocking.length}
          </h2>
          {blocking.map((row) => <CaseCard key={row.id} row={row} />)}
        </section>
      ) : null}

      {signals.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-muted">
            Quality signals · {signals.length}
          </h2>
          <p className="text-xs text-muted">
            These do not hold up a result. They are recorded against it so anyone reading the
            record later knows what happened.
          </p>
          {signals.map((row) => <CaseCard key={row.id} row={row} />)}
        </section>
      ) : null}
    </div>
  );
}

function CaseCard({ row }: { row: QueueRow }) {
  const [open, setOpen] = useState(false);
  const conflicted = Boolean(row.conflictContext?.conflictWithMatch);

  return (
    <article className="rounded-2xl border border-white/10 bg-surface-2 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-strong">
          {CODE_LABELS[row.code] ?? row.code.replaceAll('_', ' ')}
        </h3>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{row.status}</span>
      </header>

      {conflicted ? (
        // Before the controls. Always.
        <p className="mt-3 rounded-xl border border-state-pending/30 bg-state-pending/10 px-3 py-2 text-xs text-state-pending">
          You are involved with one of these clubs
          {row.conflictContext?.relationships?.length
            ? ` as ${row.conflictContext.relationships.join(', ')}`
            : ''}
          . You can prepare a resolution; another admin will decide.
        </p>
      ) : null}

      {row.proposedResolution ? (
        <p className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-muted">
          Proposed: {row.proposedResolution}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`/matches/${row.matchId}`}
          className="min-h-11 rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-text-strong"
        >
          Open match
        </a>
        <button
          onClick={() => setOpen((value) => !value)}
          className="min-h-11 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-black"
        >
          {conflicted ? 'Propose resolution' : 'Resolve'}
        </button>
      </div>

      {open ? (
        <p className="mt-3 text-xs text-muted">
          {conflicted
            ? 'Write what you think should happen and why. Attach anything that supports it.'
            : 'Record what you decided and why. This is attached to the official result.'}
        </p>
      ) : null}
    </article>
  );
}
