import { describe, expect, it } from 'vitest';
import { finalizeSubmission } from './resultFinalizer';

type RecordData = Record<string, unknown>;

function docRef(path: string) {
  const segments = path.split('/');
  return {
    path,
    id: segments[segments.length - 1],
    collection: (name: string) => ({
      doc: (id = `${name}_generated`) => docRef(`${path}/${name}/${id}`),
    }),
  };
}

function snapshot(ref: ReturnType<typeof docRef>, data: RecordData | undefined) {
  return {
    id: ref.id,
    exists: Boolean(data),
    data: () => data,
  };
}

function fakeDb(initial: Record<string, RecordData>) {
  const records = new Map(Object.entries(initial));
  const writes: Array<{ op: string; path: string; data: RecordData }> = [];
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
    }),
    runTransaction: async (callback: (tx: unknown) => unknown) => callback({
      get: async (ref: ReturnType<typeof docRef>) => snapshot(ref, records.get(ref.path)),
      update: (ref: ReturnType<typeof docRef>, data: RecordData) => {
        records.set(ref.path, { ...(records.get(ref.path) ?? {}), ...data });
        writes.push({ op: 'update', path: ref.path, data });
      },
      create: (ref: ReturnType<typeof docRef>, data: RecordData) => {
        if (records.has(ref.path)) throw new Error(`Document already exists: ${ref.path}`);
        records.set(ref.path, data);
        writes.push({ op: 'create', path: ref.path, data });
      },
      set: (ref: ReturnType<typeof docRef>, data: RecordData) => {
        records.set(ref.path, data);
        writes.push({ op: 'set', path: ref.path, data });
      },
    }),
  };
  return { db, records, writes };
}

const match = {
  id: 'match_1',
  sport: 'rugby',
  leagueId: 'league_1',
  seasonId: 'season_1',
  homeTeamId: 'team_home',
  awayTeamId: 'team_away',
  venue: 'Ground',
  city: 'Kampala',
  scheduledAt: '2026-07-30T10:00:00.000Z',
  status: 'scheduled',
  score: { home: null, away: null },
  verificationStatus: 'pending',
  supportersCount: 0,
  totalSupport: 0,
  events: [],
  createdAt: '2026-07-30T00:00:00.000Z',
};

const submission = {
  id: 'match_1',
  matchId: 'match_1',
  leagueId: 'league_1',
  seasonId: 'season_1',
  submittedByTeamId: 'team_home',
  opponentTeamId: 'team_away',
  submittedByUserId: 'team_admin_1',
  homeScore: 10,
  awayScore: 0,
  scorers: [
    { athleteId: 'athlete_1', teamId: 'team_home', count: 2, minute: 12 },
  ],
  activeSquads: {
    team_home: ['athlete_1', 'athlete_2'],
    team_away: ['athlete_3'],
  },
  evidenceRefs: ['matchEvidence/match_1/team_home/team_admin_1/photo.jpg'],
  status: 'confirmed',
  revision: 1,
  resolution: 'opponent_confirmed',
  submittedAsFinal: true,
  confirmationDeadline: '2026-07-31T00:00:00.000Z',
  resultVersion: 1,
  submittedAt: '2026-07-30T11:00:00.000Z',
  confirmedAt: '2026-07-30T12:00:00.000Z',
};

describe('trusted result finalizer', () => {
  it('emits canonical official sport events from settled scorer claims', async () => {
    const { db, records, writes } = fakeDb({
      'resultSubmissions/match_1': submission,
      'matches/match_1': match,
      'athletes/athlete_1': {
        id: 'athlete_1',
        name: 'Amina Trymaker',
        position: 'Fly-half',
      },
      'athletes/athlete_2': {
        id: 'athlete_2',
        name: 'Noah Non Scorer',
        position: 'Lock',
      },
      'athletes/athlete_3': {
        id: 'athlete_3',
        name: 'Grace Defender',
        position: 'Back Row',
      },
    });

    const outcome = await finalizeSubmission(db as never, 'match_1');

    expect(outcome).toMatchObject({ action: 'finalized' });
    expect(records.get('officialSportEvents/match_1_v1_event_0001')).toMatchObject({
      eventType: 'rugby.active_squad',
      sportId: 'rugby',
      competitionId: 'league_1',
      seasonId: 'season_1',
      matchId: 'match_1',
      sequence: 1,
      teamId: 'team_home',
      primaryAthleteId: 'athlete_1',
      payload: {
        value: 1,
        source: 'result_submission_active_squad',
      },
    });
    expect(records.get('officialSportEvents/match_1_v1_event_0002')).toMatchObject({
      eventType: 'rugby.active_squad',
      sequence: 2,
      primaryAthleteId: 'athlete_2',
    });
    expect(records.get('officialSportEvents/match_1_v1_event_0004')).toMatchObject({
      eventType: 'rugby.try',
      sportId: 'rugby',
      competitionId: 'league_1',
      seasonId: 'season_1',
      matchId: 'match_1',
      sequence: 4,
      teamId: 'team_home',
      primaryAthleteId: 'athlete_1',
      sourceClaimId: 'match_1',
      submittedByUserId: 'team_admin_1',
      submittedByTeamId: 'team_home',
      officialResultVersion: 1,
      officialEventVersion: 1,
      verificationStatus: 'official',
      evidenceRefs: ['matchEvidence/match_1/team_home/team_admin_1/photo.jpg'],
      payload: {
        value: 1,
        source: 'result_submission_scorer',
      },
    });
    expect(records.get('officialSportEvents/match_1_v1_event_0005')).toMatchObject({
      eventType: 'rugby.try',
      sequence: 5,
      primaryAthleteId: 'athlete_1',
    });
    expect(writes).toContainEqual(expect.objectContaining({
      op: 'set',
      path: 'officialAthleteMatchStats/match_1_v1_athlete_1',
      data: expect.objectContaining({
        dataCoverage: 'match_squad_basic',
        stats: expect.objectContaining({ active_squad: 1, appearance: 1, try: 2 }),
      }),
    }));
    expect(writes).toContainEqual(expect.objectContaining({
      op: 'set',
      path: 'officialAthleteMatchStats/match_1_v1_athlete_2',
      data: expect.objectContaining({
        dataCoverage: 'match_squad_basic',
        activeSquad: true,
        didPlay: true,
        stats: expect.objectContaining({ active_squad: 1, appearance: 1, try: 0 }),
      }),
    }));
  });
});
