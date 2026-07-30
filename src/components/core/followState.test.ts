import { describe, expect, it } from 'vitest';
import { followProfileField, nextFollowIds } from './followState';

describe('follow state helpers', () => {
  it('maps follow target types to profile fields', () => {
    expect(followProfileField('athlete')).toBe('followedAthletes');
    expect(followProfileField('team')).toBe('followedTeams');
    expect(followProfileField('league')).toBe('followedLeagues');
  });

  it('adds a followed entity without duplicating it', () => {
    const profile = {
      followedAthletes: [],
      followedTeams: [],
      followedLeagues: ['league_a'],
    };

    expect(nextFollowIds(profile, 'followedLeagues', 'league_a', true)).toEqual(['league_a']);
    expect(nextFollowIds(profile, 'followedLeagues', 'league_b', true)).toEqual(['league_a', 'league_b']);
  });

  it('removes an unfollowed entity', () => {
    const profile = {
      followedAthletes: [],
      followedTeams: ['team_a', 'team_b'],
      followedLeagues: [],
    };

    expect(nextFollowIds(profile, 'followedTeams', 'team_a', false)).toEqual(['team_b']);
  });
});
