// DUNK-NO-PRESS-MISS (2026-10-22) — the pure side: the no-press ball's air drop never meets the iron (K-DNP4), the
// "Press to flush" gate's rate limits on seeded sessions (K-DNP6), the 'noSlam' hook (K-DNP2), the air flavour (K-DNP3), and the
// make and hang rules this tip must not move (K-DNP8, K-DNP9). The mode's wiring is pinned in modes/DunkMode.noPressMiss.test.ts.
import { describe, it, expect } from 'vitest';
import {
  airDropVelocity, AIR_DROP_OUT, AIR_DROP_MARGIN, AIR_DROP_MAX_OUT, FlushHintGate, FLUSH_HINT, FLUSH_HINT_FIRST_N,
  FLUSH_HINT_MIN_GAP_SEC, FLUSH_HINT_GUEST_K,
} from './DunkNoPress';
import { DunkHookLatch, type DunkMissKind } from './DunkContact';
import { missBeat } from './MissFlavour';
import { hangHold, HANG_MAX_SEC, type V3 } from './DunkHands';
import { ringDistance } from './RimFlush';
import { slamExecution } from './DunkSystem';
import { slamIsClean } from './DunkCard';
import { slamBufferSec, arcTopT, ARC_TOP_FRAC } from './DunkLegs';
import { EASTBAY_TIMING } from '../anim/authored/timing';

const RIM: V3 = { x: 0, y: 3.05, z: -10.28 };
const RIM_R = 0.225, BALL_R = 0.12, IRON_R = 0.03, DT = 1 / 60, FLOOR_E = 0.62;

/** A seeded LCG — the same sessions every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** BallSim.step's integration (velocity, then position; the floor bounce), with no rim in it — the loose ball has none. The
 *  closest the ball's surface comes to the iron over the flight and two floor bounces. */
function flightMinIronGap(from: V3, v: V3): number {
  const p = { ...from }, vel = { ...v };
  let min = Infinity, bounces = 0;
  for (let i = 0; i < 60 * 4 && bounces < 3; i++) {
    vel.y += -9.81 * DT;
    p.x += vel.x * DT; p.y += vel.y * DT; p.z += vel.z * DT;
    if (p.y - BALL_R < 0 && vel.y < 0) { p.y = BALL_R; vel.y = -vel.y * FLOOR_E; vel.x *= 0.85; vel.z *= 0.85; bounces++; }
    min = Math.min(min, ringDistance(p, RIM, RIM_R) - BALL_R - IRON_R);
  }
  return min;
}

describe('K-DNP4 — a no-press ball never touches the rim', () => {
  it('from every release the flight can leave it at (in front, beside, over the ring), the drop keeps clear of the iron', () => {
    const r = rng(0xD9F1);
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      const p: V3 = { x: RIM.x + (r() - 0.5) * 1.2, y: 2.2 + r() * 1.8, z: RIM.z + (r() - 0.3) * 1.6 };
      // the hand never brings the ball nearer the iron than 0.30 m without a press (DUNK-HANDS-RIM measured 0.37 m)
      if (ringDistance(p, RIM, RIM_R) < 0.30) continue;
      n++;
      const v = airDropVelocity(p, RIM, RIM_R, BALL_R);
      expect(flightMinIronGap(p, v), `release (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`).toBeGreaterThan(0);
    }
    expect(n).toBeGreaterThan(2000);
  });
  it('the measured releases (0.37–0.6 m in front of the iron, at its height) drop at the least speed, away from the ring', () => {
    for (const dz of [0.37, 0.45, 0.6]) {
      const p: V3 = { x: 0, y: RIM.y + 0.1, z: RIM.z + RIM_R + dz };
      const v = airDropVelocity(p, RIM, RIM_R, BALL_R);
      expect(v.z).toBeCloseTo(AIR_DROP_OUT, 6);   // straight out, toward the runway
      expect(v.x).toBeCloseTo(0, 6);
      expect(v.y).toBeLessThanOrEqual(0);         // no pop up off anything: it falls out of the hand
      expect(flightMinIronGap(p, v)).toBeGreaterThan(AIR_DROP_MARGIN);
    }
  });
  it('a ball over the ring is thrown out over the iron before it falls to it — never down through the hoop', () => {
    const p: V3 = { x: RIM.x, y: RIM.y + 0.3, z: RIM.z };
    const v = airDropVelocity(p, RIM, RIM_R, BALL_R);
    expect(Math.hypot(v.x, v.z)).toBeGreaterThan(AIR_DROP_OUT);
    expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(AIR_DROP_MAX_OUT);
    expect(v.z).toBeGreaterThan(0);
    expect(flightMinIronGap(p, v)).toBeGreaterThan(0);
  });
});

