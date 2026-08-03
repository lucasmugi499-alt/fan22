import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { adminAppCheck, adminAuth, adminDb } from '@/lib/firebase/admin';
import { allowingRateLimitTransaction, denyingRateLimitTransaction } from '@/test/rateLimitMock';
import {
  clientIpFrom,
  isFanAccountPrincipal,
  parseJsonBody,
  requireAuthenticatedMutation,
  requireSchedulerRequest,
  safeSecretEquals,
} from './security';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminAppCheck: { verifyToken: vi.fn() },
  adminDb: {
    collection: vi.fn(),
    runTransaction: vi.fn(),
  },
}));

describe('api security primitives', () => {
  it('uses the trusted real-ip header before x-forwarded-for', () => {
    const request = new Request('https://example.test', {
      headers: {
        'x-real-ip': '203.0.113.7',
        'x-forwarded-for': '198.51.100.8, 10.0.0.1',
      },
    });
    expect(clientIpFrom(request)).toBe('203.0.113.7');
  });

  it('parses schema-validated JSON under the body limit', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ name: 'GoalPlace' }),
    });
    const result = await parseJsonBody(request, z.object({ name: z.string() }), { maxBytes: 100 });
    expect('data' in result ? result.data.name : '').toBe('GoalPlace');
  });

  it('rejects JSON bodies over the configured limit', async () => {
    const request = new Request('https://example.test', { method: 'POST', body: '{"name":"too-large"}' });
    const result = await parseJsonBody(request, z.object({ name: z.string() }), { maxBytes: 4 });
    expect('response' in result ? result.response.status : 0).toBe(413);
  });

  it('compares shared scheduler secrets without accepting length mismatches', () => {
    expect(safeSecretEquals('secret', 'secret')).toBe(true);
    expect(safeSecretEquals('secret-extra', 'secret')).toBe(false);
  });

  it('recognizes Fan principals by role and immutable account class', () => {
    expect(isFanAccountPrincipal({ uid: 'fan_1', role: 'fan', accountClass: 'fan' })).toBe(true);
    expect(isFanAccountPrincipal({ uid: 'fan_1', role: 'fan' }, { role: 'fan', accountClass: 'fan' })).toBe(true);
  });

  it('rejects Fan role/account-class mismatches', () => {
    expect(isFanAccountPrincipal(
      { uid: 'operator_1', role: 'fan', accountClass: 'organization_operator' },
      { role: 'fan', accountClass: 'fan' },
    )).toBe(false);
    expect(isFanAccountPrincipal(
      { uid: 'operator_1', role: 'team_admin', accountClass: 'fan' },
      { role: 'fan', accountClass: 'fan' },
    )).toBe(false);
  });

  it('does not promote unclassified principals through the legacy fan fallback', () => {
    expect(isFanAccountPrincipal({ uid: 'unknown_1' })).toBe(false);
    expect(isFanAccountPrincipal({ uid: 'unknown_1' }, {})).toBe(false);
  });

  it('rejects malformed authenticated mutations before App Check or rate-limit writes', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'user_1', role: 'fan' });
    const request = new Request('https://example.test/api/test', {
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: '{',
    });

    const result = await requireAuthenticatedMutation(
      request,
      z.object({ action: z.literal('save') }),
      {
        maxBytes: 100,
        invalidBodyError: 'Invalid test action.',
        rateLimit: {
          bucket: 'test',
          limit: 1,
          windowSeconds: 60,
        },
      },
    );

    expect('response' in result ? result.response.status : 0).toBe(400);
    expect(await ('response' in result ? result.response.json() : null)).toEqual({
      error: 'Invalid test action.',
    });
    expect(adminAppCheck.verifyToken).not.toHaveBeenCalled();
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('supports the legacy scheduler secret path while OIDC is being provisioned', async () => {
    const previous = process.env.GOALPLACE_TEST_SECRET;
    process.env.GOALPLACE_TEST_SECRET = 'expected';
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'x-test-secret': 'expected' },
    });
    await expect(requireSchedulerRequest(request, {
      operation: 'test',
      legacySecretHeader: 'x-test-secret',
      legacySecretEnv: 'GOALPLACE_TEST_SECRET',
    })).resolves.toBeNull();
    process.env.GOALPLACE_TEST_SECRET = previous;
  });
});

/**
 * The convergence properties: every sensitive mutation is subject to the same
 * account-class boundary, scoped capability check and abuse limit, in the same order.
 */
