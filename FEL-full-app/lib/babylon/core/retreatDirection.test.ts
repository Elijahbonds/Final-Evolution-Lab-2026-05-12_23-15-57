// OV-C1 (CHECK-C-406-REVIEW-2026-10-24 §4(2)): a held pull-back RETREATS — away from the rim, and stays away.
// Additive to check C in scripts/onevone-depth-tests.ts (which is not touched): check C pins "no boost on the release"; neither its
// old line (vel.z <= 0.01, which passed only while the handler ran back AT the rim — the reversal bug #406 fixed) nor its new one pins
// the retreat's DIRECTION. This does, at four court spots, from rest and after a jog and a sprint run-up.
// Axis convention (26c1b4ab): stick +Y = world −Z (BasketballCore.ts:389, CourtMovement.ts:208, HoopsStick.ts:109); facing vector
// (sin f, cos f) (BasketballCore.ts:368). The controller has no court frame, so every spot must read the same (R4).
import { describe, expect, it } from 'vitest';
import { DribbleController, type DribbleResult } from './BasketballCore';

const DT = 1 / 60;
/** The 1v1 rim on the floor: RIM = (0, RIM_HEIGHT_M, −0.6) (modes/OneVOneMode.ts:243), copied as a literal so this test needs no scene. */
const RIM_X = 0, RIM_Z = -0.6;
/** Start spots (TUNE): spawn (OneVOneMode.ts:285 MY_SPAWN), wing, corner, deep. The wing sits 1.25× farther out along its own bearing
 *  from the rim than its first cut ([4, 3]): main's jog (97d1dd96, BasketballCore.ts) carries the 60-frame run-up from there to
 *  1.495 m off the rim, under R0's 1.5 m guard; at [5, 3.9] the same run-up, at the same angle, ends ~2.8 m out. */
const SPOTS: Record<string, [number, number]> = { spawn: [0, 5], wing: [5, 3.9], corner: [-6, 0], deep: [1, 8] };
const HOLD = 60;           // TUNE: frames the pull-back is held
const SETTLE = 18;         // TUNE: frames for a moving handler to plant and turn back (measured flip: f12, 200 ms)
const EPS_V = 1e-6;        // TUNE: m/s, a float tolerance, not a gameplay allowance
const EPS_D = 1e-9;        // m
const RUNUP_JOG = 60;      // check C's own run-up
const RUNUP_SPRINT = 30;   // TUNE
const MIN_RIM_GAP = 1.5;   // TUNE: m, a setup guard — the run-up never reaches the rim
const RELEASE = 31;        // one neutral frame, then 30 more

type RunUp = 'rest' | 'jog' | 'sprint';
interface Trace { gapAfterRunUp: number; hold: { vr: number; d: number; r: DribbleResult }[]; vrBefore: number; dBefore: number;
  release: { vr: number; speed: number; r: DribbleResult }[]; speedBeforeRelease: number }

/** One handler at a spot: face the rim, run up (or not), hold the pull-back, release. Stick vectors fixed for the whole run. */
function trace(spot: [number, number], runUp: RunUp): Trace {
  const pos = { x: spot[0], z: spot[1] };
  const len0 = Math.hypot(RIM_X - pos.x, RIM_Z - pos.z);
  const toRim0 = { x: (RIM_X - pos.x) / len0, z: (RIM_Z - pos.z) / len0 };
  const F: [number, number] = [toRim0.x, -toRim0.z];    // stick toward the rim
  const Bk: [number, number] = [-toRim0.x, toRim0.z];   // stick straight back, away from the rim
  const c = new DribbleController();
  c.setFacing(Math.atan2(toRim0.x, toRim0.z));
  const sprint = runUp === 'sprint';
  const step = (s: [number, number]) => { const r = c.update(DT, s[0], s[1], sprint); pos.x += c.vel.x * DT; pos.z += c.vel.z * DT; return r; };
  const dist = () => Math.hypot(RIM_X - pos.x, RIM_Z - pos.z);
  const vr = () => { const d = dist(); return (c.vel.x * (RIM_X - pos.x) + c.vel.z * (RIM_Z - pos.z)) / d; };
  const n = runUp === 'jog' ? RUNUP_JOG : runUp === 'sprint' ? RUNUP_SPRINT : 0;
  for (let i = 0; i < n; i++) step(F);
  const t: Trace = { gapAfterRunUp: dist(), hold: [], vrBefore: vr(), dBefore: dist(), release: [], speedBeforeRelease: 0 };
  for (let i = 0; i < HOLD; i++) { const r = step(Bk); t.hold.push({ vr: vr(), d: dist(), r }); }
  t.speedBeforeRelease = c.vel.length();
  for (let i = 0; i < RELEASE; i++) { const r = step([0, 0]); t.release.push({ vr: vr(), speed: c.vel.length(), r }); }
  return t;
}

