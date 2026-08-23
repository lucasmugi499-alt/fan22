import { expect } from 'vitest';

/**
 * Collections the hardened mutation wrapper touches before a route's own handler runs.
 *
 * `requireAuthenticatedMutation` applies the abuse limit before authorization, on
 * purpose: a caller that is about to be rejected should still be prevented from probing
 * the endpoint at unlimited speed. So "rejected without touching Firestore" now means
 * "touched no domain collection", not "touched nothing at all".
 *
 * `users` joined this set on 2026-08-23 when the wrapper began resolving the active
 * principal before authorization — a suspended operator must be refused by every mutation
 * route, including ones that never reached the platform command guard. That read is
 * authorization work rather than handler work, which is why it belongs here; the assertion
 * still catches a rejected request touching organizations, teams, leagues or any other
 * domain collection.
 */
const INFRASTRUCTURE_COLLECTIONS = new Set(['apiRateLimits', 'users']);

/**
 * Asserts a route rejected a request without reading or writing any domain data.
 * Infrastructure collections used by the shared wrapper are ignored.
 */
export function expectNoDomainCollectionAccess(collectionMock: { mock: { calls: unknown[][] } }) {
  const domainCollections = collectionMock.mock.calls
    .map((call) => String(call[0]))
    .filter((name) => !INFRASTRUCTURE_COLLECTIONS.has(name));

  expect(domainCollections).toEqual([]);
}


/**
 * Asserts a route rejected a request without performing its own domain transaction.
 *
 * The shared wrapper's rate limiter runs in a transaction of its own before
 * authorization — deliberately, so a caller about to be rejected still cannot probe the
 * endpoint at unlimited speed. It runs at most once per request, so anything beyond a
 * single transaction is the handler doing real work.
 */
export function expectNoDomainTransaction(transactionMock: { mock: { calls: unknown[][] } }) {
  expect(transactionMock.mock.calls.length).toBeLessThanOrEqual(1);
}
