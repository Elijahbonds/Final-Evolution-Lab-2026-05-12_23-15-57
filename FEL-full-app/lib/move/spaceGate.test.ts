// THE P4 GATE (movement play, phase 4, 2026-09-25): the space check passes where it should and fails where it should,
// on the streams and on the owner's own takes, and nothing reaches a game before it has passed.
//
//   G2  PASSES   the check's session (stand → reach → lower → stand) at the setups that can play (plan §1.6): a 4:3
//                webcam at 3.5 / 4.0 m with the lens at 1.0 / 1.2 m, a 16:9 78° webcam at 3.5 / 4.0 m, a 16:9 70° one at
//                4.0 m, a phone on its side at 4.5 m — each on seeds 17 / 23 / 41 with the synth's drops, misses and
//                jitter: ready within 1.5 s of the arms coming down, the hips' height within 3 cm of the truth and the
//                floor line within 0.01 of the feet's lowest points, and the Coach's lines in order;
//   G3  OWNER    his 12 DeepMotion takes: his stand passes every rule from 3.6 m and is too close at the takes' own 3 m;
//                his jumps and side-steps stay in a frame that passes; a reach then his stand is ready on HIS rulers; one
//                body at a time never fires on any of them. (No /dev/pose-record takes exist on this Mac: the real-camera
//                row stays open until he records the recorder's 'space' take — scripts/body/space.mts TAKES=<file>.)
//   G4  FAILS    each crafted fail on three seeds: never ready, the expected issue and line — then the fix in the same
//                stream, and ready;
//   G5  WARNS    a slow camera (15, 20 Hz), a dark or backlit picture with a good read, and the safety note: shown, never a
//                lock-out; jump height 'unread' under 24 Hz, 'read' at 30;
//   G6  NOTHING BEFORE IT   the source's reader no longer calibrates itself (autoCalibrate: false), so through the whole
//                seam (lib/pose/seamReplay) the nine bound games get no calibrated read, no press, no START on any of these
//                streams; given the check's calibration, P3's own oracles hold (skate's one POP per jump, karate VS's
//                3 A + 1 B, Free Run's run without a steer).
// G1 (tsc + the full suite), G7 (the READY screen), G8 (live) and G9 (privacy) are elsewhere: plan §9.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SpaceCheck, MIN_POSE_HZ, ADVICE_MS, SAFETY_NOTE, type SpaceState, type SpaceInstructionId, type SpaceIssue } from './spaceCheck';
import { lumaHistogram } from './luma';
import {
  restPose, moveJoints, synthesize, bodyPoints, makeCamera, project, type CameraSpec, type JointClip, type Joints, type PoseFixture,
  type SynthOptions,
} from '../pose/synth';
import { reshoot, spaceSession, swapStream, script, hold as beat, jogBeat, holdStill } from '../pose/streamKit';
import { bodyPackets, seamReplay } from '../pose/seamReplay';
import { standFrame, STAND_SEC, SPLICE_MS } from '../pose/grade';
import { BODY_PROFILES } from '../input/bodyProfiles';
import type { Calibration } from '../pose/calibrate';
import type { PoseFrame } from '../pose/landmarks';

// ── streams ──────────────────────────────────────────────────────────────────────────────────────────────────────

const SEEDS = [17, 23, 41];
const R0 = restPose();
const PLAY: Partial<CameraSpec> = { distance: 3.6, heightM: 1.2 };
const WEBCAM43 = { width: 640, height: 480, hfovDeg: 60 };
const WEBCAM78 = { width: 1280, height: 720, hfovDeg: 78, heightM: 1.1 };
const WEBCAM70 = { width: 1280, height: 720, hfovDeg: 70, heightM: 1.1 };
const PHONE = { width: 1280, height: 720, hfovDeg: 65, heightM: 1.1 };
const aspectOf = (c: Partial<CameraSpec>) => (c.width && c.height ? c.width / c.height : 4 / 3);

const shoot = (clip: JointClip, camera: Partial<CameraSpec>, seed: number, extra: Partial<SynthOptions> = {}) =>
  synthesize(clip, { camera, seed, ...extra }).frames;
