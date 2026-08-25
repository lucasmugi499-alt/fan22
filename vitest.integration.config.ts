import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Finalization integration suite. Separate from the unit suite because it needs the Firestore
 * emulator, and separate from the rules suite because it exercises the Admin SDK rather than
 * client rules.
 *
 * This is where the transaction itself is proven. The unit suite runs the finalizer against a
 * fake database, which is right for the planning logic and useless for the question that
 * matters here: does a real Firestore transaction commit these writes atomically, and does a
 * redelivered trigger produce one official result rather than two. That crossing, from field
 * observation to official sporting truth, is the highest-integrity transition on the platform
 * and a fake db cannot speak to it.
 *
 *   npm run test:integration
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/server/finalization/integration/**/*.test.ts'],
    // One emulator, cleared between cases, so the files cannot clobber each other.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
