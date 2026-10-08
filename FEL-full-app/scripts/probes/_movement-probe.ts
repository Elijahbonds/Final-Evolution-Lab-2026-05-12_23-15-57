// MOVEMENT POLISH (2026-10-06) — the headless movement probe. Owner: "We need to polish up some of the movements still"
// (running + turning, jumps + dunks, fighting moves, boards + vehicles).
//
// The real hero GLB on a NullEngine, spawned the way CharacterLibrary.spawn does it (the authored clips for the mode's
// scope, neverBindPose, the hoops captures on a hoops body, the arms-down rest pose, FootPlanting on the root), driven
// through the real anim trees with the root moved in code at a fixed 60 fps, and measured on the final pose of every
// rendered frame (after the clips, FootPlanting and any layer the scenario mounts):
//
//   slide    a planted foot's world travel per frame (cm), and as a % of the root's travel — the skate
//   pop      the end effectors' (hands, feet, head) ROOT-LOCAL acceleration, |p(t) − 2p(t−1) + p(t−2)| in cm/frame²,
//            inside a transition window, against the same number on the steady loop (a crossfade kink or a clip
//            snap shows as a spike; a smooth blend does not)
//   jerk     the largest per-bone angular-velocity change between frames (deg/frame²) in the same window
//   turn     the root's yaw step per frame on a stick reversal and the yaw-rate change at its start/end
//   absorb   the hips' drop below the standing height on a landing, for a soft and a hard fall
//   rider    the feet's drift in the deck's own frame (the deck rides the root and rolls into a carve), and the kart driver's hands
//            off the point of the rim they held
//
//   clips    each stepping loop played in place: its LOW foot's velocity along the travel (stance) and its high foot's (swing) — a
//            sign test (a capture, bball_mc_run, is the control); calib: the raw slide per stride reference (the reference = its minimum)
//
//   npx tsx scripts/probes/_movement-probe.ts [scenario…] [--after] [--json out.json]   (from FEL-full-app/)
//   scenarios: clips calib sprint freerun hoops dunk combat skate snow surf kart (default: all)
//   --after   mount the opt-in layers a mode would after this pass (LandingAbsorb, SteerGrip, Free Run's speedMps)
//   debug:    MV_NOFEET=1 (no FootPlanting: the raw clip), MV_TRACE=<segment> [MV_TRACE0=<frame>] (per-frame feet / clips),
//             MV_DEBUG=<sprint segment>, MV_ABS=1 (Free Run's absorb per frame), MV_DECK=1 (the rider's feet in the deck's frame)
//
// Each scenario builds a fresh scene: nothing carries between them. Planted-foot windows span at least one stride cycle.
import { readFileSync, writeFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, TransformNode, Vector3, Matrix } from '@babylonjs/core';
import type { AnimationGroup, Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CharacterAnimator } from '../../lib/babylon/anim/CharacterAnimator';
import { registerAuthoredClips } from '../../lib/babylon/anim/authored';
import { neverBindPose, sanitizeImportedGroups } from '../../lib/babylon/anim/importSanitizer';
import { installOpponentMotion, HERO_CAPTURE } from '../../lib/babylon/anim/opponentMotion';
import { solveArmsDown } from '../../lib/babylon/anim/restPose';
import { applyRestPoseToSkeleton } from '../../lib/babylon/anim/restPoseApply';
import { mountFootPlanting } from '../../lib/babylon/anim/FootPlanting';
import { boneNode } from '../../lib/babylon/anim/boneLookup';
import { locoPick, TurnSlew } from '../../lib/babylon/anim/LocoBus';
import { FreeRunAnimTree, type FreeRunAnimInput } from '../../lib/babylon/anim/freeRunTree';
import { CombatAnimTree, type CombatAnimInput } from '../../lib/babylon/anim/combatTree';
import { BoardAnimTree, type BoardAnimInput } from '../../lib/babylon/anim/boardTree';
import { BasketballAnimTree, type AnimTreeInput } from '../../lib/babylon/anim/basketballTree';
import { buildPoseClip, REF_HIPS_Y } from '../../lib/babylon/anim/poseClip';
import { seatedKeys, WHEEL_RADIUS, STEER_LOCK_RAD } from '../../lib/babylon/anim/authored/seated';
import { slewYaw } from '../../lib/babylon/core/Biomech';
import { RUN_MAX as FREERUN_RUN_MAX } from '../../lib/babylon/core/FreeRunCore';
import { mountLandingAbsorb } from '../../lib/babylon/anim/LandingAbsorb';
import { mountSteerGrip } from '../../lib/babylon/anim/SteerGrip';

const DT = 1 / 60;
// a SIMULATED clock: basketballTree's state dwell reads performance.now(), and a headless frame runs far faster than 1/60 s, so the hoops
// numbers moved run to run with the machine's load (41–103% on one build). Every frame advances this clock by DT instead.
let simMs = 0;
(globalThis.performance as unknown as { now: () => number }).now = () => simMs;
const GLB = () => 'data:model/gltf-binary;base64,' + readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
const AFTER = process.argv.includes('--after');   // mount the opt-in layers a mode would (the "after" column)
const jsonOut = (() => { const i = process.argv.indexOf('--json'); return i > 0 ? process.argv[i + 1] : null; })();

