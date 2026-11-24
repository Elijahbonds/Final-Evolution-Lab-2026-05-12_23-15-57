// lane/physics-arena: the arena's pure pieces (the Havok world itself is proven headless in scripts/physics-arena-tests.ts).
import { describe, expect, it } from 'vitest';
import { G, backspinFor, passVelocity, releaseTiming, releaseVelocity, seeded, solveLaunch } from './shotModel';
import { HoopSensor, NET_CONFIRM_M, throughHoopLabel } from './hoopSensor';
import { dribbleHand, dribblePeriod, dribblePush, pushSpeed } from './dribble';
import { aimYawErr, fovForAspect, povLook, povPose, POV_PITCH_MAX_DEG } from './povCamera';
import { ARENA_RIM, ARENA_RIM_RADIUS, BALL_R, RIM_SEGMENTS, RIM_TUBE_R, boardBox, inNet, rimSegments, type P3 } from './hoopGeometry';
import * as C from './arenaConfig';
import { ruleContact, type ContactBody, type ContactRules } from './arenaContact';

/** Fly a point under gravity (no air) for t seconds. */
const fly = (p: P3, v: P3, t: number): P3 => ({ x: p.x + v.x * t, y: p.y + v.y * t - 0.5 * G * t * t, z: p.z + v.z * t });

describe('shotModel: a shot is a throw, the timing is the body', () => {
  it('solveLaunch passes through the target at the asked arc', () => {
    const from = { x: 1, y: 2.4, z: 5 }, rim = { ...ARENA_RIM };
    const v = solveLaunch(from, rim, 52)!;
    const d = Math.hypot(rim.x - from.x, rim.z - from.z), t = d / Math.hypot(v.x, v.z);
    const at = fly(from, v, t);
    expect(Math.hypot(at.x - rim.x, at.y - rim.y, at.z - rim.z)).toBeLessThan(1e-9);
    expect((Math.atan2(v.y, Math.hypot(v.x, v.z)) * 180) / Math.PI).toBeCloseTo(52, 9);
  });
  it('an arc that cannot reach returns null', () => { expect(solveLaunch({ x: 0, y: 0, z: 10 }, { x: 0, y: 30, z: 0 }, 20)).toBeNull(); });
  it('rising adds, falling takes away, still is the throw (body carry)', () => {
    const base = { from: { x: 0, y: 2.5, z: 5 }, rim: { ...ARENA_RIM }, arcDeg: 52, bodyCarry: 0.3, runCompensate: 1, noiseSd: 0, noise: [0, 0, 0] as [number, number, number] };
    const still = releaseVelocity({ ...base, bodyVel: { x: 0, y: 0, z: 0 } });
    const up = releaseVelocity({ ...base, bodyVel: { x: 0, y: 1, z: 0 } });
    const down = releaseVelocity({ ...base, bodyVel: { x: 0, y: -1, z: 0 } });
    expect(up.y - still.y).toBeCloseTo(0.3, 12);
    expect(still.y - down.y).toBeCloseTo(0.3, 12);
    expect(releaseVelocity({ ...base, bodyCarry: 0, bodyVel: { x: 0, y: 1, z: 0 } })).toEqual(still);   // knob 0: timing never matters
  });
  it('the hand cancels the asked share of the drift, and a POV yaw error turns the throw', () => {
    const base = { from: { x: 0, y: 2.5, z: 5 }, rim: { ...ARENA_RIM }, arcDeg: 52, bodyCarry: 0, noiseSd: 0, noise: [0, 0, 0] as [number, number, number] };
    const still = releaseVelocity({ ...base, runCompensate: 1, bodyVel: { x: 0, y: 0, z: 0 } });
    const drift = releaseVelocity({ ...base, runCompensate: 0.75, bodyVel: { x: 2, y: 0, z: 0 } });
    expect(drift.x - still.x).toBeCloseTo(0.5, 12);
    const turned = releaseVelocity({ ...base, runCompensate: 1, bodyVel: { x: 0, y: 0, z: 0 }, yawErr: 0.1 });
    expect(Math.hypot(turned.x, turned.z)).toBeCloseTo(Math.hypot(still.x, still.z), 12);
    const d = Math.atan2(turned.x, turned.z) - Math.atan2(still.x, still.z);
    expect(Math.atan2(Math.sin(d), Math.cos(d))).toBeCloseTo(0.1, 12);   // wrapped (the throw points down −z, near ±π)
  });
  it('backspin turns the top of the ball back toward the shooter', () => {
    const w = backspinFor({ x: 0, y: 5, z: -6 }, 2);
    // the top point's velocity relative to the centre: w × (0, r, 0) = (−wz r, 0, wx r); toward the shooter = +z here
    expect(w.x * BALL_R).toBeGreaterThan(0);
    expect(Math.hypot(w.x, w.y, w.z)).toBeCloseTo(4 * Math.PI, 9);
  });
  it('a pass arrives at the chest in the asked time', () => {
    const from = { x: 0, y: 1.3, z: 7 }, to = { x: 1, y: 1.3, z: 5 };
    const v = passVelocity(from, to, 0.4);
    const at = fly(from, v, 0.4);
    expect(Math.hypot(at.x - to.x, at.y - to.y, at.z - to.z)).toBeLessThan(1e-9);
  });
  it('the release timing reads against the top of the jump', () => {
    expect(releaseTiming(0.3, 0.32)).toEqual({ ms: -20, label: 'on time' });
    expect(releaseTiming(0.2, 0.32).label).toBe('early');
    expect(releaseTiming(0.45, 0.32).label).toBe('late');
  });
  it('the tremor is seeded: the same seed, the same hand', () => {
    const a = seeded(9), b = seeded(9);
    for (let i = 0; i < 50; i++) expect(a.normal()).toBe(b.normal());
  });
});

