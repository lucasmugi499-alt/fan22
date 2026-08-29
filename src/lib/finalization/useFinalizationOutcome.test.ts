import { describe, expect, it } from 'vitest';
import {
  FINALIZATION_TIMEOUT_MS,
  findBlockingException,
  resolveFinalizationPhase,
} from './useFinalizationOutcome';

/**
 * The waiting state modelled one outcome for a workflow with four.
 *
 * `busy` was set when a decision was submitted and cleared ONLY by a thrown error. Success
 * came from a live subscription observing `status === 'official'` — the right pattern, and
 * why the "Finalized as official" messages in this product can be trusted. But finalization
 * legitimately produces three other outcomes: the activation gate set to `off` or `canary`, a
 * blocking reconciliation exception, and an oversize submission refused rather than expanded.
 * In every one of them the sheet sat at "Saving decision…" indefinitely with no escape but
 * closing it.
 *
 * The spinner is not the dangerous part. The decision HAD been saved, so a League Admin who
 * reasonably concluded it failed and tried again would act twice on the same match.
 *
 * These test the two decisions the hook makes. What is left in the hook itself is
 * subscription plumbing — there is no jsdom environment in this repo, and the codebase's
 * pattern is to test the logic rather than the render.
 */

describe('which phase to report', () => {
  it('reports official once the subscription observes the promotion', () => {
    expect(resolveFinalizationPhase('waiting', 'official')).toBe('official');
  });

  it('keeps waiting while the status is anything else', () => {
    for (const status of ['disputed', 'confirmed', 'pending_confirmation', 'confirmation_overdue'] as const) {
      expect(resolveFinalizationPhase('waiting', status)).toBe('waiting');
    }
  });

  it('keeps waiting when there is no submission status at all', () => {
    expect(resolveFinalizationPhase('waiting', undefined)).toBe('waiting');
  });

  it('does not report official from a status observed before any wait began', () => {
    // Otherwise opening the sheet on an already-official match fires the success toast and
    // closes it, for a decision nobody made. Deriving only while `waiting` is what prevents it.
    expect(resolveFinalizationPhase('idle', 'official')).toBe('idle');
  });

  it('does not let a late promotion overwrite a settled non-official outcome', () => {
    // Once the wait has resolved to review or pending the sheet has told the user something.
    // Silently flipping to "finalized" underneath them would be a third wrong answer.
    expect(resolveFinalizationPhase('review', 'official')).toBe('review');
    expect(resolveFinalizationPhase('pending', 'official')).toBe('pending');
  });

  it('passes every non-official settled phase straight through', () => {
    for (const settled of ['idle', 'waiting', 'review', 'pending'] as const) {
      expect(resolveFinalizationPhase(settled, 'disputed')).toBe(settled);
    }
  });
});

describe('finding the exception that blocked this match', () => {
  const exceptions = [
    { id: 'doc_1', exceptionId: 'exc_1', matchId: 'match_1' },
    { id: 'doc_2', exceptionId: 'exc_2', matchId: 'match_2' },
  ];

  it('finds the one raised for this match', () => {
    expect(findBlockingException(exceptions, 'match_2')?.exceptionId).toBe('exc_2');
  });

  it('ignores exceptions raised for other matches in the same league', () => {
    // The queue is league-scoped, so on a busy matchday it will usually hold several. Matching
    // loosely would tell a club its result was sent for review because a different fixture was.
    expect(findBlockingException(exceptions, 'match_99')).toBeUndefined();
  });

  it('returns nothing when the queue is empty', () => {
    expect(findBlockingException([], 'match_1')).toBeUndefined();
  });
});

describe('the timeout', () => {
  it('is bounded, which is the whole point', () => {
    // The previous behaviour was an unbounded wait. Any bound beats it; this asserts the
    // constant stays a plausible one rather than drifting to something that reads as a hang.
    expect(FINALIZATION_TIMEOUT_MS).toBeGreaterThan(5_000);
    expect(FINALIZATION_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});
