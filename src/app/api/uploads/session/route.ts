import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { hasLeagueCapabilityForAthlete, hasLeagueCapabilityForTeam } from '@/server/access/leagueScope';
import { hasCapability } from '@/server/access/capabilities';
import { jsonError, requireAuthenticatedMutation, type AuthenticatedActor } from '@/server/api/security';

export const runtime = 'nodejs';

const uploadSessionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('match_evidence'),
    matchId: z.string().trim().min(1).max(180),
    teamId: z.string().trim().min(1).max(180),
    fileName: z.string().trim().min(1).max(180),
    contentType: z.string().trim().regex(/^(image|video)\//),
    size: z.number().int().positive().max(15 * 1024 * 1024),
  }),
  z.object({
    kind: z.literal('published_media'),
    ownerType: z.enum(['user', 'athlete', 'team', 'league']),
    ownerId: z.string().trim().min(1).max(180),
    fileName: z.string().trim().min(1).max(180),
    contentType: z.string().trim().regex(/^(image|video)\//),
    size: z.number().int().positive().max(15 * 1024 * 1024),
  }),
]);

function extensionFrom(fileName: string, contentType: string) {
  const extension = fileName.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
  if (extension) return extension;
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'video/mp4') return 'mp4';
  return 'bin';
}


const PLATFORM_SCOPE = { scopeType: 'platform', scopeId: 'global' } as const;

async function canManagePublishedMedia(actor: AuthenticatedActor, ownerType: 'user' | 'athlete' | 'team' | 'league', ownerId: string) {
  // Capability only. The `actorIsPlatform(actor) ||` short-circuit that sat here meant the
  // role alone authorized any upload, so the capability beside it never decided anything.
  // Every platform account holds platform.admin.manage, so this is narrower, not stricter.
  if (await hasCapability(actor.uid, PLATFORM_SCOPE, 'platform.admin.manage')) return true;
  if (ownerType === 'user') return ownerId === actor.uid;
  if (ownerType === 'athlete') return canManageAthleteMedia(actor, ownerId);
  if (ownerType === 'team') return hasLeagueCapabilityForTeam(actor.uid, ownerId, 'league.team.manage');
  return hasCapability(actor.uid, { scopeType: 'league', scopeId: ownerId }, 'league.profile.manage');
}

/**
 * Who may upload a picture that belongs to an athlete.
 *
 * Two different people, for two different reasons.
 *
 * The league that manages the roster holds the same authority over the athlete's photo as over
 * the rest of their registration, so a photo cannot be changed by someone who could not change
 * the name.
 *
 * The athlete themselves holds `athlete.persona.media.manage` from the `athlete_self` bundle,
 * which is the grant that exists precisely so a claimed athlete can publish a highlight. This
 * check was left behind when the capability was renamed from `athlete.media.manage`: the
 * comment recorded that the old spelling no longer existed and nothing was put in its place,
 * so an athlete attaching a photo to their own career update was told they were not authorized
 * to upload media for their own profile.
 *
 * This widens who may put a FILE in the bucket under `publishedMedia/athlete/{id}`. It does not
 * widen who may write `athletes/{athleteId}` — invariant 06 still holds, and an athlete's own
 * media lands on their persona and their posts, never on the sporting record.
 */
async function canManageAthleteMedia(actor: AuthenticatedActor, athleteId: string) {
  if (await hasCapability(
    actor.uid,
    { scopeType: 'athlete', scopeId: athleteId },
    'athlete.persona.media.manage',
  )) {
    return true;
  }
  return hasLeagueCapabilityForAthlete(actor.uid, athleteId, 'league.roster.manage');
}

async function canUploadMatchEvidence(actor: AuthenticatedActor, matchId: string, teamId: string) {
  // Capability only. The `actorIsPlatform(actor) ||` short-circuit that sat here meant the
  // role alone authorized any upload, so the capability beside it never decided anything.
  // Every platform account holds platform.admin.manage, so this is narrower, not stricter.
  if (await hasCapability(actor.uid, PLATFORM_SCOPE, 'platform.admin.manage')) return true;
  const match = await adminDb.collection('matches').doc(matchId).get();
  if (!match.exists) return false;
  const data = match.data() ?? {};
  if (data.homeTeamId !== teamId && data.awayTeamId !== teamId) return false;
  // Evidence for a result is League work now: the two team capabilities this used to accept
  // grant nothing, and field capture attaches its own evidence through the match ops routes.
  return await hasLeagueCapabilityForTeam(actor.uid, teamId, 'league.result.enter')
    || await hasLeagueCapabilityForTeam(actor.uid, teamId, 'league.result.resolve');
}

