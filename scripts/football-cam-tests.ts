/**
 * scripts/football-cam-tests.ts — headless invariants for lib/feel/football-cam.ts
 * (PHASE 9 / Handoff PART 5.2). Run: yarn tsx scripts/football-cam-tests.ts
 */
import {
  FOOTBALL_FOV,
  BASKETBALL_FOV,
  STACK_MIN,
  CONVERGE_RADIUS_YD,
  CUT_DURATION_S,
  CUT_COOLDOWN_S,
  countConverging,
  makeBroadcastCutState,
  updateBroadcastCut,
  broadcastBlend,
  type DefenderLike,
} from '../lib/feel/football-cam';

let failed = 0;
function ok(name: string, cond: boolean) {
  if (!cond) {
    failed++;
    console.error('  ❌', name);
  }
}

// --- FOV law ---
ok('football FOV is 65', FOOTBALL_FOV === 65);
ok('basketball FOV is 50', BASKETBALL_FOV === 50);
ok('football FOV wider than basketball', FOOTBALL_FOV > BASKETBALL_FOV);

// --- countConverging ---
const runner = { x: 0, z: -20 }; // 20 yards downfield
const near: DefenderLike[] = [
  { yd: 24, x: 0, cleared: false },   // 4 yd ahead, on-line -> converging
  { yd: 26, x: 3, cleared: false },   // ~6.7 yd -> converging
  { yd: 28, x: -5, cleared: false },  // ~9.4 yd -> converging
];
ok('three nearby defenders all converge', countConverging(near, runner) === 3);
ok('cleared defenders are excluded', countConverging(
  near.map((d, i) => (i === 0 ? { ...d, cleared: true } : d)), runner) === 2);
ok('defenders behind the runner are excluded', countConverging(
  [{ yd: 10, x: 0, cleared: false }], runner) === 0);
ok('far defenders beyond radius are excluded', countConverging(
  [{ yd: 20 + CONVERGE_RADIUS_YD + 5, x: 0, cleared: false }], runner) === 0);
ok('empty list -> 0', countConverging([], runner) === 0);

// --- updateBroadcastCut ---
{
  const s = makeBroadcastCutState();
  ok('starts inactive', !s.active && s.timer === 0 && s.cooldown === 0);

  updateBroadcastCut(s, STACK_MIN - 1, 0.1);
  ok('below threshold does not fire', !s.active);

  updateBroadcastCut(s, STACK_MIN, 0.016);
  ok('threshold fires the cut', s.active && s.timer > 0);
  ok('blend > 0 while active', broadcastBlend(s) > 0);

  // hold past the duration -> should deactivate and enter cooldown
  updateBroadcastCut(s, STACK_MIN, CUT_DURATION_S);
  ok('cut expires after duration', !s.active);
  ok('cooldown armed after expiry', Math.abs(s.cooldown - CUT_COOLDOWN_S) < 1e-6);
  ok('blend 0 when inactive', broadcastBlend(s) === 0);

  // cannot retrigger during cooldown
  updateBroadcastCut(s, STACK_MIN, 0.1);
  ok('cooldown blocks retrigger', !s.active);

  // drain the cooldown, then it can fire again
  updateBroadcastCut(s, 0, CUT_COOLDOWN_S);
  updateBroadcastCut(s, STACK_MIN, 0.016);
  ok('fires again after cooldown drains', s.active);
}

// --- broadcastBlend range ---
{
  const s = makeBroadcastCutState();
  updateBroadcastCut(s, STACK_MIN, 0.016);
  const b = broadcastBlend(s);
  ok('blend within [0,1]', b >= 0 && b <= 1);
}

if (failed > 0) {
  console.error(`\n❌ football-cam: ${failed} invariant(s) failed`);
  process.exit(1);
}
console.log('✅ football-cam: all invariants passed');
