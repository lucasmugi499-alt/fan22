import 'server-only';

import { investorDemo } from '@/data/investorDemo';
import { adminDb } from '@/lib/firebase/admin';
import type { Athlete, Challenge, League, Match, Team } from '@/types';

function usesFirebaseData() {
  return (
    process.env.NEXT_PUBLIC_DATA_MODE === 'firebase'
    && process.env.NEXT_STATIC_EXPORT !== 'true'
  );
}

async function withSyntheticDemoFallback<T>(
  load: () => Promise<T>,
  fallback: () => T,
): Promise<T> {
  try {
    return await load();
  } catch (cause) {
    if (process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN !== 'true') throw cause;
    return fallback();
  }
}

function normalize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if ('toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(normalize);
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, normalize(nested)]),
  );
}

function record<T>(id: string, data: FirebaseFirestore.DocumentData) {
  return normalize({ id, ...data }) as T;
}

async function recentCollection<T>(name: string, limit: number) {
  const snapshot = await adminDb.collection(name).limit(limit).get();
  return snapshot.docs.map((item) => record<T>(item.id, item.data()));
}

export async function getPublicLeagues() {
  if (!usesFirebaseData()) return investorDemo.leagues;
  return withSyntheticDemoFallback(
    () => recentCollection<League>('leagues', 24),
    () => investorDemo.leagues,
  );
}

export async function getPublicTeams() {
  if (!usesFirebaseData()) return investorDemo.teams;
  return withSyntheticDemoFallback(
    () => recentCollection<Team>('teams', 80),
    () => investorDemo.teams,
  );
}

export async function getPublicAthletes() {
  if (!usesFirebaseData()) return investorDemo.athletes.slice(0, 48);
  return withSyntheticDemoFallback(
    () => recentCollection<Athlete>('athletes', 48),
    () => investorDemo.athletes.slice(0, 48),
  );
}

export async function getPublicMatches() {
  if (!usesFirebaseData()) return investorDemo.matches.slice(0, 60);
  return withSyntheticDemoFallback(
    async () => {
      const snapshot = await adminDb.collection('matches')
        .orderBy('scheduledAt', 'desc')
        .limit(60)
        .get();
      return snapshot.docs.map((item) => record<Match>(item.id, item.data()));
    },
    () => investorDemo.matches.slice(0, 60),
  );
}

export async function getPublicLandingData() {
  const fallback = () => ({
    leagues: investorDemo.leagues,
    teams: investorDemo.teams,
    athletes: investorDemo.athletes.slice(0, 24),
    matches: [
      ...investorDemo.matches.filter((match) => match.status === 'live').slice(0, 2),
      ...investorDemo.matches.filter((match) => match.status === 'scheduled').slice(0, 18),
      ...investorDemo.matches.filter((match) => match.verificationStatus === 'verified').slice(-20),
    ],
    challenges: investorDemo.challenges.slice(0, 12),
  });
  if (!usesFirebaseData()) return fallback();
  return withSyntheticDemoFallback(
    async () => {
      const [leagues, teams, athletes, matches, challenges] = await Promise.all([
        recentCollection<League>('leagues', 12),
        recentCollection<Team>('teams', 80),
        recentCollection<Athlete>('athletes', 24),
        adminDb.collection('matches').orderBy('scheduledAt', 'desc').limit(40).get()
          .then((snapshot) => snapshot.docs.map((item) => record<Match>(item.id, item.data()))),
        recentCollection<Challenge>('challenges', 12),
      ]);
      return { leagues, teams, athletes, matches, challenges };
    },
    fallback,
  );
}
