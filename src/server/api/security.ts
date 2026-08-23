import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { OAuth2Client } from 'google-auth-library';
import type { z } from 'zod';
import { adminAppCheck, adminAuth, adminDb } from '@/lib/firebase/admin';
import { resolveAccountClass } from '@/lib/auth/accountClass';
import type { AccessScopeType, PermissionCapability } from '@/lib/auth/access';
import { hasCapability, hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import type { AccountClass, AppRole, UserProfile } from '@/types';

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
  // `checkRevoked: true`, not the bare verify this used to do.
  //
  // Suspension revokes refresh tokens, but a bare verify accepts any ID token that has not
  // yet reached its natural expiry — so a compromised session stayed usable for up to an
  // hour after an operator pressed Suspend. Revocation-aware verification is what makes the
  // button mean something immediately. It costs a lookup per request, which is the correct
  // trade for an authority engine.
  const actor = await adminAuth.verifyIdToken(token, true).catch(() => null);
  if (!actor) return { response: jsonError('Your session is invalid or expired.', 401) } as const;
  return { actor } as const;
}

/**
 * The account behind the token, and whether it may still act.
 *
 * Revocation closes the token window; this closes the account-state window. A principal
 * whose account is suspended, disabled or pending deletion must not be able to mutate
 * anything, even holding a technically valid token issued moments before.
 */
const INACTIVE_ACCOUNT_STATUSES = ['suspended', 'disabled', 'deletion_pending'];

export async function requireActivePrincipal(actor: AuthenticatedActor) {
  const profile = await adminDb.collection('users').doc(actor.uid).get();
  const data = profile.data();
  if (!data) return null;
  const status = typeof data.accountStatus === 'string' ? data.accountStatus : undefined;
  const legacyStatus = typeof data.status === 'string' ? data.status : undefined;
  if ((status && INACTIVE_ACCOUNT_STATUSES.includes(status))
    || (legacyStatus && INACTIVE_ACCOUNT_STATUSES.includes(legacyStatus))) {
    return jsonError('This account is not active.', 403);
  }
  return null;
}

export function requireRole(actor: AuthenticatedActor, roles: string[], message = 'You do not have permission to perform this action.') {
  return roles.includes(String(actor.role))
    ? null
    : jsonError(message, 403);
}

type PrincipalProfile = Pick<UserProfile, 'accountClass' | 'role'>;

export function isFanAccountPrincipal(
  actor: AuthenticatedActor,
  profile?: FirebaseFirestore.DocumentData | null,
): boolean {
  const claimRole = typeof actor.role === 'string' ? actor.role : null;
  const claimAccountClass = typeof actor.accountClass === 'string' ? actor.accountClass : null;
  const profileRole = typeof profile?.role === 'string' ? profile.role : null;
  const profileAccountClass = typeof profile?.accountClass === 'string' ? profile.accountClass : null;
  const principalProfile: PrincipalProfile | null = profile ? {
    accountClass: profile.accountClass as UserProfile['accountClass'],
    role: (profileRole ?? 'fan') as AppRole,
  } : null;
  const accountClass = resolveAccountClass({
    accountClass: actor.accountClass,
    role: claimRole ?? profileRole,
    profile: principalProfile,
  });
  const hasFanEvidence = claimRole === 'fan'
    || profileRole === 'fan'
    || claimAccountClass === 'fan'
    || profileAccountClass === 'fan';

  return hasFanEvidence
    && accountClass === 'fan'
    && (!claimRole || claimRole === 'fan')
    && (!profileRole || profileRole === 'fan');
}

