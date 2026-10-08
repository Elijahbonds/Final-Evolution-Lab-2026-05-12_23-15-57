// MOVEMENT PLAY P8 (2026-09-26): the ride read, rule by rule, on scripted bodies (lib/pose/rideKit) through the real chain
// (synth → BodyReader → ChannelReader + RideReader) at the synth's default camera: the stance measured (never chosen), the
// carve on the body's normal (translation-free, nose / tail- and crouch-blind), the grab's hand and edge, the quarter-turn
// once per turn with the label flip rejected, the wheel and the wings, the trim off planted feet only, and absence never
// zero. The grid of camera conditions and the per-control precision / recall are rideGate.test's.
import { describe, it, expect } from 'vitest';
import { bodyPackets, type StreamPacket } from './seamReplay';
import { restPose, synthesize } from './synth';
import { script, hold, jumpBeat, crouch, dropout } from './streamKit';
import {
  stanceBase, inStance, edgeTilt, noseTailTilt, turnBeat, wheelArms, wingArms, runBeat, labelFlipWhenAway, lerpJoints, grabHopBeat, tuckHopBeat, turnAbout,
} from './rideKit';
import { ChannelReader } from './bodyChannels';
import { BodyReader } from './BodyReader';
import { CARVE_OFF, CARVE_ON, NO_RIDE, QUARTER_DEG, RideReader, STANCE_HOLD_MS, SQUARE_HOLD_MS, TURN_REST_DEG, WING_REST_DEG, WING_TILT_SLACK_DEG, type RideRead } from './rideReader';
import { PITCH_OFF_DEG, PITCH_ON_DEG } from '../input/bodyFloor';
import type { PoseFrame } from './landmarks';
import type { Joints } from './synth';
import type { Beat } from './streamKit';

