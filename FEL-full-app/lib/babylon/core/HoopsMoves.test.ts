import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  planGather, gatherWish, gatherTravel, gatherLabel, stickBack01, PULLUP_TRAVEL_MAX, GATHER_PULLUP_MAX_SEC, GATHER_PULLUP_MIN_SEC,
  pickLayupSide, planFinish, finishHopY, finishStride, FINISH_RELEASE_KEY_SEC, FINISH_HOP_APEX,
  contestDrive, bumpShove, resolveBodyContact, DRIVE_BUMP_RADIUS,
  // HOOPS-MOVE-KIT-B (2026-09-08): M4 the fade, M5 the hook, M6 the spin
  canPostUp, postYaw, postWish, POST_BAND_MAX, POST_BACKDOWN_SPEED, POST_SLIDE_SPEED,
  postFadeAway, fadeDrift, fadeSeparation, FADE_DRIFT_SPEED, FADE_SEPARATION_MIN,
  pickHookSide, hookShield, HOOK_SHIELD,
  planSpin, spinEase, spinYaw, spinPos, spinDone, spinOffContact, postSpinSide, bodyRight, gatherTravel as travelOf,
  SPIN_SEC, SPIN_TRAVEL, SPIN_SWEEP, SPIN_MIN_SPEED, SPIN_TRIGGER_RANGE, POST_SPIN_STICK_MIN,
  // wave 2: M7–M14
  gatherWish as legWish, runningHook, helpInTheWay, isPumpFake, PUMP_MAX_SEC, planStepThrough, STEP_THROUGH_SPEED,
  pivotFrom, planPivot, PIVOT_FRONT_SWEEP, PIVOT_REVERSE_SWEEP, PIVOT_SEC, PIVOT_STICK_MIN,
  rimProtected, isReverseFinish, reverseSide, REVERSE_RANGE,
  inBankBand, bankPoint, BANK_MIN_DEG, BANK_MAX_DEG, BANK_UP,
  planHopStep, HOP_TRAVEL_MAX, HOP_SEC, planEuro, euroSell, euroAvailable, EURO_A_SEC, EURO_B_SEC,
} from './HoopsMoves';
import { DUNK_PCT, STEPBACK_SEC, STEPBACK_SPEED, ShotMeter, classifyShot } from './BasketballCore';
import { aiBlockChance, AI_BLOCK_BASE } from './HoopsDefense';
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

// ════════════════════════════════════════════════════════════════════════════
// HOOPS-MOVE-KIT-B (2026-09-08) — M4 the post fadeaway, M5 the jump hook, M6 the spin move.
// yaw = π throughout (a body at +z facing the rim at −z): body-right is −x, so a defender at −x is on my RIGHT.
// ════════════════════════════════════════════════════════════════════════════
const PI = Math.PI;

describe('KIT-B path — the post-up', () => {
  it('the post needs the band AND a body to back down', () => {
    expect(canPostUp(V(0, 2.6), RIM, V(0, 1.6))).toBe(true);
    expect(canPostUp(V(0, 2.6), RIM, null)).toBe(false);              // nobody to post up
    expect(canPostUp(V(0, 2.6), RIM, V(0, 6))).toBe(false);           // he is not there
    expect(canPostUp(V(0, -0.2), RIM, V(0, 0.4))).toBe(false);        // already at the rim: that is a layup
    expect(canPostUp(V(0, POST_BAND_MAX + 1), RIM, V(0, POST_BAND_MAX))).toBe(false);   // that is a face-up jumper
  });
  it('the post turns the BACK to the basket', () => {
    const yawBack = postYaw(V(0, 2.6), RIM);
    // facing = (sin, cos): the chest points AWAY from the rim (+z), the back at it
    expect(Math.sin(yawBack)).toBeCloseTo(0, 5); expect(Math.cos(yawBack)).toBeCloseTo(1, 5);
  });
  it('backing him down is slow; sliding along the lane is not a drive either', () => {
    const toRim = V(0, -1);
    const back = postWish(0, -1, toRim);                   // the stick INTO the rim
    expect(back.length()).toBeCloseTo(POST_BACKDOWN_SPEED, 5);
    expect(back.z).toBeLessThan(0);                        // toward the rim
    const slide = postWish(1, 0, toRim);                   // across the lane
    expect(slide.length()).toBeCloseTo(POST_SLIDE_SPEED, 5);
    expect(postWish(0, 0, toRim).length()).toBe(0);
    expect(back.length()).toBeLessThan(slide.length());
  });
});

