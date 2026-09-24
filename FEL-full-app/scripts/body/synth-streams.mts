// synth-streams — the movement-play fixture set (phase 1, 2026-09-24): REAL motion → the living room → a virtual
// webcam → PoseFrame[] with ground truth, one JSON per movement in lib/pose/__fixtures__/. Every body detector the
// pass builds (take-off, apex, strike, release, steps, punches) is graded on these before it ever sees a camera.
//
//   node node_modules/tsx/dist/cli.mjs scripts/body/synth-streams.mts [--only name,name] [--dry]
//
// Sources stay where they are (~/Downloads/fel-mocap-sources, outside the repo); only landmark numbers derived from
// them are written. lib/pose/synth.ts does the work: toRoom() (facing the camera, travel out, feet under the hips,
// floor at 0), synthesize() (33 points, projection, noise / visibility / drops / latency, ground truth).
//
// TIME BASE. Every cgspeed CMU file says 120 fps, but some subjects were captured at 60: fitted to the hips in flight,
// their jumps fall at ~40 m/s² at the stated rate and ~9.8 at half of it (75, 88, 141, 143 at 60; 06, 124, 127, 85 at
// 120; 144 walks at a normal cadence only at 120). Each fixture carries the rate its gravity agrees with, and the
// table prints the fit, so a wrong one shows. The owner's DeepMotion takes fit 8–11 m/s² at their own rates.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readBvhStream, LICENSE } from '../mocap/sources.mts';
import * as synthNs from '../../lib/pose/synth.ts';
// the app's modules load as CommonJS under tsx: the named exports sit on the default
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { toRoom, synthesize } = unwrap(synthNs);
type RoomOptions = synthNs.RoomOptions;
type SynthOptions = synthNs.SynthOptions;
type PoseFixture = synthNs.PoseFixture;
type JointClip = synthNs.JointClip;
type GtJump = synthNs.GtJump;

const SRC = join(homedir(), 'Downloads/fel-mocap-sources');
const OUT = join(process.cwd(), 'lib/pose/__fixtures__');

interface Spec {
  name: string;
  description: string;
  kind: 'deepmotion' | 'cmu';
  /** Under SRC. */
  file: string;
  /** The capture's TRUE frame rate when the file's is wrong (see TIME BASE). */
  fps?: number;
  fromSec: number;
  toSec: number;
  /** Seconds (from fromSec) whose facing is turned to the camera; default the whole window. */
  faceSec?: [number, number];
  room?: Partial<RoomOptions>;
  synth?: SynthOptions;
}

// DeepMotion's Toe joint is the ball of the foot (the tip is ~5 cm on); CMU's FootEnd is the tip.
const TOE = { deepmotion: 0.05, cmu: 0 } as const;
// MediaPipe's shoulder points sit on a real shoulder girdle, and every body gate is measured in shoulder widths. The
// owner's DeepMotion rig has his own (0.34 m). Every CMU file is retargeted onto one DAZ skeleton whose shoulder joints
// are 0.23 m apart on a ~1.6 m body with an adult's hips (0.18 m), which shrank the ruler by a third (image width 0.06
// against the owner's 0.09): its arms are moved out to a ~1.6 m adult's span.
const SHOULDER_SPAN: Record<'deepmotion' | 'cmu', number | undefined> = { deepmotion: undefined, cmu: 0.31 };

