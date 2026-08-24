import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isPrincipal,
  principalFromEvent,
  principalId,
  provenanceQuad,
  userPrincipal,
} from '@/kernel/principal';
import {
  COMMON_REQUIRED_FIELDS,
  VERSION_REQUIRED_FIELDS,
  validateOfficialEventShape,
} from '@/kernel/validators/officialEventGuard';

/** A complete event at the version under test, so each case changes exactly one thing. */
function officialEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match_1_v1_event_0001',
    eventType: 'football.goal',
    eventSchemaVersion: '1.0.0',
    sportDefinitionVersion: '1.0.0',
    sportId: 'football',
    competitionId: 'league_1',
    seasonId: 'season_1',
    matchId: 'match_1',
    sequence: 1,
    payload: { value: 1, source: 'result_submission_scorer' },
    sourceClaimId: 'match_1',
    submittedByUserId: 'user_9',
    officialResultVersion: 1,
    officialEventVersion: 1,
    verificationStatus: 'official',
    idempotencyKey: 'match_1:v1:event:1',
    createdAt: '2026-08-24T12:00:00.000Z',
    finalizedAt: '2026-08-24T12:00:00.000Z',
    ...overrides,
  };
}

describe('the generalized actor', () => {
  it('reads a 1.0.0 event back as a user principal, without rewriting it', () => {
    const event = officialEvent();

    expect(validateOfficialEventShape(event)).toEqual({ status: 'valid', issues: [] });
    expect(principalFromEvent(event)).toEqual({ principalType: 'user', userId: 'user_9' });
    // The point of the dual-version reader: nothing about the stored document changed.
    expect(event).not.toHaveProperty('sourcePrincipal');
  });

  it('accepts a 2.0.0 event from a match ops session that has no user id at all', () => {
    const event = officialEvent({
      eventSchemaVersion: '2.0.0',
      submittedByUserId: undefined,
      sourcePrincipal: {
        principalType: 'match_ops_session',
        matchSessionId: 'mos_412',
        fieldManagerAssignmentId: 'fma_2388',
        displayLabel: 'Joseph K.',
      },
    });

    expect(validateOfficialEventShape(event)).toEqual({ status: 'valid', issues: [] });
    expect(event.submittedByUserId).toBeUndefined();
    expect(principalId(principalFromEvent(event)!)).toBe('mos_412');
  });

  it('refuses a 2.0.0 event that names no author', () => {
    const verdict = validateOfficialEventShape(
      officialEvent({ eventSchemaVersion: '2.0.0', submittedByUserId: undefined }),
    );

    expect(verdict.status).toBe('blocked');
    expect(verdict.issues).toContain('Official events at schema 2.0.0 require sourcePrincipal.');
  });

  it('refuses a 1.0.0 event that names no author, which is the rule that already existed', () => {
    const verdict = validateOfficialEventShape(officialEvent({ submittedByUserId: undefined }));

    expect(verdict.status).toBe('blocked');
    expect(verdict.issues).toContain('Official events at schema 1.0.0 require submittedByUserId.');
  });

  it('refuses an unknown schema version rather than guessing which rules apply', () => {
    expect(validateOfficialEventShape(officialEvent({ eventSchemaVersion: '3.0.0' })).status).toBe(
      'blocked',
    );
  });

  it('refuses a principal shape it does not recognise', () => {
    const verdict = validateOfficialEventShape(
      officialEvent({
        eventSchemaVersion: '2.0.0',
        submittedByUserId: undefined,
        sourcePrincipal: { principalType: 'field_manager', name: 'Joseph' },
      }),
    );

    expect(verdict.status).toBe('blocked');
    expect(verdict.issues).toContain('sourcePrincipal is not a recognised principal.');
  });

  it('returns null for a record that is neither shape, rather than blaming the system', () => {
    expect(principalFromEvent({})).toBeNull();
    expect(principalFromEvent({ submittedByUserId: '' })).toBeNull();
  });

  it('rejects malformed principals structurally', () => {
    expect(isPrincipal({ principalType: 'user', userId: 'u1' })).toBe(true);
    expect(isPrincipal({ principalType: 'user', userId: '' })).toBe(false);
    expect(isPrincipal({ principalType: 'system', component: 'finalizer' })).toBe(true);
    expect(isPrincipal({ principalType: 'match_ops_session', matchSessionId: 'm1' })).toBe(false);
    expect(isPrincipal({ principalType: 'user', userId: 'u1', displayLabel: 7 })).toBe(false);
    expect(isPrincipal(null)).toBe(false);
  });

  it('flattens a principal into the provenance quad without losing which kind it was', () => {
    expect(
      provenanceQuad({
        sourceType: 'legacy_team_submission',
        sourceRecordId: 'match_1',
        principal: userPrincipal('user_9'),
      }),
    ).toEqual({
      sourceType: 'legacy_team_submission',
      sourceRecordId: 'match_1',
      sourcePrincipalType: 'user',
      sourcePrincipalId: 'user_9',
    });
  });
});

/**
 * The schema files are the published contract and nothing loads them at run time. This is
 * what keeps the contract and the guard that actually runs from drifting apart, which is the
 * failure mode that made the 1.0.0 `required` array meaningless in the first place.
 */
describe('the guard agrees with the published schemas', () => {
  const schemaDir = path.join(process.cwd(), 'src/kernel/schemas');

  function requiredFrom(file: string): string[] {
    return JSON.parse(readFileSync(path.join(schemaDir, file), 'utf8')).required;
  }

  it('matches official-event.schema.json at 1.0.0', () => {
    expect(new Set(requiredFrom('official-event.schema.json'))).toEqual(
      new Set([...COMMON_REQUIRED_FIELDS, ...VERSION_REQUIRED_FIELDS['1.0.0']]),
    );
  });

  it('matches official-event.schema.2.0.0.json', () => {
    expect(new Set(requiredFrom('official-event.schema.2.0.0.json'))).toEqual(
      new Set([...COMMON_REQUIRED_FIELDS, ...VERSION_REQUIRED_FIELDS['2.0.0']]),
    );
  });

  it('leaves the 1.0.0 schema requiring submittedByUserId, because it is immutable', () => {
    expect(requiredFrom('official-event.schema.json')).toContain('submittedByUserId');
    expect(requiredFrom('official-event.schema.2.0.0.json')).not.toContain('submittedByUserId');
  });
});
