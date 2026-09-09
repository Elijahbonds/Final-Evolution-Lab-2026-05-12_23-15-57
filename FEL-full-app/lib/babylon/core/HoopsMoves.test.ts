import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  planGather, gatherWish, gatherTravel, gatherLabel, stickBack01, PULLUP_TRAVEL_MAX, GATHER_PULLUP_MAX_SEC, GATHER_PULLUP_MIN_SEC,
  pickLayupSide, planFinish, finishHopY, finishStride, FINISH_RELEASE_KEY_SEC, FINISH_HOP_APEX,
  contestDrive, bumpShove, resolveBodyContact, DRIVE_BUMP_RADIUS,
} from './HoopsMoves';
import { DUNK_PCT, STEPBACK_SEC, STEPBACK_SPEED, ShotMeter, classifyShot } from './BasketballCore';
import { FOUL_CLOSING_SPEED, HARD_CONTACT_SPEED } from './ContactSystem';

const RIM = new Vector3(0, 0, -0.6);
const V = (x: number, z: number) => new Vector3(x, 0, z);
/** Integrate a gather at 60 Hz: the travel and the frames until the body is under 0.3 m/s. */
function run(plan: ReturnType<typeof planGather>): { travel: number; framesToStop: number; maxDrop: number } {
  let travel = 0, framesToStop = -1, maxDrop = 0, prev = plan.v0.length();
  for (let i = 0, t = 0; t < plan.sec + 0.05; i++, t += 1 / 60) {
    const w = gatherWish(plan, t); const s = w.length();
    travel += s / 60; maxDrop = Math.max(maxDrop, prev - s); prev = s;
    if (framesToStop < 0 && s < 0.3) framesToStop = i;
  }
  return { travel, framesToStop, maxDrop };
}