describe('M4 — the post fadeaway', () => {
  it('the fade escapes the DEFENDER when he is on me, the rim when he is not', () => {
    const off = postFadeAway(V(0, 2.6), RIM, V(0, 1.6));   // he is between me and the rim
    expect(off.length()).toBeCloseTo(1, 5); expect(off.z).toBeGreaterThan(0.9);   // away from him = away from the rim
    const side = postFadeAway(V(0, 2.6), RIM, V(1.2, 2.6));
    expect(side.x).toBeLessThan(-0.9);                     // straight off his body
    const none = postFadeAway(V(0, 2.6), RIM, null);
    expect(none.z).toBeCloseTo(1, 5);                      // off the rim
    expect(postFadeAway(V(0, 2.6), RIM, V(0, 9)).z).toBeCloseTo(1, 5);   // too far to be what I am escaping
  });
  it('the drift is BALLISTIC and buys real separation — the release is already behind the take-off, the landing further still', () => {
    const m = new ShotMeter(); m.start(0.4, 'fadeaway');
    const plan = planFinish('fadeaway', 'right', m.durationSec, m.greenCenter01, postFadeAway(V(0, 2.6), RIM, V(0, 1.6)));
    expect(plan.clip).toBe('bball_fadeaway');
    expect(fadeSeparation(plan)).toBeGreaterThanOrEqual(FADE_SEPARATION_MIN);
    // integrate the hop at 60 Hz: the same speed every frame (a jump is ballistic), and it never stops at the release
    let travel = 0, atRelease = 0;
    for (let t = 0; t < plan.hopSec; t += 1 / 60) {
      const d = fadeDrift(plan);
      expect(d.length()).toBeCloseTo(FADE_DRIFT_SPEED, 5);
      travel += d.length() / 60;
      if (t <= plan.releaseSec) atRelease = travel;
    }
    expect(atRelease).toBeGreaterThanOrEqual(FADE_SEPARATION_MIN);
    expect(travel).toBeGreaterThan(atRelease + 0.2);       // still going backwards when the feet come down
    expect(fadeDrift(planFinish('layup', 'right', m.durationSec, m.greenCenter01)).length()).toBe(0);
  });
  it('the fade hops higher than a layup and does NOT stride at the rim', () => {
    expect(FINISH_HOP_APEX.fadeaway).toBeGreaterThan(FINISH_HOP_APEX.layup);
    expect(finishStride('fadeaway', V(0, 2.6), RIM, false).length()).toBe(0);
  });
  it('a post squeeze with the stick off the rim is a FADEAWAY wherever I am — it was a label on a standing jumpshot', () => {
    const c = classifyShot(V(0, 2.6), V(0, 0), new Vector3(0, 3.05, -0.6), 0, 'fade');
    expect(c.style).toBe('fadeaway'); expect(c.label).toBe('FADEAWAY');
    // and KIT-A's face-up read is untouched: no post context, no fade
    expect(classifyShot(V(0, 2.6), V(0, 0), new Vector3(0, 3.05, -0.6), 0).style).toBe('floater');
  });
});

describe('M5 — the jump hook', () => {
  it('the hook shoots with the hand AWAY from him: the off shoulder is the shield', () => {
    expect(pickHookSide(V(0, 2.6), RIM, PI, V(-0.9, 2.6))).toBe('left');    // he is on my right → left hand
    expect(pickHookSide(V(0, 2.6), RIM, PI, V(0.9, 2.6))).toBe('right');    // he is on my left → right hand
    expect(pickHookSide(V(-2, 2.6), RIM, PI, null)).toBe('right');          // nobody: the middle-of-the-floor hand
    expect(pickHookSide(V(2, 2.6), RIM, PI, null)).toBe('left');
  });
  it('the shield is worth something: the contest that reaches the ball is cut, and it is the hardest shot in the game to block', () => {
    expect(hookShield(1)).toBeCloseTo(1 - HOOK_SHIELD, 5);
    expect(hookShield(0)).toBe(0);
    expect(AI_BLOCK_BASE.hook).toBeLessThan(AI_BLOCK_BASE.layup);
    expect(AI_BLOCK_BASE.hook).toBeLessThan(AI_BLOCK_BASE.jumper);
    expect(aiBlockChance('hook', 1.0, true, true)).toBeLessThan(aiBlockChance('layup', 1.0, true, true));
  });
  it('a post squeeze without the stick pulled off the rim is a JUMP HOOK, on its own clip and its own quick meter', () => {
    const c = classifyShot(V(0, 2.6), V(0, 0), new Vector3(0, 3.05, -0.6), 0, 'hook');
    expect(c.style).toBe('hook'); expect(c.label).toBe('JUMP HOOK');
    expect(c.pctMod).toBeGreaterThan(classifyShot(V(0, 5.4), V(0, 0), new Vector3(0, 3.05, -0.6), 0).pctMod);   // better than a jumper
    const m = new ShotMeter(); m.start(0.3, 'hook'); const j = new ShotMeter(); j.start(0.3, 'jumper');
    expect(m.durationSec).toBeLessThan(j.durationSec);                     // a quick release off the block
    const left = planFinish('hook', 'left', m.durationSec, m.greenCenter01);
    expect(left.clip).toBe('bball_hook_left');
    expect(planFinish('hook', 'right', m.durationSec, m.greenCenter01).clip).toBe('bball_hook');
    expect(FINISH_RELEASE_KEY_SEC.hook / left.speedRatio).toBeCloseTo(left.releaseSec, 5);
    expect(left.hopSec).toBeGreaterThan(left.releaseSec);
  });
});

