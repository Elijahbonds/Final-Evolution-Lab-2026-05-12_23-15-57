import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkSpace, headroomOk, stepBackClears, stepBackWidens, readLight, poseRate, medianFrame, spaceOverlay, SpaceCheck,
  SPACE_COACH_IDS, SPACE_ORDER, SAFETY_NOTE, PLAY_FILL_MAX, PLAY_FILL_MIN, WRIST_TOP_MIN, HEADROOM_JUMP_M, NOSE_ANKLE_M,
  NOSE_ANKLE_OVER_REACH, ANKLE_Y_MAX, MIN_POSE_HZ, ADVICE_MS, SIDE_EDGE, LUMA_DARK_MEAN, SETTLE_MS, FRAME_HOLD_MS,
  ARMS_HOLD_MS, SWAP_HOLD_MS, SWAP_M, SWAP_STEP_M, SWAP_MARGIN, SWAP_FRAME_MS, SWAP_GAP_FRAMES,
  type SpaceState, type SpaceInstructionId,
} from './spaceCheck';
import { restPose, moveJoints, synthesize, type Joints, type JointClip, type V3, type CameraSpec, type PoseFixture } from '../pose/synth';
import { reshoot, armsUp, spaceSession as session, swapStream, script, hold as beat, jogBeat } from '../pose/streamKit';
import {
  NOSE, LEFT_WRIST, RIGHT_WRIST, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, LEFT_ANKLE,
  RIGHT_ANKLE, type PoseFrame,
} from '../pose/landmarks';
import { COACH_MOMENTS } from '../babylon/audio/mic/moments';

// ── bodies, cameras, streams ─────────────────────────────────────────────────────────────────────────────────────

/** A living-room framing that passes: 3.6 m out, the lens at 1.2 m, landscape 640×480 (the synth's default lens). */
const PLAY: Partial<CameraSpec> = { distance: 3.6, heightM: 1.2 };
const quiet = { noise: false as const, dropRate: 0, missRate: 0, frameJitterMs: 0, latencyJitterMs: 0 };

const mapAll = (j: Joints, fn: (p: V3) => V3) => Object.fromEntries(Object.entries(j).map(([k, p]) => [k, fn(p)])) as Joints;
/** Turned about the vertical by deg (positive = the left shoulder swings away from the lens). */
const rotY = (j: Joints, deg: number) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return mapAll(j, (p) => [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]);
};
// armsUp, the check's session (stand → reach → lower → stand) and reshoot live in lib/pose/streamKit (movement play P4:
// the gate, the report and the live probe share them)

const hold = (sec: number, j: Joints = restPose(), fps = 30): JointClip =>
  ({ fps, frames: Array.from({ length: Math.round(sec * fps) + 1 }, () => j) });

const shoot = (clip: JointClip, camera: Partial<CameraSpec> = PLAY, extra: object = {}) =>
  synthesize(clip, { camera, seed: 11, ...extra }).frames;
const first = (frames: PoseFrame[]) => frames.find((f) => f.present)!;
const run = (frames: PoseFrame[], c = new SpaceCheck()) => frames.map((f) => c.push(f));
/** The instruction ids in the order they were given (each change once). */
const said = (states: SpaceState[]) => states.map((s) => s.instruction.id).filter((id, i, a) => i === 0 || id !== a[i - 1]);

// ── the fixtures: the owner's own takes, and the same takes shot from further back ─────────────────────────────────

const FIX = join(__dirname, '..', 'pose', '__fixtures__');
const fixture = (name: string) => JSON.parse(readFileSync(join(FIX, `${name}.json`), 'utf8')) as PoseFixture;

// ── the rules, one frame at a time ───────────────────────────────────────────────────────────────────────────────