describe('M1 — the player gather', () => {
  it('feet set: no gather, the rise starts on the squeeze', () => {
    const p = planGather(V(0.2, -0.3), V(0, 5), RIM, 0);
    expect(p.kind).toBe('set'); expect(p.sec).toBe(0); expect(gatherWish(p, 0).length()).toBe(0); expect(gatherTravel(p)).toBe(0);
  });
  it('a moving pull-up gathers longer at speed and never floats past a metre', () => {
    const walk = planGather(V(0, -2), V(0, 5), RIM, 0), sprint = planGather(V(0, -6.4), V(0, 5), RIM, 0);
    expect(walk.kind).toBe('pullup'); expect(sprint.kind).toBe('pullup');
    expect(walk.sec).toBeGreaterThanOrEqual(GATHER_PULLUP_MIN_SEC); expect(sprint.sec).toBeCloseTo(GATHER_PULLUP_MAX_SEC, 5);
    expect(sprint.sec).toBeGreaterThan(walk.sec);
    expect(gatherTravel(sprint)).toBeLessThanOrEqual(PULLUP_TRAVEL_MAX);
    const r = run(sprint);
    expect(r.travel).toBeLessThanOrEqual(PULLUP_TRAVEL_MAX);
    expect(Math.abs(r.travel - gatherTravel(sprint))).toBeLessThan(0.1);   // 60 Hz Euler vs the closed form
  });
  it('the plant is a deceleration, not a freeze: several frames to stop, no single-frame kill', () => {
    const r = run(planGather(V(0, -6.4), V(0, 5), RIM, 0));
    expect(r.framesToStop).toBeGreaterThanOrEqual(8);
    expect(r.maxDrop).toBeLessThan(1.2);   // m/s lost in one 60 Hz frame (a hard stop would be 6.4)
  });
  it('the wish keeps the heading and ends at zero', () => {
    const p = planGather(V(3, -3), V(2, 5), RIM, 0);
    const w = gatherWish(p, 0.05); expect(w.x).toBeGreaterThan(0); expect(w.z).toBeLessThan(0);
    expect(gatherWish(p, p.sec).length()).toBe(0); expect(gatherWish(p, 9).length()).toBe(0);
  });
  it('contested + the stick pulled away from the rim = a step-back: back first, then the set', () => {
    const p = planGather(V(0, -1.5), V(0, 3), RIM, 0.6, 0.9);
    expect(p.kind).toBe('stepback'); expect(p.sec).toBeGreaterThan(STEPBACK_SEC);
    const w = gatherWish(p, 0.1); expect(w.z).toBeGreaterThan(0);   // away from a rim at −z
    expect(w.length()).toBeCloseTo(STEPBACK_SPEED, 5);
    expect(gatherWish(p, STEPBACK_SEC + 0.01).length()).toBe(0);
    expect(gatherTravel(p)).toBeCloseTo(STEPBACK_SPEED * STEPBACK_SEC, 5);
  });
  it('no step-back without the contest, or without the stick back', () => {
    expect(planGather(V(0, -1.5), V(0, 3), RIM, 0.1, 0.9).kind).toBe('pullup');
    expect(planGather(V(0, -1.5), V(0, 3), RIM, 0.6, 0.1).kind).toBe('pullup');
  });
  it('stickBack01 reads the stick against the rim', () => {
    const toRim = V(0, -1);
    expect(stickBack01(0, 1, toRim)).toBeCloseTo(1, 5);      // pulled to +z, the rim at −z
    expect(stickBack01(0, -1, toRim)).toBe(0);
    expect(stickBack01(0.05, 0.05, toRim)).toBe(0);            // inside the dead zone
  });
  it('labels', () => { expect(gatherLabel('pullup', 'JUMPER')).toBe('PULL-UP'); expect(gatherLabel('stepback', 'JUMPER')).toBe('STEP-BACK'); expect(gatherLabel('set', 'JUMPER')).toBe('JUMPER'); });
  it('ShotMeter runs THROUGH the gather: the green sits at the rise\'s 0.62 after the gather, the same width in seconds', () => {
    const m0 = new ShotMeter(); m0.start(0, 'jumper');
    const m = new ShotMeter(); m.start(0, 'jumper', 0.3);
    expect(m.durationSec).toBeCloseTo(m0.durationSec + 0.3, 5);
    expect(m.gatherSec).toBe(0.3); expect(m.riseSec).toBeCloseTo(m0.durationSec, 5);
    expect(m.greenCenter01 * m.durationSec).toBeCloseTo(0.3 + 0.62 * m0.durationSec, 5);
    expect(m.greenHalfWidth01 * m.durationSec).toBeCloseTo(m0.greenHalfWidth01 * m0.durationSec, 5);
    // released at the green after the gather = perfect; released inside the gather = early
    m.update(0.3 + 0.62 * m0.durationSec); expect(m.release()).toBe('perfect');
    const e = new ShotMeter(); e.start(0, 'jumper', 0.3); e.update(0.15); expect(e.release()).toBe('early');
  });
});

