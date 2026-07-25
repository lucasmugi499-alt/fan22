import type { NavDestination } from '@/lib/nav';

/**
 * The active destination is the one whose href is the *longest* prefix of the current path,
 * so `/team-admin/roster` highlights "Roster" and not the shorter "/team-admin" home.
 */
export function activeHref(pathname: string, destinations: NavDestination[]): string | null {
  let best: string | null = null;
  for (const { href } of destinations) {
    const base = href.split('?')[0];
    if (pathname === base || pathname.startsWith(base + '/')) {
      if (!best || base.length > best.length) best = base;
    }
  }
  return best;
}
