import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { jsonError, requireAuthenticatedMutation } from '@/server/api/security';

export const runtime = 'nodejs';

/**
 * Confirms that an authorized upload actually happened, and that what landed matches
 * what was authorized.
 *
 * Issuing a signed URL was previously the whole story: the declared size was validated
 * on the request but the signed URL only bound the content type, so a caller could
 * upload an object of any size, of a different type, repeatedly, until the URL expired —
 * and nothing downstream ever looked at the stored object.
 *
 * This closes that gap. The session is consumed exactly once, the stored object is
 * inspected, and a media record is created in `pending_review`. Nothing becomes publicly
 * addressable here; publication is a separate, moderated decision.
 */

const confirmSchema = z.object({
  sessionId: z.string().trim().min(1).max(180),
});

/** Tolerance for the declared size, to absorb transport encoding differences only. */
const SIZE_TOLERANCE_BYTES = 1024;
const MAX_OBJECT_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  const guarded = await requireAuthenticatedMutation(request, confirmSchema, {
    maxBytes: 2 * 1024,
    invalidBodyError: 'An upload session id is required.',
    rateLimit: { bucket: 'upload_confirm', limit: 60, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;
  const { actor, data, requestId } = guarded;

  const sessionRef = adminDb.collection('uploadSessions').doc(data.sessionId);
  const sessionSnapshot = await sessionRef.get();
  if (!sessionSnapshot.exists) return jsonError('Upload session not found.', 404);
  const session = sessionSnapshot.data() ?? {};

  // The session belongs to the account that was authorized, not merely to any signed-in
  // caller who learned its id.
  if (session.actorUserId !== actor.uid) {
    return jsonError('This upload session belongs to another account.', 403);
  }
  if (session.status !== 'authorized') {
    // Single use. A replay must not mint a second media record for one authorization.
    return jsonError('This upload session has already been used.', 409);
  }
  if (typeof session.expiresAt === 'string' && Date.parse(session.expiresAt) <= Date.now()) {
    await sessionRef.set({ status: 'expired', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return jsonError('This upload session has expired. Request a new one.', 410);
  }

  const file = adminStorage.bucket().file(String(session.storagePath));
  const [exists] = await file.exists();
  if (!exists) return jsonError('No uploaded object was found for this session.', 409);

  const [metadata] = await file.getMetadata();
  const actualSize = Number(metadata.size ?? 0);
  const actualContentType = String(metadata.contentType ?? '');

  const reject = async (reason: string, message: string) => {
    // The object is removed: an upload that failed verification must not linger in the
    // bucket where a later change could make it addressable.
    await file.delete().catch(() => undefined);
    await sessionRef.set({
      status: 'rejected',
      rejectionReason: reason,
      actualSize,
      actualContentType,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return jsonError(message, 422);
  };

  if (actualSize > MAX_OBJECT_BYTES) {
    return reject('exceeds_maximum_size', 'The uploaded file is larger than the 15 MB limit.');
  }
  if (actualSize > Number(session.declaredSize ?? 0) + SIZE_TOLERANCE_BYTES) {
    return reject('exceeds_declared_size', 'The uploaded file is larger than the size that was authorized.');
  }
  if (actualContentType !== String(session.declaredContentType)) {
    return reject('content_type_mismatch', 'The uploaded file type does not match the authorized type.');
  }

  const mediaRecordId = `media_${data.sessionId}`;
  const nowIso = new Date().toISOString();

  await adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(sessionRef);
    // Re-checked inside the transaction so two concurrent confirmations cannot both
    // create a record.
    if (current.data()?.status !== 'authorized') throw new Error('This upload session has already been used.');

    transaction.set(adminDb.collection('mediaRecords').doc(mediaRecordId), {
      id: mediaRecordId,
      uploadSessionId: data.sessionId,
      requestId,
      kind: session.kind,
      actorUserId: actor.uid,
      storagePath: session.storagePath,
      contentType: actualContentType,
      size: actualSize,
      // GCS supplies this; it is the deduplication and tamper-evidence handle.
      md5Hash: metadata.md5Hash ?? null,
      ...(session.kind === 'match_evidence'
        ? { matchId: session.matchId, teamId: session.teamId }
        : { ownerType: session.ownerType, ownerId: session.ownerId }),
      // Nothing is publicly addressable until a moderator approves it.
      moderationStatus: 'pending_review',
      published: false,
      createdAt: nowIso,
    });

    transaction.set(sessionRef, {
      status: 'confirmed',
      actualSize,
      actualContentType,
      mediaRecordId,
      confirmedAt: nowIso,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }).catch((cause) => {
    throw cause;
  });

  return Response.json({
    mediaRecordId,
    moderationStatus: 'pending_review',
    published: false,
    requestId,
  }, { headers: { 'cache-control': 'no-store' } });
}
