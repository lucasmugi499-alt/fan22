import { describe, expect, it } from 'vitest';
import { decideCapturePolicyFloorChange } from './capturePolicyFloor';

describe('capture policy floor change', () => {
  it('allows a version-matched tightening without rewriting existing fixtures', () => {
    expect(decideCapturePolicyFloorChange({
      current: 'POST_MATCH_ALLOWED', proposed: 'FIELD_PREFERRED', expectedVersion: 3, actualVersion: 3,
    })).toEqual({
      allowed: true,
      current: 'POST_MATCH_ALLOWED',
      proposed: 'FIELD_PREFERRED',
      nextVersion: 4,
      existingFixturesChange: false,
    });
  });

  it('refuses stale previews and attempts to loosen the floor', () => {
    expect(decideCapturePolicyFloorChange({ current: 'FIELD_PREFERRED', proposed: 'FIELD_REQUIRED', expectedVersion: 2, actualVersion: 3 })).toMatchObject({ allowed: false, reason: expect.stringContaining('changed') });
    expect(decideCapturePolicyFloorChange({ current: 'FIELD_REQUIRED', proposed: 'POST_MATCH_ALLOWED', expectedVersion: 3, actualVersion: 3 })).toMatchObject({ allowed: false, reason: expect.stringContaining('cannot loosen') });
  });
});
