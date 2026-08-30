'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Text search over the whole catalogue, for the Discover tabs.
 *
 * ## What this replaces
 *
 * The Discover text box filtered the page that happened to be loaded — 24 or 48 records — and
 * said so in small print underneath. Typing "Mbarara United", a club that exists twice in the
 * database and appears on the fixtures list two screens away, returned "No teams found".
 *
 * That was my call when the tabs moved to server-side paging, and it was the wrong one. A
 * search box that only searches what is on screen is not a search box: the user has no way to
 * know the difference between "no such club" and "not on this page", and the two look
 * identical.
 *
 * ## Why it queries `/api/search` rather than the discovery endpoint
 *
 * Firestore cannot do substring matching. `searchIndex` is the server-built projection that
 * can — every indexed entity is reachable by prefix token, which is exactly what the discovery
 * collections cannot answer. Building a second search against those collections would produce
 * a worse one that disagrees with the first.
 *
 * ## What it deliberately does not do
 *
 * Apply the sport and region filters. Search entries carry a display `meta` string, not
 * structured sport and city fields, and parsing a string built for humans in order to filter on
 * it is the kind of shortcut that works until somebody rewords the string. The interface says
 * search covers the whole catalogue instead of pretending the filters still apply.
 */

/** The entity kinds `searchIndex` holds. Matches are not among them. */
export type SearchableEntity = 'athlete' | 'team' | 'league';

export type CatalogueSearchResult = {
  type: string | null;
  entityId: string | null;
  title: string | null;
  meta: string | null;
  href: string | null;
};

export type CatalogueSearchState = {
  results: CatalogueSearchResult[];
  loading: boolean;
  error: string | null;
};

/**
 * Long enough that typing a club name is one query rather than eleven, short enough that the
 * results feel like they are keeping up.
 */
const DEBOUNCE_MS = 250;

/** Below this a prefix token matches most of the catalogue, so the results are noise. */
const MIN_QUERY = 2;

export function useCatalogueSearch(
  query: string,
  type: SearchableEntity | undefined,
): CatalogueSearchState {
  /**
   * Results tagged with the query they answer.
   *
   * Keeping the key in the state lets `loading` be derived: a result set tagged with a
   * different query is by definition stale, so there is no `setLoading(true)` at the top of
   * the effect scheduling a second render for something the props already said.
   */
  const [state, setState] = useState<{
    key: string;
    results: CatalogueSearchResult[];
    error: string | null;
  }>({ key: '', results: [], error: null });

  /**
   * Guards against an out-of-order response.
   *
   * Every keystroke can start a request and there is no guarantee they resolve in order, so
   * without this the results for "Mbar" can land after the results for "Mbarara" and replace
   * them — which reads as search returning the wrong thing.
   */
  const requestId = useRef(0);
  const trimmed = query.trim();
  const active = Boolean(type) && trimmed.length >= MIN_QUERY;
  const key = active ? `${type}|${trimmed}` : '';
  const settled = state.key === key;

  useEffect(() => {
    if (!active || !type || settled) return;

    const id = ++requestId.current;
    const timer = setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(trimmed)}&type=${type}`)
        .then(async (response) => {
          if (!response.ok) throw new Error('Search is temporarily unavailable.');
          return response.json() as Promise<{ results: CatalogueSearchResult[] }>;
        })
        .then((payload) => {
          if (id !== requestId.current) return;
          setState({ key, results: payload.results ?? [], error: null });
        })
        .catch((cause: Error) => {
          if (id !== requestId.current) return;
          setState({ key, results: [], error: cause.message });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [active, trimmed, type, key, settled]);

  return {
    results: active && settled ? state.results : [],
    // Derived: a query with no result set tagged to it has not come back yet. Covers the
    // debounce window too, so the box does not sit on stale results looking finished.
    loading: active && !settled,
    error: settled ? state.error : null,
  };
}
