'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { navForRole } from '@/lib/nav';
import { PUBLIC_ROUTES } from '@/lib/auth/permissions';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { DesktopRail } from './DesktopRail';

/**
 * The application frame. Two chromes, one system:
 *  - Marketing/public routes render bare (they bring their own expressive header/footer).
 *  - App routes get the operational frame: desktop rail ⇄ mobile bottom nav, plus a top
 *    bar for context and account. Nav, tabs and actions stay three separate things.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role } = useAuth();

  const isMarketing =
    PUBLIC_ROUTES.includes(pathname) ||
    pathname === '/' ||
    pathname.startsWith('/about') ||
    pathname.startsWith('/how-it-works') ||
    pathname.startsWith('/pilot') ||
    pathname.startsWith('/verification') ||
    pathname.startsWith('/sponsors') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register');

  if (isMarketing) {
    return <div className="min-h-dvh">{children}</div>;
  }

  const nav = navForRole(role);

  return (
    <div className="min-h-dvh">
      <DesktopRail nav={nav} />
      <div className="md:pl-60">
        <TopBar nav={nav} role={role} />
        <main className="mx-auto w-full max-w-[var(--page-max)] px-[var(--gutter)] pb-[calc(var(--nav-h)+var(--safe-bottom)+16px)] pt-4 md:px-6 md:pb-12">
          {children}
        </main>
      </div>
      <BottomNav nav={nav} />
    </div>
  );
}
