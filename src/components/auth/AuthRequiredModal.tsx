'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Link from 'next/link';
import { X, LockKey } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';

/**
 * A gate for actions that require a signed-in user. Components call
 * `useAuthGate().requireAuth(fn)` — if the user is signed in (or in demo mode) the action
 * runs; otherwise a sign-in prompt is shown instead of the action silently failing.
 */
type AuthGate = {
  requireAuth: (action: () => void, reason?: string) => void;
  open: (reason?: string) => void;
};

const AuthGateContext = createContext<AuthGate | null>(null);

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const { authStatus, isDemoMode } = useAuth();
  const [reason, setReason] = useState<string | null>(null);
  const isAuthed = authStatus === 'logged_in' || isDemoMode;

  const open = useCallback((why?: string) => setReason(why ?? 'Sign in to continue.'), []);
  const requireAuth = useCallback(
    (action: () => void, why?: string) => {
      if (isAuthed) action();
      else open(why);
    },
    [isAuthed, open]
  );

  const value = useMemo<AuthGate>(() => ({ requireAuth, open }), [requireAuth, open]);

  return (
    <AuthGateContext.Provider value={value}>
      {children}
      {reason !== null ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-end sm:place-items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Sign in required"
        >
          <button
            aria-label="Close"
            onClick={() => setReason(null)}
            className="absolute inset-0 bg-black/45 motion-safe:animate-[fadeIn_var(--dur-micro)_ease-out]"
          />
          <div className="relative w-full rounded-t-[var(--radius-xl)] border border-border bg-surface-1 p-6 shadow-e3 pb-safe motion-safe:animate-[sheetUp_var(--dur-drawer)_var(--ease-fluid)] sm:m-4 sm:max-w-sm sm:rounded-[var(--radius-xl)]">
            <button
              onClick={() => setReason(null)}
              aria-label="Close"
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-3"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-subtle text-brand">
              <LockKey className="h-5 w-5" weight="bold" />
            </span>
            <h2 className="mt-3 text-lg font-semibold text-text-strong">Sign in to continue</h2>
            <p className="mt-1 text-sm text-muted">{reason}</p>
            <div className="mt-5 flex gap-2">
              <Link
                href="/login"
                onClick={() => setReason(null)}
                className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-md)] bg-brand px-4 text-sm font-medium text-on-brand hover:bg-[var(--brand-hover)]"
              >
                Sign in
              </Link>
              <button
                onClick={() => setReason(null)}
                className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-md)] border border-border-strong bg-surface-1 px-4 text-sm font-medium text-text-strong hover:bg-surface-3"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AuthGateContext.Provider>
  );
}

export function useAuthGate(): AuthGate {
  const ctx = useContext(AuthGateContext);
  if (!ctx) throw new Error('useAuthGate must be used within AuthModalProvider');
  return ctx;
}
