#!/usr/bin/env -S npx tsx
// THE E2E GATE (QG-01, quality-gates lane, 2026-10-25). Owner, quality round 2026-10-20: "Playwright E2E of the key
// flows on every PR, blocking: sign up, play a mode to the end screen, coach invite, test-mode checkout, /studio load."
//
// scripts/ci-suite.ts discovers this file, so CI's "headless suites" step runs it on every push and PR — blocking, with
// no workflow change. The flows run on the static rig (scripts/e2e/rig.ts: the real client components bundled by
// esbuild, real Chromium, every request answered by the flow's fakes, nothing leaves the box). Retries and the
// owner-visible quarantine: scripts/e2e/run.ts and tests/e2e/quarantine.json.
//
//   npx tsx scripts/e2e-tests.ts                 # all five flows
//   npx tsx scripts/e2e-tests.ts --only signup   # one
//   E2E_OUT=<dir> npx tsx scripts/e2e-tests.ts   # keep the screenshots there
import { gateMain } from './e2e/run';
import { KEY_FLOWS } from '../tests/e2e/flows';

gateMain('e2e', KEY_FLOWS, 'the five key flows on the static rig').catch((e) => { console.error(e); process.exit(1); });
