import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { recordAccessDivergence } from './securityEvents';
import { compareLegacyCapability, hasCapability, hasCapabilityOrPlatformGrant } from './capabilities';

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

describe('compareLegacyCapability', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a legacy_broader divergence when the canonical assignment is gone', async () => {
    installIndexes({});

    const decision = await compareLegacyCapability({
      userId: 'user_1',
      scope: { scopeType: 'league', scopeId: 'league_1' },
      capability: 'league.profile.manage',
      legacyGranted: true,
      resource: 'leagues/league_1',
      requestId: 'req_1',
    });

    // Stage A still enforces legacy, so access is preserved — but the disagreement is
    // now on record. This population must reach zero before the legacy arm is removed.
    expect(decision.granted).toBe(true);
    expect(decision.canonical).toBe(false);
    expect(decision.diverged).toBe(true);
    expect(recordAccessDivergence).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      scopeType: 'league',
      scopeId: 'league_1',
      capability: 'league.profile.manage',
      legacyDecision: true,
      assignmentDecision: false,
    }));
  });

  it('records the opposite divergence when only the canonical assignment grants access', async () => {
    installIndexes({ league_league_1_user_1: { capabilities: ['league.profile.manage'] } });

    const decision = await compareLegacyCapability({
      userId: 'user_1',
      scope: { scopeType: 'league', scopeId: 'league_1' },
      capability: 'league.profile.manage',
      legacyGranted: false,
    });

    expect(decision.granted).toBe(true);
    expect(recordAccessDivergence).toHaveBeenCalledWith(expect.objectContaining({
      legacyDecision: false,
      assignmentDecision: true,
    }));
  });

  it('records nothing when both authorities agree', async () => {
    installIndexes({ league_league_1_user_1: { capabilities: ['league.profile.manage'] } });

    const decision = await compareLegacyCapability({
      userId: 'user_1',
      scope: { scopeType: 'league', scopeId: 'league_1' },
      capability: 'league.profile.manage',
      legacyGranted: true,
    });

    expect(decision.diverged).toBe(false);
    expect(recordAccessDivergence).not.toHaveBeenCalled();
  });

  it('denies when both authorities deny', async () => {
    installIndexes({});

    const decision = await compareLegacyCapability({
      userId: 'user_1',
      scope: { scopeType: 'league', scopeId: 'league_1' },
      capability: 'league.profile.manage',
      legacyGranted: false,
    });

    expect(decision.granted).toBe(false);
    expect(recordAccessDivergence).not.toHaveBeenCalled();
  });
});
