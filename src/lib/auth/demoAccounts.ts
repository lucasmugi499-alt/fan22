import accounts from '../../../data/investor-demo/demo-accounts.json';
import type { AppRole } from '@/types';

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
