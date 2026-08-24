'use client';

import { useEffect } from 'react';

/**
 * Registers the offline shell worker.
 *
 * Registration is deferred to the load event rather than run during hydration: a Field
 * Manager opening the capture surface two minutes before kickoff should spend the network on
 * the match package, not on precaching shell routes. The worker is useful for the next visit
 * either way, and racing it against the thing the user is waiting for makes the visit slower
 * for no benefit.
 *
 * Failure is deliberately silent. A browser with service workers disabled, or a private
 * window that refuses registration, still runs the whole application; announcing it would be
 * noise about a capability the user did not ask for.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
