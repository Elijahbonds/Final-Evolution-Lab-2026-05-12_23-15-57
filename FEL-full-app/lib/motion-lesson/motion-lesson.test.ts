// EDU-05 motion lessons, phase A: the runtime adapter and the lesson file, over the owner's OWN committed recordings
// (lib/pose/__fixtures__: his DeepMotion takes as BlazePose frames — the adult recordings the roadmap's done-when names).
//   · the adapter reads a phone's world landmarks into mocapRetarget unchanged: a standing body's feet stay planted (and
//     a stepping one's do not, the control), a mirrored camera gives the mirrored move, gaps and poorly-seen frames are
//     marked weak;
//   · BlazePose read as the rig reads a skeleton: the pelvis over the hip joints, leg bones that keep their length (a
//     standing take stands 4–7 cm under full height, where it read 10–13 cm sunk), and the flight read from the picture,
//     held against each take's own ground truth (gt.perFrame: the feet's true height, frame by frame);
//   · a fixture pin: one recording's keys, pinned, so a change to the adapter (or the solver under it) shows here;
//   · the file: round trip within half a quantisation step, a wrong version or garbage is refused, and the weight is
//     measured against the 150 KB a minute the roadmap set;
//   · the words: claims and medical words are refused, as on every teacher text.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MIRROR_INDEX, type PoseFrame } from '@/lib/pose/landmarks';
import type { PoseKey } from '@/lib/babylon/anim/poseClip';
import { REF_HIPS_Y, REF_HIP_JOINT_Y, REF_LEG_LEN } from '@/lib/babylon/anim/poseClip';
import { canonJoints, framesToRecording, legFitOf, PELVIS_OVER_HIP_JOINTS, recordingToKeys, riseFromPicture, STREAM_FPS } from './adapter';
import { decodeLesson, encodeLesson, kbPerMinute, lessonErrors, LESSON_VERSION, MAX_KB_PER_MIN, type MotionLesson } from './format';

const FIX = path.join(__dirname, '../pose/__fixtures__');
interface Gt { jumps: { apex: { t: number; frame: number } }[]; perFrame: { footH: [number, number][]; contact: [number, number][] } }
const load = (name: string): { frames: PoseFrame[]; source: { license: string }; gt: Gt } => JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), 'utf8'));
/** The owner's own takes (the source says so); CMU's appear only as the stepping control. */
const OWNER = ['stand_still', 'jump_two_foot_low', 'jump_two_foot_high', 'dunk_elijah_two_foot', 'dunk_elijah_one_foot'];

const lessonOf = (keys: PoseKey[], duration: number, o: Partial<MotionLesson> = {}): MotionLesson => ({
  v: LESSON_VERSION, title: 'Two-foot jump', duration, keys, phrases: [], cues: [], beat: null, weak: [], ...o,
});

describe('the fixtures are the owner\'s own', () => {
  it.each(OWNER)('%s', (n) => expect(load(n).source.license).toMatch(/owner/i));
});

