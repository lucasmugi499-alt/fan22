import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import type { AuthenticatedActor } from '@/server/api/security';
import { secureLeagueCommand, securePlatformCommand } from './securePlatformCommand';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: vi.fn() },
}));

/**
 * Cover for the platform capability model.
 *
 * Until 2026-08-08 this guard exempted `super_admin` from the capability check entirely
 * and treated any `platform_admin` as satisfying every `requiredCapability`, so the
 * argument was decorative. These tests assert the inverse of that old behaviour: a role is
 * not a capability, for anyone.
 */
function installStore({
  profile,
  capabilities,
}: {
  profile: Record<string, unknown>;
  capabilities?: string[];
}) {
  vi.mocked(adminDb.collection).mockImplementation((name: string) => ({
    doc: () => ({
      get: vi.fn(async () =>
        name === 'users'
          ? { exists: true, data: () => profile }
          : { exists: Boolean(capabilities), data: () => (capabilities ? { capabilities } : undefined) },
      ),
    }),
  }) as never);
}

const operatorProfile = { accountClass: 'platform_operator', accountStatus: 'active' };

function actorWith(role: string): AuthenticatedActor {
  return { uid: 'user_1', role, accountClass: 'platform_operator' } as AuthenticatedActor;
}

async function run(role: string, capabilities: string[] | undefined, requiredCapability?: 'platform.admin.manage') {
  installStore({ profile: operatorProfile, capabilities });
  return securePlatformCommand({
    actor: actorWith(role),
    command: 'media.moderation.decide',
    requiredCapability,
    handler: async () => 'ran',
  });
}

describe('securePlatformCommand capability enforcement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs when the platform projection grants the capability', async () => {
    const outcome = await run('platform_admin', ['platform.admin.manage'], 'platform.admin.manage');
    expect(outcome).toEqual({ result: 'ran' });
  });

  it('DENIES a platform_admin who lacks the capability', async () => {
    // The regression. This previously ran the handler, because holding the role was
    // treated as holding every capability.
    const outcome = await run('platform_admin', ['platform.audit.read'], 'platform.admin.manage');
    expect(outcome).toHaveProperty('response');
    expect((outcome as { response: Response }).response.status).toBe(403);
  });

  it('DENIES a super_admin who lacks the capability', async () => {
    // Also a regression: super_admin used to skip the check entirely. Break-glass is a
    // capability in the bundle, not a role that bypasses authorization.
    const outcome = await run('super_admin', ['platform.audit.read'], 'platform.admin.manage');
    expect(outcome).toHaveProperty('response');
    expect((outcome as { response: Response }).response.status).toBe(403);
  });

  it('runs for a super_admin that holds the capability', async () => {
    const outcome = await run('super_admin', ['platform.admin.manage'], 'platform.admin.manage');
    expect(outcome).toEqual({ result: 'ran' });
  });

  it('denies when the platform projection is missing entirely', async () => {
    // Absence must deny: deleting the projection is how revocation takes effect.
    const outcome = await run('platform_admin', undefined, 'platform.admin.manage');
    expect(outcome).toHaveProperty('response');
    expect((outcome as { response: Response }).response.status).toBe(403);
  });

  it('skips the capability check when the command declares none', async () => {
    // Documents a real gap rather than endorsing it: several admin/actions commands pass
    // no requiredCapability, so they are gated only by role and account class.
    const outcome = await run('platform_admin', undefined, undefined);
    expect(outcome).toEqual({ result: 'ran' });
  });

  it('rejects a non-platform role before any capability lookup', async () => {
    installStore({ profile: operatorProfile, capabilities: ['platform.admin.manage'] });
    const outcome = await securePlatformCommand({
      actor: actorWith('league_admin'),
      command: 'media.moderation.decide',
      requiredCapability: 'platform.admin.manage',
      handler: async () => 'ran',
    });
    expect(outcome).toHaveProperty('response');
    expect((outcome as { response: Response }).response.status).toBe(403);
  });

  it('rejects a platform role held on a non-operator account', async () => {
    installStore({
      profile: { accountClass: 'fan', accountStatus: 'active' },
      capabilities: ['platform.admin.manage'],
    });
    const outcome = await securePlatformCommand({
      actor: { uid: 'user_1', role: 'platform_admin' } as AuthenticatedActor,
      command: 'media.moderation.decide',
      requiredCapability: 'platform.admin.manage',
      handler: async () => 'ran',
    });
    expect(outcome).toHaveProperty('response');
    expect((outcome as { response: Response }).response.status).toBe(403);
  });

  it('rejects a suspended operator account', async () => {
    installStore({
      profile: { accountClass: 'platform_operator', accountStatus: 'suspended' },
      capabilities: ['platform.admin.manage'],
    });
    const outcome = await securePlatformCommand({
      actor: actorWith('platform_admin'),
      command: 'media.moderation.decide',
      requiredCapability: 'platform.admin.manage',
      handler: async () => 'ran',
    });
    expect(outcome).toHaveProperty('response');
    expect((outcome as { response: Response }).response.status).toBe(403);
  });
});

