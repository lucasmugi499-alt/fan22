import { describe, expect, it } from 'vitest';
import {
  DEMO_LOGIN_ACCOUNTS,
  findDemoAccount,
  featuredDemoAccounts,
} from './demoAccounts';

describe('demo account authentication', () => {
  it('recognizes every seeded demo account email without owning the password', () => {
    for (const account of DEMO_LOGIN_ACCOUNTS) {
      expect(findDemoAccount(account.email)).toEqual(account);
    }
  });

  it('rejects an unknown account before Firebase Auth is called', () => {
    expect(findDemoAccount('unknown@example.com')).toBeNull();
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