describe('the play profile, one frame', () => {
  it('passes a body framed for play, and reads it', () => {
    const c = checkSpace(first(shoot(hold(0.3), PLAY, quiet)));
    expect(c.ok).toBe(true);
    expect(c.reading.fill).toBeGreaterThan(PLAY_FILL_MIN);
    expect(c.reading.fill).toBeLessThan(PLAY_FILL_MAX);
    expect(c.reading.facing).toBeGreaterThan(0.95);
    expect(c.reading.room!.playerLeft).toBeGreaterThan(0);
    expect(c.reading.room!.playerRight).toBeGreaterThan(0);
    expect(c.reading.armsUp).toBe(false);
    expect(c.reading.armsDown).toBe(true);
  });

  const bad: [string, JointClip, Partial<CameraSpec>, string, SpaceInstructionId][] = [
    ['too close (2.4 m: the feet cut, the torso says too big)', hold(0.3), { distance: 2.4 }, 'tooClose', 'coach.space.back'],
    ['too close (2.7 m: all in, over the band)', hold(0.3), { distance: 2.7 }, 'tooClose', 'coach.space.back'],
    ['too far (5.5 m)', hold(0.3), { distance: 5.5 }, 'tooFar', 'coach.space.closer'],
    ['the camera low and tilted up at the face: the feet cut', hold(0.3), { distance: 3.6, heightM: 0.4, lookAtY: 1.8 }, 'feet', 'coach.space.feet'],
    ['the camera level but high: the feet cut', hold(0.3), { distance: 3.6, heightM: 1.9 }, 'feet', 'coach.space.feet'],
    ['stood 0.9 m to their own LEFT (image right)', hold(0.3, moveJoints(restPose(), [0.9, 0, 0])), PLAY, 'moveRight', 'coach.space.right'],
    ['stood 0.9 m to their own RIGHT (image left)', hold(0.3, moveJoints(restPose(), [-0.9, 0, 0])), PLAY, 'moveLeft', 'coach.space.left'],
    ['a portrait phone at 2.9 m: no room for 2 m of side-steps', hold(0.3), { width: 480, height: 640, hfovDeg: 45, distance: 2.9 }, 'narrow', 'coach.space.back'],
    ['turned 60°', hold(0.3, rotY(restPose(), 60)), PLAY, 'turned', 'space.turn'],
    ['the back to the camera', hold(0.3, rotY(restPose(), 180)), PLAY, 'turned', 'space.turn'],
  ];
  it.each(bad)('%s', (_label, clip, camera, issue, id) => {
    const frames = shoot(clip, camera, quiet);
    const c = checkSpace(first(frames));
    expect(c.worst).toBe(issue);
    // …and the machine says it, in the Coach's words
    const states = run(frames);
    expect(states[states.length - 1].instruction.id).toBe(id);
    expect(states[states.length - 1].stage).toBe('frame');
  });

  it("'move to your right' is the player's right: a body on the image's right has its own left there", () => {
    // facing the camera, the image is not mirrored: the player's left shoulder is on the image's right
    const f = first(shoot(hold(0.3, moveJoints(restPose(), [0.9, 0, 0])), PLAY, quiet));
    expect(f.image[LEFT_SHOULDER].x).toBeGreaterThan(f.image[RIGHT_SHOULDER].x);
    expect((f.image[LEFT_HIP].x + f.image[RIGHT_HIP].x) / 2).toBeGreaterThan(0.5);
    expect(checkSpace(f).reading.room!.playerLeft).toBeLessThan(0);    // a step to their left leaves the picture
    expect(checkSpace(f).reading.room!.playerRight).toBeGreaterThan(0);
    // with no world landmarks the ruler comes from the fill and the aspect, and says the same
    expect(checkSpace({ ...f, world: undefined }).worst).toBe('moveRight');
    expect(checkSpace({ ...f, world: undefined }, { aspect: 4 / 3 }).reading.room!.playerLeft).toBeLessThan(0);
  });

  it('the side range is a prediction the camera bears out: a real 1 m side-step stays in where it passed, leaves where it did not', () => {
    const inX = (f: PoseFrame) => [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, LEFT_ANKLE, RIGHT_ANKLE]
      .every((i) => f.image[i].x >= SIDE_EDGE && f.image[i].x <= 1 - SIDE_EDGE);
    const portrait = { width: 480, height: 640, hfovDeg: 45, distance: 2.9 };
    for (const dx of [-1, 1]) {
      expect(inX(first(shoot(hold(0.3, moveJoints(restPose(), [dx, 0, 0])), PLAY, quiet)))).toBe(true);
      expect(inX(first(shoot(hold(0.3, moveJoints(restPose(), [dx, 0, 0])), portrait, quiet)))).toBe(false);
    }
  });

  it('reads a turn from depth, and a slight one is fine', () => {
    expect(checkSpace(first(shoot(hold(0.3, rotY(restPose(), 20)), PLAY, quiet))).ok).toBe(true);
    const t = checkSpace(first(shoot(hold(0.3, rotY(restPose(), 60)), PLAY, quiet)));
    expect(t.reading.facing).toBeLessThan(0.6);
    // with no world landmarks it falls back to the image depth (z) and still sees it
    const f = first(shoot(hold(0.3, rotY(restPose(), 60)), PLAY, quiet));
    expect(checkSpace({ ...f, world: undefined }).worst).toBe('turned');
  });

  it('asks for the body when there is none', () => {
    const c = checkSpace({ t: 0, present: false, image: [] });
    expect(c.issues).toEqual(['noBody']);
    const states = run([{ t: 0, present: false, image: [] }]);
    expect(states[0].instruction.id).toBe('coach.space.intro');
  });

  it('a weak read is a light problem, and a dark room says so first', () => {
    const f = first(shoot(hold(0.3), PLAY, quiet));
    const weak = { ...f, image: f.image.map((l) => ({ ...l, v: l.v * 0.5 })) };
    expect(checkSpace(weak).worst).toBe('dim');
    const c = new SpaceCheck();
    c.light({ frame: histogram([[20, 1]]) });
    expect(c.push(weak).instruction.id).toBe('space.light');
    c.light({ frame: histogram([[120, 0.8], [250, 0.2]]), body: histogram([[40, 1]]) });
    expect(c.push({ ...weak, t: 400 }).instruction.id).toBe('space.backlit');
  });

  it('an upright 9:16 phone can never see 2 m of side-steps inside the fill band: turn it, rather than step back', () => {
    // a phone's ~70° long side is ~43° across when it stands upright
    const upright = { width: 720, height: 1280, hfovDeg: 43, heightM: 1.2 };
    const aspect = 9 / 16;
    const seen = new Set<string>();
    for (let d = 2.2; d <= 5.5; d += 0.1) {
      const frames = shoot(hold(1.2), { ...upright, distance: d }, quiet);
      const f = frames.find((x) => x.present);
      if (!f) continue;
      const c = checkSpace(f, { aspect });
      expect(c.ok, `${d.toFixed(1)} m`).toBe(false);
      if (c.worst !== 'narrow') continue;
      const last = run(frames, new SpaceCheck({ aspect })).at(-1)!.instruction;
      seen.add(last.id);
      expect(last.id, `${d.toFixed(1)} m`).toBe('space.wide');
      expect(last.text).toMatch(/on its side/);
      expect(last.voiced).toBe(false);
    }
    expect(seen).toEqual(new Set(['space.wide']));
    // the same phone on its side is a framing that passes
    const onSide = checkSpace(first(shoot(hold(0.3), { width: 1280, height: 720, hfovDeg: 70, heightM: 1.2, distance: 4.0 }, quiet)), { aspect: 16 / 9 });
    expect(onSide.ok).toBe(true);
    // a landscape camera that narrow is told it needs a wider one, not to turn
    const c = new SpaceCheck({ aspect });
    c.setAspect(16 / 9);
    const narrowLandscape = run(shoot(hold(1.2), { ...upright, distance: 2.5 }, quiet), c).at(-1)!.instruction;
    expect(narrowLandscape.id).toBe('space.wide');
    expect(narrowLandscape.text).toMatch(/wider camera/);
  });

  it('"step back" or "turn the camera" for a narrow view: the prediction agrees with the camera', () => {
    let narrow = 0, turn = 0;
    for (const [width, height] of [[480, 640], [720, 1280]] as const) for (const hfovDeg of [35, 40, 45, 50, 55]) {
      for (let d = 2.2; d <= 4.2; d += 0.2) {
        const cam = { width, height, hfovDeg, heightM: 1.2, distance: d };
        const f = shoot(hold(0.1), cam, quiet).find((x) => x.present);
        if (!f) continue;
        const c = checkSpace(f, { aspect: width / height });
        if (c.worst !== 'narrow') continue;
        narrow++;
        // walk the same camera back until the fill leaves the band: is there a spot with room for the steps?
        let widens = false;
        for (let d2 = d + 0.05; ; d2 += 0.05) {
          const g = shoot(hold(0.1), { ...cam, distance: d2 }, quiet).find((x) => x.present);
          const c2 = g && checkSpace(g, { aspect: width / height });
          if (!c2 || c2.reading.fill < PLAY_FILL_MIN) break;
          if (c2.reading.room && c2.reading.room.playerLeft + c2.reading.room.playerRight >= 0) { widens = true; break; }
        }
        const predicted = stepBackWidens(c.reading.room!, c.reading.fill);
        if (!predicted) turn++;
        expect(predicted, `${width}×${height} ${hfovDeg}° at ${d.toFixed(1)} m`).toBe(widens);
      }
    }
    expect(narrow).toBeGreaterThan(15);
    expect(turn).toBeGreaterThan(5);
    expect(narrow - turn).toBeGreaterThan(3);
  });

  it('says ONE thing at a time, feet before distance before side', () => {
    // too close AND off to one side: the side-step cannot be judged with the feet cut, and distance comes first
    const c = checkSpace(first(shoot(hold(0.3, moveJoints(restPose(), [0.5, 0, 0])), { distance: 2.4 }, quiet)));
    expect(c.worst).toBe('tooClose');
    const s = run(shoot(hold(0.3, moveJoints(restPose(), [0.5, 0, 0])), { distance: 2.4 }, quiet));
    expect(new Set(s.map((x) => x.instruction.id))).toEqual(new Set(['coach.space.back']));
  });
});

// ── headroom ─────────────────────────────────────────────────────────────────────────────────────────────────────

