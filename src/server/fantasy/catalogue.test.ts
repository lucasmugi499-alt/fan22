import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { getFantasyMiniLeagueCatalogue } from './catalogue';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(),
  },
}));

describe('fantasy mini-league catalogue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns demo member counts without exposing raw catalogue members', async () => {
    const catalogue = await getFantasyMiniLeagueCatalogue();

    expect(catalogue.miniLeagues.length).toBeGreaterThan(0);
    expect(Object.keys(catalogue.memberCounts).length).toBeGreaterThan(0);
    expect('members' in catalogue).toBe(false);
    expect('leaderboards' in catalogue).toBe(false);
  });

  it('limits Firebase public league reads and uses aggregate member counts per visible league', async () => {
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'firebase');
    const leagueLimit = vi.fn(async () => ({
      docs: [
        {
          id: 'mini_1',
          data: () => ({
            competitionId: 'competition_1',
            ownerUserId: 'fan_1',
            name: 'Kampala Friends',
            description: 'Public table',
            inviteCode: 'ABC123',
            visibility: 'public',
            approvalRequired: false,
            memberLimit: 50,
            status: 'active',
            createdAt: '2026-07-30T00:00:00.000Z',
          }),
        },
      ],
    }));
    const countGet = vi.fn(async () => ({
      data: () => ({ count: 7 }),
    }));
    const membersCount = vi.fn(() => ({ get: countGet }));
    const collectionMock = vi.fn((collectionName: string) => {
      if (collectionName === 'fantasyMiniLeagues') {
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn((limit: number) => {
                expect(limit).toBe(20);
                return { get: leagueLimit };
              }),
            })),
          })),
        };
      }
      if (collectionName === 'fantasyMiniLeagueMembers') {
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              count: membersCount,
            })),
          })),
        };
      }
      throw new Error(`Unexpected collection ${collectionName}`);
    });
    vi.mocked(adminDb.collection).mockImplementation(collectionMock as never);

    const catalogue = await getFantasyMiniLeagueCatalogue();

    expect(catalogue.miniLeagues).toHaveLength(1);
    expect(catalogue.memberCounts).toEqual({ mini_1: 7 });
    expect(collectionMock).not.toHaveBeenCalledWith('fantasyLeaderboards');
    expect(countGet).toHaveBeenCalledTimes(1);
  });
});
