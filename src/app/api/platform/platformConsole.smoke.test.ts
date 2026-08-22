import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Platform Admin console, walked end to end the way an operator would.
 *
 * Unit tests cover each decision in isolation — the lifecycle state machine, the payee
 * authority table, the settings schema. What they cannot show is that the pieces are wired
 * to each other: that the route reaches the decision module, that a refusal carries the
 * blocking dependency out to the operator, that an audit entry is actually written rather
 * than merely intended, and that a rejected command leaves nothing behind.
 *
 * So this is one continuous story against an in-memory Firestore: create a league, put a
 * club in it, put an athlete in the club, archive the draft club, try to delete something
 * that has become real and be refused with reasons, then change site settings twice from the
 * same stale version and be told to reload.
 */

const store = new Map<string, Map<string, Record<string, unknown>>>();
let nowCounter = 0;

function collectionMap(name: string) {
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name)!;
}

/** Firestore's sentinel values, reduced to what these routes actually use. */
const DELETE_SENTINEL = { __sentinel: 'delete' } as const;
const SERVER_TIMESTAMP = { __sentinel: 'serverTimestamp' } as const;

function applyWrite(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE_SENTINEL) delete target[key];
    else if (value === SERVER_TIMESTAMP) target[key] = `ts_${nowCounter++}`;
    else target[key] = value;
  }
  return target;
}

function docRef(collectionName: string, id: string) {
  const map = collectionMap(collectionName);
  return {
    id,
    collectionName,
    async get() {
      const data = map.get(id);
      return { exists: Boolean(data), id, data: () => (data ? { ...data } : undefined) };
    },
    async create(data: Record<string, unknown>) {
      if (map.has(id)) throw new Error('Already exists.');
      map.set(id, applyWrite({}, data));
    },
    async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
      const base = options?.merge ? { ...(map.get(id) ?? {}) } : {};
      map.set(id, applyWrite(base, data));
    },
    async update(data: Record<string, unknown>) {
      if (!map.has(id)) throw new Error('Not found.');
      map.set(id, applyWrite({ ...map.get(id)! }, data));
    },
    async delete() {
      map.delete(id);
    },
  };
}

/** Chainable `where(...).where(...).count().get()`, which is all the counters use. */
function queryRef(collectionName: string, clauses: [string, unknown][] = [], cap?: number) {
  const api = {
    where(field: string, _op: string, value: unknown) {
      return queryRef(collectionName, [...clauses, [field, value]], cap);
    },
    limit(count: number) {
      return queryRef(collectionName, clauses, count);
    },
    matches() {
      const rows = [...collectionMap(collectionName).values()].filter((row) =>
        clauses.every(([field, value]) => row[field] === value));
      return cap === undefined ? rows : rows.slice(0, cap);
    },
    count() {
      return { get: async () => ({ data: () => ({ count: api.matches().length }) }) };
    },
    async get() {
      const rows = api.matches();
      return { size: rows.length, empty: rows.length === 0, docs: rows.map((row) => ({ data: () => row })) };
    },
  };
  return api;
}

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => SERVER_TIMESTAMP,
    delete: () => DELETE_SENTINEL,
  },
  Timestamp: { fromDate: (date: Date) => ({ toDate: () => date }) },
}));

vi.mock('@/lib/firebase/admin', () => ({
  // Only token verification is stubbed. Everything downstream — the rate limiter, the
  // account-class check, the capability projection lookup — runs for real against the store
  // above, which is the part worth exercising.
  adminAuth: {
    verifyIdToken: vi.fn(async () => ({
      uid: 'operator_1',
      role: 'platform_admin',
      accountClass: 'platform_operator',
    })),
  },
  adminDb: {
    collection: (name: string) => ({
      doc: (id?: string) => docRef(name, id ?? `${name}_${nowCounter++}`),
      where: (field: string, op: string, value: unknown) => queryRef(name).where(field, op, value),
      add: async (data: Record<string, unknown>) => {
        const id = `${name}_${nowCounter++}`;
        collectionMap(name).set(id, applyWrite({}, data));
        return { id };
      },
    }),
    runTransaction: async (handler: (tx: unknown) => Promise<unknown>) => handler({
      get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
      set: async (ref: { set: (d: Record<string, unknown>, o?: unknown) => Promise<void> }, data: Record<string, unknown>, options?: unknown) =>
        ref.set(data, options as { merge?: boolean }),
    }),
  },
}));