describe('the adapter: camera frames → the rig\'s pose keys, through mocapRetarget unchanged', () => {
  // Feet planted, measured (2026-11-03, default smoothing): the standing take's ankle targets move 3–4 cm side to side and
  // 8–9 cm front to back — the depth axis, where one camera is noisiest (the roadmap's "monocular depth is noisy") — while
  // the stepping takes move 47–57 cm side to side and 15–37 cm front to back. The lines sit between, and the control
  // proves they tell the two apart.
  const SIDE_M = 0.06, DEPTH_M = 0.12;
  const footSpread = (keys: PoseKey[], side: 'Left' | 'Right') => {
    const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
    return { x: spread(keys.map((k) => k.feet![side]![0])), z: spread(keys.map((k) => k.feet![side]![2])), top: Math.max(...keys.map((k) => k.feet![side]![1] + (k.hipsY ?? 0))) };
  };

  it('a standing take keeps its feet planted and its arms down; a stepping take does not (the control)', () => {
    const rec = framesToRecording(load('stand_still').frames)!;
    expect(rec.seconds).toBeGreaterThan(2.5);
    const { keys } = recordingToKeys(rec);
    for (const side of ['Left', 'Right'] as const) {
      const f = footSpread(keys, side);
      expect(f.top, side).toBeLessThan(0.2);                           // on the floor (ankle height)
      expect(f.x, side).toBeLessThan(SIDE_M);                          // and not sliding
      expect(f.z, side).toBeLessThan(DEPTH_M);
      // arms down: the wrists at about the hips' height (0.96 on the reference body), well under the shoulders (1.42)
      expect(Math.max(...keys.map((k) => k.hands![side]![1])), side).toBeLessThan(1.1);
    }
    expect(keys[0].feet!.Left![0]).toBeLessThan(keys[0].feet!.Right![0]);   // left is left
    for (const n of ['run_in_place', 'shuffle_lateral']) {
      const moving = recordingToKeys(framesToRecording(load(n).frames)!).keys;
      for (const side of ['Left', 'Right'] as const) {
        const f = footSpread(moving, side);
        expect(f.x > SIDE_M || f.z > DEPTH_M, `${n} ${side}`).toBe(true);
      }
    }
  });

  it('a two-foot jump crouches before it goes: hipsY dips well below standing', () => {
    const { keys } = recordingToKeys(framesToRecording(load('jump_two_foot_low').frames)!);
    const ys = keys.map((k) => k.hipsY ?? 0);
    expect(Math.min(...ys)).toBeLessThan(Math.max(...ys) - 0.08);
  });

  it('a mirrored camera gives the mirrored move: left and right swap, x flips', () => {
    const frames = load('dunk_elijah_one_foot').frames;
    const mirrored = frames.map((f) => ({
      ...f,
      image: f.image.length ? MIRROR_INDEX.map((j) => ({ ...f.image[j], x: 1 - f.image[j].x })) : [],
      world: f.world ? MIRROR_INDEX.map((j) => ({ ...f.world![j], x: -f.world![j].x })) : undefined,
    }));
    const a = recordingToKeys(framesToRecording(frames)!).keys, b = recordingToKeys(framesToRecording(mirrored)!).keys;
    expect(b.length).toBe(a.length);
    for (const i of [0, Math.floor(a.length / 2), a.length - 1]) {
      expect(b[i].hands!.Left![0]).toBeCloseTo(-a[i].hands!.Right![0], 1);
      expect(b[i].hands!.Left![1]).toBeCloseTo(a[i].hands!.Right![1], 1);
      expect(b[i].feet!.Right![0]).toBeCloseTo(-a[i].feet!.Left![0], 1);
    }
  });

  it('gaps and poorly-seen frames are bridged and marked weak; too little body is refused', () => {
    const frames = load('stand_still').frames;
    const holed = frames.map((f, i) => (i >= 30 && i < 45 ? { ...f, present: false, image: [], world: undefined } : f));
    const rec = framesToRecording(holed)!;
    expect(rec.stream.frames).toHaveLength(Math.floor(rec.seconds * STREAM_FPS) + 1);
    expect(rec.weak.length).toBe(1);
    expect(rec.weak[0][0]).toBeGreaterThan(0.8);
    expect(rec.weak[0][1]).toBeLessThan(1.6);
    const dim = framesToRecording(frames.map((f, i) => (i >= 60 ? { ...f, image: f.image.map((l) => ({ ...l, v: 0.2 })) } : f)))!;
    expect(dim.weak.at(-1)![1]).toBeCloseTo(dim.seconds, 1);
    expect(framesToRecording([])).toBeNull();
    expect(framesToRecording(frames.slice(0, 1))).toBeNull();
  });

  it('the joints are BlazePose\'s, y turned up', () => {
    const j = canonJoints(load('stand_still').frames[0].world!);
    expect(j.Head[1]).toBeGreaterThan(j.Neck[1]);
    expect(j.Neck[1]).toBeGreaterThan(j.Hips[1]);
    expect(j.Hips[1]).toBeGreaterThan(j.LeftFoot[1]);
  });
});

