import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { adminAppCheck, adminAuth, adminDb } from '@/lib/firebase/admin';
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
