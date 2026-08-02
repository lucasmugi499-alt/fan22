import { describe, expect, it, vi } from 'vitest';
import {
  buildSeedRecords,
  buildSmokeIds,
  expectedTotals,
  parseArgs,
  resolveSmokePlan,
  validateProjectCompatibility,
} from './fantasy-auth-firestore-smoke';

const projectMap = {
  projects: {
    staging: 'studio-534174814-9df36',
    prod: 'manifest-quasar-479416-s7',
  },
};

describe('fantasy Auth/Firestore staging smoke helpers', () => {
  it('resolves the staging project from .firebaserc and requires HTTPS hosted app URLs', () => {
    const plan = resolveSmokePlan({
      baseUrl: 'https://staging.goalplace256.test/',
      databaseId: 'fg256',
      apiKey: 'api-key',
      password: 'strong-password',
      scoringSecret: 'scheduler-secret',
      keep: false,
      allowProduction: false,
      json: false,
    }, projectMap);

    expect(plan).toMatchObject({
      baseUrl: 'https://staging.goalplace256.test',
      projectId: 'studio-534174814-9df36',
      databaseId: 'fg256',
      apiKey: 'api-key',
      keep: false,
    });
  });

  it('fails closed when required staging configuration is missing', () => {
    expect(() => resolveSmokePlan({
      keep: false,
      allowProduction: false,
      json: false,
    }, {})).toThrow(/Missing staging fantasy smoke configuration/);
  });

  it('refuses production projects unless the caller explicitly overrides the guard', () => {
    const options = {
      baseUrl: 'https://prod.goalplace256.test',
      projectId: 'manifest-quasar-479416-s7',
      databaseId: 'fg256',
      apiKey: 'api-key',
      password: 'strong-password',
      scoringSecret: 'scheduler-secret',
      keep: false,
      allowProduction: false,
      json: false,
    };

    expect(() => resolveSmokePlan(options, projectMap)).toThrow(/production project/);
    expect(resolveSmokePlan({ ...options, allowProduction: true }, projectMap).projectId)
      .toBe('manifest-quasar-479416-s7');
  });

  it('builds deterministic smoke ids for API-created fantasy documents', () => {
    const ids = buildSmokeIds('Rugby Smoke 001');

    expect(ids.suffix).toBe('rugby_smoke_001');
    expect(ids.uid).toBe('smoke_fan_rugby_smoke_001');
    expect(ids.fantasyTeamId).toBe(`${ids.competitionId}_${ids.uid}`);
    expect(ids.lineupV1Id).toBe(`${ids.fantasyTeamId}_${ids.roundId}_v1`);
    expect(ids.lineupV2Id).toBe(`${ids.fantasyTeamId}_${ids.roundId}_v2`);
    expect(ids.correctionId).toBe(`${ids.competitionId}:${ids.roundId}:${ids.matchId}:v1-v2`);
  });

  it('seeds the minimum records needed for lineup, transfer, scoring, and correction', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T12:00:00.000Z'));
    const ids = buildSmokeIds('fantasy_seed');
    const records = buildSeedRecords(ids, new Date());
    vi.useRealTimers();

    const paths = records.map((record) => `${record.collection}/${record.id}`);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain(`users/${ids.uid}`);
    expect(paths).toContain(`fantasyCompetitions/${ids.competitionId}`);
    expect(paths).toContain(`fantasyRounds/${ids.roundId}`);
    expect(paths).toContain(`matches/${ids.matchId}`);
    expect(paths).toContain(`officialAthleteMatchStats/${ids.matchId}_v1_${ids.athleteIds[0]}`);
    expect(paths).toContain(`officialAthleteMatchStats/${ids.matchId}_v2_${ids.athleteIds[0]}`);
    expect(records.filter((record) => record.collection === 'fantasyPlayers')).toHaveLength(4);
    expect(records.filter((record) => record.collection === 'fantasyPlayerPrices')).toHaveLength(4);
  });

  it('documents the expected leaderboard totals for staging evidence review', () => {
    expect(expectedTotals()).toEqual({
      firstOfficialTotal: 17.5,
      correctedTotal: 25,
    });
  });

  it('parses CLI flags and environment fallbacks consistently', () => {
    const parsed = parseArgs([
      '--base-url', 'https://staging.goalplace256.test',
      '--project', 'studio-534174814-9df36',
      '--database', 'fg256',
      '--api-key', 'api-key',
      '--password', 'strong-password',
      '--scoring-secret', 'scheduler-secret',
      '--run-id', 'manual',
      '--keep',
      '--json',
    ]);

    expect(parsed).toMatchObject({
      baseUrl: 'https://staging.goalplace256.test',
      projectId: 'studio-534174814-9df36',
      databaseId: 'fg256',
      apiKey: 'api-key',
      password: 'strong-password',
      scoringSecret: 'scheduler-secret',
      runId: 'manual',
      keep: true,
      json: true,
    });
  });

  it('blocks project mismatches before the hosted smoke writes data', () => {
    expect(() => validateProjectCompatibility({
      planProjectId: 'studio-534174814-9df36',
      credentialProjectId: 'manifest-quasar-479416-s7',
    })).toThrow(/credential belongs/);
    expect(() => validateProjectCompatibility({
      planProjectId: 'manifest-quasar-479416-s7',
      hostedProjectId: 'studio-534174814-9df36',
    })).toThrow(/hosted app is using/);
    expect(() => validateProjectCompatibility({
      planProjectId: 'studio-534174814-9df36',
      credentialProjectId: 'studio-534174814-9df36',
      hostedProjectId: 'studio-534174814-9df36',
    })).not.toThrow();
  });
});
