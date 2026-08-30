import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isCovered, queryShapesIn, uncoveredShapes } from './queryIndexCoverage';

/**
 * The standings index was missing for weeks and nothing caught it. Typecheck cannot see an
 * index requirement, the unit tests use a fake Firestore that has none, and the emulator does
 * not enforce them either — so the only place the requirement was real was production, and the
 * only signal was a club page quietly showing "No record yet" beside a league table that
 * showed the real numbers.
 */

describe('reading a query shape out of the source', () => {
  it('finds an equality filter combined with an ordering', () => {
    // Exactly the query that had no index.
    const shapes = queryShapesIn('provider.ts', `
      const constraints = [];
      await db.collection('standings')
        .where('leagueId', '==', leagueId)
        .orderBy('rank', 'asc')
        .limit(200)
        .get();
    `);
    expect(shapes).toEqual([
      expect.objectContaining({ collection: 'standings', fields: ['leagueId', 'rank'] }),
    ]);
  });

  it('finds an equality filter combined with a range on another field', () => {
    const shapes = queryShapesIn('route.ts', `
      db.collection('matches')
        .where('leagueId', '==', id)
        .where('scheduledAt', '>=', start)
        .get();
    `);
    expect(shapes[0].fields).toEqual(['leagueId', 'scheduledAt']);
  });

  it('ignores a lone equality filter, which needs no composite index', () => {
    expect(queryShapesIn('x.ts', `db.collection('teams').where('leagueId', '==', id).get();`))
      .toEqual([]);
  });

  it('ignores ordering by the same field it filters on', () => {
    expect(queryShapesIn('x.ts', `
      db.collection('matches').where('sport', '==', s).orderBy('sport').get();
    `)).toEqual([]);
  });

  it('stops at the terminal call, so a second query is not folded into the first', () => {
    const shapes = queryShapesIn('x.ts', `
      db.collection('teams').where('leagueId', '==', id).get();
      db.collection('athletes').orderBy('goalPlacePoints', 'desc').get();
    `);
    expect(shapes).toEqual([]);
  });
});

describe('a query built from a constraints array', () => {
  it('reads the collection name and the filters that never appear beside it', () => {
    /*
     * The shape the standings bug was written in. `firebaseProvider` builds a
     * `QueryConstraint[]` conditionally and hands it to `readCollection`, so a chained-builder
     * parser sees a collection with no filters and filters with no collection, and reports
     * nothing at all.
     */
    const shapes = queryShapesIn('firebaseProvider.ts', `
      async getStoredStandings(options) {
        const constraints: QueryConstraint[] = [];
        if (options?.leagueId) constraints.push(where('leagueId', '==', options.leagueId));
        if (options?.seasonId) constraints.push(where('seasonId', '==', options.seasonId));
        constraints.push(orderBy('rank', 'asc'));
        return readCollection<StoredStanding>('standings', constraints);
      },
    `);
    const fields = shapes.map((shape) => shape.fields.join(','));
    /*
     * Every combination, because each optional filter makes a different query and Firestore
     * matches an index by PREFIX. `[leagueId, seasonId, rank]` does not serve
     * `where(leagueId) + orderBy(rank)` — `seasonId` sits between the two — which is exactly
     * how a three-field index sat in the file looking like coverage for a query it could not
     * answer.
     */
    expect(fields).toContain('leagueId,rank');
    expect(fields).toContain('seasonId,rank');
    expect(fields).toContain('leagueId,seasonId,rank');
  });

  it('treats an if/else if chain as alternatives rather than combinations', () => {
    // Only one branch ever applies, so this is three queries needing three indexes — not one
    // index over all four fields, which would satisfy none of them.
    const shapes = queryShapesIn('firebaseProvider.ts', `
      async getAthleteClaims(options) {
        const constraints: QueryConstraint[] = [];
        if (options?.userId) constraints.push(where('requesterUserId', '==', options.userId));
        else if (options?.teamId) constraints.push(where('teamId', '==', options.teamId));
        else if (options?.leagueId) constraints.push(where('leagueId', '==', options.leagueId));
        constraints.push(orderBy('createdAt', 'desc'));
        return readCollection<AthleteClaim>('athleteClaims', constraints);
      },
    `);
    expect(shapes.map((shape) => shape.fields.join(',')).sort()).toEqual([
      'leagueId,createdAt', 'requesterUserId,createdAt', 'teamId,createdAt',
    ].sort());
  });

  it('does not inherit filters from the function above it', () => {
    // A fixed backward window bled across method boundaries and produced index shapes nobody
    // had written, which is the kind of noise that gets a check switched off.
    const shapes = queryShapesIn('provider.ts', `
      async getNotices(options) {
        const constraints = [];
        constraints.push(where('leagueId', '==', options.leagueId));
        constraints.push(orderBy('createdAt', 'desc'));
        return readCollection<Notice>('leagueNotices', constraints);
      },
      async getFinalizations() {
        return readCollection<Finalization>('finalizations');
      },
    `);
    expect(shapes.map((shape) => shape.collection)).toEqual(['leagueNotices']);
  });
});

describe('matching a shape against the declared indexes', () => {
  const indexes = [
    { collectionGroup: 'standings', fields: ['leagueId', 'rank'] },
    { collectionGroup: 'matches', fields: ['leagueId', 'scheduledAt'] },
    { collectionGroup: 'accessAssignments', fields: ['status', 'validUntil', '__name__'] },
  ];

  it('accepts a shape with an exact index', () => {
    expect(isCovered({ file: '', line: 1, collection: 'standings', fields: ['leagueId', 'rank'] }, indexes))
      .toBe(true);
  });

  it('accepts a shape whose equality filters are written in a different order', () => {
    // Firestore serves equality filters from any position in the prefix, and reporting a gap
    // every time somebody swaps two `where` calls is how a check gets ignored.
    expect(isCovered({ file: '', line: 1, collection: 'matches', fields: ['scheduledAt', 'leagueId'] }, indexes))
      .toBe(true);
  });

  it('rejects a shape with no index at all', () => {
    expect(isCovered({ file: '', line: 1, collection: 'mediaRecords', fields: ['moderationStatus', 'createdAt'] }, indexes))
      .toBe(false);
  });

  it('rejects a shape needing more fields than the index carries', () => {
    expect(isCovered({ file: '', line: 1, collection: 'standings', fields: ['leagueId', 'seasonId', 'rank'] }, indexes))
      .toBe(false);
  });

  it('ignores the __name__ tiebreaker Firestore appends', () => {
    // A real false alarm before this: the access-expiry query looked uncovered because its
    // index carried a trailing `__name__` the query never names.
    expect(isCovered(
      { file: '', line: 1, collection: 'accessAssignments', fields: ['status', 'validUntil'] },
      indexes,
    )).toBe(true);
  });
});

describe('this codebase', () => {
  it('declares an index for every query that needs one', () => {
    const uncovered = uncoveredShapes(
      ['src', 'functions/src'],
      readFileSync('firestore.indexes.json', 'utf8'),
    );
    expect(uncovered.map((shape) => `${shape.collection} [${shape.fields.join(', ')}] at ${shape.file}:${shape.line}`))
      .toEqual([]);
  });
});
