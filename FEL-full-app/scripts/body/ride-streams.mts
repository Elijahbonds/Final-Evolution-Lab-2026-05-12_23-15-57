// ride-streams — the REAL motion the P8 ride read is gated on beside its scripted label set (movement play P8, 2026-09-26):
// CMU windows of skateboarding, driving, a bird's wings, arms out for balance, jump and hop turns, turning in place,
// marching, a jog, waves and stretches → the living room → room-space JOINT CLIPS (30 fps, mm), one JSON per take in
// lib/pose/__fixtures__/ride/, with its labels. The gate (lib/pose/rideGate.test.ts) and the report (scripts/body/ride.mts)
// build each take's opening and shoot it under every camera condition themselves, so a file holds only its window.
//
//   node node_modules/tsx/dist/cli.mjs scripts/body/ride-streams.mts [--only name,name] [--dry]
//   (FEL_CMU_DIR= the extracted CMU tree, default ~/Downloads/fel-mocap-sources/cmu; a take not extracted there is read
//    straight out of its zip beside it, into FEL_RIDE_TMP, default the system temp directory)
//
// LABELS (PLAN-P8 §8.2, R-F6). The CLASS and its WINDOW are the EYE's: each take was sheeted with
// scripts/mocap/stream-sheet.mts (run, not edited: STEP=0.25, front + side stick figures) and the window of each move read
// off the sheet — `eye`, in the source's own seconds, `labeller: 'eye'`. The truth inside a window — which way a lean, a
// wheel or a wing goes, when a turn passes 75°, when the feet leave the floor — comes from the take's CLEAN joints
// (lib/pose/rideStreams realStream / withTruth), never from the reader under test. Each window was trimmed to the moves it
// labels (≤ 60 KB a take, the directory ≤ 2 MB).
//
// Every take opens the way a player does — its own first frame held still facing the camera for the space check's stand,
// then (a board take) the turn into its stance: realStream builds that opening from the window's first frame. So a window
// starts where the eye saw a stand (arms down) unless holding the pose IS the move: 83_22's window opened on its arms held
// out in front, and 1.6 s of that held still is a wheel taken, by any rule. Sources stay
// in ~/Downloads/fel-mocap-sources (CMU, licence owner-approved, scripts/mocap/sources.mts LICENSE); only joint numbers
// derived from them are written.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readBvhStream, LICENSE } from '../mocap/sources.mts';
import * as synthNs from '../../lib/pose/synth.ts';
import * as kitNs from '../../lib/pose/streamKit.ts';

const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { toRoom, sampleClip } = unwrap(synthNs);
const { turnBody } = unwrap(kitNs);
type Joints = synthNs.Joints;
type JointClip = synthNs.JointClip;

const SOURCES = join(homedir(), 'Downloads/fel-mocap-sources');
const SRC = process.env.FEL_CMU_DIR ?? join(SOURCES, 'cmu');
const OUT = join(process.cwd(), 'lib/pose/__fixtures__/ride');
const FPS = 30;

export interface RideTakeSpec {
  name: string;
  description: string;
  file: string;
  /** The capture's true rate when the file's is wrong (synth-streams' TIME BASE: subjects 75, 88, 141, 143 at 60). */
  fps?: number;
  fromSec: number;
  toSec: number;
  /** 'board': turned into a stance of `theta`° (lead L) after the stand; 'facing': kept facing the camera. */
  family: 'board' | 'facing';
  theta?: number;
  kind: 'positive' | 'negative';
  /** What the take is FOR (the controls its clean truth is graded on). */
  controls: string[];
  /** The EYE's labels (stream-sheet): each move's window, in the source's seconds. */
  eye: EyeLabel[];
  room?: Record<string, unknown>;
  /** The cmuconvert zip beside the CMU tree that holds the file, when it is not extracted. */
  zip?: string;
}
export interface EyeLabel { control: string; fromSec: number; toSec: number; note?: string }

