// DUNK-FLAGSHIP P11 — the over-the-ring finish, behind the knob `dunk.finishOverRing` (off). Owner call 1 of 2026-11-10: the
// shipped finish stays exactly as it is; the over-the-ring contact is an A/B the owner can feel before any default moves.
//   · 0 (the default) is the shipped finish: the mode's shipped lines are still there, verbatim, on the knob-off branch;
//   · 1: the hand path is lift → in → down, and the ball is let go INSIDE the ring's radius (the contact line's `flat`);
//   · the knob never turns a make into a miss: a ball the hand could not carry over is let go at the front of the rim;
//   · the 16 air tricks never see it, and it never applies in ranked, staked or challenge play (DunkUnlocks.verifiedJump.test).
// The path is proved here on the mode's own contact rule (DunkContact.jamIronStep) and release math (RimFlush.sweptTouch /
// clearOfIron) with the ball riding the reach's lagged target; the real body is measured on the rig (docs/DUNK-FLAGSHIP.md §17).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Vector3 } from '@babylonjs/core';
import { FINISH_OVER_RING, OVER_RING, overRingOn, overRingLeg, overRingAim, overRingDefers, overRingHoldsBody, overRingFollows, flatOf, type V3, type OverRingLeg } from './DunkOverRing';
import { jamIronStep, JAM_SHORT_SEC } from './DunkContact';
import { lagToward, jamRootStep, jamFollowExtra, WRIST_LAG_TAU } from './DunkHands';
import { sweptTouch, clearOfIron } from './RimFlush';
import { rimApproachAim } from '../anim/rimReach';
import { HOOP, RIM_HEIGHT_M } from './courtDims';
import { DUNK_TRICKS } from './DunkSystem';

const DUNK = readFileSync(path.join(__dirname, '../modes/DunkMode.ts'), 'utf8');
/** Dunk mode's own ring radius for the jam (the `[HANDS] iron contact` line's "of the ring's …"), read from the mode. */
const RING_R = Number(/\n  const RIM_RADIUS = ([\d.]+);/.exec(DUNK)![1]);
const BALL_R = 0.12, DT = 1 / 60;
const rim = { x: 0, y: RIM_HEIGHT_M, z: -10.28 };
const at = (r: number, dy: number, x = 0): V3 => ({ x: rim.x + x, y: rim.y + dy, z: rim.z + Math.sqrt(Math.max(0, r * r - x * x)) });

/** The slam's first frame as the rig measured it on the shipped finish, 5 plain slams on the beat (2026-11-10, build f4428bd0,
 *  docs/DUNK-FLAGSHIP.md §17): the body at the top of its arc (root 1.766 m, 0.60 m in front of the ring's axis) and the ball
 *  where the reach had it — `r` out from the axis, `dy` over the ring's plane — with what the shipped finish then did. */
const MEASURED: { r: number; dy: number; shippedFlat: number }[] = [
  { r: 0.350, dy: 0.181, shippedFlat: 0.182 }, { r: 0.440, dy: 0.163, shippedFlat: 0.347 }, { r: 0.451, dy: 0.237, shippedFlat: 0.277 },
  { r: 0.257, dy: 0.214, shippedFlat: 0.165 }, { r: 0.557, dy: 0.247, shippedFlat: 0.276 },
];
const ROOT_Y0 = 1.766, ROOT_Z0 = 0.60;
// DunkMode's jam constants (read from the mode, so a re-tune there re-runs this on the new numbers)
const num = (name: string): number => Number(new RegExp(`\\b${name} = ([\\d.]+)`).exec(DUNK)![1]);
const JAM_Y = num('JAM_Y'), JAM_FOLLOW_M = num('JAM_FOLLOW_M'), JAM_FOLLOW_TAU = num('JAM_FOLLOW_TAU'), JAM_LIFT_TAU = num('JAM_LIFT_TAU'), JAM_DROP_TAU = num('JAM_DROP_TAU'), FLUSH_Z_AHEAD = num('FLUSH_Z_AHEAD');

/**
 * One jam, as DunkMode steps it: the body's follow-through in (jamFollowExtra, JAM_FOLLOW_TAU) and its drop onto the iron
 * (jamRootStep), the ball carried with the body and pulled toward the reach's aim behind the wrist's lag (lagToward,
 * WRIST_LAG_TAU), the mode's contact rule (jamIronStep) and its release math (sweptTouch, clearOfIron). `over` = the knob on:
 * the over-the-ring aim, the body holding its height until the ball is over the hole, a contact from outside deferred.
 */
