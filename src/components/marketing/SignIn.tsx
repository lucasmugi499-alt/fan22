'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Broadcast, SealCheck, Users, ShieldCheck, Gavel, ArrowRight, SignIn as SignInIcon } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { isDemoModeEnabled } from '@/lib/auth/demoMode';
import { getDefaultRouteForRole } from '@/lib/auth/permissions';
import { getUserProfile, getUserRole, isAuthAvailable, login } from '@/lib/firebase/auth';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { Button } from '@/components/ui/Button';
import type { AppRole } from '@/types';
import type { IconComponent } from '@/lib/icons';

const ROLES: { role: AppRole; label: string; blurb: string; icon: IconComponent }[] = [
  { role: 'fan', label: 'Fan', blurb: 'Follow matches and back athletes.', icon: Broadcast },
  { role: 'athlete', label: 'Athlete', blurb: 'Your verified career portfolio.', icon: SealCheck },
  { role: 'team_admin', label: 'Team Admin', blurb: 'Run the roster and submit results.', icon: Users },
  { role: 'league_admin', label: 'League Admin', blurb: 'Operate the league and resolve exceptions.', icon: ShieldCheck },
  { role: 'platform_admin', label: 'Platform Admin', blurb: 'Govern trust across the platform.', icon: Gavel },
];

export function SignIn() {
  const router = useRouter();
  const { setDemoRole } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function enterAs(role: AppRole) {
    setDemoRole(role);
    router.push(getDefaultRouteForRole(role));
  }

  async function submitAccountSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const credential = await login(email.trim(), password);
      const profile = await getUserProfile(credential.user.uid);
      const role = await getUserRole(credential.user, profile);

      if (!role) {
        setError('This account is signed in, but it does not have an app role yet.');
        return;
      }

      router.push(getDefaultRouteForRole(role));
    } catch (cause) {
      const code = typeof cause === 'object' && cause && 'code' in cause ? String(cause.code) : '';
      if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        setError('Email or password is incorrect.');
      } else if (code === 'auth/operation-not-allowed') {
        setError('Email/password sign-in is not enabled in Firebase Authentication.');
      } else {
        setError('Could not sign in. Check the account and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MarketingShell>
      <section className="mx-auto max-w-lg py-12 md:py-16">
        <div className="text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-[var(--radius-lg)] bg-brand text-on-brand shadow-[var(--glow-brand)]">
            <SealCheck className="h-6 w-6" weight="fill" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-text-strong">Enter GoalPlace256</h1>
          {isDemoModeEnabled ? (
            <p className="mt-1 text-sm text-muted">This is a demonstration build. Choose a role to explore the platform.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">Sign in to your account to continue.</p>
          )}
        </div>

        {isDemoModeEnabled ? (
          <div className="mt-8 space-y-2.5">
            {ROLES.map(({ role, label, blurb, icon: Icon }) => (
              <button
                key={role}
                onClick={() => enterAs(role)}
                className="group flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core p-4 text-left transition-[border-color,transform] duration-[var(--dur-micro)] ease-[var(--ease-fluid)] hover:-translate-y-0.5 hover:border-[color:var(--border-glow)]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-3 text-brand">
                  <Icon className="h-5 w-5" weight="bold" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-strong">Continue as {label}</p>
                  <p className="truncate text-xs text-muted">{blurb}</p>
                </div>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-3 text-muted transition-transform duration-[var(--dur-micro)] ease-[var(--ease-fluid)] group-hover:translate-x-0.5 group-hover:text-brand">
                  <ArrowRight className="h-4 w-4" weight="bold" />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={submitAccountSignIn} className="mx-auto mt-8 max-w-sm space-y-4 rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core p-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong outline-none transition-colors placeholder:text-subtle focus:border-brand"
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong outline-none transition-colors placeholder:text-subtle focus:border-brand"
                placeholder="Your password"
              />
            </div>
            {error ? (
              <p className="rounded-[var(--radius-md)] border border-[color:var(--state-error)] bg-[color-mix(in_srgb,var(--state-error),transparent_88%)] px-3 py-2 text-sm text-text-strong">
                {error}
              </p>
            ) : null}
            {!isAuthAvailable() ? (
              <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
                Firebase sign-in is not configured for this deployment.
              </p>
            ) : null}
            <Button type="submit" block icon={SignInIcon} disabled={submitting || !isAuthAvailable()}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        )}

        {isDemoModeEnabled ? (
          <p className="mt-6 text-center text-xs text-subtle">
            You can switch roles at any time from the Demo pill in the bottom corner.
          </p>
        ) : null}
      </section>
    </MarketingShell>
  );
}
