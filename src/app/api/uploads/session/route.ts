import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { accessIndexId, type PermissionCapability } from '@/lib/auth/access';
import { jsonError, parseJsonBody, requireAuthenticatedUser, type AuthenticatedActor } from '@/server/api/security';

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

function encodedDownloadUrl(bucketName: string, objectPath: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

function actorIsPlatform(actor: AuthenticatedActor) {
  return actor.role === 'platform_admin' || actor.role === 'super_admin';
}

async function hasCapability(userId: string, scopeType: 'platform' | 'league' | 'team' | 'athlete', scopeId: string, capability: PermissionCapability) {
  const snapshot = await adminDb.collection('accessIndex').doc(accessIndexId(scopeType, scopeId, userId)).get();
  const capabilities = snapshot.data()?.capabilities;
  return Array.isArray(capabilities) && capabilities.includes(capability);
}

async function canManagePublishedMedia(actor: AuthenticatedActor, ownerType: 'user' | 'athlete' | 'team' | 'league', ownerId: string) {
  if (actorIsPlatform(actor) || await hasCapability(actor.uid, 'platform', 'global', 'platform.admin.manage')) return true;
  if (ownerType === 'user') return ownerId === actor.uid;
  if (ownerType === 'athlete') return hasCapability(actor.uid, 'athlete', ownerId, 'athlete.media.manage');
  if (ownerType === 'team') return hasCapability(actor.uid, 'team', ownerId, 'team.profile.manage');
  return hasCapability(actor.uid, 'league', ownerId, 'league.profile.manage');
}

async function canUploadMatchEvidence(actor: AuthenticatedActor, matchId: string, teamId: string) {
  if (actorIsPlatform(actor) || await hasCapability(actor.uid, 'platform', 'global', 'platform.admin.manage')) return true;
  const match = await adminDb.collection('matches').doc(matchId).get();
  if (!match.exists) return false;
  const data = match.data() ?? {};
  if (data.homeTeamId !== teamId && data.awayTeamId !== teamId) return false;
  return await hasCapability(actor.uid, 'team', teamId, 'team.result.submit')
    || await hasCapability(actor.uid, 'team', teamId, 'team.result.confirm');
}

async function signedWriteUrl(path: string, contentType: string) {
  const bucket = adminStorage.bucket();
  const file = bucket.file(path);
  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 10 * 60 * 1000,
    contentType,
  });
  return {
    uploadUrl,
    bucketName: bucket.name,
  };
}

export async function POST(request: Request) {
  const authenticated = await requireAuthenticatedUser(request);
  if ('response' in authenticated) return authenticated.response;
  const parsed = await parseJsonBody(request, uploadSessionSchema, { maxBytes: 8 * 1024 });
  if ('response' in parsed) return parsed.response;
  const actor = authenticated.actor;
  const input = parsed.data;
  const extension = extensionFrom(input.fileName, input.contentType);

  if (input.kind === 'match_evidence') {
    if (!await canUploadMatchEvidence(actor, input.matchId, input.teamId)) {
      return jsonError('You are not authorized to upload evidence for this match and team.', 403);
    }
    const storagePath = `matchEvidence/${input.matchId}/${input.teamId}/${actor.uid}/${randomUUID()}.${extension}`;
    const signed = await signedWriteUrl(storagePath, input.contentType);
    return Response.json({
      uploadUrl: signed.uploadUrl,
      storagePath,
      expiresInSeconds: 600,
    }, { headers: { 'cache-control': 'no-store' } });
  }

  if (!await canManagePublishedMedia(actor, input.ownerType, input.ownerId)) {
    return jsonError('You are not authorized to upload media for this profile.', 403);
  }
  const storagePath = `publishedMedia/${input.ownerType}/${input.ownerId}/${actor.uid}/${randomUUID()}.${extension}`;
  const signed = await signedWriteUrl(storagePath, input.contentType);
  return Response.json({
    uploadUrl: signed.uploadUrl,
    storagePath,
    downloadUrl: encodedDownloadUrl(signed.bucketName, storagePath),
    expiresInSeconds: 600,
  }, { headers: { 'cache-control': 'no-store' } });
}
