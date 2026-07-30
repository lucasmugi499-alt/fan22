import { AppRole, UserProfile } from '@/types';
import type { AccessContext } from './access';
import {
  canInviteTeamAdminInScope,
  canCreateAthleteInScope,
  canManageAthleteInScope,
  canManageLeagueInScope,
  canManageTeamInScope,
  canSubmitResultInScope,
} from './access';

export type AuthStatus = 'loading' | 'logged_out' | 'logged_in';

export interface AuthState {
  authStatus: AuthStatus;
  userProfile: UserProfile | null;
  role: AppRole | null;
  accessContext?: AccessContext;
}

export function isLoggedIn(auth: AuthState): boolean {
  return auth.authStatus === 'logged_in' && auth.userProfile !== null;
}

export function hasRole(auth: AuthState, role: AppRole): boolean {
  return isLoggedIn(auth) && auth.role === role;
}

export function hasAnyRole(auth: AuthState, roles: AppRole[]): boolean {
  return isLoggedIn(auth) && auth.role !== null && roles.includes(auth.role);
}

// Interactions
export function canSupport(auth: AuthState): boolean {
  return isLoggedIn(auth); // Only logged in fans/users can support (technically admins/athletes can too as fans)
}

export const canSupportAthlete = canSupport;

export function canPledge(auth: AuthState): boolean {
  return isLoggedIn(auth);
}

export function canComment(auth: AuthState): boolean {
  return isLoggedIn(auth);
}

export function canSave(auth: AuthState): boolean {
  return isLoggedIn(auth);
}

export function canFollow(auth: AuthState): boolean {
  return isLoggedIn(auth);
}

// Posts
export function canCreateOfficialPost(auth: AuthState): boolean {
  return hasAnyRole(auth, ['athlete', 'team_admin', 'league_admin', 'platform_admin', 'super_admin']);
}

export function canCreateFanPost(auth: AuthState): boolean {
  return isLoggedIn(auth); // All users can create fan posts
}

// Admin / Management
export function canManageTeam(auth: AuthState, teamId?: string): boolean {
  if (teamId) return canManageTeamInScope(auth.accessContext, teamId);
  return hasAnyRole(auth, ['team_admin', 'league_admin', 'platform_admin', 'super_admin']);
}

export function canAccessTeamAdminDashboard(auth: AuthState): boolean {
  return hasAnyRole(auth, ['team_admin', 'league_admin', 'platform_admin', 'super_admin']);
}

export function canSubmitResult(auth: AuthState, teamId?: string, matchId = 'unknown_match'): boolean {
  if (teamId) return canSubmitResultInScope(auth.accessContext, matchId, teamId);
  return hasAnyRole(auth, ['team_admin', 'league_admin', 'platform_admin', 'super_admin']);
}

export function canRequestAthleteVerification(auth: AuthState, athleteId?: string): boolean {
  if (athleteId) return canManageAthleteInScope(auth.accessContext, athleteId);
  return hasAnyRole(auth, ['team_admin', 'league_admin', 'platform_admin', 'super_admin']);
}

export function canVerifyFinalResult(auth: AuthState): boolean {
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
}

export function canApproveTeamSubmission(auth: AuthState): boolean {
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
}

export function canManageLeague(auth: AuthState, leagueId?: string): boolean {
  if (leagueId) return canManageLeagueInScope(auth.accessContext, leagueId);
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
}

export function canInviteTeamAdmin(auth: AuthState, teamId: string): boolean {
  return canInviteTeamAdminInScope(auth.accessContext, teamId);
}

export function canCreateAthlete(auth: AuthState, teamId: string): boolean {
  return canCreateAthleteInScope(auth.accessContext, teamId);
}

export function canViewLeagueAdminDashboard(auth: AuthState): boolean {
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
}

export function canViewPlatformAdminDashboard(auth: AuthState): boolean {
  return hasAnyRole(auth, ['platform_admin', 'super_admin']);
}

export function canAccessSponsorDashboard(auth: AuthState): boolean {
  return hasAnyRole(auth, ['platform_admin', 'super_admin']);
}

export function canCreateFixture(auth: AuthState): boolean {
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
}

