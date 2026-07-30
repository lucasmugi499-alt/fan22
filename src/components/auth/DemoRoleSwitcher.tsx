'use client';

import { usePathname } from 'next/navigation';
import { UserSwitch } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { isDemoModeEnabled } from '@/lib/auth/demoMode';
import { isPublicRoute } from '@/lib/auth/permissions';
import { environmentFlags, goalPlaceEnvironment } from '@/lib/environment';

/**
 * Dev/demo-only role switcher. Gated behind `isDemoModeEnabled` exactly like the auth
 * layer — it must never appear on an unguarded production build. Sits above the mobile
 * bottom nav so it never overlaps a real destination.
 */
export function DemoRoleSwitcher() {
  const pathname = usePathname();
  const { role, setDemoRole } = useAuth();

  const investorToolsEnabled = goalPlaceEnvironment() === 'demo' && environmentFlags().enableInvestorTools;
  if (!isDemoModeEnabled || !investorToolsEnabled || !role || isPublicRoute(pathname)) return null;

  function switchAccount() {
    setDemoRole(null);
    window.location.assign('/login');
  }

  return (
    <div className="fixed left-3 z-50 bottom-[calc(var(--nav-h)+var(--safe-bottom)+68px)] md:bottom-4">
      <button
        onClick={switchAccount}
        className="flex items-center gap-2 rounded-[var(--radius-pill)] border border-border-strong bg-surface-1 py-2 pl-3 pr-3.5 text-sm font-medium text-text-strong shadow-e2"
      >
        <UserSwitch className="h-4 w-4 text-brand" weight="bold" />
        Switch demo account
      </button>
    </div>
  );
}
