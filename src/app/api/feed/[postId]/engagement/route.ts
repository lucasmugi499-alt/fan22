import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';

export const runtime = 'nodejs';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reaction') }),
  z.object({ action: z.literal('share') }),
  z.object({ action: z.literal('comment'), text: z.string().trim().min(1).max(600) }),
  z.object({ action: z.literal('report'), reason: z.string().trim().min(4).max(300) }),
]);

function containsBlockedContent(text: string) {
  return /\b(?:bet now|guaranteed odds|crypto giveaway)\b/i.test(text);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  const { postId } = await context.params;
  const mutation = await requireAuthenticatedMutation(request, schema, {
    maxBytes: 2 * 1024,
    invalidBodyError: 'Invalid feed action.',
    rateLimit: {
      bucket: 'feed_engagement',
      limit: 40,
      windowSeconds: 60,
      identity: ({ data }) => [postId, data.action],
    },
  });
  if ('response' in mutation) return mutation.response;
  const actor = mutation.actor;
  const input = mutation.data;
  const postRef = adminDb.collection('feedPosts').doc(postId);
  const eventId = `${postId}_${actor.uid}`;
  const reactionRef = adminDb.collection('feedReactions').doc(eventId);
  const shareRef = adminDb.collection('feedShares').doc(eventId);
  const rateRef = adminDb.collection('engagementRateLimits').doc(`${actor.uid}_${input.action}`);
  const now = Date.now();

  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const [postSnapshot, rateSnapshot] = await Promise.all([
        transaction.get(postRef),
        transaction.get(rateRef),
      ]);
      if (!postSnapshot.exists || postSnapshot.data()?.status === 'hidden') throw new Error('This post is not available.');
      const previousActionAt = rateSnapshot.data()?.lastActionAt?.toMillis?.() as number | undefined;
      if (previousActionAt && now - previousActionAt < 1_500) {
        throw new Error('Please wait a moment before trying that again.');
      }

      if (input.action === 'reaction') {
        const existing = await transaction.get(reactionRef);
        if (existing.exists) {
          transaction.delete(reactionRef);
          transaction.update(postRef, { likesCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() });
          transaction.set(rateRef, { userId: actor.uid, action: input.action, lastActionAt: FieldValue.serverTimestamp() });
          return { id: reactionRef.id, message: 'Reaction removed.' };
        }
        transaction.create(reactionRef, {
          id: reactionRef.id,
          postId,
          userId: actor.uid,
          status: 'active',
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.update(postRef, { likesCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
        transaction.set(rateRef, { userId: actor.uid, action: input.action, lastActionAt: FieldValue.serverTimestamp() });
        return { id: reactionRef.id, message: 'Reaction saved.' };
      }

      if (input.action === 'share') {
        const existing = await transaction.get(shareRef);
        if (!existing.exists) {
          transaction.create(shareRef, {
            id: shareRef.id,
            postId,
            userId: actor.uid,
            createdAt: FieldValue.serverTimestamp(),
          });
          transaction.update(postRef, { sharesCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
        }
        transaction.set(rateRef, { userId: actor.uid, action: input.action, lastActionAt: FieldValue.serverTimestamp() });
        return { id: shareRef.id, message: existing.exists ? 'Share already recorded.' : 'Share recorded.' };
      }

      if (input.action === 'comment') {
        if (containsBlockedContent(input.text)) throw new Error('That comment needs review before it can be published.');
        const commentRef = adminDb.collection('comments').doc();
        transaction.create(commentRef, {
          id: commentRef.id,
          postId,
          authorId: actor.uid,
          authorName: actor.name ?? actor.email ?? 'GoalPlace member',
          text: input.text,
          status: 'published',
          moderationStatus: 'auto_approved',
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.update(postRef, { commentsCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
        transaction.set(rateRef, { userId: actor.uid, action: input.action, lastActionAt: FieldValue.serverTimestamp() });
        return { id: commentRef.id, message: 'Comment published.' };
      }

      const reportRef = adminDb.collection('reports').doc(`feed_${eventId}`);
      const existing = await transaction.get(reportRef);
      if (!existing.exists) {
        transaction.create(reportRef, {
          id: reportRef.id,
          reporterId: actor.uid,
          type: 'reported_feed_post',
          targetId: postId,
          summary: input.reason,
          reportedEntity: postId,
          status: 'open',
          moderationStatus: 'pending_review',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.set(rateRef, { userId: actor.uid, action: input.action, lastActionAt: FieldValue.serverTimestamp() });
      return { id: reportRef.id, message: 'Report sent to the trust team.' };
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Feed action failed.' },
      { status: 409 },
    );
  }
}