const R0 = restPose();
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** Beats → frames (the synth's default camera, 30 fps), and each beat's start (ms). */
function shot(beats: [string, Beat][], seed = 17, flip = false): { frames: PoseFrame[]; at: Record<string, number> } {
  const at: Record<string, number> = {};
  let t = 0;
  for (const [n, b] of beats) { at[n] ??= t; t += b[0] * 1000; }
  at.end = t;
  const syn = synthesize(script(beats.map((b) => b[1])), { seed });
  return { frames: flip ? labelFlipWhenAway(syn.frames) : syn.frames, at };
}
const open = (st: Joints): [string, Beat][] => [['face', hold(R0, 1.6)], ['turnIn', [0.5, (u) => lerpJoints(R0, st, ease(u / 0.5))]], ['take', hold(st, 1.3)]];
const rides = (ps: StreamPacket[]) => ps.map((p) => ({ t: p.read.t, tracked: p.read.tracking, r: p.channels.ride! }));
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const within = <X extends { t: number; r: RideRead }>(xs: X[], a: number, b: number) => xs.filter((x) => x.t >= a && x.t <= b);

describe('the stance: side-on and held still, the lead measured', () => {
  for (const lead of ['L', 'R'] as const) {
    it(`${lead === 'L' ? 'regular (left foot forward)' : 'goofy (right foot forward)'} at 45°: taken after a ${STANCE_HOLD_MS} ms still hold, lead = the shoulder nearer the lens`, () => {
      const st = inStance(stanceBase(), 45, lead);
      const { frames, at } = shot([...open(st), ['ride', hold(st, 1.5)]]);
      const xs = rides(bodyPackets(frames));
      const first = xs.find((x) => x.r.stance)!;
      expect(first, 'taken').toBeDefined();
      expect(first.r.stance!.kind).toBe('side');
      expect(first.r.stance!.lead).toBe(lead);
      expect(Math.abs(first.r.stance!.yawDeg + (lead === 'L' ? 45 : -45))).toBeLessThanOrEqual(8);
      // no sooner than a hold after the turn began (the band is entered in the turn's last third, and a still hold follows);
      // the steer sign follows the lead (toe = right for a left lead)
      expect(first.t - at.turnIn).toBeGreaterThanOrEqual(STANCE_HOLD_MS);
      expect(first.t - at.take).toBeLessThanOrEqual(STANCE_HOLD_MS + 300);
      expect(first.r.steerSign).toBe(lead === 'L' ? 1 : -1);
      // the ring fills before it: 0 → < 1 while held, never 1 before the take
      expect(within(xs, at.take, first.t - 1).every((x) => x.r.stanceHold01 < 1)).toBe(true);
    });
  }
  it(`square: a facing stand held still ${SQUARE_HOLD_MS} ms is the fallback (kind square, no lead); sooner, nothing`, () => {
    const { frames } = shot([['face', hold(stanceBase(0.06, 0.04), 5)]]);
    const xs = rides(bodyPackets(frames));
    const first = xs.find((x) => x.r.stance)!;
    expect(first.r.stance!.kind).toBe('square');
    expect(first.r.stance!.lead).toBeNull();
    // the reader calibrates on the stand first (~0.7 s), then the 3 s square hold
    expect(first.t).toBeGreaterThanOrEqual(SQUARE_HOLD_MS);
  });
  it('riding switch: a still hold in the other lead re-takes the stance', () => {
    const a = inStance(stanceBase(), 45, 'L'), b = inStance(stanceBase(), 45, 'R');
    const { frames, at } = shot([...open(a), ['ride', hold(a, 1)], ['switch', [0.6, (u) => lerpJoints(a, b, ease(u / 0.6))]], ['goofy', hold(b, 1.6)]]);
    const xs = rides(bodyPackets(frames));
    expect(within(xs, at.ride, at.switch).every((x) => x.r.stance?.lead === 'L')).toBe(true);
    expect(xs[xs.length - 1].r.stance?.lead).toBe('R');
  });
  it('review fix: a \'lost\' (the body gone 450 ms) drops the stance and the same body back in it gets it back as it was — the neutral the take\'s, never the edge it came back holding', () => {
    for (const lead of ['L', 'R'] as const) {
      const st = inStance(stanceBase(), 45, lead), e = edgeTilt(st, 8);
      const { frames, at } = shot([...open(st), ['ride', hold(st, 1.2)], ['gap', [0.45, (u) => lerpJoints(st, e, ease(u / 0.3))]], ['edge', hold(e, 1.5)], ['out', [0.3, (u) => lerpJoints(e, st, ease(u / 0.3))]], ['rest', hold(st, 2)]]);
      const ps = bodyPackets(dropout(frames, at.gap, at.gap + 450));
      expect(ps.some((p) => p.events.some((ev) => ev.kind === 'lost')), 'the gap is a lost').toBe(true);
      const xs = rides(ps);
      const before = within(xs, at.ride, at.gap - 1).map((x) => x.r.stance?.neutral).filter((v): v is number => v != null).at(-1)!;
      const back = within(xs, at.gap + 450, at.end).find((x) => x.r.stance)!;
      expect(back.t - (at.gap + 450), 'back at once, not after a new still hold').toBeLessThan(STANCE_HOLD_MS);
      expect(Math.abs(back.r.stance!.neutral - before)).toBeLessThan(0.005);
      expect(median(within(xs, at.edge + 300, at.out).map((x) => x.r.carve!).filter((v) => v !== null))).toBeGreaterThan(CARVE_ON);
      expect(Math.abs(median(within(xs, at.rest + 500, at.end).map((x) => x.r.carve!).filter((v) => v !== null)))).toBeLessThan(CARVE_OFF);
    }
  });
  it(`review fix: squared up 30° toward the screen (past TURN_REST_DEG ${TURN_REST_DEG}°), held still — the axes re-taken there, the neutral kept, the turn back at rest`, () => {
    const st = inStance(stanceBase(), 60, 'L'), sq = turnAbout(st, 30);
    const { frames, at } = shot([...open(st), ['ride', hold(st, 1)], ['square', [1.5, (u) => turnAbout(st, 30 * ease(u / 1.5))]], ['held', hold(sq, 2.5)]]);
    const xs = rides(bodyPackets(frames));
    const taken = within(xs, at.ride, at.square).find((x) => x.r.stance)!.r.stance!;
    const last = xs[xs.length - 1].r;
    expect(Math.abs(last.stance!.yawDeg - (taken.yawDeg + 30))).toBeLessThan(6);
    expect(last.stance!.neutral).toBeCloseTo(taken.neutral, 2);
    expect(Math.abs(last.turn.deg)).toBeLessThan(TURN_REST_DEG);
  });
  it('absence is never zero: every field is unread before the calibration, and nothing reads without a calibration getter', () => {
    const st = inStance(stanceBase(), 45, 'L');
    const { frames } = shot([...open(st), ['ride', hold(st, 1)]]);
    const xs = rides(bodyPackets(frames));
    expect(xs[0].r).toMatchObject({ stance: null, carve: null, grab: null, wheel: { grip: false, angleDeg: null }, wings: { on: false }, trimRate: null, kneeDrive: null });
    // a stepper with the frame but no calibration: all unread, forever
    const reader = new BodyReader(), ch = new ChannelReader();
    for (const f of frames) { const { read, events } = reader.read(f); const c = ch.step(read, events, f); expect(c.ride?.carve ?? null).toBeNull(); expect(c.ride?.stance ?? null).toBeNull(); }
    expect(NO_RIDE.carve).toBeNull();
  });
});

describe('the carve: the hips-and-legs centre over the feet, on the stance\'s normal', () => {
  for (const [theta, lead] of [[30, 'L'], [45, 'R'], [60, 'L']] as const) {
    it(`θ ${theta} lead ${lead}: toe +, heel − (8°, ≈ 0.13 leg lengths); a 12° nose / tail shift stays inside the dead band`, () => {
      const base = stanceBase(), st = inStance(base, theta, lead);
      const { frames, at } = shot([...open(st),
        ['toe', hold(edgeTilt(st, 8), 1.2)], ['r1', hold(st, 0.8)], ['heel', hold(edgeTilt(st, -8), 1.2)], ['r2', hold(st, 0.8)],
        ['nose', hold(noseTailTilt(st, 12), 1.2)], ['r3', hold(st, 0.8)], ['tail', hold(noseTailTilt(st, -12), 1.2)], ['r4', hold(st, 0.8)],
      ]);
      const xs = rides(bodyPackets(frames));
      const carve = (a: number, b: number) => median(within(xs, a + 400, b).map((x) => x.r.carve!).filter((v) => v !== null));
      expect(carve(at.toe, at.r1)).toBeGreaterThan(CARVE_ON);
      expect(carve(at.heel, at.r2)).toBeLessThan(-CARVE_ON);
      expect(Math.abs(carve(at.nose, at.r3))).toBeLessThan(CARVE_OFF);
      expect(Math.abs(carve(at.tail, at.r4))).toBeLessThan(CARVE_OFF);
    });
  }
  it('a 30 cm crouch (hips back, chest forward, knees over the toes) is no lean: |carve| < OFF throughout', () => {
    const base = stanceBase(), st = inStance(base, 45, 'L');
    const deep = inStance(crouch(base, 0.3), 45, 'L');
    const { frames, at } = shot([...open(st), ['down', [0.5, (u) => lerpJoints(st, deep, ease(u / 0.5))]], ['low', hold(deep, 1)], ['up', [0.5, (u) => lerpJoints(deep, st, ease(u / 0.5))]], ['rest', hold(st, 1)]]);
    const xs = within(rides(bodyPackets(frames)), at.down, at.end).map((x) => x.r.carve).filter((v): v is number => v !== null);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThan(CARVE_OFF);
  });
  it('both hands overhead (a celebration, a stretch) leaves the carve unread', () => {
    const st = inStance(stanceBase(), 45, 'L');
    const up = { ...st };
    for (const s of ['Left', 'Right'] as const) { up[`${s}ForeArm`] = [st[`${s}Arm`][0], st[`${s}Arm`][1] + 0.28, st[`${s}Arm`][2]]; up[`${s}Hand`] = [st[`${s}Arm`][0], st[`${s}Arm`][1] + 0.53, st[`${s}Arm`][2]]; }
    const { frames, at } = shot([...open(st), ['up', hold(up, 1.2)], ['rest', hold(st, 0.6)]]);
    const xs = within(rides(bodyPackets(frames)), at.up + 300, at.rest);
    expect(xs.length).toBeGreaterThan(10);
    expect(xs.every((x) => x.r.carve === null)).toBe(true);
  });
  it('one hand overhead (a wave from the stance, a stretch folding forward) leaves it unread too; the hand down, it reads again', () => {
    const st = inStance(stanceBase(), 45, 'L');
    const up = { ...st, RightForeArm: [st.RightArm[0], st.RightArm[1] + 0.28, st.RightArm[2]] as typeof st.RightArm, RightHand: [st.RightArm[0], st.RightArm[1] + 0.53, st.RightArm[2]] as typeof st.RightArm };
    const { frames, at } = shot([...open(st), ['up', hold(up, 1.2)], ['rest', hold(st, 1.0)]]);
    const xs = rides(bodyPackets(frames));
    const during = within(xs, at.up + 300, at.rest);
    expect(during.length).toBeGreaterThan(10);
    expect(during.every((x) => x.r.carve === null)).toBe(true);
    expect(within(xs, at.rest + 400, at.end).every((x) => x.r.carve !== null)).toBe(true);
  });
});

describe('the grab: a wrist under its own knee, the hand and the edge named', () => {
  for (const [hand, edge] of [['lead', 'toe'], ['lead', 'heel'], ['rear', 'toe'], ['rear', 'heel']] as const) {
    it(`${hand} hand, ${edge} edge, in a hop's flight: one grab, named ${hand} / ${edge}`, () => {
      const base = stanceBase(), st = inStance(base, 45, 'L');
      const joint = hand === 'lead' ? 'Left' : 'Right';
      const { frames, at } = shot([...open(st), ['grab', grabHopBeat(base, 2.8, joint, edge, 0.12, (j) => inStance(j, 45, 'L'))], ['rest', hold(st, 1)]]);
      const xs = rides(bodyPackets(frames));
      const on = xs.filter((x, i) => x.r.grab && !xs[i - 1]?.r.grab);
      expect(on.map((x) => [x.r.grab!.hand, x.r.grab!.edge])).toEqual([[hand, edge]]);
      expect(on[0].t).toBeGreaterThanOrEqual(at.grab);
      expect(xs[xs.length - 1].r.grab).toBeNull();
    });
  }
  it('a tucked hop with both hands AT the knees is no grab', () => {
    const base = stanceBase(), st = inStance(base, 45, 'L');
    const { frames } = shot([...open(st), ['tuck', tuckHopBeat(base, 2.8, (j) => inStance(j, 45, 'L'))], ['rest', hold(st, 1)]]);
    expect(rides(bodyPackets(frames)).some((x) => x.r.grab)).toBe(false);
  });
});

describe(`the quarter-turn: ≥ ${QUARTER_DEG}° of shoulder yaw off the stance, once per turn`, () => {
  for (const lead of ['L', 'R'] as const) {
    it(`lead ${lead}: a 90° frontside then a 90° backside turn — one quarter each, fs then bs; a 45° turn none`, () => {
      const st = inStance(stanceBase(), 45, lead);
      const fs = lead === 'L' ? 90 : -90;   // opening the chest to the lens: the left shoulder away for a left lead
      const { frames, at } = shot([...open(st), ['fs', turnBeat(st, fs)], ['r', hold(st, 0.8)], ['bs', turnBeat(st, -fs)], ['r2', hold(st, 0.8)], ['small', turnBeat(st, fs / 2)], ['r3', hold(st, 0.8)]]);
      const xs = rides(bodyPackets(frames));
      const qs = xs.map((x) => x.r.turn.quarter).filter((q, i, a) => q && q.seq !== a[i - 1]?.seq);
      expect(qs.map((q) => q!.dir)).toEqual(['fs', 'bs']);
      expect(qs[0]!.t).toBeGreaterThanOrEqual(at.fs);
      expect(qs[1]!.t).toBeGreaterThanOrEqual(at.bs);
      expect(qs[1]!.t).toBeLessThan(at.small);
    });
  }
  it('THE LABEL FLIP: with the back to the lens the camera swaps left and right — the reader swaps them back (no extra quarter, the turn continuous)', () => {
    const st = inStance(stanceBase(), 45, 'L');
    const { frames, at } = shot([...open(st), ['bs', turnBeat(st, -90, 0.3, 0.6, 0.4)], ['r', hold(st, 1)]], 17, true);
    const xs = rides(bodyPackets(frames));
    expect(xs.some((x) => x.r.flipped), 'the back-to-camera frames came swapped').toBe(true);
    const qs = xs.map((x) => x.r.turn.quarter).filter((q, i, a) => q && q.seq !== a[i - 1]?.seq);
    expect(qs.map((q) => q!.dir)).toEqual(['bs']);
    // continuous: no frame-to-frame jump of the turn over 60°
    const deg = within(xs, at.bs, at.end).map((x) => x.r.turn.deg);
    for (let i = 1; i < deg.length; i++) expect(Math.abs(deg[i] - deg[i - 1])).toBeLessThan(60);
    // and the carve held its sign through it (the stance's axes never flipped)
    expect(xs[xs.length - 1].r.stance?.lead).toBe('L');
  });
});

describe('the wheel and the wings (facing the camera)', () => {
  it('the wheel: gripped at the chest, + clockwise; let go (arms down) → no grip, the angle unread', () => {
    const { frames, at } = shot([['face', hold(R0, 1.6)], ['grip', [0.5, (u) => wheelArms(R0, 0, ease(u / 0.5))]], ['c', hold(wheelArms(R0, 0), 0.8)],
      ['right', hold(wheelArms(R0, 30), 1)], ['left', hold(wheelArms(R0, -30), 1)], ['go', [0.5, (u) => wheelArms(R0, 0, 1 - ease(u / 0.5))]], ['down', hold(R0, 1)]]);
    const xs = rides(bodyPackets(frames));
    const ang = (a: number, b: number) => median(within(xs, a + 300, b).map((x) => x.r.wheel.angleDeg!).filter((v) => v !== null));
    // (on after GRIP_ON_MS of the wheel TAKEN — straight, its centre still for the speed rule's 150 ms first (R-F2); a frame
    // the model missed reads nothing — absence is never a grip)
    expect(within(xs, at.c + 500, at.go).filter((x) => x.tracked).every((x) => x.r.wheel.grip)).toBe(true);
    expect(ang(at.right, at.left)).toBeGreaterThan(20);
    expect(ang(at.left, at.go)).toBeLessThan(-20);
    expect(within(xs, at.down + 400, at.end).every((x) => !x.r.wheel.grip && x.r.wheel.angleDeg === null)).toBe(true);
    expect(within(xs, 0, at.grip).every((x) => !x.r.wheel.grip)).toBe(true);
  });
  it('the wings: out → on; banked right = +, left = −; raised = + pitch; one arm out is never wings', () => {
    const one = (() => { const w = wingArms(R0, 0, 0); return { ...R0, LeftForeArm: w.LeftForeArm, LeftHand: w.LeftHand }; })();
    const { frames, at } = shot([['face', hold(R0, 1.6)], ['level', hold(wingArms(R0, 0, 0), 1)], ['bankR', hold(wingArms(R0, 25, 0), 1)], ['bankL', hold(wingArms(R0, -25, 0), 1)],
      ['up', hold(wingArms(R0, 0, 25), 1)], ['down', hold(R0, 1)], ['one', hold(one, 1.5)]]);
    const xs = rides(bodyPackets(frames));
    const m = (a: number, b: number, k: 'bankDeg' | 'pitchDeg') => median(within(xs, a + 350, b).map((x) => x.r.wings[k]!).filter((v) => v !== null));
    expect(m(at.bankR, at.bankL, 'bankDeg')).toBeGreaterThan(8);
    expect(m(at.bankL, at.up, 'bankDeg')).toBeLessThan(-8);
    expect(m(at.up, at.down, 'pitchDeg')).toBeGreaterThan(10);
    expect(within(xs, at.one + 400, at.end).every((x) => !x.r.wings.on)).toBe(true);
  });
  it('review fix: the wings\' own level — opened below the shoulder line (−10°, as real arms held out sit) they read level; raised together from there they climb; ONE arm raised is a bank, not a climb', () => {
    const lowered = wingArms(R0, 0, -10);
    const oneUp = (() => { const u = wingArms(R0, 15, 5); return { ...lowered, LeftForeArm: u.LeftForeArm, LeftHand: u.LeftHand }; })();   // the left arm at +20°
    const { frames, at } = shot([['face', hold(R0, 1.6)], ['level', hold(lowered, 1.5)], ['up', hold(wingArms(R0, 0, 12), 1.2)], ['back', hold(lowered, 1.2)], ['one', hold(oneUp, 1.2)], ['rest', hold(lowered, 0.8)]]);
    const xs = rides(bodyPackets(frames));
    const m = (a: number, b: number, k: 'bankDeg' | 'pitchDeg') => median(within(xs, a + 400, b).map((x) => x.r.wings[k]!).filter((v) => v !== null));
    expect(Math.abs(m(at.level, at.up, 'pitchDeg'))).toBeLessThan(3);
    expect(m(at.up, at.back, 'pitchDeg')).toBeGreaterThan(15);
    // (one arm up reads at most the tilt slack — WING_TILT_SLACK_DEG, two arms are never quite level — well inside the floor's ON)
    expect(Math.abs(m(at.one, at.rest, 'pitchDeg'))).toBeLessThanOrEqual(WING_TILT_SLACK_DEG + 1);
    expect(Math.abs(m(at.one, at.rest, 'pitchDeg'))).toBeLessThan(PITCH_ON_DEG / 2);
    expect(m(at.one, at.rest, 'bankDeg')).toBeGreaterThan(8);
    // (the level's dead band is the floor's own climb off-line)
    expect(WING_REST_DEG).toBe(PITCH_OFF_DEG);
  });
});

describe('the trim, the knees, the steps', () => {
  it('trim is read off planted feet only: none while running in place; high knees drive the knee past 0.6, a jog does not', () => {
    const { frames, at } = shot([['face', hold(R0, 1.6)], ['jog', runBeat(R0, 3, 3, 0.18)], ['r', hold(R0, 1)], ['knees', runBeat(R0, 3, 3.8, 0.5)], ['r2', hold(R0, 1)]]);
    const xs = rides(bodyPackets(frames));
    expect(within(xs, at.jog + 600, at.r).every((x) => x.r.trimRate === null)).toBe(true);
    expect(median(within(xs, at.jog + 1000, at.r).map((x) => x.r.kneeDrive ?? 0))).toBeLessThan(0.45);
    expect(median(within(xs, at.knees + 1000, at.r2).map((x) => x.r.kneeDrive ?? 0))).toBeGreaterThan(0.6);
    expect(within(xs, at.jog + 1200, at.r).every((x) => x.r.running)).toBe(true);
    expect(within(xs, at.r + 1600, at.knees).every((x) => !x.r.running)).toBe(true);
  });
  it('no trim through a landing (its absorb and the stand back up are the landing\'s, not a pump)', () => {
    const base = stanceBase(), st = inStance(base, 45, 'L');
    const J = jumpBeat(base, 2.4, 0.25);
    const { frames, at } = shot([...open(st), ['hop', [J[0], (u) => inStance(J[1](u), 45, 'L')]], ['rest', hold(st, 1)]]);
    const ps = bodyPackets(frames);
    const land = ps.flatMap((p) => p.events.filter((e) => e.kind === 'land').map((e) => e.t))[0];
    expect(land).toBeGreaterThan(at.hop);
    expect(rides(ps).filter((x) => x.t >= land && x.t <= land + 850).every((x) => x.r.trimRate === null)).toBe(true);
  });
  it('the reader is its own (a fresh RideReader, reset, reads the same)', () => {
    const st = inStance(stanceBase(), 45, 'L');
    const { frames } = shot([...open(st), ['ride', hold(edgeTilt(st, 8), 1)]]);
    const reader = new BodyReader(), ride = new RideReader();
    const run = () => frames.map((f) => { const { read, events } = reader.read(f); return ride.step(read, events, f, false, reader.calibration).carve; });
    const a = run();
    reader.reset(); ride.reset();
    expect(run()).toEqual(a);
  });
});
