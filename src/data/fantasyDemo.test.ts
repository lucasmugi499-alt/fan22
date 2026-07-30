import { describe, expect, it } from 'vitest';
import { fantasyDemo } from './fantasyDemo';
import { fantasyRecordHasFinancialFields, validateFantasySquad } from '@/lib/fantasy/squad';

describe('multi-sport fantasy pilot catalogue', () => {
  it('contains active football, basketball, and rugby competitions', () => {
    expect(fantasyDemo.competitions.map((item) => item.sport).sort()).toEqual([
      'basketball',
      'football',
      'rugby',
    ]);
    expect(fantasyDemo.competitions.every((item) =>
      item.isFreeToPlay && item.creditsLabel === 'Fantasy Credits',
    )).toBe(true);
  });

  it('ships four rounds and valid locked squads for every sport', () => {
    for (const competition of fantasyDemo.competitions) {
      expect(fantasyDemo.rounds.filter((item) => item.competitionId === competition.id)).toHaveLength(4);
      const rules = fantasyDemo.squadRules.find((item) => item.id === competition.squadRulesId)!;
      const players = fantasyDemo.players.filter((item) => item.competitionId === competition.id);
      const prices = fantasyDemo.playerPrices.filter((item) => item.competitionId === competition.id);
      for (const lineup of fantasyDemo.lineupVersions.filter(
        (item) => item.competitionId === competition.id,
      )) {
        const round = fantasyDemo.rounds.find((item) => item.id === lineup.roundId)!;
        expect(validateFantasySquad({
          lineup,
          players,
          prices,
          rules,
          serverNow: '2026-07-29T00:00:00.000Z',
          deadlineAt: round.deadlineAt,
        }).errors).toEqual([]);
      }
    }
  });

  it('contains provisional, official, private-league, and correction examples', () => {
    expect(fantasyDemo.pointEvents.some((item) => item.status === 'provisional')).toBe(true);
    expect(fantasyDemo.pointEvents.some((item) => item.status === 'official')).toBe(true);
    expect(fantasyDemo.miniLeagues.some((item) => item.visibility === 'private')).toBe(true);
    expect(fantasyDemo.corrections).toHaveLength(1);
    expect(fantasyDemo.corrections[0].newOfficialResultVersion).toBeGreaterThan(
      fantasyDemo.corrections[0].previousOfficialResultVersion,
    );
  });

  it('contains no financial or GoalPlace engagement fields', () => {
    expect(fantasyRecordHasFinancialFields(fantasyDemo)).toBe(false);
  });
});
