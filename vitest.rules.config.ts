import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Security rules suite. Separate from the unit suite because it needs the Firestore
 * emulator (and therefore a JVM), and runs an order of magnitude slower.
 *
 *   npm run test:rules
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/rules/**/*.test.ts'],
    // Rules tests share one emulator and clear it between cases, so they cannot run in
    // parallel without clobbering each other.
    fileParallelism: false,
    /**
     * 60s, not 20s, because of one case.
     *
     * `storage.rules.test.ts` uploads 16 MB to the Storage emulator to prove the match-evidence
     * size ceiling rejects it. That case passes in a few seconds on an idle machine and timed
     * out at 20s once inside a full `deploy:ready` chain, where the JVM was competing with a
     * Next build. On a shared CI runner that contention is the normal condition, not the
     * exception.
     *
     * Raising the ceiling does not weaken anything: a genuinely hanging test still fails, just
     * later. A flaky gate that people learn to re-run is worse than a slow one.
     */
    testTimeout: 60000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