describe('hoopSensor: the basket is the ball through the hoop', () => {
  const R = ARENA_RIM;
  const run = (path: P3[]) => {
    const s = new HoopSensor(R, ARENA_RIM_RADIUS);
    let made = false;
    for (let i = 1; i < path.length; i++) if (s.step(path[i - 1], path[i], 1 / 60) === 'make') made = true;
    return made;
  };
  const drop = (x: number, z: number, from = R.y + 1, to = R.y - 1.2, n = 30): P3[] =>
    Array.from({ length: n + 1 }, (_, i) => ({ x, y: from + ((to - from) * i) / n, z }));
  it('straight down the middle is a make; just outside the ring is not', () => {
    expect(run(drop(R.x, R.z))).toBe(true);
    expect(run(drop(R.x + ARENA_RIM_RADIUS + 0.02, R.z))).toBe(false);
  });
  it('a fast ball that crosses both planes in one frame still counts (swept, not sampled)', () => {
    expect(run([{ x: R.x, y: R.y + 0.3, z: R.z }, { x: R.x, y: R.y - NET_CONFIRM_M - 0.2, z: R.z }])).toBe(true);
  });
  it('the in-and-out: into the ring and back up out of it is not a make', () => {
    const path = [...drop(R.x + 0.1, R.z, R.y + 0.5, R.y - 0.1, 10), ...drop(R.x + 0.1, R.z, R.y - 0.1, R.y + 0.4, 6).slice(1), ...drop(R.x + 0.6, R.z, R.y + 0.4, 0.2, 10)];
    expect(run(path)).toBe(false);
  });
  it('up through the net from below and back down is not a basket', () => {
    const path = [...drop(R.x, R.z, 1.5, R.y + 0.6, 10), ...drop(R.x, R.z, R.y + 0.6, R.y - 1.2, 12).slice(1)];
    expect(run(path)).toBe(false);
  });
  it('the path label agrees on the plain cases', () => {
    expect(throughHoopLabel(drop(R.x, R.z, R.y + 1, 0.5, 60), R, ARENA_RIM_RADIUS)).toBe(true);
    expect(throughHoopLabel(drop(R.x + 0.5, R.z, R.y + 1, 0.5, 60), R, ARENA_RIM_RADIUS)).toBe(false);
  });
});

