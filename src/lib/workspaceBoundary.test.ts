import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The application test suite must run on a clean `npm ci` alone.
 *
 * `functions/` is a separate npm package with its own lockfile, and its dependencies are
 * NOT installed by a root install. A file under `src/` that imports a functions module
 * pulling in `firebase-functions` therefore passes on a warmed workspace and fails on a
 * fresh clone — which is worse than failing outright, because every "gate green" claim
 * made on a developer machine is then unverified.
 *
 * That is exactly what happened: `src/lib/finalizerMode.test.ts` imported
 * `functions/src/finalizerMode.ts` for `defineString`, so `npm ci && npm test` failed on a
 * fresh unzip while passing locally. The shared logic now lives in
 * `src/server/finalizerActivation.ts` and the Functions package imports IT, not the
 * reverse.
 *
 * Importing functions source is not banned outright — `searchIndex` depends only on
 * `firebase-admin`, which is a root dependency, so it is safe. The rule is the budget: a
 * NEW cross-boundary import has to be justified here, against this failure mode.
 */
const ALLOWED_CROSS_BOUNDARY_IMPORTS = new Set([
  // Depends only on firebase-admin, which the root package installs.
  'src/lib/search/searchIndexChange.test.ts',
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
  });
}

describe('application code does not depend on the Functions package install', () => {
  it('has no unbudgeted import of functions/ from src/', () => {
    const offenders = walk('src')
      .filter((file) => /from\s+'[^']*functions\/src/.test(readFileSync(file, 'utf8')))
      .map((file) => file.split(path.sep).join('/'))
      .filter((file) => !ALLOWED_CROSS_BOUNDARY_IMPORTS.has(file));

    expect(offenders).toEqual([]);
  });
});
