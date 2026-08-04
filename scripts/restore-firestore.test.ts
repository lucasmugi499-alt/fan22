import { describe, expect, it } from 'vitest';
import { assertRestoreTargetMatches, collectionPathFromFile } from './restore-firestore';

const MANIFEST = {
  projectId: 'manifest-quasar-479416-s7',
  databaseId: 'fg256',
  environment: 'demo',
  takenAt: '2026-08-04T00:00:00.000Z',
  totalDocuments: 10,
  collections: [],
};

describe('restore target guard', () => {
  it('accepts a restore back into the project the backup came from', () => {
    expect(() => assertRestoreTargetMatches(MANIFEST, 'manifest-quasar-479416-s7', 'fg256')).not.toThrow();
  });

  it('refuses to restore a demo backup into another project', () => {
    // The failure this prevents: a demo dataset landing in production because a flag
    // was wrong. Recovery is exactly when someone is moving fast under pressure.
    expect(() => assertRestoreTargetMatches(MANIFEST, 'goalplace256-prod', 'fg256'))
      .toThrow(/Refusing to restore across environments/);
  });

  it('refuses a database that does not match the backup', () => {
    expect(() => assertRestoreTargetMatches(MANIFEST, 'manifest-quasar-479416-s7', '(default)'))
      .toThrow(/does not match target/);
  });

  it('names both mismatches rather than only the first', () => {
    expect(() => assertRestoreTargetMatches(MANIFEST, 'other-project', 'other-db'))
      .toThrow(/other-project.*other-db|other-db.*other-project/s);
  });
});

describe('collectionPathFromFile', () => {
  it('recovers a root collection path', () => {
    expect(collectionPathFromFile('athletes.json')).toBe('athletes');
  });

  it('recovers a subcollection path from the encoded filename', () => {
    expect(collectionPathFromFile('resultSubmissions__match_1__events.json'))
      .toBe('resultSubmissions/match_1/events');
  });
});
