// A synthetic "captured" file: what /dev/pose-record's capture set downloads, built from the app's own synthetic bodies
// (MIRROR PHASE 3, 2026-10-07). NOT A PERSON. It exists so the ingest and the replay report are proven end to end
// before the owner's real capture arrives: the Quick Screen takes come from lib/assess/replay.ts's generators, the
// Mirror's from lib/mirror/fixtures/build.ts's poses, each fault built with the joints actually doing it. The light
// takes are a clean squat with the visibility turned down (dim) or the body shrunk toward the middle (far).
//
// Its numbers are a synthetic body's, filmed by a kind camera: they prove the plumbing, never a threshold.
// Deterministic: the same options give the same file.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { CAPTURE_PROTOCOL, captureTake, type CaptureDevice, type PersonAlias } from '@/lib/pose/captureProtocol';
import { POSE_TAKE_FORMAT } from '@/lib/pose/recordingsGuard';
import type { Joints } from '@/lib/pose/synth';
import { cmj, film, kneeWall, ohsFront, ohsSide, singleLegSquat, standFront, standSide, type Capture } from '@/lib/assess/replay';
import { lungePose, pushupPose, squatPose, type SquatOpts } from '../build';
import { hingeClean, hingeHeadPoke, hingeSquatty } from '../hingeSetupBuild';
import type { RawTakesFile } from './format';

const ease = (u: number) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };
/** Reps of a depth curve at 60 Hz source frames: still, down, hold, up, still (seconds). */
function reps(n: number, pose: (d: number) => Joints, s = { still: 1, down: 0.9, hold: 0.3, up: 0.9, rest: 0.5 }): Joints[] {
  const k = (sec: number) => Math.max(1, Math.round(sec * 60));
  const out: Joints[] = [];
  for (let i = 0; i < k(s.still); i++) out.push(pose(0));
  for (let r = 0; r < n; r++) {
    for (let i = 0; i < k(s.down); i++) out.push(pose(ease((i + 1) / k(s.down))));
    for (let i = 0; i < k(s.hold); i++) out.push(pose(1));
    for (let i = 0; i < k(s.up); i++) out.push(pose(ease(1 - (i + 1) / k(s.up))));
    for (let i = 0; i < k(s.rest); i++) out.push(pose(0));
  }
  return out;
}
const clip = (frames: Joints[], seed: number, noise: boolean): PoseFrame[] => film({ fps: 60, frames }, { noise, seed }).frames;

const squat = (o: SquatOpts = {}, depth = 1) => (d: number) => squatPose(d * depth, o);

/** The light takes: visibility turned down (dim), or the body shrunk toward the middle with it (far). */
const dim = (fs: readonly PoseFrame[], v = 0.32): PoseFrame[] => fs.map((f) => ({ ...f, image: f.image.map((l) => ({ ...l, v: Math.min(l.v, v) })) }));
const far = (fs: readonly PoseFrame[]): PoseFrame[] => fs.map((f) => ({
  ...f, image: f.image.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * 0.45, y: 0.55 + (l.y - 0.55) * 0.45, v: Math.min(l.v, 0.38) })),
}));

/** Per phone: what its detect log says (a mid-range Android that cannot hold 60, an iPhone that can). */
const RATES: Record<CaptureDevice, { fps: number; ms: number; hiFps: number; hiMs: number; ua: string }> = {
  'android-mid': { fps: 24, ms: 27, hiFps: 31, hiMs: 27, ua: 'Chrome 140 · Android' },
  iphone: { fps: 30, ms: 9, hiFps: 59, hiMs: 9.5, ua: 'Safari 18.0 · iOS' },
};

export interface SynthCaptureOptions {
  person: PersonAlias;
  device: CaptureDevice;
  /** Film with the synth's seeded landmark jitter (default: clean). */
  noise?: boolean;
  seed?: number;
  /** Only these take ids (default: every take this file can build). */
  only?: readonly string[];
}