const later = (frames: PoseFrame[], t0: number): PoseFrame[] => frames.map((f) => ({ ...f, t: f.t + t0, arrive: (f.arrive ?? f.t) + t0 }));
const endOf = (frames: PoseFrame[]) => frames[frames.length - 1].t + 33;
const run = (frames: PoseFrame[], c = new SpaceCheck()): SpaceState[] => frames.map((f) => c.push(f));
const said = (states: SpaceState[]) => states.map((s) => s.instruction.id).filter((id, i, a) => i === 0 || id !== a[i - 1]);
const settled = (states: SpaceState[], fromT: number) => states.filter((s) => s.t >= fromT);

const FIX = join(__dirname, '..', 'pose', '__fixtures__');
const fixture = (name: string) => JSON.parse(readFileSync(join(FIX, `${name}.json`), 'utf8')) as PoseFixture;
const NAMES = (JSON.parse(readFileSync(join(FIX, 'index.json'), 'utf8')) as { name: string }[]).map((e) => e.name);

/** The rest body's truth under a camera: the hips' height over the feet's lowest points, and the image floor line. */
function truth(camera: Partial<CameraSpec>) {
  const p = bodyPoints(R0), cam = makeCamera(camera);
  const low = (a: number, b: number) => Math.min(p[a][1], p[b][1]);
  const hipHeightM = (p[23][1] + p[24][1]) / 2 - (low(29, 31) + low(30, 32)) / 2;
  const footLow = (ids: number[]) => Math.max(...ids.map((i) => project(cam, p[i]).y));
  return { hipHeightM, floorLine: (footLow([27, 29, 31]) + footLow([28, 30, 32])) / 2 };
}

// ── G2: passes where it should ─────────────────────────────────────────────────────────────────────────────────────

const PASS_CELLS: [string, Partial<CameraSpec>][] = [
  ['4:3 webcam, 3.5 m, lens 1.0 m', { ...WEBCAM43, distance: 3.5, heightM: 1.0 }],
  ['4:3 webcam, 3.5 m, lens 1.2 m', { ...WEBCAM43, distance: 3.5, heightM: 1.2 }],
  ['4:3 webcam, 4.0 m, lens 1.0 m', { ...WEBCAM43, distance: 4.0, heightM: 1.0 }],
  ['4:3 webcam, 4.0 m, lens 1.2 m', { ...WEBCAM43, distance: 4.0, heightM: 1.2 }],
  ['16:9 78° webcam, 3.5 m', { ...WEBCAM78, distance: 3.5 }],
  ['16:9 78° webcam, 4.0 m', { ...WEBCAM78, distance: 4.0 }],
  ['16:9 70° webcam, 4.0 m', { ...WEBCAM70, distance: 4.0 }],
  ['phone on its side (16:9 65°), 4.5 m', { ...PHONE, distance: 4.5 }],
];

describe('G2: the check passes where it should', () => {
  const rows = PASS_CELLS.flatMap(([label, cam]) => SEEDS.map((seed) => [label, cam, seed] as const));
  it.each(rows)('%s, seed %i', (_label, cam, seed) => {
    const frames = shoot(spaceSession(), cam, seed);
    const states = run(frames, new SpaceCheck({ aspect: aspectOf(cam) }));
    const ready = states.find((s) => s.ready);
    expect(ready, 'ready').toBeDefined();
    // the arms are down at 3.0 s (spaceSession: lowered 2.6 → 3.0 s)
    expect(ready!.t - frames[0].t).toBeLessThanOrEqual(3000 + 1500);
    const t = truth(cam);
    expect(Math.abs(ready!.calibration!.hipHeightM - t.hipHeightM)).toBeLessThan(0.03);
    expect(Math.abs(ready!.calibration!.floorY.line - t.floorLine)).toBeLessThan(0.01);
    expect(said(states.slice(0, states.indexOf(ready!) + 1))).toEqual(['coach.space.intro', 'coach.space.arms', 'coach.space.still', 'coach.space.ready']);
    for (const s of states) expect(s.instruction.voiced).toBe(s.instruction.id.startsWith('coach.'));
    expect(ready!.headroom!.ok).toBe(true);
    expect(ready!.jumpHeight).toBe('read');
  });
});

