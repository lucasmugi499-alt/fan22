import { adminDb } from '@/lib/firebase/admin';
import { matchesAllWords, searchLookupToken } from '@/lib/search/searchTokens';
import { jsonError, enforceRateLimit, clientIpFrom } from '@/server/api/security';

export const runtime = 'nodejs';

/**
 * Public search over the whole indexed catalogue.
 *
 * Search previously loaded the first 60 records from each of five collections into the
 * browser and filtered them there. Those 60 were neither the most relevant nor the most
 * recent, so most athletes could never be found — which reads to a fan as the platform
 * not having their player.
 *
 * This queries `searchIndex` by prefix token, so every indexed entity is reachable. The
 * index is server-built and contains only fields already public on the entity pages.
 */

const RESULT_LIMIT = 24;
/** Candidates fetched per token before the multi-word filter narrows them. */
const CANDIDATE_LIMIT = 120;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').slice(0, 80);
  const type = url.searchParams.get('type');

  const token = searchLookupToken(query);
  if (!token) return Response.json({ query, results: [] }, { headers: { 'cache-control': 'no-store' } });

  // Unauthenticated endpoint, so the abuse limit is keyed on the caller's address.
  const limited = await enforceRateLimit({
    bucket: 'public_search',
    identity: [clientIpFrom(request)],
    limit: 60,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let firestoreQuery = adminDb.collection('searchIndex')
    .where('tokens', 'array-contains', token) as FirebaseFirestore.Query;
  if (type) firestoreQuery = firestoreQuery.where('type', '==', type);

  const snapshot = await firestoreQuery.limit(CANDIDATE_LIMIT).get().catch(() => null);
  if (!snapshot) return jsonError('Search is temporarily unavailable.', 503);

  const results = snapshot.docs
    .map((document) => document.data())
    // The lookup token matches one word; every other query word must match too, so
    // "kampala united" does not return every club in Kampala.
    .filter((data) => matchesAllWords(String(data.searchText ?? ''), query))
    .slice(0, RESULT_LIMIT)
    .map((data) => ({
      type: data.type ?? null,
      entityId: data.entityId ?? null,
      title: data.title ?? null,
      meta: data.meta ?? null,
      href: data.href ?? null,
    }));

  return Response.json({ query, results }, {
    headers: {
      // Short shared cache: search terms repeat heavily and results change slowly.
      'cache-control': 'public, max-age=30, s-maxage=120',
    },
  });
}