describe('M6 — the spin move', () => {
  const me = () => V(0, 2.6);
  it('the foot plants on HIS side and the body turns the other way, a full revolution', () => {
    const right = planSpin(me(), PI, RIM, V(-0.9, 2.2));    // he is on my right (−x at yaw π)
    expect(right.side).toBe('left');
    expect(right.sweep).toBeCloseTo(-SPIN_SWEEP, 5);
    expect(right.pivot.x).toBeLessThan(me().x);             // the pivot foot toward him
    const left = planSpin(me(), PI, RIM, V(0.9, 2.2));
    expect(left.side).toBe('right'); expect(left.sweep).toBeCloseTo(SPIN_SWEEP, 5);
    expect(left.pivot.x).toBeGreaterThan(me().x);
    expect(planSpin(me(), PI, RIM, null).side).toBe('right');           // nobody there: off the right shoulder
    expect(planSpin(me(), PI, RIM, V(-0.9, 2.2), 'right').side).toBe('right');   // the post's own stick overrides the read
  });
  it('the exit line comes out past his shoulder but still AT the rim — the spin ends in a finish', () => {
    const p = planSpin(me(), PI, RIM, V(-0.9, 2.2));
    expect(p.exit.length()).toBeCloseTo(1, 5);
    const toRim = new Vector3(RIM.x - 0, 0, RIM.z - 2.6).normalize();
    const dot = Vector3.Dot(p.exit, toRim);
    expect(dot).toBeGreaterThan(0.9);                        // at the rim …
    expect(dot).toBeLessThan(0.999);                         // … but leaned off it, past his shoulder
  });
  it('a readable PIVOT: the turn is eased and monotonic, never a snap, and it lands on the exit facing', () => {
    const p = planSpin(me(), PI, RIM, V(-0.9, 2.2));
    expect(spinEase(0)).toBe(0); expect(spinEase(1)).toBe(1); expect(spinEase(0.5)).toBeCloseTo(0.5, 5);
    expect(spinYaw(p, 0)).toBeCloseTo(PI, 5);
    expect(spinYaw(p, p.sec)).toBeCloseTo(PI - SPIN_SWEEP, 5);           // a full turn: the same facing, gone all the way round
    let prev = spinYaw(p, 0), maxStep = 0;
    for (let t = 1 / 60; t <= p.sec + 1e-9; t += 1 / 60) {
      const y = spinYaw(p, t);
      expect(y).toBeLessThan(prev + 1e-9);                                // monotonic (this one turns negative)
      maxStep = Math.max(maxStep, Math.abs(y - prev)); prev = y;
    }
    expect(maxStep).toBeLessThan(0.5);                                    // ≤ ~29° a frame: a pivot you can read
    expect(spinDone(p, p.sec)).toBe(true); expect(spinDone(p, p.sec - 0.01)).toBe(false);
  });
  it('the root ARCS around the planted foot and comes out down the exit line', () => {
    const start = me();
    const p = planSpin(start, PI, RIM, V(-0.9, 2.2));
    const at0 = spinPos(p, 0);
    expect(at0.x).toBeCloseTo(start.x, 5); expect(at0.z).toBeCloseTo(start.z, 5);
    const end = spinPos(p, p.sec);
    // back around to the pivot's far side + the travel down the exit
    expect(Vector3.Distance(end, start)).toBeGreaterThan(SPIN_TRAVEL * 0.9);
    expect(end.z).toBeLessThan(start.z);                                  // closer to the rim than I started
    let maxStep = 0, prev = at0;
    for (let t = 1 / 60; t <= p.sec; t += 1 / 60) { const q = spinPos(p, t); maxStep = Math.max(maxStep, Vector3.Distance(q, prev)); prev = q; }
    expect(maxStep).toBeLessThan(6.4 / 60);                               // never faster than the dribble's own sprint: a body, not a teleport
  });
  it('the DRIVE trigger: a body in front of me, at speed, inside reach', () => {
    const vel = V(0, -5);                                                 // driving at the rim
    expect(spinOffContact(vel, me(), PI, V(0, 1.7))).toBe(true);          // he is in front, 0.9 m off
    expect(spinOffContact(V(0, -1), me(), PI, V(0, 1.7))).toBe(false);    // walking: no spin
    expect(spinOffContact(vel, me(), PI, V(0, 0.2))).toBe(false);         // too far away to be the body I met
    expect(spinOffContact(vel, me(), PI, V(1.5, 2.6))).toBe(false);       // beside me, not in front
    expect(spinOffContact(vel, me(), PI, null)).toBe(false);
    expect(SPIN_MIN_SPEED).toBeLessThan(6.4); expect(SPIN_TRIGGER_RANGE).toBeGreaterThan(1.1);   // reachable off a real drive, past the standoff
  });
  it('the POST trigger: the stick swung across the body, not into it', () => {
    // body-right at yaw π is −x
    expect(postSpinSide(-1, 0, PI)).toBe('right');
    expect(postSpinSide(1, 0, PI)).toBe('left');
    expect(postSpinSide(0, -1, PI)).toBeNull();                           // straight at the rim: that is a back-down
    expect(postSpinSide(0, 0, PI)).toBeNull();
    expect(postSpinSide(-0.2, -0.98, PI)).toBeNull();                     // mostly a back-down
    expect(POST_SPIN_STICK_MIN).toBeGreaterThan(0.4);                     // a real swing across, not a drift
  });
  it('the spin is one pivot: SPIN_SEC is a beat, not a drill', () => {
    expect(SPIN_SEC).toBeGreaterThan(0.35); expect(SPIN_SEC).toBeLessThan(0.8);
  });
});


