import 'server-only';

import { investorDemo } from '@/data/investorDemo';
import { adminDb } from '@/lib/firebase/admin';
import { environmentFlags, goalPlaceEnvironment } from '@/lib/environment';
import type { Athlete, Challenge, League, Match, Season, Team } from '@/types';
import { adaptMatch } from '@/lib/matchRecord';

export type PublicCatalogueSource = 'live' | 'curated_preview' | 'configured_preview';

/**
 * Every public loader reports which dataset answered it, so a page can disclose that it
 * is showing preview records rather than live ones.
 *
 * The source is returned explicitly rather than held in request-scoped state. A
 * `React.cache` store only memoizes inside a render pass — called from a route handler
 * or any non-render context it silently hands back a fresh value, which would report
 * "live" during an actual outage. An explicit return cannot drift from the read.
 */
export type CatalogueResult<T> = { data: T; source: PublicCatalogueSource };

function live<T>(data: T): CatalogueResult<T> {
  return { data, source: 'live' };
}

/**
 * Mock mode is a deliberate configuration, not an outage, so it is reported separately
 * from a fallback. Only a fallback warrants telling the reader that live services are
 * unavailable.
 */
function configured<T>(data: T): CatalogueResult<T> {
  return { data, source: 'configured_preview' };
}

function usesFirebaseData() {
  return (
    process.env.NEXT_PUBLIC_DATA_MODE === 'firebase'
    && process.env.NEXT_STATIC_EXPORT !== 'true'
  );
}

/**
 * Only the demo and local environments may substitute the curated dataset for a failed
 * live read. Beta and production must surface the outage instead: silently serving
 * synthetic records to real league operators would misrepresent their own competitions.
 */
function syntheticFallbackAllowed(env: NodeJS.ProcessEnv = process.env) {
  const environment = goalPlaceEnvironment(env);
  if (environment !== 'demo' && environment !== 'local') return false;
  return environmentFlags(env).allowDemoLogin;
}

async function withSyntheticDemoFallback<T>(
  load: () => Promise<T>,
  fallback: () => T,
): Promise<CatalogueResult<T>> {
  try {
    return live(await load());
  } catch (cause) {
    if (!syntheticFallbackAllowed()) throw cause;
    console.error('GoalPlace256 public catalogue fell back to the curated preview dataset', cause);
    return { data: fallback(), source: 'curated_preview' };
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

/**
 * Matches need the same adaptation the client data hook applies, or the two paths disagree
 * about what is official.
 *
 * These server loaders feed `initialData` on the public league, team and match pages, and
 * an anonymous visitor never gets past it — the client Firestore read is not available to
 * them, so `initialData` is the whole page. Returning a raw document left legacy-shaped
 * matches (`status: 'verified'`, no `teamAScore`) failing both `isOfficialMatch` and the
 * `buildLeagueStandings` score check, so ten leagues rendered an empty table.
 */
function matchRecord(id: string, data: FirebaseFirestore.DocumentData): Match {
  return adaptMatch(record<Match>(id, data));
}

/**
 * Returns the newest records, not an arbitrary page of them. A bare `.limit()` returns
 * documents in key order, so "recent" surfaces were showing whichever records happened to
 * sort first by ID. Every collection read here carries a required `createdAt`, so ordering
 * cannot silently drop documents.
 */
async function recentCollection<T>(name: string, limit: number) {
  const snapshot = await adminDb.collection(name).orderBy('createdAt', 'desc').limit(limit).get();
  return snapshot.docs.map((item) => record<T>(item.id, item.data()));
}

export async function getPublicLeagues() {
  if (!usesFirebaseData()) return configured(investorDemo.leagues);
  return withSyntheticDemoFallback(
    () => recentCollection<League>('leagues', 24),
    () => investorDemo.leagues,
  );
}

export async function getPublicTeams() {
  if (!usesFirebaseData()) return configured(investorDemo.teams);
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
  if (!usesFirebaseData()) return configured(fallback());
  return withSyntheticDemoFallback(
    async () => {
      const [leagues, teams, matches, seasons] = await Promise.all([
        recentCollection<League>('leagues', 48),
        recentCollection<Team>('teams', 240),
        adminDb.collection('matches').orderBy('scheduledAt', 'desc').limit(700).get()
          .then((snapshot) => snapshot.docs.map((item) => matchRecord(item.id, item.data()))),
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
  if (!usesFirebaseData()) return configured(fallback());
  return withSyntheticDemoFallback(
    async () => {
      const [league, teams, matches, seasons, athletes, feedPosts, leagueNotices] = await Promise.all([
        adminDb.collection('leagues').doc(leagueId).get()
          .then((snapshot) => snapshot.exists ? record<League>(snapshot.id, snapshot.data()!) : undefined),
        adminDb.collection('teams').where('leagueId', '==', leagueId).limit(80).get()
          .then((snapshot) => snapshot.docs.map((item) => record<Team>(item.id, item.data()))),
        adminDb.collection('matches').where('leagueId', '==', leagueId).limit(240).get()
          .then((snapshot) => snapshot.docs.map((item) => matchRecord(item.id, item.data()))),
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
  if (!usesFirebaseData()) return configured(investorDemo.athletes.slice(0, 48));
  return withSyntheticDemoFallback(
    () => recentCollection<Athlete>('athletes', 48),
    () => investorDemo.athletes.slice(0, 48),
  );
}

export async function getPublicMatches() {
  if (!usesFirebaseData()) return configured(investorDemo.matches);
  return withSyntheticDemoFallback(
    async () => {
      const snapshot = await adminDb.collection('matches')
        .orderBy('scheduledAt', 'desc')
        .limit(700)
        .get();
      return snapshot.docs.map((item) => matchRecord(item.id, item.data()));
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
  if (!usesFirebaseData()) return configured(fallback());
  return withSyntheticDemoFallback(
    async () => {
      const [leagues, teams, athletes, matches, challenges] = await Promise.all([
        recentCollection<League>('leagues', 12),
        recentCollection<Team>('teams', 80),
        recentCollection<Athlete>('athletes', 24),
        adminDb.collection('matches').orderBy('scheduledAt', 'desc').limit(40).get()
          .then((snapshot) => snapshot.docs.map((item) => matchRecord(item.id, item.data()))),
        recentCollection<Challenge>('challenges', 12),
      ]);
      return { leagues, teams, athletes, matches, challenges };
    },
    fallback,
  );
}
