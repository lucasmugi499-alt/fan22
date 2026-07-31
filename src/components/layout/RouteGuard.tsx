'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, SpinnerGap } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { canAccessRoute, getDefaultRouteForRole } from '@/lib/auth/permissions';
import { Button } from '@/components/ui/Button';

/**
 * Front-end route enforcement. Firestore rules remain the real security boundary; this
 * exists so the app never renders a workspace the current role cannot use, which previously
 * left a logged-out visitor looking at an admin page underneath a fan shell.
 *
 * A wrong-role or logged-out visitor is redirected once. If the redirect cannot resolve
 * (role has no home, or they deliberately typed a forbidden URL) they get an explicit
 * Access Denied rather than a silent blank.
 */
export function RouteGuard({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const router = useRouter();
  const { authStatus, userProfile, role, accessContext, loading } = useAuth();

  const allowed = canAccessRoute({ authStatus, userProfile, role, accessContext }, pathname);
  const home = getDefaultRouteForRole(role);
  // A signed-in user sent to their own dashboard; a visitor sent to sign in.
  const target = authStatus === 'logged_in' && home !== pathname ? home : '/login';
  const redirecting = !loading && !allowed && target !== pathname;

  useEffect(() => {
    if (loading || allowed) return;
    // Only auto-redirect when there is somewhere useful to go, so a deliberate forbidden
    // URL surfaces the denial instead of bouncing the user in circles.
    if (target === pathname) return;
    router.replace(target);
  }, [loading, allowed, target, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <SpinnerGap className="h-6 w-6 animate-spin text-muted" aria-label="Loading" />
      </div>
    );
  }

  if (allowed) return <>{children}</>;

  if (redirecting) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <SpinnerGap className="h-6 w-6 animate-spin text-muted" aria-label="Redirecting" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-16 text-center">
      <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-surface-3 text-muted">
        <Lock className="h-6 w-6" weight="bold" />
      </span>
      <h1 className="text-xl font-semibold text-text-strong">
        {authStatus === 'logged_in' ? 'You do not have access to this area' : 'Sign in to continue'}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {authStatus === 'logged_in'
          ? 'This workspace belongs to a different role. Your own workspace is always one tap away.'
          : 'This part of GoalPlace256 is only available once you are signed in.'}
      </p>
      <div className="mt-6 flex justify-center">
        <Link href={authStatus === 'logged_in' ? home : '/login'}>
          <Button>{authStatus === 'logged_in' ? 'Go to my workspace' : 'Sign in'}</Button>
        </Link>
      </div>
    </div>
  );
}
