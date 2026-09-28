// fight-streams — the combat read's labelled fixtures (movement play P7, 2026-09-25): REAL fight motion (CMU captures,
// the owner's stand) → the living room → room-space JOINT CLIPS + labels, one JSON per take in
// lib/pose/__fixtures__/fight/. Not landmark streams: the gate (lib/pose/fightGate.test.ts) and the report
// (scripts/body/fight.mts) synthesize every camera condition from the clip at test time (fps, latency, noise, blur,
// dropouts, seeds), so one clip serves the whole grid.
//
//   node node_modules/tsx/dist/cli.mjs scripts/body/fight-streams.mts [--only name,name] [--dry]
//
// LABELS ARE THE EYE'S, NEVER THE CLASSIFIER'S. Each take was looked at on scripts/body/fight-sheet.mts sheets (per run:
// front / top / side views of the wrist's or the ankle's path) and every strike named there: `at` is the run's start the
// sheet printed. Where a whole stretch is one kind (144_20: every right punch out is a straight), the label is
// take-wide and made per run by the reach rule (fightTruth.extensionRuns / kickRuns), and says so. The instants come
// from the clean joints (fightTruth), by the reader's own rules. What the sheets showed, take by take, is in `eye`.
//
// Sources stay where they are (~/Downloads/fel-mocap-sources, outside the repo); only joint numbers derived from them are
// written, with the licence. Subjects 02/74/76/77/86/113/131 were extracted from the already-approved cgspeed zips on disk.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readBvhStream, LICENSE } from '../mocap/sources.mts';
import * as synthNs from '../../lib/pose/synth.ts';
import * as truthNs from '../../lib/pose/fightTruth.ts';
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { toRoom } = unwrap(synthNs);
const { fightTruth, extensionRuns, kickRuns } = unwrap(truthNs);
type RoomOptions = synthNs.RoomOptions;
type JointClip = synthNs.JointClip;
type FightLabel = truthNs.FightLabel;
type Hand = truthNs.Hand;

const SRC = join(homedir(), 'Downloads/fel-mocap-sources');
const OUT = join(process.cwd(), 'lib/pose/__fixtures__/fight');
/** The clips are stored at this rate (the synth interpolates): every capture here is 60 or 120 fps. */
const STORE_FPS = 60;

type Bulk = { bulk: 'extensions' | 'kicks'; kind: 'blow' | 'legKick'; cls: string; hand: Hand; from: number; to: number };
type Lab = Omit<FightLabel, 'labeller'> & { labeller?: FightLabel['labeller'] };
interface Spec {
  name: string;
  role: 'positive' | 'negative';
  description: string;
  /** What the sheet showed (the eye's notes). */
  eye: string;
  kind: 'cmu' | 'deepmotion';
  file: string;
  fromSec: number;
  toSec: number;
  /** 'punch' = turned so the arms' furthest reach points at the camera (the player punches at the screen). */
  yaw: 'punch' | 'auto' | 'follow' | number;
  room?: Partial<RoomOptions>;
  /** The stance's lead foot as the sheet shows it; null = square. Informational: the truth names jab / cross by the
   *  stance RULE on the clean ankles (fightTruth.leadTrack), the one the reader runs. */
  lead: Hand | null;
  labels: (Lab | Bulk)[];
  /** Families not graded on this take (neither truth nor misfire), with the reason in `eye`. */
  ungraded?: ('fightStep' | 'evade' | 'guard')[];
}

const S = (hand: Hand, ...ats: number[]): Lab[] => ats.map((at) => ({ kind: 'blow', cls: 'straight', hand, at }));
const HOOK = (hand: Hand, at: number): Lab => ({ kind: 'blow', cls: 'hook', hand, at, note: 'a wide swinging hook, the arm near straight (143_23)' });

