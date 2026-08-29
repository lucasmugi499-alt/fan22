import { describe, expect, it } from 'vitest';
import {
  buildAccessIndexDocuments,
  canCreateAthleteInScope,
  canManageTeamInScope,
  canSubmitResultInScope,
  createAccessContext,
  type AccessAssignment,
} from '@/lib/auth/access';

/**
 * What a retired Team Admin may do, asserted against the authority model rather than the UI.
 *
 * ## The defect
 *
 * ADR-004 retired Team Admin as an account class and the deployed environments run
 * `GOALPLACE_TEAM_AUTHORITY_STAGE=retired`, which versions the team bundles to zero
 * capabilities. The console kept rendering every write control anyway. Sign-in routed
 * `team_admin` accounts straight into it, the nav offered six destinations, and global search
 * advertised two of its actions — so a club official was two clicks from a full set of buttons
 * that every one of them failed.
 *
 * A sunset banner had been added at the layout level, which made it worse rather than better:
 * the page said "read-only" and then offered a working Save button. A control that contradicts
 * the notice above it is a control that lies twice.
 *
 * ## What is asserted here
 *
 * The capability index, because that is what `useTeamConsoleAccess` reads and what the server
 * and Firestore Rules read. A test against the rendered component would prove the buttons are
 * hidden today; this proves they are hidden FOR THE RIGHT REASON, and would fail if the
 * retirement were ever quietly undone.
 */

const now = '2026-08-29T12:00:00.000Z';

function assignment(overrides: Partial<AccessAssignment> = {}): AccessAssignment {
  return {
    id: 'assignment_1',
    userId: 'user_1',
    roleKey: 'team_admin',
    scopeType: 'team',
    scopeId: 'team_a',
    permissionBundleId: 'full_team_admin',
    status: 'active',
    grantedByUserId: 'league_admin_1',
    validFrom: '2026-01-01T00:00:00.000Z',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function contextFor(assignments: AccessAssignment[], stage: 'active' | 'frozen' | 'retired') {
  return createAccessContext({ userId: 'user_1', assignments, updatedAt: now, stage });
}

describe('a team admin once the bundles are retired', () => {
  const retired = () => contextFor([assignment()], 'retired');

  it('holds no team management capability', () => {
    expect(canManageTeamInScope(retired(), 'team_a')).toBe(false);
  });

  it('cannot register an athlete onto its own club', () => {
    expect(canCreateAthleteInScope(retired(), 'team_a')).toBe(false);
  });

  it('cannot submit a result for its own club', () => {
    // The one an investor is most likely to be shown: "can you show me how a club submits a
    // result?" Two clicks from the demo login screen.
    expect(canSubmitResultInScope(retired(), 'match_1', 'team_a')).toBe(false);
  });

  it('projects an assignment record that grants nothing, rather than deleting it', () => {
    // Retire authority, preserve history. The 100 team assignments on demo survive the
    // migration with zero capabilities so the audit trail still says who ran which club.
    const indexes = buildAccessIndexDocuments({
      assignments: [assignment()], accessVersion: 1, updatedAt: now, stage: 'retired',
    });
    expect(indexes).toHaveLength(1);
    expect(indexes[0].capabilities).toEqual([]);
  });
});

describe('the stage is what decides, not the role', () => {
  it('grants the same assignment its capabilities while still active', () => {
    // Guarding the tests above: if the fixture were malformed, every assertion there would
    // pass for the wrong reason — a broken assignment grants nothing either.
    const active = buildAccessIndexDocuments({
      assignments: [assignment()], accessVersion: 1, updatedAt: now, stage: 'active',
    });
    expect(active[0].capabilities.length).toBeGreaterThan(0);
    expect(active[0].capabilities).toContain('team.result.submit');
  });

  it('still grants during the drain window, so live workflows are not stranded', () => {
    // `frozen` exists because retiring authority mid-workflow strands an open claim awaiting
    // its opponent. Freezing issuance and retiring authority are separate steps.
    const frozen = buildAccessIndexDocuments({
      assignments: [assignment()], accessVersion: 1, updatedAt: now, stage: 'frozen',
    });
    expect(frozen[0].capabilities.length).toBeGreaterThan(0);
  });
});

describe('a league operator reaching the same screens', () => {
  /**
   * The reason the console is kept rather than redirected, and the reason the sunset banner
   * does not claim the page is read-only for everyone: someone holding league authority over
   * this club can legitimately write here, on these same screens, with no special case.
   */
  const leagueAssignment = assignment({
    id: 'assignment_league',
    roleKey: 'league_admin',
    scopeType: 'league',
    scopeId: 'league_1',
    permissionBundleId: 'league_admin',
  });

  it('is unaffected by the team authority retirement', () => {
    const indexes = buildAccessIndexDocuments({
      assignments: [leagueAssignment], accessVersion: 1, updatedAt: now, stage: 'retired',
    });
    // Only TEAM bundles are zeroed. `projectScopeIndex` checks the BUNDLE rather than the
    // stage alone, which is what keeps every other scope working through the migration.
    expect(indexes[0].capabilities.length).toBeGreaterThan(0);
  });

  it('can still manage a club in its own league', () => {
    const context = createAccessContext({
      userId: 'user_1',
      assignments: [leagueAssignment],
      updatedAt: now,
      stage: 'retired',
      // How a team resolves to its league, which is what the league-first checks walk.
      teamLeagueIds: { team_a: 'league_1' },
    });
    expect(canManageTeamInScope(context, 'team_a')).toBe(true);
  });
});
