#!/usr/bin/env -S npx tsx
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'scripts/probes/_cam-frame.mts'), 'utf8');

assert.match(
  source,
  /from '\.\/_chromium\.mts'/,
  'camera framing probe must use the shared Chromium resolver',
);
assert.match(
  source,
  /executablePath:\s*chromiumExe\(\)/,
  'camera framing probe must launch the resolved Chromium executable',
);
assert.doesNotMatch(
  source,
  /Library\/Caches\/ms-playwright|chrome-mac-arm64|process\.env\.HOME\s*\+/,
  'camera framing probe must not be pinned to one developer machine',
);
assert.match(
  source,
  /searchParams\.set\('agent', '1'\)/,
  'camera framing probe must explicitly enable the agent/dev hook publisher',
);
assert.match(
  source,
  /waitForFunction\('!!window\.__FEL_DEV__\?\.scene'/,
  'camera framing probe must wait for the dev scene handle before sampling',
);
assert.match(
  source,
  /process\.platform === 'darwin' \? \['--use-angle=metal'\] : \[\]/,
  'camera framing probe must keep the Metal ANGLE backend macOS-only',
);

console.log('cam-frame-probe-tests: camera framing probe resolves Chromium cross-platform');
