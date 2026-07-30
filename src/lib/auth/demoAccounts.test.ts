import { describe, expect, it } from 'vitest';
import {
  authenticateDemoAccount,
  DEMO_ACCOUNT_PASSWORD,
  DEMO_LOGIN_ACCOUNTS,
  featuredDemoAccounts,
} from './demoAccounts';

describe('demo account authentication', () => {
  it('accepts every seeded account with the shared staging password', () => {
    for (const account of DEMO_LOGIN_ACCOUNTS) {
      expect(authenticateDemoAccount(account.email, DEMO_ACCOUNT_PASSWORD)).toEqual(account);
    }
  });

  it('rejects an unknown account or incorrect password', () => {
    expect(authenticateDemoAccount('unknown@example.com', DEMO_ACCOUNT_PASSWORD)).toBeNull();
    expect(authenticateDemoAccount(DEMO_LOGIN_ACCOUNTS[0].email, 'wrong password')).toBeNull();
  });

  it('provides one quick account for every seeded demo role', () => {
    expect(featuredDemoAccounts().map((account) => account.role)).toEqual([
      'fan',
      'athlete',
      'team_admin',
      'league_admin',
      'platform_admin',
    ]);
  });
});