describe('dribble: pushes that come back to the hand', () => {
  it('a push comes back to the hand height after one bounce (ballistic check)', () => {
    const hand = 0.92, e = C.FLOOR_BOUNCE;
    const u = pushSpeed(hand, BALL_R, e);
    // fall to the floor, bounce with e, rise: the apex is the hand height
    const vi = Math.sqrt(u * u + 2 * G * (hand - BALL_R));
    expect((e * vi) ** 2 / (2 * G) + BALL_R).toBeCloseTo(hand, 9);
    expect(dribblePeriod(hand, BALL_R, e, u)).toBeGreaterThan(0.3);
    expect(dribblePeriod(hand, BALL_R, e, u)).toBeLessThan(0.9);
  });
  it('a running push leads the hand and rolls (no grip braking at the bounce)', () => {
    const hand = { x: 0.4, y: 0.92, z: 0.2 };
    const pu = dribblePush({ ...hand }, hand, { x: 0, y: 0, z: 5 }, BALL_R, C.FLOOR_BOUNCE);
    expect(pu.vel.z).toBeCloseTo(5, 9);
    expect(pu.vel.y).toBeLessThan(0);
    expect(pu.spin.x * BALL_R).toBeCloseTo(pu.vel.z, 9);
  });
  it('the steer is capped: a hand cannot fling the ball across the court', () => {
    const pu = dribblePush({ x: 5, y: 0.92, z: 0 }, { x: 0, y: 0.92, z: 0 }, { x: 0, y: 0, z: 0 }, BALL_R, C.FLOOR_BOUNCE);
    expect(Math.hypot(pu.vel.x, pu.vel.z)).toBeLessThanOrEqual(3.2 + 1e-9);
  });
  it('the dribbling hand sits to the side the hand is on', () => {
    const r = dribbleHand({ x: 0, y: 0, z: 0 }, 0, 1), l = dribbleHand({ x: 0, y: 0, z: 0 }, 0, -1);
    expect(r.x).toBeGreaterThan(0); expect(l.x).toBeLessThan(0);
  });
});

describe('the hoop as solid things', () => {
  it('the ring is closed: each segment ends where the next begins, on the iron circle', () => {
    const segs = rimSegments();
    expect(segs.length).toBe(RIM_SEGMENTS);
    for (let i = 0; i < segs.length; i++) {
      const [, b] = segs[i], [a2] = segs[(i + 1) % segs.length];
      expect(Math.hypot(b.x - a2.x, b.y - a2.y, b.z - a2.z)).toBeLessThan(1e-9);
      expect(Math.hypot(b.x - ARENA_RIM.x, b.z - ARENA_RIM.z)).toBeCloseTo(ARENA_RIM_RADIUS + RIM_TUBE_R, 9);
    }
  });
  it('regulation: the inside of the ring is 6 in off the glass, the glass 6 in under the ring', () => {
    const b = boardBox();
    expect(ARENA_RIM.z - ARENA_RIM_RADIUS - (b.centre.z + b.half.z)).toBeCloseTo(0.152, 9);
    expect(ARENA_RIM.y - (b.centre.y - b.half.y)).toBeCloseTo(0.15, 9);
  });
  it('the net is a cone under the ring', () => {
    expect(inNet({ x: ARENA_RIM.x, y: ARENA_RIM.y - 0.2, z: ARENA_RIM.z })).toBe(true);
    expect(inNet({ x: ARENA_RIM.x + 0.3, y: ARENA_RIM.y - 0.2, z: ARENA_RIM.z })).toBe(false);
    expect(inNet({ x: ARENA_RIM.x, y: ARENA_RIM.y + 0.1, z: ARENA_RIM.z })).toBe(false);
  });
});

describe('POV', () => {
  it('the eye is at the asked height, in front of the face, looking where the view yaws', () => {
    const v = { yaw: Math.PI / 2, pitch: 0, bobPhase: 0 };
    const { eye, target } = povPose({ x: 1, y: 0, z: 2 }, v, 1.7, 0, 0, 1 / 60);
    expect(eye.y).toBeCloseTo(1.7, 12);
    expect(eye.x).toBeGreaterThan(1);
    expect(target.x - eye.x).toBeCloseTo(10, 9);
  });
  it('head-bob off (the default) never moves the eye; on, it does', () => {
    expect(C.POV_BOB_M).toBe(0);
    const v = { yaw: 0, pitch: 0, bobPhase: 0 };
    const ys = Array.from({ length: 30 }, () => povPose({ x: 0, y: 0, z: 0 }, v, 1.7, 5, 0, 1 / 60).eye.y);
    expect(new Set(ys).size).toBe(1);
    const yb = Array.from({ length: 30 }, () => povPose({ x: 0, y: 0, z: 0 }, v, 1.7, 5, 0.03, 1 / 60).eye.y);
    expect(new Set(yb).size).toBeGreaterThan(1);
  });
  it('the look stick turns the view and the pitch is clamped', () => {
    const v = { yaw: 0, pitch: 0, bobPhase: 0 };
    povLook(v, 1, 0, 150, 1);
    expect(v.yaw).toBeCloseTo((150 * Math.PI) / 180, 9);
    for (let i = 0; i < 20; i++) povLook(v, 0, -1, 150, 1);
    expect(v.pitch).toBeCloseTo((POV_PITCH_MAX_DEG * Math.PI) / 180, 9);
  });
  it('the field of view keeps the asked width on a wide screen and clamps on an upright phone', () => {
    const wide = fovForAspect(82, 16 / 9);
    expect(2 * Math.atan(Math.tan(wide / 2) * (16 / 9)) * (180 / Math.PI)).toBeCloseTo(82, 6);
    expect(fovForAspect(82, 390 / 844)).toBeCloseTo((90 * Math.PI) / 180, 9);
  });
  it('the aim help forgives its share of a look off the ring', () => {
    const eye = { x: 0, y: 1.7, z: 6 };
    const toRim = Math.atan2(ARENA_RIM.x - eye.x, ARENA_RIM.z - eye.z);
    expect(aimYawErr(toRim + 0.2, eye, ARENA_RIM, 0.8)).toBeCloseTo(0.04, 9);
    expect(aimYawErr(toRim + 0.2, eye, ARENA_RIM, 1)).toBeCloseTo(0, 12);
    expect(aimYawErr(toRim + 0.2, eye, ARENA_RIM, 0)).toBeCloseTo(0.2, 9);
  });
});