describe('jump headroom, with the arms overhead', () => {
  it('reads an arms-overhead frame: the hands clear the top by WRIST_TOP_MIN at the play framing', () => {
    const f = first(shoot(hold(0.3, armsUp()), PLAY, quiet));
    const r = checkSpace(f).reading;
    expect(r.armsUp).toBe(true);
    expect(r.reachTop).toBeCloseTo(Math.min(f.image[LEFT_WRIST].y, f.image[RIGHT_WRIST].y), 2);
    expect(r.reachTop).toBeGreaterThan(WRIST_TOP_MIN);
    expect(headroomOk(r)).toBe(true);
  });

  it('the rule is room for a HEADROOM_JUMP_M jump above the wrists, never under 15 % of the frame', () => {
    const f = first(shoot(hold(0.3, armsUp()), PLAY, quiet));
    const r = checkSpace(f).reading;
    // at the play framing the design jump binds: 0.5 m is more than 15 % of this frame
    expect(r.jumpSpan!).toBeGreaterThan(WRIST_TOP_MIN);
    expect(r.headroomNeed).toBe(r.jumpSpan);
    const lift = (dy: number) => ({ ...f, image: f.image.map((l, i) => [LEFT_WRIST, RIGHT_WRIST].includes(i) ? { ...l, y: l.y - dy } : l) });
    const top = r.reachTop!, need = r.headroomNeed!;
    expect(headroomOk(checkSpace(lift(top - need - 0.01)).reading)).toBe(true);    // wrists 1 % under the line
    expect(headroomOk(checkSpace(lift(top - need + 0.01)).reading)).toBe(false);   // 1 % over it
    // (15 % alone passed wrists at 0.155, where a 0.5 m jump leaves the picture)
    expect(headroomOk(checkSpace(lift(top - 0.155)).reading)).toBe(false);
    // far back the frame is tall and the 15 % floor binds instead
    const far = checkSpace(first(shoot(hold(0.3, armsUp()), { distance: 4.6, heightM: 1.2 }, quiet))).reading;
    expect(far.jumpSpan!).toBeLessThan(WRIST_TOP_MIN);
    expect(far.headroomNeed).toBe(WRIST_TOP_MIN);
  });

  it('the design jump in image units is what a real 0.5 m rise measures, with world landmarks or without', () => {
    const f = first(shoot(hold(0.3, armsUp()), PLAY, quiet));
    const risen = first(shoot(hold(0.3, moveJoints(armsUp(), [0, HEADROOM_JUMP_M, 0])), PLAY, quiet));
    const rise = f.image[LEFT_WRIST].y - risen.image[LEFT_WRIST].y;
    expect(Math.abs(checkSpace(f).reading.jumpSpan! - rise)).toBeLessThan(0.002);
    // the no-world ruler (the fill over NOSE_ANKLE_M) is within 2 % of it on the synth body
    expect(Math.abs(checkSpace({ ...f, world: undefined }).reading.jumpSpan! - rise)).toBeLessThan(0.02 * rise);
  });

  it('the band maximum is where the floor strip and the design jump just both fit', () => {
    const need = (fill: number) => Math.max(WRIST_TOP_MIN, (HEADROOM_JUMP_M / NOSE_ANKLE_M) * fill);
    // the reach (fill / 0.76 above the ankles) plus the room over it fills the frame down to the floor strip
    expect(PLAY_FILL_MAX / NOSE_ANKLE_OVER_REACH + need(PLAY_FILL_MAX)).toBeCloseTo(ANKLE_Y_MAX, 9);
    // and the design jump, not the 15 % floor, binds there (15 % alone would allow 0.585, and a 0.41 m jump)
    expect((HEADROOM_JUMP_M / NOSE_ANKLE_M) * PLAY_FILL_MAX).toBeGreaterThan(WRIST_TOP_MIN);
    expect(PLAY_FILL_MAX).toBeGreaterThan(0.56);
    expect(PLAY_FILL_MAX).toBeLessThan(0.57);
  });

  it('a lens near the floor passes the stand but not the reach, and stepping back cannot fix it: raise the camera', () => {
    const low = { distance: 3.6, heightM: 0.5 };
    expect(checkSpace(first(shoot(hold(0.3), low, quiet))).ok).toBe(true);
    const up = checkSpace(first(shoot(hold(0.3, armsUp()), low, quiet)));
    expect(up.reading.armsUp).toBe(true);
    expect(up.reading.reachTop).toBeLessThan(WRIST_TOP_MIN);
    // the old advice was "step back", and no distance in the band clears it: wherever the fill is still
    // ≥ PLAY_FILL_MIN the reach fails, so the player would walk from "step back" into "come closer"
    for (let d = 3.6; ; d += 0.1) {
      const stand = checkSpace(first(shoot(hold(0.3), { ...low, distance: d }, quiet)));
      if (stand.reading.fill < PLAY_FILL_MIN) { expect(stand.worst).toBe('tooFar'); break; }
      expect(headroomOk(checkSpace(first(shoot(hold(0.3, armsUp()), { ...low, distance: d }, quiet))).reading)).toBe(false);
    }
    const states = run(shoot(session({ end: 4 }), low));
    expect(said(states)).toEqual(['coach.space.intro', 'coach.space.arms', 'space.raise']);
    const last = states[states.length - 1];
    expect(last.stage).toBe('arms');
    expect(last.instruction.rule).toBe('headroom');
    expect(last.instruction.voiced).toBe(false);
    expect(last.headroom!.ok).toBe(false);
    expect(last.headroom!.stepBack).toBe(false);
  });

  it('"step back" or "raise the camera": the prediction agrees with the camera at every lens height', () => {
    // for every framing that passes standing but fails the reach, walk the same lens back until the fill leaves the
    // band: stepBackClears must say "step back" exactly when some distance on the way passes both
    let failing = 0, raise = 0;
    for (let h = 0.2; h <= 1.61; h += 0.1) for (let d = 2.8; d <= 5.0; d += 0.2) {
      const cam = { distance: d, heightM: h };
      if (!checkSpace(first(shoot(hold(0.1), cam, quiet))).ok) continue;
      const up = checkSpace(first(shoot(hold(0.1, armsUp()), cam, quiet))).reading;
      if (headroomOk(up)) continue;
      failing++;
      let clears = false;
      for (let d2 = d + 0.05; ; d2 += 0.05) {
        const s2 = checkSpace(first(shoot(hold(0.1), { ...cam, distance: d2 }, quiet)));
        if (s2.reading.fill < PLAY_FILL_MIN) break;
        if (s2.ok && headroomOk(checkSpace(first(shoot(hold(0.1, armsUp()), { ...cam, distance: d2 }, quiet))).reading)) { clears = true; break; }
      }
      const predicted = stepBackClears(up.reachTop!, up.fill, up.jumpSpan!);
      if (!predicted) raise++;
      expect(predicted, `lens ${h.toFixed(1)} m at ${d.toFixed(1)} m`).toBe(clears);
    }
    expect(failing).toBeGreaterThan(20);
    expect(raise).toBeGreaterThan(5);
    expect(failing - raise).toBeGreaterThan(5);
  });

  it('a bent arm is judged as the straight arm it could be', () => {
    const f = first(shoot(hold(0.3, armsUp(restPose(), 25, 50)), PLAY, quiet));
    const r = checkSpace(f).reading;
    expect(r.armsUp).toBe(true);
    const measured = Math.min(f.image[LEFT_WRIST].y, f.image[RIGHT_WRIST].y);
    expect(r.reachTop!).toBeLessThan(measured - 0.01);
    // …and the prediction is where the same arms reach when they straighten
    const straight = checkSpace(first(shoot(hold(0.3, armsUp(restPose(), 0)), PLAY, quiet))).reading.reachTop!;
    expect(Math.abs(r.reachTop! - straight)).toBeLessThan(0.01);
  });

  it('hands on the head are not arms overhead', () => {
    const j = restPose();
    const onHead = { ...j, LeftForeArm: [0.3, 1.6, 0] as V3, LeftHand: [0.06, 1.8, 0.02] as V3, RightForeArm: [-0.3, 1.6, 0] as V3, RightHand: [-0.06, 1.8, 0.02] as V3 };
    expect(checkSpace(first(shoot(hold(0.3, onHead), PLAY, quiet))).reading.armsUp).toBe(false);
  });

  it('what a pass promises: at every lens height and distance, a pass keeps a HEADROOM_JUMP_M jump\'s hands in the picture', () => {
    let passes = 0;
    for (let h = 0.5; h <= 1.6; h += 0.1) for (const d of [3.0, 3.3, 3.6, 4.0, 4.4]) {
      const cam = { distance: d, heightM: h };
      if (!checkSpace(first(shoot(hold(0.3), cam, quiet))).ok) continue;
      const r = checkSpace(first(shoot(hold(0.3, armsUp()), cam, quiet))).reading;
      if (!headroomOk(r)) continue;
      passes++;
      const apex = first(shoot(hold(0.3, moveJoints(armsUp(), [0, HEADROOM_JUMP_M, 0])), cam, quiet));
      expect(Math.min(apex.image[LEFT_WRIST].y, apex.image[RIGHT_WRIST].y), `lens ${h.toFixed(1)} m at ${d} m`).toBeGreaterThan(0);
    }
    expect(passes).toBeGreaterThan(8);
  });
});

