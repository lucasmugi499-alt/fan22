import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
    runTransaction: vi.fn(),
  },
}));

type RecordData = Record<string, unknown>;
type Filter = {
  field: string;
  operator: '==' | 'in';
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
}

class MemoryCollection {
  constructor(
    private readonly store: Map<string, RecordData>,
    readonly name: string,
    private readonly filters: Filter[] = [],
  ) {}

  doc(id?: string) {
    return new MemoryDocRef(this.store, `${this.name}/${id ?? `${this.name}_generated_${this.store.size}`}`);
  }

  where(field: string, operator: Filter['operator'], value: unknown) {
    return new MemoryCollection(this.store, this.name, [...this.filters, { field, operator, value }]);
  }

  async get() {
    const docs = Array.from(this.store.entries())
      .filter(([path]) => path.startsWith(`${this.name}/`) && path.split('/').length === 2)
      .filter(([, data]) => this.filters.every((filter) => matchesFilter(data, filter)))
      .map(([path, data]) => snapshot(new MemoryDocRef(this.store, path), data));
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
    };
  }
}

class MemoryTransaction {
  constructor(private readonly store: Map<string, RecordData>) {}

  async get(target: MemoryDocRef | MemoryCollection) {
    return target.get();
  }

  update(ref: MemoryDocRef, data: RecordData) {
    this.store.set(ref.path, { ...(this.store.get(ref.path) ?? {}), ...data });
  }

  create(ref: MemoryDocRef, data: RecordData) {
    if (this.store.has(ref.path)) throw new Error(`Document already exists: ${ref.path}`);
    this.store.set(ref.path, data);
  }

  // The shared mutation wrapper's rate limiter writes through the same transaction.
  set(ref: MemoryDocRef, data: RecordData) {
    this.store.set(ref.path, { ...(this.store.get(ref.path) ?? {}), ...data });
  }
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
  if (filter.operator === 'in') return Array.isArray(filter.value) && filter.value.includes(value);
  return false;
}

function installDb(initial: Record<string, RecordData>) {
  const store = new Map(Object.entries(initial));
  vi.mocked(adminDb.collection).mockImplementation((name: string) =>
    new MemoryCollection(store, name) as never,
  );
  vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) =>
    callback(new MemoryTransaction(store) as never),
  );
  return store;
}

function request(body: unknown) {
  return new Request('https://goalplace256.test/api/fantasy/transfers', {
    method: 'POST',
    headers: { authorization: 'Bearer fan-token' },
    body: JSON.stringify(body),
  });
}

const futureDeadline = '2099-01-01T00:00:00.000Z';

describe('fantasy transfer route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'fan_1',
      role: 'fan',
      accountClass: 'fan',
    });
  });

  it('applies a validated transfer through the trusted API and records the next lineup version', async () => {
    const store = installDb({
      'users/fan_1': {
        id: 'fan_1',
        role: 'fan',
        accountClass: 'fan',
        accountStatus: 'active',
      },
      'fantasyCompetitions/fantasy_rugby': {
        id: 'fantasy_rugby',
        sport: 'rugby',
        squadRulesId: 'rules_1',
      },
      'fantasyRounds/round_1': {
        id: 'round_1',
        competitionId: 'fantasy_rugby',
        deadlineAt: futureDeadline,
        status: 'open',
      },
      'fantasySquadRules/rules_1': {
        id: 'rules_1',
        sport: 'rugby',
        variant: 'rugby_7s',
        squadSize: 3,
        startingSize: 2,
        benchSize: 1,
        budgetCredits: 100,
        maxFromRealTeam: 3,
        captainRequired: true,
        viceCaptainRequired: true,
        transferAllowancePerRound: 2,
        positionGroups: [{ id: 'back', label: 'Backs', positions: [], minimum: 0, maximum: 3 }],
      },
      'fantasyTeams/fantasy_rugby_fan_1': {
        id: 'fantasy_rugby_fan_1',
        competitionId: 'fantasy_rugby',
        userId: 'fan_1',
        name: 'Fan XV',
        currentLineupVersionId: 'lineup_v1',
        lineupVersion: 1,
      },
      'fantasyLineupVersions/lineup_v1': {
        id: 'lineup_v1',
        fantasyTeamId: 'fantasy_rugby_fan_1',
        competitionId: 'fantasy_rugby',
        roundId: 'round_1',
        version: 1,
        squadAthleteIds: ['athlete_1', 'athlete_2', 'athlete_3'],
        startingAthleteIds: ['athlete_1', 'athlete_2'],
        benchAthleteIds: ['athlete_3'],
        captainAthleteId: 'athlete_1',
        viceCaptainAthleteId: 'athlete_2',
        creditsUsed: 30,
        status: 'submitted',
      },
      ...Object.fromEntries(['athlete_1', 'athlete_2', 'athlete_4'].map((athleteId) => [
        `fantasyPlayers/fantasy_rugby_${athleteId}`,
        {
          id: `fantasy_rugby_${athleteId}`,
          competitionId: 'fantasy_rugby',
          athleteId,
          realTeamId: 'team_1',
          positionGroup: 'back',
          active: true,
          availability: 'available',
        },
      ])),
      ...Object.fromEntries(['athlete_1', 'athlete_2', 'athlete_4'].map((athleteId) => [
        `fantasyPlayerPrices/fantasy_rugby_${athleteId}_v1`,
        {
          id: `fantasy_rugby_${athleteId}_v1`,
          competitionId: 'fantasy_rugby',
          athleteId,
          credits: 10,
          status: 'published',
        },
      ])),
    });

    const response = await POST(request({
      competitionId: 'fantasy_rugby',
      roundId: 'round_1',
      athleteOutId: 'athlete_3',
      athleteInId: 'athlete_4',
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      lineupVersionId: 'fantasy_rugby_fan_1_round_1_v2',
      transfersRemaining: 1,
    });
    expect(store.get('fantasyLineupVersions/lineup_v1')).toMatchObject({
      status: 'superseded',
    });
    expect(store.get('fantasyLineupVersions/fantasy_rugby_fan_1_round_1_v2')).toMatchObject({
      squadAthleteIds: ['athlete_1', 'athlete_2', 'athlete_4'],
      startingAthleteIds: ['athlete_1', 'athlete_2'],
      benchAthleteIds: ['athlete_4'],
      status: 'submitted',
      creditsUsed: 30,
    });
    expect(store.get('fantasyTeams/fantasy_rugby_fan_1')).toMatchObject({
      currentLineupVersionId: 'fantasy_rugby_fan_1_round_1_v2',
      lineupVersion: 2,
    });
    expect(Array.from(store.values())).toContainEqual(expect.objectContaining({
      competitionId: 'fantasy_rugby',
      athleteOutId: 'athlete_3',
      athleteInId: 'athlete_4',
      status: 'applied',
    }));
  });
});