// ════════════════════════════════════════════════════════════════════════════
// HOOPS-MOVE-KIT-B wave 2 (2026-09-08) — M7 running hook, M8 pump + step-through, M9 pivots, M10 floater over length,
// M11 reverse, M12 bank, M13 hop step, M14 euro step.
// ════════════════════════════════════════════════════════════════════════════
/** Integrate a gather's legs at 60 Hz: where the body ends up, and how far it walked. */
function walk(plan: ReturnType<typeof planEuro>): { end: Vector3; travel: number; samples: Vector3[] } {
  const end = new Vector3(0, 0, 0); let travel = 0; const samples: Vector3[] = [];
  for (let t = 0; t < plan.sec - 1e-6; t += 1 / 60) {
    const w = legWish(plan, t);
    end.addInPlace(w.scale(1 / 60)); travel += w.length() / 60; samples.push(end.clone());
  }
  return { end, travel, samples };
}

describe('M7 — the running hook', () => {
  it('a body in the way between me and the rim is what the read is', () => {
    expect(helpInTheWay(V(0, 3), RIM, V(0, 1.5), 2.4, 1.2)).toBe(true);
    expect(helpInTheWay(V(0, 3), RIM, V(1.6, 1.5), 2.4, 1.2)).toBe(false);   // off the line
    expect(helpInTheWay(V(0, 3), RIM, V(0, 4.2), 2.4, 1.2)).toBe(false);     // behind me
    expect(helpInTheWay(V(0, 3), RIM, null, 2.4, 1.2)).toBe(false);
  });
  it('a hook ON THE MOVE: in the paint band, moving, over a body — not from a standstill, not from the arc', () => {
    // THE BAND IS MEASURED FROM THE RIM, AND THE RIM IS NOT THE ORIGIN (2026-09-12 release pass). This case carried the
    // shooter fixture over from the helpInTheWay test above, which has no distance constraint — but RIM sits at z -0.6,
    // so `V(0, 3)` stands 3.6 m out, past RUN_HOOK_MAX (3.0), and the hook correctly refused it. The test has been red
    // since M7 landed and it was the test that was wrong: the band is the deliberate, probe-measured narrow one
    // (outside it a drive is a layup inside 2.2 m or a pull-up / floater past 3.0), so the fixture moves into the paint
    // rather than the band moving out to meet it.
    expect(runningHook(V(0, -3), V(0, 2), RIM, V(0, 0.9))).toBe(true);       // 2.6 m out, a body a metre up the line
    expect(runningHook(V(0, -0.4), V(0, 2), RIM, V(0, 0.9))).toBe(false);    // standing: that is the jump hook
    expect(runningHook(V(0, -3), V(0, 2), RIM, null)).toBe(false);           // nobody to hook over: lay it in
    expect(runningHook(V(0, -3), V(0, 8), RIM, V(0, 6.6))).toBe(false);      // out past the band
    expect(runningHook(V(0, -3), V(0, 3), RIM, V(0, 1.6))).toBe(false);      // 3.6 m: past the band, by design
  });
});

