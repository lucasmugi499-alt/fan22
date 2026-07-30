'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { navForRole } from '@/lib/nav';
import { getRoutePresentation } from '@/lib/auth/permissions';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { DesktopRail } from './DesktopRail';
import { RouteGuard } from './RouteGuard';
import { ConnectivityBanner } from './ConnectivityBanner';
import { DemoDataNote } from '@/components/ui/DemoDataNote';

/**
 * The application frame. Two chromes, one system:
 *  - Marketing/public routes render bare (they bring their own expressive header/footer).
 *  - App routes get the operational frame: desktop rail ⇄ mobile bottom nav, plus a top
 *    bar for context and account. Nav, tabs and actions stay three separate things.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { authStatus, role } = useAuth();
  const presentation = getRoutePresentation(pathname, authStatus);

  if (presentation === 'marketing') {
    return <div className="min-h-dvh">{children}</div>;
  }

  if (presentation === 'public_discovery') {
    return (
      <MarketingShell>
        <div className="mx-auto min-h-[70dvh] max-w-[var(--page-max)] pb-12 pt-24">
          <DemoDataNote className="mb-4" />
          {children}
        </div>
      </MarketingShell>
    );
  }

  const nav = navForRole(role);

  return (
    <div className="min-h-dvh">
      <DesktopRail nav={nav} />
      <div className="md:pl-60">
        <TopBar nav={nav} role={role} />
        <ConnectivityBanner />
        <main className="mx-auto w-full max-w-[var(--page-max)] px-[var(--gutter)] pb-[calc(var(--nav-h)+var(--safe-bottom)+16px)] pt-4 md:px-6 md:pb-12">
          <RouteGuard pathname={pathname}>
            <DemoDataNote className="mb-4" />
            {children}
          </RouteGuard>
        </main>
      </div>
      <BottomNav nav={nav} />
    </div>
  );
}
