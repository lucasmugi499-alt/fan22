import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { Principal } from '@/kernel/principal';
import type { FieldManagerAssignment, MatchAccessSession } from '@/types';

/**
 * The Match Ops principal: a parallel authority system, not a variant of the authenticated
 * one.
 *
 * ADR-002. The two systems are siblings that never meet. A Match Ops session holds an opaque
 * bearer token, has no Firebase Auth user, no access assignment and no accessIndex document,
 * and never satisfies `request.auth != null`.
 *
 * The alternative, minting a Firebase user for each match worker, was rejected because it
 * would make `request.auth != null` true for anyone holding a URL, across every rule in the
 * file rather than only the ones intended. Isolation would then depend on every current and
 * future rule remembering to exclude one uid pattern, which is security by continuous
 * vigilance rather than by structure.
 *
 * Every write from this principal travels through an Admin SDK route, so Field Capture adds
 * no new client-write surface at all.
 */

const SESSIONS = 'matchAccessSessions';
const ASSIGNMENTS = 'fieldManagerAssignments';

/** Five wrong PINs locks the assignment. Deliberately not per IP: a stadium shares one hotspot. */
export const MAX_PIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60_000;

export function hashSecret(secret: string, salt = '') {
  return createHash('sha256').update(`${salt}${secret}`).digest('hex');
}

/** Constant-time, so a hash comparison cannot be turned into an oracle by timing it. */
export function secretMatches(supplied: string, expectedHash: string, salt = '') {
  const suppliedHash = Buffer.from(hashSecret(supplied, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (suppliedHash.length !== expected.length) return false;
  return timingSafeEqual(suppliedHash, expected);
}

/** 256 bits, and never a matchId: the link must not be guessable from a fixture list. */
export function mintBootstrapSecret() {
  return randomBytes(32).toString('base64url');
}

export function mintSessionToken() {
  return randomBytes(32).toString('base64url');
}

/** Six digits, spoken aloud or sent separately from the link. */
export function mintPin() {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

export type MatchOpsSession = {
  sessionId: string;
  matchId: string;
  assignmentId: string;
  sessionGeneration: number;
  fieldManagerId: string;
  leagueId: string;
  displayLabel?: string;
};

export type MatchOpsAuthFailure = { response: Response };

function unauthorized() {
  // One message for every failure. See requireMatchOpsSession.
  return {
    response: Response.json({ error: 'This match link is not valid.' }, { status: 401 }),
  };
}

export function bearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/**
 * Resolve a Match Ops bearer token to a session, or refuse.
 *
 * The sibling of `requireAuthenticatedMutation`, and deliberately not built on it: that
 * function's every check assumes a Firebase identity, an account class and an accessIndex
 * projection, none of which exist here. Sharing the entry point would mean one of them
 * eventually growing a branch that treats a match worker as a user.
 *
 * Every refusal returns the same message and status. A caller must not be able to learn from
 * the response whether the token was wrong, the window had closed, the assignment was
 * revoked, or the match had already been submitted.
 */
export async function requireMatchOpsSession(
  request: Request,
  matchId: string,
  now: Date = new Date(),
): Promise<{ session: MatchOpsSession } | MatchOpsAuthFailure> {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  const tokenHash = hashSecret(token);
  const matches = await adminDb
    .collection(SESSIONS)
    .where('sessionTokenHash', '==', tokenHash)
    .limit(1)
    .get();

  const snapshot = matches.docs[0];
  if (!snapshot) return unauthorized();
  const session = { id: snapshot.id, ...snapshot.data() } as MatchAccessSession;

  if (session.matchId !== matchId) return unauthorized();
  if (session.revokedAt) return unauthorized();
  if (Date.parse(session.expiresAt) <= now.getTime()) return unauthorized();

  const assignmentSnapshot = await adminDb.collection(ASSIGNMENTS).doc(session.assignmentId).get();
  if (!assignmentSnapshot.exists) return unauthorized();
  const assignment = { id: assignmentSnapshot.id, ...assignmentSnapshot.data() } as FieldManagerAssignment;
  if (assignment.status === 'cancelled') return unauthorized();
  if (Date.parse(assignment.accessExpiresAt) <= now.getTime()) return unauthorized();

  return {
    session: {
      sessionId: session.id,
      matchId: session.matchId,
      assignmentId: session.assignmentId,
      sessionGeneration: session.sessionGeneration,
      fieldManagerId: assignment.fieldManagerId,
      leagueId: assignment.leagueId,
    },
  };
}

/**
 * The principal an official record records for work done in this session.
 *
 * `displayLabel` is a label for whoever reads the audit trail later, and deliberately not an
 * identity: nothing authorizes from it, and it is safe for it to be a first name and an
 * initial because that is what a league actually knows about the person on the touchline.
 */
export function matchOpsPrincipal(session: MatchOpsSession, displayLabel?: string): Principal {
  return {
    principalType: 'match_ops_session',
    matchSessionId: session.sessionId,
    fieldManagerAssignmentId: session.assignmentId,
    ...(displayLabel ? { displayLabel } : {}),
  };
}

export type LockoutState = { locked: boolean; lockedUntil?: string };

/** Whether this assignment is currently locked out, and until when. */
export function lockoutState(session: Pick<MatchAccessSession, 'lockedUntil'>, now: Date): LockoutState {
  if (!session.lockedUntil) return { locked: false };
  const until = Date.parse(session.lockedUntil);
  if (Number.isNaN(until) || until <= now.getTime()) return { locked: false };
  return { locked: true, lockedUntil: session.lockedUntil };
}

/** Records a failed PIN attempt and locks the assignment once the threshold is reached. */
export async function recordFailedAttempt(sessionId: string, attempts: number, now: Date) {
  const next = attempts + 1;
  const locked = next >= MAX_PIN_ATTEMPTS;
  await adminDb.collection(SESSIONS).doc(sessionId).update({
    attempts: next,
    ...(locked ? { lockedUntil: new Date(now.getTime() + LOCKOUT_MS).toISOString() } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { locked, attempts: next };
}
