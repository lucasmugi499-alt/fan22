import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import type { AuthenticatedActor } from '@/server/api/security';
import { securePlatformCommand } from './securePlatformCommand';

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
