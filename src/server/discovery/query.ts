import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import { adaptMatch } from '@/lib/matchRecord';
import type { Athlete, League, Match, Team } from '@/types';

/**
 * Browsing the catalogue, on the server, with a cursor.
 *
 * ## What this replaces
 *
 * `/discover` loaded a fixed slice of every collection — 48 leagues, 240 teams, 240 athletes,
 * 700 matches — and filtered it in the browser. At demo scale that is the whole catalogue and
 * it works. At 10,000 leagues it is the 48 most recently created ones, and discovery stops
 * being discovery: nine thousand nine hundred and fifty-two leagues are simply unreachable,
 * with nothing on the page suggesting they exist.
 *
 * Raising the limit does not fix it. Any fixed limit is the same bug with a bigger number, and
 * a bigger number costs more to be wrong. The filtering has to happen where the data is.
 *
 * ## Why the sort fields are what they are
 *
 * Firestore can only order by a stored field, which constrains this more than a client-side
 * sort. Leagues order by `goalPlaceIndex` — and usefully, Firestore sorts `null` LAST in a
 * descending order, which is exactly the "unrated leagues below rated ones" rule that
 * `indexSortValue` implements for the client. Athletes order by `goalPlacePoints`.
 *
 * Teams are the awkward one. The client sorted them by league table position, which lives in
 * the `standings` projection and not on the team document, so Firestore cannot order by it.
 * They order by `createdAt` here and the card still shows table position from the league
 * snapshot. Ordering by the deprecated `leaguePoints` aggregate was the alternative and is
 * worse: `data:guard` exists to stop exactly that, because the aggregate derives from no match
 * and drifts on the next result.
 */

export type DiscoveryEntity = 'leagues' | 'teams' | 'athletes' | 'matches';

export type DiscoveryFilters = {
  /** A sport slug, or `all`. */
  sport?: string;
  /** A city name, or `all`. */
  city?: string;
  verified?: boolean;
};

export type DiscoveryPage<T> = {
  items: T[];
  /**
   * The id to pass back as `cursor` for the next page, or `null` at the end.
   *
   * A document id rather than an encoded sort value, because `startAfter` accepts a snapshot
   * and that keeps the cursor correct for whatever the order happens to be. It costs one extra
   * read per page to re-fetch the anchor, which is the right trade against a cursor that has
   * to be re-derived every time the sort changes.
   */
  nextCursor: string | null;
};

/** One page. Small enough to render fast, large enough that paging feels rare. */
export const DISCOVERY_PAGE_SIZE = 24;

const ORDER: Record<DiscoveryEntity, { field: string; direction: 'asc' | 'desc' }> = {
  // `null` sorts last descending, which is the unrated-leagues-below-rated-ones rule.
  leagues: { field: 'goalPlaceIndex', direction: 'desc' },
  teams: { field: 'createdAt', direction: 'desc' },
  athletes: { field: 'goalPlacePoints', direction: 'desc' },
  matches: { field: 'scheduledAt', direction: 'desc' },
};

/**
 * `city` is not a filter on matches.
 *
 * A match's city is the venue's, and a fan filtering discovery by city means "clubs from my
 * city", not "matches played in a stadium that happens to be there". The club filter already
 * expresses that, so offering a venue filter under the same label would answer a different
 * question than the one asked.
 */
const SUPPORTS_CITY: Record<DiscoveryEntity, boolean> = {
  leagues: true, teams: true, athletes: true, matches: false,
};

const SUPPORTS_VERIFIED: Record<DiscoveryEntity, boolean> = {
  leagues: true, teams: true, athletes: true, matches: false,
};

function isSet(value: string | undefined): value is string {
  return Boolean(value) && value !== 'all';
}

export async function queryDiscovery(
  entity: DiscoveryEntity,
  filters: DiscoveryFilters,
  cursor?: string,
): Promise<DiscoveryPage<League | Team | Athlete | Match>> {
  const order = ORDER[entity];
  let query = adminDb.collection(entity) as FirebaseFirestore.Query;

  // Equality filters first, then the order. Every combination needs its own composite index;
  // `scripts/firestore/discovery-indexes.ts` generates them so the set cannot drift from the
  // combinations this function is willing to build.
  if (isSet(filters.sport)) query = query.where('sport', '==', filters.sport);
  if (isSet(filters.city) && SUPPORTS_CITY[entity]) query = query.where('city', '==', filters.city);
  if (filters.verified && SUPPORTS_VERIFIED[entity]) query = query.where('verified', '==', true);

  query = query.orderBy(order.field, order.direction);

  if (cursor) {
    // `startAfter` on a snapshot rather than a value: it stays correct whatever the order is,
    // and it cannot desync from it the way a hand-encoded sort key can.
    const anchor = await adminDb.collection(entity).doc(cursor).get();
    if (anchor.exists) query = query.startAfter(anchor);
  }

  // One extra, so "is there another page" is answered by the query rather than guessed from a
  // full page. A page of exactly PAGE_SIZE is otherwise ambiguous — the same ambiguity that
  // made the old standings table silently wrong.
  const snapshot = await query.limit(DISCOVERY_PAGE_SIZE + 1).get();
  const hasMore = snapshot.size > DISCOVERY_PAGE_SIZE;
  const docs = snapshot.docs.slice(0, DISCOVERY_PAGE_SIZE);

  const items = docs.map((doc) => {
    const data = { id: doc.id, ...doc.data() };
    // Matches need the same adaptation every other read applies, or a legacy-shaped record
    // fails `isOfficialMatch` on the card that renders it.
    return entity === 'matches' ? adaptMatch(data as Match) : data;
  }) as Array<League | Team | Athlete | Match>;

  return {
    items,
    nextCursor: hasMore ? (docs.at(-1)?.id ?? null) : null,
  };
}

/**
 * The city filter's options, which cannot be derived from one page.
 *
 * Read from leagues rather than every collection: a city with no league in it has nothing for
 * discovery to show, and reading four collections to build a dropdown would cost more than the
 * page it decorates. Capped, because this is a filter list and not a census.
 */
export async function discoveryCities(): Promise<string[]> {
  const snapshot = await adminDb.collection('leagues')
    .orderBy('createdAt', 'desc')
    .limit(300)
    .get();
  return [...new Set(
    snapshot.docs.map((doc) => String(doc.data()?.city ?? '')).filter(Boolean),
  )].sort();
}
