import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { navForRole } from './nav';

/**
 * The platform console is only as good as its front doors.
 *
 * League and Team management existed as detail routes with no index, so the two most
 * common operational objects were reachable only by drilling through Organizations. A nav
 * entry pointing at a route that does not exist is the same failure wearing a link.
 */
function routeExists(href: string) {
  const segments = href.replace(/^\//, '').split('/');
  const dir = path.join('src', 'app', ...segments);
  return existsSync(path.join(dir, 'page.tsx')) || existsSync(`${dir}.tsx`);
}

describe('platform admin navigation', () => {
  const nav = navForRole('platform_admin');
  const destinations = [...nav.primary, ...nav.more];

  it('gives every destination a real page', () => {
    const broken = destinations
      .filter((destination) => destination.href.startsWith('/admin'))
      .filter((destination) => !routeExists(destination.href))
      .map((destination) => `${destination.name} -> ${destination.href}`);

    expect(broken).toEqual([]);
  });

  it('exposes exactly the five operator destinations on desktop and mobile', () => {
    expect(nav.primary.map(({ name, href }) => ({ name, href }))).toEqual([
      { name: 'Desk', href: '/admin' },
      { name: 'Network', href: '/admin/network' },
      { name: 'Integrity', href: '/admin/integrity' },
      { name: 'Money', href: '/admin/money' },
      { name: 'Platform', href: '/admin/platform' },
    ]);
    expect(nav.more).toEqual([]);
  });
});