describe('BlazePose, read as the rig reads a skeleton', () => {
  it('the pelvis constant is poseClip\'s own (copied so the adapter stays free of Babylon)', () => {
    expect(PELVIS_OVER_HIP_JOINTS).toBeCloseTo((REF_HIPS_Y - REF_HIP_JOINT_Y) / REF_LEG_LEN, 6);
  });

  it('with the take\'s leg fit: every frame\'s thigh and shin are the measured length, and the pelvis sits over the hip joints', () => {
    const frames = load('stand_still').frames.filter((f) => f.present && f.world);
    const fit = legFitOf(frames.map((f) => f.world!));
    const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const raw: number[] = [];
    for (const f of frames) {
      const j = canonJoints(f.world!, fit), r = canonJoints(f.world!);
      expect(d(j.LeftUpLeg, j.LeftLeg)).toBeCloseTo(fit.thigh[0], 6);
      expect(d(j.LeftLeg, j.LeftFoot)).toBeCloseTo(fit.shin[0], 6);
      expect(d(j.RightUpLeg, j.RightLeg)).toBeCloseTo(fit.thigh[1], 6);
      expect(d(j.RightLeg, j.RightFoot)).toBeCloseTo(fit.shin[1], 6);
      expect(j.Hips[1] - r.Hips[1]).toBeGreaterThan(0.04);   // lifted (about 5 cm on a 0.87 m leg)
      expect(j.Hips[1] - r.Hips[1]).toBeLessThan(0.07);
      raw.push(d(r.LeftUpLeg, r.LeftLeg) + d(r.LeftLeg, r.LeftFoot));
    }
    // the control: the raw points' leg really does change length frame to frame (what the fit removes)
    expect(Math.max(...raw) - Math.min(...raw)).toBeGreaterThan(0.03);
  });

  it('a standing take stands: the hips within 8 cm of full height (they read 10–13 cm sunk before the fit)', () => {
    const { keys, scale } = recordingToKeys(framesToRecording(load('stand_still').frames)!);
    const ys = keys.map((k) => k.hipsY ?? 0);
    expect(Math.min(...ys)).toBeGreaterThan(-0.08);
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.04);
    // the control: the raw points, as BlazePose gives them, read the same stand at least 9 cm sunk, and the body a
    // little smaller (measured 2026-11-10: hipsY −0.13…−0.10 → −0.07…−0.04; scale 0.931 → 0.941)
    const raw = recordingToKeys(framesToRecording(load('stand_still').frames, { raw: true })!);
    expect(Math.max(...raw.keys.map((k) => k.hipsY ?? 0))).toBeLessThan(-0.09);
    expect(scale).toBeGreaterThan(raw.scale);
  });
});