interface Body {
  scene: Scene; body: TransformNode; skeleton: Skeleton; animator: CharacterAnimator;
  node(n: string): TransformNode;
  frame(): void;
  dispose(): void;
}

async function spawn(modeId: string, opts: { hoops?: boolean; feet?: boolean } = {}): Promise<Body> {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => DT * 1000;
  const scene = new Scene(engine);
  scene.useConstantAnimationDeltaTime = true;
  scene.metadata = { felModeId: modeId };
  new FreeCamera('cam', new Vector3(0, 1, -4), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', GLB(), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sanitizeImportedGroups(r.animationGroups);
  const skeleton = r.skeletons[0];
  // the body's root is the loader's __root__, posed the way CharacterLibrary.spawn does it: `root.rotation = new Vector3(0, yaw, 0)` drops
  // the loader's quaternion and `root.scaling.setAll(1)` its (1, 1, −1) flip — so yaw 0 faces +z (FootPlanting's knee pole is root.forward)
  const body = r.meshes[0] as unknown as TransformNode;
  body.rotation = new Vector3(0, 0, 0); body.scaling.setAll(1);
  const animator = new CharacterAnimator(scene, r.animationGroups);
  registerAuthoredClips(animator, scene, skeleton);
  neverBindPose(animator, 'idle_stand');
  if (opts.hoops) installOpponentMotion(animator, scene, skeleton, undefined, HERO_CAPTURE);
  applyRestPoseToSkeleton(skeleton, solveArmsDown(skeleton));
  const fp = opts.feet !== false && !process.env.MV_NOFEET ? mountFootPlanting(scene, r.meshes[1] ?? r.meshes[0], skeleton, { root: body }) : null;
  (globalThis as { __fp?: unknown }).__fp = fp;
  return {
    scene, body, skeleton, animator,
    node: (n) => boneNode(skeleton, n)!,
    frame: () => { simMs += DT * 1000; scene.render(); },
    dispose: () => { scene.dispose(); engine.dispose(); },
  };
}

// ── the recorder ───────────────────────────────────────────────────────────────────────────────────────────────────
const EFFECTORS = ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'Head'] as const;
const FEET = ['LeftFoot', 'RightFoot'] as const;
interface Sample { label: string; t: number; root: Vector3; yaw: number; world: Record<string, Vector3>; local: Record<string, Vector3>; quats: Record<string, Quaternion>; hipsY: number }

class Recorder {
  samples: Sample[] = [];
  constructor(private b: Body) {}
  take(label: string): void {
    const b = this.b;
    b.body.computeWorldMatrix(true);
    const inv = Matrix.Invert(b.body.getWorldMatrix());
    const world: Record<string, Vector3> = {}, local: Record<string, Vector3> = {}, quats: Record<string, Quaternion> = {};
    for (const n of [...EFFECTORS, 'Hips', 'LeftToeBase', 'RightToeBase', 'LeftLeg', 'RightLeg']) { const x = b.node(n); x.computeWorldMatrix(true); world[n] = x.getAbsolutePosition().clone(); local[n] = Vector3.TransformCoordinates(world[n], inv); }
    for (const bone of b.skeleton.bones) { const x = bone.getTransformNode(); if (x) quats[bone.name] = (x.rotationQuaternion ?? Quaternion.FromEulerVector(x.rotation)).clone(); }
    if (process.env.MV_TRACE && label === process.env.MV_TRACE) { const s0 = this.samples.filter((x) => x.label === label).length; if (s0 >= +(process.env.MV_TRACE0 ?? 20) && s0 < +(process.env.MV_TRACE0 ?? 20) + 40) { const w = world; const fp = (globalThis as { __fp?: { debug: { left: { planted: boolean }; right: { planted: boolean } } } | null }).__fp?.debug; console.log(s0, 'root', b.body.position.z.toFixed(3), 'L', w.LeftFoot.y.toFixed(3), w.LeftFoot.z.toFixed(3), fp?.left.planted ? 'P' : '-', 'R', w.RightFoot.y.toFixed(3), w.RightFoot.z.toFixed(3), fp?.right.planted ? 'P' : '-', (b.animator as unknown as { currentName: string }).currentName, b.animator.currentGroup?.speedRatio.toFixed(2), b.scene.animationGroups.filter((g) => g.isPlaying).map((g) => `${g.name}:${CharacterAnimator.weightOf(g).toFixed(2)}`).join(' ')); } }
    this.samples.push({ label, t: this.samples.length * DT, root: b.body.getAbsolutePosition().clone(), yaw: b.body.rotation.y, world, local, quats, hipsY: world.Hips.y - b.body.getAbsolutePosition().y, fp: (() => { const d = (globalThis as { __fp?: { debug: { left: { planted: boolean; pin: { z: number } }; right: { planted: boolean; pin: { z: number } } } } | null }).__fp?.debug; return d ? `${d.left.planted ? 'P' + d.left.pin.z.toFixed(2) : '-----'} ${d.right.planted ? 'P' + d.right.pin.z.toFixed(2) : '-----'}` : ''; })() } as Sample);
  }
}

const angVel = (a: Quaternion, b: Quaternion): Vector3 => {
  // the rotation from a to b as an axis × angle vector (radians), in a's parent space
  const d = b.multiply(Quaternion.Inverse(a)); if (d.w < 0) { d.x = -d.x; d.y = -d.y; d.z = -d.z; d.w = -d.w; }
  const s = Math.hypot(d.x, d.y, d.z); if (s < 1e-9) return Vector3.Zero();
  const ang = 2 * Math.atan2(s, d.w); return new Vector3(d.x / s * ang, d.y / s * ang, d.z / s * ang);
};

