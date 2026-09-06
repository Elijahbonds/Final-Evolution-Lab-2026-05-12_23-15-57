import { defineConfig } from 'vitest/config';
import path from 'node:path';

// The bible's §7.6 gate is "vitest suite still green". This tree had vitest in
// three test files' imports but never in package.json, so that gate has never
// been runnable here — the checks were being run as standalone tsx scripts
// instead. This config makes the gate real: the pre-existing .test.ts files run,
// and the headless check scripts run alongside them as suites.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'scripts/**/*.suite.test.ts',
    ],
    // Babylon's NullEngine work and the 3000-sample statistical checks are not
    // fast; the default 5s timeout fails them for no good reason.
    testTimeout: 180_000,   // the headless check suites spawn a script with its own 120 s limit; under a sweep load a 60 s test timeout fired first (three false alarms 2026-09-05 and 06)
    hookTimeout: 120_000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
