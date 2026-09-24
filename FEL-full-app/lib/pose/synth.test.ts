import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  LANDMARK_NAMES, LANDMARK_COUNT, LM, MIRROR_INDEX, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP,
  LEFT_WRIST, RIGHT_FOOT_INDEX, NOSE,
} from './landmarks';
import {
  restPose, moveJoints, synthesize, makeCamera, renderFrame, toRoom, type Joints, type JointClip, type V3, type PoseFixture,
} from './synth';

const quiet = { noise: false as const, dropRate: 0, missRate: 0, frameJitterMs: 0, latencyJitterMs: 0 };
const still = (sec: number, fps = 30, j: Joints = restPose()): JointClip => ({ fps, frames: Array.from({ length: Math.round(sec * fps) + 1 }, () => j) });
const mapAll = (j: Joints, fn: (p: V3) => V3) => Object.fromEntries(Object.entries(j).map(([k, p]) => [k, fn(p)])) as Joints;

/** Stand, a ballistic jump of height h (the whole body rises), stand. */
function jumpClip(h: number, fps = 120, standSec = 0.5) {
  const g = 9.81, v0 = Math.sqrt(2 * g * h), T = (2 * v0) / g;
  const frames: Joints[] = [];
  const total = standSec * 2 + T;
  for (let i = 0; i <= Math.round(total * fps); i++) {
    const t = i / fps - standSec;
    const y = t > 0 && t < T ? v0 * t - 0.5 * g * t * t : 0;
    frames.push(moveJoints(restPose(), [0, y, 0]));
  }
  return { clip: { fps, frames } as JointClip, T, takeoffSec: standSec };
}

/** The rest body at 120 fps with the right wrist eased (cosine) between [time s, height m] keys, the elbow midway. */
function armClip(keys: [number, number][], fps = 120): JointClip {
  const frames: Joints[] = [];
  const end = keys[keys.length - 1][0];
  for (let i = 0; i <= Math.round(end * fps); i++) {
    const t = i / fps;
    let y = keys[0][1];
    for (let k = 1; k < keys.length; k++) {
      const [t0, y0] = keys[k - 1], [t1, y1] = keys[k];
      if (t >= t0 && t <= t1) { y = y0 + ((y1 - y0) * (1 - Math.cos((Math.PI * (t - t0)) / (t1 - t0)))) / 2; break; }
    }
    frames.push({ ...restPose(), RightHand: [-0.22, y, 0.05], RightForeArm: [-0.21, (1.45 + y) / 2, 0.02] });
  }
  return { fps, frames };
}

describe('landmarks', () => {
  it('is MediaPipe BlazePose order: 33 points, nose 0 … right_foot_index 32', () => {
    expect(LANDMARK_NAMES).toHaveLength(LANDMARK_COUNT);
    expect(LM.nose).toBe(NOSE);
    expect(LM.left_shoulder).toBe(11);
    expect(LM.right_hip).toBe(RIGHT_HIP);
    expect(LM.left_wrist).toBe(LEFT_WRIST);
    expect(LM.right_foot_index).toBe(RIGHT_FOOT_INDEX);
  });
  it('mirror table swaps sides and is its own inverse', () => {
    expect(MIRROR_INDEX[LEFT_SHOULDER]).toBe(RIGHT_SHOULDER);
    expect(MIRROR_INDEX[LM.mouth_left]).toBe(LM.mouth_right);
    expect(MIRROR_INDEX[NOSE]).toBe(NOSE);
    MIRROR_INDEX.forEach((m, i) => expect(MIRROR_INDEX[m]).toBe(i));
  });
});

describe('virtual webcam', () => {
  it('is not mirrored: facing the camera, the left shoulder and hip are on the image RIGHT', () => {
    const { image } = renderFrame(makeCamera(), restPose());
    expect(image[LEFT_SHOULDER].x).toBeGreaterThan(image[RIGHT_SHOULDER].x);
    expect(image[LEFT_HIP].x).toBeGreaterThan(image[RIGHT_HIP].x);
    // standing 3 m out at 1.1 m: the body is centred, head high, feet low, all in frame
    expect(Math.abs(image[NOSE].x - 0.5)).toBeLessThan(0.01);
    expect(image[NOSE].y).toBeLessThan(0.35);
    expect(image[RIGHT_FOOT_INDEX].y).toBeGreaterThan(0.85);
    expect(image[RIGHT_FOOT_INDEX].y).toBeLessThan(1);
  });
  it('world landmarks are hip-centred metres, y down, z away from the camera', () => {
    const { world } = renderFrame(makeCamera(), restPose());
    const hipMid = (world[LEFT_HIP].y + world[RIGHT_HIP].y) / 2;
    expect(Math.abs(hipMid)).toBeLessThan(1e-9);
    expect(world[NOSE].y).toBeLessThan(-0.5);          // the head is UP = negative y
    expect(world[NOSE].z).toBeLessThan(0);             // the nose is nearer the lens than the hips
    expect(world[LEFT_SHOULDER].x).toBeGreaterThan(0); // the left side is image-right
  });
  it('refuses a mirrored source, and accepts a back turned to the camera', () => {
    // a mirror puts the LEFT labels on the body's right, but the toes still point at the lens
    const mirrored = mapAll(restPose(), (p) => [-p[0], p[1], p[2]]);
    expect(() => synthesize(still(0.2, 30, mirrored), quiet)).toThrow(/handedness/);
    const turned = mapAll(restPose(), (p) => [-p[0], p[1], -p[2]]);   // 180° about Y: facing away
    const out = synthesize(still(0.2, 30, turned), quiet);
    expect(out.frames[0].image[LEFT_SHOULDER].x).toBeLessThan(out.frames[0].image[RIGHT_SHOULDER].x);
  });
});

