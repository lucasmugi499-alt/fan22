'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/observability/reportClientError';

/**
 * The boundary of last resort: a failure in the root layout itself.
 *
 * `app/error.tsx` cannot catch this one, because it renders INSIDE the layout that failed.
 * This replaces the whole document, which is why it ships its own `<html>` and `<body>` and
 * why the styling is inline — the stylesheet is part of what may not have loaded.
 *
 * Deliberately plain. Everything a richer page would need (fonts, the design system, the icon
 * set) is a dependency that could be the thing that broke.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError({ error, digest: error.digest, kind: 'render' });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#07100c',
          color: '#e9eeeb',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '1.5rem',
        }}
      >
        <main style={{ maxWidth: '32rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.35rem', margin: 0 }}>GoalPlace256 could not load</h1>
          <p style={{ marginTop: '0.75rem', lineHeight: 1.6, color: '#94a2a0' }}>
            Something failed before the page could start. Your account and your data are not
            affected.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              padding: '0.65rem 1.4rem',
              borderRadius: '0.5rem',
              border: 0,
              background: '#00c46a',
              color: '#04140c',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