// ── G3: the owner's takes ────────────────────────────────────────────────────────────────────────────────────────

describe("G3: the owner's takes", () => {
  it('his stand passes every rule on every frame from 3.6 m, and is too close at the takes\' own 3 m (fill 0.585)', () => {
    const fx = fixture('stand_still');
    const near = run(fx.frames);
    expect(new Set(near.filter((s) => s.issue).map((s) => s.issue))).toEqual(new Set(['tooClose']));
    expect(near.some((s) => s.ready)).toBe(false);
    const far = run(reshoot(fx, PLAY));
    expect(far.every((s) => s.check.issues.length === 0 || s.check.worst === 'noBody')).toBe(true);
    expect(far.at(-1)!.instruction.id).toBe('coach.space.arms');
  });

  it('a reach, then his own stand: ready, on his rulers', () => {
    const reach = shoot(spaceSession({ end: 3.2 }), PLAY, 11);
    const stand = later(reshoot(fixture('stand_still'), PLAY), endOf(reach));
    const states = run([...reach, ...stand]);
    const last = states.at(-1)!;
    expect(last.ready).toBe(true);
    expect(last.calibration!.t).toBeGreaterThan(stand[0].t + 600);
    const hipGt = [...fixture('stand_still').gt.perFrame.hipH].sort((a, b) => a - b)[fixture('stand_still').gt.perFrame.hipH.length >> 1];
    expect(Math.abs(last.calibration!.hipHeightM - hipGt)).toBeLessThan(0.03);
  });

  it.each(NAMES)('%s: one body at a time never fires (as shot, at 15 Hz, from 3.6 m and 4.5 m)', (name) => {
    const fx = fixture(name);
    for (const frames of [fx.frames, fx.frames.filter((_, i) => i % 2 === 0), reshoot(fx, PLAY), reshoot(fx, { distance: 4.5, heightM: 1.2 })]) {
      expect(run(frames).some((s) => s.issue === 'swap')).toBe(false);
    }
  });
});

// ── G4: fails where it should, and the fix passes ─────────────────────────────────────────────────────────────────

interface Fail {
  label: string;
  /** The failing stretch for a seed, and the check it runs on (aspect, light). */
  frames: (seed: number) => PoseFrame[];
  check?: () => SpaceCheck;
  /** Expected: the settled issue (null: none — the stage stalls instead) and the line said, at the end of the stretch. */
  issue: SpaceIssue | null;
  id: SpaceInstructionId;
  stage?: SpaceState['stage'];
  /** The fix, carried on in the same stream (default: the session at PLAY, on the same check). */
  fix?: (c: SpaceCheck, t0: number, seed: number) => PoseFrame[];
}

const stand = (sec: number, j: Joints = R0): JointClip => script([beat(j, sec)], 30);
const turnY = (j: Joints, deg: number): Joints => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return Object.fromEntries(Object.entries(j).map(([k, p]) => [k, [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]])) as Joints;
};
const dimmed = (frames: PoseFrame[]) => frames.map((f) => (f.present ? { ...f, image: f.image.map((l) => ({ ...l, v: l.v * 0.5 })) } : f));
const DARK = { frame: lumaHistogram(new Uint8ClampedArray(64 * 48 * 4).map((_, i) => (i % 4 === 3 ? 255 : 22)), 64, 48) };
const OK_LIGHT = { frame: lumaHistogram(new Uint8ClampedArray(64 * 48 * 4).map((_, i) => (i % 4 === 3 ? 255 : 120 + (i % 7))), 64, 48) };
const UPRIGHT = { width: 720, height: 1280, hfovDeg: 43, heightM: 1.2 };
/** The reach, then the stand replaced by `tail` from as the arms come down (the stand is never still). */
/** The fix: a stand of 2 s where the player now is, then the session. */
const FIX_SESSION = spaceSession({ up: 3.2, down: 4.6, end: 7 });
const reachThen = (tail: JointClip, seed: number) => {
  const reach = shoot(spaceSession({ end: 2.9 }), PLAY, seed);
  return [...reach, ...later(shoot(tail, PLAY, seed + 100), endOf(reach))];
};

