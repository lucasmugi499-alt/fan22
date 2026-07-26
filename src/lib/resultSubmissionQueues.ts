'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import type { ResultSubmission } from '@/types';

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
