import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { POST as postChallenge } from './challenges/[challengeId]/transition/route';
import { POST as postAttendance } from './matches/[matchId]/attendance/route';
import { POST as postPoints } from './points/events/route';
import { POST as postCorrection } from './result-submissions/[matchId]/correction/route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
  },
}));

vi.mock('@/server/resultFinalizer', () => ({
  finalizeSubmission: vi.fn(),
}));

function request(path: string, body: string, token = 'token') {
  return new Request(`https://goalplace256.test${path}`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body,
  });
}

const challengeContext = { params: Promise.resolve({ challengeId: 'challenge_1' }) };
const attendanceContext = { params: Promise.resolve({ matchId: 'match_1' }) };
const correctionContext = { params: Promise.resolve({ matchId: 'match_1' }) };

describe('remaining API body hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOALPLACE_ATTENDANCE_SECRET = 'attendance-secret';
  });

  it.each([
    ['/api/points/events', (body: string, token?: string) => postPoints(request('/api/points/events', body, token)), 'Authentication required.'],
    ['/api/matches/match_1/attendance', (body: string, token?: string) => postAttendance(request('/api/matches/match_1/attendance', body, token), attendanceContext), 'Sign in before checking in.'],
    ['/api/challenges/challenge_1/transition', (body: string, token?: string) => postChallenge(request('/api/challenges/challenge_1/transition', body, token), challengeContext), 'Authentication required.'],
    ['/api/result-submissions/match_1/correction', (body: string, token?: string) => postCorrection(request('/api/result-submissions/match_1/correction', body, token), correctionContext), 'Authentication required.'],
  ] as const)('rejects unauthenticated POST %s before body parsing or Firestore work', async (_path, handler, error) => {
    const response = await handler('{', '');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error });
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/points/events', (body: string) => postPoints(request('/api/points/events', body)), 'Invalid points event.'],
    ['/api/matches/match_1/attendance', (body: string) => postAttendance(request('/api/matches/match_1/attendance', body), attendanceContext), 'This venue code is invalid.'],
    ['/api/challenges/challenge_1/transition', (body: string) => postChallenge(request('/api/challenges/challenge_1/transition', body), challengeContext), 'Invalid challenge action.'],
    ['/api/result-submissions/match_1/correction', (body: string) => postCorrection(request('/api/result-submissions/match_1/correction', body), correctionContext), 'A corrected score and reason are required.'],
  ] as const)('rejects invalid JSON for POST %s before Firestore work', async (_path, handler, error) => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'user_1', role: 'fan' });

    const response = await handler('{');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/points/events', (body: string) => postPoints(request('/api/points/events', body)), 'Invalid points event.'],
    ['/api/matches/match_1/attendance', (body: string) => postAttendance(request('/api/matches/match_1/attendance', body), attendanceContext), 'This venue code is invalid.'],
    ['/api/challenges/challenge_1/transition', (body: string) => postChallenge(request('/api/challenges/challenge_1/transition', body), challengeContext), 'Invalid challenge action.'],
    ['/api/result-submissions/match_1/correction', (body: string) => postCorrection(request('/api/result-submissions/match_1/correction', body), correctionContext), 'A corrected score and reason are required.'],
  ] as const)('rejects oversized JSON for POST %s before Firestore work', async (_path, handler, error) => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'user_1', role: 'fan' });

    const response = await handler(JSON.stringify({
      action: 'request',
      userId: 'user_1',
      matchId: 'match_1',
      actorUserId: 'user_1',
      reason: 'x'.repeat(5 * 1024),
    }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error });
    expect(adminDb.collection).not.toHaveBeenCalled();
  });
});
