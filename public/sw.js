/**
 * Offline shell for Match Ops.
 *
 * A Field Manager stands on a touchline with a cheap Android phone and no signal. Offline is
 * the default assumption, not a degraded mode, so the shell has to be on the device before
 * kickoff. What this caches is the application shell only: the match package, the lineup
 * snapshot and every captured event live in IndexedDB, because they are per-match data with
 * their own lifecycle and putting them in a URL cache would mean a stale response could
 * answer for a match that has moved on.
 *
 * ## What is deliberately never cached
 *
 * Anything authenticated. A cached operator surface on a shared or lost phone is a data leak
 * with no expiry, and the match ops session token is short-lived by design. Only GET requests
 * for the shell are cached, and only for same-origin navigations outside /api.
 */

const SHELL_CACHE = 'goalplace-shell-v1';

/**
 * The routes a Field Manager needs to reach with the radio off. Deliberately short: every
 * entry is a page that must still work when the network does not, and a longer list is a
 * larger surface to keep correct rather than a better experience.
 */
const SHELL_ROUTES = ['/', '/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ROUTES))
      // A shell route that fails to precache must not abort the install: the worker is still
      // useful for everything that did cache, and a failed install means no offline support
      // at all rather than partial.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /**
   * API traffic is never served from cache, and never written to it.
   *
   * Match ops writes are queued in IndexedDB and replayed by the application, which knows
   * about idempotency keys and sequence numbers. A service worker replaying them would be a
   * second, dumber retry mechanism racing the first, and a cached GET could answer a clock
   * read with a stale anchor, which is precisely the failure the server-anchored clock
   * exists to prevent.
   */
  if (url.pathname.startsWith('/api/')) return;

  // Network first, cache as fallback. A Field Manager online should see current data; a
  // Field Manager offline should see the shell rather than a browser error page.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.mode === 'navigate') {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('/offline');
          if (shell) return shell;
        }
        return new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
      }),
  );
});
