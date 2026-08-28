import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: vi.fn(), runTransaction: vi.fn() } }));
vi.mock('@/server/api/security', () => ({ requireAuthenticatedMutation: vi.fn() }));
vi.mock('@/server/platform/commands/securePlatformCommand', () => ({
  refuse: (message: string, status: number) => { throw Object.assign(new Error(message), { status }); },
  platformAuditEvent: vi.fn((value) => value),
  securePlatformCommand: vi.fn(),
}));

function request(body: Record<string, unknown>) {
  return new Request('https://goalplace256.test/api/platform/capture-policy-floor', {
    method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('capture-policy floor route', () => {
  const writes = vi.fn();
  let actualVersion = 3;
  let currentFloor = 'POST_MATCH_ALLOWED';

  beforeEach(() => {
    vi.clearAllMocks();
    actualVersion = 3;
    currentFloor = 'POST_MATCH_ALLOWED';
    vi.mocked(requireAuthenticatedMutation).mockImplementation(async (input) => ({
      actor: { uid: 'admin_1', role: 'platform_admin' }, data: await input.json(),
    }) as never);
    vi.mocked(securePlatformCommand).mockImplementation(async (options) => {
      try {
        return { result: await options.handler({ actor: { uid: 'admin_1' }, requestId: 'request_1', reason: String(options.reason) } as never) } as never;
      } catch (cause) {
        const error = cause as Error & { status?: number };
        return { response: Response.json({ error: error.message }, { status: error.status ?? 500 }) } as never;
      }
    });
    vi.mocked(adminDb.collection).mockImplementation((name: string) => ({
      doc: vi.fn((id = `${name}_generated`) => ({ id, collectionName: name })),
    }) as never);
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback({
      get: vi.fn(async () => ({ data: () => ({ version: actualVersion, capturePolicyFloor: currentFloor }) })),
      set: writes,
    } as never) as never);
  });

  it('tightens only the future-fixture floor and writes an immutable audit event', async () => {
    const response = await POST(request({ proposedFloor: 'FIELD_PREFERRED', expectedVersion: 3, reason: 'Raise capture reliability.', typedConfirmation: 'SET FLOOR' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ capturePolicyFloor: 'FIELD_PREFERRED', version: 4, existingFixturesChanged: false });
    expect(writes).toHaveBeenCalledWith(expect.objectContaining({ collectionName: 'platformSettings', id: 'global' }), expect.objectContaining({ capturePolicyFloor: 'FIELD_PREFERRED', version: 4 }), { merge: true });
    expect(writes).toHaveBeenCalledWith(expect.objectContaining({ collectionName: 'adminAuditEvents' }), expect.objectContaining({ afterSummary: expect.objectContaining({ existingFixturesChanged: false }) }));
    expect(vi.mocked(adminDb.collection).mock.calls.map(([name]) => name)).not.toContain('matches');
    expect(vi.mocked(adminDb.collection).mock.calls.map(([name]) => name)).not.toContain('finalizations');
  });

  it('refuses a stale preview before any settings or audit write', async () => {
    actualVersion = 4;
    currentFloor = 'FIELD_PREFERRED';
    const response = await POST(request({ proposedFloor: 'FIELD_REQUIRED', expectedVersion: 3, reason: 'Raise capture reliability.', typedConfirmation: 'SET FLOOR' }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('changed after preview');
    expect(writes).not.toHaveBeenCalled();
  });
});