function jam(start: { r: number; dy: number }, over: boolean, opts: { reachCapDy?: number } = {}): { kind: 'contact' | 'short'; flat: number; sec: number; dyAtLip: number | null; held: number } {
  const ball = at(start.r, start.dy), aim = { x: 0, y: 0, z: 0 }, v = new Vector3();
  let rootY = ROOT_Y0, rootZ = rim.z + ROOT_Z0, prev: V3 | null = null, held = 0, dyAtLip: number | null = null, leg: OverRingLeg | null = null;
  for (let jamSec = DT; jamSec < 2; jamSec += DT) {
    const before = { ...ball }, y0 = rootY, z0 = rootZ;
    // the body: in over the jam, and down onto the iron — over the ring, not down until the ball is over the hole
    if (over) leg = overRingLeg(leg, ball, rim, RING_R, BALL_R, jamSec);
    if (!over || overRingFollows(leg)) rootZ += (rim.z + FLUSH_Z_AHEAD - JAM_FOLLOW_M + (over ? OVER_RING.followBackM : -jamFollowExtra(flatOf(ball, rim))) - rootZ) * Math.min(1, DT / JAM_FOLLOW_TAU);
    if (!(over && rootY > JAM_Y && overRingHoldsBody(leg))) rootY = jamRootStep(rootY, JAM_Y, DT, JAM_LIFT_TAU, JAM_DROP_TAU);
    ball.y += rootY - y0; ball.z += rootZ - z0;   // the ball rides the body…
    // …and the reach pulls it toward its aim behind the wrist's lag
    if (over) overRingAim(leg!, ball, rim, RING_R, BALL_R, aim);
    else { rimApproachAim(ball, rim as Vector3, RING_R, BALL_R, v); aim.x = v.x; aim.y = v.y; aim.z = v.z; if (flatOf(ball, rim) <= RING_R - (BALL_R + 0.01) + 0.02) aim.y = rim.y - 0.06; }
    lagToward(ball, aim, DT, WRIST_LAG_TAU, ball);
    if (opts.reachCapDy !== undefined) ball.y = Math.min(ball.y, rim.y + opts.reachCapDy);
    if (flatOf(before, rim) > RING_R && flatOf(ball, rim) <= RING_R) dyAtLip = ball.y - rim.y;
    const step = jamIronStep({ ball, rim, rimRadius: RING_R, ballRadius: BALL_R, sincePress: jamSec, centred: true });
    if (step?.kind === 'contact' && over && overRingDefers(ball, rim, RING_R, BALL_R, jamSec)) { held++; prev = { ...ball }; continue; }
    if (step?.kind === 'contact') { const touch = clearOfIron(prev ? sweptTouch(prev, ball, rim, RING_R, BALL_R) : ball, rim, RING_R, BALL_R); return { kind: 'contact', flat: flatOf(touch, rim), sec: jamSec, dyAtLip, held }; }
    if (step?.kind === 'short') return { kind: 'short', flat: flatOf(ball, rim), sec: jamSec, dyAtLip, held };
    prev = { ...ball };
  }
  throw new Error('the jam never ended');
}

describe('the knob', () => {
  it('is off by default, and 0 is off', () => {
    expect(FINISH_OVER_RING).toBe(0);
    expect(overRingOn(FINISH_OVER_RING)).toBe(false);
    expect(overRingOn(0)).toBe(false);
    expect(overRingOn(1)).toBe(true);
  });
  it('the ring it is measured against is Dunk mode\'s jam ring, inside the regulation radius (courtDims)', () => {
    expect(RING_R).toBeLessThanOrEqual(HOOP.RIM_RADIUS);
    expect(RING_R).toBeGreaterThan(BALL_R);
  });
});

