/**
 * board-flow-tests.ts — headless invariants for lib/feel/board-flow.ts
 * (Handoff Part 6 fixes 2/3/4). Registered in scripts/standing-suite.ts.
 */
import {
  predictArc,
  arcColor,
  createAntiStall,
  updateAntiStall,
  STALL_SPEED,
  STALL_HOLD_S,
  STALL_PUSH_TO,
  grindChainMult,
  GRIND_CHAIN_CAP,
  createGrindChain,
  pushGrind,
  breakGrindChain,
  pickNextRail,
} from '../lib/feel/board-flow';

type Case = { name: string; pass: boolean; detail?: string };
const cases: Case[] = [];
const check = (name: string, pass: boolean, detail?: string) => cases.push({ name, pass, detail });
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---- Fix 2: ghost arc ------------------------------------------------------
const flatGround = () => 0;
const flatSlope = () => 0;

// Simple upward launch over flat ground: should land and read green.
{
  const r = predictArc(
    { x0: 0, y0: 0, z0: 0, vy0: 6, speed: 10, fx: 0, fz: -1, gravity: 22 },
    flatGround,
    flatSlope
  );
  check('arc lands on flat ground', r.landT > 0, `landT=${r.landT}`);
  check('arc flat landing is green', r.clearance === 'green', r.clearance);
  check('arc produced sample points', r.points.length > 3, `n=${r.points.length}`);
  // Analytic flight time for vy0=6,g=22 is 2*vy0/g = 0.5454s.
  check('arc landT matches ballistic flight time', approx(r.landT, 12 / 22, 0.05), `landT=${r.landT}`);
  // Landing distance forward = speed * landT along -z.
  check('arc lands ahead in forward dir', r.landZ < -1, `landZ=${r.landZ}`);
}

// Steep landing face → yellow/red per slope.
{
  const steepSlope = () => 1.0; // between flat(0.55) and steep(1.5)
  const r = predictArc(
    { x0: 0, y0: 0, z0: 0, vy0: 6, speed: 10, fx: 0, fz: -1, gravity: 22 },
    flatGround,
    steepSlope
  );
  check('arc marginal face is yellow', r.clearance === 'yellow', r.clearance);
}
{
  const wallSlope = () => 2.5; // above steep threshold
  const r = predictArc(
    { x0: 0, y0: 0, z0: 0, vy0: 6, speed: 10, fx: 0, fz: -1, gravity: 22 },
    flatGround,
    wallSlope
  );
  check('arc into steep wall is red', r.clearance === 'red', r.clearance);
}

// Bottomless gap: ground drops away forever → never lands → red.
{
  const pit = (_x: number, z: number) => (z < -0.1 ? -1000 : 0);
  const r = predictArc(
    { x0: 0, y0: 0, z0: 0, vy0: 6, speed: 10, fx: 0, fz: -1, gravity: 22, horizonS: 2.0 },
    pit,
    flatSlope
  );
  check('arc over bottomless pit never lands', r.landT < 0, `landT=${r.landT}`);
  check('arc over pit is red', r.clearance === 'red', r.clearance);
}

check('arcColor green', arcColor('green') === '#00FF9D');
check('arcColor yellow', arcColor('yellow') === '#FFD700');
check('arcColor red', arcColor('red') === '#FF3366');

// ---- Fix 3: anti-stall auto-boost -----------------------------------------
{
  const s = createAntiStall();
  // Cruising fast → never fires, timer stays 0.
  let res = updateAntiStall(s, 8, 0.1, true);
  check('fast rider never stalls', !res.push && s.belowT === 0);

  // Airborne slow → exempt (does not accumulate).
  res = updateAntiStall(s, 0.5, 1.0, false);
  check('airborne slow is exempt', !res.push && s.belowT === 0);

  // Grounded slow but not long enough → no push yet.
  res = updateAntiStall(s, 1.0, 1.0, true);
  check('grounded slow accumulates', !res.push && approx(s.belowT, 1.0));

  // Cross the hold threshold → push fires and re-arms.
  res = updateAntiStall(s, 1.0, 0.6, true);
  check('push fires after hold threshold', res.push, `belowT after=${s.belowT}`);
  check('push targets STALL_PUSH_TO', approx(res.pushTo, STALL_PUSH_TO));
  check('push re-arms timer to 0', s.belowT === 0);
  check('push fire counted', s.fires === 1, `fires=${s.fires}`);

  // Recovering above STALL_SPEED resets the timer.
  updateAntiStall(s, 1.0, 1.0, true);
  updateAntiStall(s, STALL_SPEED + 0.1, 0.016, true);
  check('recovery resets stall timer', s.belowT === 0);
}
check('STALL constants sane', STALL_SPEED > 0 && STALL_HOLD_S > 0 && STALL_PUSH_TO > STALL_SPEED);

// ---- Fix 4: grind chain multiplier ----------------------------------------
check('grind1 = x1.0', approx(grindChainMult(1), 1.0));
check('grind2 = x1.5', approx(grindChainMult(2), 1.5));
check('grind3 = x2.0', approx(grindChainMult(3), 2.0));
check('grind4 = x2.5', approx(grindChainMult(4), 2.5));
check('grind5 = x3.0 (cap)', approx(grindChainMult(5), 3.0));
check('grind6 capped at x3.0', approx(grindChainMult(6), GRIND_CHAIN_CAP));
check('grind0 = x1.0 (no chain)', approx(grindChainMult(0), 1.0));
check('grind chain monotonic non-decreasing', grindChainMult(2) <= grindChainMult(3) && grindChainMult(3) <= grindChainMult(4));

{
  const gc = createGrindChain();
  const m1 = pushGrind(gc);
  const m2 = pushGrind(gc);
  const m3 = pushGrind(gc);
  check('pushGrind returns escalating mults', approx(m1, 1.0) && approx(m2, 1.5) && approx(m3, 2.0));
  check('pushGrind tracks best', gc.best === 3 && gc.count === 3);
  breakGrindChain(gc);
  check('breakGrindChain resets count', gc.count === 0);
  check('breakGrindChain keeps best', gc.best === 3);
  const m1b = pushGrind(gc);
  check('chain restarts at x1.0', approx(m1b, 1.0) && gc.count === 1);
}

// ---- Fix 4 (visual): next-rail lookup -------------------------------------
{
  const rails = [
    { ax: -6, az: -4, bx: 6, bz: -4, y: 0.55 }, // ahead (-z)
    { ax: 8, az: 6, bx: 8, bz: 13, y: 0.7 }, // behind (+z)
  ];
  // Rider at origin heading -z.
  const idx = pickNextRail(rails, 0, 0, 0, -1, 100);
  check('pickNextRail picks the rail ahead', idx === 0, `idx=${idx}`);
  // Nothing within range.
  const none = pickNextRail(rails, 0, 0, 0, -1, 1);
  check('pickNextRail respects maxDist', none === -1, `none=${none}`);
  // Facing +z now selects the behind rail.
  const back = pickNextRail(rails, 0, 0, 0, 1, 100);
  check('pickNextRail respects facing', back === 1, `back=${back}`);
}

// ---- report ----------------------------------------------------------------
const failed = cases.filter((c) => !c.pass);
for (const c of cases) {
  // eslint-disable-next-line no-console
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail && !c.pass ? '  — ' + c.detail : ''}`);
}
if (failed.length) {
  // eslint-disable-next-line no-console
  console.error(`\nboard-flow: ${failed.length}/${cases.length} FAILED`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log(`\nboard-flow: all ${cases.length} invariants passed`);

export {};
