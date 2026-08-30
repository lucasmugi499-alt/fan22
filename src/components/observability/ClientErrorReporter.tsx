'use client';

import { useEffect } from 'react';
import { installGlobalErrorReporting } from '@/lib/observability/reportClientError';

/**
 * Installs the window-level error handlers, once, for the whole app.
 *
 * React error boundaries catch failures during render. They do not catch a rejected promise
 * with no handler, or a script error raised outside the render tree — which between them are
 * most of what actually goes wrong in a browser: a fetch that rejects in an event handler, a
 * third-party script, an async effect nobody awaited.
 *
 * Renders nothing. It exists to be mounted in the root layout so the handlers are installed
 * for every route, including the ones that never render an error boundary because they never
 * fail.
 */
export function ClientErrorReporter() {
  useEffect(() => installGlobalErrorReporting(), []);
  return null;
}
