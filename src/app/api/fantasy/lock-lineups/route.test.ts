import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { lockFantasyRoundLineups } from '@/server/fantasy/scoringService';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(),
  },
}));

vi.mock('@/server/fantasy/scoringService', () => ({
  lockFantasyRoundLineups: vi.fn(),
}));

function request(secret = 'scheduler-secret') {
  return new Request('https://goalplace256.test/api/fantasy/lock-lineups', {
    method: 'POST',
    headers: { 'x-goalplace-fantasy-secret': secret },
  });
}

describe('fantasy lineup lock route', () => {
  const originalSecret = process.env.GOALPLACE_FANTASY_SCORING_SECRET;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T12:00:00.000Z'));
    process.env.GOALPLACE_FANTASY_SCORING_SECRET = 'scheduler-secret';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.GOALPLACE_FANTASY_SCORING_SECRET = originalSecret;
  });

  it('locks expired open rounds without requiring a deadline composite index', async () => {
    const where = vi.fn(() => query);
    const limit = vi.fn(() => query);
    const get = vi.fn(async () => ({
      docs: [
        {
          id: 'round_expired',
          data: () => ({ status: 'open', deadlineAt: '2026-08-02T11:59:00.000Z' }),
        },
        {
          id: 'round_future',
          data: () => ({ status: 'open', deadlineAt: '2026-08-02T12:01:00.000Z' }),
        },
      ],
    }));
    const query = { where, limit, get };
    vi.mocked(adminDb.collection).mockReturnValue(query as never);
    vi.mocked(lockFantasyRoundLineups).mockResolvedValue(2);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      roundsLocked: 1,
      lineupsLocked: 2,
    });
    expect(adminDb.collection).toHaveBeenCalledWith('fantasyRounds');
    expect(where).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledWith('status', '==', 'open');
    expect(limit).toHaveBeenCalledWith(250);
    expect(lockFantasyRoundLineups).toHaveBeenCalledTimes(1);
    expect(lockFantasyRoundLineups).toHaveBeenCalledWith(adminDb, 'round_expired');
  });
});