const L = (control: string, fromSec: number, toSec: number, note?: string): EyeLabel => ({ control, fromSec, toSec, ...(note ? { note } : {}) });
const FOLLOW = { yawDeg: 'follow', strideScale: 0.3 };   // a take that travels: turned to face the camera throughout, steps pulled in
export const RIDE_TAKES: RideTakeSpec[] = [
  // ── the skater (subject 134: skate moves without a board, in a side stance) → turned into a 45° regular stance
  { name: 'cmu_134_03_lean_turn_right', description: 'CMU 134_03 "Lean Turn Right": a skater\'s lean held through a turn.', file: '134/134_03.bvh', fromSec: 0.25, toSec: 2.9, family: 'board', theta: 45, kind: 'positive', controls: ['carve'],
    eye: [L('carve', 0.5, 2.75, 'the lean builds from the set-up and holds; out of it at 3.0')] },
  { name: 'cmu_134_15_lean_turn_left', description: 'CMU 134_15 "Lean Turn Left": the other way.', file: '134/134_15.bvh', fromSec: 0.25, toSec: 2.1, family: 'board', theta: 45, kind: 'positive', controls: ['carve'],
    eye: [L('carve', 0.4, 1.9, 'arms out, the lean the whole take')] },
  { name: 'cmu_134_05_pump_jump', description: 'CMU 134_05 "Pump Jump": pumps, then a pop.', file: '134/134_05.bvh', fromSec: 0.25, toSec: 2.6, family: 'board', theta: 45, kind: 'positive', controls: ['pop', 'carve'],
    eye: [L('carve', 0.3, 1.4, 'the pumps'), L('pop', 1.4, 2.35, 'gather, the pop, the deep landing at 1.75–2.0')] },
  { name: 'cmu_134_08_push_turn_right', description: 'CMU 134_08 "Push Turn Right": a kick-push, then a carve.', file: '134/134_08.bvh', fromSec: 0.25, toSec: 2.1, family: 'board', theta: 45, kind: 'positive', controls: ['carve', 'push'],
    eye: [L('push', 0.4, 1.0, 'the rear leg kicked back and returned'), L('carve', 1.1, 2.0, 'upright side stance, leaning into the turn')] },
  // ── the drivers: both hands on a wheel (the windows skip the one-handed stretches the eye saw: 79_76 3.0–3.9 s, 80_38 1.5,
  //    2.75, 12.25–14 s)
  { name: 'cmu_79_76_driving', description: 'CMU 79_76 "driving": both hands on a wheel, turned each way.', file: '79/79_76.bvh', fromSec: 4.0, toSec: 8.5, family: 'facing', kind: 'positive', controls: ['wheel', 'grip'],
    eye: [L('grip', 4.0, 8.5, 'both forearms forward at the chest throughout; a quick hand move at 6.25–6.5')] },
  { name: 'cmu_80_38_driving', description: 'CMU 80_38 "driving": the other subject\'s wheel.', file: '80/80_38.bvh', fromSec: 7.0, toSec: 11.5, family: 'facing', kind: 'positive', controls: ['wheel', 'grip'],
    eye: [L('grip', 7.0, 11.5, 'both forearms forward, the wheel turned hard each way')] },
  // ── wings: a bird's flap (the stress case: its bank stays small) and arms held out for balance while walking
  { name: 'cmu_79_58_bird', description: 'CMU 79_58 "bird": arms flapped as wings.', file: '79/79_58.bvh', fromSec: 0.5, toSec: 5.0, family: 'facing', kind: 'positive', controls: ['spread', 'bank'],
    eye: [L('spread', 0.5, 5.0, 'arms out, flapping up and down')] },
  { name: 'cmu_80_62_bird', description: 'CMU 80_62 "bird": the other subject\'s wings.', file: '80/80_62.bvh', fromSec: 2.25, toSec: 6.75, family: 'facing', kind: 'positive', controls: ['spread', 'bank'],
    eye: [L('spread', 2.25, 6.75, 'arms out flapping, the body leaning into it')] },
  { name: 'cmu_132_01_arms_out', description: 'CMU 132_01 "Walk With Arms Out, balancing".', file: '132/132_01.bvh', zip: 'cmuconvert-daz-131-135.zip', fromSec: 2.25, toSec: 6.75, family: 'facing', kind: 'positive', controls: ['spread', 'bank', 'stride'], room: FOLLOW,
    eye: [L('spread', 2.25, 6.75, 'arms out level, small balancing tilts'), L('stride', 2.25, 6.75, 'walking')] },
  { name: 'cmu_132_05_arms_out', description: 'CMU 132_05 "Walk With Arms Out, balancing": big tilts.', file: '132/132_05.bvh', zip: 'cmuconvert-daz-131-135.zip', fromSec: 1.75, toSec: 6.25, family: 'facing', kind: 'positive', controls: ['spread', 'bank', 'stride'], room: FOLLOW,
    eye: [L('spread', 1.75, 6.25, 'arms out, one arm high at 2.75–4.5 (a big tilt), the body leaning'), L('stride', 1.75, 6.25, 'walking')] },
  { name: 'cmu_132_09_arms_out', description: 'CMU 132_09 "Walk With Arms Out, balancing".', file: '132/132_09.bvh', zip: 'cmuconvert-daz-131-135.zip', fromSec: 5.0, toSec: 9.5, family: 'facing', kind: 'positive', controls: ['spread', 'bank', 'stride'], room: FOLLOW,
    eye: [L('spread', 5.0, 9.5, 'arms out with tilts each way'), L('stride', 5.0, 9.5, 'walking')] },
  // ── turns: jump turns (91), hop turns 90 / 180 / 270 / 360 (83), and turning in place (69)
  { name: 'cmu_91_56_jump_turn_90', description: 'CMU 91_56 "90": a jump turning 90° in the air.', file: '91/91_56.bvh', fromSec: 1.0, toSec: 3.9, family: 'facing', kind: 'positive', controls: ['quarter', 'pop'],
    eye: [L('quarter', 2.2, 3.3, 'gather 2.25, in the air 2.5–2.75, landed turned by 3.25'), L('pop', 2.2, 3.3)] },
  { name: 'cmu_91_46_jump_turn', description: 'CMU 91_46 "Jump Turn".', file: '91/91_46.bvh', fromSec: 0.3, toSec: 2.69, family: 'facing', kind: 'positive', controls: ['quarter', 'pop'],
    eye: [L('quarter', 1.2, 2.3, 'gather 0.75–1.25, in the air 1.5–1.75, landed in profile at 2.0'), L('pop', 1.2, 2.3)] },
  { name: 'cmu_83_51_hop_turn_90', description: 'CMU 83_51 "hop turn 90 degrees left in air".', file: '83/83_51.bvh', zip: 'cmuconvert-daz-81-85.zip', fromSec: 1.75, toSec: 4.25, family: 'facing', kind: 'positive', controls: ['quarter', 'pop'],
    eye: [L('quarter', 2.4, 3.3, 'gather 2.5, up 2.75, landed in profile 3.0'), L('pop', 2.4, 3.3)] },
  { name: 'cmu_83_54_hop_turn_180', description: 'CMU 83_54 "hop turn 180 degrees left in air".', file: '83/83_54.bvh', zip: 'cmuconvert-daz-81-85.zip', fromSec: 1.0, toSec: 3.5, family: 'facing', kind: 'positive', controls: ['quarter', 'pop'],
    eye: [L('quarter', 1.7, 2.8, 'gather 1.75–2.0, up 2.25, landed facing away 2.5'), L('pop', 1.7, 2.8)] },
  { name: 'cmu_83_58_hop_turn_270', description: 'CMU 83_58 "hop turn left 270 degrees in air".', file: '83/83_58.bvh', zip: 'cmuconvert-daz-81-85.zip', fromSec: 0.5, toSec: 3.0, family: 'facing', kind: 'positive', controls: ['quarter', 'pop'],
    eye: [L('quarter', 0.9, 2.0, 'gather 1.0, up 1.25–1.5, landed in profile 1.75'), L('pop', 0.9, 2.0)] },
  { name: 'cmu_83_61_hop_turn_360', description: 'CMU 83_61 "hop turn 360 degrees left in air".', file: '83/83_61.bvh', zip: 'cmuconvert-daz-81-85.zip', fromSec: 1.0, toSec: 3.75, family: 'facing', kind: 'positive', controls: ['quarter', 'pop'],
    eye: [L('quarter', 1.4, 2.7, 'gather 1.5, up 2.0–2.25, landed facing again 2.5'), L('pop', 1.4, 2.7)] },
  { name: 'cmu_83_64_hop_turn_360_right', description: 'CMU 83_64 "hop and turn right 360 degrees in air".', file: '83/83_64.bvh', zip: 'cmuconvert-daz-81-85.zip', fromSec: 2.0, toSec: 4.5, family: 'facing', kind: 'positive', controls: ['quarter', 'pop'],
    eye: [L('quarter', 2.4, 3.8, 'gather 2.5–2.75, up 3.0–3.25, landed 3.5–3.75'), L('pop', 2.4, 3.8)] },
  { name: 'cmu_69_16_turn_in_place', description: 'CMU 69_16 "turn in place": a full turn stepping round.', file: '69/69_16.bvh', zip: 'cmuconvert-daz-60-75.zip', fromSec: 0.5, toSec: 3.5, family: 'facing', kind: 'positive', controls: ['turn'],
    eye: [L('turn', 0.7, 3.0, 'stepping round from 0.75, in profile 1.0–2.25, facing again by 3.0 (~140°/s: slower than a quarter, 75° inside 700 ms)')] },
  { name: 'cmu_69_18_turn_in_place_other', description: 'CMU 69_18 "turn in place (opposite direction)".', file: '69/69_18.bvh', zip: 'cmuconvert-daz-60-75.zip', fromSec: 1.25, toSec: 4.0, family: 'facing', kind: 'positive', controls: ['turn'],
    eye: [L('turn', 1.4, 3.6, 'stepping round the other way from 1.5, facing again 3.5 (slower than a quarter)')] },
  // ── cadence: a jog, and marching (knees high, slow: a walk's cadence)
  { name: 'cmu_143_04_jog', description: 'CMU 143_04: a jog, turned to face the camera, strides pulled in (a stride positive; a negative for the rest).', file: '143/143_04.bvh', fps: 60, fromSec: 3.5, toSec: 7.5, family: 'facing', kind: 'positive', controls: ['stride'], room: FOLLOW,
    eye: [L('stride', 3.5, 7.5, 'running the figure 8')] },
  { name: 'cmu_91_19_march', description: 'CMU 91_19 "March": knees high at a walking cadence, turned to face the camera, steps pulled in.', file: '91/91_19.bvh', fromSec: 2.0, toSec: 7.0, family: 'facing', kind: 'positive', controls: ['stride'], room: FOLLOW,
    eye: [L('stride', 2.25, 7.0, 'marching, big knee lifts; a turn at 7.25')] },
  { name: 'cmu_132_37_march', description: 'CMU 132_37 "Marching".', file: '132/132_37.bvh', zip: 'cmuconvert-daz-131-135.zip', fromSec: 1.25, toSec: 5.0, family: 'facing', kind: 'positive', controls: ['stride'], room: FOLLOW,
    eye: [L('stride', 1.5, 4.0, 'marching, knees to the hip')] },
  // ── the negatives: waves and stretches (a T-stretch IS the wing pose: the plane's rows are excused, PLAN-P8 §12)
  { name: 'cmu_141_16_wave', description: 'CMU 141_16: a wave.', file: '141/141_16.bvh', fps: 60, fromSec: 0.25, toSec: 4.5, family: 'facing', kind: 'negative', controls: [],
    eye: [L('wave', 0.5, 3.25, 'the right hand waving overhead')] },
  { name: 'cmu_113_27_wave', description: 'CMU 113_27 "Wave".', file: '113/113_27.bvh', fromSec: 0.2, toSec: 2.9, family: 'facing', kind: 'negative', controls: [],
    eye: [L('wave', 0.5, 2.0, 'the right hand waving at head height')] },
  { name: 'cmu_143_25_wave', description: 'CMU 143_25 "Waving": one hand, then both.', file: '143/143_25.bvh', fps: 60, fromSec: 5.0, toSec: 9.0, family: 'facing', kind: 'negative', controls: [],
    eye: [L('wave', 5.0, 6.5, 'one hand overhead'), L('wave', 6.75, 9.0, 'both arms waving overhead')] },
  { name: 'cmu_141_13_stretch', description: 'CMU 141_13: stretching.', file: '141/141_13.bvh', fps: 60, fromSec: 0.75, toSec: 5.25, family: 'facing', kind: 'negative', controls: [],
    eye: [L('stretch', 1.5, 4.25, 'arms up overhead, then out wide')] },
  { name: 'cmu_143_30_stretch', description: 'CMU 143_30 "Stretch And Yawn".', file: '143/143_30.bvh', fps: 60, fromSec: 0.5, toSec: 5.5, family: 'facing', kind: 'negative', controls: [],
    eye: [L('stretch', 1.25, 4.75, 'arms up, then held out wide with the elbows up (a T at 2.25–4.0)')] },
  { name: 'cmu_113_23_stretch', description: 'CMU 113_23 "Stretch and yawn".', file: '113/113_23.bvh', fromSec: 1.0, toSec: 6.0, family: 'facing', kind: 'negative', controls: [],
    eye: [L('stretch', 1.0, 6.0, 'arms overhead 1.0–5.0, then out level 5.5–6.0')] },
  { name: 'cmu_77_21_stretch', description: 'CMU 77_21 "stretching": arm swings, a side lunge, side bends.', file: '77/77_21.bvh', zip: 'cmuconvert-daz-76-80.zip', fromSec: 0.5, toSec: 5.5, family: 'facing', kind: 'negative', controls: [],
    eye: [L('stretch', 0.5, 1.75, 'arm swings'), L('stretch', 2.0, 3.25, 'a side lunge'), L('stretch', 4.0, 5.5, 'side bends')] },
  { name: 'cmu_83_22_stretch', description: 'CMU 83_22 "stretching": arm stretches across and out.', file: '83/83_22.bvh', zip: 'cmuconvert-daz-81-85.zip', fromSec: 4.9, toSec: 9.9, family: 'facing', kind: 'negative', controls: [],
    eye: [L('stretch', 5.25, 7.5, 'an arm across the chest, then out'), L('stretch', 8.0, 9.9, 'both arms out and across')] },
];

