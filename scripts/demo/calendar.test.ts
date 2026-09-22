import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  auditCalendar,
  demoAccessDocuments,
  fantasyCollections,
  LIVE_PIN_MS,
  planCalendar,
  rebaseCalendar,
  rebaseFantasy,
  type DemoDatabase,
} from './calendar';

const canonical = JSON.parse(readFileSync('data/investor-demo/database.json', 'utf8')) as DemoDatabase;
// A Monday. The plan must not depend on which weekday the seed happens to run on.
const NOW = new Date('2026-09-21T14:30:00.000Z');

describe('planning the shift', () => {
  const plan = planCalendar(canonical, NOW);

  it('moves every league by whole weeks onto its most recent live weekday', () => {
    expect(plan.leagues).toHaveLength(6);
    for (const shift of plan.leagues) {
      expect(shift.deltaMs % (7 * 86_400_000)).toBe(0);
      const target = new Date(shift.target);
      expect(target.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(NOW.getTime() - target.getTime()).toBeLessThan(7 * 86_400_000);
      expect(target.getUTCDay()).toBe(new Date(shift.anchor).getUTCDay());
    }
  });

  it('moves the social clock from generatedAt to now in whole days', () => {
    expect(plan.social.anchor).toBe('2026-07-25T12:00:00.000Z');
    expect(plan.social.deltaMs % 86_400_000).toBe(0);
    expect(Date.parse(plan.social.target)).toBeLessThanOrEqual(NOW.getTime());
  });

  it('refuses a dataset it does not recognise', () => {
    const noLive = { ...canonical, matches: (canonical.matches as Array<{ status: string }>).map((m) => ({ ...m, status: m.status === 'live' ? 'completed' : m.status })) };
    expect(() => planCalendar(noLive as DemoDatabase, NOW)).toThrow(/no live matchday/);
  });
});

describe('the re-based world', () => {
  const plan = planCalendar(canonical, NOW);
  const world = rebaseCalendar(canonical, plan);

  it('passes its own audit', () => {
    // The failures this guards, each of which the platform showed for weeks: zero upcoming
    // fixtures, matches live since April, feed posts and seasons that no longer contain today.
    expect(auditCalendar(world, NOW)).toEqual([]);
  });

  it('never edits the canonical package', () => {
    const before = readFileSync('data/investor-demo/database.json', 'utf8');
    expect(JSON.stringify(canonical)).toBe(JSON.stringify(JSON.parse(before)));
  });

  it('pins every live match to minutes ago and leaves ids alone', () => {
    const live = (world.matches as Array<{ id: string; status: string; scheduledAt: string }>).filter((m) => m.status === 'live');
    expect(live).toHaveLength(6);
    for (const match of live) {
      expect(Date.parse(match.scheduledAt)).toBe(NOW.getTime() - LIVE_PIN_MS);
      expect((canonical.matches as Array<{ id: string }>).some((m) => m.id === match.id)).toBe(true);
    }
  });

  it('keeps a result submission on its match\'s clock, not the social one', () => {
    const submission = (world.resultSubmissions as Array<{ id: string; matchId: string; submittedAt: string }>)[0];
    const match = (world.matches as Array<{ id: string; scheduledAt: string }>).find((m) => m.id === submission.matchId)!;
    // Submitted within a day of kickoff in the source, so still within a day after the shift.
    expect(Math.abs(Date.parse(submission.submittedAt) - Date.parse(match.scheduledAt))).toBeLessThan(2 * 86_400_000);
  });

  it('records what it did in the metadata', () => {
    const metadata = world.metadata as { generatedAt: string; calendar?: { rebasedAt: string; leagueWeeks: Record<string, number> } };
    expect(metadata.calendar?.rebasedAt).toBe(NOW.toISOString());
    expect(Object.keys(metadata.calendar?.leagueWeeks ?? {})).toHaveLength(6);
  });
});

describe('the authority the demo starts with', () => {
  const docs = demoAccessDocuments(canonical, NOW);

  it('makes every club\'s demo admin a Club Operator with the ADR-005 bundle', () => {
    const clubs = docs.accessAssignments.filter((a) => a.scopeType === 'team');
    expect(clubs).toHaveLength(60);
    expect(new Set(clubs.map((a) => a.roleKey))).toEqual(new Set(['club_operator']));
    const samuel = docs.accessIndex.find((i) => i.id === 'team_team_football_01_01_user_team_admin_01_01');
    expect(samuel?.capabilities).toEqual([
      'team.content.publish', 'team.media.manage', 'team.profile.edit',
      'team.result.dispute', 'team.result.report', 'team.roster.propose',
    ]);
  });

  it('never projects a retired V1 team capability', () => {
    for (const index of docs.accessIndex) {
      expect(index.capabilities).not.toContain('team.result.submit');
      expect(index.capabilities).not.toContain('team.roster.manage');
    }
  });

  it('gives every league admin and platform account a projected index', () => {
    expect(docs.accessIndex.filter((i) => i.scopeType === 'league')).toHaveLength(6);
    expect(docs.accessIndex.filter((i) => i.scopeType === 'platform')).toHaveLength(2);
  });
});

describe('the fantasy package on the re-based calendar', async () => {
  const { fantasyDemo } = await import('../../src/data/fantasyDemo');
  const plan = planCalendar(canonical, NOW);
  const world = rebaseCalendar(canonical, plan);
  const fantasy = rebaseFantasy(fantasyCollections(fantasyDemo as unknown as Record<string, unknown[]>), canonical, world, NOW);
  const rounds = fantasy.fantasyRounds as Array<{ id: string; number: number; status: string; deadlineAt: string; matchIds: string[] }>;

  it('gives every competition a round a fan can enter today', () => {
    // The failure this guards: round 1 locked, rounds 2–4 "upcoming" with August deadlines,
    // and no fan able to save a squad anywhere on the demo.
    const byNumber = (n: number) => rounds.filter((round) => round.number === n);
    expect(byNumber(1).every((round) => round.status === 'official')).toBe(true);
    expect(byNumber(2).every((round) => round.status === 'scoring')).toBe(true);
    for (const round of byNumber(3)) {
      expect(round.status).toBe('open');
      expect(Date.parse(round.deadlineAt)).toBeGreaterThan(NOW.getTime());
    }
  });

  it('points the settled round at played matches and the open round at fixtures', () => {
    const matches = new Map((world.matches as Array<{ id: string; status: string }>).map((m) => [m.id, m.status]));
    for (const round of rounds) {
      expect(round.matchIds).toHaveLength(5);
      const statuses = new Set(round.matchIds.map((id) => matches.get(id)));
      if (round.number === 1) expect(statuses).toEqual(new Set(['completed']));
      if (round.number === 3) expect(statuses).toEqual(new Set(['scheduled']));
    }
  });

  it('re-points the official point events at the new round 1', () => {
    const events = fantasy.fantasyPointEvents as Array<{ competitionId: string; roundId: string; matchId: string; sourceEventId: string }>;
    for (const event of events) {
      const round = rounds.find((item) => item.id === event.roundId)!;
      expect(round.matchIds).toContain(event.matchId);
      expect(event.sourceEventId).toContain(event.matchId);
    }
  });

  it('gives every player a real next fixture', () => {
    const players = fantasy.fantasyPlayers as Array<{ nextFixtureMatchId: string | null }>;
    const ids = new Set((world.matches as Array<{ id: string }>).map((m) => m.id));
    expect(players.every((player) => player.nextFixtureMatchId && ids.has(player.nextFixtureMatchId))).toBe(true);
  });
});