const FAILS: Fail[] = [
  { label: 'feet cut: the lens level at 1.9 m', frames: (s) => shoot(stand(2.5), { distance: 3.6, heightM: 1.9 }, s), issue: 'feet', id: 'coach.space.feet' },
  { label: 'feet cut: the lens at 0.4 m tilted up', frames: (s) => shoot(stand(2.5), { distance: 3.6, heightM: 0.4, lookAtY: 1.8 }, s), issue: 'feet', id: 'coach.space.feet' },
  { label: 'the reach cut off: the lens at 0.5 m (raise the camera)', frames: (s) => shoot(spaceSession({ end: 4.5 }), { distance: 3.6, heightM: 0.5 }, s), issue: null, id: 'space.raise', stage: 'arms' },
  { label: 'too close: 2.4 m, the feet cut', frames: (s) => shoot(stand(2.5), { distance: 2.4, heightM: 1.2 }, s), issue: 'tooClose', id: 'coach.space.back' },
  { label: 'too close: 2.7 m, all in', frames: (s) => shoot(stand(2.5), { distance: 2.7, heightM: 1.2 }, s), issue: 'tooClose', id: 'coach.space.back' },
  { label: 'too far: 5.5 m', frames: (s) => shoot(stand(2.5), { distance: 5.5, heightM: 1.2 }, s), issue: 'tooFar', id: 'coach.space.closer' },
  { label: 'turned 60°', frames: (s) => shoot(stand(2.5, turnY(R0, 60)), PLAY, s), issue: 'turned', id: 'space.turn' },
  { label: 'the back to the camera', frames: (s) => shoot(stand(2.5, turnY(R0, 180)), PLAY, s), issue: 'turned', id: 'space.turn' },
  { label: 'off to their own left (+0.9 m)', frames: (s) => shoot(stand(2.5, moveJoints(R0, [0.9, 0, 0])), PLAY, s), issue: 'moveRight', id: 'coach.space.right' },
  { label: 'off to their own right (−0.9 m)', frames: (s) => shoot(stand(2.5, moveJoints(R0, [-0.9, 0, 0])), PLAY, s), issue: 'moveLeft', id: 'coach.space.left' },
  {
    label: 'a phone standing upright: turn it', frames: (s) => shoot(stand(2.5), { ...UPRIGHT, distance: 2.5 }, s),
    check: () => new SpaceCheck({ aspect: 9 / 16 }), issue: 'narrow', id: 'space.wide',
    fix: (c, t0, s) => { c.setAspect(16 / 9); return later(shoot(FIX_SESSION, { ...PHONE, distance: 4.5 }, s), t0); },
  },
  {
    label: 'too dark: a weak read and a dark picture', frames: (s) => dimmed(shoot(stand(2.5), PLAY, s)),
    check: () => { const c = new SpaceCheck(); c.light(DARK); return c; }, issue: 'dim', id: 'space.light',
    fix: (c, t0, s) => { c.light(OK_LIGHT); return later(shoot(FIX_SESSION, PLAY, s), t0); },
  },
  {
    label: 'a second body: the tracker switches once',
    frames: (s) => swapStream(shoot(spaceSession({ end: 5 }), PLAY, s), shoot(stand(5.1, moveJoints(R0, [0.6, 0, 0])), PLAY, s + 1), { from: 20 }).slice(0, 60),
    issue: 'swap', id: 'space.one',
  },
  // the review's misses: a slow camera, a missed detection at the switch, and someone straight behind (no hip moves)
  {
    label: 'a second body at 15 Hz, 0.5 m to the side',
    frames: (s) => swapStream(shoot(spaceSession({ end: 5 }), PLAY, s, { fps: 15 }), shoot(stand(5.1, moveJoints(R0, [0.5, 0, 0])), PLAY, s + 1, { fps: 15 }), { from: 10 }).slice(0, 30),
    issue: 'swap', id: 'space.one',
  },
  {
    label: 'a second body at 20 Hz, 0.5 m to the side',
    frames: (s) => swapStream(shoot(spaceSession({ end: 5 }), PLAY, s, { fps: 20 }), shoot(stand(5.1, moveJoints(R0, [0.5, 0, 0])), PLAY, s + 1, { fps: 20 }), { from: 13 }).slice(0, 40),
    issue: 'swap', id: 'space.one',
  },
  {
    label: 'a second body 0.5 m to the side, the switch frame missed',
    frames: (s) => swapStream(shoot(spaceSession({ end: 5 }), PLAY, s), shoot(stand(5.1, moveJoints(R0, [0.5, 0, 0])), PLAY, s + 1), { from: 20 })
      .map((f, i) => (i === 20 ? { t: f.t, arrive: f.arrive, present: false, image: [] } : f)).slice(0, 60),
    issue: 'swap', id: 'space.one',
  },
  {
    label: 'a second body 0.5 m straight behind',
    frames: (s) => swapStream(shoot(spaceSession({ end: 5 }), PLAY, s), shoot(stand(5.1, moveJoints(R0, [0, 0, -0.5])), PLAY, s + 1), { from: 20 }).slice(0, 60),
    issue: 'swap', id: 'space.one',
  },
  {
    label: 'a second body: the two take turns every 5 frames',
    frames: (s) => swapStream(shoot(spaceSession({ end: 6 }), PLAY, s), shoot(spaceSession({ end: 6, body: moveJoints(R0, [0.6, 0, 0]) }), PLAY, s + 1), { from: 10, every: 5 }),
    issue: 'swap', id: 'space.one',
  },
  { label: 'moving through the stand: a jog in place', frames: (s) => reachThen(script([jogBeat(R0, 3, 3, 0.15)], 30), s), issue: null, id: 'coach.space.still', stage: 'still' },
  {
    label: 'moving through the stand: a 5 cm sway',
    frames: (s) => reachThen(script([[3, (t: number) => moveJoints(R0, [0.05 * Math.sin(2 * Math.PI * t), 0, 0])]], 30), s),
    issue: null, id: 'coach.space.still', stage: 'still',
  },
  {
    label: 'no world landmarks (a feed with no depth)', frames: (s) => shoot(spaceSession({ end: 5 }), PLAY, s).map((f) => ({ ...f, world: undefined })),
    issue: null, id: 'space.depth', stage: 'still',
  },
];

