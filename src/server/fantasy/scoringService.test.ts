import { describe, expect, it } from 'vitest';
import { FANTASY_SCORING_PROFILES } from '@/lib/fantasy/profiles';
import type {
  FantasyCompetition,
  FantasyLineupVersion,
  FantasyOfficialAthletePerformance,
  FantasyRound,
} from '@/types/fantasy';
import { lockFantasyRoundLineups, scoreFinalizedFantasyMatch } from './scoringService';

type RecordData = Record<string, unknown>;
type Filter = {
  field: string;
  operator: '==' | '<=' | 'array-contains' | 'in';
  value: unknown;
};

class MemoryDocRef {
  constructor(
    private readonly store: Map<string, RecordData>,
    readonly path: string,
  ) {}

  get id() {
    return this.path.split('/').at(-1)!;
  }

  async get() {
    return snapshot(this, this.store.get(this.path));
  }

  async set(data: RecordData, options?: { merge?: boolean }) {
    this.store.set(this.path, options?.merge ? { ...(this.store.get(this.path) ?? {}), ...data } : data);
  }

  async update(data: RecordData) {
    this.store.set(this.path, { ...(this.store.get(this.path) ?? {}), ...data });
  }
}

class MemoryCollection {
  private readonly filters: Filter[];
  private readonly max?: number;

  constructor(
    private readonly store: Map<string, RecordData>,
    readonly name: string,
    filters: Filter[] = [],
    max?: number,
  ) {
    this.filters = filters;
    this.max = max;
  }

  doc(id?: string) {
    return new MemoryDocRef(this.store, `${this.name}/${id ?? `${this.name}_generated_${this.store.size}`}`);
  }

  async add(data: RecordData) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }

  where(field: string, operator: Filter['operator'], value: unknown) {
    return new MemoryCollection(this.store, this.name, [...this.filters, { field, operator, value }], this.max);
  }

  limit(max: number) {
    return new MemoryCollection(this.store, this.name, this.filters, max);
  }

  async get() {
    const docs = Array.from(this.store.entries())
      .filter(([path]) => path.startsWith(`${this.name}/`) && path.split('/').length === 2)
      .filter(([, data]) => this.filters.every((filter) => matchesFilter(data, filter)))
      .slice(0, this.max)
      .map(([path, data]) => snapshot(new MemoryDocRef(this.store, path), data));
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
    };
  }
}

class MemoryBatch {
  private operations: Array<() => void> = [];

  constructor(private readonly store: Map<string, RecordData>) {}

  set(ref: MemoryDocRef, data: RecordData, options?: { merge?: boolean }) {
    this.operations.push(() => {
      this.store.set(ref.path, options?.merge ? { ...(this.store.get(ref.path) ?? {}), ...data } : data);
    });
  }

  update(ref: MemoryDocRef, data: RecordData) {
    this.operations.push(() => {
      this.store.set(ref.path, { ...(this.store.get(ref.path) ?? {}), ...data });
    });
  }

  async commit() {
    this.operations.forEach((operation) => operation());
    this.operations = [];
  }
}

function fakeDb(initial: Record<string, RecordData>) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    db: {
      collection: (name: string) => new MemoryCollection(store, name),
      batch: () => new MemoryBatch(store),
    },
  };
}

function snapshot(ref: MemoryDocRef, data: RecordData | undefined) {
  return {
    id: ref.id,
    ref,
    exists: Boolean(data),
    data: () => data,
  };
}

function matchesFilter(data: RecordData, filter: Filter) {
  const value = data[filter.field];
  if (filter.operator === '==') return value === filter.value;
  if (filter.operator === '<=') return String(value) <= String(filter.value);
  if (filter.operator === 'array-contains') return Array.isArray(value) && value.includes(filter.value);
  if (filter.operator === 'in') return Array.isArray(filter.value) && filter.value.includes(value);
  return false;
}

const nowPast = '2026-07-29T00:00:00.000Z';
const rugbyProfile = FANTASY_SCORING_PROFILES.find((profile) => profile.sport === 'rugby')!;
const competition: FantasyCompetition = {
  id: 'fantasy_rugby',
  name: 'Rugby Fantasy',
  shortName: 'Rugby',
  sport: 'rugby',
  variant: 'rugby_union',
  leagueId: 'league_1',
  seasonId: 'season_1',
  scoringProfileId: rugbyProfile.id,
  scoringProfileVersion: rugbyProfile.version,
  squadRulesId: 'rugby_rules',
  dataLevel: 'basic',
  recordedStatKeys: ['active_squad', 'appearance', 'try', 'win_participation'],
  status: 'active',
  isFreeToPlay: true,
  creditsLabel: 'Fantasy Credits',
  createdAt: nowPast,
};
const round: FantasyRound = {
  id: 'round_1',
  competitionId: competition.id,
  number: 1,
  name: 'Round 1',
  matchIds: ['match_1'],
  startsAt: nowPast,
  deadlineAt: nowPast,
  endsAt: '2026-07-30T00:00:00.000Z',
  status: 'open',
};
const lineup: FantasyLineupVersion = {
  id: 'fantasy_rugby_fan_1_round_1_v1',
  fantasyTeamId: 'fantasy_rugby_fan_1',
  competitionId: competition.id,
  roundId: round.id,
  version: 1,
  squadAthleteIds: ['athlete_1', 'athlete_2'],
  startingAthleteIds: ['athlete_1', 'athlete_2'],
  benchAthleteIds: [],
  captainAthleteId: 'athlete_1',
  viceCaptainAthleteId: 'athlete_2',
  creditsUsed: 10,
  status: 'submitted',
  submittedAt: nowPast,
  createdAt: nowPast,
};

