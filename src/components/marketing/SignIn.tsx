'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Broadcast, SealCheck, Users, ShieldCheck, Gavel, ArrowRight, Eye, EyeSlash, SignIn as SignInIcon } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { isDemoModeEnabled } from '@/lib/auth/demoMode';
import { getDefaultRouteForRole, getPostSignInRoute } from '@/lib/auth/permissions';
import {
  isAuthAvailable,
  login,
  logout,
  registerAccount,
  requestPasswordReset,
} from '@/lib/firebase/auth';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import type { AppRole } from '@/types';
import type { IconComponent } from '@/lib/icons';

const ROLES: { role: AppRole; label: string; blurb: string; icon: IconComponent }[] = [
  { role: 'fan', label: 'Fan', blurb: 'Follow matches and back athletes.', icon: Broadcast },
  { role: 'athlete', label: 'Athlete', blurb: 'Your verified career portfolio.', icon: SealCheck },
  { role: 'team_admin', label: 'Team Admin', blurb: 'Run the roster and submit results.', icon: Users },
  { role: 'league_admin', label: 'League Admin', blurb: 'Operate the league and resolve exceptions.', icon: ShieldCheck },
  { role: 'platform_admin', label: 'Platform Admin', blurb: 'Govern trust across the platform.', icon: Gavel },
];

type AccountMode = 'signin' | 'register' | 'reset';

