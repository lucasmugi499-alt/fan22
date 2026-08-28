import { describe, expect, it } from 'vitest';
import {
  buildLeagueCommand,
  capturePolicyCopy,
  fieldManagerPresence,
  matchOperationalRow,
  segmentFor,
  segmentMatches,
} from './operations';
import type { Match, Team } from '@/types';

const NOW = '2026-08-28T15:00:00.000Z';

const teams = [
  { id: 'team_home', name: 'Kampala United' },
  { id: 'team_away', name: 'City Stars' },
] as unknown as Team[];

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match_1',
    leagueId: 'league_1',
    seasonId: 'season_1',
    sport: 'football',
    homeTeamId: 'team_home',
    awayTeamId: 'team_away',
    venue: 'Nakivubo Stadium',
    scheduledAt: NOW,
    status: 'scheduled',
    verificationStatus: 'pending',
    score: { home: null, away: null },
    ...overrides,
  } as unknown as Match;
}

describe('field manager presence', () => {
  it('is unknown until something has actually synced', () => {
    expect(fieldManagerPresence({ displayName: 'Joseph K.', now: NOW }))
      .toEqual({ displayName: 'Joseph K.', secondsSinceSync: null, presence: 'unknown' });
  });

  it('reports online, stale and offline from the observed gap', () => {
    const at = (secondsAgo: number) =>
      new Date(Date.parse(NOW) - secondsAgo * 1000).toISOString();
    expect(fieldManagerPresence({ lastSyncAt: at(5), now: NOW }).presence).toBe('online');
    expect(fieldManagerPresence({ lastSyncAt: at(200), now: NOW }).presence).toBe('stale');
    expect(fieldManagerPresence({ lastSyncAt: at(600), now: NOW }).presence).toBe('offline');
  });

  it('never claims presence from an unparseable timestamp', () => {
    expect(fieldManagerPresence({ lastSyncAt: 'not a date', now: NOW }).presence).toBe('unknown');
  });
});

describe('match operational state', () => {
  function row(overrides: Parameters<typeof matchOperationalRow>[0] extends never ? never : Partial<Parameters<typeof matchOperationalRow>[0]>) {
    return matchOperationalRow({ match: match(), teams, now: NOW, ...overrides });
  }

  it('calls a scheduled match with nobody assigned what it is', () => {
    const result = row({});
    expect(result.state).toBe('unassigned');
    expect(result.attention).toBe('No Field Manager assigned.');
  });

  it('is ready once someone is assigned', () => {
    expect(row({ assignment: { displayName: 'Joseph K.' } }).state).toBe('ready');
  });

  it('treats a live match with nobody recording it as needing attention, not as running fine', () => {
    const result = row({ match: match({ status: 'live' }) });
    expect(result.state).toBe('live');
    expect(result.attention).toBe('This match is under way with nobody assigned to record it.');
  });

  it('raises a live match whose Field Manager has gone offline', () => {
    const result = row({
      match: match({ status: 'live' }),
      assignment: {
        displayName: 'Joseph K.',
        lastSyncAt: new Date(Date.parse(NOW) - 8 * 60_000).toISOString(),
      },
    });
    expect(result.attention).toBe('The Field Manager has not synced for 8 minutes.');
  });

  it('says nothing about a live match that is syncing normally', () => {
    const result = row({
      match: match({ status: 'live' }),
      assignment: {
        displayName: 'Joseph K.',
        lastSyncAt: new Date(Date.parse(NOW) - 3_000).toISOString(),
      },
    });
    expect(result.state).toBe('live');
    expect(result.attention).toBeNull();
  });

  it('separates a played match from an official one', () => {
    expect(row({ match: match({ status: 'completed' }) }).state).toBe('awaiting_result');
    expect(row({ match: match({ status: 'completed', verificationStatus: 'verified' }) }).state)
      .toBe('official');
  });

  it('lets an open exception outrank every other reading', () => {
    const result = row({
      match: match({ status: 'completed', verificationStatus: 'verified' }),
      hasOpenException: true,
    });
    expect(result.state).toBe('needs_review');
  });

  it('keeps a cancelled fixture out of the still-to-play reading', () => {
    const result = row({ match: match({ status: 'cancelled' }) });
    expect(result.state).toBe('cancelled');
    expect(segmentFor(result)).toBe('completed');
  });

  it('names the teams and does not leave a blank opponent', () => {
    const result = row({ match: match({ awayTeamId: undefined as unknown as string }) });
    expect(result.homeTeamName).toBe('Kampala United');
    expect(result.awayTeamName).toBe('To be confirmed');
  });
});

