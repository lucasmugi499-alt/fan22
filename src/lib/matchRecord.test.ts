import { describe, expect, it } from 'vitest';
import type { Match } from '@/types';
import { adaptMatch } from './matchRecord';
import { isOfficialMatch } from './status';
import { buildLeagueStandings } from './leagueModel';

/**
 * Regression cover for the defect that made ten leagues show an empty table while their
 * teams displayed stored points.
 *
 * The fixture is the real shape of `match_007` in the demo database: a played, verified
 * result that carries `score.{home,away}` and overloads `status` with the verification
 * outcome. Read raw, it satisfies neither `isOfficialMatch` nor the standings score check.
 */
const legacyShaped = {
  id: 'match_007',
  leagueId: 'league_002',
  homeTeamId: 'team_007',
  awayTeamId: 'team_008',
  sport: 'football',
  status: 'verified',
  verificationStatus: 'verified',
  score: { home: 2, away: 5 },
  scheduledAt: '2026-06-12T20:03:00.000Z',
} as unknown as Match;

describe('adaptMatch', () => {
  it('the raw record is invisible to the official-result gate', () => {
    // Documents the bug rather than the fix: this is what the server used to return.
    expect(isOfficialMatch(legacyShaped)).toBe(false);
    expect(typeof legacyShaped.teamAScore).toBe('undefined');
  });

  it('maps the overloaded status back to a lifecycle plus a verification outcome', () => {
    const adapted = adaptMatch(legacyShaped);
    expect(adapted.status).toBe('completed');
    expect(adapted.verificationStatus).toBe('verified');
    expect(isOfficialMatch(adapted)).toBe(true);
  });

  it('fills teamAScore/teamBScore from score, which standings require', () => {
    const adapted = adaptMatch(legacyShaped);
    expect(adapted.teamAScore).toBe(2);
    expect(adapted.teamBScore).toBe(5);
  });

  it('does not invent a verification outcome for an unverified record', () => {
    const pending = { ...legacyShaped, status: 'scheduled', verificationStatus: 'pending' } as Match;
    const adapted = adaptMatch(pending);
    expect(isOfficialMatch(adapted)).toBe(false);
  });

  it('preserves a disputed outcome instead of collapsing it into completed', () => {
    // The whole point of normalizeMatchVerification: flattening the lifecycle field must
    // not upgrade a disputed result into an official one.
    const disputed = { ...legacyShaped, status: 'disputed', verificationStatus: undefined } as unknown as Match;
    const adapted = adaptMatch(disputed);
    expect(adapted.status).toBe('completed');
    expect(adapted.verificationStatus).toBe('disputed');
    expect(isOfficialMatch(adapted)).toBe(false);
  });

  it('leaves an already-current record unchanged', () => {
    const current = {
      ...legacyShaped,
      status: 'completed',
      teamAScore: 2,
      teamBScore: 5,
    } as Match;
    const adapted = adaptMatch(current);
    expect(adapted.status).toBe('completed');
    expect(adapted.teamAScore).toBe(2);
    expect(isOfficialMatch(adapted)).toBe(true);
  });
});

describe('standings from a legacy-shaped result', () => {
  const teams = [
    { id: 'team_007', name: 'Fort Portal City', leagueId: 'league_002' },
    { id: 'team_008', name: 'Fort Portal Lions', leagueId: 'league_002' },
  ] as never;

  it('scores nothing when the record is not adapted — the reported bug', () => {
    const rows = buildLeagueStandings(teams, [legacyShaped]);
    expect(rows.every((row) => row.points === 0 && row.played === 0)).toBe(true);
  });

  it('awards the away win once the record is adapted', () => {
    const rows = buildLeagueStandings(teams, [adaptMatch(legacyShaped)]);
    const lions = rows.find((row) => row.teamId === 'team_008');
    const city = rows.find((row) => row.teamId === 'team_007');
    expect(lions?.points).toBe(3);
    expect(lions?.played).toBe(1);
    expect(city?.points).toBe(0);
    expect(city?.losses).toBe(1);
  });
});