/** Pops in [i0, i1): the end effectors' root-local accel (cm/frame²) and the largest per-bone angular-velocity change (deg/frame²). */
function pops(S: Sample[], i0: number, i1: number): { accel: number; accelAt: string; jerk: number; jerkAt: string } {
  let accel = 0, accelAt = '', jerk = 0, jerkAt = '';
  for (let i = Math.max(2, i0); i < Math.min(S.length, i1); i++) {
    for (const e of EFFECTORS) {
      const a = S[i].local[e].subtract(S[i - 1].local[e].scale(2)).add(S[i - 2].local[e]).length() * 100;
      if (a > accel) { accel = a; accelAt = `${e}@${S[i].label}`; }
    }
    for (const k of Object.keys(S[i].quats)) {
      const w1 = angVel(S[i - 1].quats[k], S[i].quats[k]), w0 = angVel(S[i - 2].quats[k], S[i - 1].quats[k]);
      const j = w1.subtract(w0).length() * 180 / Math.PI;
      if (j > jerk) { jerk = j; jerkAt = `${k}@${S[i].label}`; }
    }
  }
  return { accel: +accel.toFixed(2), accelAt, jerk: +jerk.toFixed(1), jerkAt };
}

/** The planted foot's world travel per frame in [i0, i1): a foot is planted while it is the lower foot and within `band` of the floor
 *  both feet walk on (the lowest either reaches in the window; windows span at least a stride cycle). cm/frame mean and p90, and the mean as % of the root's step. */
function slide(S: Sample[], i0: number, i1: number, band = 0.01): { mean: number; p90: number; pct: number; frames: number } {
  const steps: number[] = []; let rootSum = 0;
  let floor = Infinity; for (let i = i0; i < i1; i++) for (const f of FEET) floor = Math.min(floor, S[i].world[f].y);   // the floor both feet walk on
  for (const f of FEET) {
    const other = f === 'LeftFoot' ? 'RightFoot' : 'LeftFoot';
    for (let i = Math.max(1, i0); i < i1; i++) {
      const down = (k: number) => S[k].world[f].y <= floor + band && S[k].world[f].y <= S[k].world[other].y + 0.005;
      if (!down(i) || !down(i - 1)) continue;
      const d = S[i].world[f].subtract(S[i - 1].world[f]); steps.push(Math.hypot(d.x, d.z) * 100);
      const r = S[i].root.subtract(S[i - 1].root); rootSum += Math.hypot(r.x, r.z) * 100;
    }
  }
  if (!steps.length) return { mean: 0, p90: 0, pct: 0, frames: 0 };
  const sorted = [...steps].sort((a, b) => a - b);
  const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
  return { mean: +mean.toFixed(2), p90: +sorted[Math.floor(sorted.length * 0.9)].toFixed(2), pct: rootSum > 0 ? +(100 * mean / (rootSum / steps.length)).toFixed(1) : 0, frames: steps.length };
}

const idx = (S: Sample[], label: string) => S.findIndex((s) => s.label === label);
const rows: { cat: string; scenario: string; metric: string; value: string }[] = [];
const row = (cat: string, scenario: string, metric: string, value: unknown) => { rows.push({ cat, scenario, metric, value: typeof value === 'string' ? value : JSON.stringify(value) }); };

// ── RUNNING + TURNING ──────────────────────────────────────────────────────────────────────────────────────────────
/** Sprint's loco: LocoBus.locoPick on the speed every frame, its loop at the stride rate (SprintMode.ts:330). */
async function runSprint(): Promise<void> {
  const b = await spawn('sprint'); const rec = new Recorder(b);
  let speed = 0, z = 0;
  const segs: [string, number, (t: number) => number][] = [
    ['idle', 0.6, () => 0], ['accel', 2.4, (t) => 8 * t / 2.4], ['sprint', 1.5, () => 8], ['decel', 1.4, (t) => 8 * (1 - t / 1.4)], ['stop', 0.8, () => 0],
    ['walk', 2.6, () => 1.4], ['jog', 1.5, () => 3.4],
  ];
  for (const [label, dur, f] of segs) {
    for (let t = 0; t < dur - 1e-9; t += DT) {
      speed = f(t); z += speed * DT; b.body.position.z = z;
      const l = locoPick({ speed });
      b.animator.play(l.clip, { loop: true }); b.animator.setPlaybackScale(l.clip, l.rate);
      b.frame(); rec.take(label);
    }
  }
  const S = rec.samples;
  if (process.env.MV_DEBUG) { const i0 = idx(S, process.env.MV_DEBUG) + 20; for (let i = i0; i < i0 + 40; i++) { const s = S[i]; console.log(i, (s as unknown as { fp: string }).fp, s.root.z.toFixed(3), 'L', s.world.LeftFoot.y.toFixed(3), s.world.LeftFoot.z.toFixed(3), 'R', s.world.RightFoot.y.toFixed(3), s.world.RightFoot.z.toFixed(3), 'hips', s.hipsY.toFixed(3), 'toeL-footL z', (s.world.LeftToeBase.z - s.world.LeftFoot.z).toFixed(3), 'kneeR z-rel', (s.world.RightLeg.z - s.root.z).toFixed(3), 'footR z-rel', (s.world.RightFoot.z - s.root.z).toFixed(3)); } }
  for (const seg of ['sprint', 'walk', 'jog']) { const i0 = idx(S, seg) + 20, i1 = i0 + (seg === 'walk' ? 130 : 60); row('running', `sprint ${seg} (steady)`, 'slide cm/f mean|p90|%root', slide(S, i0, i1)); row('running', `sprint ${seg} (steady)`, 'pop', pops(S, i0, i1)); }
  row('running', 'sprint accel 0→8 m/s', 'slide', slide(S, idx(S, 'accel'), idx(S, 'sprint')));
  row('running', 'sprint accel 0→8 m/s', 'pop', pops(S, idx(S, 'accel'), idx(S, 'sprint')));
  row('running', 'sprint decel 8→0 + stop', 'pop', pops(S, idx(S, 'decel'), idx(S, 'walk')));
  row('running', 'sprint decel 8→0 + stop', 'slide', slide(S, idx(S, 'decel'), idx(S, 'walk')));
  b.dispose();
}

