'use client';

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { selectedAssignmentId } from '@/lib/auth/assignmentSelection';
import { scopedIdsForAccess } from '@/lib/auth/clientAccess';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyTeam } from './teamContext';

/**
 * The club this console belongs to, read by its id.
 *
 * Every team screen used to list the whole `teams` catalogue and pick its own club out of
 * the result. The catalogue read is capped at 100 documents, and the moment an environment
 * held more teams than that, any club whose id sorted past the cut simply vanished: a Club
 * Operator with a live assignment and a projected index saw "No team linked yet". The access
 * context already names the team, so the console reads that one document and nothing else —
 * one read instead of a hundred, and no cap to fall off.
 *
 * Demo mode without any team scope keeps the catalogue fallback, because the mock provider's
 * "liveliest club" is the only case where scanning was ever the right answer.
 */
export function useMyTeam() {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const scopedTeamId = useMemo(() => {
    const scoped = scopedIdsForAccess(accessContext, 'team');
    const selected = selectedAssignmentId('team');
    if (selected && scoped.has(selected)) return selected;
    const first = scoped.values().next();
    return first.done ? null : first.value;
  }, [accessContext]);

  const catalogue = useGoalPlaceData({
    collections: scopedTeamId || isDemoMode ? ['teams'] : [],
    scope: scopedTeamId ? { teamId: scopedTeamId } : undefined,
  });
  const team = useMemo(
    () => resolveMyTeam(userProfile, catalogue.teams, [], isDemoMode, accessContext),
    [userProfile, catalogue.teams, isDemoMode, accessContext],
  );

  return { team, teams: catalogue.teams, loading: catalogue.loading, error: catalogue.error, retry: catalogue.retry };
}
