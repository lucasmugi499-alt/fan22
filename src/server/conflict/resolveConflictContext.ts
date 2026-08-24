import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import type { Principal } from '@/kernel/principal';
import type { TeamAffiliation, TeamRelationship } from '@/types';

/**
 * Should this principal decide this match, as opposed to may they act at all?
 *
 * Authorization and conflict are separate checks and neither substitutes for the other.
 * `resolveActor()` answers "does this person have standing here"; this answers "do they have
 * a stake in the outcome". A League Admin holding `league.result.resolve` on a match
 * involving the club they coach passes the first and fails the second.
 *
 * Shipped in Phase A rather than Phase E, where ADR-005 places the policy. The reason is
 * that Phase A is what breaks the old detection: the self-confirmation guard reads conflict
 * out of team-scoped authority, and zeroing the team bundles empties that everywhere at
 * once. Collecting declarations in A and reading them in E would leave a window in which
 * nothing detects a conflict and nothing looks wrong.
 *
 * ## What this cannot do
 *
 * It detects declared conflicts. It cannot detect undeclared ones, and no schema fixes that.
 * The mitigations are governance: declaring is a condition of holding a League Admin
 * assignment, a false declaration is a trust case, and resolution decisions are attributed in
 * the result provenance so a pattern is visible after the fact even when it was invisible
 * before.
 */

export type ConflictBasis = 'declared' | 'league_recorded' | 'legacy_assignment';

export type ConflictContext = {
  principal: Principal;
  matchId: string;
  affiliatedTeamIds: string[];
  relationships: TeamRelationship[];
  /** True when at least one affiliation names a team playing in this match. */
  conflictWithMatch: boolean;
  basis: ConflictBasis | null;
};

function isLive(affiliation: TeamAffiliation, now: Date) {
  if (affiliation.status !== 'active') return false;
  if (Date.parse(affiliation.effectiveFrom) > now.getTime()) return false;
  if (affiliation.effectiveTo && Date.parse(affiliation.effectiveTo) <= now.getTime()) return false;
  return true;
}

/** Every live affiliation this user has declared or had recorded for them. */
export async function activeAffiliationsForUser(
  userId: string,
  now: Date = new Date(),
): Promise<TeamAffiliation[]> {
  if (!userId) return [];
  const snapshot = await adminDb
    .collection('teamAffiliations')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as TeamAffiliation)
    .filter((affiliation) => isLive(affiliation, now));
}

/**
 * Conflict state for one principal on one match.
 *
 * A match ops session and a system principal are never conflicted: neither is a person with
 * a club allegiance, and a Field Manager's affiliation is recorded on the assignment and
 * carried into provenance rather than adjudicated here.
 */
export async function resolveConflictContext(input: {
  principal: Principal;
  matchId: string;
  now?: Date;
}): Promise<ConflictContext> {
  const { principal, matchId } = input;
  const now = input.now ?? new Date();

  const empty: ConflictContext = {
    principal,
    matchId,
    affiliatedTeamIds: [],
    relationships: [],
    conflictWithMatch: false,
    basis: null,
  };

  if (principal.principalType !== 'user') return empty;

  const [affiliations, matchSnapshot] = await Promise.all([
    activeAffiliationsForUser(principal.userId, now),
    adminDb.collection('matches').doc(matchId).get(),
  ]);

  if (!affiliations.length) return empty;

  const match = matchSnapshot.data() ?? {};
  const playingTeamIds = new Set(
    [match.homeTeamId, match.awayTeamId].filter((id): id is string => typeof id === 'string' && Boolean(id)),
  );

  const conflicting = affiliations.filter((affiliation) => playingTeamIds.has(affiliation.teamId));

  return {
    principal,
    matchId,
    affiliatedTeamIds: [...new Set(affiliations.map((affiliation) => affiliation.teamId))],
    relationships: [...new Set(conflicting.map((affiliation) => affiliation.relationship))],
    conflictWithMatch: conflicting.length > 0,
    // The strongest basis present: something the league recorded outranks a self-declaration
    // when explaining why a decision was escalated.
    basis: conflicting.some((a) => a.basis === 'league_recorded')
      ? 'league_recorded'
      : conflicting.length
        ? 'declared'
        : null,
  };
}
