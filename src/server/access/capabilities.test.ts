import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { recordAccessDivergence } from './securityEvents';
import { authorizeCapability, hasCapability, hasCapabilityOrPlatformGrant, indexGrantsCapability } from './capabilities';

vi.mock('server-only', () => ({}));

vi.mock('./securityEvents', () => ({
  recordAccessDivergence: vi.fn(async () => undefined),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(),
  },
}));

function installIndexes(indexes: Record<string, { capabilities?: string[] } | undefined>) {
  vi.mocked(adminDb.collection).mockImplementation(() => ({
    doc: (id: string) => ({
      get: vi.fn(async () => ({
        exists: Boolean(indexes[id]),
        data: () => indexes[id],
      })),
    }),
  }) as never);
}

describe('hasCapability', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grants when the scope projection lists the capability', async () => {
    installIndexes({ team_team_1_user_1: { capabilities: ['team.roster.manage'] } });

    await expect(hasCapability('user_1', { scopeType: 'team', scopeId: 'team_1' }, 'team.roster.manage'))
      .resolves.toBe(true);
  });

  it('denies when the projection is missing entirely', async () => {
    installIndexes({});

    // A deleted projection is how revocation takes effect, so absence must deny.
    await expect(hasCapability('user_1', { scopeType: 'team', scopeId: 'team_1' }, 'team.roster.manage'))
      .resolves.toBe(false);
  });

  it('denies a capability the projection does not list', async () => {
    installIndexes({ team_team_1_user_1: { capabilities: ['team.result.submit'] } });

    await expect(hasCapability('user_1', { scopeType: 'team', scopeId: 'team_1' }, 'team.roster.manage'))
      .resolves.toBe(false);
  });

  it('does not let one user read another scope holder\'s grant', async () => {
    installIndexes({ team_team_1_user_2: { capabilities: ['team.roster.manage'] } });

    await expect(hasCapability('user_1', { scopeType: 'team', scopeId: 'team_1' }, 'team.roster.manage'))
      .resolves.toBe(false);
  });
});

describe('hasCapabilityOrPlatformGrant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a platform-global grant for an organization scope', async () => {
    installIndexes({ platform_global_user_1: { capabilities: ['platform.admin.manage'] } });

    await expect(hasCapabilityOrPlatformGrant('user_1', { scopeType: 'league', scopeId: 'league_1' }, 'league.profile.manage'))
      .resolves.toBe(true);
  });

  it('denies when neither the scope nor the platform projection grants it', async () => {
    installIndexes({ platform_global_user_1: { capabilities: ['platform.audit.read'] } });

    await expect(hasCapabilityOrPlatformGrant('user_1', { scopeType: 'league', scopeId: 'league_1' }, 'league.profile.manage'))
      .resolves.toBe(false);
  });
});