describe('the path: (up in front of the rim,) in over it, down through the middle — forward only', () => {
  const leg = (prev: OverRingLeg | null, p: V3, t = 0.05) => overRingLeg(prev, p, rim, RING_R, BALL_R, t);
  it('a jam starts on the way in when the ball is over the contact\'s height band, and on the lift when it is in or under it outside the ring', () => {
    expect(leg(null, at(0.44, 0.163))).toBe('in');     // the rig's slams: the ball 0.16–0.25 m over the plane at the press
    expect(leg(null, at(0.33, 0.03))).toBe('lift');    // at the front iron, in the band: up first
    expect(leg(null, at(0.5, -0.15))).toBe('lift');
    expect(leg(null, at(RING_R - OVER_RING.insideM - 0.01, 0.2))).toBe('down');
  });
  it('the legs only go forward: a ball that dips or drifts back out does not flip the path back', () => {
    expect(leg('lift', at(0.4, BALL_R + OVER_RING.clearM - 0.01))).toBe('lift');
    expect(leg('lift', at(0.4, BALL_R + OVER_RING.clearM + 0.01))).toBe('in');
    expect(leg('in', at(0.4, 0.0))).toBe('in');                                        // dipped under the clearance: still on the way in
    expect(leg('in', at(RING_R - OVER_RING.insideM - 0.01, 0.2))).toBe('down');
    expect(leg('down', at(0.4, 0.3))).toBe('down');                                    // drifted back out: still going down (the rig's 0.4 s hover was this flip)
    expect(leg('bail', at(0.05, 0.3))).toBe('bail');
  });
  it('while the push is not allowed (the REVERSE still turning: a negative clock) the ball is held over the ring, never pushed down', () => {
    expect(leg(null, at(RING_R - OVER_RING.insideM - 0.01, 0.2), -1)).toBe('in');
    expect(leg('in', at(0.05, 0.3), -1)).toBe('in');
  });
  it('the way in aims over the centre above the clearance; the lift is straight up (out from under the lip only when under the plane); the push aims under the plane', () => {
    const out = { x: 0, y: 0, z: 0 };
    overRingAim('in', at(0.4, 0.2), rim, RING_R, BALL_R, out);
    expect(flatOf(out, rim)).toBeCloseTo(0, 6); expect(out.y - rim.y).toBeCloseTo(BALL_R + OVER_RING.aimUpM, 6);
    overRingAim('lift', at(0.33, 0.03), rim, RING_R, BALL_R, out);
    expect(flatOf(out, rim)).toBeCloseTo(0.33, 6); expect(out.y - rim.y).toBeCloseTo(BALL_R + OVER_RING.aimUpM, 6);
    overRingAim('lift', at(0.26, -0.12), rim, RING_R, BALL_R, out);   // under the lip: out from under it first
    expect(flatOf(out, rim)).toBeCloseTo(RING_R + BALL_R + OVER_RING.frontGapM, 6);
    overRingAim('down', at(0.05, 0.2), rim, RING_R, BALL_R, out);
    expect(flatOf(out, rim)).toBeCloseTo(0, 6); expect(out.y).toBeLessThan(rim.y);
    expect(OVER_RING.aimUpM).toBeGreaterThan(OVER_RING.clearM);
  });
  it('past the give-up time the path ends: inside the ring it goes down wherever it is, outside it comes down onto the front of the rim', () => {
    expect(leg('in', at(RING_R - 0.01, 0.2), OVER_RING.giveUpSec)).toBe('down');
    expect(leg('in', at(0.4, 0.2), OVER_RING.giveUpSec)).toBe('bail');
    const out = { x: 0, y: 0, z: 0 };
    overRingAim('bail', at(0.6, 0.2), rim, RING_R, BALL_R, out);
    expect(flatOf(out, rim)).toBeLessThan(RING_R + BALL_R);            // within the contact's reach of the iron
    expect(out.y - rim.y).toBeGreaterThanOrEqual(-0.03); expect(out.y - rim.y).toBeLessThanOrEqual(BALL_R * 0.6);   // ironContact's height band
    expect(jamIronStep({ ball: out, rim, rimRadius: RING_R, ballRadius: BALL_R, sincePress: 0.5, centred: true })?.kind).toBe('contact');
    expect(OVER_RING.giveUpSec).toBeLessThan(JAM_SHORT_SEC - 0.1);   // …with time left to be let go before SHORT OF THE IRON
  });
});

