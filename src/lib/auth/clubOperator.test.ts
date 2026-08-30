import { describe, expect, it } from 'vitest';
import {
  DEPRECATED_CAPABILITIES,
  PERMISSION_BUNDLES,
  capabilitiesForAssignment,
  isIssuableBundle,
  issuableCapabilities,
  type PermissionCapability,
} from './access';

/**
 * ADR-005 restores club operations. ADR-004 was right about the AUTHORITY Team Admin held — a
 * club could write its own roster, submit a result and confirm its opponent's — and wrong about
 * the club having no operational identity at all.
 *
 * The line this must hold: every club capability writes a PROPOSAL or a piece of EVIDENCE, and
 * none of them writes anything official.
 */

const CLUB = PERMISSION_BUNDLES.find((bundle) => bundle.id === 'club_operations')!;

describe('the club operations bundle', () => {
  it('exists and is issuable', () => {
    expect(CLUB).toBeDefined();
    // Not in RETIRING_TEAM_CAPABILITIES, so the V1 drain stage does not gate it.
    expect(isIssuableBundle(CLUB, 'retired')).toBe(true);
  });

  it('does not reuse the retired authority key', () => {
    /*
     * The collision that made this necessary: `capabilitiesForAssignment` resolves by
     * `permissionBundleId` and falls back to the FIRST bundle whose roleKey matches. Reusing
     * `team_admin` would hand these capabilities to any historical assignment with an
     * unrecognised bundle id, decided by array order.
     */
    expect(CLUB.roleKey).toBe('club_operator');
  });

  it('grants nothing that was retired', () => {
    for (const capability of CLUB.capabilities) {
      expect(DEPRECATED_CAPABILITIES).not.toHaveProperty(capability);
    }
  });

  it('every capability it grants may actually be issued', () => {
    expect(issuableCapabilities(CLUB.capabilities)).toEqual(CLUB.capabilities);
  });

  it('carries no league or platform authority', () => {
    // "Never administer the league" is enforced by there being nothing to administer it with.
    for (const capability of CLUB.capabilities) {
      expect(capability.startsWith('team.')).toBe(true);
    }
  });

  it('carries nothing that could author an official result', () => {
    const forbidden: PermissionCapability[] = [
      'league.result.enter', 'league.result.resolve', 'league.match.takeover',
      'team.result.submit', 'team.result.confirm',
    ];
    for (const capability of forbidden) {
      expect(CLUB.capabilities).not.toContain(capability);
    }
  });

  it('carries nothing that writes athlete registration directly', () => {
    // Roster is propose-only: a club edits a draft and submits it, the league confirms or
    // returns it. A club that could write registration could manufacture eligibility.
    expect(CLUB.capabilities).not.toContain('league.roster.manage');
    expect(CLUB.capabilities).not.toContain('team.roster.manage');
    expect(CLUB.capabilities).toContain('team.roster.propose');
  });

  it('cannot propagate its own authority', () => {
    // Deferred for beta: the League assigns every Club Operator. A club inviting another club
    // admin propagates authority without league oversight.
    expect(CLUB.capabilities.some((capability) => capability.includes('invite'))).toBe(false);
    expect(CLUB.capabilities.some((capability) => capability.includes('staff'))).toBe(false);
  });
});

describe('the resolution collision the new key avoids', () => {
  it('leaves a retired team assignment granting nothing', () => {
    // The exact shape that would have picked up the new bundle by roleKey fallback.
    expect(capabilitiesForAssignment(
      { permissionBundleId: 'full_team_admin', roleKey: 'team_admin' },
      'retired',
    )).toEqual([]);
  });

  it('leaves an assignment with an unrecognised bundle id granting nothing', () => {
    expect(capabilitiesForAssignment(
      { permissionBundleId: 'bundle_that_no_longer_exists', roleKey: 'team_admin' },
      'retired',
    )).toEqual([]);
  });

  it('grants club operations only to an assignment that actually names it', () => {
    expect(capabilitiesForAssignment(
      { permissionBundleId: 'club_operations', roleKey: 'club_operator' },
      'retired',
    )).toEqual(CLUB.capabilities);
  });
});
