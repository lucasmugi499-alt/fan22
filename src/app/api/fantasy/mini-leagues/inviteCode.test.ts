import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/**
 * Mirrors the route's hashing so the stored-credential property is pinned independently
 * of Firestore wiring. If these diverge, the join lookup stops matching and the failure
 * is loud rather than silent.
 */
function inviteCodeHash(code: string) {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

describe('mini-league invite codes', () => {
  it('produces the same hash regardless of case or surrounding whitespace', () => {
    // Members paste codes from chat; the lookup must tolerate that without storing the
    // plaintext to compare against.
    expect(inviteCodeHash(' a1b2c3d4e5 ')).toBe(inviteCodeHash('A1B2C3D4E5'));
  });

  it('does not reveal the code', () => {
    const hash = inviteCodeHash('A1B2C3D4E5');

    expect(hash).not.toContain('A1B2C3D4E5');
    expect(hash).toHaveLength(64);
  });

  it('separates different codes', () => {
    expect(inviteCodeHash('A1B2C3D4E5')).not.toBe(inviteCodeHash('A1B2C3D4E6'));
  });
});