/**
 * League commands used to skip authorization entirely for a platform role.
 *
 * `secureLeagueCommand` wrapped its capability check in `if (!isPlatformActor)`, so holding
 * platform_admin or super_admin let an actor run any league command against any league
 * without a capability anywhere. Being a platform operator is a scope, not a licence — the
 * same authority now has to be held as `platform.admin.manage`.
 */
describe('secureLeagueCommand authorizes platform actors too', () => {
  beforeEach(() => vi.clearAllMocks());

  function installLeague({
    accountClass,
    leagueCaps,
    platformCaps,
  }: {
    accountClass: string;
    leagueCaps?: string[];
    platformCaps?: string[];
  }) {
    vi.mocked(adminDb.collection).mockImplementation((name: string) => ({
      doc: (id: string) => ({
        get: vi.fn(async () => {
          if (name === 'users') {
            return { exists: true, data: () => ({ accountClass, accountStatus: 'active' }) };
          }
          if (name === 'leagues') {
            return { exists: true, data: () => ({ id, adminUserIds: [] }) };
          }
          // accessIndex
          const caps = String(id).startsWith('platform_') ? platformCaps : leagueCaps;
          return { exists: Boolean(caps), data: () => (caps ? { capabilities: caps } : undefined) };
        }),
      }),
    }) as never);
  }

  async function runLeague(role: string) {
    return secureLeagueCommand({
      actor: { uid: 'user_1', role, accountClass: 'platform_operator' } as AuthenticatedActor,
      command: 'league.update_identity',
      leagueId: 'league_1',
      requiredCapability: 'league.profile.manage',
      handler: async () => 'ran',
    });
  }

  it('DENIES a platform_admin holding no capability on the league or the platform', async () => {
    // The regression: this previously ran the handler purely because of the role.
    installLeague({ accountClass: 'platform_operator', leagueCaps: undefined, platformCaps: ['platform.audit.read'] });

    const outcome = await runLeague('platform_admin');

    expect(outcome).toHaveProperty('response');
    expect((outcome as { response: Response }).response.status).toBe(403);
  });

  it('DENIES a super_admin holding no capability either', async () => {
    installLeague({ accountClass: 'platform_operator', leagueCaps: undefined, platformCaps: [] });

    const outcome = await runLeague('super_admin');

    expect(outcome).toHaveProperty('response');
    expect((outcome as { response: Response }).response.status).toBe(403);
  });

  it('allows a platform actor through the platform-global grant', async () => {
    // The authority platform operators actually have, expressed as a capability rather
    // than an exemption — reviewable and revocable.
    installLeague({ accountClass: 'platform_operator', leagueCaps: undefined, platformCaps: ['platform.admin.manage'] });

    expect(await runLeague('platform_admin')).toEqual({ result: 'ran' });
  });

  it('allows a league operator holding the scoped capability', async () => {
    vi.mocked(adminDb.collection).mockImplementation((name: string) => ({
      doc: (id: string) => ({
        get: vi.fn(async () => {
          if (name === 'users') {
            return { exists: true, data: () => ({ accountClass: 'organization_operator', accountStatus: 'active' }) };
          }
          if (name === 'leagues') return { exists: true, data: () => ({ id, adminUserIds: [] }) };
          return String(id).startsWith('platform_')
            ? { exists: false, data: () => undefined }
            : { exists: true, data: () => ({ capabilities: ['league.profile.manage'] }) };
        }),
      }),
    }) as never);

    const outcome = await secureLeagueCommand({
      actor: { uid: 'user_1', role: 'league_admin', accountClass: 'organization_operator' } as AuthenticatedActor,
      command: 'league.update_identity',
      leagueId: 'league_1',
      requiredCapability: 'league.profile.manage',
      handler: async () => 'ran',
    });

    expect(outcome).toEqual({ result: 'ran' });
  });
});
