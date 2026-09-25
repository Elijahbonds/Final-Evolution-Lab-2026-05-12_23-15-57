import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  calibrate, StillnessGate, CAL_WINDOW_MS, CAL_GAP_MS, STAND_KNEE_DEG, footDropW, type CalibrationResult,
} from './calibrate';
import { crouch } from './streamKit';
import { restPose, synthesize, makeCamera, bodyPoints, type Joints, type JointClip, type PoseFixture, type V3 } from './synth';
import { LEFT_KNEE, type PoseFrame } from './landmarks';

const load = (name: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8')) as PoseFixture;
const still = (sec: number, j: Joints = restPose(), fps = 30): JointClip => ({ fps, frames: Array.from({ length: Math.round(sec * fps) + 1 }, () => j) });
const turn = (j: Joints, deg: number): Joints => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return Object.fromEntries(Object.entries(j).map(([k, p]) => [k, [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c] as V3])) as Joints;
};
/** Run the gate over a stream; the first calibration it takes, and every refusal reason it gave. */
function gateOver(frames: PoseFrame[]) {
  const g = new StillnessGate();
  let first: CalibrationResult | null = null;
  const why = new Set<string>();
  for (const f of frames) {
    const r = g.push(f);
    if (r.ok) first ??= r; else why.add(r.why);
  }
  return { cal: first?.ok ? first.cal : null, why };
}

// The virtual webcam's own truth (lib/pose/synth.ts DEFAULT_CAMERA): 640×480, 60° wide, 3 m out, level at 1.1 m. A body
// standing at the origin is 3 m deep, so a metre spans fx/W/3 image widths and fy/H/3 image heights.
const cam = makeCamera();
const M_PER_X = 3 / (cam.fx / cam.spec.width), M_PER_Y = 3 / (cam.fy / cam.spec.height);

describe('calibrate: the rulers from a still stand', () => {
  it('the rest body, jittered: every ruler within 3 % of the truth', () => {
    const { frames } = synthesize(still(1.5), { seed: 3 });
    const { cal } = gateOver(frames);
    expect(cal).not.toBeNull();
    const j = restPose(), p = bodyPoints(j);
    const hipMidY = (p[23][1] + p[24][1]) / 2;
    const lowest = (heel: number, toe: number) => Math.min(p[heel][1], p[toe][1]);
    const truth = {
      mPerX: M_PER_X, mPerY: M_PER_Y,
      shoulderWidthM: Math.abs(j.LeftArm[0] - j.RightArm[0]),
      hipHeightM: hipMidY - (lowest(29, 31) + lowest(30, 32)) / 2,
      legLengthM: Math.hypot(j.LeftUpLeg[0] - j.LeftFoot[0], j.LeftUpLeg[1] - j.LeftFoot[1], j.LeftUpLeg[2] - j.LeftFoot[2]),
    };
    for (const [k, v] of Object.entries(truth)) {
      expect(Math.abs((cal as unknown as Record<string, number>)[k] / v - 1), k).toBeLessThan(0.03);
    }
    expect(cal!.sway.torsoM).toBeLessThan(0.015);
    // the floor line sits under the feet, near the image bottom
    expect(cal!.floorY.line).toBeGreaterThan(0.85);
    expect(cal!.floorY.line).toBeLessThan(1);
  });
  it("the owner's stand (stand_still): taken inside a second, rulers within 4 % of the camera's, hips within 2 cm", () => {
    const fx = load('stand_still');
    const { cal } = gateOver(fx.frames);
    expect(cal).not.toBeNull();
    expect(cal!.t - fx.frames[0].t).toBeLessThan(1000);
    expect(Math.abs(cal!.mPerX / M_PER_X - 1)).toBeLessThan(0.04);
    expect(Math.abs(cal!.mPerY / M_PER_Y - 1)).toBeLessThan(0.04);
    const hipGt = [...fx.gt.perFrame.hipH].sort((a, b) => a - b)[fx.gt.perFrame.hipH.length >> 1];
    expect(Math.abs(cal!.hipHeightM - hipGt)).toBeLessThan(0.02);
    // an adult's shoulders and legs
    expect(cal!.shoulderWidthM).toBeGreaterThan(0.3);
    expect(cal!.shoulderWidthM).toBeLessThan(0.45);
    expect(cal!.legLengthM).toBeGreaterThan(0.75);
    expect(cal!.legLengthM).toBeLessThan(0.95);
  });
  it('a stand is the median of its window: one wild frame does not move it', () => {
    const { frames } = synthesize(still(1.2), { seed: 5 });
    const w = frames.slice(-22);
    const base = calibrate(w);
    const wild = w.map((f, k) => (k === 10 ? { ...f, image: f.image.map((l) => ({ ...l, y: l.y + 0.004 })) } : f));
    const moved = calibrate(wild);
    expect(base.ok && moved.ok).toBe(true);
    if (base.ok && moved.ok) expect(Math.abs(moved.cal.hipY - base.cal.hipY)).toBeLessThan(0.001);
  });
});

