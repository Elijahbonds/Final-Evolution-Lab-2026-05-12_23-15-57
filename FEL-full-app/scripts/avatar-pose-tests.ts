/**
 * avatar-pose-tests — vitest-suite wrapper for the avatar pose gate.
 * The gate itself is scripts/avatar/validate-pose.mts (NullEngine, real
 * Babylon loader); this wrapper gives it the "<name>: N checks green"
 * contract headless-checks.suite.test.ts parses.
 */

import { execFileSync } from 'node:child_process';
import { installedTsxCli } from './ci-suite';

const out = execFileSync(process.execPath, [installedTsxCli(), 'scripts/avatar/validate-pose.mts', 'public/models/fel-hero.glb'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'test' },
});
process.stdout.write(out);

const checks = (out.match(/✓/g) ?? []).length;
const failures = (out.match(/✗/g) ?? []).length;
if (failures > 0 || checks === 0) {
  console.error(`avatar-pose: ${failures} failures`);
  process.exit(1);
}
console.log(`avatar-pose: ${checks} checks green`);
process.exit(0);
