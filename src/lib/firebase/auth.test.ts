import { describe, expect, it } from 'vitest';
import { resolveTrustedRole } from './auth';

describe('resolveTrustedRole', () => {
  it('allows a self-service fan profile without a custom claim', () => {
    expect(resolveTrustedRole(null, 'fan')).toBe('fan');
  });

  it('requires a trusted claim for every privileged role', () => {
    for (const role of ['athlete', 'team_admin', 'league_admin', 'platform_admin', 'super_admin'] as const) {
      expect(resolveTrustedRole(null, role)).toBeNull();
      expect(resolveTrustedRole(role, role)).toBe(role);
    }
  });

  it('does not accept unknown claims', () => {
    expect(resolveTrustedRole('owner', 'league_admin')).toBeNull();
  });
});
