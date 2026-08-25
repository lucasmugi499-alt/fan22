import { describe, expect, it } from 'vitest';
import { isWithinUndoWindow, planEventIntake } from './intake';

function incoming(clientEventId: string, clientSequence: number) {
  return {
    clientEventId,
    clientSequence,
    eventType: 'football.goal',
    teamId: 'team_home',
    athleteId: 'athlete_1',
    period: '1',
    gameClockMs: 60_000,
    deviceTime: '2026-08-24T15:01:00.000Z',
  };
}

const sameGeneration = { submittedGeneration: 1, currentGeneration: 1 };

describe('event intake', () => {
  it('accepts a clean batch', () => {
    const verdict = planEventIntake({
      incoming: [incoming('a', 1), incoming('b', 2)],
      existing: [],
      ...sameGeneration,
    });

    expect(verdict.accepted).toHaveLength(2);
    expect(verdict.accepted.every((entry) => entry.status === 'active')).toBe(true);
    expect(verdict.missingSequences).toEqual([]);
  });

  /**
   * The completion test for retry safety. The common failure on a bad connection is that the
   * request arrived and the response did not, so the client retries something the server
   * already has.
   */
  it('records one event however many times the same clientEventId arrives', () => {
    const first = planEventIntake({ incoming: [incoming('a', 1)], existing: [], ...sameGeneration });
    const stored = [{ clientEventId: 'a', clientSequence: 1, status: 'active' as const }];

    const replayed = planEventIntake({
      incoming: Array.from({ length: 10 }, () => incoming('a', 1)),
      existing: stored,
      ...sameGeneration,
    });

    expect(first.accepted).toHaveLength(1);
    expect(replayed.accepted).toEqual([]);
    expect(replayed.duplicates).toHaveLength(10);
  });

  it('deduplicates within a single batch as well as against storage', () => {
    const verdict = planEventIntake({
      incoming: [incoming('a', 1), incoming('a', 1)],
      existing: [],
      ...sameGeneration,
    });

    expect(verdict.accepted).toHaveLength(1);
    expect(verdict.duplicates).toEqual(['a']);
  });

  it('reports a sequence that never arrived', () => {
    // 101, 102, 104 means 103 is missing. One of those is a match with a quiet spell; the
    // other is seven lost events, and only the sequence can tell them apart.
    const verdict = planEventIntake({
      incoming: [incoming('c', 4)],
      existing: [
        { clientEventId: 'a', clientSequence: 1, status: 'active' },
        { clientEventId: 'b', clientSequence: 2, status: 'active' },
      ],
      ...sameGeneration,
    });

    expect(verdict.missingSequences).toEqual([3]);
  });

  /**
   * The single most likely way field capture produces a corrupt match: the old phone comes
   * back after a takeover and syncs events anchored to a clock that has been replaced.
   */
  it('quarantines a late sync from a superseded session rather than dropping or merging it', () => {
    const verdict = planEventIntake({
      incoming: [incoming('late_1', 12), incoming('late_2', 13)],
      existing: [],
      submittedGeneration: 1,
      currentGeneration: 2,
    });

    expect(verdict.quarantined).toBe(true);
    expect(verdict.accepted).toHaveLength(2);
    // Accepted, because they are real observations from the only person who was watching.
    expect(verdict.accepted.every((entry) => entry.status === 'quarantined')).toBe(true);
  });

  it('does not quarantine a session that is current', () => {
    const verdict = planEventIntake({
      incoming: [incoming('a', 1)],
      existing: [],
      submittedGeneration: 2,
      currentGeneration: 2,
    });

    expect(verdict.quarantined).toBe(false);
  });

  it('knows when a correction is still an undo and when it is a revision', () => {
    const now = new Date('2026-08-24T15:00:10.000Z');

    expect(isWithinUndoWindow('2026-08-24T15:00:05.000Z', now)).toBe(true);
    expect(isWithinUndoWindow('2026-08-24T14:59:00.000Z', now)).toBe(false);
  });
});
