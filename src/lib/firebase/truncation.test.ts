import { describe, expect, it } from 'vitest';
import { truncatedCollections } from './useGoalPlaceData';

/**
 * Every operator directory loads a fixed number of records and filters them in the browser —
 * 120 to 700 depending on the screen. At demo scale that is the whole catalogue. At 1.8 million
 * athletes it is the first 500, and nothing on the screen says so: an admin searching a
 * directory that silently holds 500 of 1.8 million will conclude the athlete is not registered.
 *
 * That is the same class of failure as a league table computed from a truncated match list,
 * on a different surface. This does not paginate those directories. It stops them presenting a
 * slice as the whole.
 */

describe('detecting a list that is probably not all of it', () => {
  it('flags a collection that came back exactly at its limit', () => {
    // `>=`, not `>`, and this is the case that matters: Firestore returned as many documents
    // as it was asked for, so there is no way to know whether more existed. Treating that as
    // complete is the assumption that made the league table silently wrong.
    expect(truncatedCollections({ athletes: new Array(500).fill(0) }, 500)).toEqual(['athletes']);
  });

  it('leaves a collection that came back short', () => {
    expect(truncatedCollections({ athletes: new Array(499).fill(0) }, 500)).toEqual([]);
  });

  it('names each short collection, so a screen with three lists can say which one', () => {
    const items = {
      athletes: new Array(500).fill(0),
      teams: new Array(12).fill(0),
      leagues: new Array(500).fill(0),
    };
    expect(truncatedCollections(items, 500)).toEqual(['athletes', 'leagues']);
  });

  it('flags nothing when no limit was applied', () => {
    // A caller that loaded without a limit holds everything there is, so there is no cap to
    // disclose and claiming one would be its own small lie.
    expect(truncatedCollections({ athletes: new Array(9_000).fill(0) }, undefined)).toEqual([]);
  });

  it('ignores non-array values on the result object', () => {
    // The hook's return carries `loading`, `error`, `retry` and friends alongside the
    // collections; a length check that did not guard would read `retry.length` as 0.
    const items = { athletes: new Array(3).fill(0), loading: false, retry: () => {}, source: 'firebase' };
    expect(truncatedCollections(items, 3)).toEqual(['athletes']);
  });

  it('handles an empty result under a zero-ish limit without claiming truncation', () => {
    expect(truncatedCollections({ athletes: [] }, 0)).toEqual([]);
  });
});