describe('G4: the check fails where it should, and the fix passes', () => {
  const rows = FAILS.flatMap((f) => SEEDS.map((seed) => [f.label, seed, f] as const));
  it.each(rows)('%s, seed %i', (_label, seed, f) => {
    const c = f.check?.() ?? new SpaceCheck();
    const bad = f.frames(seed);
    const states = run(bad, c);
    expect(states.some((s) => s.ready), 'never ready').toBe(false);
    const last = states.at(-1)!;
    expect(last.issue).toBe(f.issue);
    expect(last.instruction.id).toBe(f.id);
    if (f.stage) expect(last.stage).toBe(f.stage);
    // the fix, in the same stream: the same check carries on to ready. The player moves (or moves the camera) and
    // stands a moment before the reach is asked for — the jump from the failing spot is itself a jump the one-body
    // rule may read as someone else, which holds the check SWAP_HOLD_MS before it starts over.
    const fixed = f.fix?.(c, endOf(bad), seed) ?? later(shoot(FIX_SESSION, PLAY, seed + 7), endOf(bad));
    const after = run(fixed, c);
    expect(after.at(-1)!.ready, 'ready after the fix').toBe(true);
    expect(after.at(-1)!.calibration!.t).toBeGreaterThan(fixed[0].t);
  });
});

// ── G5: warns, never locks out ──────────────────────────────────────────────────────────────────────────────────────

