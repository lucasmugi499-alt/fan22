import { describe, expect, it } from 'vitest';
import { finalizeSubmission } from './resultFinalizer';

type RecordData = Record<string, unknown>;

let autoId = 0;
function docRef(path: string) {
  const segments = path.split('/');
  return {
    path,
    id: segments[segments.length - 1],
    collection: (name: string) => ({
      doc: (id?: string) => docRef(`${path}/${name}/${id ?? `${name}_auto_${(autoId += 1)}`}`),
    }),
  };
}

function fakeDb(initial: Record<string, RecordData>) {
  const records = new Map(Object.entries(initial));
  let transactionOpened = false;
  const db = {
    collection: (name: string) => ({ doc: (id: string) => docRef(`${name}/${id}`) }),
    runTransaction: async (callback: (tx: unknown) => unknown) => {
      transactionOpened = true;
      return callback({
        get: async (ref: ReturnType<typeof docRef>) => ({
          id: ref.id, exists: records.has(ref.path), data: () => records.get(ref.path),
        }),
        update: (ref: ReturnType<typeof docRef>, data: RecordData) =>
          records.set(ref.path, { ...(records.get(ref.path) ?? {}), ...data }),
        create: (ref: ReturnType<typeof docRef>, data: RecordData) => records.set(ref.path, data),
        set: (ref: ReturnType<typeof docRef>, data: RecordData) =>
          records.set(ref.path, { ...(records.get(ref.path) ?? {}), ...data }),
      });
    },
  };
  return { db, records, opened: () => transactionOpened };
}

/** A submission that WOULD finalize cleanly, so any refusal is the gate and nothing else. */
function readyFixture() {
  return fakeDb({
    'resultSubmissions/match_1': {
      id: 'match_1', matchId: 'match_1', leagueId: 'league_1', seasonId: 'season_1',
      submittedByTeamId: 'team_home', opponentTeamId: 'team_away',
      submittedByUserId: 'team_admin_1',
      homeScore: 1, awayScore: 0,
      scorers: [{ athleteId: 'athlete_1', teamId: 'team_home', count: 1, minute: 10 }],
      activeSquads: { team_home: ['athlete_1'], team_away: ['athlete_3'] },
      athleteStatLines: [], evidenceRefs: [],
      status: 'confirmed', revision: 1, resolution: 'opponent_confirmed',
      submittedAsFinal: true, confirmationDeadline: '2026-07-31T00:00:00.000Z',
      resultVersion: 1, submittedAt: '2026-07-30T11:00:00.000Z',
      confirmedAt: '2026-07-30T12:00:00.000Z',
    },
    'matches/match_1': {
      id: 'match_1', sport: 'football', leagueId: 'league_1', seasonId: 'season_1',
      homeTeamId: 'team_home', awayTeamId: 'team_away', venue: 'Ground', city: 'Kampala',
      scheduledAt: '2026-07-30T10:00:00.000Z', status: 'scheduled',
      score: { home: null, away: null }, verificationStatus: 'pending',
      supportersCount: 0, totalSupport: 0, events: [], createdAt: '2026-07-30T00:00:00.000Z',
    },
    'athletes/athlete_1': { id: 'athlete_1', name: 'Scorer', position: 'Striker', teamId: 'team_home' },
    'athletes/athlete_3': { id: 'athlete_3', name: 'Other', position: 'Striker', teamId: 'team_away' },
  });
}

function officialWrites(records: Map<string, RecordData>) {
  return [...records.keys()].filter((path) =>
    path.startsWith('officialSportEvents/')
    || path.startsWith('officialAthleteMatchStats/')
    || path.startsWith('finalizations/')
    || path.startsWith('officialMatchReconciliation/'));
}

/**
 * The gate is bound to the finalization PATH, not to one caller.
 *
 * It previously lived in the Cloud Functions trigger, so three other callers — the
 * scheduled sweeper, the League correction route, and the authenticated /finalize HTTP
 * endpoint — reached the finalizer without consulting it. The endpoint is deployed, so an
 * `off` or `canary` mode could be bypassed by an authenticated request.
 *
 * `finalizeSubmission` now takes the activation as a REQUIRED argument, which means a new
 * caller cannot omit it without failing to compile.
 */
describe('the activation gate binds to the finalization path', () => {
  it('writes nothing official while off, and does not even open a transaction', async () => {
    const { db, records, opened } = readyFixture();

    const outcome = await finalizeSubmission(db as never, 'match_1', { mode: 'off', canaryAllowlist: [] });

    expect(outcome).toEqual({ action: 'skipped', reason: 'finalizer_off' });
    expect(officialWrites(records)).toEqual([]);
    // Refused before any read, so an `off` deployment cannot write even if the rest
    // of the finalizer regressed.
    expect(opened()).toBe(false);
  });

  it('writes nothing official in canary when the submission is not allowlisted', async () => {
    const { db, records } = readyFixture();

    const outcome = await finalizeSubmission(db as never, 'match_1', {
      mode: 'canary', canaryAllowlist: ['some_other_match'],
    });

    expect(outcome).toEqual({ action: 'skipped', reason: 'not_in_canary_allowlist' });
    expect(officialWrites(records)).toEqual([]);
  });

  it('finalizes in canary when the submission IS allowlisted', async () => {
    const { db, records } = readyFixture();

    const outcome = await finalizeSubmission(db as never, 'match_1', {
      mode: 'canary', canaryAllowlist: ['match_1'],
    });

    expect(outcome).toMatchObject({ action: 'finalized' });
    expect(officialWrites(records).length).toBeGreaterThan(0);
  });

  it('finalizes while enabled', async () => {
    const { db, records } = readyFixture();

    const outcome = await finalizeSubmission(db as never, 'match_1', { mode: 'enabled', canaryAllowlist: [] });

    expect(outcome).toMatchObject({ action: 'finalized' });
    expect(officialWrites(records).length).toBeGreaterThan(0);
  });
});
