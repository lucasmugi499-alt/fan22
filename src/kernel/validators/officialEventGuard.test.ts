import { describe, expect, it } from 'vitest';
import type { FinalizationSourceType } from '../principal';
import { validateOfficialEventShape } from './officialEventGuard';

/**
 * The allowlist in this guard and `FinalizationSourceType` are the same vocabulary read at
 * different ends of the pipeline: one is what the finalizer can PRODUCE, the other is what may
 * be WRITTEN.
 *
 * They drifted the first time a new source was added. The ruling was sound, the candidate was
 * sound, and every official event of that result was refused on the way to disk with "require a
 * recognised payload sourceType" — a failure that surfaced only in an integration test, because
 * nothing but a real finalization writes official events.
 */

function officialEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match_1_v2_event_0001',
    eventType: 'football.goal',
    eventSchemaVersion: '2.1.0',
    sportDefinitionVersion: '1.0.0',
    sportId: 'football',
    competitionId: 'league_1',
    seasonId: 'season_1',
    matchId: 'match_1',
    sequence: 1,
    payload: { sourceType: 'field_capture' },
    sourcePrincipal: { principalType: 'user', userId: 'user_1' },
    sourceClaimId: 'claim_1',
    officialResultVersion: 2,
    officialEventVersion: 1,
    verificationStatus: 'official',
    idempotencyKey: 'match_1:claim_1:v2',
    createdAt: '2026-08-31T09:00:00.000Z',
    finalizedAt: '2026-08-31T09:00:00.000Z',
    ...overrides,
  };
}

describe('the fixture this file tests against', () => {
  it('is valid, so every rejection below is caused by the change it names', () => {
    expect(validateOfficialEventShape(officialEvent())).toEqual({ status: 'valid', issues: [] });
  });
});

describe('the event source vocabulary tracks the finalizer', () => {
  const FINALIZATION_SOURCE_TYPES: FinalizationSourceType[] = [
    'field_capture',
    'league_post_match',
    'legacy_team_submission',
    'platform_exception_resolution',
    'result_case',
  ];

  it('accepts an official event from every source the finalizer can produce', () => {
    for (const sourceType of FINALIZATION_SOURCE_TYPES) {
      const verdict = validateOfficialEventShape(officialEvent({ payload: { sourceType } }));
      expect(verdict.status, `sourceType ${sourceType}`).toBe('valid');
    }
  });

  it('refuses a source nobody defined', () => {
    expect(validateOfficialEventShape(officialEvent({
      payload: { sourceType: 'invented_by_a_caller' },
    })).status).toBe('blocked');
  });

  it('refuses a payload with no source at all', () => {
    expect(validateOfficialEventShape(officialEvent({ payload: {} })).status).toBe('blocked');
  });

  it('still refuses the overloaded field 2.1.0 replaced', () => {
    expect(validateOfficialEventShape(officialEvent({
      payload: { sourceType: 'result_case', source: 'field_manager' },
    })).status).toBe('blocked');
  });
});

describe('what an official event must always carry', () => {
  it('refuses one that is not official', () => {
    expect(validateOfficialEventShape(officialEvent({ verificationStatus: 'pending' })).status)
      .toBe('blocked');
  });

  it('refuses an unknown schema version rather than guessing', () => {
    expect(validateOfficialEventShape(officialEvent({ eventSchemaVersion: '9.9.9' })).status)
      .toBe('blocked');
  });

  it('still accepts a 1.0.0 event, because history is never rewritten to match a newer model', () => {
    const legacy = officialEvent({ eventSchemaVersion: '1.0.0', submittedByUserId: 'user_1' });
    delete (legacy as Record<string, unknown>).sourcePrincipal;
    expect(validateOfficialEventShape(legacy).status).toBe('valid');
  });
});