export function canCreateChallenge(auth: AuthState): boolean {
  return hasAnyRole(auth, ['athlete', 'league_admin', 'platform_admin', 'super_admin']);
}

export function canRegisterAsRole(role: AppRole): boolean {
  return role === 'fan';
}

// Verifications
export function canVerifyMatch(auth: AuthState): boolean {
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
}

export const canVerifyResult = canVerifyMatch;

export function canVerifyChallenge(auth: AuthState): boolean {
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
}

// Platform Admin
export function canReviewPayout(auth: AuthState): boolean {
  return hasAnyRole(auth, ['platform_admin', 'super_admin']);
}

export function canModerateFeed(auth: AuthState): boolean {
  return hasAnyRole(auth, ['platform_admin', 'super_admin']);
}

export function canAccessAdmin(auth: AuthState): boolean {
  return hasAnyRole(auth, ['platform_admin', 'super_admin']);
}

export function canAccessSuperAdmin(auth: AuthState): boolean {
  return hasRole(auth, 'super_admin');
}

export function getDefaultRouteForRole(role: AppRole | null): string {
  switch (role) {
    case 'fan':
      return '/home';
    case 'athlete':
      return '/athlete-dashboard';
    case 'team_admin':
      return '/team-admin';
    case 'league_admin':
      return '/league-admin';
    case 'platform_admin':
    case 'super_admin':
      return '/admin';
    case 'sponsor':
      return '/sponsors';
    default:
      return '/';
  }
}

export function getPostSignInRoute(role: AppRole | null, requestedPath?: string | null): string {
  if (
    requestedPath
    && requestedPath.startsWith('/')
    && !requestedPath.startsWith('//')
    && !requestedPath.startsWith('/login')
    && !requestedPath.startsWith('/register')
  ) {
    return requestedPath;
  }
  return getDefaultRouteForRole(role);
}

export const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/how-it-works',
  '/verification',
  '/sponsors',
  '/pilot',
  '/login',
  '/register',
  '/terms',
  '/privacy',
  '/apply/league-admin',
];

export const PUBLIC_DISCOVERY_ROUTES = [
  '/leagues',
  '/teams',
  '/athletes',
  '/matches',
  '/discover',
  '/map',
  '/support',
];

export function isPublicDiscoveryRoute(pathname: string): boolean {
  return PUBLIC_DISCOVERY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isMarketingRoute(pathname: string): boolean {
  return (
    PUBLIC_ROUTES.includes(pathname)
    || pathname.startsWith('/invitations/team/')
    || pathname.startsWith('/invitations/access/')
  );
}

export type RoutePresentation = 'marketing' | 'public_discovery' | 'app';

export function getRoutePresentation(
  pathname: string,
  authStatus: AuthStatus,
): RoutePresentation {
  if (isMarketingRoute(pathname)) return 'marketing';
  if (isPublicDiscoveryRoute(pathname) && authStatus !== 'logged_in') {
    return 'public_discovery';
  }
  return 'app';
}

export function isPublicRoute(pathname: string): boolean {
  return isMarketingRoute(pathname) || isPublicDiscoveryRoute(pathname);
}

export function canAccessRoute(auth: AuthState, pathname: string): boolean {
  if (isPublicRoute(pathname)) {
    return true;
  }

  if (!isLoggedIn(auth) || !auth.role) return false;

  if (pathname.startsWith('/fantasy')) {
    return hasRole(auth, 'fan');
  }
  if (pathname.startsWith('/athlete-dashboard')) {
    return hasAnyRole(auth, ['athlete', 'platform_admin', 'super_admin']);
  }
  if (pathname.startsWith('/league-admin')) {
    return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
  }
  if (pathname.startsWith('/admin')) {
    return hasAnyRole(auth, ['platform_admin', 'super_admin']);
  }
  if (pathname.startsWith('/wallet')) {
    return hasAnyRole(auth, ['fan', 'athlete', 'platform_admin', 'super_admin']);
  }

  if (pathname.startsWith('/team-admin')) {
    return hasAnyRole(auth, ['team_admin', 'league_admin', 'platform_admin', 'super_admin']);
  }
  // All other shared surfaces are accessible to any logged-in user.
  return true;
}
