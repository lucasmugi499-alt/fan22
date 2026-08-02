import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth } from '@/lib/firebase/admin';
import { resolveTrustedAccessContext } from '@/server/access/resolver';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
}));

vi.mock('@/server/access/resolver', () => ({
  resolveTrustedAccessContext: vi.fn(),
}));

function request(token = 'token') {
  return new Request('https://goalplace256.test/api/access/context', {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

describe('trusted access context route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests before resolving access', async () => {
    const response = await GET(request(''));

    expect(response.status).toBe(401);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(resolveTrustedAccessContext).not.toHaveBeenCalled();
  });

  it('returns sanitized scoped access context for the authenticated user', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'user_1', role: 'fan' });
    vi.mocked(resolveTrustedAccessContext).mockResolvedValue({
      userId: 'user_1',
      accountRole: 'league_admin',
      accountClass: 'organization_operator',
      primaryPersona: 'league_admin',
      mode: 'compare',
      accessVersion: 4,
      indexes: [{
        userId: 'user_1',
        scopeType: 'league',
        scopeId: 'league_1',
        activeRoles: ['league_owner'],
        capabilities: ['league.profile.manage'],
        assignmentIds: ['assignment_1'],
        accessVersion: 4,
        updatedAt: '2026-07-30T12:00:00.000Z',
      }],
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      userId: 'user_1',
      accountRole: 'league_admin',
      accountClass: 'organization_operator',
      primaryPersona: 'league_admin',
      mode: 'compare',
      accessVersion: 4,
      indexes: [{
        userId: 'user_1',
        scopeType: 'league',
        scopeId: 'league_1',
        activeRoles: ['league_owner'],
        capabilities: ['league.profile.manage'],
        assignmentIds: ['assignment_1'],
        accessVersion: 4,
        updatedAt: '2026-07-30T12:00:00.000Z',
      }],
    });
    expect(resolveTrustedAccessContext).toHaveBeenCalledWith('user_1');
  });
});
