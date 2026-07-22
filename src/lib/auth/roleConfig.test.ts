import { describe, expect, it } from 'vitest';
import { AppRole } from '@/types';
import { ROLE_CONFIGS } from './roleConfig';
import { MOCK_PROFILES } from './mockAuth';
import { AuthState, canAccessRoute } from './permissions';

/**
 * Route access is declared twice: `ROLE_CONFIGS[role].allowedRoutes` drives what the UI
 * offers, and `canAccessRoute` decides what the guards permit. Nothing keeps them in step,
 * so these tests pin the agreement — a role that is shown a link it cannot follow (or is
 * navigated somewhere it cannot render) should fail here rather than in someone's face.
 */

const configuredRoles = Object.keys(ROLE_CONFIGS) as AppRole[];

function authAs(role: AppRole): AuthState {
  return { authStatus: 'logged_in', userProfile: MOCK_PROFILES[role], role };
}

describe('ROLE_CONFIGS agrees with canAccessRoute', () => {
  for (const role of configuredRoles) {
    const config = ROLE_CONFIGS[role];

    it(`${role}: every allowedRoute is actually reachable`, () => {
      for (const route of config.allowedRoutes) {
        expect(
          canAccessRoute(authAs(role), route),
          `${role} lists ${route} in allowedRoutes but canAccessRoute denies it`
        ).toBe(true);
      }
    });

    it(`${role}: every nav link points somewhere the role can reach`, () => {
      for (const item of config.navItems) {
        const path = item.href.split('?')[0];
        expect(
          canAccessRoute(authAs(role), path),
          `${role} nav offers "${item.name}" -> ${item.href}, which canAccessRoute denies`
        ).toBe(true);
      }
    });

    it(`${role}: nav links stay inside allowedRoutes`, () => {
      for (const item of config.navItems) {
        const path = item.href.split('?')[0];
        expect(
          config.allowedRoutes,
          `${role} nav offers "${item.name}" -> ${path}, missing from its own allowedRoutes`
        ).toContain(path);
      }
    });

    it(`${role}: defaultRoute is reachable and declared`, () => {
      expect(canAccessRoute(authAs(role), config.defaultRoute)).toBe(true);
      expect(config.allowedRoutes).toContain(config.defaultRoute);
    });
  }
});

describe('role workspaces stay separated', () => {
  const PRIVILEGED: [string, AppRole[]][] = [
    ['/admin', ['platform_admin']],
    ['/league-admin', ['league_admin', 'platform_admin']],
    ['/team-admin', ['team_admin', 'league_admin', 'platform_admin']],
    ['/athlete-dashboard', ['athlete', 'platform_admin']],
  ];

  for (const [route, permitted] of PRIVILEGED) {
    it(`${route} is absent from the nav of every role that cannot use it`, () => {
      for (const role of configuredRoles) {
        if (permitted.includes(role)) continue;
        const offending = ROLE_CONFIGS[role].navItems.filter((item) => item.href.startsWith(route));
        expect(offending.map((item) => item.name), `${role} nav exposes ${route}`).toEqual([]);
      }
    });
  }
});
