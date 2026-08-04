import { describe, expect, it, vi } from 'vitest';
import { applySearchIndexChange } from '../../../functions/src/searchIndex';

/**
 * Covers the incremental index update the Firestore triggers perform.
 *
 * Tested from the application suite rather than the Functions package so it runs in the
 * normal `npm test` pass; the module itself has no firebase-functions dependency.
 */

type Stored = Record<string, Record<string, unknown>>;

function fakeDb(initial: Stored = {}) {
  const store: Stored = { ...initial };
  const deleted: string[] = [];
  const db = {
    collection: () => ({
      doc: (id: string) => ({
        get: vi.fn(async () => ({
          exists: Boolean(store[id]),
          data: () => store[id],
        })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          store[id] = value;
        }),
        delete: vi.fn(async () => {
          delete store[id];
          deleted.push(id);
        }),
      }),
    }),
  };
  return { db, store, deleted };
}

const ATHLETE = { name: 'Priscilla Nakato', position: 'Striker', city: 'Kampala', sport: 'football' };

describe('applySearchIndexChange', () => {
  it('writes an entry for a newly created entity', async () => {
    const { db, store } = fakeDb();

    const outcome = await applySearchIndexChange(db as never, 'athlete', 'athlete_1', ATHLETE);

    // Without this the athlete would be invisible in search until someone remembered to
    // rebuild the index — a silent gap, with nothing erroring.
    expect(outcome).toBe('written');
    expect(store.athlete_athlete_1).toMatchObject({ title: 'Priscilla Nakato' });
  });

  it('does nothing when no searchable field changed', async () => {
    const { db, store } = fakeDb();
    await applySearchIndexChange(db as never, 'athlete', 'athlete_1', ATHLETE);

    const outcome = await applySearchIndexChange(db as never, 'athlete', 'athlete_1', {
      ...ATHLETE,
      // A stat update is not a search-relevant change.
      goalPlacePoints: 42,
    });

    expect(outcome).toBe('unchanged');
    expect(store.athlete_athlete_1).toBeDefined();
  });

  it('rewrites the entry when a searchable field changes', async () => {
    const { db, store } = fakeDb();
    await applySearchIndexChange(db as never, 'athlete', 'athlete_1', ATHLETE);

    const outcome = await applySearchIndexChange(db as never, 'athlete', 'athlete_1', {
      ...ATHLETE,
      name: 'Priscilla Nabirye',
    });

    expect(outcome).toBe('written');
    expect(store.athlete_athlete_1.title).toBe('Priscilla Nabirye');
    expect(store.athlete_athlete_1.tokens).toContain('nabirye');
  });

  it('deletes the entry when the entity is deleted', async () => {
    const { db, deleted } = fakeDb();
    await applySearchIndexChange(db as never, 'athlete', 'athlete_1', ATHLETE);

    const outcome = await applySearchIndexChange(db as never, 'athlete', 'athlete_1', undefined);

    // A deleted athlete must stop being findable, not linger in discovery.
    expect(outcome).toBe('deleted');
    expect(deleted).toContain('athlete_athlete_1');
  });

  it('deletes the entry when the entity loses the field that made it searchable', async () => {
    const { db, deleted } = fakeDb();
    await applySearchIndexChange(db as never, 'athlete', 'athlete_1', ATHLETE);

    const outcome = await applySearchIndexChange(db as never, 'athlete', 'athlete_1', { city: 'Kampala' });

    expect(outcome).toBe('deleted');
    expect(deleted).toContain('athlete_athlete_1');
  });

  it('reports unchanged when deleting something that was never indexed', async () => {
    const { db, deleted } = fakeDb();

    const outcome = await applySearchIndexChange(db as never, 'team', 'team_1', undefined);

    expect(outcome).toBe('unchanged');
    expect(deleted).toHaveLength(0);
  });
});
