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
    // components/ was added 2026-09-20. It held 239 files and 46,000 lines with no tests, and the reason turned out
    // not to be discipline: the runner was never pointed at it, so a test written there would have been collected by
    // nobody and passed silently forever. app/ is deliberately still out — its routes are covered by the static
    // contract in lib/api/routeContract.test.ts, which needs no DOM.
    include: [
      'lib/**/*.test.ts', 'scripts/**/*.suite.test.ts', 'tests/**/*.test.ts',
      'components/**/*.test.ts', 'components/**/*.test.tsx',
    ],
    // Babylon's NullEngine work and the 3000-sample statistical checks are not
    // fast; the default 5s timeout fails them for no good reason.
    testTimeout: 180_000,   // the headless check suites spawn a script with its own 120 s limit; under a sweep load a 60 s test timeout fired first (three false alarms 2026-09-05 and 06)
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `import 'server-only'` throws outside a React Server Component, which is the point of it in the app
      // and useless noise in a unit test. Stubbed so service modules that carry the guard can be tested
      // directly rather than being split in half to dodge it.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
