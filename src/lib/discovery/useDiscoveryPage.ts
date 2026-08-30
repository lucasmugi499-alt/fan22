'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Athlete, League, Match, Team } from '@/types';

/**
 * One page of discovery at a time, from the server.
 *
 * `/discover` filtered a fixed client-side slice — 48 leagues, 240 teams, 240 athletes. That is
 * the whole catalogue at demo scale and the 48 most recently created at 10,000 leagues, with
 * nothing on the page suggesting the rest exist.
 *
 * ## Why a text query is handled elsewhere
 *
 * Firestore cannot do substring matching, and `/api/search` already answers text queries
 * against the server-built `searchIndex`. This hook covers BROWSING — filter and page — and
 * leaves searching to the thing built for it, rather than shipping a second, worse search that
 * disagrees with the first.
 */

export type DiscoveryEntity = 'leagues' | 'teams' | 'athletes' | 'matches';

export type DiscoveryItem = League | Team | Athlete | Match;

export type DiscoveryFilters = {
  sport: string;
  city: string;
  verified: boolean;
};

export type DiscoveryPageState = {
  items: DiscoveryItem[];
  cities: string[];
  loading: boolean;
  /** True while a `loadMore` is in flight, so the button can say so without blanking the list. */
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
};

export function useDiscoveryPage(
  entity: DiscoveryEntity,
  filters: DiscoveryFilters,
  options: { enabled?: boolean } = {},
): DiscoveryPageState {
  const enabled = options.enabled ?? true;
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * The whole result, tagged with the query it belongs to.
   *
   * Keeping the key IN the state is what lets `loading` be derived rather than set: a state
   * whose key is not the current key is by definition stale, so there is no need for a
   * `setLoading(true)` at the top of the effect. That synchronous set is also what React flags
   * as a cascading render — it schedules a second render for a fact already known from the
   * props that caused the first.
   */
  const [state, setState] = useState<{
    key: string;
    items: DiscoveryItem[];
    cursor: string | null;
    cities: string[];
    error: string | null;
  }>({ key: '', items: [], cursor: null, cities: [], error: null });

  const [loadingMore, setLoadingMore] = useState(false);

  /**
   * Guards against an out-of-order response overwriting a newer one.
   *
   * Changing a filter twice quickly starts two requests, and there is no guarantee the first
   * resolves first. Without this, the slower response for the OLDER filter can land last and
   * repopulate the list with results the user has already moved past — which reads as the
   * filter not working.
   */
  const requestId = useRef(0);

  const key = `${entity}|${filters.sport}|${filters.city}|${filters.verified}|${reloadToken}`;
  const settled = state.key === key;

  const params = useCallback((extra: Record<string, string> = {}) => new URLSearchParams({
    type: entity,
    sport: filters.sport,
    city: filters.city,
    // Only when on: an absent parameter is the default, and sending `verified=false` would
    // make the cache key differ for two requests that mean the same thing.
    ...(filters.verified ? { verified: 'true' } : {}),
    ...extra,
  }), [entity, filters.sport, filters.city, filters.verified]);

  // A filter change resets to page one. `key` is the dependency, so this reruns exactly when
  // the query identity changes and not when an unrelated render happens.
  useEffect(() => {
    if (!enabled || settled) return;
    const id = ++requestId.current;

    void fetch(`/api/discover?${params({ cities: 'true' })}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Discovery is temporarily unavailable.');
        return response.json() as Promise<{
          items: DiscoveryItem[]; nextCursor: string | null; cities?: string[];
        }>;
      })
      .then((page) => {
        if (id !== requestId.current) return;
        setState((current) => ({
          key,
          items: page.items,
          cursor: page.nextCursor,
          // The city list is fetched with the first page only and does not change between
          // pages, so a later page must not blank it.
          cities: page.cities ?? current.cities,
          error: null,
        }));
      })
      .catch((cause: Error) => {
        if (id !== requestId.current) return;
        setState((current) => ({ ...current, key, items: [], cursor: null, error: cause.message }));
      });
  }, [key, enabled, settled, params]);

  const loadMore = useCallback(() => {
    if (!state.cursor || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);

    void fetch(`/api/discover?${params({ cursor: state.cursor })}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load more.');
        return response.json() as Promise<{ items: DiscoveryItem[]; nextCursor: string | null }>;
      })
      .then((page) => {
        // A filter changed while this page was in flight, so appending it would mix results
        // from two different queries into one list.
        if (id !== requestId.current) return;
        setState((current) => ({
          ...current,
          items: [...current.items, ...page.items],
          cursor: page.nextCursor,
        }));
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setState((current) => ({ ...current, error: 'Could not load more results.' }));
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setLoadingMore(false);
      });
  }, [state.cursor, loadingMore, params]);

  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    items: settled ? state.items : [],
    cities: state.cities,
    // Derived, not stored: a result tagged with a different query IS the loading state.
    loading: enabled && !settled,
    loadingMore,
    error: settled ? state.error : null,
    hasMore: Boolean(state.cursor) && settled,
    loadMore,
    retry,
  };
}