describe('authorizeCapability', () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * The regression this file exists to prevent. Before the Stage C cutover this case
   * returned `granted: true`, because a stale `adminUserIds` entry was OR'd into the
   * decision and the Admin SDK bypasses the Firestore Rules that would have denied it.
   */
  it('DENIES when only the legacy field grants — legacy cannot authorize', async () => {
    installIndexes({});

    const decision = await authorizeCapability({
      userId: 'user_1',
      scope: { scopeType: 'league', scopeId: 'league_1' },
      capability: 'league.profile.manage',
      observedLegacyGrant: true,
      resource: 'leagues/league_1',
      requestId: 'req_1',
    });

    expect(decision.granted).toBe(false);
    expect(decision.diverged).toBe(true);
    // Denied, but not silently: the lockout is on record as a legacy_broader event.
    expect(recordAccessDivergence).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      scopeType: 'league',
      scopeId: 'league_1',
      capability: 'league.profile.manage',
      legacyDecision: true,
      assignmentDecision: false,
    }));
  });

  it('grants on the canonical assignment alone, with no legacy entry', async () => {
    installIndexes({ league_league_1_user_1: { capabilities: ['league.profile.manage'] } });

    const decision = await authorizeCapability({
      userId: 'user_1',
      scope: { scopeType: 'league', scopeId: 'league_1' },
      capability: 'league.profile.manage',
      observedLegacyGrant: false,
    });

    expect(decision.granted).toBe(true);
    expect(recordAccessDivergence).toHaveBeenCalledWith(expect.objectContaining({
      legacyDecision: false,
      assignmentDecision: true,
    }));
  });

  it('records nothing when both agree', async () => {
    installIndexes({ league_league_1_user_1: { capabilities: ['league.profile.manage'] } });

    const decision = await authorizeCapability({
      userId: 'user_1',
      scope: { scopeType: 'league', scopeId: 'league_1' },
      capability: 'league.profile.manage',
      observedLegacyGrant: true,
    });

    expect(decision.granted).toBe(true);
    expect(decision.diverged).toBe(false);
    expect(recordAccessDivergence).not.toHaveBeenCalled();
  });

  it('denies when neither grants', async () => {
    installIndexes({});

    const decision = await authorizeCapability({
      userId: 'user_1',
      scope: { scopeType: 'league', scopeId: 'league_1' },
      capability: 'league.profile.manage',
      observedLegacyGrant: false,
    });

    expect(decision.granted).toBe(false);
    expect(recordAccessDivergence).not.toHaveBeenCalled();
  });

  it('denies the capability the projection does not list, even with a legacy entry', async () => {
    installIndexes({ league_league_1_user_1: { capabilities: ['league.season.manage'] } });

    const decision = await authorizeCapability({
      userId: 'user_1',
      scope: { scopeType: 'league', scopeId: 'league_1' },
      capability: 'league.profile.manage',
      observedLegacyGrant: true,
    });

    // Exact scope + exact capability. Holding one capability in a scope is not authority
    // over the whole scope.
    expect(decision.granted).toBe(false);
  });
});

describe('capability spellings after the rebuild', () => {
  function index(capabilities: string[]) {
    return {
      capabilities,
      userId: 'user_1',
      scopeType: 'league',
      scopeId: 'league_1',
      updatedAt: '2026-08-25T00:00:00.000Z',
      accessVersion: 1,
    };
  }

  /**
   * What replaced the migration shim.
   *
   * `SUPERSEDED_CAPABILITY_EQUIVALENTS` let a stored pre-ADR-003 name satisfy the capability
   * that replaced it, so League Admins kept working between the deploy and the projection
   * rebuild. It was scaffolding with a stated deletion condition, that condition was met on
   * 2026-08-26, and it is gone.
   *
   * These tests are the inverse of the ones they replace. The old spellings must now be
   * refused, because a compatibility alias with no expiry becomes the authorization language:
   * two names for one permission make audits, revocation and Rules comparison permanently
   * non-deterministic.
   */
  it.each([
    ['league.team.manage', 'league.team.create'],
    ['league.roster.manage', 'league.roster.verify'],
    ['league.athlete.manage', 'league.roster.verify'],
    ['league.fixture.manage', 'league.season.manage'],
    ['league.result.enter', 'league.result.resolve'],
    ['league.match.takeover', 'league.result.resolve'],
    ['league.field_manager.manage', 'league.season.manage'],
  ] as const)('no longer satisfies %s from a stored %s', (asked, stored) => {
    expect(indexGrantsCapability(index([stored]), asked)).toBe(false);
  });

  it('satisfies a capability from its own canonical spelling', () => {
    expect(indexGrantsCapability(index(['league.athlete.manage']), 'league.athlete.manage')).toBe(true);
    expect(indexGrantsCapability(index(['league.team.manage']), 'league.team.manage')).toBe(true);
  });

  it('does not let an unrelated capability satisfy a league one', () => {
    expect(indexGrantsCapability(index(['league.notice.publish']), 'league.athlete.manage')).toBe(false);
    expect(indexGrantsCapability(index(['team.roster.manage']), 'league.roster.manage')).toBe(false);
    expect(indexGrantsCapability(index([]), 'league.team.manage')).toBe(false);
  });

  it('never resurrects a retired team capability', () => {
    expect(indexGrantsCapability(index(['league.roster.manage']), 'team.roster.manage')).toBe(false);
  });

  it('still refuses everything once the projection has expired', () => {
    // Expiry outranks everything: a lapsed projection grants nothing under any name.
    expect(indexGrantsCapability(
      { ...index(['league.athlete.manage']), expiresAtMillis: 1 },
      'league.athlete.manage',
      new Date('2026-08-25T00:00:00.000Z'),
    )).toBe(false);
  });
});
