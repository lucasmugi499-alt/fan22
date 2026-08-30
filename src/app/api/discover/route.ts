import { clientIpFrom, enforceRateLimit, jsonError } from '@/server/api/security';
import {
  DISCOVERY_PAGE_SIZE,
  discoveryCities,
  queryDiscovery,
  type DiscoveryEntity,
} from '@/server/discovery/query';

export const runtime = 'nodejs';

/**
 * Paged, server-filtered discovery.
 *
 * `/discover` used to load a fixed slice of every collection and filter it in the browser. At
 * demo scale that slice is the whole catalogue; at 10,000 leagues it is the 48 most recently
 * created, and everything else is unreachable with nothing on the page saying so.
 *
 * Public and unauthenticated, like `/api/search` and for the same reason: discovery is what an
 * anonymous visitor is there to do. Rate limited by address accordingly.
 *
 * Text search is deliberately NOT handled here. `/api/search` already queries the server-built
 * `searchIndex` by token, which is the only structure in this database that can answer a
 * substring query — Firestore cannot. Reimplementing it against the entity collections would
 * mean a second, worse search that disagrees with the first.
 */

const ENTITIES: DiscoveryEntity[] = ['leagues', 'teams', 'athletes', 'matches'];

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const entity = url.searchParams.get('type') ?? 'leagues';

  if (!ENTITIES.includes(entity as DiscoveryEntity)) {
    return jsonError(`type must be one of ${ENTITIES.join(', ')}.`, 400);
  }

  const limited = await enforceRateLimit({
    bucket: 'public_discover',
    identity: [clientIpFrom(request)],
    limit: 90,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // Bounded before they reach a query. A city name is user-supplied and goes into a `where`,
  // and an unbounded string there is a way to make Firestore do work on nothing.
  const sport = (url.searchParams.get('sport') ?? 'all').slice(0, 40);
  const city = (url.searchParams.get('city') ?? 'all').slice(0, 120);
  const verified = url.searchParams.get('verified') === 'true';
  const cursor = url.searchParams.get('cursor')?.slice(0, 200) || undefined;
  const withCities = url.searchParams.get('cities') === 'true';

  try {
    const [page, cities] = await Promise.all([
      queryDiscovery(entity as DiscoveryEntity, { sport, city, verified }, cursor),
      // Only on the first request of a session; the list does not change between pages and
      // re-reading it per page would triple the cost of paging.
      withCities ? discoveryCities() : Promise.resolve(undefined),
    ]);

    return Response.json({
      type: entity,
      pageSize: DISCOVERY_PAGE_SIZE,
      ...page,
      ...(cities ? { cities } : {}),
    }, {
      headers: {
        // Public, identical for every visitor with the same filters, and slow-moving. Shared
        // caching is what stops a popular filter combination costing one query per visitor.
        'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    // A missing composite index surfaces here as a FAILED_PRECONDITION, and it is worth
    // naming: the failure is a deployment gap, not a bad request, and the message Firestore
    // returns carries the console link that creates the index.
    console.error('GoalPlace256 discovery query failed', {
      entity, sport, city, verified,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError('Discovery is temporarily unavailable.', 503);
  }
}