function performance(version: number, tries: number): FantasyOfficialAthletePerformance {
  return {
    id: `match_1_v${version}_athlete_1`,
    matchId: 'match_1',
    athleteId: 'athlete_1',
    realTeamId: 'team_1',
    sport: 'rugby',
    position: 'Fly-half',
    positionGroup: 'half_back',
    officialResultVersion: version,
    verificationStatus: 'verified',
    dataLevel: 'basic',
    dataCoverage: 'match_squad_basic',
    activeSquad: true,
    didPlay: true,
    minutesPlayed: 0,
    teamWon: true,
    playerOfMatch: false,
    stats: {
      active_squad: 1,
      appearance: 1,
      try: tries,
      win_participation: 1,
    },
    sourceEventIds: {
      active_squad: `event_v${version}_active`,
      appearance: `event_v${version}_active`,
      try: `event_v${version}_try`,
      win_participation: `event_v${version}_active`,
    },
  };
}

describe('fantasy scoring service integration', () => {
  it('locks submitted lineups, scores official results, writes corrections, and rebuilds leaderboards', async () => {
    const { db, store } = fakeDb({
      'matches/match_1': {
        id: 'match_1',
        leagueId: 'league_1',
        seasonId: 'season_1',
        sport: 'rugby',
        status: 'completed',
        verificationStatus: 'verified',
        officialResultVersion: 1,
      },
      'fantasyCompetitions/fantasy_rugby': competition,
      'fantasyRounds/round_1': round,
      [`fantasyScoringProfiles/${rugbyProfile.id}`]: rugbyProfile,
      'fantasyTeams/fantasy_rugby_fan_1': {
        id: 'fantasy_rugby_fan_1',
        competitionId: competition.id,
        userId: 'fan_1',
        name: 'Fan XV',
        currentLineupVersionId: lineup.id,
      },
      [`fantasyLineupVersions/${lineup.id}`]: lineup,
      'officialAthleteMatchStats/match_1_v1_athlete_1': performance(1, 1),
    });

    await expect(lockFantasyRoundLineups(db as never, round.id)).resolves.toBe(1);
    expect(store.get(`fantasyLineupVersions/${lineup.id}`)).toMatchObject({
      status: 'locked',
    });

    const firstScore = await scoreFinalizedFantasyMatch(db as never, 'match_1');

    expect(firstScore).toMatchObject({
      competitionsScored: 1,
      lineupsScored: 1,
      correctionsWritten: 0,
    });
    expect(Array.from(store.keys()).filter((key) => key.startsWith('fantasyPointEvents/'))).toHaveLength(4);
    expect(Array.from(store.values())).toContainEqual(expect.objectContaining({
      fantasyTeamId: 'fantasy_rugby_fan_1',
      totalPoints: 13.5,
      status: 'official',
    }));
    expect(store.get('fantasyLeaderboards/fantasy_rugby_fantasy_rugby_fan_1')).toMatchObject({
      rank: 1,
      totalPoints: 13.5,
    });
    expect(store.get('fantasyLeaderboards/fantasy_rugby_fantasy_rugby_fan_1')).not.toHaveProperty('previousRank');

    store.set('matches/match_1', {
      ...store.get('matches/match_1')!,
      officialResultVersion: 2,
    });
    store.set('officialAthleteMatchStats/match_1_v2_athlete_1', performance(2, 2));

    const correctionScore = await scoreFinalizedFantasyMatch(db as never, 'match_1');

    expect(correctionScore).toMatchObject({
      competitionsScored: 1,
      lineupsScored: 1,
      correctionsWritten: 1,
    });
    expect(Array.from(store.values()).filter((record) => record.status === 'superseded')).toHaveLength(4);
    expect(store.get('fantasyCorrections/fantasy_rugby:round_1:match_1:v1-v2')).toMatchObject({
      previousOfficialResultVersion: 1,
      newOfficialResultVersion: 2,
      affectedFantasyTeamIds: ['fantasy_rugby_fan_1'],
      oldTotals: { fantasy_rugby_fan_1: 13.5 },
      newTotals: { fantasy_rugby_fan_1: 21 },
    });
    expect(store.get('fantasyLeaderboards/fantasy_rugby_fantasy_rugby_fan_1')).toMatchObject({
      totalPoints: 21,
      previousRank: 1,
    });
    expect(Array.from(store.values())).toContainEqual(expect.objectContaining({
      type: 'fantasy_score_corrected',
      userId: 'fan_1',
    }));
  });
});
