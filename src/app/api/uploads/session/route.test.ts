import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb, adminStorage } from '@/lib/firebase/admin';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
  },
  adminStorage: {
    bucket: vi.fn(),
  },
}));

function request(body: unknown, token = 'token') {
  return new Request('https://goalplace256.test/api/uploads/session', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(body),
  });
}

function snapshot(data: Record<string, unknown> | undefined) {
  return {
    exists: Boolean(data),
    data: () => data,
  };
}

function installFirestore(records: Record<string, Record<string, unknown>>) {
  vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
    doc: vi.fn((id: string) => ({
      id,
      collectionName,
      get: vi.fn(async () => snapshot(records[`${collectionName}/${id}`])),
    })),
  }) as never);
}

function installStorage() {
  const getSignedUrl = vi.fn(async () => ['https://storage.example/upload']);
  vi.mocked(adminStorage.bucket).mockReturnValue({
    name: 'goalplace256-test.appspot.com',
    file: vi.fn(() => ({ getSignedUrl })),
  } as never);
  return { getSignedUrl };
}

describe('trusted upload session route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication before parsing upload requests', async () => {
    const response = await POST(request({ kind: 'published_media' }, ''));

    expect(response.status).toBe(401);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('rejects team media uploads without a scoped team capability', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fan_1', role: 'fan' });
    installFirestore({});

    const response = await POST(request({
      kind: 'published_media',
      ownerType: 'team',
      ownerId: 'team_1',
      fileName: 'badge.jpg',
      contentType: 'image/jpeg',
      size: 128,
    }));

    expect(response.status).toBe(403);
    expect(adminStorage.bucket).not.toHaveBeenCalled();
  });

  it('creates a signed upload URL for a team operator with profile capability', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'operator_1', role: 'team_admin' });
    installFirestore({
      'accessIndex/team_team_1_operator_1': {
        capabilities: ['team.profile.manage'],
      },
    });
    const { getSignedUrl } = installStorage();

    const response = await POST(request({
      kind: 'published_media',
      ownerType: 'team',
      ownerId: 'team_1',
      fileName: 'badge.jpg',
      contentType: 'image/jpeg',
      size: 128,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      uploadUrl: 'https://storage.example/upload',
      storagePath: expect.stringMatching(/^publishedMedia\/team\/team_1\/operator_1\/.+\.jpg$/),
      downloadUrl: expect.stringContaining('publishedMedia%2Fteam%2Fteam_1%2Foperator_1%2F'),
      expiresInSeconds: 600,
    });
    expect(getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({
      action: 'write',
      contentType: 'image/jpeg',
      version: 'v4',
    }));
  });

  it('requires match evidence uploaders to manage an involved team', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'operator_1', role: 'team_admin' });
    installFirestore({
      'matches/match_1': {
        homeTeamId: 'team_1',
        awayTeamId: 'team_2',
      },
      'accessIndex/team_team_1_operator_1': {
        capabilities: ['team.result.submit'],
      },
    });
    installStorage();

    const response = await POST(request({
      kind: 'match_evidence',
      matchId: 'match_1',
      teamId: 'team_1',
      fileName: 'score.jpg',
      contentType: 'image/jpeg',
      size: 128,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      uploadUrl: 'https://storage.example/upload',
      storagePath: expect.stringMatching(/^matchEvidence\/match_1\/team_1\/operator_1\/.+\.jpg$/),
    });
  });

  it('rejects evidence uploads for unrelated teams', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'operator_1', role: 'team_admin' });
    installFirestore({
      'matches/match_1': {
        homeTeamId: 'team_1',
        awayTeamId: 'team_2',
      },
      'accessIndex/team_team_3_operator_1': {
        capabilities: ['team.result.submit'],
      },
    });

    const response = await POST(request({
      kind: 'match_evidence',
      matchId: 'match_1',
      teamId: 'team_3',
      fileName: 'score.jpg',
      contentType: 'image/jpeg',
      size: 128,
    }));

    expect(response.status).toBe(403);
    expect(adminStorage.bucket).not.toHaveBeenCalled();
  });
});