/** Free Run: the tree on speed01 = speed / RUN_MAX (FreeRunMode.ts:365), no stride matching. */
async function runFreeRun(): Promise<void> {
  const b = await spawn('freerun'); const rec = new Recorder(b);
  const tree = new FreeRunAnimTree(b.animator);
  const absorbH = AFTER ? mountLandingAbsorb(b.scene, b.skeleton, b.body) : null;   // auto: the root's own touchdown
  const RUN_MAX = FREERUN_RUN_MAX;   // FreeRunCore.RUN_MAX (FreeRunMode.ts:365 divides by it)
  const base: FreeRunAnimInput = { speed01: 0, airborne: false, jumpBeat: false, tricking: false, wallrun: false, sliding: false, landing: 'none', down: false };
  let z = 0, y = 0, vy = 0;
  const step = (label: string, speed: number, extra: Partial<FreeRunAnimInput> = {}) => {
    z += speed * DT; b.body.position.set(0, y, z);
    tree.update({ ...base, speed01: Math.min(1, speed / RUN_MAX), ...(AFTER ? { speedMps: speed } : {}), ...extra } as FreeRunAnimInput);
    b.frame(); rec.take(label);
    if (process.env.MV_ABS && label.startsWith('land')) console.log(label, y.toFixed(3), absorbH?.drop.toFixed(3), rec.samples[rec.samples.length - 1].hipsY.toFixed(3));
  };
  for (let t = 0; t < 0.5; t += DT) step('idle', 0);
  for (let t = 0; t < 2; t += DT) step('accel', 7 * t / 2);
  for (let t = 0; t < 1.2; t += DT) step('run7', 7);
  for (let t = 0; t < 1.2; t += DT) step('run4.6', 4.6);   // speed01 0.51: the run clip, at 4.6 m/s
  for (let t = 0; t < 2.6; t += DT) step('walk1.5', 1.5);
  // the jump: a soft drop (0.5 m apex), then a hard one (1.6 m apex) — touchdown speeds 3.1 / 5.6 m/s
  for (const [tag, v0] of [['soft', 3.13], ['hard', 5.6]] as const) {
    for (let t = 0; t < 0.6; t += DT) step(`pre_${tag}`, 6);
    vy = v0; y = 0; let tAir = 0;
    while (true) { vy -= 9.81 * DT; y = Math.max(0, y + vy * DT); if (y <= 0) break; step(`air_${tag}`, 6, { airborne: true, jumpBeat: tAir < 0.42 }); tAir += DT; }   // FreeRunMode JUMP_BEAT_SEC
    y = 0;
    for (let t = 0; t < 0.6; t += DT) step(`land_${tag}`, 6, { landing: 'clean' });
    for (let t = 0; t < 0.6; t += DT) step(`post_${tag}`, 6);
  }
  const S = rec.samples;
  const run7 = idx(S, 'run7') + 15, run46 = idx(S, 'run4.6') + 15, walk = idx(S, 'walk1.5') + 15;
  row('running', 'freerun run 7 m/s', 'slide', slide(S, run7, run7 + 50));
  row('running', 'freerun run 4.6 m/s', 'slide', slide(S, run46, run46 + 50));
  row('running', 'freerun walk 1.5 m/s', 'slide', slide(S, walk, walk + 130));
  row('running', 'freerun idle→run accel', 'pop', pops(S, idx(S, 'accel'), idx(S, 'run7')));
  const stand = S.slice(idx(S, 'pre_soft'), idx(S, 'air_soft')).reduce((a, s) => a + s.hipsY, 0) / (idx(S, 'air_soft') - idx(S, 'pre_soft'));
  for (const tag of ['soft', 'hard']) {
    const i0 = idx(S, `land_${tag}`), i1 = idx(S, `post_${tag}`) + 30;
    const minH = Math.min(...S.slice(i0, i1).map((s) => s.hipsY));
    row('jumps', `freerun land (${tag})`, 'hip drop cm', +((stand - minH) * 100).toFixed(1));
    row('jumps', `freerun take-off/land (${tag})`, 'pop', pops(S, idx(S, `air_${tag}`) - 3, i1));
  }
  b.dispose();
}

