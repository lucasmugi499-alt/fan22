import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { jsonError, requireAuthenticatedUser } from '@/server/api/security';
import { platformAuditEvent, securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';

export const runtime = 'nodejs';

/**
 * The media moderation queue and its decision command.
 *
 * Phase 4 stopped uploads from publishing themselves, which created a gate with nothing
 * behind it: media entered `pending_review` and stayed there. This is the queue a
 * moderator works from, and the only path that can set `published`.
 *
 * Approval is what makes an object publicly addressable. Rejection deletes the stored
 * object rather than merely flagging it, because a rejected file that remains in the
 * bucket is one configuration change away from being served.
 */

const PAGE_SIZE = 40;

const decisionSchema = z.object({
  mediaRecordId: z.string().trim().min(1).max(200),
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().min(4).max(600),
});

function encodedDownloadUrl(bucketName: string, objectPath: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response ?? jsonError('Authentication required.', 401);

  const guarded = await securePlatformCommand({
    actor: auth.actor,
    command: 'media.queue.read',
    requiredCapability: 'platform.audit.read',
    handler: async ({ requestId }) => {
      const url = new URL(request.url);
      const status = url.searchParams.get('status') ?? 'pending_review';
      const limit = Math.min(Number(url.searchParams.get('limit') ?? PAGE_SIZE) || PAGE_SIZE, 100);

      const snapshot = await adminDb.collection('mediaRecords')
        .where('moderationStatus', '==', status)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const bucket = adminStorage.bucket();
      const items = await Promise.all(snapshot.docs.map(async (document) => {
        const data = document.data();
        // A short-lived signed read so a moderator can actually look at the file without
        // it becoming publicly addressable before a decision is made.
        const [reviewUrl] = await bucket.file(String(data.storagePath)).getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 300 * 1000,
        }).catch(() => [null]);

        return {
          id: document.id,
          kind: data.kind ?? null,
          storagePath: data.storagePath ?? null,
          contentType: data.contentType ?? null,
          size: data.size ?? null,
          md5Hash: data.md5Hash ?? null,
          ownerType: data.ownerType ?? null,
          ownerId: data.ownerId ?? null,
          matchId: data.matchId ?? null,
          uploadedByUserId: data.actorUserId ?? null,
          moderationStatus: data.moderationStatus ?? null,
          createdAt: data.createdAt ?? null,
          reviewUrl,
        };
      }));

      return Response.json({ requestId, status, items }, { headers: { 'cache-control': 'no-store' } });
    },
  });

  if ('response' in guarded) {
    return guarded.response ?? jsonError('You do not have permission to review media.', 403);
  }
  return guarded.result;
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response ?? jsonError('Authentication required.', 401);

  const body = await request.json().catch(() => null);
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return jsonError('A media record, decision and note are required.', 400);
  const input = parsed.data;

  const guarded = await securePlatformCommand({
    actor: auth.actor,
    command: 'media.moderation.decide',
    requiredCapability: 'platform.admin.manage',
    requireReason: true,
    reason: input.note,
    handler: async ({ actor, requestId, reason }) => {
      const recordRef = adminDb.collection('mediaRecords').doc(input.mediaRecordId);
      const snapshot = await recordRef.get();
      if (!snapshot.exists) return jsonError('Media record not found.', 404);
      const record = snapshot.data() ?? {};
      if (record.moderationStatus !== 'pending_review') {
        return jsonError('This media record has already been decided.', 409);
      }

      const bucket = adminStorage.bucket();
      const storagePath = String(record.storagePath);

      if (input.decision === 'rejected') {
        // Removed, not merely flagged: a rejected file left in the bucket is one
        // configuration change away from being served.
        await bucket.file(storagePath).delete().catch(() => undefined);
      }

      const approved = input.decision === 'approved';
      await adminDb.runTransaction(async (transaction) => {
        transaction.set(recordRef, {
          moderationStatus: input.decision,
          published: approved,
          moderationNote: reason,
          moderatedByUserId: actor.uid,
          moderatedAt: FieldValue.serverTimestamp(),
          // Only an approved record carries an address.
          ...(approved
            ? { downloadUrl: encodedDownloadUrl(bucket.name, storagePath), publishedAt: FieldValue.serverTimestamp() }
            : { downloadUrl: FieldValue.delete(), storageObjectDeleted: true }),
        }, { merge: true });

        transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
          actor,
          requestId,
          action: `media.${input.decision}`,
          targetCollection: 'mediaRecords',
          targetId: input.mediaRecordId,
          note: reason,
          beforeSummary: { moderationStatus: 'pending_review', published: false },
          afterSummary: { moderationStatus: input.decision, published: approved },
        }));
      });

      return Response.json({
        id: input.mediaRecordId,
        moderationStatus: input.decision,
        published: approved,
        requestId,
      }, { headers: { 'cache-control': 'no-store' } });
    },
  });

  if ('response' in guarded) {
    return guarded.response ?? jsonError('You do not have permission to moderate media.', 403);
  }
  return guarded.result;
}
