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
  it('does not call a match unreported while it is still live', () => {
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(8),
      status: 'live',
      verificationStatus: 'pending',
      hasReport: false,
      hasResultSubmission: false,
      hasOfficialResult: false,
      effectiveCapturePolicy: 'FIELD_REQUIRED',
      capturePolicyBoundAt: daysAgo(30),
      now: NOW,
    })).toBe(false);
  });

  it('does not reopen a match already in league adjudication', () => {
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(8),
      status: 'completed',
      verificationStatus: 'disputed',
      hasReport: false,
      hasResultSubmission: false,
      hasOfficialResult: false,
      effectiveCapturePolicy: 'FIELD_REQUIRED',
      capturePolicyBoundAt: daysAgo(30),
      now: NOW,
    })).toBe(false);
  });

  it('does not call a match unreported when a bilateral submission exists', () => {
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(8),
      status: 'scheduled',
      verificationStatus: 'pending',
      hasReport: false,
      hasResultSubmission: true,
      hasOfficialResult: false,
      effectiveCapturePolicy: 'POST_MATCH_ALLOWED',
      capturePolicyBoundAt: daysAgo(30),
      now: NOW,
    })).toBe(false);
  });

  it('does not open a missing-report case over an existing official result', () => {
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(8),
      status: 'completed',
      verificationStatus: 'pending',
      hasReport: false,
      hasResultSubmission: false,
      hasOfficialResult: true,
      effectiveCapturePolicy: 'FIELD_REQUIRED',
      capturePolicyBoundAt: daysAgo(30),
      now: NOW,
    })).toBe(false);
  });

  it('does not retroactively impose a reporting obligation on legacy fixtures', () => {
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(8),
      status: 'scheduled',
      verificationStatus: 'pending',
      hasReport: false,
      hasResultSubmission: false,
      hasOfficialResult: false,
      effectiveCapturePolicy: 'FIELD_REQUIRED',
      now: NOW,
    })).toBe(false);
  });

  it('does not treat an invalid policy binding as proof of governance', () => {
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(8),
      status: 'scheduled',
      verificationStatus: 'pending',
      hasReport: false,
      hasResultSubmission: false,
      hasOfficialResult: false,
      capturePolicyBoundAt: 'not-a-date',
      effectiveCapturePolicy: 'FIELD_REQUIRED',
      now: NOW,
    })).toBe(false);
  });

  it('does not let a policy bound after kickoff create a retroactive obligation', () => {
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(8),
      status: 'scheduled',
      verificationStatus: 'pending',
      hasReport: false,
      hasResultSubmission: false,
      hasOfficialResult: false,
      capturePolicyBoundAt: daysAgo(2),
      effectiveCapturePolicy: 'FIELD_REQUIRED',
      now: NOW,
    })).toBe(false);
  });

  it('requires the policy itself as well as its binding timestamp', () => {
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(8),
      status: 'scheduled',
      verificationStatus: 'pending',
      hasReport: false,
      hasResultSubmission: false,
      hasOfficialResult: false,
      capturePolicyBoundAt: daysAgo(30),
      now: NOW,
    })).toBe(false);
  });

  it('raises sooner where field capture was required', () => {
    // Somebody was assigned and did not report, which is a question worth asking the same week.
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(4), status: 'scheduled', verificationStatus: 'pending', hasReport: false, hasResultSubmission: false, hasOfficialResult: false, effectiveCapturePolicy: 'FIELD_REQUIRED', capturePolicyBoundAt: daysAgo(30), now: NOW,
    })).toBe(true);
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(4), status: 'scheduled', verificationStatus: 'pending', hasReport: false, hasResultSubmission: false, hasOfficialResult: false, effectiveCapturePolicy: 'POST_MATCH_ALLOWED', capturePolicyBoundAt: daysAgo(30), now: NOW,
    })).toBe(false);
  });

  it('raises later where entering results at the weekend is ordinary', () => {
    expect(isUnreportedAndStale({
      scheduledAt: daysAgo(8), status: 'scheduled', verificationStatus: 'pending', hasReport: false, hasResultSubmission: false, hasOfficialResult: false, effectiveCapturePolicy: 'POST_MATCH_ALLOWED', capturePolicyBoundAt: daysAgo(30), now: NOW,
    })).toBe(true);
  });

  it('never raises for a match that was reported', () => {
    expect(isUnreportedAndStale({ scheduledAt: daysAgo(90), status: 'scheduled', verificationStatus: 'pending', hasReport: true, hasResultSubmission: false, hasOfficialResult: false, capturePolicyBoundAt: daysAgo(100), now: NOW })).toBe(false);
  });

  it('never raises for a fixture that has not been played', () => {
    expect(isUnreportedAndStale({ scheduledAt: daysAgo(-3), status: 'scheduled', verificationStatus: 'pending', hasReport: false, hasResultSubmission: false, hasOfficialResult: false, capturePolicyBoundAt: daysAgo(30), now: NOW })).toBe(false);
  });
});
