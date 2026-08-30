import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { requiredIndexes } from './discovery-indexes';

/**
 * Every filter combination `/api/discover` will build must have an index declared.
 *
 * Firestore needs a composite index for each combination of equality filters plus an order.
 * Discovery offers three optional filters over four collections, and the failure mode when one
 * is missing is nasty rather than obvious: the query works for every combination somebody
 * happened to try and returns `FAILED_PRECONDITION` for the one they did not. A visitor picks
 * a sport and a region together for the first time and the tab goes blank.
 *
 * This is not a hypothetical. The first live test of this feature returned
 * "Discovery is temporarily unavailable" for `sport=football&verified=true`, because the
 * indexes had been generated into `firestore.indexes.json` and not yet deployed. The generator
 * was right and the deploy had not happened — which is the other half of the same lesson: a
 * declared index is not a deployed one.
 */

const declared = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')) as {
  indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order: string }> }>;
};

function signature(index: {
  collectionGroup: string;
  fields: Array<{ fieldPath: string; order: string }>;
}) {
  return `${index.collectionGroup}:${index.fields.map((f) => `${f.fieldPath}/${f.order}`).join(',')}`;
}

describe('the indexes discovery needs', () => {
  it('covers every combination of the filters it offers', () => {
    // 2^3 - 1 combinations for the three collections with all three filters, plus one for
    // matches, which offers sport only.
    expect(requiredIndexes()).toHaveLength(7 * 3 + 1);
  });

  it('is fully declared in firestore.indexes.json', () => {
    const present = new Set(declared.indexes.map(signature));
    const missing = requiredIndexes().filter((index) => !present.has(signature(index)));
    expect(missing.map(signature)).toEqual([]);
  });

  it('puts equality filters before the order field, which is what Firestore requires', () => {
    for (const index of requiredIndexes()) {
      const orderField = index.fields.at(-1);
      expect(orderField?.order).toBe('DESCENDING');
      // Every field before the last is an equality filter, and those are ascending.
      index.fields.slice(0, -1).forEach((field) => expect(field.order).toBe('ASCENDING'));
    }
  });

  it('orders leagues by the index, so unrated ones sort last', () => {
    // Firestore sorts `null` last in a descending order, which is the same rule
    // `indexSortValue` applies on the client. Ordering ascending would float every unrated
    // league to the top of discovery — the unearned prominence the constant 45 used to give.
    const leagueIndexes = requiredIndexes().filter((i) => i.collectionGroup === 'leagues');
    expect(leagueIndexes.length).toBeGreaterThan(0);
    leagueIndexes.forEach((index) => {
      expect(index.fields.at(-1)).toEqual({ fieldPath: 'goalPlaceIndex', order: 'DESCENDING' });
    });
  });

  it('does not offer a city or verified filter on matches', () => {
    // A match's city is the venue's. A fan filtering by city means "clubs from my city", not
    // "matches played in a stadium that happens to be there".
    const matchIndexes = requiredIndexes().filter((i) => i.collectionGroup === 'matches');
    const fields = new Set(matchIndexes.flatMap((i) => i.fields.map((f) => f.fieldPath)));
    expect(fields.has('city')).toBe(false);
    expect(fields.has('verified')).toBe(false);
  });

  it('declares no duplicate index', () => {
    const signatures = requiredIndexes().map(signature);
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});