describe('command model', () => {
  const at = (hoursFromNow: number) =>
    new Date(Date.parse(NOW) + hoursFromNow * 3_600_000).toISOString();

  it('counts today, and separates live from upcoming', () => {
    const model = buildLeagueCommand({
      matches: [
        match({ id: 'm1', status: 'live', scheduledAt: at(-1) }),
        match({ id: 'm2', scheduledAt: at(2) }),
        match({ id: 'm3', scheduledAt: at(3) }),
      ],
      teams,
      assignmentsByMatchId: {
        m1: { displayName: 'Joseph K.', lastSyncAt: at(0) },
        m2: { displayName: 'Grace N.' },
        m3: { displayName: 'Miriam A.' },
      },
      now: NOW,
    });
    expect(model.today.total).toBe(3);
    expect(model.today.live).toBe(1);
    expect(model.today.upcoming).toBe(2);
  });

  it('puts the critical thing first', () => {
    const model = buildLeagueCommand({
      matches: [
        match({ id: 'm1', scheduledAt: at(4) }),
        match({ id: 'm2', status: 'live', scheduledAt: at(-1) }),
      ],
      teams,
      registrationIssueCount: 2,
      now: NOW,
    });
    expect(model.attention[0].severity).toBe('critical');
    expect(model.attention[0].id).toBe('match:m2');
    expect(model.attention.some((item) => item.id === 'registrations')).toBe(true);
  });

  it('links each attention item somewhere that can resolve it', () => {
    const model = buildLeagueCommand({
      matches: [match({ id: 'm1', scheduledAt: at(4) })],
      teams,
      unclaimedAthleteCount: 6,
      now: NOW,
    });
    expect(model.attention.find((item) => item.id === 'match:m1')?.href)
      .toBe('/league-admin/matches/m1');
    expect(model.attention.find((item) => item.id === 'unclaimed')?.href)
      .toBe('/league-admin/athletes?filter=unclaimed');
  });

  it('reads as quiet when there is genuinely nothing to do', () => {
    const model = buildLeagueCommand({
      matches: [match({ id: 'm1', scheduledAt: at(72), status: 'scheduled' })],
      teams,
      assignmentsByMatchId: { m1: { displayName: 'Joseph K.' } },
      now: NOW,
    });
    expect(model.attention).toEqual([]);
    expect(model.today.total).toBe(0);
    expect(model.quiet).toBe(true);
  });

  it('lists the next fixtures in kickoff order and never a past one', () => {
    const model = buildLeagueCommand({
      matches: [
        match({ id: 'past', scheduledAt: at(-48) }),
        match({ id: 'later', scheduledAt: at(48) }),
        match({ id: 'sooner', scheduledAt: at(24) }),
      ],
      teams,
      now: NOW,
      nextLimit: 2,
    });
    expect(model.next.map((row) => row.matchId)).toEqual(['sooner', 'later']);
  });

  it('singularises its own counts', () => {
    const model = buildLeagueCommand({
      matches: [], teams, registrationIssueCount: 1, unclaimedAthleteCount: 1, now: NOW,
    });
    expect(model.attention.map((item) => item.label)).toEqual([
      '1 athlete registration needs review',
      '1 athlete profile is unclaimed',
    ]);
  });
});

describe('segments', () => {
  it('routes each state to exactly one segment', () => {
    const rows = [
      { state: 'live' }, { state: 'unassigned' }, { state: 'ready' },
      { state: 'official' }, { state: 'needs_review' }, { state: 'awaiting_result' },
    ] as Parameters<typeof segmentMatches>[0];
    expect(segmentMatches(rows)).toEqual({ live: 1, upcoming: 2, completed: 1, review: 2 });
  });
});

describe('attention overflow', () => {
  const at = (hours: number) => new Date(Date.parse(NOW) + hours * 3_600_000).toISOString();

  it('keeps the most consequential items and counts the rest', () => {
    const model = buildLeagueCommand({
      matches: Array.from({ length: 9 }, (_, index) =>
        match({ id: `m${index}`, scheduledAt: at(index + 1) })),
      teams,
      now: NOW,
      attentionLimit: 5,
    });
    expect(model.attention).toHaveLength(5);
    expect(model.attentionOverflow).toBe(4);
  });

  it('counts nothing extra when everything fits', () => {
    const model = buildLeagueCommand({
      matches: [match({ id: 'm1', scheduledAt: at(2) })],
      teams,
      now: NOW,
    });
    expect(model.attentionOverflow).toBe(0);
  });

  it('never drops a critical item in favour of a warning', () => {
    const model = buildLeagueCommand({
      matches: [
        ...Array.from({ length: 8 }, (_, index) =>
          match({ id: `warn${index}`, scheduledAt: at(index + 1) })),
        match({ id: 'critical', status: 'live', scheduledAt: at(-1) }),
      ],
      teams,
      now: NOW,
      attentionLimit: 3,
    });
    expect(model.attention[0].id).toBe('match:critical');
    expect(model.attention).toHaveLength(3);
  });
});

describe('capture policy copy', () => {
  it('explains each policy without printing the enum', () => {
    for (const policy of ['FIELD_REQUIRED', 'FIELD_PREFERRED', 'POST_MATCH_ALLOWED']) {
      const copy = capturePolicyCopy(policy);
      expect(copy.title).not.toContain('_');
      expect(copy.detail.length).toBeGreaterThan(20);
    }
    expect(capturePolicyCopy('FIELD_REQUIRED').title).toBe('Field Required');
    expect(capturePolicyCopy('POST_MATCH_ALLOWED').detail).toContain('quality will be limited');
  });
});

describe('the window the Matches workspace segments', () => {
  const at = (hours: number) => new Date(Date.parse(NOW) + hours * 3_600_000).toISOString();

  it('returns every fixture, not only the ones Command reads', () => {
    const model = buildLeagueCommand({
      matches: [
        match({ id: 'played', status: 'completed', verificationStatus: 'verified', scheduledAt: at(-72) }),
        match({ id: 'live', status: 'live', scheduledAt: at(-1) }),
        match({ id: 'soon', scheduledAt: at(48) }),
      ],
      teams,
      now: NOW,
    });
    // `next` is upcoming only and `today` is one day; the workspace needs all three.
    expect(model.rows.map((row) => row.matchId).sort()).toEqual(['live', 'played', 'soon']);
    expect(segmentMatches(model.rows)).toMatchObject({ live: 1, upcoming: 1, completed: 1 });
  });
});
