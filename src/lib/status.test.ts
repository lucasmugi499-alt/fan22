import { describe, expect, it } from 'vitest';
import {
  challengeLabel,
  isOfficialMatch,
  isStillToPlay,
  isUpcomingMatch,
  matchLabel,
  normalizeChallengeStatus,
  normalizeMatchStatus,
  normalizeMatchVerification,
  normalizeVerificationStatus,
  verificationLabel,
} from './status';

/**
 * Status values previously existed in two casings within the same union, so a strict
 * comparison such as `=== 'Verified'` silently returned false for the majority of records
 * (which store `'verified'`). These tests pin the single canonical representation and the
 * boundary conversions that produce it.
 */

describe('normalizeVerificationStatus', () => {
  it('accepts either casing for every value', () => {
    for (const value of ['verified', 'Verified', 'VERIFIED']) {
      expect(normalizeVerificationStatus(value)).toBe('verified');
    }
    for (const value of ['disputed', 'Disputed']) {
      expect(normalizeVerificationStatus(value)).toBe('disputed');
    }
    for (const value of ['rejected', 'Rejected']) {
      expect(normalizeVerificationStatus(value)).toBe('rejected');
    }
  });

  it('treats unknown, empty and missing values as pending rather than trusted', () => {
    for (const value of [undefined, null, '', 'nonsense', 'Pending Verification']) {
      expect(normalizeVerificationStatus(value)).toBe('pending');
    }
  });
});

describe('normalizeMatchStatus', () => {
  it('maps display wording back to the canonical lifecycle', () => {
    expect(normalizeMatchStatus('Upcoming')).toBe('scheduled');
    expect(normalizeMatchStatus('Completed')).toBe('completed');
    expect(normalizeMatchStatus('Live')).toBe('live');
  });

  it('treats legacy verification values on the lifecycle field as played', () => {
    // Records once stored the verification outcome in `status`; both imply the match
    // happened, so the lifecycle is 'completed' and the verification meaning is recovered
    // separately by normalizeMatchVerification.
    expect(normalizeMatchStatus('verified')).toBe('completed');
    expect(normalizeMatchStatus('disputed')).toBe('completed');
  });

  it('falls back to scheduled, never to completed', () => {
    expect(normalizeMatchStatus('nonsense')).toBe('scheduled');
    expect(normalizeMatchStatus(undefined)).toBe('scheduled');
  });
});

describe('normalizeMatchVerification', () => {
  it('preserves an explicit verification status', () => {
    expect(normalizeMatchVerification('pending', 'verified')).toBe('pending');
    expect(normalizeMatchVerification('verified', 'completed')).toBe('verified');
  });

  it('does not lose a disputed signal carried on the legacy lifecycle field', () => {
    expect(normalizeMatchVerification('pending', 'disputed')).toBe('disputed');
  });

  it('recovers a verified outcome when only the legacy field carried it', () => {
    expect(normalizeMatchVerification(undefined, 'verified')).toBe('verified');
  });

  it('defaults to pending when nothing indicates otherwise', () => {
    expect(normalizeMatchVerification(undefined, undefined)).toBe('pending');
  });
});

describe('normalizeChallengeStatus', () => {
  it('maps the display value back to the stored one', () => {
    expect(normalizeChallengeStatus('Active')).toBe('in_progress');
    expect(normalizeChallengeStatus('Achieved')).toBe('achieved');
    expect(normalizeChallengeStatus('Failed')).toBe('not_achieved');
  });
});

describe('a normalized record is safe for a strict comparison', () => {
  it('is the regression that motivated the change', () => {
    const stored = { status: 'verified', verificationStatus: 'verified' };
    const normalized = {
      status: normalizeMatchStatus(stored.status),
      verificationStatus: normalizeMatchVerification(stored.verificationStatus, stored.status),
    };
    expect(isOfficialMatch(normalized)).toBe(true);
  });

  it('does not promote an unverified record just because it was played', () => {
    const stored = { status: 'verified', verificationStatus: 'pending' };
    const normalized = {
      status: normalizeMatchStatus(stored.status),
      verificationStatus: normalizeMatchVerification(stored.verificationStatus, stored.status),
    };
    expect(normalized.status).toBe('completed');
    expect(isOfficialMatch(normalized)).toBe(false);
  });
});

describe('labels', () => {
  it('render human wording without leaking canonical values', () => {
    expect(matchLabel('scheduled')).toBe('Upcoming');
    expect(matchLabel('completed')).toBe('Completed');
    expect(verificationLabel('verified')).toBe('Verified');
    expect(challengeLabel('in_progress')).toBe('In progress');
  });
});

describe('still to play, as a question about time', () => {
  const now = Date.parse('2026-08-30T12:00:00.000Z');

  it('excludes a scheduled fixture whose kickoff has passed', () => {
    // The failure this guards. Every Upcoming list on the platform sorts earliest-first, so a
    // season abandoned in April put its oldest missed fixture at the top of "what is next".
    expect(isStillToPlay({ status: 'scheduled', scheduledAt: '2026-04-11T15:00:00.000Z' }, now))
      .toBe(false);
  });

  it('includes a scheduled fixture still ahead', () => {
    expect(isStillToPlay({ status: 'scheduled', scheduledAt: '2026-09-05T15:00:00.000Z' }, now))
      .toBe(true);
  });

  it('includes a live match whatever its kickoff says', () => {
    expect(isStillToPlay({ status: 'live', scheduledAt: '2026-04-04T15:00:00.000Z' }, now))
      .toBe(true);
  });

  it('excludes anything already played or called off', () => {
    expect(isStillToPlay({ status: 'completed', scheduledAt: '2026-09-05T15:00:00.000Z' }, now))
      .toBe(false);
    expect(isStillToPlay({ status: 'cancelled', scheduledAt: '2026-09-05T15:00:00.000Z' }, now))
      .toBe(false);
  });

  it('keeps a fixture with an unreadable date visible', () => {
    // A broken date is a data problem. Hiding it from every list is how it stays one.
    expect(isStillToPlay({ status: 'scheduled', scheduledAt: 'not a date' }, now)).toBe(true);
  });

  it('still answers the status question separately', () => {
    // isUpcomingMatch has not changed meaning: a card still needs to know whether to draw a
    // fixture or a result, and a missed fixture is still not a result.
    expect(isUpcomingMatch({ status: 'scheduled' })).toBe(true);
  });
});
