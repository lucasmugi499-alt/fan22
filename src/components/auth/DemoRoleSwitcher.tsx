'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { UserSwitch, Check, SignOut } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { isDemoModeEnabled } from '@/lib/auth/demoMode';
import { isPublicRoute } from '@/lib/auth/permissions';
import type { AppRole } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Dev/demo-only role switcher. Gated behind `isDemoModeEnabled` exactly like the auth
 * layer — it must never appear on an unguarded production build. Sits above the mobile
 * bottom nav so it never overlaps a real destination.
 */
const DEMO_ROLES: { role: AppRole; label: string }[] = [
  { role: 'fan', label: 'Fan' },
  { role: 'athlete', label: 'Athlete' },
  { role: 'team_admin', label: 'Team Admin' },
  { role: 'league_admin', label: 'League Admin' },
  { role: 'platform_admin', label: 'Platform Admin' },
];

export function DemoRoleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { role, setDemoRole } = useAuth();
  const [open, setOpen] = useState(false);

  if (!isDemoModeEnabled || (pathname !== '/login' && isPublicRoute(pathname))) return null;

  const currentLabel = DEMO_ROLES.find((r) => r.role === role)?.label ?? 'Guest';

  function signOut() {
    setOpen(false);
    // setDemoRole(null) hard-navigates to '/' itself when Firebase is configured; the
    // router push covers the mock-only environment where it does not.
    setDemoRole(null);
    router.push('/');
  }

  return (
    <div className="fixed left-3 z-50 bottom-[calc(var(--nav-h)+var(--safe-bottom)+68px)] md:bottom-4">
      {open ? (
        <div
          role="menu"
          className="mb-2 w-52 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 shadow-e3"
        >
          <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
            Demo · view as
          </p>
          <ul className="p-1">
            {DEMO_ROLES.map(({ role: r, label }) => {
              const isCurrent = r === role;
              return (
                <li key={r}>
                  <button
                    role="menuitemradio"
                    aria-checked={isCurrent}
                    onClick={() => {
                      setDemoRole(r);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm',
                      isCurrent ? 'bg-brand-subtle font-medium text-brand' : 'text-text hover:bg-surface-3'
                    )}
                  >
                    {label}
                    {isCurrent ? <Check className="h-4 w-4" weight="bold" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border p-1">
            <button
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-muted hover:bg-surface-3 hover:text-text-strong"
            >
              <SignOut className="h-4 w-4" weight="bold" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-[var(--radius-pill)] border border-border-strong bg-surface-1 py-2 pl-3 pr-3.5 text-sm font-medium text-text-strong shadow-e2"
      >
        <UserSwitch className="h-4 w-4 text-brand" weight="bold" />
        <span className="text-subtle">Demo:</span> {currentLabel}
      </button>
    </div>
  );
}