const RUNUPS: RunUp[] = ['rest', 'jog', 'sprint'];
const CASES = Object.entries(SPOTS).flatMap(([name, p]) => RUNUPS.map((u) => [name, u, p] as const));

describe('OV-C1: a held pull-back retreats from the rim', () => {
  it.each(CASES)('%s, %s: R0 the run-up leaves room; R1/R2 the hold never closes on the rim after SETTLE and turns away', (_n, runUp, p) => {
    const t = trace(p, runUp);
    expect(t.gapAfterRunUp).toBeGreaterThanOrEqual(MIN_RIM_GAP);   // R0
    let vPrev = t.vrBefore, dPrev = t.dBefore;
    t.hold.forEach((h, i) => {
      expect(h.r.hesitation, `hesitation on hold frame ${i}`).toBe(false);                 // R1 / R2d
      expect(h.r.crossover, `crossover on hold frame ${i}`).toBe(false);
      expect(h.vr, `accelerated toward the rim on hold frame ${i}`).toBeLessThanOrEqual(vPrev + EPS_V);   // R2a
      if (runUp === 'rest' || i >= SETTLE) {
        expect(h.vr, `velocity toward the rim on hold frame ${i}`).toBeLessThanOrEqual(EPS_V);           // R1 / R2c
        expect(h.d, `rim distance fell on hold frame ${i}`).toBeGreaterThanOrEqual(dPrev - EPS_D);
      }
      if (i === SETTLE) expect(h.vr, 'still not retreating at SETTLE').toBeLessThan(-EPS_V);              // R2b
      vPrev = h.vr; dPrev = h.d;
    });
  });

  it.each(CASES)('%s, %s: R3 the release fires nothing, never speeds up, and never flips toward the rim', (_n, runUp, p) => {
    const t = trace(p, runUp);
    let sPrev = t.speedBeforeRelease;
    t.release.forEach((f, i) => {
      expect(f.r.hesitation, `hesitation on release frame ${i}`).toBe(false);
      expect(f.r.crossover, `crossover on release frame ${i}`).toBe(false);
      expect(f.speed, `sped up on release frame ${i}`).toBeLessThanOrEqual(sPrev + EPS_V);
      expect(f.vr, `flipped toward the rim on release frame ${i}`).toBeLessThanOrEqual(EPS_V);
      sPrev = f.speed;
    });
  });

  it.each(RUNUPS)('R4 %s: every court spot reads the same (the controller has no court frame)', (runUp) => {
    const [first, ...rest] = Object.values(SPOTS).map((p) => trace(p, runUp));
    for (const t of rest) {
      t.hold.forEach((h, i) => expect(Math.abs(h.vr - first.hold[i].vr)).toBeLessThanOrEqual(1e-6));
      t.release.forEach((f, i) => expect(Math.abs(f.vr - first.release[i].vr)).toBeLessThanOrEqual(1e-6));
    }
  });

  it('R5 (report only): a forward push k frames after the retreat — does it read as a crossover?', () => {
    for (const k of [0, 1, 3, 6, 10]) {
      const c = new DribbleController();
      c.setFacing(Math.PI);
      for (let i = 0; i < RUNUP_JOG; i++) c.update(DT, 0, 1, false);
      for (let i = 0; i < HOLD; i++) c.update(DT, 0, -1, false);
      for (let i = 0; i < k; i++) c.update(DT, 0, 0, false);
      let crossed = false;
      for (let i = 0; i < 10; i++) crossed = c.update(DT, 0, 1, false).crossover || crossed;
      console.info(`[OV-C1 R5] k=${k} neutral frames → crossover ${crossed}, speed at 10 f ${c.vel.length().toFixed(3)} m/s`);
    }
    expect(true).toBe(true);
  });
});
