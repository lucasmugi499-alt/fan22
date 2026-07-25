'use client';

import { useRouter } from 'next/navigation';
import { Broadcast, SealCheck, Users, ShieldCheck, Gavel, ArrowRight } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { isDemoModeEnabled } from '@/lib/auth/demoMode';
import { getDefaultRouteForRole } from '@/lib/auth/permissions';
import { MarketingShell } from '@/components/marketing/MarketingShell';
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

  function enterAs(role: AppRole) {
    setDemoRole(role);
    router.push(getDefaultRouteForRole(role));
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
          <div className="mx-auto mt-8 max-w-sm rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core p-5 text-center text-sm text-muted">
            Account sign-in is not enabled on this build.
          </div>
        )}

        <p className="mt-6 text-center text-xs text-subtle">
          You can switch roles at any time from the Demo pill in the bottom corner.
        </p>
      </section>
    </MarketingShell>
  );
}