describe('the living room', () => {
  it('turns a sideways walk across a gym to face the camera, in place, on the floor', () => {
    // in centimetres, facing -X, knees a touch bent, drifting 1.5 m/s along -X and standing 20 cm up on a riser
    const bent = { ...restPose(), LeftLeg: [0.095, 0.52, 0.04] as V3, RightLeg: [-0.095, 0.52, 0.04] as V3 };
    const turned = mapAll(bent, (p) => [-p[2], p[1], p[0]]);                  // +Z → -X
    const fps = 30, frames: Joints[] = [];
    for (let i = 0; i < 90; i++) frames.push(mapAll(moveJoints(turned, [-1.5 * i / fps, 0.2, 0]), (p) => [p[0] * 100, p[1] * 100, p[2] * 100]));
    const { clip, info } = toRoom({ fps, frames }, { scale: 0.01, from: 15, to: 75 });
    expect(info.leftHanded).toBe(false);
    expect(Math.abs(Math.abs(info.yawDeg) - 90)).toBeLessThan(1);
    expect(clip.frames).toHaveLength(60);
    for (const j of clip.frames) {
      const hip = [(j.LeftUpLeg[0] + j.RightUpLeg[0]) / 2, (j.LeftUpLeg[2] + j.RightUpLeg[2]) / 2];
      expect(Math.hypot(hip[0], hip[1])).toBeLessThan(0.05);                  // the 1.5 m/s of travel is gone
    }
    const { image } = renderFrame(makeCamera(), clip.frames[30], clip.foot);
    expect(image[LEFT_SHOULDER].x).toBeGreaterThan(image[RIGHT_SHOULDER].x);  // facing the lens
    expect(synthesize(clip, quiet).gt.perFrame.footH.every(([l, r]) => Math.min(l, r) < 0.01)).toBe(true);   // riser gone
  });
  it("moves a narrow rig's arms out to a person's shoulder span (the ruler), and never narrows one", () => {
    const frames = Array.from({ length: 30 }, () => mapAll(restPose(), (p) => [p[0] * 100, p[1] * 100, p[2] * 100]));
    const span = (j: Joints) => Math.hypot(j.LeftArm[0] - j.RightArm[0], j.LeftArm[1] - j.RightArm[1], j.LeftArm[2] - j.RightArm[2]);
    const wide = toRoom({ fps: 30, frames }, { scale: 0.01, shoulderSpanM: 0.46 });   // the rest body's is 0.38 m
    const j = wide.clip.frames[10];
    expect(wide.info.shoulderOutM).toBeCloseTo(0.04, 6);
    expect(span(j)).toBeCloseTo(0.46, 6);
    expect(j.LeftHand[0] - j.LeftArm[0]).toBeCloseTo(0.22 - 0.19, 6);                  // the arm keeps its shape
    expect(toRoom({ fps: 30, frames }, { scale: 0.01, shoulderSpanM: 0.3 }).info.shoulderOutM).toBe(0);
  });
});

describe('a still stand', () => {
  it('gives a still stream with no events', () => {
    const { frames, gt } = synthesize(still(2), quiet);
    expect(frames).toHaveLength(61);
    for (const f of frames) expect(f.image).toEqual(frames[0].image);
    expect(frames.every((f) => f.present)).toBe(true);
    expect(gt.jumps).toHaveLength(0);
    expect(gt.wrist).toHaveLength(0);
    expect(gt.steps).toHaveLength(2);                              // each foot planted the whole time
    expect(gt.steps.every((s) => s.down === null && s.up === null)).toBe(true);
    expect(gt.perFrame.contact.every(([l, r]) => l === 1 && r === 1)).toBe(true);
  });
  it('with noise, jitters around the exact pose without drifting', () => {
    const exact = synthesize(still(4), quiet).frames[0].image;
    const { frames } = synthesize(still(4), { seed: 7 });
    const seen = frames.filter((f) => f.present);
    expect(seen.length).toBeGreaterThan(frames.length * 0.9);
    for (const i of [NOSE, LEFT_SHOULDER, LEFT_WRIST, RIGHT_FOOT_INDEX]) {
      const xs = seen.map((f) => f.image[i].x);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
      expect(Math.abs(mean - exact[i].x)).toBeLessThan(0.002);
      expect(sd).toBeGreaterThan(0.001);
      expect(sd).toBeLessThan(0.008);
    }
    // capture times rise at ~30 fps; the app gets each frame later than it was taken
    for (let k = 1; k < frames.length; k++) expect(frames[k].t).toBeGreaterThan(frames[k - 1].t);
    expect(frames.every((f) => (f.arrive ?? 0) > f.t)).toBe(true);
  });
});

