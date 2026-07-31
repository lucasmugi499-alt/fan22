import accounts from '../../../data/investor-demo/demo-accounts.json';
import { MOCK_PROFILES } from './mockAuth';
import type { AppRole, UserProfile } from '@/types';

export type DemoLoginAccount = {
  uid: string;
  email: string;
  role: AppRole;
  workspace: string;
};

const allowedRoles = new Set<AppRole>([
  'fan',
  'athlete',
  'team_admin',
  'league_admin',
  'platform_admin',
]);

export const DEMO_LOGIN_ACCOUNTS = accounts.filter(
  (account): account is DemoLoginAccount => allowedRoles.has(account.role as AppRole),
);

export function findDemoAccount(email: string): DemoLoginAccount | null {
  const normalizedEmail = email.trim().toLowerCase();
  return DEMO_LOGIN_ACCOUNTS.find((account) => account.email.toLowerCase() === normalizedEmail) ?? null;
}

export function featuredDemoAccounts(): DemoLoginAccount[] {
  const order: AppRole[] = ['fan', 'athlete', 'team_admin', 'league_admin', 'platform_admin'];
  return order.flatMap((role) => DEMO_LOGIN_ACCOUNTS.find((account) => account.role === role) ?? []);
}

function displayNameFromEmail(email: string) {
  const local = email.split('@')[0]?.split('.')[0] ?? email;
  return local
    .split('_')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

export function profileForDemoAccount(account: DemoLoginAccount): UserProfile {
  const base = MOCK_PROFILES[account.role];
  const name = displayNameFromEmail(account.email) || base.name;
  return {
    ...base,
    id: account.uid,
    uid: account.uid,
    email: account.email,
    name,
    displayName: name,
    role: account.role,
  };
}

export function workspaceScopeForDemoAccount(account: DemoLoginAccount): { kind: 'team' | 'league'; id: string } | null {
  const url = new URL(account.workspace, 'https://goalplace256.test');
  const teamId = url.searchParams.get('team');
  if (teamId) return { kind: 'team', id: teamId };
  const leagueId = url.searchParams.get('league');
  if (leagueId) return { kind: 'league', id: leagueId };
  return null;
}
