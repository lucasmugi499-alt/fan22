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
    testTimeout: 20000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