describe('the switches restore today', () => {
  it('ship ON as a new place, and the hoops door falls back to the shipped 1v1', () => {
    expect(C.ARENA_ON).toBe(1); expect(C.ARENA_PHYSICS_HOOPS).toBe(1); expect(C.CAM_POV).toBe(1);
    expect(C.arenaHoopsHref()).toBe('/play/arena?sport=hoops');
    expect(C.SHIPPED_ONEVONE_HREF).toBe('/play/onevone');
  });
});

describe('phase 4: dunks and layups', async () => {
  const { shotKindFor } = await import('../modes/PhysicsArenaMode');
  const { dunkPush, LAYUP_ARC_DEG } = await import('./arenaShot');
  it('a fast run close to the ring is a dunk, a close shot a layup, the rest jump shots; arena.dunks 0 = jump shots only', () => {
    expect(shotKindFor(1.8, 4, true)).toBe('dunk');
    expect(shotKindFor(1.8, 1, true)).toBe('layup');
    expect(shotKindFor(4, 6, true)).toBe('jumper');
    expect(shotKindFor(1.8, 4, false)).toBe('jumper');
    expect(LAYUP_ARC_DEG).toBeGreaterThan(C.SHOT_ARC_DEG);
  });
  it('the jam pushes toward under the ring, never faster than a hand', () => {
    const v = dunkPush({ x: ARENA_RIM.x + 0.3, y: ARENA_RIM.y + 0.3, z: ARENA_RIM.z + 0.2 });
    expect(v.y).toBeLessThan(0);
    expect(v.x).toBeLessThan(0);
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThanOrEqual(8 + 1e-9);
  });
});

describe('physics hands (arena.physicsHands, OFF by default)', async () => {
  const { handTargets } = await import('./handTargets');
  const feet = { x: 0, y: 0, z: 5 }, ball = { x: 0.4, y: 0.5, z: 5.2 };
  it('ships OFF', () => { expect(C.ARENA_PHYSICS_HANDS).toBe(0); });
  it('a contest puts both hands high (in a shot\'s way), a rest keeps them low', () => {
    const c = handTargets({ feet, yaw: 0, ball, role: 'contest', dribbleSide: 1 });
    const r = handTargets({ feet, yaw: 0, ball, role: 'rest', dribbleSide: 1 });
    expect(Math.min(c.left.y, c.right.y)).toBeGreaterThan(2.3);
    expect(Math.max(r.left.y, r.right.y)).toBeLessThan(1.0);
  });
  it('a reach sends one hand at the ball (never above the shoulders)', () => {
    const t = handTargets({ feet, yaw: 0, ball, role: 'reach', dribbleSide: 1 });
    expect(Math.hypot(t.right.x - ball.x, t.right.z - ball.z)).toBeLessThan(1e-9);
    expect(t.right.y).toBeLessThanOrEqual(1.5);
  });
  it('the dribbling hand is on the dribbling side, above the ball', () => {
    const t = handTargets({ feet, yaw: 0, ball, role: 'dribble', dribbleSide: 1 });
    expect(t.right.x).toBeGreaterThan(feet.x);
    expect(t.right.y).toBeGreaterThan(ball.y);
  });
});