describe('M8 — the pump fake and the step-through', () => {
  it('a squeeze let go this early is a FAKE, not a brick', () => {
    expect(isPumpFake(0.1)).toBe(true);
    expect(isPumpFake(PUMP_MAX_SEC + 0.01)).toBe(false);
    expect(PUMP_MAX_SEC).toBeLessThan(0.35);   // well before any green: nothing shootable is lost
  });
  it('the step goes PAST the shoulder he is NOT on, and ends in a layup on that hand', () => {
    const onMyRight = planStepThrough(V(0, 3), RIM, PI, V(-0.7, 3));   // body-right at yaw π is −x
    expect(onMyRight.kind).toBe('stepthrough');
    expect(onMyRight.then).toBe('layup');
    expect(onMyRight.side).toBe('left');
    const w = walk(onMyRight);
    expect(w.travel).toBeGreaterThan(0.5); expect(w.travel).toBeLessThan(0.85);   // one step, not a drive
    expect(w.end.z).toBeLessThan(0);                                              // and it goes at the rim …
    expect(w.end.x).toBeGreaterThan(0.2);                                         // … around his other side (+x = my left)
    const onMyLeft = planStepThrough(V(0, 3), RIM, PI, V(0.7, 3));
    expect(onMyLeft.side).toBe('right');
    expect(walk(onMyLeft).end.x).toBeLessThan(-0.2);
    expect(legWish(onMyRight, onMyRight.sec + 0.01).length()).toBe(0);            // the step is over when it is over
    expect(legWish(onMyRight, 0).length()).toBeCloseTo(STEP_THROUGH_SPEED, 5);
  });
});

describe('M9 — the pivot and the reverse pivot', () => {
  it('the stick across opens a FRONT pivot; across and BACK is a reverse', () => {
    // body-right at yaw π is −x, forward is −z
    expect(pivotFrom(-1, 0, PI)).toEqual({ side: 'right', reverse: false });
    expect(pivotFrom(1, 0, PI)).toEqual({ side: 'left', reverse: false });
    expect(pivotFrom(-0.7, 0.7, PI)!.reverse).toBe(true);      // across and back through my own body
    expect(pivotFrom(0, -1, PI)).toBeNull();                    // straight ahead: that is a drive
    expect(pivotFrom(0, 0, PI)).toBeNull();
    expect(PIVOT_STICK_MIN).toBeGreaterThan(0.3);
  });
  it('a pivot turns IN PLACE — the planted foot never moves and the body goes nowhere', () => {
    const start = V(0, 3);
    const front = planPivot(start, PI, 'right', false);
    expect(Math.abs(front.sweep)).toBeCloseTo(PIVOT_FRONT_SWEEP, 5);
    expect(front.sec).toBeCloseTo(PIVOT_SEC, 5);
    const end = spinPos(front, front.sec);
    // the root swings around the foot, so it moves a little — but never a step, and it never travels down a line
    expect(Vector3.Distance(end, start)).toBeLessThan(0.45);
    expect(Vector3.Distance(spinPos(front, 0), start)).toBeCloseTo(0, 5);
    const reverse = planPivot(start, PI, 'right', true);
    expect(Math.abs(reverse.sweep)).toBeCloseTo(PIVOT_REVERSE_SWEEP, 5);
    expect(Math.sign(reverse.sweep)).toBe(-Math.sign(front.sweep));   // it turns the OTHER way, through the back
    expect(Vector3.Distance(spinPos(reverse, reverse.sec), start)).toBeLessThan(0.45);
  });
  it('a pivot is readable: eased, monotonic, and it ends facing where it turned to', () => {
    const p = planPivot(V(0, 3), PI, 'right', false);
    let prev = spinYaw(p, 0), maxStep = 0;
    for (let t = 1 / 60; t <= p.sec + 1e-9; t += 1 / 60) { const y = spinYaw(p, t); maxStep = Math.max(maxStep, Math.abs(y - prev)); prev = y; }
    expect(maxStep).toBeLessThan(0.35);
    expect(spinYaw(p, p.sec)).toBeCloseTo(PI + PIVOT_FRONT_SWEEP, 5);
    expect(Math.atan2(p.exit.x, p.exit.z)).toBeCloseTo(Math.atan2(Math.sin(PI + PIVOT_FRONT_SWEEP), Math.cos(PI + PIVOT_FRONT_SWEEP)), 5);
  });
});