/** Arms straight out at shoulder height, level: the bind pose a retargeting file opens on (synth-streams' rule). */
function isTPose(j: Record<string, [number, number, number]>): boolean {
  const out = (s: 'Left' | 'Right') => {
    const sh = j[`${s}Arm`], h = j[`${s}Hand`], arm = Math.hypot(...[0, 1, 2].map((k) => j[`${s}ForeArm`][k] - sh[k])) + Math.hypot(...[0, 1, 2].map((k) => h[k] - j[`${s}ForeArm`][k]));
    return Math.abs(h[1] - sh[1]) < 0.15 * arm && Math.hypot(h[0] - sh[0], h[2] - sh[2]) > 0.85 * arm;
  };
  return out('Left') && out('Right');
}

/** The shoulders' yaw (deg): 0 facing the camera, + = the left shoulder away (the reader's convention, streamKit.turnBody's sign). */
const shoulderYaw = (j: Joints): number => (Math.atan2(-(j.LeftArm[2] - j.RightArm[2]), j.LeftArm[0] - j.RightArm[0]) * 180) / Math.PI;
const r3 = (x: number) => { const v = Math.round(x * 1000) / 1000; return Object.is(v, -0) ? 0 : v; };

export interface RideTakeFile {
  name: string; description: string; family: 'board' | 'facing'; theta: number | null; kind: 'positive' | 'negative'; controls: string[];
  labeller: 'eye';
  /** The eye's windows (the source's seconds). */
  eye: EyeLabel[];
  source: { file: string; license: string; fps: number; fromSec: number; toSec: number };
  /** The opening realStream builds before the window (s): the facing stand, and (a board take) the turn and the stance. */
  opening: { faceSec: number; turnSec?: number; takeSec?: number };
  /** The window only, from fromSec (30 fps; a board take already turned into its stance): each frame the joints' x, y, z in
   *  `joints` order (m, 3 decimals — the names once, not per frame). */
  clip: { fps: number; foot?: JointClip['foot']; joints: string[]; frames: number[][] };
}

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const dry = args.includes('--dry');
if (!dry) mkdirSync(OUT, { recursive: true });
const index: unknown[] = [];
/** The take's BVH: extracted under SRC, else read out of its zip into FEL_RIDE_TMP / the system temp directory (never the tree). */
function bvhOf(spec: RideTakeSpec): string {
  const direct = join(SRC, spec.file);
  if (existsSync(direct) || !spec.zip) return direct;
  const out = join(process.env.FEL_RIDE_TMP ?? tmpdir(), 'fel-ride-bvh', spec.file);
  if (!existsSync(out)) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, execFileSync('unzip', ['-p', join(SOURCES, spec.zip), spec.file], { maxBuffer: 64 * 1024 * 1024 }));
  }
  return out;
}