const FIXTURES: Spec[] = [
  {
    name: 'stand_still',
    description: "Standing still, arms down: the calibration stand. The owner's DeepMotion take, so it carries a video solve's small sway.",
    kind: 'deepmotion', file: 'deepmotion/IMG_2138.bvh', fromSec: 4.0, toSec: 7.0,
  },
  {
    name: 'jump_two_foot_low',
    description: "Four two-foot jumps in place, 0.41–0.51 s flights (~0.2–0.3 m), little rest between: the owner's take, already in place (0.35 m of travel).",
    kind: 'deepmotion', file: 'deepmotion/IMG_0938.bvh', fromSec: 1.0, toSec: 4.4,
  },
  {
    name: 'jump_two_foot_high',
    description: 'Two-foot jumps low / max / low (hip rise ~0.24 / 0.73 / 0.22 m). The max jump takes the hands out of the top of the frame at 3 m.',
    kind: 'deepmotion', file: 'deepmotion/IMG_0940.bvh', fromSec: 1.3, toSec: 4.9,
  },
  {
    name: 'jump_one_foot_runup',
    description: 'Two running strides into a one-foot (right) take-off over an obstacle, 0.55 s flight; the run-up pulled in to steps in place.',
    kind: 'cmu', file: 'cmu/127/127_22.bvh', fromSec: 0.05, toSec: 2.2, faceSec: [0, 1.2],
    room: { strideScale: 0.4 },
  },
  {
    name: 'run_in_place',
    description: 'A jog in place (~2.7 steps/s): a figure-8 run turned to face the camera every frame, travel removed, strides pulled in under the hips. Its running flights are NOT jumps.',
    kind: 'cmu', file: 'cmu/143/143_04.bvh', fps: 60, fromSec: 3.5, toSec: 7.5,
    room: { yawDeg: 'follow', strideScale: 0.3 }, synth: { gt: { contactM: 0.05 } },
  },
  {
    name: 'dunk_elijah_two_foot',
    description: "The owner's dunk (basketball_dunk__elijah): approach steps in place, a two-foot take-off, ~0.9 s flight (~1 m), the right hand's flush ~70 ms after the apex, then the arms swung down into the landing.",
    kind: 'deepmotion', file: 'deepmotion/basketball_dunk__elijah.bvh', fromSec: 0.0, toSec: 2.6, faceSec: [0.6, 1.3],
    room: { strideScale: 0.4 },
  },
  {
    name: 'dunk_elijah_one_foot',
    description: "The owner's one-foot (left) take-off after ~2 s of running steps in place, 0.74 s flight (~0.8 m of hip rise), edge-on to the camera. The steps hold a 0.34 s two-foot hop (a GT jump) with his back to the camera. In this solve the reach and the hammer come BEFORE the take-off and the hands stay low in the flight: a take-off and height case, not a slam. He turns away after landing.",
    kind: 'deepmotion', file: 'deepmotion/basketball_dunk__elijah.bvh', fromSec: 4.8, toSec: 8.0, faceSec: [0.6, 2.1],
    room: { strideScale: 0.4 },
  },
  {
    name: 'dunk_approach_two_foot',
    description: 'A 2.5 s approach (steps in place) into a two-foot take-off, 0.89 s flight, a late right hand: the reach tops out just after the apex and the hammer comes at the landing.',
    kind: 'deepmotion', file: 'deepmotion/IMG_8593.bvh', fromSec: 0.8, toSec: 4.6, faceSec: [1.2, 2.2],
    room: { strideScale: 0.4 },
  },
  {
    name: 'jumpshot',
    description: "The game's jumpshot source (CMU 124_05): the turn and dip, the ball lifted to the set point, a two-foot jump (0.54 s), the release ~0.1 s before the apex.",
    kind: 'cmu', file: 'cmu/124/124_05.bvh', fromSec: 1.9, toSec: 4.8, faceSec: [1.1, 1.9],
  },
  {
    name: 'jumpshot_dribble',
    description: 'Dribble into a jumpshot (CMU 06_15): a smaller two-foot jump (0.35 s).',
    kind: 'cmu', file: 'cmu/06/06_15.bvh', fromSec: 1.0, toSec: 4.0, faceSec: [1.3, 2.3],
  },
  {
    name: 'punch_kick',
    description: 'Fighting stance (rear heel up): a right, a left, a right punch, then a right kick (CMU 141_14 "Punch and Kick"). Its sloppy CMU feet need a 7 cm contact line.',
    kind: 'cmu', file: 'cmu/141/141_14.bvh', fps: 60, fromSec: 1.4, toSec: 5.6,
    synth: { gt: { contactM: 0.07 } },
  },
  {
    name: 'shuffle_lateral',
    description: 'Walking sideways to the right (crossover side-steps), a pause, then back to the left (CMU 143_40 "Walk Sideways"), the travel scaled to the room (±0.5 m).',
    kind: 'cmu', file: 'cmu/143/143_40.bvh', fps: 60, fromSec: 6.5, toSec: 11.0,
    room: { travel: 'scale', travelScale: 0.3 },
  },
];

// ── rounding (4 decimals; visibility 2; times 2 in ms) ───────────────────────────────────────────────────────────
const r = (x: number, d = 4) => { const k = 10 ** d; const v = Math.round(x * k) / k; return Object.is(v, -0) ? 0 : v; };
const roundDeep = (v: unknown): unknown =>
  typeof v === 'number' ? (Number.isFinite(v) ? r(v) : v)
    : Array.isArray(v) ? v.map(roundDeep)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)])) : v;
