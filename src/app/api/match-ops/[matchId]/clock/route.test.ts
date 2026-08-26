import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { requireMatchOpsSession } from '@/server/matchOps/session';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(),
    runTransaction: vi.fn(),
  },
}));

vi.mock('@/server/matchOps/session', () => ({
  requireMatchOpsSession: vi.fn(),
}));

const context = { params: Promise.resolve({ matchId: 'match_1' }) };

function request(body: Record<string, unknown>) {
  return new Request('https://goalplace256.test/api/match-ops/match_1/clock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('match ops clock route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(requireMatchOpsSession).mockResolvedValue({
      session: {
        assignmentId: 'assignment_1',
        sessionId: 'session_1',
        sessionGeneration: 1,
      },
    } as never);

    const ref = { id: 'match_1' };
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn(() => ref),
    } as never);
    vi.mocked(adminDb.runTransaction).mockImplementation(async (operation) => operation({
      get: vi.fn(async () => ({ exists: false })),
      set: vi.fn(),
    } as never));
  });

  it('starts the first period from the action accepted by the HTTP API', async () => {
    const response = await POST(request({ action: 'start' }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.clock).toMatchObject({
      matchId: 'match_1',
      period: '1',
      state: 'running',
      sessionGeneration: 1,
    });
  });
});