for (const spec of RIDE_TAKES) {
  if (only && !only.has(spec.name)) continue;
  const stream = readBvhStream(bvhOf(spec), 'cmu');
  const fps = spec.fps ?? stream.fps;
  const skip = isTPose(stream.frames[0] as never) ? 1 : 0;
  const motion = stream.frames.slice(skip);
  const from = Math.max(0, Math.round(spec.fromSec * fps) - skip), to = Math.min(motion.length, Math.round(spec.toSec * fps) - skip);
  const { clip } = toRoom({ fps, frames: motion as never }, { scale: 0.01, toeExtend: 0, from, to, shoulderSpanM: 0.31, ...(spec.room ?? {}) } as never);
  // resample to 30 fps, and turn the take by its FIRST frame's own shoulder yaw: a board take into its stance (regular: the
  // left shoulder toward the camera, at θ exactly), any other take to FACE the camera at its start — toRoom's 'auto' faces
  // the window's mean: 134_15 opened at −35° and rode at −82°, outside the stance band, and its stand never calibrated; a
  // 180° hop turn opened 90° off the camera and "turned" a quarter in the first frame after its facing stand. A take that
  // travels ('follow') is faced frame by frame already.
  const dur = (clip.frames.length - 1) / clip.fps;
  const y0 = shoulderYaw(sampleClip(clip, 0));
  const turn = spec.family === 'board' ? -(spec.theta ?? 45) - y0 : spec.room?.yawDeg === 'follow' ? 0 : -y0;
  const take: Joints[] = [];
  for (let k = 0; k <= Math.floor(dur * FPS); k++) take.push(turnBody(sampleClip(clip, k / FPS), turn));
  const file: RideTakeFile = {
    name: spec.name, description: spec.description, family: spec.family, theta: spec.family === 'board' ? spec.theta ?? 45 : null, kind: spec.kind,
    controls: spec.controls, labeller: 'eye', eye: spec.eye,
    source: { file: `cmu/${spec.file}`, license: LICENSE.cmu, fps: +fps.toFixed(2), fromSec: spec.fromSec, toSec: spec.toSec },
    opening: spec.family === 'board' ? { faceSec: 1.6, turnSec: 0.5, takeSec: 1.3 } : { faceSec: 1.6 },
    clip: { fps: FPS, ...(clip.foot ? { foot: clip.foot } : {}), joints: Object.keys(take[0]), frames: take.map((j) => Object.keys(take[0]).flatMap((k) => ((j as never)[k] as number[]).map(r3))) },
  };
  const text = JSON.stringify(file);
  if (!dry) writeFileSync(join(OUT, `${spec.name}.json`), text);
  index.push({ name: spec.name, file: `cmu/${spec.file}`, seconds: +(take.length / FPS).toFixed(2), kb: Math.round(text.length / 1024), family: spec.family, kind: spec.kind, controls: spec.controls });
  console.log(`${spec.name}: ${take.length} frames (${(take.length / FPS).toFixed(1)} s), ${Math.round(text.length / 1024)} KB`);
}
if (!dry && !only) writeFileSync(join(OUT, 'index.json'), JSON.stringify({ license: LICENSE.cmu, labeller: 'eye', takes: index }, null, 1) + '\n');
