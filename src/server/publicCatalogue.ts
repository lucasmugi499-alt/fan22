import 'server-only';

import { investorDemo } from '@/data/investorDemo';
import { adminDb } from '@/lib/firebase/admin';
import type { Athlete, Challenge, League, Match, Season, Team } from '@/types';

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

export async function getPublicLeagueDiscoveryData() {
  const fallback = () => ({
    leagues: investorDemo.leagues,
    teams: investorDemo.teams,
    matches: investorDemo.matches,
    seasons: investorDemo.seasons,
  });
  if (!usesFirebaseData()) return fallback();
  return withSyntheticDemoFallback(
    async () => {
      const [leagues, teams, matches, seasons] = await Promise.all([
        recentCollection<League>('leagues', 48),
        recentCollection<Team>('teams', 240),
        adminDb.collection('matches').orderBy('scheduledAt', 'desc').limit(700).get()
          .then((snapshot) => snapshot.docs.map((item) => record<Match>(item.id, item.data()))),
        recentCollection<Season>('seasons', 80),
      ]);
      return { leagues, teams, matches, seasons };
    },
    fallback,
  );
}

export async function getPublicLeagueProfileData(leagueId: string) {
  const fallback = () => ({
    league: investorDemo.leagues.find((league) => league.id === leagueId),
    teams: investorDemo.teams.filter((team) => team.leagueId === leagueId),
    matches: investorDemo.matches.filter((match) => match.leagueId === leagueId),
    seasons: investorDemo.seasons.filter((season) => season.leagueId === leagueId),
    athletes: investorDemo.athletes.filter((athlete) => athlete.leagueId === leagueId).slice(0, 48),
    feedPosts: investorDemo.feedPosts.filter((post) => post.relatedLeagueId === leagueId).slice(0, 12),
    leagueNotices: investorDemo.leagueNotices.filter((notice) => notice.leagueId === leagueId).slice(0, 12),
  });
  if (!usesFirebaseData()) return fallback();
  return withSyntheticDemoFallback(
    async () => {
      const [league, teams, matches, seasons, athletes, feedPosts, leagueNotices] = await Promise.all([
        adminDb.collection('leagues').doc(leagueId).get()
          .then((snapshot) => snapshot.exists ? record<League>(snapshot.id, snapshot.data()!) : undefined),
        adminDb.collection('teams').where('leagueId', '==', leagueId).limit(80).get()
          .then((snapshot) => snapshot.docs.map((item) => record<Team>(item.id, item.data()))),
        adminDb.collection('matches').where('leagueId', '==', leagueId).limit(240).get()
          .then((snapshot) => snapshot.docs.map((item) => record<Match>(item.id, item.data()))),
        adminDb.collection('seasons').where('leagueId', '==', leagueId).limit(20).get()
          .then((snapshot) => snapshot.docs.map((item) => record<Season>(item.id, item.data()))),
        adminDb.collection('athletes').where('leagueId', '==', leagueId).limit(48).get()
          .then((snapshot) => snapshot.docs.map((item) => record<Athlete>(item.id, item.data()))),
        adminDb.collection('feedPosts').where('relatedLeagueId', '==', leagueId).limit(12).get()
          .then((snapshot) => snapshot.docs.map((item) => record<typeof investorDemo.feedPosts[number]>(item.id, item.data()))),
        adminDb.collection('leagueNotices').where('leagueId', '==', leagueId).limit(12).get()
          .then((snapshot) => snapshot.docs.map((item) => record<typeof investorDemo.leagueNotices[number]>(item.id, item.data()))),
      ]);
      return { league, teams, matches, seasons, athletes, feedPosts, leagueNotices };
    },
    fallback,
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
  if (!usesFirebaseData()) return investorDemo.matches;
  return withSyntheticDemoFallback(
    async () => {
      const snapshot = await adminDb.collection('matches')
        .orderBy('scheduledAt', 'desc')
        .limit(700)
        .get();
      return snapshot.docs.map((item) => record<Match>(item.id, item.data()));
    },
    () => investorDemo.matches,
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
