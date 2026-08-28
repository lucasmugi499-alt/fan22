import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import type { LifecycleDependencies } from '@/lib/platform/lifecycle';
import { NO_DEPENDENCIES } from '@/lib/platform/lifecycle';
import type { MergeDependencies } from '@/lib/platform/merge';

/**
 * What is actually attached to an object, counted at the moment of the decision.
 *
 * Counted rather than read from a stored aggregate on purpose. `league.teamsCount` and
 * `athlete.totalSupport` are projections, and a projection that has drifted low is exactly
 * the condition under which a hard delete would look safe and destroy real records. The cost
 * is a handful of count queries on a rare operation, which is the right trade.
 *
 * Counts are capped by Firestore's aggregate query, so these are cheap: the server never
 * loads the documents, only how many there are.
 */

export type NetworkObjectKind = 'league' | 'team' | 'athlete';

async function countWhere(
  collection: string,
  field: string,
  value: string,
  extra?: { field: string; value: string }[],
): Promise<number> {
  let query = adminDb.collection(collection).where(field, '==', value) as FirebaseFirestore.Query;
  for (const clause of extra ?? []) {
    query = query.where(clause.field, '==', clause.value);
  }
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

/**
 * Audit entries naming this object, EXCLUDING the one that recorded its creation.
 *
 * Counting every entry made the hard-delete path unreachable: creating anything writes an
 * audit event naming it, so a league was born with one audit dependency and could never
 * qualify as "a draft with nothing attached". The rule was vacuous rather than strict, which
 * is worse — it read as a safety property while never being exercised.
 *
 * Excluding the creation entry restores the intent. A draft whose only history is "someone
 * made this" is still a pristine mistake; a draft someone has since archived, restored or
 * edited has a history worth keeping. The audit entries themselves are never deleted either
 * way: they are designed to outlive the rows they describe, which is the other reason
 * treating them as a blocker was the wrong shape.
 */
const CREATION_ACTIONS = new Set([
  'platform.network.createLeague',
  'platform.network.createTeam',
  'platform.athlete.createProfile',
]);

async function countAuditEvents(targetId: string): Promise<number> {
  // Bounded: this only decides "is there history beyond creation", and it runs on a path
  // that already requires a draft, so a handful of documents is the realistic ceiling.
  const snapshot = await adminDb
    .collection('adminAuditEvents')
    .where('targetId', '==', targetId)
    .limit(25)
    .get();
  return snapshot.docs.filter((entry) => !CREATION_ACTIONS.has(entry.data()?.action)).length;
}

/**
 * Official results are counted with the same rule the rest of the app uses —
 * `status: completed` AND `verificationStatus: verified` — rather than a separate predicate
 * that could drift from `isOfficialMatch`.
 */
async function countOfficialMatches(field: 'leagueId' | 'teamId', value: string): Promise<number> {
  if (field === 'leagueId') {
    return countWhere('matches', 'leagueId', value, [
      { field: 'status', value: 'completed' },
      { field: 'verificationStatus', value: 'verified' },
    ]);
  }
  // A team appears as either side of a fixture, so both are counted and summed.
  const [home, away] = await Promise.all([
    countWhere('matches', 'homeTeamId', value, [
      { field: 'status', value: 'completed' },
      { field: 'verificationStatus', value: 'verified' },
    ]),
    countWhere('matches', 'awayTeamId', value, [
      { field: 'status', value: 'completed' },
      { field: 'verificationStatus', value: 'verified' },
    ]),
  ]);
  return home + away;
}

export async function networkDependencies(
  kind: NetworkObjectKind,
  id: string,
): Promise<LifecycleDependencies> {
  if (kind === 'league') {
    const [teams, matches, officialMatches, athletes, payments, auditEvents] = await Promise.all([
      countWhere('teams', 'leagueId', id),
      countWhere('matches', 'leagueId', id),
      countOfficialMatches('leagueId', id),
      countWhere('athletes', 'leagueId', id),
      countWhere('supportPledges', 'leagueId', id),
      countAuditEvents(id),
    ]);
    return { ...NO_DEPENDENCIES, teams, matches, officialMatches, athletes, payments, auditEvents };
  }

  if (kind === 'team') {
    const [homeMatches, awayMatches, officialMatches, athletes, payments, auditEvents] = await Promise.all([
      countWhere('matches', 'homeTeamId', id),
      countWhere('matches', 'awayTeamId', id),
      countOfficialMatches('teamId', id),
      countWhere('athletes', 'teamId', id),
      countWhere('supportPledges', 'teamId', id),
      countAuditEvents(id),
    ]);
    return {
      ...NO_DEPENDENCIES,
      matches: homeMatches + awayMatches,
      officialMatches,
      athletes,
      payments,
      auditEvents,
    };
  }

  // An athlete's dependencies are money and audit. Appearances live in match events rather
  // than on the athlete document, so a played match does not by itself pin the profile —
  // but any pledge naming them does, and so does any audit entry.
  const [payments, auditEvents] = await Promise.all([
    countWhere('supportPledges', 'athleteId', id),
    countAuditEvents(id),
  ]);
  return { ...NO_DEPENDENCIES, payments, auditEvents };
}

/**
 * What a merge would move, and what it would leave where it is.
 *
 * A different question from `networkDependencies`, which asks "is this safe to destroy".
 * Merging destroys nothing, so the counts it needs are split by whether a record looks
 * forward or backward: a scheduled fixture moves to the survivor, a played one does not.
 *
 * Counted at the moment of the decision, for the same reason: an operator confirming a merge
 * is shown these numbers, and a number read from a drifted aggregate would be a number they
 * approved on false evidence.
 */
export async function mergeDependencies(
  kind: 'team' | 'athlete',
  id: string,
): Promise<MergeDependencies> {
  if (kind === 'team') {
    const [officialMatches, scheduledHome, scheduledAway, athletes, payments, activeAssignments] =
      await Promise.all([
        countOfficialMatches('teamId', id),
        countWhere('matches', 'homeTeamId', id, [{ field: 'status', value: 'scheduled' }]),
        countWhere('matches', 'awayTeamId', id, [{ field: 'status', value: 'scheduled' }]),
        countWhere('athletes', 'teamId', id),
        countWhere('supportPledges', 'teamId', id),
        countWhere('accessAssignments', 'scopeId', id, [{ field: 'status', value: 'active' }])
          .catch(() => 0),
      ]);
    return {
      officialMatches,
      scheduledMatches: scheduledHome + scheduledAway,
      athletes,
      payments,
      activeAssignments,
    };
  }

  /*
   * An athlete's official history lives in match events rather than on the athlete document,
   * so it is not counted here. The merge pointer is what makes a split career read as one;
   * nothing about those events changes, and claiming a count we cannot cheaply verify would
   * put a number on the confirmation screen that no query stands behind.
   */
  const [payments, activeAssignments] = await Promise.all([
    countWhere('supportPledges', 'athleteId', id),
    countWhere('accessAssignments', 'subjectAthleteId', id, [{ field: 'status', value: 'active' }])
      .catch(() => 0),
  ]);
  return {
    officialMatches: 0,
    scheduledMatches: 0,
    athletes: 0,
    payments,
    activeAssignments,
  };
}