/** 1v1 / 3v3: the ball-less hoops run (bball_mc_run) and the dribbling drive, on the captured set, with a stick reversal turned
 *  at the hoops slew (FACE_RATE 10 rad/s, OneVOneMode.ts:278). */
async function runHoops(): Promise<void> {
  const b = await spawn('onevone', { hoops: true }); const rec = new Recorder(b);
  const tree = new BasketballAnimTree(b.animator);
  const base: AnimTreeInput = { speed01: 0, crossover: false, nearestDefender: 9, hasBall: false, shooting: false, dunking: false, driving: false, defending: false, bracing: false, staggered: false };
  let x = 0, z = 0, yaw = 0, prevYaw = 0, prevRate = 0, maxStep = 0, maxRateJump = 0;
  const FACE_RATE = 10;
  const step = (label: string, vx: number, vz: number, extra: Partial<AnimTreeInput> = {}) => {
    const sp = Math.hypot(vx, vz);
    x += vx * DT; z += vz * DT;
    const want = Math.atan2(vx, vz);   // the yaw that faces the travel (the modes' rule)
    if (sp > 0.3) yaw = slewYaw(yaw, want, FACE_RATE, DT);
    b.body.position.set(x, 0, z); b.body.rotation.y = yaw;
    tree.update({ ...base, speed01: Math.min(1, sp / 6.4), speedMps: sp, ...extra });
    b.frame(); rec.take(label);
    if (label === 'reverse') {
      const d = Math.abs(Math.atan2(Math.sin(yaw - prevYaw), Math.cos(yaw - prevYaw))); maxStep = Math.max(maxStep, d);
      maxRateJump = Math.max(maxRateJump, Math.abs(d - prevRate)); prevRate = d;
    }
    prevYaw = yaw;
  };
  for (let t = 0; t < 0.5; t += DT) step('idle', 0, 0);
  for (let t = 0; t < 1.5; t += DT) step('run', 0, 4.69 * Math.min(1, t / 0.6));
  for (let t = 0; t < 1.0; t += DT) step('run_steady', 0, 4.69);
  prevRate = 0;
  for (let t = 0; t < 1.2; t += DT) { const k = Math.min(1, t / 0.5); step('reverse', 0, 4.69 * (1 - 2 * k)); }   // the stick reverses: brake through 0, run back
  for (let t = 0; t < 1.0; t += DT) step('back_steady', 0, -4.69);
  for (let t = 0; t < 1.2; t += DT) step('drive', 0, -6.0, { hasBall: true, driving: true });
  const S = rec.samples;
  const rs = idx(S, 'run_steady');
  row('running', '1v1 run 4.69 m/s (bball_mc_run)', 'slide', slide(S, rs, rs + 55));
  row('running', '1v1 drive 6 m/s (ball)', 'slide', slide(S, idx(S, 'drive') + 15, idx(S, 'drive') + 70));
  row('running', '1v1 idle→run start', 'pop', pops(S, idx(S, 'run'), idx(S, 'run') + 40));
  row('turning', '1v1 180° stick reversal (FACE_RATE 10)', 'yaw step max deg/f | rate jump deg/f²', { step: +(maxStep * 180 / Math.PI).toFixed(1), rateJump: +(maxRateJump * 180 / Math.PI).toFixed(1) });
  row('turning', '1v1 180° stick reversal', 'slide', slide(S, idx(S, 'reverse'), idx(S, 'back_steady')));
  if (AFTER) {
    // the opt-in TurnSlew (routed: the modes own their turn rates) at the same top rate, 60 rad/s² — the same reversal, yaw only
    const t = new TurnSlew(); let y = 0, prev = 0, step = 0, jump = 0, frames = 0;
    for (let i = 0; i < 120; i++) { const n = t.step(y, Math.PI - 1e-3, DT, FACE_RATE, 60); const st = Math.abs(n - y); step = Math.max(step, st); jump = Math.max(jump, Math.abs(st - prev)); prev = st; y = n; if (st > 1e-7) frames = i + 1; }
    row('turning', '1v1 180° reversal through TurnSlew (opt-in, routed)', 'yaw step max deg/f | rate jump deg/f² | sec', { step: +(step * 180 / Math.PI).toFixed(1), rateJump: +(jump * 180 / Math.PI).toFixed(1), sec: +(frames * DT).toFixed(2) });
  }
  row('turning', '1v1 180° stick reversal', 'pop', pops(S, idx(S, 'reverse'), idx(S, 'back_steady')));
  b.dispose();
}

// ── JUMPS + DUNKS ──────────────────────────────────────────────────────────────────────────────────────────────────
/** The dunk's own landing clips (dunk_land_absorb; the hoops land) played on a body falling from a rim hang (1.0 m, 4.4 m/s) and a
 *  standing hop (0.3 m, 2.4 m/s): the absorb a clip gives does not know the fall. */