describe('M10 — the floater over length', () => {
  it('a body sitting in the lane protects the rim; one standing off it does not', () => {
    expect(rimProtected(V(0, 3), RIM, V(0, 1.0))).toBe(true);        // in the lane, near the rim, on my line
    expect(rimProtected(V(0, 3), RIM, V(0, 4.0))).toBe(false);       // behind me
    expect(rimProtected(V(0, 3), RIM, V(2.6, 0.4))).toBe(false);     // near the rim but off my line
    expect(rimProtected(V(0, 3), RIM, null)).toBe(false);
  });
});

describe('M11 — the reverse', () => {
  it('a drive ACROSS the rim from under it finishes reverse; a drive AT it does not', () => {
    expect(isReverseFinish(V(0.2, -1.3), RIM, V(-4, 0))).toBe(true);      // carried past the ring, running across it
    expect(isReverseFinish(V(0, 1.2), RIM, V(0, -4))).toBe(false);        // straight at it: that is a layup
    expect(isReverseFinish(V(0, 4), RIM, V(-4, 0))).toBe(false);          // too far out
    expect(isReverseFinish(V(0.2, -1.3), RIM, V(-0.3, 0))).toBe(false);   // walking: no reverse
    expect(REVERSE_RANGE).toBeLessThan(2.2);                              // it is a shot from UNDER the rim
  });
  it('it finishes on the side the drive is carrying me to', () => {
    expect(reverseSide(V(0, 0), RIM, PI, V(-3, 0))).toBe('right');   // body-right at yaw π is −x
    expect(reverseSide(V(0, 0), RIM, PI, V(3, 0))).toBe('left');
  });
});

describe('M12 — the bank', () => {
  const N = new Vector3(0, 0, 1);   // the board faces the court
  it('the band is the angle at which the square helps — not straight on, not from the baseline', () => {
    expect(inBankBand(V(0, 3), RIM, N)).toBe(false);                 // dead straight: 0° — swish it
    expect(inBankBand(V(2.4, 2.4), RIM, N)).toBe(true);              // ~45° off the board: the wing
    expect(inBankBand(V(4.5, 0.2), RIM, N)).toBe(false);             // along the baseline: no square
    expect(inBankBand(V(0.2, 0.3), RIM, N)).toBe(false);             // under the rim: too close for the square
    expect(inBankBand(V(4.5, 7.5), RIM, N)).toBe(false);             // too far
    expect(BANK_MIN_DEG).toBeGreaterThan(0); expect(BANK_MAX_DEG).toBeLessThan(90);
  });
  it('the point is ON the square: above the ring, behind it, on my side of the box', () => {
    const rim = new Vector3(0, 3.05, -0.6);
    const right = bankPoint(V(2.4, 2.4), rim, N);
    expect(right.y).toBeCloseTo(rim.y + BANK_UP, 5);
    expect(right.z).toBeLessThan(rim.z);                             // behind the ring, on the glass
    const left = bankPoint(V(-2.4, 2.4), rim, N);
    expect(Math.sign(right.x - rim.x)).toBe(-Math.sign(left.x - rim.x));   // the box is used on the shooter's side
  });
});