// ── light, rate ──────────────────────────────────────────────────────────────────────────────────────────────────

/** A 32-bin luma histogram with `share` of 4096 pixels at each luma. */
function histogram(parts: [number, number][], bins = 32): number[] {
  const h = new Array(bins).fill(0);
  for (const [luma, share] of parts) h[Math.min(bins - 1, Math.floor((luma * bins) / 256))] += Math.round(share * 4096);
  return h;
}

describe('light', () => {
  it('a normal room is fine', () => {
    expect(readLight({ frame: histogram([[90, 0.3], [120, 0.4], [160, 0.3]]) })!.verdict).toBe('ok');
  });
  it('too dark: the mean under the line', () => {
    const r = readLight({ frame: histogram([[20, 0.6], [60, 0.4]]) })!;
    expect(r.mean).toBeLessThan(LUMA_DARK_MEAN);
    expect(r.verdict).toBe('dark');
  });
  it('backlit: a clipped window, and the body a silhouette', () => {
    expect(readLight({ frame: histogram([[250, 0.2], [120, 0.8]]), body: histogram([[45, 1]]) })!.verdict).toBe('backlit');
    // the same bright frame with a well-lit body is only a bright room
    expect(readLight({ frame: histogram([[250, 0.2], [120, 0.8]]), body: histogram([[130, 1]]) })!.verdict).toBe('ok');
    // no body box: bright and dark with little between
    expect(readLight({ frame: histogram([[250, 0.2], [30, 0.4], [120, 0.4]]) })!.verdict).toBe('backlit');
  });
  it('an empty sample reads nothing', () => {
    expect(readLight({ frame: [] })).toBeNull();
    expect(readLight({ frame: [0, 0, 0] })).toBeNull();
  });
  it('a bin that is not a pixel count (Infinity, NaN, negative) is dropped, not averaged in', () => {
    const good = histogram([[20, 0.6], [60, 0.4]]);
    const bad = [...good];
    bad[31] = Infinity; bad[30] = NaN; bad[29] = -500;
    const r = readLight({ frame: bad })!;
    expect(Number.isFinite(r.mean)).toBe(true);
    expect(r.verdict).toBe('dark');
    expect(r.mean).toBeCloseTo(readLight({ frame: good })!.mean, 9);
    expect(readLight({ frame: [Infinity, NaN] })).toBeNull();
  });
});

describe('pose rate', () => {
  it('counts frames per second of capture time, unknown until it has ~0.7 s', () => {
    expect(poseRate([0, 33])).toBeNull();
    expect(poseRate(Array.from({ length: 31 }, (_, i) => i * 1000 / 30))).toBeCloseTo(30, 5);
    expect(poseRate(Array.from({ length: 16 }, (_, i) => i * 1000 / 15))).toBeCloseTo(15, 5);
  });
  it('a 15 Hz camera: the advice once, then play with the jump height unread', () => {
    const states = run(shoot(session({ end: 8 }, 30), PLAY, { fps: 15 }));
    const ids = said(states);
    expect(ids).toContain('space.rate');
    expect(ids.indexOf('space.rate')).toBeLessThan(ids.indexOf('coach.space.still'));
    const last = states[states.length - 1];
    expect(last.ready).toBe(true);
    expect(last.poseHz!).toBeLessThan(MIN_POSE_HZ);
    expect(last.jumpHeight).toBe('unread');
    expect(last.notes.map((n) => n.id)).toContain('space.rate');
    // shown for its time, not forever
    const shown = states.filter((s) => s.instruction.id === 'space.rate');
    expect(shown[shown.length - 1].t - shown[0].t).toBeLessThanOrEqual(ADVICE_MS + 100);
  });
});

// ── the machine ──────────────────────────────────────────────────────────────────────────────────────────────────

