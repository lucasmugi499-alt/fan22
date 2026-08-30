import { describe, expect, it } from 'vitest';
import { capturesACompletedMatch, reportRefusal } from './reportGate';

/**
 * The premature-report hole.
 *
 * A valid Field Manager session could, before kickoff, submit a report with no events and a
 * declared 0-0. The reconstruction of an empty event stream is 0-0, so the declared score
 * matched; there were no sequence gaps because there was no sequence; no device had synced
 * late; the clock raised no anomaly because there was no clock. Every gate passed, the report
 * was marked `submitted`, and the finalizer's own plan then set the match to
 * completed/verified unconditionally.
 *
 * An unplayed fixture became an official draw, and it reached the standings, every listed
 * athlete's appearance record, fantasy scoring and the notifications announcing all three.
 */

const KICKOFF = '2026-08-30T15:00:00.000Z';
const BEFORE = Date.parse('2026-08-30T14:59:00.000Z');
const AFTER = Date.parse('2026-08-30T16:50:00.000Z');

describe('refusing a report the fixture cannot support', () => {
  it('refuses a report submitted before kickoff', () => {
    expect(reportRefusal({ status: 'scheduled', scheduledAt: KICKOFF, now: BEFORE }))
      .toBe('This match has not kicked off yet, so it cannot be reported.');
  });

  it('refuses a report for a cancelled match', () => {
    expect(reportRefusal({ status: 'cancelled', scheduledAt: KICKOFF, now: AFTER }))
      .toBe('This match was cancelled and cannot be reported.');
  });

  it('allows a report once the match has kicked off', () => {
    expect(reportRefusal({ status: 'live', scheduledAt: KICKOFF, now: AFTER })).toBeNull();
  });

  it('allows a report on a match already marked completed, so a result can still be attested', () => {
    expect(reportRefusal({ status: 'completed', scheduledAt: KICKOFF, now: AFTER })).toBeNull();
  });

  it('does not refuse on an unreadable kickoff time', () => {
    // The fixture is already broken. Blocking its report would strand a match somebody played.
    expect(reportRefusal({ status: 'live', scheduledAt: 'not a date', now: AFTER })).toBeNull();
  });
});

describe('the evidence that a match was played', () => {
  it('accepts a clock that reached full time', () => {
    expect(capturesACompletedMatch({ state: 'full_time' })).toBe(true);
  });

  it('rejects a match with no clock at all', () => {
    // The premature-report case: nothing was ever started, so nothing says a match happened.
    expect(capturesACompletedMatch(null)).toBe(false);
  });

  it('rejects a clock that never started', () => {
    expect(capturesACompletedMatch({ state: 'not_started' })).toBe(false);
  });

  it('rejects a report attested at half time', () => {
    expect(capturesACompletedMatch({ state: 'period_break' })).toBe(false);
    expect(capturesACompletedMatch({ state: 'running' })).toBe(false);
    expect(capturesACompletedMatch({ state: 'paused' })).toBe(false);
  });
});
