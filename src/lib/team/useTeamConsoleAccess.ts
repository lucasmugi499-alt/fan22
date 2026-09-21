'use client';

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthProvider';
import {
  canCreateAthleteInScope,
  canManageTeamInScope,
  hasScopeCapability,
} from '@/lib/auth/access';

/**
 * What the club console may actually do, asked of the authority model rather than the role.
 *
 * ## The failure this closes
 *
 * ADR-004 retired Team Admin as an account class, and the deployed environments run
 * `GOALPLACE_TEAM_AUTHORITY_STAGE=retired`, which versions the team bundles to zero
 * capabilities. The console was given a sunset banner saying it is read-only — and then kept
 * rendering every write control it always had. A banner that says read-only above a working
 * Save button is a control that lies twice, and the second lie undoes the first.
 *
 * ## ADR-005, and what changed here
 *
 * Club operations came back under `club_operator`, with capabilities that are all proposals
 * and evidence and none of which is official. This hook is where the console learns them. It
 * had checked only the league's `league.team.manage` and the retired `team.result.submit`, so
 * a Club Operator holding the whole new bundle would have seen a read-only club with a banner
 * explaining that their authority had moved — which is the exact lie ADR-005 exists to end.
 *
 * ## Why capability rather than the stage
 *
 * The capability index is the same thing the SERVER checks, read through the same projections
 * Firestore Rules read. So a control renders exactly when the write behind it would succeed,
 * and it keeps being right for reasons that have nothing to do with any migration: a league
 * operator who genuinely holds `league.team.manage` for this club still sees the controls, on
 * the same screens, with no special case.
 *
 * This deliberately does NOT use `canManageTeam(auth)` and friends from `lib/auth/permissions`.
 * Those fall back to a bare role check when no scope id is passed, so a role claim renders a
 * control the authority model grants nothing for — which is the defect, not the fix.
 */
export type TeamConsoleAccess = {
  /** Profile writes: the club's own description, venue, colours, crest. */
  canEditProfile: boolean;
  /** Writing and submitting a roster draft. Never confirming one. */
  canProposeRoster: boolean;
  /** Publishing as the club, and attaching media to it. */
  canPublish: boolean;
  /** Attaching the club's account of a match, and opening a result case against a result. */
  canReportResult: boolean;
  /**
   * League authority over this club, held by a league operator rather than the club itself.
   * Kept separate so a screen can say "your league manages this" rather than "you cannot".
   */
  leagueManages: boolean;
  /** Registering a new athlete onto the club — league authority only, never the club's. */
  canCreateAthlete: boolean;
  /**
   * True when this console is showing a club the viewer cannot write to at all.
   *
   * Distinct from "not signed in": somebody with no club should not be told their authority
   * moved.
   */
  readOnly: boolean;
};

export function useTeamConsoleAccess(teamId: string | undefined): TeamConsoleAccess {
  const { accessContext } = useAuth();

  return useMemo(() => {
    if (!teamId) {
      return {
        canEditProfile: false, canProposeRoster: false, canPublish: false,
        canReportResult: false, leagueManages: false, canCreateAthlete: false, readOnly: true,
      };
    }
    const leagueManages = canManageTeamInScope(accessContext, teamId);
    const canCreateAthlete = canCreateAthleteInScope(accessContext, teamId);
    const club = (capability: Parameters<typeof hasScopeCapability>[3]) =>
      hasScopeCapability(accessContext, 'team', teamId, capability);

    const access = {
      // League authority covers the club's own surfaces too: the league that manages a club
      // can do what the club can do to it, and that is a statement about the league's grant,
      // not a special case for it.
      canEditProfile: leagueManages || club('team.profile.edit'),
      canProposeRoster: leagueManages || club('team.roster.propose'),
      canPublish: leagueManages || club('team.content.publish'),
      canReportResult: club('team.result.report') || club('team.result.dispute'),
      leagueManages,
      canCreateAthlete,
    };
    return {
      ...access,
      readOnly: !access.canEditProfile && !access.canProposeRoster && !access.canPublish
        && !access.canReportResult && !access.canCreateAthlete,
    };
  }, [accessContext, teamId]);
}