describe('the space check, start to ready', () => {
  it('stand → arms overhead → stand still → ready, one instruction at a time, with the calibration', () => {
    const states = run(shoot(session()));
    expect(said(states)).toEqual(['coach.space.intro', 'coach.space.arms', 'coach.space.still', 'coach.space.ready']);
    const stages = states.map((s) => s.stage).filter((s, i, a) => i === 0 || s !== a[i - 1]);
    // (advice is passed through on the frame the reach clears: nothing to advise at 30 Hz with no light sample)
    expect(stages).toEqual(['frame', 'arms', 'still', 'ready']);
    const last = states[states.length - 1];
    expect(last.ready).toBe(true);
    expect(last.jumpHeight).toBe('read');
    expect(last.headroom!.ok).toBe(true);
    expect(last.calibration).not.toBeNull();
    // the rulers are the stand's (arms down, after the reach): the rest body's hips are ~0.95 m up
    expect(last.calibration!.hipHeightM).toBeGreaterThan(0.85);
    expect(last.calibration!.hipHeightM).toBeLessThan(1.05);
    expect(last.calibration!.t).toBeGreaterThan(2600 + 400);
    // the voiced lines are the Coach's
    for (const s of states) expect(s.instruction.voiced).toBe(s.instruction.id.startsWith('coach.'));
  });

  it('the safety note (ceiling, clearance) shows once per run, and again after a reset', () => {
    const frames = shoot(hold(1));
    const c = new SpaceCheck();
    const states = run(frames, c);
    expect(states[0].safety).toEqual(SAFETY_NOTE);
    expect(states.slice(1).every((s) => s.safety === null)).toBe(true);
    c.reset();
    expect(c.push(frames[0]).safety).toEqual(SAFETY_NOTE);
  });

  it('a missed frame or a noisy one never moves the instruction', () => {
    // one frame in ten without a body (the synth's default is one in a hundred); this seed opens on a miss
    const frames = shoot(hold(3), PLAY, { missRate: 0.1, seed: 3 });
    expect(frames.filter((f) => !f.present).length).toBeGreaterThan(5);
    const states = run(frames);
    // the first frame speaks at once; after that no single miss settles
    expect(states.filter((s) => s.t > SETTLE_MS + 50).some((s) => s.issue !== null)).toBe(false);
    expect(said(states)).toEqual(['coach.space.intro', 'coach.space.arms']);
  });

  it('the holds count only frames that pass: a body the model finds one frame in four never holds the framing', () => {
    const frames = shoot(hold(4), PLAY, quiet);
    for (const every of [8, 4, 2]) {
      const flicker = frames.map((f, i) => (i % every === 0 ? f : { t: f.t, present: false, image: [] }));
      const states = run(flicker);
      // every gap is shorter than SETTLE_MS, so no "step into the picture" settles; the hold must still not run
      expect(states.every((s) => s.stage === 'frame'), `1 in ${every}`).toBe(true);
      expect(Math.max(...states.map((s) => s.hold)), `1 in ${every}`).toBe(0);
    }
    // …while one missed frame costs a frame's time, not the hold
    const oneMiss = frames.map((f, i) => (i === 10 ? { t: f.t, present: false, image: [] } : f));
    const armsAt = run(oneMiss).find((s) => s.stage === 'arms')!.t;
    expect(armsAt).toBeLessThan(run(frames).find((s) => s.stage === 'arms')!.t + 100);
  });

  it('the reach clock pauses while the body is gone: arms up in 1 frame of 4 is no verdict', () => {
    const c = new SpaceCheck();
    const stand = shoot(hold(1.5), PLAY, quiet);
    const standStates = run(stand, c);
    expect(standStates[standStates.length - 1].stage).toBe('arms');
    const t0 = stand[stand.length - 1].t + 33;
    const up = shoot(hold(2, armsUp()), PLAY, quiet)
      .map((f, i) => (i % 4 === 0 ? { ...f, t: f.t + t0 } : { t: f.t + t0, present: false, image: [] }));
    const states = run(up, c);
    expect(states.every((s) => s.stage === 'arms' && s.headroom === null)).toBe(true);
  });

  it('a missed frame after a failed reach does not take back "raise the camera" or "step back"', () => {
    const cases: [Partial<CameraSpec>, SpaceInstructionId][] = [
      [{ distance: 3.6, heightM: 0.5 }, 'space.raise'], [{ distance: 3.4, heightM: 0.8 }, 'coach.space.back'],
    ];
    for (const [cam, id] of cases) {
      const frames = shoot(session({ end: 5 }), cam, quiet);
      const c = new SpaceCheck();
      const states = frames.map((f, i) => c.push(i === 110 || i === 130 ? { t: f.t, present: false, image: [] } : f));
      expect(said(states), `${cam.heightM} m lens`).toEqual(['coach.space.intro', 'coach.space.arms', id]);
    }
  });

  it('an unusable aspect (the video size unknown: 0 / 0) falls back to 4:3 instead of failing every reach', () => {
    const frames = shoot(session());
    for (const aspect of [NaN, 0, -1, Infinity]) {
      const states = run(frames, new SpaceCheck({ aspect }));
      const last = states[states.length - 1];
      expect(last.ready, `aspect ${aspect}`).toBe(true);
      expect(Number.isFinite(last.headroom!.reachTop)).toBe(true);
      // and the no-world side ruler (fill ÷ 1.6 m ÷ aspect) does not read every stand as 'narrow'
      expect(checkSpace({ ...first(frames), world: undefined }, { aspect }).issues).toEqual([]);
    }
  });

  it('a frame marked present without all 33 points is no body (the median cannot mix it in)', () => {
    const frames = shoot(hold(1), PLAY, quiet);
    const c = new SpaceCheck();
    run(frames.slice(0, 5), c);
    expect(c.push({ ...frames[5], image: frames[5].image.slice(0, 20) }).check.worst).toBe('noBody');
    // world landmarks of the wrong length are dropped, the image is kept
    expect(c.push({ ...frames[6], world: frames[6].world!.slice(0, 10) }).check.worst).toBeNull();
  });

  it('feet in the picture but unsure are not told to tilt the camera', () => {
    const f = first(shoot(hold(0.3), PLAY, quiet));
    const unsure = { ...f, image: f.image.map((l, i) => ([LEFT_ANKLE, RIGHT_ANKLE].includes(i) ? { ...l, v: 0.4 } : l)) };
    const c = checkSpace(unsure);
    expect(c.worst).toBe('feet');
    expect(c.reading.feetInFrame).toBe(true);
    const s = run(Array.from({ length: 12 }, (_, k) => ({ ...unsure, t: k * 33 })));
    const last = s[s.length - 1].instruction;
    expect(last.id).toBe('coach.space.feet');
    expect(last.text).not.toMatch(/tilt/);
    // cut feet still get the camera advice
    const cut = run(shoot(hold(0.5), { distance: 3.6, heightM: 1.9 }, quiet));
    expect(cut[cut.length - 1].instruction.text).toMatch(/tilt the camera down/);
  });

  it('the body walking out after ready goes back to the start, and drops the calibration', () => {
    const frames = shoot(session());
    const c = new SpaceCheck();
    run(frames, c);
    expect(c.calibration).not.toBeNull();
    const t0 = frames[frames.length - 1].t;
    let s: SpaceState | null = null;
    for (let k = 1; k <= 15; k++) s = c.push({ t: t0 + k * 33, present: false, image: [] });
    expect(s!.stage).toBe('frame');
    expect(s!.instruction.id).toBe('coach.space.intro');
    expect(s!.calibration).toBeNull();
    // back in the same spot: the headroom already measured for this view still holds, so no second reach
    const back = shoot(hold(3)).map((f) => ({ ...f, t: f.t + t0 + 1000, arrive: (f.arrive ?? f.t) + t0 + 1000 }));
    const after = back.map((f) => c.push(f));
    expect(said(after)).not.toContain('coach.space.arms');
    expect(after[after.length - 1].ready).toBe(true);
  });

  it('told to step back, the player steps back and passes', () => {
    // a lens at 0.8 m fails the reach at 3.4 m; the player walks back to 4.2 m (over a second: a body that is suddenly
    // 0.8 m further away between two frames is someone else, the one-body rule) and the same lens now clears it
    const lens = { distance: 3.4, heightM: 0.8 };
    const near = shoot(session({ end: 4 }), lens);
    const walk: JointClip = { fps: 30, frames: Array.from({ length: 31 }, (_, i) => moveJoints(restPose(), [0, 0, -0.8 * (i / 30)])) };
    const back = session({ end: 6 });
    const there: JointClip = { ...back, frames: back.frames.map((j) => moveJoints(j, [0, 0, -0.8])) };
    const later = (frames: PoseFrame[], t0: number) => frames.map((f) => ({ ...f, t: f.t + t0, arrive: (f.arrive ?? f.t) + t0 }));
    const walked = later(shoot(walk, lens), near[near.length - 1].t + 33);
    const far = later(shoot(there, lens), walked[walked.length - 1].t + 33);
    const states = run([...near, ...walked, ...far]);
    const ids = said(states);
    expect(ids).toEqual(['coach.space.intro', 'coach.space.arms', 'coach.space.back', 'coach.space.arms', 'coach.space.still', 'coach.space.ready']);
    expect(states[states.length - 1].headroom!.ok).toBe(true);
  });

  it('poor light with a good read: the advice once, then on to the stand', () => {
    const c = new SpaceCheck();
    c.light({ frame: histogram([[30, 0.7], [70, 0.3]]) });
    const states = run(shoot(session({ end: 8 })), c);
    const ids = said(states);
    expect(ids).toEqual(['coach.space.intro', 'coach.space.arms', 'space.light', 'coach.space.still', 'coach.space.ready']);
    expect(states[states.length - 1].notes.map((n) => n.id)).toEqual(['space.light']);
    expect(states.find((s) => s.instruction.id === 'space.light')!.instruction.voiced).toBe(false);
  });

  it('a feed with no world landmarks cannot be calibrated, and says so rather than "stand still" forever', () => {
    const states = run(shoot(session({ end: 6 })).map((f) => ({ ...f, world: undefined })));
    const last = states[states.length - 1];
    expect(last.stage).toBe('still');
    expect(last.instruction.id).toBe('space.depth');
    expect(last.calibration).toBeNull();
  });

  it('every voiced id is one of the Coach\'s pre-rendered space lines', () => {
    const coach = new Set(COACH_MOMENTS.map((m) => m.id));
    for (const id of SPACE_COACH_IDS) expect(coach.has(id)).toBe(true);
    // and every Coach space line has a place in the check
    for (const m of COACH_MOMENTS.filter((x) => x.id.startsWith('coach.space.'))) expect(SPACE_COACH_IDS).toContain(m.id);
  });
});

