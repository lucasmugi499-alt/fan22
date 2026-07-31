import { describe, expect, it } from 'vitest';
import {
  DEMO_LOGIN_ACCOUNTS,
  findDemoAccount,
  featuredDemoAccounts,
  profileForDemoAccount,
  workspaceScopeForDemoAccount,
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

  it('builds local mock profiles from the selected seeded account identity', () => {
    const account = featuredDemoAccounts().find((item) => item.role === 'team_admin')!;

    expect(profileForDemoAccount(account)).toMatchObject({
      id: account.uid,
      uid: account.uid,
      email: account.email,
      role: 'team_admin',
      displayName: 'Samuel Nakiwala',
    });
  });

  it('extracts the intended team or league workspace from seeded accounts', () => {
    const accounts = featuredDemoAccounts();
    expect(workspaceScopeForDemoAccount(accounts.find((item) => item.role === 'team_admin')!)).toEqual({
      kind: 'team',
      id: 'team_football_01_01',
    });
    expect(workspaceScopeForDemoAccount(accounts.find((item) => item.role === 'league_admin')!)).toEqual({
      kind: 'league',
      id: 'league_football_kampala',
    });
    expect(workspaceScopeForDemoAccount(accounts.find((item) => item.role === 'fan')!)).toBeNull();
  });
});
