import { vi } from 'vitest';

/**
 * A permissive `runTransaction` for the shared rate limiter.
 *
 * `requireAuthenticatedMutation` enforces a distributed rate limit through a Firestore
 * transaction. Route tests are exercising authorization and handler behaviour, not the
 * limiter (which has its own coverage), so they install this to let every request
 * through rather than each re-implementing the counter.
 *
 * Use `denyingRateLimitTransaction` to assert that a route is actually limited.
 */
export function allowingRateLimitTransaction() {
  return vi.fn(async (callback: (transaction: unknown) => unknown) => callback({
    get: vi.fn(async () => ({ exists: false, data: () => undefined })),
    set: vi.fn(),
  }));
}

/** Simulates a bucket that has already reached its limit within the current window. */
export function denyingRateLimitTransaction(limit = 1) {
  return vi.fn(async (callback: (transaction: unknown) => unknown) => callback({
    get: vi.fn(async () => ({
      exists: true,
      data: () => ({
        count: limit,
        expiresAt: { toDate: () => new Date(Date.now() + 60_000) },
      }),
    })),
    set: vi.fn(),
  }));
}
