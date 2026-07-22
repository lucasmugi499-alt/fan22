'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';

/**
 * Last-resort boundary: this replaces the root layout, so it cannot rely on AppShell,
 * providers, fonts, or globals.css being intact. Styles are inlined deliberately — if the
 * root layout is what failed, a stylesheet-dependent fallback may render unstyled.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#05070A',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '1.5rem',
        }}
      >
        <title>Something went wrong | GoalPlace256</title>
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <div
            style={{
              margin: '0 auto 1.5rem',
              width: '3rem',
              height: '3rem',
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(0,196,106,0.4)',
              background: 'linear-gradient(135deg, #00C46A, #008F4C)',
              fontWeight: 900,
              fontSize: '0.75rem',
            }}
          >
            GP256
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', lineHeight: 1.6, color: '#94a3b8' }}>
            GoalPlace256 hit an unexpected error and could not finish loading. Your data has not been
            affected.
          </p>
          {error.digest && (
            <p style={{ marginTop: '1rem', fontSize: '0.6875rem', color: '#475569', fontFamily: 'monospace' }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: '2rem',
              cursor: 'pointer',
              borderRadius: '0.5rem',
              border: 'none',
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: 900,
              color: '#031008',
              background: 'linear-gradient(90deg, #00C46A, #4DFFB3)',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
