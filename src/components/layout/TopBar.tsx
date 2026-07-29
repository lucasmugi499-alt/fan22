'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, MagnifyingGlass, SignIn } from '@phosphor-icons/react';
import type { AppRole } from '@/types';
import type { RoleNav } from '@/lib/nav';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { useAuth } from '@/context/AuthProvider';
import { useUserNotifications } from '@/lib/firebase/useGoalPlaceData';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { storeSelectedAssignmentId } from '@/lib/auth/assignmentSelection';

const ROLE_LABEL: Record<string, string> = {
  fan: 'Fan',
  athlete: 'Athlete',
  team_admin: 'Team Admin',
  league_admin: 'League Admin',
  platform_admin: 'Platform Admin',
  super_admin: 'Super Admin',
  sponsor: 'Sponsor',
};

/**
 * The top bar carries context (which workspace you are in) and account affordances —
 * never primary navigation, which lives in the rail/bottom nav.
 */
export function TopBar({ nav, role }: { nav: RoleNav; role: AppRole | null }) {
  const { currentUser, userProfile } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const { items: notifications } = useUserNotifications(currentUser?.uid ?? userProfile?.uid);
  const { teams, leagues } = useGoalPlaceData({
    collections: role === 'team_admin'
      ? ['teams']
      : role === 'league_admin'
        ? ['leagues']
        : [],
    recordLimit: 250,
  });
  const assignments = role === 'team_admin'
    ? teams.filter((team) => team.adminUserIds?.includes(currentUser?.uid ?? userProfile?.uid ?? ''))
    : role === 'league_admin'
      ? leagues.filter((league) => league.adminUserIds?.includes(currentUser?.uid ?? userProfile?.uid ?? ''))
      : [];
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
    <header className="glass sticky top-0 z-30 flex h-[var(--topbar-h)] items-center justify-between gap-3 border-b border-border px-[var(--gutter)]">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-brand text-on-brand text-sm font-bold shadow-[var(--glow-brand)] md:hidden"
        >
          G
        </span>
        <span className="truncate font-display text-[17px] font-semibold tracking-tight text-text-strong">
          {nav.workspace}
        </span>
        {role ? (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] border border-border bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
            {ROLE_LABEL[role] ?? role}
          </span>
        ) : null}
        {assignments.length > 1 ? (
          <select
            aria-label={role === 'team_admin' ? 'Active team' : 'Active league'}
            defaultValue=""
            onChange={(event) => {
              if (!event.target.value) return;
              storeSelectedAssignmentId(role === 'team_admin' ? 'team' : 'league', event.target.value);
              window.location.reload();
            }}
            className="hidden h-8 max-w-44 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 text-xs text-text sm:block"
          >
            <option value="" disabled>Switch workspace</option>
            {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.name}</option>)}
          </select>
        ) : null}
      </div>

      {role ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text-strong"
          >
            <MagnifyingGlass className="h-5 w-5" />
          </button>
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="relative grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text-strong"
          >
            <Bell className="h-5 w-5" />
            {unreadCount ? <span className="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[var(--state-error)] px-1 text-[9px] font-bold text-white">{Math.min(unreadCount, 99)}</span> : null}
          </Link>
          <Link
            href="/profile"
            aria-label="Profile"
            className="grid h-8 w-8 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-text-strong"
          >
            {role.slice(0, 1).toUpperCase()}
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text-strong"
          >
            <MagnifyingGlass className="h-5 w-5" />
          </button>
          <Link
            href="/login"
            className="inline-flex h-10 items-center gap-2 rounded-sm bg-brand px-3.5 text-sm font-bold text-on-brand transition hover:bg-brand-hover"
          >
            <SignIn className="h-4 w-4" weight="bold" />
            Sign in
          </Link>
        </div>
      )}
    </header>
    <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} role={role} />
    </>
  );
}