async function runDunkLand(): Promise<void> {
  for (const [tag, v] of [['hop 2.4 m/s', 2.4], ['rim drop 4.4 m/s', 4.4]] as const) {
    const b = await spawn('dunk', { hoops: true }); const rec = new Recorder(b);
    for (let t = 0; t < 0.5; t += DT) { b.animator.play('idle_stand', { loop: true }); b.frame(); rec.take('stand'); }
    const stand = rec.samples.reduce((a, s) => a + s.hipsY, 0) / rec.samples.length;
    b.animator.play('dunk_land_absorb', { fadeSec: 0.06 });
    if (AFTER) mountLandingAbsorb(b.scene, b.skeleton, b.body, { auto: false }).impact(v);   // DunkMode knows its touchdown speed
    for (let t = 0; t < 0.9; t += DT) { b.frame(); rec.take('land'); }
    const S = rec.samples; const i0 = idx(S, 'land');
    row('jumps', `dunk_land_absorb (${tag})`, 'hip drop cm', +((stand - Math.min(...S.slice(i0).map((s) => s.hipsY))) * 100).toFixed(1));
    row('jumps', `dunk_land_absorb (${tag})`, 'pop', pops(S, i0 - 2, S.length));
    b.dispose();
  }
}

// ── FIGHTING ───────────────────────────────────────────────────────────────────────────────────────────────────────
async function runCombat(): Promise<void> {
  const b = await spawn('karate-vs'); const rec = new Recorder(b);
  const tree = new CombatAnimTree(b.animator);
  const IN: CombatAnimInput = { speed01: 0, dashing: false, hasWeapon: false, striking: null, blocking: false, parryFlash: false, guardImpactFlash: false, hitBy: null, down: false, out: false, ulting: false };
  const step = (label: string, i: Partial<CombatAnimInput> = {}, n = 1) => { for (let k = 0; k < n; k++) { tree.update({ ...IN, ...i }); b.frame(); rec.take(label); } };
  const marks: [string, number][] = [];
  const mark = (s: string) => marks.push([s, rec.samples.length]);
  step('stance', {}, 40);
  for (const w of ['light', 'medium', 'heavy'] as const) {
    // the mode holds the beat for its react window (KarateVSMode REACT_SEC 0.32 s), then clears it
    mark(`hit ${w}`); step(`hit_${w}`, { hitBy: w }, Math.round(0.32 / DT));
    tree.clearBeat('react_light', 'react_medium', 'react_heavy'); step(`recover_${w}`, {}, 30);
  }
  mark('strike'); step('strike', { striking: 'light' }, 1); { let n = 0; while (tree.striking && n++ < 90) step('strike', { striking: 'light' }); } step('post_strike', {}, 30);
  mark('dodge'); step('dodge', { dodging: true }, 24); step('post_dodge', {}, 30);
  mark('knockdown'); step('down', { down: true }, 80); mark('get_up'); step('rise', {}, 90);
  const S = rec.samples;
  const steady = pops(S, 10, 40);
  row('fighting', 'karate stance (steady)', 'pop', steady);
  for (let k = 0; k < marks.length; k++) {
    const [name, i0] = marks[k]; const i1 = Math.min(S.length, i0 + 30);
    row('fighting', `karate ${name} (first 0.5 s)`, 'pop', pops(S, i0 - 2, i1));
  }
  // the head's world excursion on each hit, a readability check (a smaller flinch must still read)
  for (const w of ['light', 'medium', 'heavy']) {
    const i0 = idx(S, `hit_${w}`), i1 = idx(S, `recover_${w}`);
    const h0 = S[i0 - 1].local.Head; let ex = 0, back = -1; for (let i = i0; i < i1 + 20; i++) { const d = S[i].local.Head.subtract(h0).length(); ex = Math.max(ex, d); }
    for (let i = i0 + 3; i < i1 + 30 && back < 0; i++) if (S[i].local.Head.subtract(h0).length() < ex * 0.2) back = i - i0;
    row('fighting', `karate hit ${w}`, 'head excursion cm | frames until back in guard', { cm: +(ex * 100).toFixed(1), frames: back });
  }
  b.dispose();
}