describe('the contact: let go INSIDE the ring (the shipped jam meets the front of the rim from outside when the ball was the further out)', () => {
  it('the model of the shipped jam reproduces the rig: the three slams that found the ball over 0.4 m out met the iron from OUTSIDE the ring', () => {
    for (const m of MEASURED) {
      const was = jam(m, false);
      expect(was.kind).toBe('contact');
      // the same side of the ring's radius as the rig measured, slam for slam (this is what fails if the old path were already inside)
      expect(was.flat > RING_R, `r ${m.r} dy ${m.dy}: measured flat ${m.shippedFlat}, model ${was.flat.toFixed(3)}`).toBe(m.shippedFlat > RING_R);
    }
    expect(MEASURED.filter((m) => m.shippedFlat <= RING_R)).toHaveLength(2);   // the rig's "2 of 5 inside the ring"
  });
  for (const m of MEASURED) {
    it(`over the ring, the slam that found the ball ${m.r} m out and ${m.dy} m up is let go inside the ring, having crossed the lip above the iron`, () => {
      const now = jam(m, true);
      expect(now.kind).toBe('contact');
      expect(now.flat).toBeLessThanOrEqual(RING_R);
      expect(now.dyAtLip, 'it crossed the lip').not.toBeNull();
      expect(now.dyAtLip!).toBeGreaterThanOrEqual(BALL_R * 0.6);   // above the contact's height band: over the iron, not through its front
      expect(now.sec).toBeLessThan(OVER_RING.giveUpSec);            // carried over, not timed out
    });
  }
  it('the body holds its height while the ball is lifted and carried in, and comes down with it', () => {
    expect(overRingHoldsBody('lift')).toBe(true); expect(overRingHoldsBody('in')).toBe(true); expect(overRingHoldsBody(null)).toBe(true);
    expect(overRingHoldsBody('down')).toBe(false);
    expect(overRingHoldsBody('bail')).toBe(true);   // the hand alone lowers it onto the front of the rim (rig: a dropping body carried it past the iron, a miss)
  });
  it('a ball at the front iron is HELD, not let go there, while the hand can still carry it over — and never past the give-up time', () => {
    expect(overRingDefers(at(0.33, 0.03), rim, RING_R, BALL_R, 0.05)).toBe(true);
    expect(overRingDefers(at(0.2, 0.05), rim, RING_R, BALL_R, 0.05)).toBe(false);    // inside the ring: never held
    expect(overRingDefers(at(RING_R + 0.03, 0.03), rim, RING_R, BALL_R, 0.05)).toBe(false);   // half across the lip: let go, never carried through the metal
    expect(overRingDefers(at(0.33, 0.03), rim, RING_R, BALL_R, OVER_RING.giveUpSec)).toBe(false);   // time is up: let go as shipped
    expect([overRingFollows('lift'), overRingFollows('bail'), overRingFollows(null), overRingFollows('in'), overRingFollows('down')]).toEqual([false, false, false, true, true]);   // the body carries in only once the ball is over the ring
  });
  it('a hand that cannot carry it over never makes a miss of it: the ball is let go at the front of the rim before SHORT OF THE IRON', () => {
    // an arm that tops out under the clearance (the ball never rises past the ring's plane + 8 cm) from a low, far-out start
    const end = jam({ r: 0.45, dy: 0.0 }, true, { reachCapDy: 0.08 });
    expect(end.kind).toBe('contact');
    expect(end.sec).toBeGreaterThanOrEqual(OVER_RING.giveUpSec); expect(end.sec).toBeLessThan(JAM_SHORT_SEC);
    expect(end.flat).toBeGreaterThan(RING_R);   // reported honestly: outside, as the shipped finish
  });
});

