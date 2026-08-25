import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import type { CandidateFinalizationPlan } from './plan';
import type { FinalizationCandidate } from './candidate';

/**
 * Where the source-specific writes live, so the core never has to ask what produced a result.
 *
 * The finalizer used to write six things to `resultSubmissions` on its way through: a blocked
 * status, an archived previous version, a lifecycle status, and two entries in an events
 * subcollection. None of those mean anything for a field report, which has no confirmation
 * machine, no opponent, and no versions subcollection.
 *
 * The tempting fix is `if (source === 'field_capture')` scattered through the transaction. It
 * would work and it would be unreadable within a year, because the reader of any one branch
 * cannot see the others and nothing tells them the set is complete. An adapter puts all of one
 * source's writes in one place, and the core states its intent once:
 *
 *   the official writes succeeded, record that on whatever produced this
 *
 * Reads and writes are separated because Firestore transactions require every read before any
 * write. `prepare` is the adapter's chance to read once the plan exists; everything after that
 * is writes only.
 */

export type LifecycleFinalizedInput = {
  db: Firestore;
  plan: CandidateFinalizationPlan;
  candidate: FinalizationCandidate;
};

export type LifecycleBlockedInput = {
  db: Firestore;
  candidate: FinalizationCandidate;
  reason: 'reconciliation_surplus' | 'submission_too_large';
  exceptionId: string;
  at: string;
  /**
   * True when this block has already been recorded, so a redelivered trigger does not append
   * a second identical entry to the source's audit trail.
   *
   * Firestore delivers at least once and the case document is created idempotently, so its
   * prior existence is the signal that this is a repeat rather than a first refusal.
   */
  alreadyRecorded?: boolean;
  /** What to say in the source's own audit trail, where it has one. */
  note?: string;
};

export interface SourceLifecycleAdapter {
  readonly sourceType: FinalizationCandidate['sourceType'];
  /** Reads the adapter needs once the plan exists. Called before any write. */
  prepare?(tx: Transaction, plan: CandidateFinalizationPlan): Promise<void>;
  /** The official writes succeeded. Record that on the source record. */
  onFinalized(tx: Transaction, input: LifecycleFinalizedInput): void;
  /** The result was refused. Record that, so the source stops looking finalizable. */
  onBlocked(tx: Transaction, input: LifecycleBlockedInput): void;
}

/**
 * The bilateral workflow's record keeping, unchanged in behaviour and now in one place.
 *
 * Every write here existed before; what has changed is that the core no longer knows about
 * them. The events subcollection in particular is the legacy workflow's own audit trail, and a
 * field report writing into it would be claiming a state transition in a machine it was never
 * part of.
 */
export function legacySubmissionLifecycle(input: {
  submissionRef: DocumentReference;
  /** The document as it was read, needed to archive the superseded version verbatim. */
  snapshotData: () => Record<string, unknown> | undefined;
  previousStatus: string;
  sourceRecordId: string;
}): SourceLifecycleAdapter {
  let archivedRef: DocumentReference | null = null;
  let archiveExists = true;

  return {
    sourceType: 'legacy_team_submission',

    async prepare(tx, plan) {
      // A first result supersedes nothing, so there is nothing to archive and nothing to read.
      if (typeof plan.supersedesVersion !== 'number') return;
      archivedRef = input.submissionRef.collection('versions').doc(String(plan.supersedesVersion));
      archiveExists = (await tx.get(archivedRef)).exists;
    },

    onFinalized(tx, { plan }) {
      if (archivedRef && !archiveExists) {
        // Archived verbatim rather than summarised: the superseded claim is evidence, and a
        // summary of it is somebody's reading of the evidence.
        tx.create(archivedRef, {
          ...input.snapshotData(),
          status: 'superseded',
          supersedesSubmissionId: input.sourceRecordId,
          supersededAt: plan.sourceLifecycle.finalizedAt,
        });
      }

      tx.update(input.submissionRef, {
        status: plan.sourceLifecycle.status,
        finalizationSource: plan.sourceLifecycle.finalizationSource,
        finalizationKey: plan.finalizationKey,
        finalizedAt: plan.sourceLifecycle.finalizedAt,
      });

      tx.create(input.submissionRef.collection('events').doc(), {
        submissionId: input.sourceRecordId,
        from: input.previousStatus,
        to: plan.sourceLifecycle.status,
        actor: 'system',
        actorUserId: 'system:finalizer',
        note: `Finalized via ${plan.sourceLifecycle.finalizationSource}`,
        createdAt: plan.sourceLifecycle.finalizedAt,
      });
    },

    onBlocked(tx, { reason, exceptionId, at, alreadyRecorded, note }) {
      tx.update(input.submissionRef, {
        finalizationStatus: reason === 'submission_too_large'
          ? 'blocked_oversized_submission'
          : 'blocked_reconciliation',
        reviewStatus: 'league_review_required',
        reconciliationExceptionId: exceptionId,
        updatedAt: at,
      });

      // The bilateral workflow's own audit trail. Written once: a redelivered trigger that
      // appended a second identical entry would make the timeline read as two refusals.
      if (note && !alreadyRecorded) {
        tx.create(input.submissionRef.collection('events').doc(), {
          submissionId: input.sourceRecordId,
          from: input.previousStatus,
          to: input.previousStatus,
          actor: 'system',
          actorUserId: 'system:finalizer',
          note,
          reconciliationExceptionId: exceptionId,
          createdAt: at,
        });
      }
    },
  };
}

/**
 * A field capture report's record keeping.
 *
 * Shorter than the legacy adapter, and that is the shape of the whole redesign rather than an
 * omission. There is no confirmation state to advance, no opponent to notify, and no versions
 * subcollection, because a field report is one observer's account rather than a negotiation
 * between two parties.
 */
export function fieldReportLifecycle(input: { reportRef: DocumentReference }): SourceLifecycleAdapter {
  return {
    sourceType: 'field_capture',

    onFinalized(tx, { plan }) {
      tx.update(input.reportRef, {
        // `official`, and only now. Until the official writes land in this same transaction the
        // report says `ready_for_finalization`, which claims nothing that has not happened.
        status: 'official',
        finalizationSource: plan.sourceLifecycle.finalizationSource,
        finalizationKey: plan.finalizationKey,
        officialResultVersion: plan.resultVersion,
        finalizedAt: plan.sourceLifecycle.finalizedAt,
        updatedAt: plan.sourceLifecycle.finalizedAt,
      });
    },

    onBlocked(tx, { reason, exceptionId, at }) {
      tx.update(input.reportRef, {
        status: 'league_review',
        blockedReason: reason,
        reconciliationExceptionId: exceptionId,
        updatedAt: at,
      });
    },
  };
}

/**
 * A league entering a result afterwards.
 *
 * Shares the field report's storage, because it is the same kind of record: one party's
 * account of what happened. What differs is the provenance the planner assigns and the quality
 * ceiling that follows from it, neither of which is this adapter's business.
 */
export function leagueReportLifecycle(input: { reportRef: DocumentReference }): SourceLifecycleAdapter {
  const base = fieldReportLifecycle(input);
  return { ...base, sourceType: 'league_post_match' };
}