const roundFrame = (f: PoseFixture['frames'][number]) => ({
  t: r(f.t, 2), present: f.present,
  image: f.image.map((l) => ({ x: r(l.x), y: r(l.y), z: r(l.z), v: r(l.v, 2) })),
  ...(f.world ? { world: f.world.map((w) => ({ x: r(w.x), y: r(w.y), z: r(w.z) })) } : {}),
  ...(f.arrive !== undefined ? { arrive: r(f.arrive, 2) } : {}),
});

/** One frame per line and the truth readable at the top, so a diff shows what moved. */
function serialise(fx: PoseFixture): string {
  const top = ['name', 'description', 'source', 'settings', 'summary'] as const;
  const gtKeys = ['contactM', 'jumps', 'flights', 'steps', 'wrist', 'kicks', 'perFrame'] as const;
  return [
    '{',
    ...top.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(roundDeep(fx[k]))},`),
    '  "gt": {',
    gtKeys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(roundDeep(fx.gt[k]))}`).join(',\n'),
    '  },',
    '  "frames": [',
    fx.frames.map((f) => `    ${JSON.stringify(roundFrame(f))}`).join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
}

/** Gravity fitted to the hips over the middle 80% of a flight (least-squares parabola): ~9.8 if the time base is right. */
function gravityFit(clip: JointClip, j: GtJump, t0Ms: number): number {
  const a = (j.takeoff.t - t0Ms) / 1000, b = (j.landing.t - t0Ms) / 1000, m = (b - a) * 0.1;
  const pts: [number, number][] = [];
  for (let i = Math.ceil((a + m) * clip.fps); i <= Math.floor((b - m) * clip.fps); i++) {
    const f = clip.frames[i]; if (!f) continue;
    pts.push([i / clip.fps, (f.LeftUpLeg[1] + f.RightUpLeg[1]) / 2]);
  }
  if (pts.length < 5) return NaN;
  const tm = pts.reduce((s, [t]) => s + t, 0) / pts.length;
  const P = pts.map(([t, y]) => [t - tm, y] as const);
  const S = (p: number) => P.reduce((s, [t]) => s + t ** p, 0), Y = (p: number) => P.reduce((s, [t, y]) => s + t ** p * y, 0);
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const M = [[S(4), S(3), S(2)], [S(3), S(2), S(1)], [S(2), S(1), P.length]];
  const A = det([[Y(2), S(3), S(2)], [Y(1), S(2), S(1)], [Y(0), S(1), P.length]]) / det(M);
  return -2 * A;
}

/** Arms straight out at shoulder height, level: the bind pose a retargeting file opens on. */
function isTPose(j: Record<string, [number, number, number]>): boolean {
  const out = (s: 'Left' | 'Right') => {
    const sh = j[`${s}Arm`], h = j[`${s}Hand`], arm = Math.hypot(...[0, 1, 2].map((k) => j[`${s}ForeArm`][k] - sh[k])) + Math.hypot(...[0, 1, 2].map((k) => h[k] - j[`${s}ForeArm`][k]));
    return Math.abs(h[1] - sh[1]) < 0.15 * arm && Math.hypot(h[0] - sh[0], h[2] - sh[2]) > 0.85 * arm;
  };
  return out('Left') && out('Right');
}

/** A stable seed per fixture, so each one gets its own drops and noise but rebuilds identically. */
const seedOf = (name: string) => [...name].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

// ── build ────────────────────────────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const dry = args.includes('--dry');
if (!dry) mkdirSync(OUT, { recursive: true });