describe('M3 — the layup side and the finish pacing', () => {
  const yaw = Math.PI;   // facing −z (the rim)
  it('classifyShot reads the FLOOR distance: a body 1.5 m from the rim is a layup, 3 m a floater, 6 m a jumper (it measured to a rim 3.05 m up — never a layup)', () => {
    const rim = new Vector3(0, 3.05, -0.6);
    expect(classifyShot(V(0, 0.9), V(0, 0), rim, 0).style).toBe('layup');
    expect(classifyShot(V(0, 2.4), V(0, 0), rim, 0).style).toBe('floater');
    expect(classifyShot(V(0, 3.4), V(0, 0), rim, 0).style).toBe('jumper');   // the elbow pull-up is a jumper, not a floater
    expect(classifyShot(V(0, 5.4), V(0, 0), rim, 0).style).toBe('jumper');
  });
  it('the outside hand of the side the drive comes from', () => {
    // body-right at yaw π is −x: a drive from x −2 is up the right side → right hand; from +2 → left
    expect(pickLayupSide(V(-2, 1.4), RIM, yaw, null)).toBe('right');
    expect(pickLayupSide(V(2, 1.4), RIM, yaw, null)).toBe('left');
  });
  it('straight on: the strong hand, unless a defender sits on it', () => {
    expect(pickLayupSide(V(0, 1.6), RIM, yaw, null)).toBe('right');
    expect(pickLayupSide(V(0, 1.6), RIM, yaw, V(-0.8, 0.9))).toBe('left');    // on my right (−x)
    expect(pickLayupSide(V(0, 1.6), RIM, yaw, V(0.8, 0.9))).toBe('right');    // on my left: the strong hand stays
    expect(pickLayupSide(V(0, 1.6), RIM, yaw, V(-0.8, -3))).toBe('right');    // too far to matter
  });
  it('the finish clip is paced so its release key lands on the green, the hop lands at the clip\'s landing key', () => {
    const m = new ShotMeter(); m.start(0.2, 'layup');
    const f = planFinish('layup', 'left', m.durationSec, m.greenCenter01);
    expect(f.clip).toBe('bball_layup_gather_left');
    expect(f.releaseSec).toBeCloseTo(m.durationSec * m.greenCenter01, 5);
    expect(FINISH_RELEASE_KEY_SEC.layup / f.speedRatio).toBeCloseTo(f.releaseSec, 5);
    expect(f.hopSec).toBeGreaterThan(f.releaseSec);
    expect(f.hopSec).toBeLessThan(1.1);
    const fl = planFinish('floater', 'right', m.durationSec, m.greenCenter01); expect(fl.clip).toBe('bball_floater');
  });
  it('the layup meter is quick and forgiving; the floater sits between it and the jumper', () => {
    const j = new ShotMeter(); j.start(0.3, 'jumper'); const l = new ShotMeter(); l.start(0.3, 'layup'); const f = new ShotMeter(); f.start(0.3, 'floater');
    expect(l.durationSec).toBeLessThan(j.durationSec); expect(f.durationSec).toBeLessThan(j.durationSec); expect(f.durationSec).toBeGreaterThan(l.durationSec);
    expect(l.greenHalfWidth01 * l.durationSec).toBeGreaterThan(j.greenHalfWidth01 * j.durationSec);
  });
  it('the hop peaks at the release and is down at feet-down; the stride stops inside the paint and after the release', () => {
    expect(finishHopY('layup', 0)).toBe(0); expect(finishHopY('layup', 0.5)).toBeCloseTo(FINISH_HOP_APEX.layup, 5); expect(finishHopY('layup', 1)).toBeCloseTo(0, 5);
    expect(finishStride('layup', V(0, 1.4), RIM, false).length()).toBeGreaterThan(0);
    expect(finishStride('layup', V(0, 1.4), RIM, false).z).toBeLessThan(0);
    expect(finishStride('layup', V(0, 0.1), RIM, false).length()).toBe(0);
    expect(finishStride('layup', V(0, 1.4), RIM, true).length()).toBe(0);
  });
});

describe('M2 — the drive contest', () => {
  const from = V(0, 3), landing = V(0, -0.1);
  it('no body in the path: uncontested, the base make chance', () => {
    const c = contestDrive(from, landing, null, null, 'dunk'); expect(c.contested).toBe(false); expect(c.pct).toBe(DUNK_PCT.dunk); expect(c.bumpK).toBeNull();
    const wide = contestDrive(from, landing, V(1.2, 1.5), V(0, 0), 'poster'); expect(wide.contested).toBe(false); expect(wide.pct).toBe(DUNK_PCT.poster);
  });
  it('a set body squarely in the lane: the bump where the flight meets him, a harder finish', () => {
    const c = contestDrive(from, landing, V(0, 1.5), V(0, 0), 'poster');
    expect(c.contested).toBe(true); expect(c.set).toBe(true); expect(c.strength01).toBeCloseTo(1, 5);
    expect(c.bumpK).toBeCloseTo(1.5 / 3.1, 3);
    expect(c.pct).toBeLessThan(DUNK_PCT.poster); expect(c.pct).toBeGreaterThan(0.5);
  });
  it('a moving, off-centre body is a softer contest', () => {
    const c = contestDrive(from, landing, V(0.4, 1.5), V(2, 0), 'poster');
    expect(c.contested).toBe(true); expect(c.set).toBe(false);
    expect(c.strength01).toBeLessThan(0.5); expect(c.pct).toBeGreaterThan(contestDrive(from, landing, V(0, 1.5), V(0, 0), 'poster').pct);
    expect(bumpShove(c).length()).toBeLessThan(bumpShove(contestDrive(from, landing, V(0, 1.5), V(0, 0), 'poster')).length());
    expect(bumpShove(c).z).toBeLessThan(0);   // shoved along the drive, toward the rim
  });
  it('a body behind the takeoff or past the landing is not in the path', () => {
    expect(contestDrive(from, landing, V(0, 4), V(0, 0), 'poster').contested).toBe(false);
    expect(contestDrive(from, landing, V(0, -1.2), V(0, 0), 'poster').contested).toBe(false);
    expect(contestDrive(from, landing, V(DRIVE_BUMP_RADIUS + 0.05, 1.5), V(0, 0), 'poster').contested).toBe(false);
  });
});

