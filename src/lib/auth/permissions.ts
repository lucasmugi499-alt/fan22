import { AppRole, UserProfile } from '@/types';

export type AuthStatus = 'loading' | 'logged_out' | 'logged_in';

export interface AuthState {
  authStatus: AuthStatus;
  userProfile: UserProfile | null;
  role: AppRole | null;
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
  return hasAnyRole(auth, ['athlete', 'team_admin', 'league_admin', 'sponsor', 'platform_admin', 'super_admin']);
}

export function canCreateFanPost(auth: AuthState): boolean {
  return isLoggedIn(auth); // All users can create fan posts
}

// Admin / Management
export function canManageTeam(auth: AuthState, _teamId?: string): boolean {
  void _teamId;
  return hasAnyRole(auth, ['team_admin', 'league_admin', 'platform_admin', 'super_admin']);
}

export function canAccessTeamAdminDashboard(auth: AuthState): boolean {
  return hasAnyRole(auth, ['team_admin', 'league_admin', 'platform_admin', 'super_admin']);
}

export function canSubmitResult(auth: AuthState, _teamId?: string): boolean {
  void _teamId;
  return hasAnyRole(auth, ['team_admin', 'league_admin', 'platform_admin', 'super_admin']);
}

export function canRequestAthleteVerification(auth: AuthState, _athleteId?: string): boolean {
  void _athleteId;
  return hasAnyRole(auth, ['team_admin', 'league_admin', 'platform_admin', 'super_admin']);
}

export function canVerifyFinalResult(auth: AuthState): boolean {
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
}

export function canApproveTeamSubmission(auth: AuthState): boolean {
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
}

export function canManageLeague(auth: AuthState, _leagueId?: string): boolean {
  void _leagueId;
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
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
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
}

export function canRegisterAsRole(role: AppRole): boolean {
  return ['fan', 'athlete', 'league_admin'].includes(role);
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

export const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/how-it-works',
  '/sponsors',
  '/pilot',
  '/login',
  '/register'
];

export function canAccessRoute(auth: AuthState, pathname: string): boolean {
  // Public routes check
  if (PUBLIC_ROUTES.includes(pathname) || pathname === '/') {
    return true;
  }

  if (!isLoggedIn(auth) || !auth.role) return false;

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
  if (pathname.startsWith('/sponsor-dashboard')) {
    return hasAnyRole(auth, ['platform_admin', 'super_admin']);
  }

  // All other protected routes like /home, /feed, /profile, /settings, /sports, /matches, /athletes, /teams, /leagues, /awards, /notifications are accessible to any logged in user
  return true;
}

export function routeForAppRole(role: AppRole): string {
  return getDefaultRouteForRole(role);
}