const rows: string[][] = [];
const index: unknown[] = [];
for (const spec of FIXTURES) {
  if (only && !only.has(spec.name)) continue;
  const stream = readBvhStream(join(SRC, spec.file), spec.kind);
  const fps = spec.fps ?? stream.fps;
  // cgspeed's CMU files open on one T-pose frame (for retargeting): it is not motion, and it would drag the travel
  // average at the start of a take, so it is dropped; `from`/`to` stay in the file's own frame numbers
  const skip = spec.kind === 'cmu' && isTPose(stream.frames[0]) ? 1 : 0;
  const motion = stream.frames.slice(skip);
  const from = Math.max(skip, Math.round(spec.fromSec * fps)), to = Math.min(stream.frames.length, Math.round(spec.toSec * fps));
  const roomOpt: RoomOptions = {
    scale: 0.01, toeExtend: TOE[spec.kind], from: from - skip, to: to - skip,
    ...(SHOULDER_SPAN[spec.kind] ? { shoulderSpanM: SHOULDER_SPAN[spec.kind] } : {}),
    ...(spec.faceSec ? { faceRange: [Math.round(spec.faceSec[0] * fps), Math.round(spec.faceSec[1] * fps)] as [number, number] } : {}),
    ...spec.room,
  };
  const { clip, info } = toRoom({ fps, frames: motion }, roomOpt);
  const out = synthesize(clip, { seed: seedOf(spec.name), ...spec.synth, gt: { ...spec.synth?.gt } });
  const { frames, gt, settings } = out;
  const gFit = gt.jumps.map((j) => gravityFit(clip, j, settings.t0));
  const fixture: PoseFixture = {
    name: spec.name,
    description: spec.description,
    source: { file: spec.file, kind: spec.kind, license: LICENSE[spec.kind], fps, from, to },
    settings: { room: { ...roomOpt, info }, synth: settings },
    summary: {
      seconds: (to - from - 1) / fps, frames: frames.length, present: frames.filter((f) => f.present).length,
      jumps: gt.jumps.length, steps: gt.steps.filter((s) => s.down).length, gFit,
    },
    gt, frames,
  };
  const text = serialise(fixture);
  if (!dry) writeFileSync(join(OUT, `${spec.name}.json`), text);
  index.push(roundDeep({
    name: spec.name, description: spec.description, source: `${spec.file} [${from}, ${to}) @ ${+fps.toFixed(2)} fps`,
    seconds: fixture.summary.seconds, frames: frames.length, kb: Math.round(text.length / 1024),
    jumps: gt.jumps.map((j) => ({ takeoff: j.takeoff.frame, apex: j.apex.frame, landing: j.landing.frame, feet: j.feet, foot: j.takeoffFoot, flightMs: j.flightMs, heightFlightM: j.heightFlightM, hipRiseM: j.hipRiseM })),
    flights: gt.flights.length, steps: fixture.summary.steps,
    wrist: Object.fromEntries(['strike', 'reach', 'release', 'punch'].map((k) => [k, gt.wrist.filter((w) => w.kind === k).length])),
    kicks: gt.kicks.length,
  }));
  const jumpCell = (f: (j: GtJump, i: number) => string) => gt.jumps.length ? gt.jumps.map(f).join(' ') : '-';
  rows.push([
    spec.name, `${spec.file.split('/').pop()} ${spec.fromSec}–${spec.toSec}s${spec.fps ? ` @${spec.fps}` : ''}`,
    fixture.summary.seconds.toFixed(1), String(frames.length),
    jumpCell((j) => `${j.takeoff.frame}/${j.apex.frame}/${j.landing.frame}`),
    jumpCell((j) => `${j.feet}${j.feet === 1 ? j.takeoffFoot[0] : ''}`),
    jumpCell((j) => j.flightMs.toFixed(0)),
    jumpCell((j) => `${j.heightFlightM.toFixed(2)}/${j.hipRiseM.toFixed(2)}`),
    jumpCell((_, i) => gFit[i].toFixed(1)),
    `${fixture.summary.steps}`, `${gt.flights.length}`,
    [...['strike', 'reach', 'release', 'punch'].map((k) => gt.wrist.filter((w) => w.kind === k).length), gt.kicks.length].join('/'),
    `${Math.round(text.length / 1024)}`,
  ]);
}
if (!dry && !only) writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1) + '\n');

// the table: take-off / apex / landing are stream frame indices; height = g·t²/8 / hip rise (m)
const head = ['fixture', 'source', 's', 'frames', 'off/apex/land', 'feet', 'flight ms', 'h flight/hip', 'g fit', 'steps', 'flights', 'strike/reach/rel/punch/kick', 'KB'];
const widths = head.map((h, c) => Math.max(h.length, ...rows.map((row) => row[c].length)));
const line = (cells: string[]) => cells.map((x, c) => x.padEnd(widths[c])).join('  ');
console.log(line(head));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const row of rows) console.log(line(row));
if (dry) console.log('(dry run: nothing written)');