describe('hardened mutation wrapper', () => {
  const schema = z.object({ teamId: z.string() });

  function mutation(body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://example.test', {
      method: 'POST',
      headers: { authorization: 'Bearer token', ...headers },
      body: JSON.stringify(body),
    });
  }

  function installFirestore(options: {
    user?: Record<string, unknown>;
    capabilities?: Record<string, string[]>;
  } = {}) {
    vi.mocked(adminDb.runTransaction).mockImplementation(allowingRateLimitTransaction() as never);
    vi.mocked(adminDb.collection).mockImplementation((name: string) => ({
      doc: (id: string) => ({
        get: vi.fn(async () => {
          if (name === 'users') return { exists: true, data: () => options.user ?? {} };
          const capabilities = options.capabilities?.[id];
          return { exists: Boolean(capabilities), data: () => (capabilities ? { capabilities } : undefined) };
        }),
      }),
    }) as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'user_1', role: 'fan' } as never);
  });

  it('rejects an account class the route does not serve', async () => {
    installFirestore({ user: { role: 'fan', accountClass: 'fan' } });

    const result = await requireAuthenticatedMutation(mutation({ teamId: 'team_1' }), schema, {
      maxBytes: 1024,
      invalidBodyError: 'Invalid.',
      accountClass: 'organization_operator',
    });

    // The separate-account model is a security boundary: a Fan account must not reach an
    // operator mutation even if it somehow held a scoped assignment.
    expect('response' in result ? result.response.status : 0).toBe(403);
  });

  it('admits an allowed account class', async () => {
    installFirestore({ user: { role: 'team_admin', accountClass: 'organization_operator' } });

    const result = await requireAuthenticatedMutation(mutation({ teamId: 'team_1' }), schema, {
      maxBytes: 1024,
      invalidBodyError: 'Invalid.',
      accountClass: ['organization_operator', 'platform_operator'],
    });

    expect('response' in result).toBe(false);
  });

  it('denies a mutation whose scoped capability is missing', async () => {
    installFirestore({ user: { accountClass: 'organization_operator' }, capabilities: {} });

    const result = await requireAuthenticatedMutation(mutation({ teamId: 'team_1' }), schema, {
      maxBytes: 1024,
      invalidBodyError: 'Invalid.',
      capability: {
        resolve: (data) => ({ capability: 'team.result.submit', scopeType: 'team', scopeId: data.teamId }),
      },
    });

    expect('response' in result ? result.response.status : 0).toBe(403);
  });

  it('allows a mutation whose scoped capability is granted', async () => {
    installFirestore({
      user: { accountClass: 'organization_operator' },
      capabilities: { team_team_1_user_1: ['team.result.submit'] },
    });

    const result = await requireAuthenticatedMutation(mutation({ teamId: 'team_1' }), schema, {
      maxBytes: 1024,
      invalidBodyError: 'Invalid.',
      capability: {
        resolve: (data) => ({ capability: 'team.result.submit', scopeType: 'team', scopeId: data.teamId }),
      },
    });

    expect('response' in result).toBe(false);
  });

  it('accepts a platform-global grant in place of the scoped one', async () => {
    installFirestore({
      user: { accountClass: 'platform_operator' },
      capabilities: { platform_global_user_1: ['platform.admin.manage'] },
    });

    const result = await requireAuthenticatedMutation(mutation({ teamId: 'team_1' }), schema, {
      maxBytes: 1024,
      invalidBodyError: 'Invalid.',
      capability: {
        resolve: (data) => ({ capability: 'team.result.submit', scopeType: 'team', scopeId: data.teamId }),
      },
    });

    expect('response' in result).toBe(false);
  });

  it('returns 429 once the abuse limit for the bucket is reached', async () => {
    installFirestore({ user: {} });
    vi.mocked(adminDb.runTransaction).mockImplementation(denyingRateLimitTransaction(5) as never);

    const result = await requireAuthenticatedMutation(mutation({ teamId: 'team_1' }), schema, {
      maxBytes: 1024,
      invalidBodyError: 'Invalid.',
      rateLimit: { bucket: 'test_bucket', limit: 5, windowSeconds: 60 },
    });

    expect('response' in result ? result.response.status : 0).toBe(429);
  });

  it('issues a correlation id for every accepted mutation', async () => {
    installFirestore({ user: {} });

    const first = await requireAuthenticatedMutation(mutation({ teamId: 'team_1' }), schema, {
      maxBytes: 1024,
      invalidBodyError: 'Invalid.',
    });
    const second = await requireAuthenticatedMutation(mutation({ teamId: 'team_1' }), schema, {
      maxBytes: 1024,
      invalidBodyError: 'Invalid.',
    });

    const firstId = 'requestId' in first ? first.requestId : '';
    const secondId = 'requestId' in second ? second.requestId : '';
    expect(firstId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
  });

  it('enforces App Check before any capability read when it is required', async () => {
    const previous = process.env.GOALPLACE_REQUIRE_APP_CHECK;
    process.env.GOALPLACE_REQUIRE_APP_CHECK = 'true';
    installFirestore({ user: {} });

    const result = await requireAuthenticatedMutation(mutation({ teamId: 'team_1' }), schema, {
      maxBytes: 1024,
      invalidBodyError: 'Invalid.',
      capability: {
        resolve: (data) => ({ capability: 'team.result.submit', scopeType: 'team', scopeId: data.teamId }),
      },
    });

    expect('response' in result ? result.response.status : 0).toBe(401);
    process.env.GOALPLACE_REQUIRE_APP_CHECK = previous;
  });
});