// ── the owner's takes ────────────────────────────────────────────────────────────────────────────────────────────

describe('the fixtures', () => {
  const names = [
    'stand_still', 'jump_two_foot_low', 'jump_two_foot_high', 'jump_one_foot_runup', 'run_in_place', 'dunk_elijah_two_foot',
    'dunk_elijah_one_foot', 'dunk_approach_two_foot', 'jumpshot', 'jumpshot_dribble', 'punch_kick', 'shuffle_lateral',
  ];

  it.each(names)('%s: the camera runs fast enough to read a jump', (name) => {
    const states = run(fixture(name).frames);
    const rated = states.filter((s) => s.poseHz !== null);
    expect(rated.length).toBeGreaterThan(states.length / 2);
    for (const s of rated) {
      expect(s.poseHz!).toBeGreaterThan(MIN_POSE_HZ);
      expect(s.jumpHeight).toBe('read');
    }
  });

  it('the reshoot matches the synth: a body shot at 3 m and moved to 3.6 m lands where a 3.6 m camera puts it', () => {
    const at3 = synthesize(hold(0.2), { ...quiet, camera: { distance: 3, heightM: 1.1 } });
    const fx = { settings: { synth: at3.settings }, frames: at3.frames } as unknown as PoseFixture;
    const moved = reshoot(fx, PLAY)[0];
    const direct = first(shoot(hold(0.2), PLAY, quiet));
    for (const i of [NOSE, LEFT_SHOULDER, LEFT_HIP, RIGHT_ANKLE, LEFT_WRIST]) {
      expect(Math.abs(moved.image[i].x - direct.image[i].x)).toBeLessThan(1e-6);
      expect(Math.abs(moved.image[i].y - direct.image[i].y)).toBeLessThan(1e-6);
    }
  });

  it("the owner's stand at the fixtures' own 3 m camera: every rule passes but the distance (0.585 fill, over the band)", () => {
    const fx = fixture('stand_still');
    const states = run(fx.frames);
    const raised = new Set(states.flatMap((s) => s.check.issues));
    raised.delete('tooClose');
    expect([...raised]).toEqual([]);
    const fills = states.filter((s) => s.check.reading.fill > 0).map((s) => s.check.reading.fill).sort((a, b) => a - b);
    const median = fills[fills.length >> 1];
    expect(median).toBeGreaterThan(PLAY_FILL_MAX);
    expect(Math.abs(median - 0.585)).toBeLessThan(0.01);
  });

  it("the owner's stand shot from 3.6 m passes every rule on every frame", () => {
    const frames = reshoot(fixture('stand_still'), PLAY);
    for (const f of frames.filter((x) => x.present)) expect(checkSpace(f).issues).toEqual([]);
    const states = run(frames);
    expect(states[states.length - 1].stage).toBe('arms');           // framed: now the reach
    expect(states[states.length - 1].instruction.id).toBe('coach.space.arms');
  });

  it("the owner's jumps and side-steps, shot from 3.6 m, stay inside a frame that passes", () => {
    // (the rules are for the stand before play: a jog's crouch drops the fill and a fighting stance is bladed, so
    // those takes are not held to them)
    for (const name of ['jump_two_foot_low', 'shuffle_lateral']) {
      const frames = reshoot(fixture(name), PLAY).filter((f) => f.present);
      for (const f of frames) expect(checkSpace(medianFrame([f])).issues, name).toEqual([]);
    }
  });

  it("a reach, then the owner's own stand calibrates: ready, with the owner's rulers", () => {
    // the check's reach (the synth body), then the owner's recorded stand from the same spot
    const reach = shoot(session({ end: 3.2 }));
    const t0 = reach[reach.length - 1].t + 33;
    const stand = reshoot(fixture('stand_still'), PLAY).map((f) => ({ ...f, t: f.t + t0, arrive: (f.arrive ?? f.t) + t0 }));
    const states = run([...reach, ...stand]);
    const last = states[states.length - 1];
    expect(said(states)).toEqual(['coach.space.intro', 'coach.space.arms', 'coach.space.still', 'coach.space.ready']);
    expect(last.ready).toBe(true);
    expect(last.calibration!.t).toBeGreaterThan(t0 + 600);        // taken on the owner's frames, not the synth's
    expect(last.calibration!.hipHeightM).toBeGreaterThan(0.7);
    expect(last.calibration!.hipHeightM).toBeLessThan(1.1);
  });
});

// ── movement play P4: one body at a time, re-centre, a new body, the counted holds, the corner line, the overlay ──

/** Frames moved onto a later stretch of the same clocks (a stream carrying on from another). */
const after = (frames: PoseFrame[], t0: number): PoseFrame[] =>
  frames.map((f) => ({ ...f, t: f.t + t0, arrive: (f.arrive ?? f.t) + t0 }));
const R0 = restPose();

