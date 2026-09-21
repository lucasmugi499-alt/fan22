'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyTeam } from '@/lib/team/teamContext';
import { useTeamConsoleAccess } from '@/lib/team/useTeamConsoleAccess';

/**
 * What this console is to the person looking at it, said once, and only when it needs saying.
 *
 * ## The banner this replaces
 *
 * ADR-004 put a sunset notice above every club screen: "Team administration has moved to
 * League Operations." It was a server layout with no idea who was reading it, so it said the
 * same thing to everybody — including, under ADR-005, a Club Operator who holds every
 * capability the screens below check for. That is the contradiction the audit flagged: a
 * banner saying authority has moved, above a card asking for action. Both true of somebody,
 * neither true of the same person.
 *
 * So this asks the same question the screens ask, through the same hook, and renders:
 *
 * - nothing, for a viewer who can act. The controls that render are the notice.
 * - a "view only" note for a viewer who cannot, saying what would change that. Not "your
 *   authority moved" — for a fan following a club, or an athlete on it, nothing moved.
 *
 * League authority is named separately. A league operator who holds `league.team.manage` for
 * this club can do everything a Club Operator can and is told so, rather than left to discover
 * that controls work without knowing why.
 */
export function ClubAuthorityNotice() {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const catalog = useGoalPlaceData({ collections: ['teams'] });
  const team = useMemo(
    () => resolveMyTeam(userProfile, catalog.teams, [], isDemoMode, accessContext),
    [userProfile, catalog.teams, isDemoMode, accessContext],
  );
  const access = useTeamConsoleAccess(team?.id);

  // Nothing to say until there is a club to say it about, and nothing to say to somebody who
  // can act: the working controls are the notice.
  if (catalog.loading || !team || !access.readOnly) return null;

  return (
    <aside
      role="status"
      className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted"
    >
      <p className="font-semibold text-text-strong">You are viewing {team.name}.</p>
      <p className="mt-1 leading-6">
        Everything here is readable, and nothing can be changed from this account. A club is run
        by its Club Operator, who the league assigns: they keep the profile, propose the roster,
        publish as the club and give the club&apos;s account of a result. If that should be you,
        ask your league. If something recorded here is wrong,{' '}
        <Link href="/support" className="underline underline-offset-2 hover:text-text-strong">
          contact support
        </Link>
        .
      </p>
    </aside>
  );
}
