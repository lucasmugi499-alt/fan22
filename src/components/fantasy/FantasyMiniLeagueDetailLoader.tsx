'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { FantasyMiniLeagueDetail } from './FantasyMiniLeagues';
import type {
  FantasyLeaderboardEntry,
  FantasyMiniLeague,
  FantasyMiniLeagueMember,
} from '@/types/fantasy';

type Catalogue = {
  league: FantasyMiniLeague;
  members: FantasyMiniLeagueMember[];
  leaderboards: FantasyLeaderboardEntry[];
};

export function FantasyMiniLeagueDetailLoader({
  miniLeagueId,
  initialCatalogue,
}: {
  miniLeagueId: string;
  initialCatalogue: Catalogue | null;
}) {
  const { currentUser, isDemoMode, loading } = useAuth();
  const [catalogue, setCatalogue] = useState(initialCatalogue);
  const [message, setMessage] = useState(initialCatalogue ? '' : 'Loading mini-league…');

  useEffect(() => {
    if (initialCatalogue || loading || isDemoMode) return;
    let active = true;
    void (async () => {
      const token = currentUser?.getIdToken ? await currentUser.getIdToken() : null;
      const response = await fetch(
        `/api/fantasy/mini-leagues?miniLeagueId=${encodeURIComponent(miniLeagueId)}`,
        { headers: token ? { authorization: `Bearer ${token}` } : undefined },
      );
      const result = await response.json().catch(() => null) as (Catalogue & { error?: string }) | null;
      if (!active) return;
      if (response.ok && result?.league) {
        setCatalogue(result);
        setMessage('');
      } else {
        setMessage(result?.error ?? 'Mini-league not found.');
      }
    })();
    return () => {
      active = false;
    };
  }, [currentUser, initialCatalogue, isDemoMode, loading, miniLeagueId]);

  if (!catalogue) {
    return <main className="p-8 text-center text-muted" role="status">{message}</main>;
  }
  return (
    <FantasyMiniLeagueDetail
      league={catalogue.league}
      members={catalogue.members}
      leaderboards={catalogue.leaderboards}
    />
  );
}
