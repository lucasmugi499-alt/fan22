import 'server-only';

import { investorDemo } from '@/data/investorDemo';
import { adminDb } from '@/lib/firebase/admin';
import { environmentFlags, goalPlaceEnvironment } from '@/lib/environment';
import type { Athlete, Challenge, League, Match, Season, StoredStanding, Team } from '@/types';
import { adaptMatch } from '@/lib/matchRecord';
import { normalizeAthleteIdentity } from '@/lib/athleteIdentity';

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
 * Athletes need the same identity normalization the client provider applies.
 *
 * Exactly the argument above, for the collection it was missed on. ADR-001 renamed `name` to
 * `legalName` and `position` to `registeredPosition`, and `normalizeAthleteIdentity` fills the
 * canonical fields from whichever shape a stored document has. `firebaseProvider` applies it;
 * these server loaders did not.
 *
 * That asymmetry took `/athletes` down with a 500 in production. The page renders the 48 most
 * recently created athletes, every one of which on the demo database is a pre-ADR-001
 * document — so `athlete.legalName` was `undefined`, `initials()` called `.replace` on it, and
 * the render threw. An anonymous visitor never gets past `initialData`, so there was no client
 * read to repair it afterwards.
 */
function athleteRecord(id: string, data: FirebaseFirestore.DocumentData): Athlete {
  return normalizeAthleteIdentity(record<Athlete>(id, data));
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

/**
 * The athlete equivalent, so no server loader can read the collection unadapted.
 *
 * A separate function rather than a flag on `recentCollection`, because "athletes are read
 * through the identity boundary" is a rule and a boolean argument is an invitation to forget
 * it. Every server-side athlete read in this file goes through here or `athleteRecord`.
 */
async function recentAthletes(limit: number): Promise<Athlete[]> {
  const snapshot = await adminDb.collection('athletes').orderBy('createdAt', 'desc').limit(limit).get();
  return snapshot.docs.map((item) => athleteRecord(item.id, item.data()));
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
    standings: investorDemo.standings,
  });
  if (!usesFirebaseData()) return configured(fallback());
  return withSyntheticDemoFallback(
    async () => {
      const [leagues, teams, matches, seasons, standings] = await Promise.all([
        recentCollection<League>('leagues', 48),
        recentCollection<Team>('teams', 240),
        adminDb.collection('matches').orderBy('scheduledAt', 'desc').limit(700).get()
          .then((snapshot) => snapshot.docs.map((item) => matchRecord(item.id, item.data()))),
        recentCollection<Season>('seasons', 80),
        /**
         * Discovery ranked leagues on tables it built from a global 700-match slice shared
         * across every league on the page — so a league's position in discovery depended on
         * how many of ITS matches happened to fall inside a limit it shared with 47 others.
         * Reading the projection instead makes each league's table its own.
         *
         * Ordered by rank so that if a deployment ever reaches this cap it drops the bottom of
         * tables, rather than an arbitrary set of rows from the middle of several.
         */
        adminDb.collection('standings').orderBy('rank', 'asc').limit(1200).get()
          .then((snapshot) => snapshot.docs.map((item) => record<StoredStanding>(item.id, item.data()))),
      ]);
      return { leagues, teams, matches, seasons, standings };
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
    standings: investorDemo.standings.filter((standing) => standing.leagueId === leagueId),
  });
  if (!usesFirebaseData()) return configured(fallback());
  return withSyntheticDemoFallback(
    async () => {
      const [league, teams, matches, seasons, athletes, feedPosts, leagueNotices, standings] = await Promise.all([
        adminDb.collection('leagues').doc(leagueId).get()
          .then((snapshot) => snapshot.exists ? record<League>(snapshot.id, snapshot.data()!) : undefined),
        adminDb.collection('teams').where('leagueId', '==', leagueId).limit(80).get()
          .then((snapshot) => snapshot.docs.map((item) => record<Team>(item.id, item.data()))),
        adminDb.collection('matches').where('leagueId', '==', leagueId).limit(240).get()
          .then((snapshot) => snapshot.docs.map((item) => matchRecord(item.id, item.data()))),
        adminDb.collection('seasons').where('leagueId', '==', leagueId).limit(20).get()
          .then((snapshot) => snapshot.docs.map((item) => record<Season>(item.id, item.data()))),
        adminDb.collection('athletes').where('leagueId', '==', leagueId).limit(48).get()
          .then((snapshot) => snapshot.docs.map((item) => athleteRecord(item.id, item.data()))),
        adminDb.collection('feedPosts').where('relatedLeagueId', '==', leagueId).limit(12).get()
          .then((snapshot) => snapshot.docs.map((item) => record<typeof investorDemo.feedPosts[number]>(item.id, item.data()))),
        adminDb.collection('leagueNotices').where('leagueId', '==', leagueId).limit(12).get()
          .then((snapshot) => snapshot.docs.map((item) => record<typeof investorDemo.leagueNotices[number]>(item.id, item.data()))),
        /**
         * The stored league table, as one bounded read.
         *
         * This is the whole point of the standings projection. The `matches` query above is
         * capped at 240 and carries no ordering, so a season past that cap yields an arbitrary
         * subset — which is exactly what the browser used to compute the published table from.
         * One row per team is bounded by the SIZE of the league rather than the LENGTH of its
         * season, so it does not degrade as fixtures accumulate.
         *
         * 80, matching the team limit above. A league with more clubs than that has a larger
         * problem than its table.
         */
        adminDb.collection('standings').where('leagueId', '==', leagueId).limit(80).get()
          .then((snapshot) => snapshot.docs.map((item) => record<StoredStanding>(item.id, item.data()))),
      ]);
      return { league, teams, matches, seasons, athletes, feedPosts, leagueNotices, standings };
    },
    fallback,
  );
}

