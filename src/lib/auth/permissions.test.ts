import { describe, expect, it } from 'vitest';
import { AppRole } from '@/types';
import { MOCK_PROFILES } from './mockAuth';
import {
  AuthState,
  PUBLIC_DISCOVERY_ROUTES,
  PUBLIC_ROUTES,
  canAccessAdmin,
  canAccessRoute,
  canAccessSponsorDashboard,
  canAccessSuperAdmin,
  canCreateFixture,
  canRegisterAsRole,
  canSupport,
  canVerifyFinalResult,
  canVerifyMatch,
  getDefaultRouteForRole,
  getPostSignInRoute,
  isLoggedIn,
} from './permissions';

const ALL_ROLES: AppRole[] = [
  'fan',
  'athlete',
  'team_admin',
  'league_admin',
  'sponsor',
  'platform_admin',
  'super_admin',
];

function authAs(role: AppRole): AuthState {
  return { authStatus: 'logged_in', userProfile: MOCK_PROFILES[role], role };
}

const LOGGED_OUT: AuthState = { authStatus: 'logged_out', userProfile: null, role: null };
const LOADING: AuthState = { authStatus: 'loading', userProfile: null, role: null };

/** Roles expected to pass, keyed by the capability under test. Everything else must fail. */
const CAPABILITY_MATRIX: [string, (auth: AuthState) => boolean, AppRole[]][] = [
  ['canAccessAdmin', canAccessAdmin, ['platform_admin', 'super_admin']],
  ['canAccessSuperAdmin', canAccessSuperAdmin, ['super_admin']],
  ['canVerifyMatch', canVerifyMatch, ['league_admin', 'platform_admin', 'super_admin']],
  ['canVerifyFinalResult', canVerifyFinalResult, ['league_admin', 'platform_admin', 'super_admin']],
  ['canCreateFixture', canCreateFixture, ['league_admin', 'platform_admin', 'super_admin']],
  // Deliberate: the `sponsor` role does NOT reach the sponsor dashboard. It is an internal
  // platform reporting surface, not a customer-facing one (see BUTTON_AUDIT.md).
  ['canAccessSponsorDashboard', canAccessSponsorDashboard, ['platform_admin', 'super_admin']],
];

describe('login state', () => {
  it('treats loading and logged-out as not authenticated', () => {
    expect(isLoggedIn(LOADING)).toBe(false);
    expect(isLoggedIn(LOGGED_OUT)).toBe(false);
  });

  it('requires a profile, not just a status', () => {
    expect(isLoggedIn({ authStatus: 'logged_in', userProfile: null, role: 'fan' })).toBe(false);
  });

  it.each(ALL_ROLES)('recognises %s as logged in', (role) => {
    expect(isLoggedIn(authAs(role))).toBe(true);
  });
});

describe('capability matrix', () => {
  for (const [name, capability, allowed] of CAPABILITY_MATRIX) {
    describe(name, () => {
      it.each(ALL_ROLES)('%s', (role) => {
        expect(capability(authAs(role))).toBe(allowed.includes(role));
      });

      it('denies logged-out visitors', () => {
        expect(capability(LOGGED_OUT)).toBe(false);
      });
    });
  }
});

describe('canSupport', () => {
  it('allows any authenticated user but no one else', () => {
    for (const role of ALL_ROLES) expect(canSupport(authAs(role))).toBe(true);
    expect(canSupport(LOGGED_OUT)).toBe(false);
    expect(canSupport(LOADING)).toBe(false);
  });
});

describe('canRegisterAsRole', () => {
  it('only allows self-service signup for fans', () => {
    expect(canRegisterAsRole('fan')).toBe(true);
  });

  it('keeps privileged roles invite-only', () => {
    expect(canRegisterAsRole('athlete')).toBe(false);
    expect(canRegisterAsRole('league_admin')).toBe(false);
    expect(canRegisterAsRole('team_admin')).toBe(false);
    expect(canRegisterAsRole('platform_admin')).toBe(false);
    expect(canRegisterAsRole('super_admin')).toBe(false);
  });
});

describe('canAccessRoute', () => {
  it.each(PUBLIC_ROUTES)('serves %s to logged-out visitors', (route) => {
    expect(canAccessRoute(LOGGED_OUT, route)).toBe(true);
  });

  it.each(PUBLIC_DISCOVERY_ROUTES)('serves %s and its detail pages to logged-out visitors', (route) => {
    expect(canAccessRoute(LOGGED_OUT, route)).toBe(true);
    expect(canAccessRoute(LOGGED_OUT, `${route}/demo-id`)).toBe(true);
  });

  it('denies every protected route to logged-out visitors', () => {
    for (const route of ['/home', '/feed', '/wallet', '/admin', '/league-admin', '/team-admin']) {
      expect(canAccessRoute(LOGGED_OUT, route)).toBe(false);
    }
  });

  const WORKSPACE_ACCESS: [string, AppRole[]][] = [
    ['/admin', ['platform_admin', 'super_admin']],
    ['/league-admin', ['league_admin', 'platform_admin', 'super_admin']],
    ['/team-admin', ['team_admin', 'league_admin', 'platform_admin', 'super_admin']],
    ['/athlete-dashboard', ['athlete', 'platform_admin', 'super_admin']],
    ['/wallet', ['fan', 'athlete', 'platform_admin', 'super_admin']],
  ];

  for (const [route, allowed] of WORKSPACE_ACCESS) {
    it(`gates ${route} to ${allowed.join(', ')}`, () => {
      for (const role of ALL_ROLES) {
        expect(canAccessRoute(authAs(role), route)).toBe(allowed.includes(role));
      }
    });
  }

  it('gates nested workspace paths the same as their root', () => {
    expect(canAccessRoute(authAs('fan'), '/admin/anything')).toBe(false);
    expect(canAccessRoute(authAs('platform_admin'), '/admin/anything')).toBe(true);
  });

  it('lets any authenticated role reach shared surfaces', () => {
    for (const role of ALL_ROLES) {
      expect(canAccessRoute(authAs(role), '/feed')).toBe(true);
      expect(canAccessRoute(authAs(role), '/matches')).toBe(true);
    }
  });
});

describe('getDefaultRouteForRole', () => {
  it.each(ALL_ROLES)('sends %s somewhere it is allowed to go', (role) => {
    const destination = getDefaultRouteForRole(role);
    expect(canAccessRoute(authAs(role), destination)).toBe(true);
  });

  it('sends anonymous visitors to the landing page', () => {
    expect(getDefaultRouteForRole(null)).toBe('/');
  });
});

describe('getPostSignInRoute', () => {
  it('returns a safe invitation route after authentication', () => {
    expect(getPostSignInRoute('fan', '/invitations/team/invite_1?token=abc')).toBe(
      '/invitations/team/invite_1?token=abc',
    );
  });

  it('uses the role home when no safe local path was requested', () => {
    expect(getPostSignInRoute('fan', 'https://example.com')).toBe('/home');
    expect(getPostSignInRoute('league_admin', '//example.com')).toBe('/league-admin');
    expect(getPostSignInRoute('team_admin', '/login')).toBe('/team-admin');
  });
});
