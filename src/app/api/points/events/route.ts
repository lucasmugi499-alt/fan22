import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation, requireFanAccountPrincipal } from '@/server/api/security';
import {
  cappedPointsAward,
  kampalaPeriod,
  pointsIdempotencyKey,
} from '@/lib/money';
import type { PointsEvent } from '@/types/money';

export const runtime = 'nodejs';

const bodySchema = z.object({
  userId: z.string().trim().min(1).max(180),
  actionType: z.enum([
    'profile_completed',
    'first_league_followed',
    'team_followed',
    'league_notice_read',
    'verified_comment',
    'match_attended',
    'athlete_card_shared',
    'fan_onboarding_completed',
  ]),
  relatedEntityId: z.string().trim().min(1).max(160).optional(),
});

async function eligible(
  userId: string,
  actionType: Exclude<PointsEvent['actionType'], 'verified_need_supported'>,
  relatedEntityId?: string,
) {
  const profile = (await adminDb.collection('users').doc(userId).get()).data();
  if (!profile) return false;
  if (actionType === 'profile_completed') {
    return Boolean(profile.name && profile.city && profile.avatarUrl);
  }
  if (actionType === 'fan_onboarding_completed') {
    return Boolean(profile.onboardingCompletedAt);
  }
  if (actionType === 'first_league_followed') {
    return Boolean(relatedEntityId && profile.followedLeagues?.includes(relatedEntityId));
  }
  if (actionType === 'team_followed') {
    return Boolean(relatedEntityId && profile.followedTeams?.includes(relatedEntityId));
  }
  if (actionType === 'league_notice_read') {
    return Boolean(
      relatedEntityId &&
      (await adminDb.collection('leagueNotices').doc(relatedEntityId).get()).exists
    );
  }
  if (actionType === 'verified_comment') {
    const comment = relatedEntityId
      ? await adminDb.collection('comments').doc(relatedEntityId).get()
      : null;
    return Boolean(
      comment?.exists &&
      comment.data()?.authorId === userId &&
      comment.data()?.status === 'published' &&
      comment.data()?.verifiedConstructive === true
    );
  }
  if (actionType === 'match_attended') {
    return Boolean(
      relatedEntityId &&
      (await adminDb.collection('matchAttendance').doc(`${relatedEntityId}_${userId}`).get()).exists
    );
  }
  if (actionType === 'athlete_card_shared') {
    return Boolean(
      relatedEntityId &&
      (await adminDb.collection('athletes').doc(relatedEntityId).get()).exists
    );
  }
  return false;
}

export async function POST(request: Request) {
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'Invalid points event.',
    rateLimit: {
      bucket: 'points_events',
      limit: 20,
      windowSeconds: 60,
      identity: ({ data }) => [data.actionType, data.relatedEntityId ?? 'none'],
    },
  });
  if ('response' in mutation) return mutation.response;
  const actor = mutation.actor;
  const input = mutation.data;
  const fanAccount = await requireFanAccountPrincipal(actor, 'Fan points are available to Fan accounts only.');
  if ('response' in fanAccount) return fanAccount.response;
  if (input.userId !== actor.uid) {
    return Response.json({ error: 'Points can only be recorded for the signed-in account.' }, { status: 403 });
  }
  if (!(await eligible(input.userId, input.actionType, input.relatedEntityId))) {
    return Response.json({ error: 'This activity is not eligible for points.' }, { status: 409 });
  }

  const idempotencyKey = pointsIdempotencyKey(
    input.userId,
    input.actionType,
    input.relatedEntityId,
  );
  const eventId = Buffer.from(idempotencyKey).toString('base64url').slice(0, 120);
  const eventRef = adminDb.collection('pointsEvents').doc(eventId);
  const period = kampalaPeriod();

  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(eventRef);
      if (existing.exists) return { id: eventId, points: existing.data()?.points ?? 0, duplicate: true };
      const recent = await transaction.get(
        adminDb.collection('pointsEvents')
          .where('userId', '==', input.userId)
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
      const points = cappedPointsAward(input.actionType, dailyTotal, weeklyTotal);
      transaction.create(eventRef, {
        id: eventId,
        ...input,
        points,
        idempotencyKey,
        status: points > 0 ? 'confirmed' : 'cap_rejected',
        periodDate: period.dateKey,
        periodWeek: period.weekKey,
        createdAt: FieldValue.serverTimestamp(),
      });
      if (input.actionType === 'league_notice_read' && input.relatedEntityId) {
        transaction.set(adminDb.collection('leagueNoticeReads').doc(`${input.relatedEntityId}_${input.userId}`), {
          id: `${input.relatedEntityId}_${input.userId}`,
          noticeId: input.relatedEntityId,
          userId: input.userId,
          readAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      if (input.actionType === 'athlete_card_shared' && input.relatedEntityId) {
        transaction.set(adminDb.collection('athleteShareEvents').doc(`${input.relatedEntityId}_${input.userId}`), {
          id: `${input.relatedEntityId}_${input.userId}`,
          athleteId: input.relatedEntityId,
          userId: input.userId,
          issuedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      if (points > 0) transaction.update(adminDb.collection('users').doc(input.userId), { points: FieldValue.increment(points) });
      return { id: eventId, points, duplicate: false };
    });
    return Response.json({
      ...result,
      message: result.duplicate
        ? 'Recognition was already recorded.'
        : result.points > 0
          ? `${result.points} participation points recorded.`
          : 'The daily or weekly points cap has been reached; no points were added.',
    });
  } catch (error) {
    console.error('Points event failed', error);
    return Response.json({ error: 'Points activity could not be recorded.' }, { status: 500 });
  }
}
