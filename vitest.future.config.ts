import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * The normal suite, run 400 days from now. See src/test/shift-clock.ts for why.
 */
export default mergeConfig(base, defineConfig({
  test: { setupFiles: ['./src/test/shift-clock.ts'] },
}));