describe('M13 — the hop step', () => {
  it('the hop is ONE forward gather onto two feet — legal, never a travel pop', () => {
    const p = planHopStep(V(0, -5), V(0, 3), RIM, 'layup');
    expect(p.kind).toBe('hop'); expect(p.then).toBe('layup'); expect(p.sec).toBeCloseTo(HOP_SEC, 5);
    const w = walk(p);
    expect(w.travel).toBeLessThanOrEqual(HOP_TRAVEL_MAX);
    expect(travelOf(p)).toBeLessThanOrEqual(HOP_TRAVEL_MAX);
    expect(w.end.z).toBeLessThan(-0.4);                              // it hops where the drive was going: at the rim
    expect(gatherLabel(p.kind, 'X')).toBe('HOP STEP');
  });
  it('a hop from a standstill goes at the rim, and it can end in a rise instead', () => {
    const p = planHopStep(V(0, 0), V(2, 3), RIM, 'rise');
    expect(p.then).toBe('rise');
    const w = walk(p);
    expect(w.end.x).toBeLessThan(0); expect(w.end.z).toBeLessThan(0);   // toward (0, −0.6) from (2, 3)
  });
});

describe('M14 — the euro step', () => {
  it('a euro needs a drive, the band, and help to evade', () => {
    expect(euroAvailable(V(0, -4), V(0, 3.4), RIM, V(0, 1.8))).toBe(true);
    expect(euroAvailable(V(0, -0.5), V(0, 3.4), RIM, V(0, 1.8))).toBe(false);   // walking
    expect(euroAvailable(V(0, -4), V(0, 3.4), RIM, null)).toBe(false);          // nobody to euro around
    expect(euroAvailable(V(0, -4), V(0, 9), RIM, V(0, 7)), 'out past the band').toBe(false);
  });
  it('step A SELLS one way and step B CROSSES the other — two steps, opposite sides, both gaining ground', () => {
    const p = planEuro(V(0, 3.4), RIM, PI, 'right');
    expect(p.kind).toBe('euro'); expect(p.side).toBe('left');   // it finishes on the CROSSING hand
    expect(p.sec).toBeCloseTo(EURO_A_SEC + EURO_B_SEC, 5);
    const a = legWish(p, EURO_A_SEC * 0.5), b = legWish(p, EURO_A_SEC + EURO_B_SEC * 0.5);
    const right = bodyRight(PI);
    const latA = Vector3.Dot(a, right) / a.length(), latB = Vector3.Dot(b, right) / b.length();
    expect(latA).toBeGreaterThan(0.4);                          // A sells to my right …
    expect(latB).toBeLessThan(-0.4);                            // … B crosses to my left
    expect(a.z).toBeLessThan(0); expect(b.z).toBeLessThan(0);   // both steps gain ground at the rim
    expect(b.length()).toBeGreaterThan(a.length());             // the crossing step is the hard one
    const w = walk(p);
    expect(w.end.z).toBeLessThan(-0.5);                         // net: closer to the rim
    expect(w.end.x).toBeGreaterThan(0);                         // and out the far side (+x = my left at yaw π)
    expect(gatherLabel(p.kind, 'X')).toBe('EURO STEP');
  });
  it('the stick picks the side it sells to; a straight stick asks for no euro', () => {
    expect(euroSell(-1, 0, PI)).toBe('right');
    expect(euroSell(1, 0, PI)).toBe('left');
    expect(euroSell(0, -1, PI)).toBeNull();
  });
});

// ── THE RUNNING FADEAWAY, EITHER DIRECTION, FROM ANYWHERE (owner, 2026-09-13) ─────────────────────────────
//
// "Running shots like Kobe's baseline jumper fadeaways either direction from anywhere." Three things had to
// change: a fade required a defender (so you could not rise and fade to CREATE separation, which is the
// point of the shot), it had no direction, and — the part that would have made the whole thing cosmetic —
// the body drifted straight back regardless of what the HUD said.

describe('a fade is a movement read, not a contest read', () => {
  const rim = new Vector3(0, 3.05, -0.6);
  const at = (x: number, z: number) => new Vector3(x, 0, z);

  it('FADES WITH NOBODY ON YOU — the separation is the point of the shot', () => {
    // this returned 'jumper' before: `movingAway && contest01 > 0.25` demanded a defender first
    const c = classifyShot(at(0, 6), new Vector3(0, 0, 3), rim, 0);
    expect(c.style).toBe('fadeaway');
  });

  it('from anywhere: the deep fade and the mid fade are both fades', () => {
    for (const z of [3, 6, 9, 12]) {
      expect(classifyShot(at(0, z), new Vector3(0, 0, 3), rim, 0).style, `${z}m`).toBe('fadeaway');
    }
  });

  it('but standing still is still a jumper — it is the drift that makes it a fade', () => {
    expect(classifyShot(at(0, 6), new Vector3(0, 0, 0), rim, 0).style).toBe('jumper');
    expect(classifyShot(at(0, 6), new Vector3(0, 0, 0.4), rim, 0).style).toBe('jumper');   // a wobble, not a drift
  });

  it('and driving IN is never a fade, however fast', () => {
    expect(classifyShot(at(0, 6), new Vector3(0, 0, -6), rim, 0).style).not.toBe('fadeaway');
  });
});