// ── BOARDS + VEHICLES ──────────────────────────────────────────────────────────────────────────────────────────────
async function runBoard(modeId: string): Promise<void> {
  const b = await spawn(modeId, { feet: !process.env.MV_BOARD_NOFEET });   // every spawned body carries FootPlanting (CharacterLibrary.spawn), riders too
  const rec = new Recorder(b);
  const tree = new BoardAnimTree(b.animator);
  // the deck the way BoardSync poses it: root-local, 3 cm up, rolled −lean × 0.22
  const deck = new TransformNode('deck', b.scene); deck.parent = b.body; deck.position.set(0, 0.03, 0);

  const IN: BoardAnimInput = { speed01: 0.6, pushing: false, lean: 0, airborne: false, grabHeld: false, flipping: false, spinning: false, grinding: false, manual: false, landing: 'none', bailing: false };
  let z = 0;
  const step = (label: string, i: Partial<BoardAnimInput> = {}, n = 1) => { for (let k = 0; k < n; k++) { z += 6 * DT; b.body.position.z = z; deck.rotation.z = -(i.lean ?? 0) * 0.22; tree.update({ ...IN, ...i }); b.frame(); rec.take(label); onDeck.push(deckLocal()); } };
  const onDeck: Record<string, Vector3>[] = [];
  const deckLocal = () => { deck.computeWorldMatrix(true); const inv = Matrix.Invert(deck.getWorldMatrix()); const o: Record<string, Vector3> = {}; for (const f of FEET) { const n = b.node(f); n.computeWorldMatrix(true); o[f] = Vector3.TransformCoordinates(n.getAbsolutePosition(), inv); } return o; };
  step('cruise', {}, 50);
  for (let k = 0; k < 40; k++) step('carve_l', { lean: -Math.min(1, k / 10) });
  for (let k = 0; k < 40; k++) step('carve_r', { lean: Math.min(1, k / 10) });
  step('recenter', {}, 30);
  step('pop', { popping: true }, 12); step('air', { airborne: true }, 36); step('land', { landing: 'clean' }, 30); step('cruise2', {}, 40);
  const S = rec.samples;
  // feet vs the deck, in the DECK's frame (it rides the root and rolls into a carve, BoardSync)
  const grounded = onDeck.filter((_, i) => i >= 30 && !S[i].label.startsWith('air') && S[i].label !== 'pop');   // (the first half second is the spawn settling out of its bind pose)
  const range = (f: string) => { const xs = grounded.map((s) => s[f]); const lo = xs.reduce((a, v) => Vector3.Minimize(a, v)); const hi = xs.reduce((a, v) => Vector3.Maximize(a, v)); return +(Math.hypot(hi.x - lo.x, hi.z - lo.z) * 100).toFixed(1); };
  row('boards', `${modeId} feet on deck (grounded states)`, 'planar drift range cm L|R', { L: range('LeftFoot'), R: range('RightFoot') });
  if (process.env.MV_DECK) onDeck.forEach((d, i) => { if (i % 4 === 0) console.log(i, S[i].label, d.LeftFoot.toString(), d.RightFoot.toString()); });
  const ok = (i: number) => i >= 30 && !S[i].label.startsWith('air') && S[i].label !== 'pop';
  let jump = 0; for (let i = 1; i < S.length; i++) if (ok(i) && ok(i - 1)) for (const f of FEET) jump = Math.max(jump, onDeck[i][f].subtract(onDeck[i - 1][f]).length() * 100);
  row('boards', `${modeId} feet on deck`, 'max foot step on deck cm/f', +jump.toFixed(2));
  for (const seg of ['carve_l', 'carve_r', 'recenter', 'land']) row('boards', `${modeId} → ${seg}`, 'pop', pops(S, idx(S, seg) - 2, idx(S, seg) + 25));
  const cruise = S.slice(10, 50).reduce((a, s) => a + s.hipsY, 0) / 40;
  row('boards', `${modeId} land`, 'hip drop cm', +((cruise - Math.min(...S.slice(idx(S, 'land'), idx(S, 'cruise2')).map((s) => s.hipsY))) * 100).toFixed(1));
  b.dispose();
}

/** Velocity Kart's driver: the seated pose in the kart's frame (VelocityKartMode.ts:1020-1027) and the wheel on its tilted hub
 *  (:375-383) turned to full lock by the mode's own damping; the hands' distance from where they gripped the rim at centre. */
