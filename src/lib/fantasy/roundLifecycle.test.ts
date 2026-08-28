import { describe, expect, it } from 'vitest';
import {
  buildCorrectionNotice,
  fixtureLifecycle,
  roundLifecycle,
  type FantasyFixtureLifecycle,
} from './roundLifecycle';

const round = { deadlineAt: '2026-08-03T12:00:00.000Z', matchIds: ['match_1', 'match_2'] };
const BEFORE_DEADLINE = '2026-08-03T09:00:00.000Z';
const AFTER_DEADLINE = '2026-08-03T15:00:00.000Z';

function fixture(matchId: string, state: FantasyFixtureLifecycle['state']): FantasyFixtureLifecycle {
  return { matchId, state, label: state };
}

describe('fixture lifecycle', () => {
  it('reports an official fixture only when it is verified and versioned', () => {
    expect(fixtureLifecycle({
      matchId: 'match_1',
      status: 'completed',
      verificationStatus: 'verified',
      officialResultVersion: 1,
    }).state).toBe('official');
  });

  it('reports a finished but unverified fixture as awaiting official, not official', () => {
    expect(fixtureLifecycle({ matchId: 'match_1', status: 'completed' }).state)
      .toBe('awaiting_official');
    expect(fixtureLifecycle({
      matchId: 'match_1',
      status: 'completed',
      verificationStatus: 'verified',
      officialResultVersion: 0,
    }).state).toBe('awaiting_official');
  });

  it('lets a void outrank an otherwise official fixture, and carries the reason verbatim', () => {
    const result = fixtureLifecycle({
      matchId: 'match_1',
      status: 'completed',
      verificationStatus: 'verified',
      officialResultVersion: 2,
      voidReason: 'Six events never arrived.',
    });
    expect(result.state).toBe('voided');
    expect(result.voidReason).toBe('Six events never arrived.');
  });

  it('reports a live fixture as live', () => {
    expect(fixtureLifecycle({ matchId: 'match_1', status: 'live' }).state).toBe('live');
  });
});

describe('round lifecycle', () => {
  it('is open before the deadline', () => {
    const lifecycle = roundLifecycle({ round, fixtures: [], now: BEFORE_DEADLINE });
    expect(lifecycle.phase).toBe('open');
    expect(lifecycle.provisional).toBe(true);
  });

  it('is locked once the deadline passes and nothing has started', () => {
    const lifecycle = roundLifecycle({
      round,
      fixtures: [fixture('match_1', 'scheduled'), fixture('match_2', 'scheduled')],
      now: AFTER_DEADLINE,
    });
    expect(lifecycle.phase).toBe('locked');
  });

  it('is live, and provisional, while any fixture is in progress', () => {
    const lifecycle = roundLifecycle({
      round,
      fixtures: [fixture('match_1', 'live'), fixture('match_2', 'scheduled')],
      now: AFTER_DEADLINE,
    });
    expect(lifecycle.phase).toBe('live');
    expect(lifecycle.provisional).toBe(true);
    expect(lifecycle.description).toContain('not final');
  });

  it('is settling while some fixtures are official and others are not', () => {
    const lifecycle = roundLifecycle({
      round,
      fixtures: [fixture('match_1', 'official'), fixture('match_2', 'awaiting_official')],
      now: AFTER_DEADLINE,
    });
    expect(lifecycle.phase).toBe('settling');
    expect(lifecycle.provisional).toBe(true);
    expect(lifecycle.description).toContain('1 of 2');
  });

  it('settles once every fixture is official or voided, counting a void as resolved', () => {
    const lifecycle = roundLifecycle({
      round,
      fixtures: [fixture('match_1', 'official'), fixture('match_2', 'voided')],
      now: AFTER_DEADLINE,
    });
    expect(lifecycle.phase).toBe('settled');
    expect(lifecycle.provisional).toBe(false);
    expect(lifecycle.fixturesScored).toBe(2);
  });

  it('becomes adjusted when a correction arrives after settlement', () => {
    const lifecycle = roundLifecycle({
      round,
      fixtures: [fixture('match_1', 'official'), fixture('match_2', 'official')],
      corrections: [{ createdAt: '2026-08-05T11:02:00.000Z' }],
      now: AFTER_DEADLINE,
    });
    expect(lifecycle.phase).toBe('adjusted');
    expect(lifecycle.provisional).toBe(false);
  });

  it('never calls a round settled while a fixture is still awaiting its official result', () => {
    const lifecycle = roundLifecycle({
      round,
      fixtures: [fixture('match_1', 'official'), fixture('match_2', 'awaiting_official')],
      corrections: [{ createdAt: '2026-08-05T11:02:00.000Z' }],
      now: AFTER_DEADLINE,
    });
    expect(lifecycle.phase).not.toBe('settled');
    expect(lifecycle.phase).not.toBe('adjusted');
  });
});

describe('correction notice', () => {
  const correction = {
    matchId: 'match_1',
    oldTotals: { team_1: 61, team_2: 40 },
    newTotals: { team_1: 55, team_2: 40 },
    affectedFantasyTeamIds: ['team_1'],
    reason: 'Kampala United 2-1 City Stars was corrected to 2-2 after a league review.',
  };

  it('states the old number, the new number, and who else it hit', () => {
    const notice = buildCorrectionNotice({
      correction: { ...correction, affectedFantasyTeamIds: Array.from({ length: 214 }, (_, i) => `team_${i}`) },
      fantasyTeamId: 'team_1',
      matchLabel: 'Kampala United 2-1 City Stars',
    });
    expect(notice).not.toBeNull();
    expect(notice!.headline).toBe('Your round changed from 61 to 55 points.');
    expect(notice!.detail).toContain('This affected 214 managers.');
    expect(notice!.delta).toBe(-6);
  });

  it('includes the rank move when both ranks are known', () => {
    const notice = buildCorrectionNotice({
      correction,
      fantasyTeamId: 'team_1',
      rankBefore: 96,
      rankAfter: 121,
    });
    expect(notice!.detail).toContain('from 96th to 121st');
  });

  it('says nothing to a manager whose total did not move', () => {
    expect(buildCorrectionNotice({ correction, fantasyTeamId: 'team_2' })).toBeNull();
  });

  it('says nothing to a manager who was not in the correction at all', () => {
    expect(buildCorrectionNotice({ correction, fantasyTeamId: 'team_absent' })).toBeNull();
  });
});
