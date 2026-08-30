import type { Firestore } from 'firebase-admin/firestore';
import { hasCapability, hasCapabilityOrPlatformGrant } from '../access/capabilities';
import { decideOpenCase, type EvidenceRef, type ResultCase } from './resultCase';
import type { Match } from '../../types';

/**
 * Opening an adjudication, shared by every route that can start one.
 *
 * There are two: the address a current client uses, and the legacy
 * `/api/result-submissions/{matchId}/correction` that older bundles still call. They must not
 * be two correction systems — that is the exact shape of the problem this model replaces, where
 * corrections were bolted to the provenance that happened to be in front of somebody. So the
 * legacy address is a door into the same room rather than a second room.
 */

export type OpenInput = {
  db: Firestore;
  matchId: string;
  actorUid: string;
  /**
   * The version being challenged.
   *
   * Absent only from a legacy caller, which has no way to know it. Defaulting to the match's
   * current version is what that caller means, and it is a real if narrow loss: a legacy client
   * on a stale page cannot be told it is challenging a result that has already been superseded.
   * A current client always sends it and always gets that protection.
   */
  subjectVersion?: number;
  reason: string;
  evidence?: Array<Omit<EvidenceRef, 'addedByUserId' | 'addedAt'>>;
};

export type OpenResult =
  | { ok: true; caseId: string }
  | { ok: false; status: 403 | 404 | 409; error: string };

/**
 * Who may ask for a result to be looked at again.
 *
 * The league that governs the competition, either club in the fixture, or a platform operator.
 * A club raising a dispute is the case this exists for: the people who were there must be able
 * to say the record is wrong. What they cannot do is decide it, which is a separate check.
 */
export async function mayOpenResultCase(uid: string, match: Match): Promise<boolean> {
  if (await hasCapabilityOrPlatformGrant(
    uid, { scopeType: 'league', scopeId: match.leagueId }, 'league.result.resolve',
  )) return true;

  for (const teamId of [match.homeTeamId, match.awayTeamId]) {
    if (!teamId) continue;
    if (await hasCapability(uid, { scopeType: 'team', scopeId: teamId }, 'team.result.dispute')) {
      return true;
    }
  }
  return false;
}

export async function openResultCase(input: OpenInput): Promise<OpenResult> {
  const { db, matchId, actorUid } = input;

  const matchSnapshot = await db.collection('matches').doc(matchId).get();
  if (!matchSnapshot.exists) return { ok: false, status: 404, error: 'Match not found.' };
  const match = { id: matchSnapshot.id, ...matchSnapshot.data() } as Match;

  if (!await mayOpenResultCase(actorUid, match)) {
    return {
      ok: false,
      status: 403,
      error: 'You are not party to this result. Ask the league that governs this competition.',
    };
  }

  const officialResultVersion = (match as { officialResultVersion?: number }).officialResultVersion;
  const existing = await db.collection('resultCases').where('matchId', '==', matchId).get();
  const decision = decideOpenCase({
    matchId,
    officialResultVersion,
    subjectVersion: input.subjectVersion ?? officialResultVersion ?? 0,
    existingCases: existing.docs.map((doc) => ({
      id: doc.id,
      status: doc.data().status,
      subjectVersion: Number(doc.data().subjectVersion ?? 0),
    })),
  });
  if (!decision.ok) return { ok: false, status: 409, error: decision.reason };

  const now = new Date().toISOString();
  const adjudicatesLeague = await hasCapabilityOrPlatformGrant(
    actorUid, { scopeType: 'league', scopeId: match.leagueId }, 'league.result.resolve',
  );

  const record: ResultCase = {
    id: decision.caseId,
    matchId,
    leagueId: match.leagueId,
    seasonId: String((match as { seasonId?: string }).seasonId ?? ''),
    sport: String(match.sport ?? 'football'),
    subjectVersion: input.subjectVersion ?? officialResultVersion ?? 0,
    /*
     * Copied from the official version rather than referenced.
     *
     * The chain has to survive the source record becoming unreadable — archived, superseded, or
     * belonging to a workflow that has since been retired. A case that only pointed at its
     * source would lose its own provenance the day that happened.
     */
    subjectProvenance: (match as { officialResultProvenance?: ResultCase['subjectProvenance'] })
      .officialResultProvenance ?? null,
    status: 'open',
    openedByUserId: actorUid,
    openedByScope: adjudicatesLeague
      ? { scopeType: 'league', scopeId: match.leagueId }
      : { scopeType: 'team', scopeId: match.homeTeamId },
    reason: input.reason,
    openedAt: now,
    evidence: (input.evidence ?? []).map((entry) => ({
      ...entry, addedByUserId: actorUid, addedAt: now,
    })),
    updatedAt: now,
  };

  try {
    // `create`, not `set`. The id is deterministic from the sequence, so two people opening a
    // case in the same second must not have one silently overwrite the other.
    await db.collection('resultCases').doc(decision.caseId).create(record);
  } catch {
    return {
      ok: false,
      status: 409,
      error: 'A case was opened for this match at the same moment. Reload and add to it.',
    };
  }

  return { ok: true, caseId: decision.caseId };
}
