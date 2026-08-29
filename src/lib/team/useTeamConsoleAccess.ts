'use client';

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthProvider';
import {
  canCreateAthleteInScope,
  canManageTeamInScope,
  canSubmitResultInScope,
} from '@/lib/auth/access';

/**
 * What the Team Console may actually do, asked of the authority model rather than the role.
 *
 * ## The failure this closes
 *
 * ADR-004 retired Team Admin as an account class, and the deployed environments run
 * `GOALPLACE_TEAM_AUTHORITY_STAGE=retired`, which versions the team bundles to zero
 * capabilities. The console was given a sunset banner saying it is read-only — and then kept
 * rendering every write control it always had. Create and invite, Build roster, Save profile,
 * Publish update, Submit result: all live, all refused by the server and by Firestore Rules.
 *
 * That is worse than an unexplained refusal, which is what the banner was added to fix. A
 * banner that says read-only sitting above a working Save button is a control that lies
 * twice, and the second lie undoes the first. Whichever one the user believes, the product
 * has misled them.
 *
 * ## Why capability rather than the stage
 *
 * `currentTeamAuthorityStage()` reads a server-only environment variable, and the honest way
 * to make it visible to the browser would be a second `NEXT_PUBLIC_` copy of the migration's
 * most consequential switch — two copies of one truth, which this codebase has already been
 * bitten by once.
 *
 * The capability index is better than a workaround, though: it is the same thing the SERVER
 * will check, read through the same projections Firestore Rules read. So a control renders
 * exactly when the write behind it would succeed, and it keeps being right for reasons that
 * have nothing to do with this migration — a league operator who genuinely holds
 * `league.team.manage` for this club still sees the controls, on the same screens, with no
 * special case.
 *
 * This deliberately does NOT use `canManageTeam(auth)` and friends from `lib/auth/permissions`.
 * Those fall back to a bare role check when no scope id is passed, so a `team_admin` role
 * claim renders a control the authority model grants nothing for — which is the defect, not
 * the fix.
 */
export type TeamConsoleAccess = {
  /** Roster, profile and update writes. */
  canManage: boolean;
  /** Registering a new athlete onto the club. */
  canCreateAthlete: boolean;
  /** Submitting or confirming a match result. */
  canSubmitResult: boolean;
  /**
   * True when this console is showing a club the viewer cannot write to at all.
   *
   * Drives the sunset explanation. Distinct from "not signed in": somebody with no club
   * should not be told their authority moved.
   */
  readOnly: boolean;
};

export function useTeamConsoleAccess(teamId: string | undefined): TeamConsoleAccess {
  const { accessContext } = useAuth();

  return useMemo(() => {
    if (!teamId) {
      return { canManage: false, canCreateAthlete: false, canSubmitResult: false, readOnly: true };
    }
    const canManage = canManageTeamInScope(accessContext, teamId);
    const canCreateAthlete = canCreateAthleteInScope(accessContext, teamId);
    // The match id is not part of the decision — `canSubmitResultInScope` ignores it, because
    // the grant is team-scoped. Passing the team's own id keeps the call honest about that.
    const canSubmitResult = canSubmitResultInScope(accessContext, teamId, teamId);
    return {
      canManage,
      canCreateAthlete,
      canSubmitResult,
      readOnly: !canManage && !canCreateAthlete && !canSubmitResult,
    };
  }, [accessContext, teamId]);
}
