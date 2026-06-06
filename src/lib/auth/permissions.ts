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
  // Real implementation would check if teamId is in auth.userProfile.assignedTeams
  // For now, any team_admin, platform_admin, super_admin can
  return hasAnyRole(auth, ['team_admin', 'platform_admin', 'super_admin']);
}

export function canManageLeague(auth: AuthState, _leagueId?: string): boolean {
  void _leagueId;
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
}

// Verifications
export function canVerifyMatch(auth: AuthState): boolean {
  return hasAnyRole(auth, ['league_admin', 'platform_admin', 'super_admin']);
}

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