describe('ground truth', () => {
  it('a known jump: flight time within a frame of √(8h/g), so g·t²/8 gives the height back', () => {
    for (const h of [0.25, 0.45]) {
      const { clip, T, takeoffSec } = jumpClip(h);
      const { frames, gt } = synthesize(clip, { ...quiet, fps: 30 });
      expect(gt.jumps).toHaveLength(1);
      const j = gt.jumps[0];
      const frameMs = 1000 / 30;
      expect(Math.abs(j.flightMs - T * 1000)).toBeLessThan(frameMs);
      // one frame of timing error is dh = g·t/4·dt; the source is 120 fps so it is far inside that
      expect(Math.abs(j.heightFlightM - h)).toBeLessThan((9.81 * T / 4) * (1 / 30));
      // the take-off instant is the foot 1 cm off its stance level, so the hip has already risen ~1 cm of the jump
      expect(Math.abs(j.hipRiseM - h)).toBeLessThan(0.015);
      expect(j.feet).toBe(2);
      expect(Math.abs(j.takeoff.t - takeoffSec * 1000)).toBeLessThan(frameMs);
      // frame indices: take-off = first frame with both feet off; landing = first with a foot back down
      expect(gt.perFrame.contact[j.takeoff.frame]).toEqual([0, 0]);
      expect(gt.perFrame.contact[j.takeoff.frame - 1]).not.toEqual([0, 0]);
      expect(gt.perFrame.contact[j.landing.frame]).not.toEqual([0, 0]);
      expect(frames[j.takeoff.frame].t).toBeGreaterThanOrEqual(j.takeoff.t);
      expect(j.apex.frame).toBeGreaterThan(j.takeoff.frame);
      expect(j.apex.frame).toBeLessThan(j.landing.frame);
      expect(Math.abs(j.apex.t - (takeoffSec + T / 2) * 1000)).toBeLessThan(10);
    }
  });
  it('running in place is steps and short flights, never a jump', () => {
    // 3 steps/s: each foot down 0.18 s of every 0.67 s, so both are off ~0.15 s between steps; the hips bounce 3 cm
    const fps = 120, cycle = 2 / 3, stance = 0.183, frames: Joints[] = [];
    for (let i = 0; i <= 3 * fps; i++) {
      const t = i / fps;
      const lift = (phase: number) => { const u = ((((t - phase) % cycle) + cycle) % cycle); return u < stance ? 0 : 0.25 * Math.sin((Math.PI * (u - stance)) / (cycle - stance)); };
      const j = moveJoints(restPose(), [0, 0.015 * (1 - Math.cos((2 * Math.PI * (t - stance)) / (cycle / 2))), 0]);
      const rest = restPose();
      for (const [s, h] of [['Left', lift(0)], ['Right', lift(cycle / 2)]] as const) {
        j[`${s}Foot`] = moveJoints(rest, [0, h, 0])[`${s}Foot`];
        j[`${s}Toe`] = moveJoints(rest, [0, h, 0])[`${s}Toe`];
        j[`${s}Leg`] = moveJoints(rest, [0, h / 2, 0])[`${s}Leg`];
      }
      frames.push(j);
    }
    const { gt } = synthesize({ fps, frames }, quiet);
    expect(gt.jumps).toHaveLength(0);
    expect(gt.flights.length).toBeGreaterThanOrEqual(7);
    for (const f of gt.flights) expect(f.flightMs).toBeLessThan(150);
    expect(gt.steps.filter((s) => s.down).length).toBeGreaterThanOrEqual(8);
  });
  it('a one-foot take-off: the free leg left well before the last foot', () => {
    const { clip } = jumpClip(0.35);
    // the left leg lifts 0.3 s before take-off and stays up
    const lift = Math.round(0.2 * clip.fps);
    clip.frames = clip.frames.map((j, i) => i < lift ? j : { ...j, LeftFoot: [j.LeftFoot[0], j.LeftFoot[1] + 0.2, j.LeftFoot[2]], LeftToe: [j.LeftToe[0], j.LeftToe[1] + 0.2, j.LeftToe[2]] });
    const { gt } = synthesize(clip, quiet);
    expect(gt.jumps).toHaveLength(1);
    expect(gt.jumps[0].feet).toBe(1);
    expect(gt.jumps[0].takeoffFoot).toBe('right');
  });
  it('a hand driven up past the head is a reach and swung back down a strike, each at the swing\'s own fastest', () => {
    // right wrist: 0.3–0.8 s eased up from the hip to 2.3 m, held, 1.1–1.6 s eased back down. Each swing is fastest at
    // its middle, 1.61 m high: BELOW the overhead line (Head 1.62 + 0.15), so the events sit there, not on the crossing
    const { gt } = synthesize(armClip([[0.3, 0.92], [0.8, 2.3], [1.1, 2.3], [1.6, 0.92], [2, 0.92]]), quiet);
    const ev = gt.wrist.filter((w) => w.hand === 'right' && w.kind !== 'punch');
    expect(ev.map((w) => w.kind)).toEqual(['reach', 'strike']);   // no push was made overhead: no release
    const [reach, strike] = ev, peak = (1.38 / 0.5) * (Math.PI / 2);
    expect(Math.abs(reach.at.t - 550)).toBeLessThan(17);
    expect(Math.abs(strike.at.t - 1350)).toBeLessThan(17);
    for (const w of ev) { expect(Math.abs(w.speed - peak) / peak).toBeLessThan(0.03); expect(w.heightM).toBeLessThan(1.7); }
  });
  it('a shot: the lift into the set point is a reach, the push from it the release', () => {
    // 0.2–0.6 s a fast lift to a set point at 1.95 m (4 m/s), held, 0.8–1.0 s a slower push to 2.25 m (2.4 m/s)
    const { gt } = synthesize(armClip([[0.2, 0.92], [0.6, 1.95], [0.8, 1.95], [1.0, 2.25], [1.4, 2.25]]), quiet);
    const ev = gt.wrist.filter((w) => w.hand === 'right' && w.kind !== 'punch');
    expect(ev.map((w) => w.kind)).toEqual(['reach', 'release']);
    expect(Math.abs(ev[0].at.t - 400)).toBeLessThan(17);
    expect(Math.abs(ev[1].at.t - 900)).toBeLessThan(17);
  });
  it('is deterministic for a seed', () => {
    const { clip } = jumpClip(0.3);
    const a = synthesize(clip, { seed: 42 }), b = synthesize(clip, { seed: 42 }), c = synthesize(clip, { seed: 43 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.frames)).not.toBe(JSON.stringify(c.frames));
    // the truth comes from the joints, not the dice: only which frame shows it can move
    expect(c.gt.jumps.map((j) => [j.takeoff.t, j.flightMs])).toEqual(a.gt.jumps.map((j) => [j.takeoff.t, j.flightMs]));
  });
});

