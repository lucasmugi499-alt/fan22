import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_GROUP_ORDER, navForRole } from './nav';

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

  it('surfaces League and Team management as first-class primary destinations', () => {
    // The audit finding: both were buried under Organizations.
    const primaryHrefs = nav.primary.map((destination) => destination.href);
    expect(primaryHrefs).toContain('/admin/leagues');
    expect(primaryHrefs).toContain('/admin/teams');
  });

  it('exposes all six workspaces', () => {
    // Named for the work rather than for the system boundary: what needs me now, who is in
    // the network, is the competition sound, what does the public see, where is the money,
    // and who did what. Every one must actually carry destinations — a workspace declared in
    // NAV_GROUP_ORDER but holding nothing renders as an empty heading.
    const groups = new Set(destinations.map((destination) => destination.group));
    for (const workspace of NAV_GROUP_ORDER) {
      expect(groups, `${workspace} has no destinations`).toContain(workspace);
    }
    expect(NAV_GROUP_ORDER).toHaveLength(6);
  });

  it('gives athlete management a front door', () => {
    // Athletes are managed profiles now, so the console owns those records and needs an
    // index for them exactly as it does for the leagues and teams that hold them.
    expect(destinations.map((destination) => destination.href)).toContain('/admin/athletes');
  });

  it('only uses groups the rail knows how to render', () => {
    // The rail renders NAV_GROUP_ORDER. A destination in any other group is invisible.
    const unknown = destinations
      .filter((destination) => destination.group)
      .filter((destination) => !NAV_GROUP_ORDER.includes(destination.group!))
      .map((destination) => `${destination.name} -> ${destination.group}`);

    expect(unknown).toEqual([]);
  });

  it('routes the control plane somewhere that reports rather than switches', () => {
    const controlPlane = destinations.find((destination) => destination.href === '/admin/control-plane');
    expect(controlPlane).toBeDefined();
  });
});
