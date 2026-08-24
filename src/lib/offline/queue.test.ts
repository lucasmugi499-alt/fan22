import { describe, expect, it } from 'vitest';
import { createMemoryQueueStore, createOfflineQueue } from './queue';

function queue(matchId = 'match_1') {
  let counter = 0;
  const store = createMemoryQueueStore();
  return {
    store,
    make: () => createOfflineQueue<{ type: string }>({
      matchId,
      store,
      now: () => new Date('2026-08-24T15:00:00.000Z'),
      newId: () => `evt_${(counter += 1)}`,
    }),
  };
}

describe('the field capture outbox', () => {
  it('gives every entry a monotonic sequence', async () => {
    const q = queue().make();

    await q.append({ type: 'goal' });
    await q.append({ type: 'yellow_card' });
    await q.append({ type: 'goal' });

    expect((await q.all()).map((entry) => entry.clientSequence)).toEqual([1, 2, 3]);
  });

  /**
   * The rule the whole design turns on. If undo deleted the queued entry, the sequence would
   * gain a hole and the server would report a phantom missing event on every corrected goal,
   * which is a blocking exception on a match that was captured correctly.
   */
  it('supersedes rather than removes, so the sequence never gains a hole', async () => {
    const q = queue().make();

    const goal = await q.append({ type: 'goal' });
    await q.supersede(goal.clientEventId, { type: 'goal_corrected' });

    const all = await q.all();
    expect(all.map((entry) => entry.clientSequence)).toEqual([1, 2]);
    expect(all[0]).toMatchObject({ clientEventId: 'evt_1', payload: { type: 'goal' } });
    expect(all[1]).toMatchObject({ supersedesClientEventId: 'evt_1' });
    expect(await q.sequenceGaps()).toEqual([]);
  });

  it('reports a gap when one genuinely exists', async () => {
    const { store, make } = queue();
    const q = make();
    await q.append({ type: 'goal' });
    // Written straight past the queue, as a lost event would appear to the server.
    await store.put({
      clientEventId: 'evt_hole',
      clientSequence: 3,
      matchId: 'match_1',
      payload: { type: 'goal' },
      deviceTime: '2026-08-24T15:00:00.000Z',
      syncState: 'pending',
    });

    expect(await q.sequenceGaps()).toEqual([2]);
  });

  /**
   * A force quit mid-match is ordinary on a cheap phone with battery saver on. A counter held
   * in memory would restart at 1 and every subsequent event would collide with one already
   * sent, which the server would deduplicate into silence.
   */
  it('resumes the sequence after a restart rather than starting again', async () => {
    const { store, make } = queue();
    const before = make();
    await before.append({ type: 'goal' });
    await before.append({ type: 'goal' });

    // A completely new queue object over the same storage: the app reopened.
    const after = createOfflineQueue<{ type: string }>({ matchId: 'match_1', store, newId: () => 'evt_restart' });
    const resumed = await after.append({ type: 'goal' });

    expect(resumed.clientSequence).toBe(3);
    expect(await after.sequenceGaps()).toEqual([]);
  });

  it('keeps one entry per clientEventId, so a retried write is not a second event', async () => {
    const q = queue().make();

    await q.append({ type: 'goal' }, { clientEventId: 'fixed' });
    await q.append({ type: 'goal' }, { clientEventId: 'fixed' });

    expect(await q.all()).toHaveLength(1);
  });

  it('tracks what still needs to reach the server', async () => {
    const q = queue().make();
    const first = await q.append({ type: 'goal' });
    await q.append({ type: 'yellow_card' });

    await q.markSynced([first.clientEventId]);

    expect((await q.pending()).map((entry) => entry.clientEventId)).toEqual(['evt_2']);
    // Marking synced is not removal: the entry stays, so the sequence stays whole.
    expect(await q.all()).toHaveLength(2);
  });

  it('keeps matches separate', async () => {
    const store = createMemoryQueueStore();
    const one = createOfflineQueue({ matchId: 'match_1', store, newId: () => 'a' });
    const two = createOfflineQueue({ matchId: 'match_2', store, newId: () => 'b' });

    await one.append({ type: 'goal' });
    const other = await two.append({ type: 'goal' });

    // Sequences are per match, so two matches captured on one device do not interleave.
    expect(other.clientSequence).toBe(1);
    expect(await one.all()).toHaveLength(1);
  });

  it('records device time as an observation and nothing else', async () => {
    const q = queue().make();
    const entry = await q.append({ type: 'goal' });

    // Present, and deliberately not the game clock: that is derived from the server anchor.
    expect(entry.deviceTime).toBe('2026-08-24T15:00:00.000Z');
    expect(entry).not.toHaveProperty('gameClockMs');
  });
});
