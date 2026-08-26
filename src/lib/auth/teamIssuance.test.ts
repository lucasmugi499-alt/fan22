import { describe, expect, it } from 'vitest';
import {
  PERMISSION_BUNDLES,
  RETIRING_TEAM_CAPABILITIES,
  isIssuableBundle,
  issuableCapabilities,
  LEAGUE_ADMIN_CAPABILITIES,
  type PermissionCapability,
} from './access';

const TEAM_BUNDLE_IDS = Object.keys(RETIRING_TEAM_CAPABILITIES);
const TEAM_CAPABILITIES = [...new Set(Object.values(RETIRING_TEAM_CAPABILITIES).flat())];

/**
 * Workstream 7's standing proof: no path issues Team Admin, at any stage from `frozen` onward.
 *
 * Asserted against the access model rather than against a hidden button, because a UI that
 * merely does not render a control is one component away from rendering it again, and the
 * server is what actually decides.
 */
describe('Team Admin issuance is closed', () => {
  it.each(TEAM_BUNDLE_IDS)('refuses to issue %s once frozen', (bundleId) => {
    const bundle = PERMISSION_BUNDLES.find((entry) => entry.id === bundleId)!;

    expect(isIssuableBundle(bundle, 'frozen')).toBe(false);
    expect(isIssuableBundle(bundle, 'retired')).toBe(false);
  });

  it.each(TEAM_CAPABILITIES)('never offers %s to a new assignment', (capability) => {
    expect(issuableCapabilities([capability as PermissionCapability])).toEqual([]);
  });

  /**
   * Invariant 15. Granting a League Admin `team.roster.manage` would work, and it would encode
   * into the access model the claim that a League Admin is pretending to be every Team Admin.
   * The architecture is that the League governs its teams, and in five years the names are the
   * only surviving explanation of which was meant.
   */
  it('never smuggles a team capability into the League bundle', () => {
    expect(LEAGUE_ADMIN_CAPABILITIES.filter((capability) => capability.startsWith('team.'))).toEqual([]);
  });

  it('still issues every bundle that is not being retired', () => {
    // The freeze is narrow. A change that stopped issuing league or athlete bundles would be a
    // far worse bug than the one being prevented, and it would look like success.
    const issuable = PERMISSION_BUNDLES
      .filter((bundle) => !TEAM_BUNDLE_IDS.includes(bundle.id))
      .filter((bundle) => isIssuableBundle(bundle, 'frozen'));

    expect(issuable.length).toBeGreaterThan(0);
    expect(issuable.some((bundle) => bundle.id === 'league_admin')).toBe(true);
    expect(issuable.some((bundle) => bundle.id === 'athlete_self')).toBe(true);
  });

  it('keeps the historical capability lists intact for interpretation', () => {
    // Retired, not deleted. Hundreds of historical assignments and audit events reference these
    // names, and a record whose capability list no longer exists is a record nobody can read.
    expect(RETIRING_TEAM_CAPABILITIES.full_team_admin).toContain('team.result.submit');
    expect(TEAM_CAPABILITIES.length).toBeGreaterThan(5);
  });
});
