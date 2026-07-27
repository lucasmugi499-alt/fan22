import { createHmac } from 'node:crypto';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { AppRole, Match } from '@/types';

export const runtime = 'nodejs';

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const token = bearerToken(request);
  const actor = token ? await adminAuth.verifyIdToken(token).catch(() => null) : null;
  if (!actor) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const secret = process.env.GOALPLACE_ATTENDANCE_SECRET;
  if (!secret) return Response.json({ error: 'Venue check-in is not configured on this build.' }, { status: 503 });
  const { matchId } = await params;
  const matchSnapshot = await adminDb.collection('matches').doc(matchId).get();
  if (!matchSnapshot.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
  const match = { id: matchSnapshot.id, ...matchSnapshot.data() } as Match;
  const leagueSnapshot = await adminDb.collection('leagues').doc(match.leagueId).get();
  const role = typeof actor.role === 'string' ? actor.role as AppRole : 'fan';
  const isPlatform = role === 'platform_admin' || role === 'super_admin';
  const isLeagueAdmin = Array.isArray(leagueSnapshot.data()?.adminUserIds) &&
    leagueSnapshot.data()!.adminUserIds.includes(actor.uid);
  if (!isPlatform && !isLeagueAdmin) {
    return Response.json({ error: 'Only the owning League Admin can generate a venue QR.' }, { status: 403 });
  }
  const kickoff = new Date(match.scheduledAt).getTime();
  if (!Number.isFinite(kickoff)) {
    return Response.json({ error: 'This fixture does not have a valid kickoff time.' }, { status: 409 });
  }
  const now = Date.now();
  const generationOpensAt = kickoff - 24 * 60 * 60_000;
  const expiresAt = kickoff + 12 * 60 * 60_000;
  if (now < generationOpensAt || now > expiresAt) {
    return Response.json(
      { error: 'Venue QR generation opens 24 hours before kickoff and closes after matchday.' },
      { status: 409 },
    );
  }
  const payload = `${matchId}.${expiresAt}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  const attendanceToken = `${payload}.${signature}`;
  return Response.json({
    attendanceToken,
    expiresAt: new Date(expiresAt).toISOString(),
    path: `/matches/${matchId}?attendance=${encodeURIComponent(attendanceToken)}`,
  });
}