/**
 * The ceiling any single upload may reach, enforced by Cloud Storage rather than by us.
 *
 * Matches the schema's own maximum, so a request that got this far has already declared a size
 * under it. This is the second lock: the declared size was checked on the REQUEST and bound
 * nothing about the upload, so a caller who was authorized to put a 200KB photo could put a
 * 4GB object at the same URL.
 */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * A signed URL that binds the size as well as the type.
 *
 * `x-goog-content-length-range` is part of the v4 signature, so Cloud Storage rejects a PUT
 * whose body falls outside the range and rejects one that omits the header — the caller cannot
 * drop it without invalidating the signature they were given.
 *
 * Before this, size was checked only if the caller chose to call `confirm`, and nothing made
 * them. From an attacker's point of view verification was optional: mint a session, upload
 * something enormous, never confirm, repeat to the rate limit. The object stayed in the
 * bucket, unreferenced and unbilled to anyone but us.
 */
async function signedWriteUrl(path: string, contentType: string) {
  const bucket = adminStorage.bucket();
  const file = bucket.file(path);
  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 10 * 60 * 1000,
    contentType,
    extensionHeaders: { 'x-goog-content-length-range': `0,${MAX_UPLOAD_BYTES}` },
  });
  return {
    uploadUrl,
    bucketName: bucket.name,
    contentLengthRange: `0,${MAX_UPLOAD_BYTES}`,
  };
}

const SESSION_TTL_SECONDS = 600;

export async function POST(request: Request) {
  // Signed upload URLs are a capability to write into the storage bucket, so the request
  // that mints one is rate limited per account as well as App Check verified.
  const guarded = await requireAuthenticatedMutation(request, uploadSessionSchema, {
    maxBytes: 8 * 1024,
    invalidBodyError: 'Invalid upload request.',
    rateLimit: { bucket: 'upload_session', limit: 30, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;
  const { actor, data: input, requestId } = guarded;
  const extension = extensionFrom(input.fileName, input.contentType);

  const authorized = input.kind === 'match_evidence'
    ? await canUploadMatchEvidence(actor, input.matchId, input.teamId)
    : await canManagePublishedMedia(actor, input.ownerType, input.ownerId);
  if (!authorized) {
    return jsonError(
      input.kind === 'match_evidence'
        ? 'You are not authorized to upload evidence for this match and team.'
        : 'You are not authorized to upload media for this profile.',
      403,
    );
  }

  const storagePath = input.kind === 'match_evidence'
    ? `matchEvidence/${input.matchId}/${input.teamId}/${actor.uid}/${randomUUID()}.${extension}`
    : `publishedMedia/${input.ownerType}/${input.ownerId}/${actor.uid}/${randomUUID()}.${extension}`;

  const signed = await signedWriteUrl(storagePath, input.contentType);
  const sessionId = randomUUID();
  const now = new Date();

  // The authorization is recorded before the URL is handed out, so an upload can be
  // verified against what was actually authorized. Without this record the signed URL
  // was the only artefact, and nothing afterwards could check the declared size, enforce
  // single use, or tie the stored object back to a decision.
  await adminDb.collection('uploadSessions').doc(sessionId).set({
    id: sessionId,
    requestId,
    kind: input.kind,
    actorUserId: actor.uid,
    storagePath,
    declaredContentType: input.contentType,
    declaredSize: input.size,
    declaredFileName: input.fileName,
    ...(input.kind === 'match_evidence'
      ? { matchId: input.matchId, teamId: input.teamId }
      : { ownerType: input.ownerType, ownerId: input.ownerId }),
    status: 'authorized',
    expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
    createdAt: now.toISOString(),
  });

  return Response.json({
    sessionId,
    uploadUrl: signed.uploadUrl,
    storagePath,
    // Part of the signature, so the client must send it back verbatim as a request header.
    // Returned rather than assumed, so the limit lives in one place.
    contentLengthRange: signed.contentLengthRange,
    expiresInSeconds: SESSION_TTL_SECONDS,
    // Deliberately no download URL. A published address is issued only after the upload
    // is confirmed against its authorization and passes moderation.
    confirmEndpoint: '/api/uploads/session/confirm',
  }, { headers: { 'cache-control': 'no-store' } });
}