/** Every take this file builds, by protocol id (press/row and a few faults have no synthetic body: left out). */
function builders(noise: boolean, seed: number, jumpFps = 60): Record<string, () => { frames: PoseFrame[]; fps: number }> {
  const at = (c: Capture) => ({ frames: c.frames, fps: c.fps });
  const o = (k: number) => ({ noise, seed: seed + k });
  const s30 = (fs: PoseFrame[]) => ({ frames: fs, fps: 30 });
  const squatGood = () => clip(reps(5, squat()), seed + 20, noise);
  return {
    'stand.front': () => at(standFront(4, o(1))),
    'stand.side': () => at(standSide('left', 3, o(2))),
    'squat.good': () => s30(squatGood()),
    'squat.kneesCaveIn': () => s30(clip(reps(3, squat({ kneeInL: 0.08, kneeInR: 0.08 })), seed + 21, noise)),
    'squat.shallow': () => s30(clip(reps(3, squat({}, 0.25)), seed + 22, noise)),
    'lunge.left.good': () => s30(clip(reps(8, (d) => lungePose(d, { front: 'left' })), seed + 30, noise)),
    'lunge.right.good': () => s30(clip(reps(8, (d) => lungePose(d, { front: 'right' })), seed + 31, noise)),
    'lunge.left.frontKneeCavesIn': () => s30(clip(reps(3, (d) => lungePose(d, { front: 'left', frontKneeIn: 0.09 })), seed + 32, noise)),
    'lunge.left.shallow': () => s30(clip(reps(3, (d) => lungePose(d * 0.3, { front: 'left' })), seed + 33, noise)),
    'hinge.good': () => s30(hingeClean()),
    'hinge.kneeDominant': () => s30(hingeSquatty()),
    'hinge.headPoke': () => s30(hingeHeadPoke()),
    'pushup.good': () => s30(clip(reps(11, (d) => pushupPose(d)), seed + 40, noise)),
    'pushup.knee': () => s30(clip(reps(5, (d) => pushupPose(d, { kneeVariant: true })), seed + 44, noise)),
    'pushup.hipsSag': () => s30(clip(reps(3, (d) => pushupPose(d, { hipOffM: -0.08 })), seed + 41, noise)),
    'pushup.hipsPike': () => s30(clip(reps(3, (d) => pushupPose(d, { hipOffM: 0.08 })), seed + 42, noise)),
    'pushup.partial': () => s30(clip(reps(3, (d) => pushupPose(d * 0.35)), seed + 43, noise)),
    'jump.good': () => at(cmj([{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }], { fps: jumpFps, ...o(50) })),
    'jump.stiffLanding': () => at(cmj([{ heightM: 0.2, landDepth: 0.05 }, { heightM: 0.2, landDepth: 0.05 }, { heightM: 0.22, landDepth: 0.05 }], { fps: jumpFps, ...o(51) })),
    'jump.kneesCaveInLanding': () => at(cmj([{ heightM: 0.2, landDepth: 0.6, landKneeIn: 0.14 }, { heightM: 0.2, landDepth: 0.6, landKneeIn: 0.14 }, { heightM: 0.21, landDepth: 0.6, landKneeIn: 0.14 }], { fps: jumpFps, ...o(52) })),
    'jump.armSwing': () => at(cmj([{ heightM: 0.4, armSwing: true }, { heightM: 0.42, armSwing: true }, { heightM: 0.41, armSwing: true }], { fps: jumpFps, ...o(53) })),
    't1.front.good': () => at(ohsFront({}, o(60))),
    't1.front.kneesCaveIn': () => at(ohsFront({ kneeInL: 0.1, kneeInR: 0.1 }, o(61))),
    't1.side.good': () => at(ohsSide({}, o(62))),
    't1.side.armsForward': () => at(ohsSide({ shoulderFlex: 135 }, o(63))),
    't1.side.heelsLift': () => at(ohsSide({ heelRiseM: 0.05 }, o(64))),
    't1.side.forwardLean': () => at(ohsSide({ trunk: 62, tibia: 26 }, o(65))),
    't2.left.good': () => at(kneeWall('left', {}, o(70))),
    't2.right.good': () => at(kneeWall('right', {}, o(71))),
    't2.left.heelLift': () => at(kneeWall('left', { heelLiftM: 0.04 }, o(72))),
    't2.right.shortRange': () => at(kneeWall('right', { tibiaMax: 26 }, o(73))),
    't3.left.good': () => at(singleLegSquat('left', {}, { reps: 3, ...o(80) })),
    't3.right.good': () => at(singleLegSquat('right', {}, { reps: 3, ...o(81) })),
    't3.left.kneesCaveIn': () => at(singleLegSquat('left', { kneeIn: 0.09 }, { reps: 3, ...o(82) })),
    't3.left.hipDrop': () => at(singleLegSquat('left', { pelvicDrop: 16 }, { reps: 3, ...o(83) })),
    't3.right.trunkLean': () => at(singleLegSquat('right', { trunkLean: 22 }, { reps: 3, ...o(84) })),
    'light.dim': () => s30(dim(clip(reps(3, squat()), seed + 90, noise))),
    'light.far': () => s30(far(clip(reps(3, squat()), seed + 91, noise))),
  };
}

/** The take ids this file can build. */
export const SYNTH_TAKE_IDS: readonly string[] = Object.keys(builders(false, 7));

/** A recorder-shaped capture file for one synthetic person on one phone. */
export function synthCaptureFile(o: SynthCaptureOptions): RawTakesFile & Record<string, unknown> {
  const r = RATES[o.device];
  // the jump is filmed at the rate the phone's log says it held: 60 on the iPhone, 30 on the mid-range Android
  const b = builders(o.noise ?? false, o.seed ?? 7, r.hiFps >= 50 ? 60 : 30);
  const ids = (o.only ?? SYNTH_TAKE_IDS).filter((id) => b[id]);
  const takes = ids.map((id) => {
    const spec = captureTake(id)!;
    const { frames } = b[id]();
    const t0 = frames[0]?.t ?? 0;
    const fs = frames.map((f) => ({ ...f, t: Math.round((f.t - t0) * 10) / 10 }));
    const high = spec.highRate === true;
    return {
      id, label: spec.id, prompt: spec.prompt, recordedAt: '2026-10-09T15:30:00.000Z', device: r.ua,
      video: { width: 640, height: 480 }, clock: 'capture',
      detectFps: high ? r.hiFps : r.fps, inferMs: high ? r.hiMs : r.ms, highRate: high,
      goT: 0, endT: fs.length ? fs[fs.length - 1].t : 0, frames: fs,
    };
  });
  return {
    format: POSE_TAKE_FORMAT,
    origin: 'owner-capture',
    child: false,
    capture: { protocol: CAPTURE_PROTOCOL, person: o.person, device: o.device, adult: true, consent: true },
    privacy: 'Landmark numbers only. No video or image. Recorded and saved on this device; nothing was uploaded.',
    savedAt: '2026-10-09T15:45:00.000Z',
    device: r.ua,
    model: 'pose_landmarker_lite/float16/1',
    notes: 'synthetic: built from the app\'s own synthetic bodies, no person was recorded',
    frameShape: 'lib/pose/landmarks.ts PoseFrame',
    landmarks: [],
    takes,
  };
}
