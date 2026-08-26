import { describe, expect, it } from 'vitest';
import {
  bindReportToEvents,
  candidateIdFor,
  computeEventDigest,
  verifyReportBinding,
} from './digest';

function event(overrides: Partial<Parameters<typeof computeEventDigest>[0][number]> = {}) {
  return {
    eventId: 'match_1_e1',
    eventType: 'football.goal',
    teamId: 'team_home',
    athleteId: 'athlete_1',
    gameClockMs: 480_000,
    status: 'active',
    ...overrides,
  };
}

describe('an attested report is bound to an exact event set', () => {
  it('produces the same digest regardless of arrival order', () => {
    // Two devices replaying the same queue can deliver in different orders. Arrival order is a
    // property of the network, not of the match.
    const a = [event({ eventId: 'e1' }), event({ eventId: 'e2' }), event({ eventId: 'e3' })];
    const b = [a[2], a[0], a[1]];

    expect(computeEventDigest(a)).toBe(computeEventDigest(b));
  });

  it('changes when an event is added', () => {
    const before = computeEventDigest([event({ eventId: 'e1' })]);
    const after = computeEventDigest([event({ eventId: 'e1' }), event({ eventId: 'e2' })]);

    expect(after).not.toBe(before);
  });

  /**
   * The failure a score comparison cannot see.
   *
   * Reattributing a goal from one athlete to another leaves the total identical and changes
   * whose career record it lands on. The binding is over content precisely so this is caught.
   */
  it('changes when a goal is reattributed, though the score does not move', () => {
    const before = computeEventDigest([event({ athleteId: 'athlete_1' })]);
    const after = computeEventDigest([event({ athleteId: 'athlete_2' })]);

    expect(after).not.toBe(before);
  });

  it('changes when an event is superseded', () => {
    // Superseding does not remove the event, so the ids are identical. A set with a superseded
    // goal and a set where that goal is still active are not the same record.
    const before = computeEventDigest([event({ status: 'active' })]);
    const after = computeEventDigest([event({ status: 'superseded' })]);

    expect(after).not.toBe(before);
  });

  it('changes when a basketball basket changes value', () => {
    const two = computeEventDigest([event({ eventType: 'basketball.points', payload: { value: 2 } })]);
    const three = computeEventDigest([event({ eventType: 'basketball.points', payload: { value: 3 } })]);

    expect(three).not.toBe(two);
  });

  it('changes when an event moves on the clock', () => {
    expect(computeEventDigest([event({ gameClockMs: 1 })]))
      .not.toBe(computeEventDigest([event({ gameClockMs: 2 })]));
  });

  it('accepts an unchanged set', () => {
    const events = [event({ eventId: 'e1' }), event({ eventId: 'e2' })];
    const attested = bindReportToEvents(events, 2);

    expect(verifyReportBinding(attested, bindReportToEvents(events, 2))).toEqual({ matches: true });
  });

  /**
   * A correction supersedes one event and appends its replacement, which leaves the count higher
   * by exactly one. A count check would read that as "one new event" and pass, or as a plain
   * append and pass. Only the digest sees that the record itself changed.
   */
  it('refuses a set that changed by correction, which a count check would miss', () => {
    const attested = bindReportToEvents([event({ eventId: 'e1' })], 1);
    const corrected = bindReportToEvents(
      [event({ eventId: 'e1', status: 'superseded' }), event({ eventId: 'e2', athleteId: 'athlete_2' })],
      3,
    );

    const verdict = verifyReportBinding(attested, corrected);

    expect(verdict.matches).toBe(false);
    expect(verdict.matches === false && verdict.reason).toBe('event_set_changed');
  });

  it('refuses a late event arriving after attestation', () => {
    const attested = bindReportToEvents([event({ eventId: 'e1' })], 1);
    const late = bindReportToEvents([event({ eventId: 'e1' }), event({ eventId: 'e_late' })], 2);

    expect(verifyReportBinding(attested, late).matches).toBe(false);
  });

  it('counts every event, not only the active ones', () => {
    // The binding is over the whole stream. A superseded event is part of what was attested to.
    expect(bindReportToEvents([event({ status: 'active' }), event({ eventId: 'e2', status: 'superseded' })], 2))
      .toMatchObject({ eventCount: 2, eventStreamVersion: 2 });
  });
});

describe('a candidate id always means one set of claims', () => {
  it('carries the source version', () => {
    expect(candidateIdFor({ sourceType: 'field_capture', sourceRecordId: 'report_381', sourceVersion: 4 }))
      .toBe('field_capture:report_381:v4');
  });

  /**
   * Without the version, the same id would name a changing thing: re-attest after a late event
   * and a retry could not tell whether it was replaying its own work or committing somebody
   * else's.
   */
  it('gives a re-attested report a different id', () => {
    const v4 = candidateIdFor({ sourceType: 'field_capture', sourceRecordId: 'r1', sourceVersion: 4 });
    const v5 = candidateIdFor({ sourceType: 'field_capture', sourceRecordId: 'r1', sourceVersion: 5 });

    expect(v5).not.toBe(v4);
  });

  it('separates sources that share a record id', () => {
    // Both matchReports and resultSubmissions key on the matchId.
    expect(candidateIdFor({ sourceType: 'field_capture', sourceRecordId: 'm1', sourceVersion: 1 }))
      .not.toBe(candidateIdFor({ sourceType: 'legacy_team_submission', sourceRecordId: 'm1', sourceVersion: 1 }));
  });
});
