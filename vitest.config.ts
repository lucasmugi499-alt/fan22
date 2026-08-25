import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    // Cleanup-script guards live outside src but are safety-critical, so they run with the
    // normal suite rather than needing a separate command.
    // functions/** was absent, so the trusted runtime that writes official results and sends
    // operator notifications had no unit coverage at all.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'functions/src/**/*.test.ts'],
    /*
     * Both excluded suites need the Firestore emulator, and both are run by `deploy:ready`
     * through their own commands: `npm run test:rules` and `npm run test:integration`. Leaving
     * them here would make the fast suite fail on a machine with no emulator running, which
     * teaches people to ignore it.
     */
    exclude: ['src/rules/**', 'src/server/finalization/integration/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Next resolves `server-only` at compile time; it is not an installed package, so
      // any test that reaches a server module needs a stand-in.
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
});