// Every fixture scripts/body/synth-streams.mts wrote: well-formed, and its ground truth points inside its stream.
describe('fixtures', () => {
  const dir = join(__dirname, '__fixtures__');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json') : [];
  if (!files.length) it('none written yet', () => expect(files).toHaveLength(0));
  else it.each(files)('%s', (file) => {
    const fx = JSON.parse(readFileSync(join(dir, file), 'utf8')) as PoseFixture;
    const n = fx.frames.length;
    expect(n).toBeGreaterThan(30);
    for (let k = 0; k < n; k++) {
      const f = fx.frames[k];
      if (k) expect(f.t).toBeGreaterThan(fx.frames[k - 1].t);
      if (f.present) { expect(f.image).toHaveLength(33); expect(f.world).toHaveLength(33); } else expect(f.image).toHaveLength(0);
    }
    expect(fx.gt.perFrame.footH).toHaveLength(n);
    expect(fx.gt.perFrame.contact).toHaveLength(n);
    for (const j of fx.gt.jumps) {
      expect(j.takeoff.frame).toBeLessThanOrEqual(j.apex.frame);
      expect(j.apex.frame).toBeLessThanOrEqual(j.landing.frame);
      expect(j.landing.frame).toBeLessThan(n);
      expect(j.flightMs).toBeGreaterThanOrEqual(fx.settings.synth.gt.minJumpMs);
      // the take-off frame is the first with both feet off
      expect(fx.gt.perFrame.contact[j.takeoff.frame]).toEqual([0, 0]);
    }
    // gravity fitted to each jump's hips: a source played at the wrong frame rate falls at 4 g (or g/4)
    for (const g of fx.summary.gFit) { expect(g).toBeGreaterThan(6); expect(g).toBeLessThan(14); }
    for (const w of fx.gt.wrist) expect(w.at.frame).toBeLessThan(n);
  });
});
