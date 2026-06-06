'use client';

import { useEffect, useMemo, useState } from 'react';
import { Athlete, Challenge, FeedPost, League, Match, Team, WalletTransaction } from '@/lib/types';
import { mockAthletes, mockChallenges, mockFeed, mockLeagues, mockMatches, mockTeams, walletTransactions } from '@/lib/mockData';
import { isFirebaseConfigured } from './client';
import { constraintsForOwner, publicCollectionConstraints, subscribeToCollection } from './firestore';

const fallbackWalletTransactions = walletTransactions as WalletTransaction[];

function usePublicCollection<T>(
  name: 'athletes' | 'teams' | 'leagues' | 'matches' | 'challenges' | 'feedPosts',
  fallback: T[]
) {
  const [items, setItems] = useState<T[]>(fallback);
  const [loading, setLoading] = useState(Boolean(isFirebaseConfigured));
  const [source, setSource] = useState<'firestore' | 'fallback'>('fallback');

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setItems(fallback);
      setLoading(false);
      setSource('fallback');
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToCollection<T>(
      name,
      (nextItems) => {
        if (nextItems.length > 0) {
          setItems(nextItems);
          setSource('firestore');
        } else {
          setItems(fallback);
          setSource('fallback');
        }
        setLoading(false);
      },
      publicCollectionConstraints(name),
      () => {
        setItems(fallback);
        setSource('fallback');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [fallback, name]);

  return { items, loading, source };
}

export function useGoalPlaceData() {
  const athletes = usePublicCollection<Athlete>('athletes', mockAthletes);
  const teams = usePublicCollection<Team>('teams', mockTeams);
  const leagues = usePublicCollection<League>('leagues', mockLeagues);
  const matches = usePublicCollection<Match>('matches', mockMatches);
  const challenges = usePublicCollection<Challenge>('challenges', mockChallenges);
  const feedPosts = usePublicCollection<FeedPost>('feedPosts', mockFeed);

  return useMemo(
    () => ({
      athletes: athletes.items,
      teams: teams.items,
      leagues: leagues.items,
      matches: matches.items,
      challenges: challenges.items,
      feedPosts: feedPosts.items,
      loading: athletes.loading || teams.loading || leagues.loading || matches.loading || challenges.loading || feedPosts.loading,
      source:
        athletes.source === 'firestore' ||
        teams.source === 'firestore' ||
        leagues.source === 'firestore' ||
        matches.source === 'firestore' ||
        challenges.source === 'firestore' ||
        feedPosts.source === 'firestore'
          ? 'firestore'
          : 'fallback',
    }),
    [athletes, teams, leagues, matches, challenges, feedPosts]
  );
}

export function useUserWalletTransactions(userId?: string | null) {
  const [items, setItems] = useState<WalletTransaction[]>(fallbackWalletTransactions);
  const [loading, setLoading] = useState(Boolean(isFirebaseConfigured && userId));

  useEffect(() => {
    if (!isFirebaseConfigured || !userId) {
      setItems(fallbackWalletTransactions);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToCollection<WalletTransaction>(
      'walletTransactions',
      (nextItems) => {
        setItems(nextItems.length ? nextItems : fallbackWalletTransactions);
        setLoading(false);
      },
      constraintsForOwner('userId', userId),
      () => {
        setItems(fallbackWalletTransactions);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId]);

  return { items, loading };
}