const FIXTURES: Spec[] = [
  {
    name: 'boxing_80_10', role: 'positive', kind: 'cmu', file: 'cmu/80/80_10.bvh', fromSec: 1.7, toSec: 5.9, yaw: 'punch', lead: null,
    description: 'Shadow boxing (CMU 80_10): straights in pairs, left-left-right-right, from a square stance at the face.',
    eye: 'Every punch OUT (the reach from ~0.25 to ~0.95 of the arm) is a straight: the side view a level line at the camera at shoulder height, the top view a line converging on the centre — two lefts, two rights, every ~0.25 s (take-wide, made per extension by the reach). The ways back and the quick loops that keep the fist near the chin (the reach stays ~0.3) are not strikes. The game cut its "hook" clip from 3.08; on the sheet that run is a straight like the rest. The ankles are level in depth (square): the stance rule keeps the orthodox default, so the left is the jab. (The first sheets cut runs at a speed crossing, then at speed minima: this take\'s speed dips mid-punch, which split punches and hid four of them. The reach does not dip.)',
    labels: [
      { bulk: 'extensions', kind: 'blow', cls: 'straight', hand: 'L', from: 1.7, to: 5.9 },
      { bulk: 'extensions', kind: 'blow', cls: 'straight', hand: 'R', from: 1.7, to: 5.9 },
    ],
  },
  {
    name: 'cross_144_20', role: 'positive', kind: 'cmu', file: 'cmu/144/144_20.bvh', fromSec: 1.2, toSec: 9.0, yaw: 'punch', lead: 'L',
    description: 'Right straights from a deep orthodox lunge (CMU 144_20 "Punch_Sequence"): the rear hand, so crosses.',
    eye: 'A deep lunge, the left leg forward; the right hand punches out level at the camera and back, over and over. Every run OUT is a straight (take-wide); the runs back are retractions.',
    labels: [{ bulk: 'extensions', kind: 'blow', cls: 'straight', hand: 'R', from: 1.2, to: 9.0 }],
  },
  {
    name: 'cross_144_13', role: 'positive', kind: 'cmu', file: 'cmu/144/144_13.bvh', fromSec: 1.4, toSec: 9.0, yaw: 'punch', lead: 'R',
    description: 'Left straights from a deep southpaw lunge (CMU 144_13 "Left_Punch_Sequence"): the rear hand of a right lead, so crosses.',
    eye: 'The mirror of 144_20: the right leg forward, the left hand punching out level at the camera. Every run OUT is a straight (take-wide).',
    labels: [{ bulk: 'extensions', kind: 'blow', cls: 'straight', hand: 'L', from: 1.4, to: 9.0 }],
  },
  {
    name: 'straight_113_13', role: 'positive', kind: 'cmu', file: 'cmu/113/113_13.bvh', fromSec: 1.2, toSec: 5.7, yaw: 'punch', lead: null,
    description: 'Two right straights (CMU 113_13 "Punch and kick").',
    eye: 'The right hand drives out level twice (1.64, 5.17), a long stance that reads square in depth once turned to the camera (the lead is the stance rule\'s). The swing at 5.77 (the arm thrown back) is not a strike and is left out of the window.',
    labels: [{ bulk: 'extensions', kind: 'blow', cls: 'straight', hand: 'R', from: 1.2, to: 5.7 }],
  },
  {
    name: 'punches_86_01', role: 'positive', kind: 'cmu', file: 'cmu/86/86_01.bvh', fromSec: 33.9, toSec: 38.1, yaw: 'punch', lead: null,
    description: 'Five alternating straights at the camera (CMU 86_01 "jumps kicks and punches", the last stretch).',
    eye: 'Left, right, left, right, left: each a level line out at the camera; the one run back at 36.23 is a retraction.',
    labels: [
      { bulk: 'extensions', kind: 'blow', cls: 'straight', hand: 'L', from: 33.9, to: 38.1 },
      { bulk: 'extensions', kind: 'blow', cls: 'straight', hand: 'R', from: 33.9, to: 38.1 },
    ],
  },
  {
    name: 'punch_kick_141_14', role: 'positive', kind: 'cmu', file: 'cmu/141/141_14.bvh', fromSec: 1.4, toSec: 5.4, yaw: 'punch', lead: null,
    description: 'A right, a left, a right straight, then a right front kick (CMU 141_14 "Punch and Kick", the P1 punch_kick take).',
    eye: 'Three extensions to full reach at shoulder height (R 1.70, L 2.42, R 3.08); the left one starts wide and comes in, but ends a straight arm at the camera like the others. The left arm drawn back at 1.82 is a retraction. Then the right leg kicks forward.',
    labels: [
      { bulk: 'extensions', kind: 'blow', cls: 'straight', hand: 'R', from: 1.4, to: 3.6 },
      { bulk: 'extensions', kind: 'blow', cls: 'straight', hand: 'L', from: 1.4, to: 3.6 },
      { bulk: 'kicks', kind: 'legKick', cls: 'front', hand: 'R', from: 3.4, to: 5.4 },
    ],
  },
  {
    name: 'hooks_143_23', role: 'positive', kind: 'cmu', file: 'cmu/143/143_23.bvh', fromSec: 0.5, toSec: 11.8, yaw: 'auto', lead: null,
    description: 'Eight wide swinging punches, left and right (CMU 143_23 "Punching"): the fist comes round from beside the body to in front of the face.',
    eye: 'Each run is a horizontal arc: the top view sweeps from beside / behind the shoulder round to the front, at shoulder height, the arm nearly straight — a wide hook (a haymaker), not a straight. The arm drawn back between them (8.50, 11.60) is a wind-up, unlabelled.',
    labels: [HOOK('L', 0.82), HOOK('R', 2.10), HOOK('L', 3.48), HOOK('R', 5.00), HOOK('L', 6.63), HOOK('R', 8.23), HOOK('L', 9.77), HOOK('R', 11.30)],
  },
  {
    name: 'front_kicks_144_05', role: 'positive', kind: 'cmu', file: 'cmu/144/144_05.bvh', fromSec: 0.3, toSec: 12.5, yaw: 'auto', lead: 'L',
    description: 'Right front kicks from a long stance (CMU 144_05 "Front_Kicking").',
    eye: 'The right leg swings from far behind up and forward to hip height, a straight line at the camera in the top view, and back: every kick is a front kick (take-wide).',
    labels: [{ bulk: 'kicks', kind: 'legKick', cls: 'front', hand: 'R', from: 0.3, to: 12.5 }],
  },
  {
    name: 'front_kicks_135_04', role: 'positive', kind: 'cmu', file: 'cmu/135/135_04.bvh', fromSec: 2.3, toSec: 7.4, yaw: 'auto', lead: null,
    room: { travel: 'remove' }, ungraded: ['fightStep'],
    description: 'Three karate front kicks, right, left, right, each stepping in (CMU 135_04 "Front Kick").',
    eye: 'The foot rises straight up and out at the camera (the top view a straight line), knee first. Each kick steps in (3.2 m in all), which the room removes: steps are not graded here.',
    labels: [
      { kind: 'legKick', cls: 'front', hand: 'R', at: 2.77 }, { kind: 'legKick', cls: 'front', hand: 'L', at: 4.49 }, { kind: 'legKick', cls: 'front', hand: 'R', at: 6.38 },
    ],
  },
  {
    name: 'round_kicks_135_07', role: 'positive', kind: 'cmu', file: 'cmu/135/135_07.bvh', fromSec: 0.3, toSec: 10.0, yaw: 'auto', lead: null,
    room: { travel: 'remove' }, ungraded: ['fightStep'],
    description: 'Four karate roundhouse kicks, right, left, right, left (CMU 135_07 "Mawashigeri").',
    eye: 'The leg comes round the side and across the front at head height, the hips turned through it (the top view a big loop from behind round to the front). The game cut its HIGH KICK clip from 6.03; on the sheet that one is a roundhouse too. Each kick steps across the floor (3.6 m in all), which the room removes: steps are not graded here.',
    labels: [
      { kind: 'legKick', cls: 'round', hand: 'R', at: 0.62 }, { kind: 'legKick', cls: 'round', hand: 'L', at: 3.29 },
      { kind: 'legKick', cls: 'round', hand: 'R', at: 6.06 }, { kind: 'legKick', cls: 'round', hand: 'L', at: 9.00 },
    ],
  },
  {
    name: 'guard_76_04', role: 'positive', kind: 'cmu', file: 'cmu/76/76_04.bvh', fromSec: 0.1, toSec: 1.6, yaw: 'auto', lead: null,
    description: 'Hands raised from the sides into a guard at the face (CMU 76_04 "defensive guard pose"), before the crouch.',
    eye: 'Standing, arms down; both fists come up to the chin by ~0.9 s. (After 1.6 s the subject sinks into a deep crouch: cut.)',
    labels: [{ kind: 'guard', cls: 'raise', at: 0.2, span: 1.0 }],
  },
  {
    name: 'duck_77_09', role: 'positive', kind: 'cmu', file: 'cmu/77/77_09.bvh', fromSec: 0.2, toSec: 8.1, yaw: 'auto', lead: null,
    ungraded: ['guard', 'fightStep'],
    description: 'Two deep ducks "to avoid a flying object" (CMU 77_09), the arms thrown round the head.',
    eye: 'Standing, then down under it fast, the head near the knees, and back up — twice (~1.4 s and ~5.0 s). The arms are thrown round the head as he goes down (a cover the eye cannot call a guard or not) and the feet shuffle: guards and steps are not graded here.',
    labels: [{ kind: 'evade', cls: 'duck', at: 1.2, span: 1.0 }, { kind: 'evade', cls: 'duck', at: 4.8, span: 1.0 }],
  },
  // ── negatives: nothing here is a fight move ──
  {
    name: 'neg_stand_owner', role: 'negative', kind: 'deepmotion', file: 'deepmotion/IMG_2138.bvh', fromSec: 4.0, toSec: 7.0, yaw: 'auto', lead: null,
    description: "Standing still, arms down: the owner's own stand (P1 stand_still).", eye: 'A still stand with a video solve\'s sway.', labels: [],
  },
  {
    name: 'neg_jog', role: 'negative', kind: 'cmu', file: 'cmu/143/143_04.bvh', fromSec: 3.5, toSec: 7.5, yaw: 'follow', room: { strideScale: 0.3 }, lead: null,
    ungraded: ['fightStep'],
    description: 'A jog in place, the arms pumping (P1 run_in_place).', eye: 'Running, arms swinging bent at the elbow, antiphase. A figure-8 run turned in place: the room model slides its feet ±0.35 m, so steps are not graded here (the scripted jog, kit_jog, grades them).', labels: [],
  },
  {
    name: 'neg_wave_143_25', role: 'negative', kind: 'cmu', file: 'cmu/143/143_25.bvh', fromSec: 0.2, toSec: 10.9, yaw: 'auto', lead: null,
    description: 'Waving: one hand at head height, then both arms swung overhead side to side (CMU 143_25 "Waving").', eye: 'A one-hand wave (1–6 s), then both arms overhead (6–9.5 s).', labels: [],
  },
  {
    name: 'neg_wave_141_16', role: 'negative', kind: 'cmu', file: 'cmu/141/141_16.bvh', fromSec: 0.2, toSec: 5.0, yaw: 'auto', lead: null,
    description: 'A wave hello (CMU 141_16).', eye: 'One hand up and waving.', labels: [],
  },
  {
    name: 'neg_stretch_141_13', role: 'negative', kind: 'cmu', file: 'cmu/141/141_13.bvh', fromSec: 0.2, toSec: 6.0, yaw: 'auto', lead: null,
    description: 'Stretch and yawn (CMU 141_13): the arms up and out, a lean back.', eye: 'Arms raised overhead and out to the sides, the back arched, then down.', labels: [],
  },
  {
    name: 'neg_stretch_143_30', role: 'negative', kind: 'cmu', file: 'cmu/143/143_30.bvh', fromSec: 0.2, toSec: 6.2, yaw: 'auto', lead: null,
    description: 'Stretch and yawn (CMU 143_30).', eye: 'Arms overhead, a slow stretch.', labels: [],
  },
];

