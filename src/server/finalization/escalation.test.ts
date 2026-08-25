import { describe, expect, it } from 'vitest';
import { escalationState, isUnreportedAndStale } from './escalation';

const NOW = new Date('2026-08-24T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe('escalation liveness', () => {
  it('marks a case overdue after the deadline', () => {
    expect(escalationState({ status: 'escalated', escalatedAt: daysAgo(8), now: NOW }))
      .toEqual({ overdue: true, standings: 'provisional', daysWaiting: 8 });
  });

  it('leaves a case inside the deadline alone', () => {
    expect(escalationState({ status: 'escalated', escalatedAt: daysAgo(3), now: NOW }).overdue).toBe(false);
  });

  /**
   * The whole point. A timeout never decides in favour of either team and never quietly
   * officialises; it changes what a reader is told. A match with no defensible result stays a
   * match with no result, and the table says so rather than pretending.
   */
  it('never resolves a case by waiting', () => {
    const state = escalationState({ status: 'escalated', escalatedAt: daysAgo(60), now: NOW });

    expect(state.standings).toBe('provisional');
    // No status change is implied anywhere in this return. Only a person closes a case.
    expect(Object.keys(state)).toEqual(['overdue', 'standings', 'daysWaiting']);
  });

  it('counts a resolved case normally, however long it took', () => {
    expect(escalationState({ status: 'resolved', escalatedAt: daysAgo(90), now: NOW }))
      .toEqual({ overdue: false, standings: 'counted', daysWaiting: 0 });
  });

  it('treats a case that was never escalated as counted', () => {
    expect(escalationState({ status: 'open', now: NOW }).standings).toBe('counted');
  });
});

describe('a match nobody reports', () => {
  it('raises sooner where field capture was required', () => {
    // Somebody was assigned and did not report, which is a question worth asking the same week.
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(4), hasReport: false, effectiveCapturePolicy: 'FIELD_REQUIRED', now: NOW,
    })).toBe(true);
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(4), hasReport: false, effectiveCapturePolicy: 'POST_MATCH_ALLOWED', now: NOW,
    })).toBe(false);
  });

  it('raises later where entering results at the weekend is ordinary', () => {
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(8), hasReport: false, effectiveCapturePolicy: 'POST_MATCH_ALLOWED', now: NOW,
    })).toBe(true);
  });

  it('never raises for a match that was reported', () => {
    expect(isUnreportedAndStale({ scheduledAt: daysAgo(90), hasReport: true, now: NOW })).toBe(false);
  });

  it('never raises for a fixture that has not been played', () => {
    expect(isUnreportedAndStale({ scheduledAt: daysAgo(-3), hasReport: false, now: NOW })).toBe(false);
  });
});