describe('calibrate: it refuses, and says why', () => {
  it('not still: no window of a jog, a jump take or an approach calibrates', () => {
    for (const name of ['run_in_place', 'jump_two_foot_low', 'jump_two_foot_high', 'dunk_approach_two_foot', 'dunk_elijah_two_foot']) {
      const { cal, why } = gateOver(load(name).frames);
      expect(cal, name).toBeNull();
      expect(why.has('not-still') || why.has('not-whole') || why.has('edge-on'), name).toBe(true);
    }
  });
  it('too short a window', () => {
    const { frames } = synthesize(still(0.3), { seed: 1 });
    const r = calibrate(frames);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toBe('short');
    expect(CAL_WINDOW_MS).toBe(700);
  });
  it('not whole: a hidden knee, or feet out of the frame (the camera too close)', () => {
    const { frames } = synthesize(still(1), { seed: 2 });
    const hidden = frames.map((f) => ({ ...f, image: f.image.map((l, i) => (i === LEFT_KNEE ? { ...l, v: 0.2 } : l)) }));
    const a = calibrate(hidden.slice(-22));
    expect(a.ok ? '' : a.why).toBe('not-whole');
    const close = synthesize(still(1), { seed: 2, camera: { distance: 1.4 } }).frames;
    const b = gateOver(close);
    expect(b.cal).toBeNull();
    expect(b.why.has('not-whole')).toBe(true);
  });
  it('edge-on (turned 60°) and turned away (180°)', () => {
    const side = gateOver(synthesize(still(1.2, turn(restPose(), 60)), { seed: 4 }).frames);
    expect(side.cal).toBeNull();
    expect(side.why.has('edge-on')).toBe(true);
    const back = gateOver(synthesize(still(1.2, turn(restPose(), 180)), { seed: 4 }).frames);
    expect(back.cal).toBeNull();
    expect(back.why.has('turned-away')).toBe(true);
  });
  it('no world landmarks: no metre ruler', () => {
    const { frames } = synthesize(still(1), { seed: 6 });
    const flat = frames.map(({ world: _w, ...f }) => f);
    const r = calibrate(flat.slice(-22));
    expect(r.ok ? '' : r.why).toBe('no-world');
  });
  it('a blink of the model keeps the still window; a body gone longer than CAL_GAP_MS empties it', () => {
    const { frames } = synthesize(still(1.5), { seed: 8, missRate: 0, dropRate: 0 });
    const g = new StillnessGate();
    frames.slice(0, 25).forEach((f) => g.push(f));
    expect(g.window.length).toBeGreaterThan(15);
    g.push({ t: frames[25].t, present: false, image: [] });           // one missed frame
    g.push(frames[26]);
    expect(g.window).toContain(frames[24]);                          // the stand before the blink is kept
    expect(g.window.length).toBeGreaterThan(15);
    const back = frames.find((f) => f.t > frames[26].t + CAL_GAP_MS + 1)!;
    g.push({ t: frames[27].t, present: false, image: [] });           // gone…
    g.push(back);                                                    // …longer than a blink
    expect(g.window).toEqual([back]);
  });
});