describe('the flight, read from the picture (held against each take\'s ground truth)', () => {
  const TAKES = ['stand_still', 'jump_two_foot_low', 'jump_two_foot_high', 'dunk_elijah_two_foot', 'dunk_elijah_one_foot', 'shuffle_lateral', 'punch_kick'];
  const riseOf = (name: string) => {
    const fx = load(name);
    const rec = framesToRecording(fx.frames)!;
    const t0 = fx.frames.find((f) => f.present && f.world)!.t;
    const at = (ms: number) => rec.rise[Math.max(0, Math.min(rec.rise.length - 1, Math.round(((ms - t0) / 1000) * STREAM_FPS)))];
    return { fx, rec, at };
  };

  it.each(TAKES)('%s: with both feet down the body is on the floor (under 5 cm)', (name) => {
    const { fx, at } = riseOf(name);
    let worst = 0, n = 0;
    fx.gt.perFrame.contact.forEach((c, i) => { if (c[0] && c[1] && fx.frames[i]?.present) { worst = Math.max(worst, at(fx.frames[i].t)); n++; } });
    expect(n).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.05);
  });

  it('standing still never leaves the floor at all', () => {
    expect(Math.max(...riseOf('stand_still').rec.rise)).toBe(0);
  });

  it.each(['jump_two_foot_low', 'jump_two_foot_high', 'dunk_elijah_two_foot', 'dunk_elijah_one_foot'])('%s: each jump\'s top is within 12 cm of the lower foot\'s true height', (name) => {
    const { fx, at } = riseOf(name);
    expect(fx.gt.jumps.length).toBeGreaterThan(0);
    for (const j of fx.gt.jumps) {
      const truth = Math.min(...fx.gt.perFrame.footH[j.apex.frame]);
      expect(Math.abs(at(j.apex.t) - truth), `apex at ${Math.round(j.apex.t)} ms: true ${truth.toFixed(2)} m`).toBeLessThan(0.12);
    }
  });

  it('the high jump reads high (over 0.6 m) and the low ones low: the flight is the take\'s, not a constant', () => {
    const { fx, at } = riseOf('jump_two_foot_high');
    const tops = fx.gt.jumps.map((j) => at(j.apex.t));
    expect(tops[1]).toBeGreaterThan(0.6);
    expect(tops[0]).toBeLessThan(tops[1] - 0.2);
    expect(tops[2]).toBeLessThan(tops[1] - 0.2);
  });

  it('it rides in hipsY, in the reference body\'s metres; noRise gives mocapRetarget\'s keys untouched', () => {
    const rec = framesToRecording(load('jump_two_foot_high').frames)!;
    const withRise = recordingToKeys(rec), without = recordingToKeys(rec, { noRise: true });
    expect(withRise.keys).toHaveLength(without.keys.length);
    const lift = withRise.keys.map((k, i) => (k.hipsY ?? 0) - (without.keys[i].hipsY ?? 0));
    expect(Math.max(...lift)).toBeCloseTo(Math.max(...rec.rise) * without.scale, 1);
    expect(Math.min(...lift)).toBeGreaterThanOrEqual(0);
    withRise.keys.forEach((k, i) => expect({ ...k, hipsY: 0 }).toEqual({ ...without.keys[i], hipsY: 0 }));
  });

  it('no picture (a replay of world points only): no flight, and nothing breaks', () => {
    const frames = load('jump_two_foot_low').frames.map((f) => ({ ...f, image: [] }));
    const rec = framesToRecording(frames)!;
    expect(Math.max(...rec.rise)).toBe(0);
    expect(riseFromPicture([])).toEqual([]);
  });
});

describe('the fixture pin: the owner\'s two-foot jump, its keys', () => {
  it('stays what it was (a change to the adapter or the solver shows here)', () => {
    const { keys, duration, scale } = recordingToKeys(framesToRecording(load('jump_two_foot_low').frames)!);
    const pick = (k: PoseKey) => [k.t, k.hipsY, ...k.hands!.Left!, ...k.hands!.Right!, ...k.feet!.Left!, ...k.feet!.Right!, ...k.bones!.Spine!].map((x) => Math.round((x ?? 0) * 100) / 100);
    expect({ n: keys.length, duration: Math.round(duration * 100) / 100, scale: Math.round(scale * 1000) / 1000, first: pick(keys[0]), mid: pick(keys[Math.floor(keys.length / 2)]), last: pick(keys[keys.length - 1]) }).toMatchSnapshot();
  });
});

