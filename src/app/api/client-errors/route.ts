import { z } from 'zod';
import { clientIpFrom, enforceRateLimit, jsonError } from '@/server/api/security';
import { goalPlaceEnvironment, publicEnvironment } from '@/lib/environment';

export const runtime = 'nodejs';

/**
 * Where an unhandled browser exception goes.
 *
 * ## What was missing
 *
 * Nothing. There was no client error tracking at all, so a page that threw for a real user was
 * invisible unless they said something. The server side is thoroughly instrumented —
 * `adminAuditEvents`, `securityEvents`, a submission event log, operational exceptions — and
 * the browser half had no counterpart.
 *
 * ## Why Cloud Logging and not a Firestore collection
 *
 * `console.error` from an App Hosting runtime lands in Cloud Logging, which is already where
 * every server log in this product goes and is queryable next to them. A `clientErrors`
 * collection would need a rules entry, would be writable by definition (that is the point),
 * and would give an unauthenticated caller a way to write unbounded documents to the database.
 * A log line has none of those properties and is the same thing an error tracker would show.
 *
 * ## The join
 *
 * `requireAuthenticatedMutation` already mints a `requestId` per mutation and writes it into
 * the audit entry. When a client failure follows a mutation it can pass that id back here, and
 * a browser error and the server-side record of what caused it become one query rather than
 * two timestamps somebody has to line up by eye.
 *
 * ## What this deliberately does not accept
 *
 * Arbitrary payloads. A reporting endpoint that echoes whatever it is given into the log is a
 * way to write attacker-controlled text into an operator's console, and a large one is a way
 * to bill you for log volume. Every field is bounded, the whole body is capped, and the route
 * is rate limited by IP.
 */

const bodySchema = z.object({
  message: z.string().trim().min(1).max(500),
  /** Truncated client-side; capped again here because the client is not trusted. */
  stack: z.string().trim().max(4_000).optional(),
  /** The route the failure happened on. Path only — see the note on query strings below. */
  path: z.string().trim().max(500).optional(),
  /** Next's error digest, which correlates to the server-side stack it redacted. */
  digest: z.string().trim().max(200).optional(),
  /** The requestId from a preceding mutation, when there was one. This is the join key. */
  requestId: z.string().trim().max(200).optional(),
  kind: z.enum(['render', 'unhandled_rejection', 'window_error']).optional(),
});

const MAX_BYTES = 8_192;

export async function POST(request: Request) {
  // Before parsing. An error reporter is an unauthenticated endpoint by necessity — the
  // failure it reports may be the one that stopped the user signing in — so the only thing
  // standing between it and unbounded log volume is this.
  const limited = await enforceRateLimit({
    bucket: 'client_error_report',
    identity: [clientIpFrom(request)],
    limit: 20,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const raw = await request.text().catch(() => '');
  if (raw.length > MAX_BYTES) return jsonError('Report too large.', 413);

  const parsed = bodySchema.safeParse(JSON.parse(raw || '{}'));
  if (!parsed.success) return jsonError('Invalid error report.', 400);
  const report = parsed.data;

  const identity = publicEnvironment();
  console.error('GoalPlace256 client error', {
    reason: 'client_error',
    environment: goalPlaceEnvironment(),
    build: identity.environmentVersion,
    message: report.message,
    kind: report.kind ?? 'render',
    path: report.path,
    digest: report.digest,
    // The join to the server side. An audit entry carries the same id.
    requestId: report.requestId,
    stack: report.stack,
    userAgent: request.headers.get('user-agent')?.slice(0, 300),
  });

  // 204: the client has nothing to do with the answer, and a body would only invite a
  // reporter that retries on a shape it did not expect.
  return new Response(null, { status: 204 });
}
