#!/usr/bin/env -S npx tsx
// THE VISUAL GATE (QG-02, quality-gates lane, 2026-10-25): key screens and mode frames against committed baselines.
// scripts/ci-suite.ts discovers this file, so CI runs it on every push and PR, blocking. What each check photographs
// and how a change is judged: scripts/visual/checks.ts. Retries and the quarantine: scripts/e2e/run.ts.
//
//   npx tsx scripts/visual-tests.ts                        # key screens + the sentinel mode (the per-PR run)
//   npx tsx scripts/visual-tests.ts --modes all            # + one frame of every registry mode (the sweep)
//   npx tsx scripts/visual-tests.ts --update --only coach-book   # re-baseline a screen that changed on purpose
//   E2E_OUT=<dir> …                                        # keep current.png / diff.png per check there
import { gateMain } from './e2e/run';
import { SCREENS, asFlow, modeShots } from './visual/checks';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const update = process.argv.includes('--update');
const modes = arg('--modes');
const shots = [...SCREENS, ...modeShots(modes === 'all' ? 'all' : modes ? modes.split(',') : 'sentinel')];
gateMain('visual', shots.map((s) => asFlow(s, update)), update ? 're-baselining (no comparison)' : 'key screens and mode frames against scripts/visual/baselines')
  .catch((e) => { console.error(e); process.exit(1); });
