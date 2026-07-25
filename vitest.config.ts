import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    // Cleanup-script guards live outside src but are safety-critical, so they run with the
    // normal suite rather than needing a separate command.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Rules tests need the Firestore emulator; run them with `npm run test:rules`.
    exclude: ['src/rules/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