describe('one body at a time', () => {
  it('a second body taking the picture after ready: back to the start at once, the rulers dropped, "one player at a time"', () => {
    const frames = shoot(session());
    const c = new SpaceCheck();
    expect(run(frames, c).at(-1)!.ready).toBe(true);
    const t0 = frames.at(-1)!.t + 33;
    // someone else, half a metre to the side, where the tracker jumps to them between two frames
    const other = after(shoot(hold(6, moveJoints(R0, [0.5, 0, 0])), PLAY, { seed: 5 }), t0);
    const states = run(other, c);
    const s0 = states.find((s) => s.check.worst !== 'noBody')!;
    expect(s0.issue).toBe('swap');
    expect(s0.stage).toBe('frame');
    expect(s0.calibration).toBeNull();
    expect(s0.instruction.id).toBe('space.one');
    expect(s0.instruction.voiced).toBe(false);
    expect(s0.oneLine).toBe('One player at a time');
    // it holds SWAP_HOLD_MS, then the new body goes through the whole check: the reach again (the headroom was the
    // other body's), and a stand of its own
    expect(states.filter((s) => s.t - s0.t < SWAP_HOLD_MS - 50 && s.t >= s0.t).every((s) => s.issue === 'swap')).toBe(true);
    const ids = said(states);
    expect(ids.slice(ids.indexOf('space.one'))).toEqual(['space.one', 'coach.space.still', 'coach.space.arms']);
    expect(states.at(-1)!.ready).toBe(false);
  });

  it('a swap that switches back still waits SWAP_HOLD_MS after the last jump', () => {
    const A = shoot(hold(4), PLAY, quiet), B = shoot(hold(4, moveJoints(R0, [0.6, 0, 0])), PLAY, quiet);
    // B from frame 45 (1.5 s), A again from frame 54 (0.3 s later)
    const mixed = swapStream(swapStream(A, B, { from: 45 }), A, { from: 54 });
    const states = run(mixed);
    const back = mixed[54].t;
    const during = states.filter((s) => s.t >= mixed[45].t && s.t < back + SWAP_HOLD_MS);
    expect(during.every((s) => s.issue === 'swap')).toBe(true);
    const later = states.filter((s) => s.t >= back + SWAP_HOLD_MS + SETTLE_MS + 40);
    expect(later.length).toBeGreaterThan(5);
    expect(later.every((s) => s.issue === null)).toBe(true);
  });

  it('two bodies taking turns every 5 frames never get past "one player at a time"', () => {
    const A = shoot(session({ end: 8 }), PLAY, quiet), B = shoot(session({ end: 8, body: moveJoints(R0, [0.6, 0, 0]) }), PLAY, quiet);
    const states = run(swapStream(A, B, { from: 10, every: 5 }));
    expect(states.some((s) => s.ready)).toBe(false);
    expect(states.filter((s) => s.t > A[12].t).every((s) => s.issue === 'swap')).toBe(true);
  });

  // the review: someone else taking over once the check is ready, at the rates and in the ways the first rule missed
  // (its jump distance doubled across a 15 Hz frame or a missed one, it was off under 14.3 Hz, and a switch in depth
  // moves no hip). A missed detection at 24 Hz stretches the gap to 83 ms, where a real take-off can move 0.54 m: 0.6 m
  // is caught there, 0.5 m only by chance.
  const TAKEOVER: [string, number, V3, boolean][] = [
    ['15 Hz, 0.5 m to the side', 15, [0.5, 0, 0], false],
    ['20 Hz, 0.5 m to the side', 20, [0.5, 0, 0], false],
    ['12 Hz, 0.8 m to the side: the rule stays on under 14.3 Hz', 12, [0.8, 0, 0], false],
    ['30 Hz, a missed detection at the switch, 0.5 m to the side', 30, [0.5, 0, 0], true],
    ['24 Hz, a missed detection at the switch, 0.6 m to the side', 24, [0.6, 0, 0], true],
    ['30 Hz, 0.5 m straight behind', 30, [0, 0, -0.5], false],
    ['15 Hz, 0.5 m straight behind', 15, [0, 0, -0.5], false],
    ['30 Hz, a missed detection at the switch, 0.5 m straight behind', 30, [0, 0, -0.5], true],
    ['30 Hz, 0.5 m straight in front', 30, [0, 0, 0.5], false],
  ];
  it.each(TAKEOVER)('someone else takes over once ready (%s): at once, "one player at a time", the rulers dropped', (_label, fps, off, miss) => {
    for (const seed of [17, 23, 41]) {
      const c = new SpaceCheck();
      const a = synthesize(session({ end: 9 }), { camera: PLAY, seed, fps }).frames;
      expect(run(a, c).at(-1)!.ready, `ready, seed ${seed}`).toBe(true);
      const t0 = a.at(-1)!.t + 1000 / fps;
      const gap: PoseFrame[] = miss ? [{ t: t0, present: false, image: [] }] : [];
      const b = after(synthesize(hold(2, moveJoints(R0, off), fps), { camera: PLAY, seed: seed + 100, fps, dropRate: 0, missRate: 0 }).frames, t0 + gap.length * (1000 / fps));
      const s0 = run([...gap, ...b], c).find((s) => s.check.worst !== 'noBody')!;
      expect(s0.issue, `seed ${seed}`).toBe('swap');
      expect(s0.ready).toBe(false);
      expect(s0.calibration).toBeNull();
    }
  });

  it('never fires on a real body: the owner\'s 12 takes (as shot, at 15 Hz, from 3.6 m and 4.5 m) and a scripted high jump', () => {
    const names = (JSON.parse(readFileSync(join(FIX, 'index.json'), 'utf8')) as { name: string }[]).map((e) => e.name);
    expect(names).toHaveLength(12);
    for (const n of names) {
      const fx = fixture(n);
      for (const [how, frames] of [
        ['as shot', fx.frames], ['15 Hz', fx.frames.filter((_, i) => i % 2 === 0)], ['3.6 m', reshoot(fx, PLAY)],
        ['4.5 m', reshoot(fx, { distance: 4.5, heightM: 1.2 })],
      ] as const) {
        expect(run(frames as PoseFrame[]).filter((s) => s.issue === 'swap').length, `${n} ${how}`).toBe(0);
      }
    }
    const jump = synthesize(script([beat(R0, 1), [1.6, (t: number) => moveJoints(R0, [0, Math.max(0, 3.2 * t - 4.9 * t * t), 0])], beat(R0, 1)]), { camera: PLAY, seed: 7 });
    expect(run(jump.frames).some((s) => s.issue === 'swap')).toBe(false);
  });

  it('swap comes right after noBody in the order: nothing else is worth saying about the wrong person', () => {
    expect(SPACE_ORDER.slice(0, 2)).toEqual(['noBody', 'swap']);
    expect(SWAP_M).toBeGreaterThan(0.165 * 2);   // the owner's fastest real hip step in a frame, with a 2× margin
    // …and across a longer gap the margin is on real motion, not on SWAP_M: 15 Hz still catches two people 0.5 m apart
    expect(Math.max(SWAP_M, (SWAP_MARGIN * SWAP_STEP_M * (1000 / 15)) / SWAP_FRAME_MS)).toBeLessThan(0.5);
    expect(SWAP_GAP_FRAMES).toBeGreaterThan(2);     // one missed detection at the switch is still compared
  });
});

describe('the pose rate after a stretch the check did not see', () => {
  it('is unknown, never slow, until the window spans again; again() starts it over', () => {
    const c = new SpaceCheck();
    const a = shoot(session());
    expect(run(a, c).at(-1)!.poseHz!).toBeGreaterThan(MIN_POSE_HZ);
    // 60 s of play and the end card, then READY again: the first frames cannot tell the rate yet, and never say "slow"
    const b = after(shoot(hold(2), PLAY, { seed: 19 }), a.at(-1)!.t + 60_000);
    const states = run(b, c);
    expect(states[0].poseHz).toBeNull();
    expect(states[0].jumpHeight).toBeNull();
    expect(states.some((s) => s.notes.some((n) => n.id === 'space.rate'))).toBe(false);
    const known = states.filter((s) => s.poseHz !== null);
    expect(known.length).toBeGreaterThan(20);
    expect(known.every((s) => s.poseHz! > MIN_POSE_HZ && s.jumpHeight === 'read')).toBe(true);
    // "Check my space again" mid-stream: the rate is counted afresh too
    c.again();
    const next = after(shoot(hold(0.2), PLAY, { seed: 20 }), b.at(-1)!.t + 33);
    expect(c.push(next[0]).poseHz).toBeNull();
  });
});