describe('DunkMode: knob off is the shipped finish, line for line', () => {
  it('the knob is read in ONE place, through feel(), against the default', () => {
    expect(DUNK.split("feel('dunk.finishOverRing'").length - 1).toBe(1);
    expect(DUNK).toContain("const finishOverRing = (): boolean => overRingOn(feel('dunk.finishOverRing', FINISH_OVER_RING));");
  });
  it('every use sits behind the knob, and the shipped lines are still there, verbatim, on the other branch', () => {
    // the reach's aim: only through the jam (never before the slam, never in the replay); the shipped body of rimApproachAim follows untouched
    expect(DUNK).toContain("    if (finishOverRing() && !replaying && phase === 'resolve' && qteHit && jamSec >= 0 && !jamContact && overLeg) return overRingAim(overLeg, bw, rim, RIM_RADIUS, ballSim.radius, _aim);\n    const dx = bw.x - rim.x, dz = bw.z - rim.z, r = Math.hypot(dx, dz);");
    expect(DUNK).toContain("    if (r <= RIM_RADIUS - c + 0.02 && phase === 'resolve' && qteHit) { _aim.y = rim.y - 0.06; return _aim; }\n    if (bw.y >= rim.y + 0.02 || r <= RIM_RADIUS - c || r >= RIM_RADIUS + c + 0.25) return _aim;");
    // the jam: the leg is stepped, the follow-through shortened and the height held only with the knob on; the shipped steps are the else branches
    expect(DUNK).toContain("              const overRing = finishOverRing();\n              if (overRing) overLeg = overRingLeg(jamSec <= dt ? null : overLeg, ball.getAbsolutePosition(), rim, RIM_RADIUS, ballSim.radius, overRingJamSec());\n              if (overRing) { if (overRingFollows(overLeg)) player.root.position.z += (rim.z + FLUSH_Z_AHEAD - JAM_FOLLOW_M + OVER_RING.followBackM - player.root.position.z) * Math.min(1, dt / JAM_FOLLOW_TAU); }\n              else player.root.position.z += (rim.z + FLUSH_Z_AHEAD - JAM_FOLLOW_M - jamExtra - player.root.position.z) * Math.min(1, dt / JAM_FOLLOW_TAU);");
    expect(DUNK).toContain("const jamY = JAM_Y + (inOffHand() ? JAM_Y_LEFT_EXTRA : 0) + (finishVariant === 'reverse' ? REVERSE_JAM_LIFT : 0);");
    expect(DUNK).toContain("              if (overRing && player.root.position.y > jamY && overRingHoldsBody(overLeg)) { /* held */ }\n              else player.root.position.y = jamRootStep(player.root.position.y, jamY, dt, JAM_LIFT_TAU, JAM_DROP_TAU);");
    // the contact: the geometric rule itself is untouched; only a contact the knob is holding is skipped
    expect(DUNK).toContain("const ironStep = finishVariant === 'reverse' && reverseLeft() > Math.PI - REVERSE_CONTACT_FROM ? null : jamIronStep({ ball: bp, rim, rimRadius: RIM_RADIUS, ballRadius: ballSim.radius, sincePress: jamSec, centred: true });");
    expect(DUNK).toContain("const overHolds = ironStep?.kind === 'contact' && finishOverRing() && overRingDefers(bp, rim, RIM_RADIUS, ballSim.radius, jamSec);");
    expect(DUNK).toContain("if (overHolds) { jamPrevBall.copyFrom(bp); jamPrevLive = true; }\n            else if (ironStep?.kind === 'contact') {");
    // three reads of the knob and its definition, no more; each of the path's functions is called once, on a line the knob gates
    expect(DUNK.split('finishOverRing()').length - 1).toBe(3);
    for (const f of ['overRingAim(', 'overRingLeg(', 'overRingHoldsBody(', 'overRingFollows(', 'overRingDefers(']) expect(DUNK.split(f).length - 1, f).toBe(1);
    for (const line of DUNK.split('\n').filter((l) => /overRing(Aim|Leg|HoldsBody|Follows|Defers)\(|OVER_RING\.[a-zA-Z]|overLeg = /.test(l) && !/^\s*\/\//.test(l))) expect(line, line.trim().slice(0, 90)).toMatch(/finishOverRing\(\)|^\s*if \(overRing( |\))/);
  });
  it('the sixteen air tricks never see it: the trick path, the recognizer and the slam grading do not read the knob', () => {
    expect(DUNK_TRICKS).toHaveLength(16);
    const fn = (name: string): string => { const i = DUNK.indexOf(`function ${name}(`); expect(i, name).toBeGreaterThan(0); return DUNK.slice(i, DUNK.indexOf('\n  }\n', i)); };
    for (const name of ['airButton', 'fireTrick', 'slamNow', 'readSlamVariant', 'pickAerialFinish', 'resolveDunk']) expect(fn(name), name).not.toMatch(/finishOverRing|OVER_RING|overRing/);
    expect(readFileSync(path.join(__dirname, 'DunkSystem.ts'), 'utf8')).not.toMatch(/finishOverRing|OverRing/);
  });
});