async function runKart(): Promise<void> {
  const b = await spawn('velocitykart', { feet: false });
  const kart = new TransformNode('kart', b.scene);
  b.body.parent = kart; b.body.scaling.setAll(0.92); b.body.position.set(0, -0.08 - REF_HIPS_Y * 0.92, -0.30);
  b.animator.park();
  const seat = buildPoseClip(b.scene, b.skeleton, 'kart_seated', 0.5, seatedKeys())!;
  seat.start(true, 1, 0, 0.5, false);
  const hub = new TransformNode('hub', b.scene); hub.parent = kart; hub.position.set(0, 0.28, -0.02); hub.rotation.x = (90 - 22) * Math.PI / 180;
  const wheel = new TransformNode('wheel', b.scene); wheel.parent = hub;
  if (AFTER) mountSteerGrip(b.scene, b.skeleton, wheel);
  for (let i = 0; i < 20; i++) b.frame();
  const hand = (s: 'Left' | 'Right') => { const n = b.node(`${s}Hand`); n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
  wheel.computeWorldMatrix(true);
  const inv = Matrix.Invert(wheel.getWorldMatrix());
  const grip = { Left: Vector3.TransformCoordinates(hand('Left'), inv), Right: Vector3.TransformCoordinates(hand('Right'), inv) };
  let worst = 0, lean = 0;
  for (let f = 0; f < 90; f++) {
    const steer = f < 45 ? 1 : -1;
    wheel.rotation.y += (-steer * STEER_LOCK_RAD - wheel.rotation.y) * Math.min(1, 8 * DT);
    lean += (steer * 8 * Math.PI / 180 - lean) * Math.min(1, 8 * DT); b.body.rotation.z = lean;
    b.frame(); wheel.computeWorldMatrix(true);
    for (const s of ['Left', 'Right'] as const) worst = Math.max(worst, Vector3.Distance(hand(s), Vector3.TransformCoordinates(grip[s], wheel.getWorldMatrix())));
  }
  row('vehicles', `kart driver, full lock both ways (rim r ${WHEEL_RADIUS} m)`, 'hand off its rim grip, max cm', +(worst * 100).toFixed(1));
  b.dispose();
}

// ── THE CLIP AUDIT: which way does each loco loop's planted foot sweep? ─────────────────────────────────────────────
/** Each loop played in place for two cycles at rate 1 on a still root: per foot, the velocity along the clip's travel axis RELATIVE to the
 *  root, split by height — the lower half of the foot's heights is its stance. A loop that steps the body forward sweeps its stance foot
 *  BACKWARD (negative) and swings it forward in the air; the stance sweep's speed is the ground speed the clip covers at rate 1 (the stride
 *  reference). A positive stance sweep is a MOONWALK: the low foot races forward and the high foot drifts back. */
async function clipAudit(): Promise<void> {
  const cases: [string, string, [number, number], boolean?][] = [
    ['sprint', 'walk', [0, 1]], ['sprint', 'run', [0, 1]], ['sprint', 'strafe_left', [-1, 0]], ['sprint', 'strafe_right', [1, 0]],
    ['karate-vs', 'karate_guard_step', [0, 1]], ['karate-vs', 'karate_shuffle_left', [-1, 0]], ['karate-vs', 'karate_shuffle_right', [1, 0]],
    ['football', 'football_carry_run', [0, 1]], ['onevone', 'bball_mc_run', [0, 1], true], ['onevone', 'bball_dribble_jog', [0, 1], true],
  ];
  for (const [mode, clip, [ax, az], hoops] of cases) {
    const b = await spawn(mode, { feet: false, hoops });
    const g = b.animator.play(clip, { loop: true, fadeSec: 0 });
    if (!g) { row('clips', clip, 'stance sweep m/s', 'missing'); b.dispose(); continue; }
    const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 60; const dur = (g.to - g.from) / fps;
    const n = Math.round(2 * dur / DT); const tr: Record<string, { h: number; a: number }[]> = { LeftFoot: [], RightFoot: [] };
    for (let i = 0; i < n; i++) { b.frame(); for (const f of FEET) { const x = b.node(f); x.computeWorldMatrix(true); const p = x.getAbsolutePosition(); tr[f].push({ h: p.y, a: p.x * ax + p.z * az }); } }
    const out: Record<string, number> = {};
    for (const f of FEET) {
      const hs = tr[f].map((s) => s.h).sort((a, b2) => a - b2); const mid = hs[Math.floor(hs.length * 0.4)];
      let st = 0, ns = 0, sw = 0, nw = 0;
      for (let i = 1; i < tr[f].length; i++) { const v = (tr[f][i].a - tr[f][i - 1].a) / DT; if (tr[f][i].h <= mid) { st += v; ns++; } else { sw += v; nw++; } }
      out[f === 'LeftFoot' ? 'stanceL' : 'stanceR'] = +(st / Math.max(1, ns)).toFixed(2);
      out[f === 'LeftFoot' ? 'swingL' : 'swingR'] = +(sw / Math.max(1, nw)).toFixed(2);
      out[f === 'LeftFoot' ? 'liftL_cm' : 'liftR_cm'] = +((hs[hs.length - 1] - hs[0]) * 100).toFixed(1);
      out[f === 'LeftFoot' ? 'lowL_cm' : 'lowR_cm'] = +(hs[0] * 100).toFixed(1);
    }
    row('clips', `${clip} (${mode}, ${dur.toFixed(2)} s)`, 'stance|swing sweep m/s, lift cm', out);
    b.dispose();
  }
}

/** The stride reference sweep: each loop on a root moving at `speed`, its rate `speed / ref`, no planter — the raw clip's slide per ref.
 *  The ref with the least slide is the ground speed the clip covers at rate 1. */
async function strideCalib(): Promise<void> {
  const cases: [string, string, number, number[]][] = [
    ['sprint', 'walk', 1.4, [0.9, 1.1, 1.3, 1.5, 1.7, 1.9, 2.1]],
    ['sprint', 'run', 4.5, [2.8, 3.2, 3.6, 4.0, 4.4, 4.8, 5.2, 5.6]],
    ['karate-vs', 'karate_guard_step', 0.9, [0.9, 1.1, 1.2, 1.3, 1.4, 1.6]],
  ];
  for (const [mode, clip, speed, refs] of cases) {
    const out: Record<string, number> = {};
    for (const ref of refs) {
      const b = await spawn(mode, { feet: false }); const rec = new Recorder(b);
      b.animator.play(clip, { loop: true, fadeSec: 0 }); b.animator.setPlaybackScale(clip, speed / ref);
      let z = 0; for (let i = 0; i < 150; i++) { z += speed * DT; b.body.position.z = z; b.frame(); rec.take('x'); }
      out[ref.toFixed(1)] = slide(rec.samples, 30, 150, 0.008).pct; b.dispose();
    }
    row('calib', `${clip} at ${speed} m/s, rate = speed/ref`, 'raw slide %root per ref', out);
  }
}

const which = process.argv.slice(2).filter((a) => !a.startsWith('--') && a !== jsonOut);
const ALL: Record<string, () => Promise<void> | void> = { clips: clipAudit, calib: strideCalib, sprint: runSprint, freerun: runFreeRun, hoops: runHoops, dunk: runDunkLand, combat: runCombat, skate: () => runBoard('skateboard'), snow: () => runBoard('snowboard'), surf: () => runBoard('surf'), kart: runKart };
async function main(): Promise<void> {
for (const [k, f] of Object.entries(ALL)) {
  if (which.length && !which.includes(k)) continue;
  try { await f(); } catch (e) { row('error', k, 'threw', String((e as Error)?.stack ?? e).slice(0, 300)); }
}
console.log(`\n| cat | scenario | metric | ${AFTER ? 'after' : 'before'} |\n|---|---|---|---|`);
for (const r of rows) console.log(`| ${r.cat} | ${r.scenario} | ${r.metric} | ${r.value} |`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
}
void main();
void ({} as AnimationGroup);
