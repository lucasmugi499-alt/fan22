'use client';

/**
 * Send an unhandled browser exception to `/api/client-errors`.
 *
 * ## Rules this follows, in order of importance
 *
 * 1. **It never throws.** A reporter that can fail inside an error handler turns one visible
 *    failure into two, and the second one has nowhere to go. Every path here swallows.
 * 2. **It never blocks.** `keepalive` lets the report survive the navigation that a crash
 *    often triggers, and nothing awaits it.
 * 3. **It sends no user data.** A message, a truncated stack, the PATH, and ids. Never the
 *    query string, never form state, never anything read out of the DOM — a crash reporter
 *    that scrapes context is a crash reporter that exfiltrates it.
 */

/**
 * Long enough to identify a frame, short enough that a runaway recursive stack cannot bill you
 * for the log volume. The server caps it again, because the client is not trusted.
 */
const MAX_STACK = 4_000;

export type ClientErrorKind = 'render' | 'unhandled_rejection' | 'window_error';

export type ClientErrorReport = {
  error: unknown;
  kind?: ClientErrorKind;
  /**
   * The `requestId` from a preceding mutation, where the caller has one.
   *
   * This is the join key: `requireAuthenticatedMutation` mints it per mutation and writes it
   * into the audit entry, so a browser failure and the server record of what caused it become
   * one query instead of two timestamps lined up by eye.
   */
  requestId?: string;
  digest?: string;
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  return 'Unknown client error';
}

export function reportClientError(report: ClientErrorReport): void {
  // Nothing to report to, and nothing worth reporting: a dev-server stack is already in the
  // console in front of whoever caused it.
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV === 'development') return;

  try {
    const body = JSON.stringify({
      message: messageOf(report.error).slice(0, 500),
      stack: report.error instanceof Error && report.error.stack
        ? report.error.stack.slice(0, MAX_STACK)
        : undefined,
      // `pathname` only. `search` carries whatever a page put in the URL, and a reporter is
      // the last place that should be copied into a log.
      path: window.location.pathname.slice(0, 500),
      digest: report.digest,
      requestId: report.requestId,
      kind: report.kind ?? 'render',
    });

    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      // Survives the unload that a crash often causes. Without it the report is cancelled
      // exactly when it is most worth having.
      keepalive: true,
    }).catch(() => {
      // A failed report is not an error worth reporting. Anything else here recurses.
    });
  } catch {
    // Serialising the report failed. Same rule.
  }
}

/**
 * Catch what no React boundary sees: a rejected promise with no handler, and a script error
 * outside the render tree.
 *
 * Idempotent, because it is called from a component that React may mount more than once.
 */
let installed = false;

export function installGlobalErrorReporting(): () => void {
  if (typeof window === 'undefined' || installed) return () => {};
  installed = true;

  const onRejection = (event: PromiseRejectionEvent) => {
    reportClientError({ error: event.reason, kind: 'unhandled_rejection' });
  };
  const onError = (event: ErrorEvent) => {
    reportClientError({ error: event.error ?? event.message, kind: 'window_error' });
  };

  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('error', onError);

  return () => {
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('error', onError);
    installed = false;
  };
}
