import { describe, expect, it } from 'vitest';
import { standingZoneFor, standingZones } from './sportPresentation';

/**
 * The bands were hardcoded to "top 4" and "bottom 3", which broke down on the table size
 * this platform actually has most of: ten of seventeen competitions field four clubs.
 */
describe('standingZones', () => {
  it('marks nothing in a four-club table', () => {
    // The reported bug: every rank satisfied `rank <= 4`, so the whole table rendered in
    // qualification green and second place read "Top four".
    expect(standingZones(4)).toEqual({ qualify: 0, relegate: 0 });
    for (const rank of [1, 2, 3, 4]) {
      expect(standingZoneFor(rank, 4)).toBeNull();
    }
  });

  it('marks nothing up to five clubs, where a band would cover the whole table', () => {
    expect(standingZones(5)).toEqual({ qualify: 0, relegate: 0 });
    expect(standingZoneFor(1, 5)).toBeNull();
    expect(standingZoneFor(5, 5)).toBeNull();
  });

  it('keeps a middle in a mid-sized table', () => {
    expect(standingZones(8)).toEqual({ qualify: 2, relegate: 1 });
    expect(standingZoneFor(1, 8)).toBe('qualify');
    expect(standingZoneFor(2, 8)).toBe('qualify');
    expect(standingZoneFor(3, 8)).toBeNull();
    expect(standingZoneFor(7, 8)).toBeNull();
    expect(standingZoneFor(8, 8)).toBe('relegate');
  });

  it('preserves the original bands at ten clubs and above', () => {
    // The size the 4/3 split was chosen for; the six larger leagues must not shift.
    expect(standingZones(10)).toEqual({ qualify: 4, relegate: 3 });
    expect(standingZoneFor(4, 10)).toBe('qualify');
    expect(standingZoneFor(5, 10)).toBeNull();
    expect(standingZoneFor(7, 10)).toBeNull();
    expect(standingZoneFor(8, 10)).toBe('relegate');
    expect(standingZoneFor(10, 10)).toBe('relegate');
  });

  it('never lets the bands overlap or swallow the table', () => {
    for (let rowCount = 1; rowCount <= 24; rowCount += 1) {
      const { qualify, relegate } = standingZones(rowCount);
      const banded = qualify + relegate;
      // A band that covers everything is what produced the original defect.
      expect(banded).toBeLessThan(rowCount);
      const ranks = Array.from({ length: rowCount }, (_, i) => standingZoneFor(i + 1, rowCount));
      expect(ranks.filter((z) => z === 'qualify')).toHaveLength(qualify);
      expect(ranks.filter((z) => z === 'relegate')).toHaveLength(relegate);
    }
  });

  it('handles an empty table without inventing a band', () => {
    expect(standingZones(0)).toEqual({ qualify: 0, relegate: 0 });
    expect(standingZoneFor(1, 0)).toBeNull();
  });
});