describe('K-DNP6 — the "Press to flush" rate limits', () => {
  it('the hint is the static line, and the limits are conservative', () => {
    expect(FLUSH_HINT).toBe('Press to flush');
    expect(FLUSH_HINT_FIRST_N).toBeGreaterThanOrEqual(1);
    expect(FLUSH_HINT_FIRST_N).toBeLessThanOrEqual(3);
    expect(FLUSH_HINT_MIN_GAP_SEC).toBeGreaterThan(0);
    expect(FLUSH_HINT_GUEST_K).toBeGreaterThanOrEqual(1);
  });
  it('attempts 1..N show it; after that only the attempt after a noSlam miss', () => {
    const g = new FlushHintGate();
    let t = 0;
    for (let i = 1; i <= FLUSH_HINT_FIRST_N; i++) { expect(g.take({ rival: false, replay: false, nowSec: (t += 30) }), `attempt ${i}`).toBe(true); }
    expect(g.take({ rival: false, replay: false, nowSec: (t += 30) })).toBe(false);
    g.noteNoSlam();
    expect(g.take({ rival: false, replay: false, nowSec: (t += 30) })).toBe(true);
    expect(g.take({ rival: false, replay: false, nowSec: (t += 30) })).toBe(false);   // the pass is spent by the one attempt after
  });
  it('never more than once per M seconds, even on a noSlam pass', () => {
    const g = new FlushHintGate();
    expect(g.take({ rival: false, replay: false, nowSec: 100 })).toBe(true);
    expect(g.take({ rival: false, replay: false, nowSec: 100 + FLUSH_HINT_MIN_GAP_SEC - 0.01 })).toBe(false);
    g.noteNoSlam();
    expect(g.take({ rival: false, replay: false, nowSec: 100 + FLUSH_HINT_MIN_GAP_SEC + 1 })).toBe(true);
    g.noteNoSlam();
    expect(g.take({ rival: false, replay: false, nowSec: 100 + FLUSH_HINT_MIN_GAP_SEC + 2 })).toBe(false);
  });
  it("never on the rival's turn or a replay — and those are not the guest's attempts", () => {
    const g = new FlushHintGate();
    for (let i = 0; i < 5; i++) {
      expect(g.take({ rival: true, replay: false, nowSec: i * 30 })).toBe(false);
      expect(g.take({ rival: false, replay: true, nowSec: i * 30 + 1 })).toBe(false);
    }
    expect(g.attemptCount).toBe(0);
    expect(g.take({ rival: false, replay: false, nowSec: 500 })).toBe(true);
  });
  it('never for a guest who has landed K pressed slams; a new mount (reset) is a new guest', () => {
    const g = new FlushHintGate(10, 0);
    for (let i = 0; i < FLUSH_HINT_GUEST_K; i++) { expect(g.take({ rival: false, replay: false, nowSec: i })).toBe(true); g.notePressedMake(); }
    g.noteNoSlam();
    expect(g.take({ rival: false, replay: false, nowSec: 99 })).toBe(false);
    g.reset();
    expect(g.take({ rival: false, replay: false, nowSec: 100 })).toBe(true);
  });
  it('seeded sessions: every take-off agrees with the rules, line by line', () => {
    for (const seed of [1, 7, 42, 1234, 99991]) {
      const r = rng(seed);
      const g = new FlushHintGate();
      let now = 0, attempts = 0, last = -Infinity, made = 0, pass = false, shown = 0;
      for (let i = 0; i < 60; i++) {
        now += 2 + r() * 20;
        const rival = r() < 0.4, replay = !rival && r() < 0.1;
        const got = g.take({ rival, replay, nowSec: now });
        if (rival || replay) { expect(got).toBe(false); continue; }
        attempts++;
        const want = made < FLUSH_HINT_GUEST_K && now - last >= FLUSH_HINT_MIN_GAP_SEC && (attempts <= FLUSH_HINT_FIRST_N || pass);
        expect(got, `seed ${seed} attempt ${attempts}`).toBe(want);
        pass = false;
        if (got) { last = now; shown++; }
        const outcome = r();
        if (outcome < 0.3) { g.noteNoSlam(); pass = true; } else if (outcome < 0.6) { g.notePressedMake(); made++; }
      }
      expect(shown).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('K-DNP2 — onMiss(noSlam) is one miss and no contact', () => {
  it('the latch takes noSlam once; a contact after it is refused', () => {
    const latch = new DunkHookLatch();
    const misses: DunkMissKind[] = []; let contacts = 0;
    latch.set({ onMiss: (k) => misses.push(k), onContact: () => { contacts++; } });
    expect(latch.miss('noSlam', { source: 'player' })).toBe(true);
    expect(latch.miss('noSlam', { source: 'player' })).toBe(false);
    expect(latch.contact('dunk_finish', 'clean', 'sweet', { source: 'player' })).toBe(false);
    expect(misses).toEqual(['noSlam']);
    expect(contacts).toBe(0);
  });
});

describe('K-DNP3 — no press is the air flavour: nothing touches the iron', () => {
  it('missBeat(null) is air and never rings the rim', () => {
    expect(missBeat(null)).toMatchObject({ flavour: 'air', ringIt: false });
  });
});

describe('K-DNP8 — makes are unchanged: the same seeded presses grade as they did before this tip', () => {
  it('seeded presses across the window (base, TV and guest widths): the same makes, the same execution, press for press', () => {
    const center = EASTBAY_TIMING.extend, apex = arcTopT(EASTBAY_TIMING.extend, ARC_TOP_FRAC);
    const r = rng(0x5A11);
    const makes: number[] = []; let execSum = 0;
    for (const width of [0.28, 0.28 * 1.2, 0.28 * 1.4]) {
      const half = width / 2, openAt = center - half;
      const reach = slamBufferSec(openAt, apex, 0.22);
      let made = 0;
      for (let i = 0; i < 500; i++) {
        const at = openAt + r() * width;
        const e = slamExecution(at, center, half, reach);
        // inside the window a press makes unless it is late past 70 % of the half (execution under RIM_CLEAN)
        expect(slamIsClean(e), `press @${at.toFixed(3)}`).toBe(at - center <= 0.7 * half + 1e-9);
        if (slamIsClean(e)) made++;
        execSum += e;
      }
      makes.push(made);
    }
    // measured with these seeds at the base (39172b21); DunkSystem / DunkCard / DunkLegs are untouched by DUNK-NO-PRESS-MISS
    expect(makes).toEqual([416, 422, 431]);
    expect(execSum).toBeCloseTo(1001.146034164, 6);
  });
});

describe('K-DNP9 — the HANG path is unchanged', () => {
  it('a made slam held through the contact hangs, and lets go by HANG_MAX_SEC', () => {
    expect(HANG_MAX_SEC).toBe(1.0);
    let held = 0;
    while (hangHold(true, held) && held < 5) held += DT;
    expect(held).toBeGreaterThanOrEqual(HANG_MAX_SEC - 1e-9);
    expect(held).toBeLessThanOrEqual(HANG_MAX_SEC + DT);
    expect(hangHold(false, 0)).toBe(false);   // no SLAM held (no press at all): never a hang
  });
});