/**
 * Everything `/discover` needs, read once on the server instead of 1,200 times per visitor.
 *
 * `/discover` was a pure client component. Every visitor who opened it issued its own reads
 * across five collections — leagues, teams, matches, athletes, challenges — and composed the
 * whole feed in the browser. Firestore spend therefore scaled with TRAFFIC times catalogue
 * size, on the most linked-to public page in the product.
 *
 * Server-rendering does not reduce the reads; it makes them cacheable. One server render, on a
 * revalidation interval, serves every visitor who arrives inside it. That is the actual cost
 * fix, and it is the same shape as the league and team pages, which have always worked this
 * way — `/discover` was the outlier.
 *
 * Reads the standings projection rather than deriving tables from the match slice, for the
 * reason set out in `server/standings/projection.ts`: discovery used to build every league's
 * table from one 700-match slice shared across 48 leagues, so a league's position depended on
 * how many of ITS matches fell inside a limit it shared with 47 others.
 */
export async function getPublicDiscoveryData() {
  const fallback = () => ({
    leagues: investorDemo.leagues,
    teams: investorDemo.teams,
    matches: investorDemo.matches,
    seasons: investorDemo.seasons,
    standings: investorDemo.standings,
    athletes: investorDemo.athletes.slice(0, 240),
    challenges: investorDemo.challenges.slice(0, 60),
  });
  if (!usesFirebaseData()) return configured(fallback());
  return withSyntheticDemoFallback(
    async () => {
      const [leagues, teams, matches, seasons, standings, athletes, challenges] = await Promise.all([
        recentCollection<League>('leagues', 48),
        recentCollection<Team>('teams', 240),
        adminDb.collection('matches').orderBy('scheduledAt', 'desc').limit(700).get()
          .then((snapshot) => snapshot.docs.map((item) => matchRecord(item.id, item.data()))),
        recentCollection<Season>('seasons', 80),
        adminDb.collection('standings').orderBy('rank', 'asc').limit(1200).get()
          .then((snapshot) => snapshot.docs.map((item) => record<StoredStanding>(item.id, item.data()))),
        recentAthletes(240),
        recentCollection<Challenge>('challenges', 60),
      ]);
      return { leagues, teams, matches, seasons, standings, athletes, challenges };
    },
    fallback,
  );
}

export async function getPublicAthletes() {
  if (!usesFirebaseData()) return configured(investorDemo.athletes.slice(0, 48));
  return withSyntheticDemoFallback(
    () => recentAthletes(48),
    () => investorDemo.athletes.slice(0, 48),
  );
}

/**
 * The clubs a given set of matches actually references.
 *
 * `/matches` paired a 700-match read with `getPublicTeams()`, which returns the 80 most
 * recently created clubs. The demo database has 141. So 61 clubs were missing from the lookup
 * the match cards use, and every fixture involving one rendered as "Team vs Team" — the card
 * falls back to the literal string when the id does not resolve.
 *
 * Fetching by id instead of by recency makes the lookup complete by construction: it is
 * derived from the matches on the page rather than from a limit that happens to be larger
 * than the catalogue. It is also bounded by the page, not the club count, so it does not
 * degrade as clubs are added.
 *
 * Firestore's `in` takes 30 values, hence the chunking.
 */
async function teamsForMatches(matches: Match[]): Promise<Team[]> {
  const ids = [...new Set(
    matches.flatMap((match) => [
      match.homeTeamId, match.awayTeamId, match.teamAId, match.teamBId,
    ]).filter((id): id is string => Boolean(id)),
  )];
  if (!ids.length) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));

  const snapshots = await Promise.all(chunks.map((chunk) =>
    adminDb.collection('teams').where('__name__', 'in', chunk).get()));

  return snapshots.flatMap((snapshot) =>
    snapshot.docs.map((item) => record<Team>(item.id, item.data())));
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

/**
 * Matches with exactly the clubs they reference, so no fixture renders as "Team vs Team".
 */
export async function getPublicMatchesWithTeams() {
  const fallback = () => ({
    matches: investorDemo.matches,
    teams: investorDemo.teams,
  });
  if (!usesFirebaseData()) return configured(fallback());
  return withSyntheticDemoFallback(
    async () => {
      const snapshot = await adminDb.collection('matches')
        .orderBy('scheduledAt', 'desc')
        .limit(700)
        .get();
      const matches = snapshot.docs.map((item) => matchRecord(item.id, item.data()));
      return { matches, teams: await teamsForMatches(matches) };
    },
    fallback,
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
        recentAthletes(24),
        adminDb.collection('matches').orderBy('scheduledAt', 'desc').limit(40).get()
          .then((snapshot) => snapshot.docs.map((item) => matchRecord(item.id, item.data()))),
        recentCollection<Challenge>('challenges', 12),
      ]);
      return { leagues, teams, athletes, matches, challenges };
    },
    fallback,
  );
}