export async function requireFanAccountPrincipal(
  actor: AuthenticatedActor,
  message = 'This action is available to Fan accounts only.',
) {
  const profile = await adminDb.collection('users').doc(actor.uid).get();
  if (!isFanAccountPrincipal(actor, profile.data())) {
    return { response: jsonError(message, 403) } as const;
  }
  return { profile } as const;
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

/**
 * The one hardened path for an authenticated mutation.
 *
 * Every sensitive write goes through here so that authentication, App Check, body
 * limits, schema validation, rate limiting, account-class separation and scoped
 * capability authorization are applied in the same order, with the same failure
 * semantics, every time. Routes that hand-rolled a subset of these each enforced a
 * slightly different policy, which is how App Check ended up configurable but
 * unenforced on the routes that mattered most.
 *
 * Checks run cheapest-first and fail closed. Capability authorization is last because
 * it costs a Firestore read, and there is no reason to pay for it on a request that
 * fails validation.
 */
export async function requireAuthenticatedMutation<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  options: {
    maxBytes: number;
    invalidBodyError: string;
    authError?: string;
    rateLimit?: {
      bucket: string;
      limit: number;
      windowSeconds: number;
      identity?: (input: {
        actor: AuthenticatedActor;
        data: z.infer<T>;
        appId: string;
        request: Request;
      }) => string[];
    };
    /**
     * Account classes permitted to call this route at all. The separate-account model
     * is a security boundary, not a UI preference: a Fan account must not reach an
     * operator mutation even while holding a scoped assignment.
     */
    accountClass?: AccountClass | AccountClass[];
    accountClassError?: string;
    /**
     * Scoped capability required for this mutation, derived from the validated body.
     * Returning `null` skips the check — use that only where the handler performs its
     * own equivalent authorization.
     */
    capability?: {
      resolve: (data: z.infer<T>) => { capability: PermissionCapability; scopeType: AccessScopeType; scopeId: string } | null;
      /** Allow a platform-global grant of this capability to satisfy the check. */
      allowPlatformGrant?: PermissionCapability | false;
      error?: string;
    };
  },
): Promise<
  | { actor: AuthenticatedActor; data: z.infer<T>; appId: string; requestId: string }
  | { response: Response }
> {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) {
    const authResponse = auth.response ?? jsonError('Authentication required.', 401);
    return {
      response: options.authError
        ? jsonError(options.authError, authResponse.status)
        : authResponse,
    };
  }

  const parsed = await parseJsonBody(request, schema, { maxBytes: options.maxBytes });
  if ('response' in parsed) {
    return {
      response: jsonError(options.invalidBodyError, parsed.response.status),
    };
  }

  // Checked on every mutation rather than only inside the platform command guard, so a
  // suspended operator cannot write through any route that skipped that guard.
  const inactive = await requireActivePrincipal(auth.actor);
  if (inactive) return { response: inactive };

  const appCheck = await verifyOptionalAppCheck(request);
  if ('response' in appCheck) {
    return { response: appCheck.response ?? jsonError('App Check required.', 401) };
  }

  if (options.rateLimit) {
    const limited = await enforceRateLimit({
      bucket: options.rateLimit.bucket,
      identity: [
        auth.actor.uid,
        appCheck.appId,
        clientIpFrom(request),
        ...(options.rateLimit.identity?.({
          actor: auth.actor,
          data: parsed.data,
          appId: appCheck.appId,
          request,
        }) ?? []),
      ],
      limit: options.rateLimit.limit,
      windowSeconds: options.rateLimit.windowSeconds,
    });
    if (limited) return { response: limited };
  }

  if (options.accountClass) {
    const allowed = Array.isArray(options.accountClass) ? options.accountClass : [options.accountClass];
    const profile = await adminDb.collection('users').doc(auth.actor.uid).get();
    const data = profile.data();
    const accountClass = resolveAccountClass({
      accountClass: auth.actor.accountClass ?? data?.accountClass,
      role: (typeof auth.actor.role === 'string' ? auth.actor.role : null)
        ?? (typeof data?.role === 'string' ? data.role : null),
    });
    if (!allowed.includes(accountClass)) {
      return {
        response: jsonError(
          options.accountClassError
            ?? `This action requires a ${allowed.join(' or ')} account.`,
          403,
        ),
      };
    }
  }

  if (options.capability) {
    const required = options.capability.resolve(parsed.data);
    if (required) {
      const platformCapability = options.capability.allowPlatformGrant === false
        ? null
        : options.capability.allowPlatformGrant ?? 'platform.admin.manage';
      const granted = platformCapability
        ? await hasCapabilityOrPlatformGrant(
            auth.actor.uid,
            { scopeType: required.scopeType, scopeId: required.scopeId },
            required.capability,
            platformCapability,
          )
        : await hasCapability(
            auth.actor.uid,
            { scopeType: required.scopeType, scopeId: required.scopeId },
            required.capability,
          );
      if (!granted) {
        return {
          response: jsonError(
            options.capability.error ?? 'You do not have permission to perform this action.',
            403,
          ),
        };
      }
    }
  }

  // One correlation id per mutation, so an audit event, a security event and a client
  // error report can all be tied to the same request.
  return { actor: auth.actor, data: parsed.data, appId: appCheck.appId, requestId: randomUUID() };
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
