import { describe, expect, it } from 'vitest';
import { MAX_LEAGUES_PER_PASS, mapWithConcurrency } from './projection';

/**
 * The index pass rebuilds leagues with bounded concurrency.
 *
 * Sequentially it was four Firestore round trips per league, one league at a time, inside a
 * 300s function timeout shared with the access expiry and projection repairs. That put 1,000
 * leagues past the budget, which is why the window was 200 — and at 200/hour a 10,000-league
 * catalogue takes fifty hours to come round.
 *
 * Unbounded is the other wrong answer: `Promise.all` over a thousand leagues opens four
 * thousand concurrent queries, which is a self-inflicted load spike on the database the rest
 * of the product is trying to serve.
 */

describe('bounded concurrent mapping', () => {
  it('returns results in input order, not completion order', async () => {
    // The pass counts outcomes positionally. Results arriving in completion order would still
    // produce the right totals and would be a trap for the next thing that reads them.
    const out = await mapWithConcurrency([50, 10, 30, 0], 4, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return delay;
    });
    expect(out).toEqual([50, 10, 30, 0]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 50 }, (_, i) => i), 5, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(5);
  });

  it('processes every item exactly once', async () => {
    const seen: number[] = [];
    await mapWithConcurrency(Array.from({ length: 200 }, (_, i) => i), 8, async (n) => {
      seen.push(n);
      return n;
    });
    expect(seen).toHaveLength(200);
    expect(new Set(seen).size).toBe(200);
  });

  it('keeps every worker busy rather than waiting on the slowest in a batch', async () => {
    // The reason this is a worker queue and not chunked `Promise.all`. League cost varies by
    // an order of magnitude between a two-fixture league and a full season, so a chunked
    // version runs at the speed of the slowest league in each chunk.
    const order: number[] = [];
    await mapWithConcurrency([40, 1, 1, 1, 1], 2, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      order.push(delay);
      return delay;
    });
    // The three fast items behind the slow one finished before it did.
    expect(order[order.length - 1]).toBe(40);
  });

  it('handles fewer items than workers', async () => {
    expect(await mapWithConcurrency([1, 2], 10, async (n) => n * 2)).toEqual([2, 4]);
  });

  it('handles an empty list without hanging', async () => {
    expect(await mapWithConcurrency([], 5, async (n) => n)).toEqual([]);
  });
});

describe('how long the rotation takes to come round', () => {
  it('reaches a 10,000-league catalogue in hours, not days', () => {
    // 200/hour was fifty hours. The window is what turns "every league is eventually rated"
    // from technically true into operationally true.
    const passes = Math.ceil(10_000 / MAX_LEAGUES_PER_PASS);
    expect(passes).toBeLessThanOrEqual(10);
  });
});
