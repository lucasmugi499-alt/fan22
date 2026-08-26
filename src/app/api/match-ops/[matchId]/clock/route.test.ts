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
const transactionGet = vi.fn();
const transactionSet = vi.fn();

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
    transactionGet.mockResolvedValue({ exists: false });

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
      get: transactionGet,
      set: transactionSet,
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

  it('omits cleared clock anchors from the Firestore write at half time', async () => {
    transactionGet.mockResolvedValue({
      exists: true,
      id: 'match_1',
      data: () => ({
        id: 'match_1',
        matchId: 'match_1',
        period: '1',
        state: 'running',
        periodStartedAt: '2026-08-26T19:00:00.000Z',
        accumulatedMs: 0,
        sessionGeneration: 1,
        version: 2,
        adjustments: [],
        updatedAt: '2026-08-26T19:00:00.000Z',
      }),
    });

    const response = await POST(request({ action: 'end_period' }), context);
    const written = transactionSet.mock.calls[0]?.[1];

    expect(response.status).toBe(200);
    expect(written).toMatchObject({ state: 'period_break', period: '1' });
    expect(written).not.toHaveProperty('periodStartedAt');
  });
});