export function SignIn({
  initialMode = 'signin',
  nextPath,
}: {
  initialMode?: AccountMode;
  nextPath?: string;
}) {
  const router = useRouter();
  const { setDemoRole, authStatus, role } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<AccountMode>(initialMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [awaitingAuthState, setAwaitingAuthState] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  useEffect(() => {
    if (!awaitingAuthState || authStatus !== 'logged_in') return;
    if (!role) return;
    router.replace(getPostSignInRoute(role, nextPath));
  }, [authStatus, awaitingAuthState, nextPath, role, router]);
  const accountRoleError = awaitingAuthState && authStatus === 'logged_in' && !role
    ? 'This account is signed in, but it does not have an app role yet.'
    : null;

  function enterAs(role: AppRole) {
    setDemoRole(role);
    router.push(getDefaultRouteForRole(role));
  }

  async function submitAccountSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      if (mode === 'reset') {
        await requestPasswordReset(email.trim());
        setSuccess('Password reset email sent. Check your inbox.');
        return;
      }

      if (mode === 'register') {
        if (name.trim().length < 2) {
          setError('Enter your full name.');
          return;
        }
        if (password.length < 8) {
          setError('Use at least eight characters for your password.');
          return;
        }
        await registerAccount({ email: email.trim(), password, name: name.trim() });
        await logout();
        setMode('signin');
        setPassword('');
        setSuccess('Account created. Check your inbox to verify your email, then sign in.');
        return;
      }

      await login(email.trim(), password);
      setAwaitingAuthState(true);
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
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-text-strong">
            {isDemoModeEnabled
              ? 'Enter GoalPlace256'
              : mode === 'register'
                ? 'Create your fan account'
                : mode === 'reset'
                  ? 'Reset your password'
                  : 'Welcome back'}
          </h1>
          {isDemoModeEnabled ? (
            <p className="mt-1 text-sm text-muted">This is a demonstration build. Choose a role to explore the platform.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              {mode === 'register'
                ? 'Start following local leagues, teams, athletes, and fantasy competitions.'
                : mode === 'reset'
                  ? 'Enter your email and we will send a secure reset link.'
                  : 'Sign in to continue to your sports home.'}
            </p>
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
            <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-md)] bg-surface-2 p-1">
              {([
                ['signin', 'Sign in'],
                ['register', 'Create account'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMode(value);
                    setError(null);
                    setSuccess(null);
                  }}
                  className={`h-10 rounded-[var(--radius-sm)] text-sm font-semibold ${mode === value ? 'bg-surface-3 text-text-strong' : 'text-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === 'register' ? (
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                  Full name
                </label>
                <input
                  id="name"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong outline-none transition-colors placeholder:text-subtle focus:border-brand"
                  placeholder="Your name"
                />
              </div>
            ) : null}
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
            {mode !== 'reset' ? <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 pr-12 text-sm text-text-strong outline-none transition-colors placeholder:text-subtle focus:border-brand"
                  placeholder="Your password"
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-muted hover:text-text-strong">
                  {showPassword ? <EyeSlash className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {mode === 'register' ? <p className="text-xs text-muted">Use at least eight characters.</p> : null}
            </div> : null}
            {error || accountRoleError ? (
              <p className="rounded-[var(--radius-md)] border border-[color:var(--state-error)] bg-[color-mix(in_srgb,var(--state-error),transparent_88%)] px-3 py-2 text-sm text-text-strong">
                {error ?? accountRoleError}
              </p>
            ) : null}
            {success ? (
              <p className="rounded-[var(--radius-md)] border border-[color:var(--state-verified)] bg-[var(--state-verified-bg)] px-3 py-2 text-sm text-text-strong">
                {success}
              </p>
            ) : null}
            {!isAuthAvailable() ? (
              <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
                Firebase sign-in is not configured for this deployment.
              </p>
            ) : null}
            <Button type="submit" block icon={SignInIcon} disabled={submitting || !isAuthAvailable()}>
              {submitting
                ? 'Please wait...'
                : mode === 'register'
                  ? 'Create fan account'
                  : mode === 'reset'
                    ? 'Send reset email'
                    : 'Sign in'}
            </Button>
            {mode === 'signin' ? (
              <button type="button" onClick={() => setMode('reset')} className="min-h-11 w-full text-sm font-medium text-muted hover:text-brand">
                Forgot password?
              </button>
            ) : mode === 'reset' ? (
              <button type="button" onClick={() => setMode('signin')} className="min-h-11 w-full text-sm font-medium text-muted hover:text-brand">
                Back to sign in
              </button>
            ) : (
              <>
                <p className="text-center text-xs leading-5 text-muted">
                  By creating an account, you agree to the <a href="/terms" className="text-brand hover:underline">Terms</a> and <a href="/privacy" className="text-brand hover:underline">Privacy notice</a>. Athlete and administrator access requires verification or invitation.
                </p>
                <button type="button" onClick={() => setMode('signin')} className="min-h-11 w-full text-sm font-medium text-muted hover:text-brand">
                  Already have an account? Sign in
                </button>
              </>
            )}
          </form>
        )}

        {isDemoModeEnabled ? (
          <p className="mt-6 text-center text-xs text-subtle">
            You can switch roles at any time from the Demo pill in the bottom corner.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => setAccessOpen(true)}
          className="mx-auto mt-5 flex min-h-11 items-center justify-center text-sm font-semibold text-brand hover:underline"
        >
          How accounts and invitations work
        </button>
      </section>

      <Sheet
        open={accessOpen}
        onClose={() => setAccessOpen(false)}
        title="Choose the right access path"
        description="Public roles are never selected during registration."
      >
        <div className="space-y-3">
          <AccessPath
            icon={Broadcast}
            title="Fan account"
            description="Create your own account, follow local sport, join fantasy, and support verified needs."
            action="Create fan account"
            onClick={() => {
              setAccessOpen(false);
              setMode('register');
            }}
          />
          <AccessPath
            icon={ShieldCheck}
            title="League organizer"
            description="Create a fan account first, then submit the league and your authority for Platform Admin review."
            action="Apply to operate a league"
            onClick={() => router.push('/apply/league-admin')}
          />
          <AccessPath
            icon={Users}
            title="Team administrator"
            description="A League Admin adds the team and sends an expiring email invitation. Sign in through that link to accept."
            action="I have an invitation"
            onClick={() => {
              setAccessOpen(false);
              setMode('signin');
            }}
          />
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-4">
            <div className="flex items-start gap-3">
              <Gavel className="mt-0.5 h-5 w-5 shrink-0 text-brand-2" weight="duotone" />
              <div>
                <p className="text-sm font-semibold text-text-strong">Platform oversight</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Platform Admins review league applications, issue trusted role access, and retain an audit trail of invitations and approvals.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Sheet>
    </MarketingShell>
  );
}

function AccessPath({
  icon: Icon,
  title,
  description,
  action,
  onClick,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-brand-subtle text-brand">
          <Icon className="h-5 w-5" weight="duotone" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-strong">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
          <button type="button" onClick={onClick} className="mt-3 min-h-11 text-sm font-semibold text-brand hover:underline">
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}