describe('G5: warnings never lock the player out', () => {
  it.each([[15], [20]])('a %i Hz camera: the advice once, then ready, with jump height unread', (fps) => {
    for (const seed of SEEDS) {
      const states = run(shoot(spaceSession({ end: 8 }), PLAY, seed, { fps }));
      const last = states.at(-1)!;
      expect(last.ready).toBe(true);
      expect(last.poseHz!).toBeLessThan(MIN_POSE_HZ);
      expect(last.jumpHeight).toBe('unread');
      expect(said(states).filter((id) => id === 'space.rate')).toHaveLength(1);
      const shown = states.filter((s) => s.instruction.id === 'space.rate');
      expect(shown.at(-1)!.t - shown[0].t).toBeLessThanOrEqual(ADVICE_MS + 100);
    }
  });

  it('30 Hz: jump height read', () => {
    for (const seed of SEEDS) expect(run(shoot(spaceSession(), PLAY, seed)).at(-1)!.jumpHeight).toBe('read');
  });

  it.each([
    ['dark', DARK, 'space.light'],
    ['backlit', {
      frame: lumaHistogram(new Uint8ClampedArray(64 * 48 * 4).map((_, i) => (i % 4 === 3 ? 255 : Math.floor(i / 4) < 64 * 16 ? 250 : 130)), 64, 48),
      body: lumaHistogram(new Uint8ClampedArray(16 * 16 * 4).map((_, i) => (i % 4 === 3 ? 255 : 40)), 16, 16),
    }, 'space.backlit'],
  ] as const)('a %s picture with a good read: the advice once, then ready', (_label, sample, id) => {
    for (const seed of SEEDS) {
      const c = new SpaceCheck();
      c.light(sample);
      const states = run(shoot(spaceSession({ end: 8 }), PLAY, seed), c);
      expect(states.at(-1)!.ready).toBe(true);
      expect(said(states).filter((x) => x === id)).toHaveLength(1);
      const shown = states.filter((s) => s.instruction.id === id);
      expect(shown.at(-1)!.t - shown[0].t).toBeLessThanOrEqual(ADVICE_MS + 100);
    }
  });

  it('the safety note (ceiling, clearance) opens every run', () => {
    for (const seed of SEEDS) expect(run(shoot(spaceSession(), PLAY, seed))[0].safety).toEqual(SAFETY_NOTE);
  });
});

// ── G6: nothing reaches a game before the check ────────────────────────────────────────────────────────────────────

const BOUND = Object.values(BODY_PROFILES).filter((p) => p.bindings.length > 0);