describe('either direction', () => {
  const rim = new Vector3(0, 3.05, -0.6);
  const at = (x: number, z: number) => new Vector3(x, 0, z);

  // HANDEDNESS, because this is exactly the sign that gets flipped and never noticed. Babylon is
  // LEFT-handed: a shooter at +z facing a rim at -z is facing -z, and cross(up, forward) puts their right
  // at -x. So drifting toward +x is the shooter's LEFT. I asserted the opposite on the first run and the
  // test caught it; the convention matches `shotDirection`'s right = (fz, -fx) elsewhere in this file.
  it('drifting across reads as a BASELINE fade, and names the side', () => {
    const toMinusX = classifyShot(at(0, 6), new Vector3(-3, 0, 1), rim, 0);
    const toPlusX = classifyShot(at(0, 6), new Vector3(3, 0, 1), rim, 0);
    expect(toMinusX.drift).toBe('right');
    expect(toPlusX.drift).toBe('left');
    expect(toMinusX.label).toMatch(/BASELINE FADE — RIGHT/);
    expect(toPlusX.label).toMatch(/BASELINE FADE — LEFT/);
  });

  it('the two directions are mirror images, not one favoured side', () => {
    const right = classifyShot(at(0, 6), new Vector3(3, 0, 1), rim, 0);
    const left = classifyShot(at(0, 6), new Vector3(-3, 0, 1), rim, 0);
    expect(right.pctMod).toBe(left.pctMod);
  });

  it('straight back is not a baseline fade', () => {
    const c = classifyShot(at(0, 6), new Vector3(0, 0, 4), rim, 0);
    expect(c.drift).toBe('none');
    expect(c.label).toBe('FADEAWAY');
  });

  it('A BASELINE FADE IS HARDER THAN A STRAIGHT ONE — the shoulders turn away from the rim', () => {
    const across = classifyShot(at(0, 6), new Vector3(3, 0, 1), rim, 0);
    const back = classifyShot(at(0, 6), new Vector3(0, 0, 4), rim, 0);
    expect(across.pctMod).toBeLessThan(back.pctMod);
  });
});

describe('THE DIRECTION REACHES THE BODY, or it is only a label', () => {
  const rimFloor = new Vector3(0, 0, -0.6);
  const shooter = new Vector3(0, 0, 6);

  it('a straight fade drifts away from the rim', () => {
    const away = postFadeAway(shooter, rimFloor, null, 'none');
    expect(away.z).toBeGreaterThan(0.9);          // straight back
    expect(Math.abs(away.x)).toBeLessThan(0.1);
  });

  it('a baseline fade actually goes ACROSS — this is what made it a real shot', () => {
    const right = postFadeAway(shooter, rimFloor, null, 'right');
    const left = postFadeAway(shooter, rimFloor, null, 'left');
    // left-handed: facing -z, the shooter's right is -x (see the handedness note above)
    expect(Math.abs(right.x)).toBeGreaterThan(0.4);
    expect(right.x).toBeLessThan(0);
    expect(left.x).toBeGreaterThan(0);
    // and still gives some ground, or it is a drive rather than a fade
    expect(right.z).toBeGreaterThan(0);
  });

  it('the two directions mirror exactly', () => {
    const right = postFadeAway(shooter, rimFloor, null, 'right');
    const left = postFadeAway(shooter, rimFloor, null, 'left');
    expect(right.x).toBeCloseTo(-left.x, 6);
    expect(right.z).toBeCloseTo(left.z, 6);
  });

  it('every drift direction returns a unit vector', () => {
    for (const d of ['none', 'left', 'right'] as const) {
      expect(postFadeAway(shooter, rimFloor, null, d).length()).toBeCloseTo(1, 6);
    }
  });

  it('and it still defaults to the old behaviour when no direction is given', () => {
    expect(postFadeAway(shooter, rimFloor, null).equalsWithEpsilon(postFadeAway(shooter, rimFloor, null, 'none'), 1e-6)).toBe(true);
  });
});
