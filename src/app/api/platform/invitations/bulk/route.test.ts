import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';
import { resendAccessInvitation } from '@/server/platform/invitations/resendInvitation';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: vi.fn() } }));
vi.mock('@/server/api/security', () => ({ requireAuthenticatedMutation: vi.fn() }));
vi.mock('@/server/platform/commands/securePlatformCommand', () => ({
  PlatformCommandRefusal: class PlatformCommandRefusal extends Error {},
  securePlatformCommand: vi.fn(),
}));
vi.mock('@/server/platform/invitations/resendInvitation', () => ({ resendAccessInvitation: vi.fn() }));

function request(body: Record<string, unknown>) {
  return new Request('https://goalplace256.test/api/platform/invitations/bulk', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Platform invitation bulk route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthenticatedMutation).mockImplementation(async (input) => ({
      actor: { uid: 'admin_1', role: 'platform_admin' },
      data: await input.json(),
    }) as never);
    vi.mocked(securePlatformCommand).mockImplementation(async (options) => ({
      result: await options.handler({
        actor: { uid: 'admin_1', role: 'platform_admin' },
        requestId: 'request_1',
        reason: typeof options.reason === 'string' ? options.reason : '',
      } as never),
    }) as never);
  });

  it('uses the identical validator for preview and execution and never sends malformed rows', async () => {
    const rows = [{ invitationId: '', channel: 'sms' }];
    const previewResponse = await POST(request({ mode: 'preview', rows }));
    const executeResponse = await POST(request({ mode: 'execute', rows, reason: 'Operator requested retry.', typedConfirmation: 'SEND BATCH' }));
    const preview = await previewResponse.json();
    const execution = await executeResponse.json();

    expect(previewResponse.status).toBe(200);
    expect(executeResponse.status).toBe(409);
    expect(preview.preview.errors).toEqual(execution.preview.errors);
    expect(preview.preview.validCount).toBe(0);
    expect(resendAccessInvitation).not.toHaveBeenCalled();
  });
});
