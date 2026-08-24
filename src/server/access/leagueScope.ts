import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import type { PermissionCapability } from '@/lib/auth/access';
import { hasCapability } from './capabilities';

/**
 * Team and athlete authority, resolved to the league that governs them.
 *
 * ADR-004 retired team-scoped authority: every `team.*` bundle was versioned to zero, so a
 * check against a team scope now returns false for everyone. Thirteen server routes did
 * exactly that, and every one of them would have started refusing silently rather than
 * failing loudly, because a capability check that returns false is indistinguishable from a
 * user who simply lacks the capability.
 *
 * The replacement is one resolution path rather than thirteen. A team belongs to a league, an
 * athlete belongs to a team, and the League Admin governs both, so the question "may this
 * user act on this team" becomes "does this user hold this capability in the league that owns
 * this team".
 *
 * Resolved by lookup rather than by a denormalized league id on the athlete, so there is one
 * place that decides which league owns a team and no second copy to drift.
 */

export async function leagueIdForTeam(teamId: string): Promise<string | null> {
  if (!teamId) return null;
  const snapshot = await adminDb.collection('teams').doc(teamId).get();
  const leagueId = snapshot.data()?.leagueId;
  return typeof leagueId === 'string' && leagueId ? leagueId : null;
}

export async function leagueIdForAthlete(athleteId: string): Promise<string | null> {
  if (!athleteId) return null;
  const snapshot = await adminDb.collection('athletes').doc(athleteId).get();
  const data = snapshot.data();
  // The athlete's own leagueId when it is recorded, and the team's otherwise. Both are
  // written by the League; the team is the authority when they disagree, because roster
  // membership is what registration actually turns on.
  const teamLeagueId = typeof data?.teamId === 'string' ? await leagueIdForTeam(data.teamId) : null;
  if (teamLeagueId) return teamLeagueId;
  const leagueId = data?.leagueId;
  return typeof leagueId === 'string' && leagueId ? leagueId : null;
}

/**
 * Does this user hold this league capability in the league that owns this team?
 *
 * A platform-global grant of the same capability also satisfies it, which is how Platform's
 * exceptional reach works everywhere else in the access engine.
 */
export async function hasLeagueCapabilityForTeam(
  userId: string,
  teamId: string,
  capability: PermissionCapability,
  platformCapability: PermissionCapability = 'platform.admin.manage',
): Promise<boolean> {
  const [leagueId, platformGrant] = await Promise.all([
    leagueIdForTeam(teamId),
    hasCapability(userId, { scopeType: 'platform', scopeId: 'global' }, platformCapability),
  ]);
  if (platformGrant) return true;
  if (!leagueId) return false;
  return hasCapability(userId, { scopeType: 'league', scopeId: leagueId }, capability);
}

export async function hasLeagueCapabilityForAthlete(
  userId: string,
  athleteId: string,
  capability: PermissionCapability,
  platformCapability: PermissionCapability = 'platform.athlete.manage',
): Promise<boolean> {
  const [leagueId, platformGrant] = await Promise.all([
    leagueIdForAthlete(athleteId),
    hasCapability(userId, { scopeType: 'platform', scopeId: 'global' }, platformCapability),
  ]);
  if (platformGrant) return true;
  if (!leagueId) return false;
  return hasCapability(userId, { scopeType: 'league', scopeId: leagueId }, capability);
}