const OPERATOR = 'operator_1';

const { POST: networkPost } = await import('./network/route');
const { POST: sitePost, GET: siteGet } = await import('./site/route');

function post(handler: (request: Request) => Promise<Response>, url: string, body: unknown) {
  return handler(new Request(`https://goalplace256.test${url}`, {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

async function json(response: Response) {
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function auditActions() {
  return [...collectionMap('adminAuditEvents').values()].map((event) => event.action as string);
}

describe('platform admin console, end to end', () => {
  beforeEach(() => {
    store.clear();
    nowCounter = 0;
    // The operator's real account and capability projection. securePlatformCommand reads
    // both, so getting these wrong is itself part of what the smoke proves.
    collectionMap('users').set(OPERATOR, { accountClass: 'platform_operator', accountStatus: 'active' });
    collectionMap('accessIndex').set(`platform_global_${OPERATOR}`, {
      capabilities: ['platform.network.manage', 'platform.athlete.manage', 'platform.site.manage', 'platform.audit.read'],
    });
  });

  it('walks create league → team → athlete → archive → refused delete → settings conflict', async () => {
    // 1. A league. Created as a draft, never live.
    const league = await json(await post(networkPost, '/api/platform/network', {
      command: 'createLeague',
      reason: 'Onboarding the Kampala schools competition.',
      name: 'Kampala Schools League',
      sport: 'football',
      city: 'Kampala',
    }));
    expect(league.status).toBe(200);
    expect(league.body.lifecycleStatus).toBe('draft');
    const leagueId = league.body.id as string;
    expect(collectionMap('leagues').get(leagueId)?.publiclyVisible).toBe(false);

    // 2. A club inside it, inheriting the league's sport rather than asking for it again.
    const team = await json(await post(networkPost, '/api/platform/network', {
      command: 'createTeam',
      reason: 'First club confirmed for the schools league.',
      name: 'Makerere College',
      leagueId,
      city: 'Kampala',
    }));
    expect(team.status).toBe(200);
    const teamId = team.body.id as string;
    expect(collectionMap('teams').get(teamId)?.sport).toBe('football');

    // 3. An athlete in the club — a managed profile, with no user account attached.
    const athlete = await json(await post(networkPost, '/api/platform/network', {
      command: 'createAthlete',
      reason: 'Roster submitted by the club.',
      name: 'Martha Nansubuga',
      teamId,
      position: 'Midfielder',
      ageGroup: 'U18',
    }));
    expect(athlete.status).toBe(200);
    const athleteId = athlete.body.id as string;
    const athleteRow = collectionMap('athletes').get(athleteId)!;
    expect(athleteRow.userId).toBeUndefined();
    expect(athleteRow.leagueId).toBe(leagueId);

    // 4. Archiving the club hides it without destroying anything.
    const archived = await json(await post(networkPost, '/api/platform/network', {
      command: 'lifecycle',
      reason: 'Club withdrew before the season started.',
      kind: 'team',
      id: teamId,
      action: 'archive',
    }));
    expect(archived.status).toBe(200);
    expect(archived.body.lifecycleStatus).toBe('archived');
    const teamRow = collectionMap('teams').get(teamId)!;
    expect(teamRow.publiclyVisible).toBe(false);
    // The athlete is untouched. Archiving is not a cascade.
    expect(collectionMap('athletes').get(athleteId)).toBeDefined();

    // 5. Deleting it outright is refused, and the refusal names what is attached.
    const refused = await json(await post(networkPost, '/api/platform/network', {
      command: 'lifecycle',
      reason: 'Tidying up the club that withdrew.',
      kind: 'team',
      id: teamId,
      action: 'hard_delete',
    }));
    expect(refused.status).toBeGreaterThanOrEqual(400);
    const message = String(refused.body.error);
    expect(message).toContain('Archive it instead');
    expect(message).toContain('athlete profile');   // the athlete still belongs to it
    expect(message).toContain('is archived');       // and it is no longer a draft
    // Refused means nothing was written.
    expect(collectionMap('teams').get(teamId)).toBeDefined();

    // 6. Every step left an audit entry, and the refusal left none.
    expect(auditActions()).toEqual([
      'platform.network.createLeague',
      'platform.network.createTeam',
      'platform.athlete.createProfile',
      'platform.network.archiveTeam',
    ]);
    const archiveEvent = [...collectionMap('adminAuditEvents').values()]
      .find((event) => event.action === 'platform.network.archiveTeam')!;
    expect(archiveEvent.actorUserId).toBe(OPERATOR);
    expect(archiveEvent.note).toBe('Club withdrew before the season started.');
    expect(archiveEvent.beforeSummary).toEqual({ lifecycleStatus: 'draft' });
    expect(archiveEvent.afterSummary).toEqual({ lifecycleStatus: 'archived' });
  });

  it('refuses a hard delete of a draft only once something is attached to it', async () => {
    // The other half of the rule: a genuine mistake, created and removed with nothing on it.
    const league = await json(await post(networkPost, '/api/platform/network', {
      command: 'createLeague',
      reason: 'Created in error during a demo.',
      name: 'Typo League',
      sport: 'football',
      city: 'Jinja',
    }));
    const leagueId = league.body.id as string;

    const deleted = await json(await post(networkPost, '/api/platform/network', {
      command: 'lifecycle',
      reason: 'Created by mistake, nothing attached.',
      kind: 'league',
      id: leagueId,
      action: 'hard_delete',
    }));
    expect(deleted.status).toBe(200);
    expect(collectionMap('leagues').get(leagueId)).toBeUndefined();
    // The audit entry outlives the row it describes.
    expect(auditActions()).toContain('platform.network.deleteLeague');
  });

  it('refuses a settings save made against a version somebody else has moved past', async () => {
    const first = await json(await post(sitePost, '/api/platform/site', {
      reason: 'Closing registration for the schools window.',
      expectedVersion: 0,
      patch: { registrationOpen: false },
    }));
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(1);

    // A second operator still holding version 0. Without the check their save would carry
    // stale values for every field they did not touch and silently revert the first change.
    const stale = await json(await post(sitePost, '/api/platform/site', {
      reason: 'Hiding fantasy for the beta window.',
      expectedVersion: 0,
      patch: { fantasyVisible: false },
    }));
    expect(stale.status).toBeGreaterThanOrEqual(400);
    expect(String(stale.body.error)).toContain('changed while you were editing');
    // The first operator's change survived.
    const current = await json(await siteGet(new Request('https://goalplace256.test/api/platform/site', {
      headers: { authorization: 'Bearer token' },
    })));
    expect(current.body.registrationOpen).toBe(false);
    expect(current.body.fantasyVisible).toBe(true);
  });

  it('refuses a governed switch outright rather than ignoring it', async () => {
    // Reaching the settings route at all with `finalizerMode` should be a loud failure, not
    // a save that silently drops the key and reports success.
    const governed = await json(await post(sitePost, '/api/platform/site', {
      reason: 'Trying to enable the finalizer from settings.',
      expectedVersion: 0,
      patch: { finalizerMode: 'enabled' },
    }));
    expect(governed.status).toBe(400);
    expect(collectionMap('adminAuditEvents').size).toBe(0);
  });

  it('refuses every command from an operator without the capability', async () => {
    collectionMap('accessIndex').set(`platform_global_${OPERATOR}`, { capabilities: ['platform.audit.read'] });
    const attempted = await json(await post(networkPost, '/api/platform/network', {
      command: 'createLeague',
      reason: 'Should not be permitted.',
      name: 'Unauthorized League',
      sport: 'football',
      city: 'Gulu',
    }));
    expect(attempted.status).toBe(403);
    expect(String(attempted.body.error)).toContain('platform.network.manage');
    expect(collectionMap('leagues').size).toBe(0);
  });
});
