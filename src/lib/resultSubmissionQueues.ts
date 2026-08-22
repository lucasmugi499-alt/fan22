'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import type { ReconciliationException, ResultSubmission } from '@/types';

function useResultSubmissionQueue(
  ownerId: string | undefined,
  load: (
    provider: typeof dataProvider,
    id: string
  ) => Promise<ResultSubmission[]>
) {
  const { isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [items, setItems] = useState<ResultSubmission[]>([]);
  const [error, setError] = useState<Error>();

  const refresh = useCallback(async () => {
    if (!ownerId) return;
    try {
      setItems(await load(provider, ownerId));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('The result queue could not load.'));
    }
  }, [load, ownerId, provider]);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    void load(provider, ownerId)
      .then((nextItems) => {
        if (active) {
          setItems(nextItems);
          setError(undefined);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error ? cause : new Error('The result queue could not load.')
          );
        }
      });
    return () => {
      active = false;
    };
  }, [load, ownerId, provider]);

  return { items, error, refresh };
}

const loadTeamInbox = (provider: typeof dataProvider, teamId: string) =>
  provider.getTeamConfirmationInbox(teamId);

const loadLeagueExceptions = (provider: typeof dataProvider, leagueId: string) =>
  provider.getLeagueResultExceptions(leagueId);

export function useTeamConfirmationInbox(teamId?: string) {
  return useResultSubmissionQueue(teamId, loadTeamInbox);
}

export function useLeagueResultExceptions(leagueId?: string) {
  return useResultSubmissionQueue(leagueId, loadLeagueExceptions);
}

/**
 * Finalizations blocked because the recorded events contradict the submitted score.
 *
 * Separate from the submission queue because these are a different kind of object: the
 * submission still looks confirmed and ready, and only the canonical exception record says
 * why nothing was published. Reading the record rather than re-deriving it from the
 * submission is what keeps one set of sporting numbers.
 */
export function useReconciliationExceptions(leagueId?: string, options?: { platformWide?: boolean }) {
  const { isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [items, setItems] = useState<ReconciliationException[]>([]);
  const [error, setError] = useState<Error>();

  const platformWide = options?.platformWide === true;

  /**
   * Re-read the queue after a case changes.
   *
   * Exposed because acknowledging or closing a case changes THIS collection and nothing
   * else. A caller that refreshed its surrounding match and league data instead would leave
   * the case list showing the state before the action, which reads as the action having
   * silently failed.
   */
  const refresh = useCallback(async () => {
    // A league surface needs a league; the platform queue deliberately has no scope.
    if (!leagueId && !platformWide) return;
    try {
      setItems(await provider.getReconciliationExceptions(platformWide ? undefined : leagueId));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Blocked results could not load.'));
    }
  }, [leagueId, platformWide, provider]);

  useEffect(() => {
    if (!leagueId && !platformWide) return;
    let active = true;
    void provider.getReconciliationExceptions(platformWide ? undefined : leagueId)
      .then((next) => { if (active) { setItems(next); setError(undefined); } })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause : new Error('Blocked results could not load.'));
        }
      });
    return () => { active = false; };
  }, [leagueId, platformWide, provider]);

  return { items, error, refresh };
}