// ── build ────────────────────────────────────────────────────────────────────────────────────────────────────────
const r3 = (x: number) => { const v = Math.round(x * 1000) / 1000; return Object.is(v, -0) ? 0 : v; };
const JN = ['Hips', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToe', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToe'] as const;
function isTPose(j: Record<string, [number, number, number]>): boolean {
  const out = (s: 'Left' | 'Right') => {
    const sh = j[`${s}Arm`], h = j[`${s}Hand`], arm = Math.hypot(...[0, 1, 2].map((k) => j[`${s}ForeArm`][k] - sh[k])) + Math.hypot(...[0, 1, 2].map((k) => h[k] - j[`${s}ForeArm`][k]));
    return Math.abs(h[1] - sh[1]) < 0.15 * arm && Math.hypot(h[0] - sh[0], h[2] - sh[2]) > 0.85 * arm;
  };
  return out('Left') && out('Right');
}
/** The yaw that points the arms' furthest reach at the camera. */
function punchYaw(frames: Record<string, [number, number, number]>[], mirror: boolean): number {
  const reach = frames.map((f) => (['Left', 'Right'] as const).map((s) => Math.hypot(...[0, 1, 2].map((k) => f[`${s}Hand`][k] - f[`${s}Arm`][k]))));
  const all = reach.flat().sort((a, b) => a - b), hi = all[Math.floor(all.length * 0.9)];
  let dx = 0, dz = 0;
  frames.forEach((f, i) => (['Left', 'Right'] as const).forEach((s, k) => { if (reach[i][k] >= hi) { dx += (f[`${s}Hand`][0] - f[`${s}Arm`][0]) * (mirror ? -1 : 1); dz += f[`${s}Hand`][2] - f[`${s}Arm`][2]; } }));
  return (Math.atan2(dx, dz) * 180) / Math.PI;
}

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const dry = args.includes('--dry');
if (!dry) mkdirSync(OUT, { recursive: true });
const index: unknown[] = [];
for (const spec of FIXTURES) {
  if (only && !only.has(spec.name)) continue;
  const stream = readBvhStream(join(SRC, spec.file), spec.kind);
  const fps = stream.fps;
  const skip = spec.kind === 'cmu' && isTPose(stream.frames[0]) ? 1 : 0;
  const motion = stream.frames.slice(skip);
  const from = Math.max(skip, Math.round(spec.fromSec * fps)), to = Math.min(stream.frames.length, Math.round(spec.toSec * fps));
  const yawDeg = spec.yaw === 'punch' ? punchYaw(stream.frames.slice(from, to), false) : spec.yaw;
  const roomOpt: RoomOptions = {
    scale: 0.01, toeExtend: spec.kind === 'cmu' ? 0 : 0.05, from: from - skip, to: to - skip,
    // THE FEET STAY WHERE THEY STOOD. toRoom's travel removal subtracts the hips' slow path from every joint, which slides
    // planted feet across the floor as the hips sway (the wave hello's feet "moved" 0.3 m): a take that stayed in place
    // (under 0.4 m) keeps its travel; one that crossed the floor has it removed, clamped to ±15 cm, and its steps are not
    // graded (`ungraded`), since the room model moved its feet
    ...(spec.room?.travel === undefined && spec.yaw !== 'follow' ? { travel: 'keep' as const } : { clampM: 0.15 }),
    ...(spec.kind === 'cmu' ? { shoulderSpanM: 0.31 } : {}), yawDeg, ...spec.room,
  };
  const { clip: full, info } = toRoom({ fps, frames: motion }, roomOpt);
  const step = Math.max(1, Math.round(fps / STORE_FPS));
  const clip: JointClip = { fps: fps / step, frames: full.frames.filter((_, i) => i % step === 0), foot: full.foot };
  // labels on the fixture's clock (s from its first frame), take-wide ones made per run
  const labels: FightLabel[] = [];
  for (const l of spec.labels) {
    if ('bulk' in l) {
      const a = l.from - spec.fromSec, b = l.to - spec.fromSec;
      const ats = l.bulk === 'extensions' ? extensionRuns(clip, l.hand, a, b) : kickRuns(clip, l.hand, a, b);
      for (const at of ats) labels.push({ kind: l.kind, cls: l.cls, hand: l.hand, at: Math.max(0, at), labeller: 'eye', note: `take-wide: every ${l.bulk === 'extensions' ? 'run out' : 'kick'} of this ${l.kind === 'blow' ? 'hand' : 'foot'} in ${l.from}–${l.to} s` });
      // a push out that stops short of a full arm (under fightTruth.FULL_REACH): a pump or a feint the eye would not name —
      // ungraded ('any'): a straight read there is neither right nor wrong
      if (l.bulk === 'extensions') for (const at of extensionRuns(clip, l.hand, a, b, { partial: true })) labels.push({ kind: 'blow', cls: 'any', hand: l.hand, at: Math.max(0, at), labeller: 'eye', note: 'take-wide: a push short of a full arm (ungraded)' });
    } else labels.push({ ...l, at: l.at - spec.fromSec, labeller: l.labeller ?? 'eye' });
  }
  labels.sort((x, y) => x.at - y.at);
  // the stance, as a number: the lead ankle's depth advantage (m, + = the left foot nearer the camera)
  const lz = clip.frames.map((j) => j.LeftFoot[2] - j.RightFoot[2]).sort((a, b) => a - b)[Math.floor(clip.frames.length / 2)];
  const gt = fightTruth(clip, labels);
  const fx = {
    name: spec.name, role: spec.role, description: spec.description, eye: spec.eye,
    source: { file: spec.file, kind: spec.kind, license: LICENSE[spec.kind], fps, from, to },
    room: { yawDeg: typeof yawDeg === 'number' ? r3(yawDeg) : yawDeg, travelM: r3(info.travelM), floorDriftM: r3(info.floorDriftM), shoulderOutM: r3(info.shoulderOutM), strideScale: spec.room?.strideScale ?? 1 },
    lead: spec.lead, stanceDepthM: r3(lz), ungraded: spec.ungraded ?? [],
    labels: labels.map((l) => ({ ...l, at: r3(l.at) })),
    clip: { fps: clip.fps, foot: clip.foot, joints: JN, frames: clip.frames.map((j) => JN.flatMap((n) => j[n].map(r3))) },
  };
  const text = ['{', ...Object.entries(fx).filter(([k]) => k !== 'clip').map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
    `  "clip": { "fps": ${clip.fps}, "foot": ${JSON.stringify(clip.foot)}, "joints": ${JSON.stringify(JN)}, "frames": [`,
    fx.clip.frames.map((f) => `    ${JSON.stringify(f)}`).join(',\n'), '  ] }', '}', ''].join('\n');
  if (!dry) writeFileSync(join(OUT, `${spec.name}.json`), text);
  const counts: Record<string, number> = {};
  for (const g of gt) { const k = `${g.kind}:${g.name}${g.hand ? g.hand : ''}`; counts[k] = (counts[k] ?? 0) + 1; }
  index.push({ name: spec.name, role: spec.role, source: `${spec.file} [${spec.fromSec}, ${spec.toSec}] s`, seconds: r3(clip.frames.length / clip.fps), lead: spec.lead, stanceDepthM: r3(lz), counts, kb: Math.round(text.length / 1024) });
  console.log(`${spec.name.padEnd(22)} ${(clip.frames.length / clip.fps).toFixed(1)}s yaw ${typeof yawDeg === 'number' ? yawDeg.toFixed(0) : yawDeg} stance ${lz.toFixed(2)} ${JSON.stringify(counts)} ${Math.round(text.length / 1024)} KB`);
}
if (!dry && !only) writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1) + '\n');