describe('M2 — kinematic body contact (3v3)', () => {
  it('no touch, no contact, nothing moved', () => {
    const a = V(0, 0), b = V(2, 0), va = V(5, 0), vb = V(0, 0);
    expect(resolveBodyContact(a, b, va, vb)).toBeNull(); expect(va.x).toBe(5); expect(a.x).toBe(0);
  });
  it('a sprint into a set body: the attacker bleeds speed, the target is shoved, the severity is the ContactSystem\'s', () => {
    const a = V(0, 0), b = V(1.0, 0), va = V(5, 0), vb = V(0, 0);
    const c = resolveBodyContact(a, b, va, vb)!;
    expect(c).not.toBeNull(); expect(c.attacker).toBe('a'); expect(c.closing).toBeCloseTo(5, 5);
    expect(c.severity).toBe(HARD_CONTACT_SPEED <= 5 && 5 < FOUL_CLOSING_SPEED * 1.25 ? 'hard' : 'foul');
    expect(va.x).toBeCloseTo(5 - 5 * 0.55, 5); expect(vb.x).toBeCloseTo(5 * 0.25, 5);
    expect(b.x - a.x).toBeCloseTo(1.1, 5);   // separated to the standoff
  });
  it('an airborne shooter hit at foul speed is a foul; the same hit on the floor is hard', () => {
    const hit = (air: boolean) => resolveBodyContact(V(0, 0), V(1.0, 0), V(0, 0), V(-4.4, 0), 0.55, { airborneA: air })!;
    expect(hit(true).severity).toBe('foul'); expect(hit(true).attacker).toBe('b');
    expect(hit(false).severity).toBe('hard');
  });
  it('a braced target barely gives; the attacker stalls', () => {
    const va = V(5, 0), vb = V(0, 0);
    resolveBodyContact(V(0, 0), V(1.0, 0), va, vb, 0.55, { bracedB: true });
    expect(va.x).toBeCloseTo(5 - 5 * 0.85, 5); expect(vb.x).toBeCloseTo(5 * 0.08, 5);
  });
  it('the exchange can be withheld (the mode\'s per-collision cooldown) while the separation still happens; the along speeds are reported', () => {
    const a = V(0, 0), b = V(1.0, 0), va = V(5, 0), vb = V(-1, 0);
    const c = resolveBodyContact(a, b, va, vb, 0.55, { exchange: false })!;
    expect(va.x).toBe(5); expect(vb.x).toBe(-1); expect(b.x - a.x).toBeCloseTo(1.1, 5);
    expect(c.aAlong).toBeCloseTo(5, 5); expect(c.bAlong).toBeCloseTo(1, 5); expect(c.closing).toBeCloseTo(6, 5);
  });
  it('a slow overlap separates without an exchange', () => {
    const va = V(0.3, 0), vb = V(0, 0);
    const c = resolveBodyContact(V(0, 0), V(1.0, 0), va, vb)!;
    expect(c.severity).toBe('bump'); expect(va.x).toBe(0.3);
  });
});