describe('arenaContact: knockdowns and fouls are read off the hit (the shared referee\'s calls)', () => {
  const body = (id: string, side: 'me' | 'foe', o: Partial<ContactBody> = {}): ContactBody => ({ id, side, airborne: false, shooting: false, speed: 0, hasBall: false, ...o });
  const hit = (closing: number, attackerSpeed = closing) => ({ a: 'me', b: 'foe', closingSpeed: closing, attacker: 'me', victim: 'foe', attackerSpeed });
  const on: ContactRules = { knockdowns: true, fouls: true, knockMps: C.KNOCK_MPS, offense: 'me', looseBall: false };
  it('both knobs off: nothing, however hard the hit (today\'s arena)', () => {
    expect(ruleContact(hit(9), body('me', 'me'), body('foe', 'foe'), { ...on, knockdowns: false, fouls: false })).toEqual({ down: null, foul: null });
  });
  it('a sprint (6 m/s) into a standing body knocks it down; a jog (4.4) does not, even head-on; in the air it takes less', () => {
    const r = { ...on, fouls: false };
    expect(ruleContact(hit(8.8, 4.4), body('me', 'me'), body('foe', 'foe'), r).down).toBeNull();   // two jogs meeting
    expect(ruleContact(hit(6), body('me', 'me'), body('foe', 'foe'), r).down).toBe('foe');
    expect(ruleContact(hit(4.4), body('me', 'me'), body('foe', 'foe'), r).down).toBeNull();
    expect(ruleContact(hit(4.0), body('me', 'me'), body('foe', 'foe', { airborne: true }), r).down).toBe('foe');
  });
  it('the handler sprinting into a SET defender is a charge (the defence\'s ball); into a moving one, or at a jog, no call', () => {
    const set = ruleContact(hit(6), body('me', 'me', { hasBall: true }), body('foe', 'foe', { speed: 0.3 }), on);
    expect(set.foul?.id).toBe('charge'); expect(set.foul?.call.ball).toBe('foe');
    expect(ruleContact(hit(6), body('me', 'me', { hasBall: true }), body('foe', 'foe', { speed: 2 }), on).foul).toBeNull();
    expect(ruleContact(hit(4.4), body('me', 'me', { hasBall: true }), body('foe', 'foe', { speed: 0.3 }), on).foul).toBeNull();   // a jog: a push
    expect(ruleContact(hit(6), body('me', 'me'), body('foe', 'foe', { speed: 0.3 }), on).foul).toBeNull();   // off the ball: no call
  });
  it('a defender running through the handler is a blocking foul (the offence keeps it)', () => {
    const c = { a: 'me', b: 'foe', closingSpeed: 5.6, attacker: 'foe', victim: 'me', attackerSpeed: 4.6 };
    const r = ruleContact(c, body('foe', 'foe'), body('me', 'me', { speed: 3, hasBall: true }), on);
    expect(r.foul?.id).toBe('blocking_foul'); expect(r.foul?.call.ball).toBe('me');
    expect(ruleContact(c, body('foe', 'foe'), body('me', 'me', { speed: 3 }), on).foul).toBeNull();   // a cutter without the ball: no call
  });
  it('a shooter in the air is fouled at the foul speed; on the floor only at the reckless one', () => {
    const c = { a: 'me', b: 'foe', closingSpeed: 4.4, attacker: 'foe', victim: 'me', attackerSpeed: 4.4 };
    expect(ruleContact(c, body('foe', 'foe'), body('me', 'me', { shooting: true, airborne: true }), on).foul?.id).toBe('shooting_foul');
    expect(ruleContact(c, body('foe', 'foe'), body('me', 'me', { shooting: true }), on).foul).toBeNull();
    expect(ruleContact({ ...c, closingSpeed: 5.4 }, body('foe', 'foe'), body('me', 'me', { shooting: true }), on).foul?.call.ball).toBe('me');
  });
  it('a loose ball goes to whoever was fouled, at the reckless speed only; teammates bump without a call', () => {
    expect(ruleContact(hit(5.4), body('me', 'me'), body('foe', 'foe'), { ...on, looseBall: true }).foul?.call.ball).toBe('foe');
    expect(ruleContact(hit(4.6), body('me', 'me'), body('foe', 'foe'), { ...on, looseBall: true }).foul).toBeNull();
    expect(ruleContact(hit(7), body('me', 'me'), body('m2', 'me'), on)).toEqual({ down: 'm2', foul: null });
  });
});