describe('G6: nothing reaches a game before the check has passed', () => {
  it('there are nine bound games', () => {
    expect(BOUND.map((p) => p.key).sort()).toEqual(['bigair', 'freerun', 'karate_vs', 'mixedcombat', 'showdown', 'skateboard', 'snowboard_slalom', 'sprint', 'surf']);
  });

  const streams: [string, PoseFrame[]][] = [
    ['the session', shoot(spaceSession({ end: 6 }), PLAY, 17)],
    ...FAILS.map((f) => [f.label, f.frames(17)] as [string, PoseFrame[]]),
  ];
  it.each(streams)('%s: the reader never calibrates itself, and the nine games get nothing — no press, no START', (_label, frames) => {
    const packets = bodyPackets(frames, { reader: { autoCalibrate: false } });
    expect(packets.filter((p) => p.read.calibrated)).toEqual([]);
    for (const profile of BOUND) {
      // READY: the check's own reach (both hands up for 1.4 s) must not START the game; and a game already playing
      // (the check over a pause, a GO AGAIN) gets no press from a body the check has not passed
      const ready = seamReplay(packets, { profile, start: 'ready' });
      expect(ready.intents, profile.key).toEqual([]);
      expect(ready.floor, profile.key).toEqual([]);
      expect(ready.phases.map((p) => p.phase), profile.key).toEqual(['ready']);
      const playing = seamReplay(packets, { profile, start: 'playing' });
      expect(playing.floor.filter((e) => !isRelease(e.e)), profile.key).toEqual([]);
      expect(playing.intents, profile.key).toEqual([]);
    }
  });

  /** A take on the owner's own stand, both shot from 3.6 m, after the check's reach: the check's calibration, and the
   *  packets a reader given it reads from the stand on. */
  function calibrated(name: string) {
    const fx = fixture(name);
    const shot = { ...fx, frames: reshoot(fx, PLAY) };
    const standAt = standFrame(fx, fixture('stand_still').frames[70]).frame;
    const idx = fx.frames.indexOf(standAt);
    const on = idx >= 0 && shot.frames[idx].present ? shot.frames[idx] : reshoot({ settings: fixture('stand_still').settings, frames: [fixture('stand_still').frames[70]] }, PLAY)[0];
    const reach = later(shoot(spaceSession({ end: 3.2 }), PLAY, 11), fx.frames[0].t - 3233 - STAND_SEC * 1000 - 33);
    const lead = holdStill(on, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: fx.frames[0].t });
    const c = new SpaceCheck();
    const states = run([...reach, ...lead], c);
    const cal = states.at(-1)!.calibration;
    return { fx, cal, packets: cal ? bodyPackets([...lead, ...shot.frames], { lead: lead.length, reader: { autoCalibrate: false, calibration: cal } }) : [] };
  }
  const isRelease = (e: { t: string; pressed?: boolean; x?: number; y?: number; value?: number }) =>
    (e.t === 'button' || e.t === 'dpad') ? !e.pressed : e.t === 'stick' ? e.x === 0 && e.y === 0 : e.value === 0;

  it('given the check\'s calibration, skate pops once per true jump (jump_two_foot_low)', () => {
    const { fx, cal, packets } = calibrated('jump_two_foot_low');
    expect(cal).not.toBeNull();
    expect(packets.every((p) => p.read.calibrated)).toBe(true);
    const r = seamReplay(packets, { profile: BODY_PROFILES.skateboard, start: 'playing' });
    const pops = r.events.filter((e) => e.e.t === 'button' && e.e.btn === 'A' && e.e.pressed).map((e) => e.t);
    // the P3 gate's matching (bodyGate.test hopPulses): each pop to the nearest true take-off within 350 ms, one each;
    // a take-off the reader tells at the stand → take splice (the take starts in the air) is the splice's, not a jump
    const splice = fx.frames[0].t;
    const jumps = fx.gt.jumps.map((j) => j.takeoff.t).filter((t) => t >= splice + SPLICE_MS);
    const used = new Set<number>();
    const unmatched = pops.filter((t) => {
      const j = jumps.filter((q) => !used.has(q) && Math.abs(t - q) <= 350).sort((a, b) => Math.abs(t - a) - Math.abs(t - b))[0];
      if (j !== undefined) { used.add(j); return false; }
      return Math.abs(t - splice) > SPLICE_MS + 350;
    });
    expect(unmatched).toEqual([]);
    expect(used.size).toBe(jumps.length);
  });

  it('given the check\'s calibration, karate VS jabs three times and kicks once (punch_kick) (the floor row; the harness claims these in P7)', () => {
    const { cal, packets } = calibrated('punch_kick');
    expect(cal).not.toBeNull();
    const r = seamReplay(packets, { profile: BODY_PROFILES['karate-vs'], start: 'playing' });
    const pressed = (btn: string) => r.events.filter((e) => e.e.t === 'button' && e.e.btn === btn && e.e.pressed).length;
    expect(pressed('A')).toBe(3);
    expect(pressed('B')).toBe(1);
  });

  it('given the check\'s calibration, Free Run runs on the cadence and never steers (run_in_place)', () => {
    const { cal, packets } = calibrated('run_in_place');
    expect(cal).not.toBeNull();
    const r = seamReplay(packets, { profile: BODY_PROFILES.freerun, start: 'playing' });
    const sticks = r.events.filter((e) => e.e.t === 'stick').map((e) => e.e as { x: number; y: number });
    expect(sticks.length).toBeGreaterThan(0);
    expect(Math.min(...sticks.map((s) => s.y))).toBeLessThanOrEqual(-0.3);
    expect(sticks.every((s) => s.x === 0)).toBe(true);
  });
});
