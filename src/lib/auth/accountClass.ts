import type { AccountClass, AppRole, UserProfile } from '@/types';

const accountClasses = new Set<AccountClass>([
  'fan',
  'athlete',
  'organization_operator',
  'platform_operator',
]);

const organizationRoles = new Set<string>([
  'league_owner',
  'league_admin',
  'league_operator',
  'league_verifier',
  'team_owner',
  'team_admin',
  'roster_manager',
  'result_reporter',
  'content_manager',
]);

const platformRoles = new Set<string>([
  'platform_admin',
  'platform_reviewer',
  'platform_support',
  'super_admin',
]);

export function isAccountClass(value: unknown): value is AccountClass {
  return typeof value === 'string' && accountClasses.has(value as AccountClass);
}

export function accountClassForRole(role: string | null | undefined): AccountClass {
  if (role === 'athlete' || role === 'athlete_self' || role === 'athlete_guardian') return 'athlete';
  if (platformRoles.has(String(role ?? ''))) return 'platform_operator';
  if (organizationRoles.has(String(role ?? ''))) return 'organization_operator';
  return 'fan';
}

export function resolveAccountClass(input: {
  accountClass?: unknown;
  role?: string | null;
  profile?: Pick<UserProfile, 'accountClass' | 'role'> | null;
}): AccountClass {
  if (isAccountClass(input.accountClass)) return input.accountClass;
  if (isAccountClass(input.profile?.accountClass)) return input.profile.accountClass;
  return accountClassForRole(input.role ?? input.profile?.role ?? null);
}

export function initialRoleForAccountClass(accountClass: AccountClass): AppRole {
  if (accountClass === 'athlete') return 'athlete';
  if (accountClass === 'organization_operator') return 'team_admin';
  if (accountClass === 'platform_operator') return 'platform_admin';
  return 'fan';
}