describe('the lesson file', () => {
  it('round-trips within half a step (0.05° on a bone, 0.5 mm on a target)', async () => {
    const { keys, duration } = recordingToKeys(framesToRecording(load('dunk_elijah_two_foot').frames)!);
    const l = lessonOf(keys, duration, { phrases: [{ from: 0, to: duration / 2, label: 'Load' }], cues: [{ t: 0.5, text: 'Sit back, then go' }], beat: { bpm: 96, offset: 0.1 }, weak: [[0.2, 0.4]] });
    const back = (await decodeLesson(await encodeLesson(l)))!;
    expect(back.keys).toHaveLength(keys.length);
    expect({ ...back, keys: [] }).toEqual({ ...l, keys: [] });
    keys.forEach((k, i) => {
      const b = back.keys[i];
      expect(b.t).toBeCloseTo(k.t, 3);
      expect(Math.abs((b.hipsY ?? 0) - (k.hipsY ?? 0))).toBeLessThanOrEqual(0.0005 + 1e-9);
      for (const s of ['Left', 'Right'] as const) for (const g of ['hands', 'feet'] as const) k[g]![s]!.forEach((x, j) => expect(Math.abs(b[g]![s]![j] - x)).toBeLessThanOrEqual(0.0005 + 1e-9));
      k.bones!.Spine!.forEach((x, j) => expect(Math.abs(b.bones!.Spine![j] - x)).toBeLessThanOrEqual(0.05 + 1e-9));
    });
  });

  it('refuses a wrong version and garbage', async () => {
    expect(await decodeLesson(new Uint8Array([1, 2, 3]))).toBeNull();
    const bytes = await encodeLesson({ ...lessonOf([{ t: 0 }, { t: 1 }], 1), v: 2 as never });
    expect(await decodeLesson(bytes)).toBeNull();
  });

  it(`weighs under ${MAX_KB_PER_MIN} KB a minute (measured on each of the owner's takes, and on all five back to back)`, async () => {
    const all: PoseKey[] = [];
    let t = 0;
    const rates: number[] = [];
    for (const n of OWNER) {
      const { keys, duration } = recordingToKeys(framesToRecording(load(n).frames)!);
      const kb = kbPerMinute(await encodeLesson(lessonOf(keys, duration)), duration);
      expect(kb, n).toBeLessThan(MAX_KB_PER_MIN);
      rates.push(kb);
      for (const k of keys) all.push({ ...k, t: t + k.t });
      t += duration;
    }
    // The five takes back to back, ONCE (15 s of movement that never repeats). Not looped up to a minute: gzip folds a
    // repeat to almost nothing (the same 15 s four times read as 7 KB a minute), which is not what a real minute weighs.
    const bytes = await encodeLesson(lessonOf(all, t));
    const kb = kbPerMinute(bytes, t);
    expect(kb).toBeLessThan(MAX_KB_PER_MIN);
    expect(kb).toBeGreaterThan(10);   // a rate this low would mean the movement was lost, not packed
    console.info(`[motion-lesson] per take ${rates.map((r) => r.toFixed(0)).join(' / ')} KB a minute; ${all.length} keys over ${t.toFixed(1)} s: ${(bytes.byteLength / 1024).toFixed(1)} KB → ${kb.toFixed(1)} KB a minute`);
  });
});

describe('the words (the claims screen and the medical words, as on every teacher text)', () => {
  const base = lessonOf([{ t: 0 }, { t: 1 }], 1);
  it('a clean lesson passes', () => {
    expect(lessonErrors({ ...base, phrases: [{ from: 0, to: 1, label: '1–8' }], cues: [{ t: 0.2, text: 'Knees out, chest up' }], beat: { bpm: 100, offset: 0 } })).toEqual([]);
  });
  it.each([
    ['a condition', { cues: [{ t: 0.2, text: 'Helps knee arthritis' }] }],
    ['a guarantee', { title: 'Guaranteed to add inches' }],
    ['a medical word', { cues: [{ t: 0.2, text: 'Fixes knee instability' }] }],
  ])('%s is refused', (_w, o) => expect(lessonErrors({ ...base, ...(o as Partial<MotionLesson>) }).length).toBeGreaterThan(0));
  it('the limits: a long cue, a phrase outside the movement, overlapping phrases, a wild count', () => {
    expect(lessonErrors({ ...base, cues: [{ t: 0.2, text: 'push the floor away from you hard now' }] })).toContain('Cue 1: up to 5 words.');
    expect(lessonErrors({ ...base, phrases: [{ from: 0.5, to: 3, label: 'A' }] }).join(' ')).toMatch(/inside the movement/);
    expect(lessonErrors({ ...base, phrases: [{ from: 0, to: 0.8, label: 'A' }, { from: 0.5, to: 1, label: 'B' }] }).join(' ')).toMatch(/before the one above/);
    expect(lessonErrors({ ...base, beat: { bpm: 400, offset: 0 } }).join(' ')).toMatch(/beats a minute/);
  });
});
