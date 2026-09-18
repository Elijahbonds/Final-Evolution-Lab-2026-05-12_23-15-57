/**
 * scripts/prebuild-gate.js — runs the standing regression suite BEFORE build.
 *
 * Imported by next.config.js at config load time. If __NEXT_TEST_MODE is set
 * (used by the production build pipeline), the standing suite runs; a failure
 * exits non-zero, blocking the build. Dev-mode (`next dev`) does NOT trigger it.
 *
 * This is the only reliable hook since package.json is a symlink.
 */

const { execSync } = require('child_process');
const path = require('path');

const isProduction = process.env.__NEXT_TEST_MODE === '1';

// Also skip if explicitly opted out (useful for debugging build issues).
const skipGate = process.env.SKIP_STANDING_SUITE === '1';

if (isProduction && !skipGate) {
  console.log('\n\u2550\u2550 Standing regression suite (prebuild gate) \u2550\u2550\n');
  try {
    // Run the pure-logic suites only (no DB) to keep builds fast.
    // The full DB-integration suite runs via `yarn tsx scripts/standing-suite.ts` manually.
    execSync('yarn tsx scripts/m7d-tests.ts', {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      timeout: 30_000,
    });
    console.log('\n\u2705 Standing suite: M7-QA1 invariants GREEN\n');
  } catch (err) {
    console.error('\n\u274c Standing suite FAILED \u2014 build blocked.\n');
    process.exit(1);
  }
}
