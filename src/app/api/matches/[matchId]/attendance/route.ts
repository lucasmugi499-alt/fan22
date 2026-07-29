import { createHmac, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cappedPointsAward, kampalaPeriod, pointsIdempotencyKey } from '@/lib/money';
import type { Match } from '@/types';

export const runtime = 'nodejs';

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

function validSignature(value: string, expected: string) {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const token = bearerToken(request);
  const actor = token ? await adminAuth.verifyIdToken(token).catch(() => null) : null;
  if (!actor) return Response.json({ error: 'Sign in before checking in.' }, { status: 401 });
  const secret = process.env.GOALPLACE_ATTENDANCE_SECRET;
  if (!secret) return Response.json({ error: 'Venue check-in is not configured.' }, { status: 503 });
  const body = await request.json().catch(() => null) as { attendanceToken?: string } | null;
  const { matchId } = await params;
  const parts = body?.attendanceToken?.split('.') ?? [];
  if (parts.length !== 3 || parts[0] !== matchId) {
    return Response.json({ error: 'This venue code is invalid.' }, { status: 400 });
  }
  const expiresAt = Number(parts[1]);
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt || !validSignature(parts[2], expected)) {
    return Response.json({ error: 'This venue code is invalid or expired.' }, { status: 410 });
  }
  const matchSnapshot = await adminDb.collection('matches').doc(matchId).get();
  if (!matchSnapshot.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
  const match = { id: matchSnapshot.id, ...matchSnapshot.data() } as Match;
  const distanceFromKickoff = Math.abs(Date.now() - new Date(match.scheduledAt).getTime());
  if (distanceFromKickoff > 12 * 60 * 60_000) {
    return Response.json({ error: 'Check-in opens only on matchday at the venue.' }, { status: 409 });
  }

  const attendanceId = `${matchId}_${actor.uid}`;
  const attendanceRef = adminDb.collection('matchAttendance').doc(attendanceId);
  const idempotencyKey = pointsIdempotencyKey(actor.uid, 'match_attended', matchId);
  const pointsEventId = Buffer.from(idempotencyKey).toString('base64url').slice(0, 120);
  const pointsRef = adminDb.collection('pointsEvents').doc(pointsEventId);
  const period = kampalaPeriod();

  const result = await adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(attendanceRef);
    if (existing.exists) return { duplicate: true, points: 0 };
    const recent = await transaction.get(
      adminDb.collection('pointsEvents')
        .where('userId', '==', actor.uid)
        .where('status', '==', 'confirmed')
        .where('createdAt', '>=', Timestamp.fromDate(period.weekStart)),
    );
    let dailyTotal = 0;
    let weeklyTotal = 0;
    for (const snapshot of recent.docs) {
      const data = snapshot.data();
      const createdAt = data.createdAt?.toDate?.() as Date | undefined;
      weeklyTotal += data.points ?? 0;
      if (createdAt && createdAt >= period.dayStart) dailyTotal += data.points ?? 0;
    }
    const points = cappedPointsAward('match_attended', dailyTotal, weeklyTotal);
    transaction.create(attendanceRef, {
      id: attendanceId,
      matchId,
      userId: actor.uid,
      leagueId: match.leagueId,
      venue: match.venue,
      checkedInAt: FieldValue.serverTimestamp(),
    });
    transaction.create(pointsRef, {
      id: pointsEventId,
      userId: actor.uid,
      actionType: 'match_attended',
      relatedEntityId: matchId,
      points,
      idempotencyKey,
      status: points > 0 ? 'confirmed' : 'cap_rejected',
      periodDate: period.dateKey,
      periodWeek: period.weekKey,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (points > 0) transaction.update(adminDb.collection('users').doc(actor.uid), { points: FieldValue.increment(points) });
    return { duplicate: false, points };
  });
  return Response.json({
    ok: true,
    ...result,
    message: result.duplicate ? 'You already checked in to this match.' : `${result.points} matchday points recorded.`,
  });
}
