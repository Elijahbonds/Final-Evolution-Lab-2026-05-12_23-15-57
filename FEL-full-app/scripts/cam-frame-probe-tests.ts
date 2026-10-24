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

console.log('cam-frame-probe-tests: camera framing probe resolves Chromium cross-platform');
