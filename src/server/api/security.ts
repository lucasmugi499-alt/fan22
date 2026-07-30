import { timingSafeEqual } from 'node:crypto';
import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { OAuth2Client } from 'google-auth-library';
import type { z } from 'zod';
import { adminAppCheck, adminAuth, adminDb } from '@/lib/firebase/admin';

export type AuthenticatedActor = Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;

type RateLimitOptions = {
  bucket: string;
  identity: string[];
  limit: number;
  windowSeconds: number;
};

type SchedulerOptions = {
  operation: string;
  legacySecretHeader?: string;
  legacySecretEnv?: string;
};

const oauthClient = new OAuth2Client();

export function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } });
}

export function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

export async function requireAuthenticatedUser(request: Request) {
  const token = bearerToken(request);
  if (!token) return { response: jsonError('Authentication required.', 401) } as const;
  const actor = await adminAuth.verifyIdToken(token).catch(() => null);
  if (!actor) return { response: jsonError('Your session is invalid or expired.', 401) } as const;
  return { actor } as const;
}

export function requireRole(actor: AuthenticatedActor, roles: string[], message = 'You do not have permission to perform this action.') {
  return roles.includes(String(actor.role))
    ? null
    : jsonError(message, 403);
}

export async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  options: { maxBytes: number },
): Promise<{ data: z.infer<T> } | { response: Response }> {
  const text = await request.text().catch(() => '');
  if (Buffer.byteLength(text, 'utf8') > options.maxBytes) {
    return { response: jsonError('Request body is too large.', 413) };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text || 'null');
  } catch {
    return { response: jsonError('Request body must be valid JSON.', 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { response: jsonError('Invalid request body.', 400) };
  return { data: parsed.data };
}

export function safeSecretEquals(supplied: string | null, expected: string | undefined) {
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function clientIpFrom(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return request.headers.get('x-real-ip') ?? forwarded ?? 'unknown';
}

function hashParts(parts: string[]) {
  return createHash('sha256').update(parts.filter(Boolean).join(':')).digest('hex');
}

export async function verifyOptionalAppCheck(request: Request) {
  const token = request.headers.get('x-firebase-appcheck');
  const required = process.env.GOALPLACE_REQUIRE_APP_CHECK === 'true';
  if (!token) {
    if (required) return { response: jsonError('App Check required.', 401) } as const;
    return { appId: 'unverified-app' } as const;
  }
  const decoded = await adminAppCheck.verifyToken(token).catch(() => null);
  if (!decoded) {
    if (required) return { response: jsonError('App Check verification failed.', 401) } as const;
    return { appId: 'invalid-app-check' } as const;
  }
  return { appId: decoded.appId } as const;
}

export async function enforceRateLimit(options: RateLimitOptions) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + options.windowSeconds * 1000);
  const rateId = hashParts([options.bucket, ...options.identity]);
  const ref = adminDb.collection('apiRateLimits').doc(rateId);
  const allowed = await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    const existingExpiry = data?.expiresAt?.toDate?.() as Date | undefined;
    const count = existingExpiry && existingExpiry > now ? Number(data?.count ?? 0) : 0;
    if (count >= options.limit) return false;
    transaction.set(ref, {
      id: rateId,
      bucket: options.bucket,
      count: count + 1,
      expiresAt: Timestamp.fromDate(expiresAt),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  return allowed ? null : jsonError('Too many requests. Please try again later.', 429);
}

async function verifySchedulerOidc(request: Request) {
  const token = bearerToken(request);
  if (!token) return false;
  const audience = process.env.GOALPLACE_SCHEDULER_AUDIENCE ?? request.url;
  const allowedEmails = (process.env.GOALPLACE_SCHEDULER_SERVICE_ACCOUNT_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  if (!allowedEmails.length) return false;
  const ticket = await oauthClient.verifyIdToken({ idToken: token, audience }).catch(() => null);
  const payload = ticket?.getPayload();
  const email = payload?.email;
  return Boolean(email && allowedEmails.includes(email));
}

export async function requireSchedulerRequest(request: Request, options: SchedulerOptions) {
  if (process.env.GOALPLACE_SCHEDULER_AUTH_MODE === 'oidc') {
    if (await verifySchedulerOidc(request)) return null;
    return jsonError('Trusted scheduler identity required.', 401);
  }

  const secretHeader = options.legacySecretHeader ?? 'x-goalplace-scheduler-secret';
  const secretEnv = options.legacySecretEnv ?? 'GOALPLACE_SCHEDULER_SECRET';
  if (safeSecretEquals(request.headers.get(secretHeader), process.env[secretEnv])) return null;

  return jsonError(`Trusted scheduler authorization required for ${options.operation}.`, 401);
}
