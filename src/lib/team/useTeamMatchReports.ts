'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import type { TeamMatchReport } from '@/types';

/**
 * What this club has already said about its matches.
 *
 * The console used to decide what was "waiting on your account" from match status alone, so
 * a club that had just recorded its account was shown the same fixture again with the same
 * button. The report is the club's own document and readable by rule; the console reads it
 * back so the card can say "recorded, waiting on the league" instead of asking twice.
 *
 * `reloadToken` re-reads after a report is filed. Failure yields an empty list: a console that
 * asks once too often is a smaller wrong than one that hides a fixture the club never answered.
 */
export function useTeamMatchReports(teamId: string | undefined, reloadToken = 0) {
  const { isDemoMode } = useAuth();
  // One state object, written only from the promise chain: the effect subscribes to the read
  // and never sets state synchronously, which is the shape the hooks lint asks for.
  const [state, setState] = useState<{ key: string; reports: TeamMatchReport[]; loaded: boolean }>({
    key: '',
    reports: [],
    loaded: false,
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const key = teamId ? `${teamId}:${isDemoMode ? 'demo' : 'live'}:${reloadToken}:${attempt}` : '';

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    const provider = isDemoMode ? mockProvider : dataProvider;
    void provider.getTeamMatchReports({ teamId })
      .then((items) => items, () => [] as TeamMatchReport[])
      .then((items) => { if (!cancelled) setState({ key, reports: items, loaded: true }); });
    return () => { cancelled = true; };
  }, [teamId, isDemoMode, key]);

  const current = state.key === key;
  return {
    reports: teamId && current ? state.reports : [],
    loading: Boolean(teamId) && !(current && state.loaded),
    retry,
  };
}