describe('calibrate: the review\'s streams', () => {
  it('twice the landmark jitter (a dim room, the lite model): a statue still calibrates', () => {
    // the first gate judged raw jitter as motion: a statue's ankles read 3.0–3.9 cm (limit 2.5) and it never calibrated
    const noise = { imageTorso: 0.004, imageLimb: 0.008, worldTorso: 0.016, worldLimb: 0.03 };
    const { cal } = gateOver(synthesize(still(1.5), { seed: 3, noise }).frames);
    expect(cal).not.toBeNull();
    expect(cal!.t).toBeLessThan(1000);
  });
  it('a camera dropping 10 % of frames and the model missing 10 %: the stand is taken in its first second, every draw', () => {
    // the first gate restarted on every missed frame: it took 0.8–3.2 s on these draws, and 4 s was not enough on two
    for (let seed = 1; seed <= 12; seed++) {
      const { cal } = gateOver(synthesize(still(4), { seed, dropRate: 0.1, missRate: 0.1 }).frames);
      expect(cal, `seed ${seed}`).not.toBeNull();
      expect(cal!.t, `seed ${seed}`).toBeLessThan(1000);
    }
  });
  it('the lens pitch comes off an upright stand: a phone on the floor looking up, one on a shelf looking down, a level one', () => {
    const cases: [Partial<{ distance: number; heightM: number; lookAtY: number }>, number][] = [
      [{ heightM: 0.5, lookAtY: 1.2 }, -(Math.atan(0.7 / 3) * 180) / Math.PI],            // up 13.1°
      [{ distance: 2.4, heightM: 1.4, lookAtY: 0.9 }, (Math.atan(0.5 / 2.4) * 180) / Math.PI], // down 11.8°
      [{}, 0],
    ];
    for (const [camera, truth] of cases) {
      const { cal } = gateOver(synthesize(still(1.5), { seed: 4, camera }).frames);
      expect(cal, JSON.stringify(camera)).not.toBeNull();
      expect(Math.abs(cal!.pitchDeg - truth), JSON.stringify(camera)).toBeLessThan(2);
      expect(cal!.kneeDeg).toBeGreaterThanOrEqual(STAND_KNEE_DEG);
    }
  });
  it('…but not off a crouch, whose axis leans: it says so (kneeDeg) and leaves the lens level', () => {
    const { cal } = gateOver(synthesize(still(1.5, crouch(restPose(), 0.15)), { seed: 4, camera: { distance: 2.4, heightM: 1.4, lookAtY: 0.9 } }).frames);
    expect(cal).not.toBeNull();
    expect(cal!.kneeDeg).toBeLessThan(STAND_KNEE_DEG);
    expect(cal!.pitchDeg).toBe(0);
  });
  it('the owner\'s own stand, on a level lens, reads level', () => {
    const { cal } = gateOver(load('stand_still').frames);
    expect(cal!.pitchDeg).toBe(0);
  });
});

describe('footDropW', () => {
  it('reads a planted foot at the hips-to-floor drop', () => {
    const { frames } = synthesize(still(0.2), { noise: false, dropRate: 0, missRate: 0 });
    const p = bodyPoints(restPose());
    const hipMidY = (p[23][1] + p[24][1]) / 2;
    expect(footDropW(frames[0], 'L')!).toBeCloseTo(hipMidY - Math.min(p[29][1], p[31][1]), 6);
    expect(footDropW({ ...frames[0], world: undefined }, 'L')).toBeNull();
  });
});
