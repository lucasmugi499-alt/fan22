import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GOALPLACE_DATABASE_ID, resolveDatabaseId } from './firestoreTarget';

/**
 * The bug this file exists to keep dead.
 *
 * The V1 drain report, the straggler migration, the sunset invariants and the field capture
 * canary each initialized with a bare `getFirestore()`, which asks for `(default)`. No
 * GoalPlace project has a `(default)` database — the demo project's
 * `firestore:databases:list` returns `fg256` and nothing else.
 *
 * On this project that fails loudly with `5 NOT_FOUND`. On any project that DOES have an
 * empty `(default)`, every count in the drain report reads zero and its verdict line reads
 * `Safe to retire team authority: YES`. The gate would pass by measuring nothing.
 */
describe('migration script Firestore target', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('never resolves to (default) implicitly', () => {
    delete process.env.GOALPLACE_FIRESTORE_DATABASE_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID;
    expect(resolveDatabaseId([])).toBe(GOALPLACE_DATABASE_ID);
    expect(resolveDatabaseId([])).not.toBe('(default)');
  });

  it('prefers the flag, then the environment', () => {
    process.env.GOALPLACE_FIRESTORE_DATABASE_ID = 'from_env';
    expect(resolveDatabaseId(['--database', 'from_flag'])).toBe('from_flag');
    expect(resolveDatabaseId(['--database=from_inline'])).toBe('from_inline');
    expect(resolveDatabaseId([])).toBe('from_env');
  });

  it('still reaches (default) when it is asked for by name', () => {
    // Not forbidden, just never implicit. A deliberate choice stays available.
    expect(resolveDatabaseId(['--database', '(default)'])).toBe('(default)');
  });

  /**
   * The migration and canary scripts must go through the shared resolver.
   *
   * Asserted on the source text because the failure is an ABSENCE — a script that quietly
   * initializes its own connection passes every behavioural test it has while reading the
   * wrong database. There is nothing to call and assert on; there is only the line that
   * should not be there.
   */
  it.each([
    'scripts/access/v1-drain-report.ts',
    'scripts/access/migrate-v1-workflow.ts',
    'scripts/access/team-sunset-invariants.ts',
    'scripts/release/field-capture-canary.ts',
  ])('%s resolves its database through the shared target', (path) => {
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('initializeMigrationFirestore');
    // Comments stripped first. Each of these files now DESCRIBES the defect in prose, and a
    // check that cannot tell an explanation from a call would fail on the explanation.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/getFirestore\(\s*\)/);
  });
});