describe('re-centre and a new body', () => {
  it('again(): the same body at the same spot skips the reach, takes a new stand, and the safety note is not said twice', () => {
    const frames = shoot(session());
    const c = new SpaceCheck();
    const first = run(frames, c).at(-1)!;
    expect(first.ready).toBe(true);
    c.again();
    expect(c.calibration).toBeNull();
    const t0 = frames.at(-1)!.t + 33;
    const states = run(after(shoot(hold(3), PLAY, { seed: 9 }), t0), c);
    expect(states[0].stage).toBe('frame');
    expect(states[0].safety).toBeNull();
    expect(said(states)).not.toContain('coach.space.arms');
    const last = states.at(-1)!;
    expect(last.ready).toBe(true);
    expect(last.calibration!.t).toBeGreaterThan(t0);          // the new stand's rulers, not the old ones
  });

  it('again() at a new spot (nearer the lens) asks for the reach again', () => {
    const frames = shoot(session());
    const c = new SpaceCheck();
    run(frames, c);
    c.again();
    const states = run(after(shoot(hold(3), { distance: 3.3, heightM: 1.2 }, quiet), frames.at(-1)!.t + 33), c);
    expect(said(states)).toContain('coach.space.arms');
    expect(states.at(-1)!.ready).toBe(false);
  });

  it('handOver(): a new body — the safety note again, the reach again, a stand of its own', () => {
    const frames = shoot(session());
    const c = new SpaceCheck();
    run(frames, c);
    c.handOver();
    expect(c.calibration).toBeNull();
    const t0 = frames.at(-1)!.t + 33;
    const states = run(after(shoot(hold(3), PLAY, { seed: 9 }), t0), c);
    expect(states[0].safety).toEqual(SAFETY_NOTE);
    expect(states.at(-1)!.stage).toBe('arms');
    const done = run(after(shoot(session(), PLAY, { seed: 13 }), t0 + 3100), c).at(-1)!;
    expect(done.ready).toBe(true);
  });
});

describe('moving during the stand never calibrates', () => {
  // the tail starts as the arms come down (they are lowered 2.6–3.0 s): the player never stands still after the reach
  const standAfterReach = (tail: JointClip, seed = 21) => {
    const reach = shoot(session({ end: 2.9 }));
    return [...reach, ...after(synthesize(tail, { camera: PLAY, seed }).frames, reach.at(-1)!.t + 33)];
  };
  it.each([
    ['a jog in place', script([jogBeat(R0, 4, 3, 0.15)], 30)],
    ['a 5 cm sway', script([[4, (t: number) => moveJoints(R0, [0.05 * Math.sin(2 * Math.PI * t), 0, 0])]], 30)],
  ])('%s: never ready, and says "stand still"', (_label, tail) => {
    const states = run(standAfterReach(tail));
    expect(states.some((s) => s.ready)).toBe(false);
    const last = states.at(-1)!;
    expect(last.stage).toBe('still');
    expect(last.instruction.id).toBe('coach.space.still');
    expect(last.calibration).toBeNull();
  });
});

describe('the holds count frames (FramingGate, counted)', () => {
  it('the framing holds FRAME_HOLD_MS of clean frames before the reach is asked for, and the reach ARMS_HOLD_MS', () => {
    const frames = shoot(session(), PLAY, quiet);
    const states = run(frames);
    const armsAt = states.find((s) => s.stage === 'arms')!.t - frames[0].t;
    expect(armsAt).toBeGreaterThanOrEqual(FRAME_HOLD_MS);
    expect(armsAt).toBeLessThan(FRAME_HOLD_MS + 34);
    const upFrom = states.find((s) => s.stage === 'arms' && s.check.reading.armsUp)!.t;
    const passed = states.find((s) => s.stage !== 'arms' && s.t > upFrom)!.t;
    expect(passed - upFrom).toBeGreaterThanOrEqual(ARMS_HOLD_MS);
    expect(passed - upFrom).toBeLessThan(ARMS_HOLD_MS + 34);
    // the ring runs 0 → 1 through each hold
    const ring = states.filter((s) => s.stage === 'frame').map((s) => s.hold);
    expect(Math.max(...ring)).toBeGreaterThan(0.9);
    expect(ring.every((h, i) => i === 0 || h >= ring[i - 1] - 1e-9 || h === 0)).toBe(true);
  });
});

describe('what the player reads', () => {
  it('the corner line is the instruction in a few words', () => {
    const states = run(shoot(session()));
    for (const s of states) {
      expect(s.oneLine).toBe(s.instruction.short);
      expect(s.oneLine.length).toBeLessThanOrEqual(32);
    }
    expect(new Set(states.map((s) => s.oneLine))).toEqual(new Set([
      'Whole body in the picture', 'Arms overhead', 'Arms down, stand still', 'Stand still', 'All set: raise both hands',
    ]));
  });

  it('the safety note is plain and short, and names the ceiling and the floor', () => {
    expect(SAFETY_NOTE.text.length).toBeLessThan(150);
    expect(SAFETY_NOTE.text).toMatch(/overhead/);
    expect(SAFETY_NOTE.text).toMatch(/2 m of clear floor/);
    expect(SAFETY_NOTE.text).toMatch(/can't see the ceiling/);
  });

  it('a slow camera says what it costs, in plain words', () => {
    const states = run(shoot(session({ end: 8 }), PLAY, { fps: 15 }));
    const rate = states.find((s) => s.instruction.id === 'space.rate')!;
    expect(rate.instruction.text).toMatch(/^Your camera is slow \(1[45] frames a second\)\. You can play, but jump height won't be measured\.$/);
    expect(states.at(-1)!.notes.find((n) => n.id === 'space.rate')!.text).toMatch(/jump height won't be measured/);
  });
});

describe('the self-view overlay', () => {
  it('the floor line follows the feet until the stand is taken, then it is the calibration\'s', () => {
    const frames = shoot(session());
    const c = new SpaceCheck();
    let s: SpaceState | null = null, f: PoseFrame | null = null;
    for (const x of frames) { s = c.push(x); f = x; if (s.stage === 'frame' && x.present) break; }
    const live = spaceOverlay(s!, f!.image);
    expect(live.floorY).toBeGreaterThan(Math.max(f!.image[LEFT_ANKLE].y, f!.image[RIGHT_ANKLE].y) - 1e-9);
    expect(live.floorY).toBeLessThan(1);
    expect(live.headroomY).toBeNull();
    const states = frames.map((x) => ({ s: c.push({ ...x, t: x.t }), x }));
    const arms = states.find((e) => e.s.stage === 'arms')!;
    expect(spaceOverlay(arms.s, arms.x.image).headroomY).toBe(arms.s.check.reading.headroomNeed);
    const ready = run(shoot(session())).at(-1)!;
    expect(spaceOverlay(ready, null).floorY).toBe(ready.calibration!.floorY.line);
    expect(spaceOverlay(ready, null).box).toBeNull();
  });

  it('is in image units, not mirrored: a body on the image\'s right has its box there (the self-view flips both)', () => {
    const f = first(shoot(hold(0.3, moveJoints(R0, [0.9, 0, 0])), PLAY, quiet));
    const s = new SpaceCheck().push(f);
    const box = spaceOverlay(s, f.image).box!;
    expect((box.x0 + box.x1) / 2).toBeGreaterThan(0.6);
    const hipX = (f.image[LEFT_HIP].x + f.image[RIGHT_HIP].x) / 2;
    expect(box.x0).toBeLessThan(hipX);
    expect(box.x1).toBeGreaterThan(hipX);
    expect(box.y0).toBeLessThan(f.image[NOSE].y);
  });
});
