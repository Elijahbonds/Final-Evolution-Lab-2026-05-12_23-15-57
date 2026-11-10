// hoops-p05 (phase 5, "the ball lives in the hand"): THE DRIBBLE BENCH — the hero's dribble, headless. The browser rig is the judge; this
// is the workbench for the gate that can be read without a game: at the top of each bounce, is the palm on the ball?
//
// Builds the shipped hero (public/models/fel-hero.glb) with a 1v1 hero's clips, tree and hoops ball carry (mountBallCarry hoops: true, the
// mode's own calls), a virtual 60 fps clock, and dribbles at a fixed ground speed in a straight line: standing, a walk, a jog, a sprint.
// NOT built: the posture layer, the look layer, the arm ease, the defender (so no protect stance), the handle moves.
//
// Prints, per speed, by the rig's own measure (page.js analyse): the PALM is the hand bone + 8 cm along forearm -> hand; the gap is the
// palm to the ball's surface (centre less 12 cm). At each top of the bounce: the gap's median / p90 and the share within 5 cm (the
// gate: >= 90 %); the hand bone to the ball's centre (the older "apex" read); and the ball's most travel in a frame.
//
//   npx tsx scripts/probes/hoops-gap/ball-bench.mts [--speeds 0,1.6,3.7,6.4] [--sec 6] [--list]
//   env: FEEL='{"knob.id": value}'
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let vt = 1000; const DT = 1 / 60;
Object.defineProperty(globalThis, 'performance', { value: { now: () => vt }, configurable: true });
const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const BJS = await import('@babylonjs/core');
await import('@babylonjs/loaders/glTF/index.js');
const un = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { setFeelUser, setFeelSession, setFeelOverride } = un(await import(APP + '/lib/feel-panel/feel.ts'));
setFeelUser(true); setFeelSession(null);
if (process.env.FEEL) for (const [k, v] of Object.entries(JSON.parse(process.env.FEEL))) setFeelOverride(k, Number(v));
const { CharacterAnimator } = un(await import(APP + '/lib/babylon/anim/CharacterAnimator.ts'));
const { registerAuthoredClips } = un(await import(APP + '/lib/babylon/anim/authored/index.ts'));
const { sanitizeImportedGroups, neverBindPose } = un(await import(APP + '/lib/babylon/anim/importSanitizer.ts'));
const { installSafePlay } = un(await import(APP + '/lib/babylon/anim/clipRegistry.ts'));
const { installOpponentMotion, HERO_CAPTURE } = un(await import(APP + '/lib/babylon/anim/opponentMotion.ts'));
const { rightHandHoops, leftDribbleTwins, rightHandBall, hoopsHand } = un(await import(APP + '/lib/babylon/anim/hoopsHand.ts'));
const { solveArmsDown } = un(await import(APP + '/lib/babylon/anim/restPose.ts'));
const { applyRestPoseToSkeleton } = un(await import(APP + '/lib/babylon/anim/restPoseApply.ts'));
const { mountFootPlanting } = un(await import(APP + '/lib/babylon/anim/FootPlanting.ts'));
const { mountBallCarry } = un(await import(APP + '/lib/babylon/anim/ballCarry.ts'));
const { attachBallToHand } = un(await import(APP + '/lib/babylon/anim/ballRig.ts'));
const { boneNode } = un(await import(APP + '/lib/babylon/anim/boneLookup.ts'));
const BT = un(await import(APP + '/lib/babylon/anim/basketballTree.ts'));
const { NullEngine, Scene, FreeCamera, Vector3, SceneLoader, MeshBuilder } = BJS;

const SPEEDS = arg('--speeds', '0,1.6,3.7,6.4').split(',').map(Number);
// --launch: the ball HELD (the carry inactive) for 1 s standing, then the dribble starts and the body accelerates to the speed at
// LAUNCH_ACCEL m/s^2 (the hoops sprint's cap, 26) — the rig's off-palm first top (1v1 / 3v3 seed 7, frame 74: 11-13 cm) is a launch
const LAUNCH = process.argv.includes('--launch'); const LAUNCH_ACCEL = 26;
const SEC = Number(arg('--sec', '6'));
const TOP_MPS = 6.4, PALM_M = 0.08, BALL_R = 0.12;
const pct = (a: number[], p: number) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const r1 = (x: number) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : '-');

console.log('m/s   state            bounces  palm gap at the top: p50   p90  within 5 cm %  | hand bone to centre p50  p90 | ball path p99 cm/f  over 15 cm');
for (const speed of SPEEDS) {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => DT * 1000;
  const scene = new Scene(engine); scene.useConstantAnimationDeltaTime = true; scene.metadata = { felModeId: 'onevone' };
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = fs.readFileSync(path.join(APP, 'public/models/fel-hero.glb')).toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  const root = r.meshes[0] as unknown as import('@babylonjs/core').TransformNode;
  root.rotationQuaternion = null; root.rotation = new Vector3(0, 0, 0); root.scaling.setAll(1); root.position.set(0, 0, 0);
  const sk = r.skeletons[0];
  sanitizeImportedGroups(r.animationGroups);
  const animator = new CharacterAnimator(scene, r.animationGroups);
  registerAuthoredClips(animator, scene, sk);
  neverBindPose(animator, 'idle_stand'); installSafePlay(animator, 'onevone-me');
  installOpponentMotion(animator, scene, sk, undefined, HERO_CAPTURE);
  applyRestPoseToSkeleton(sk, solveArmsDown(sk));
  mountFootPlanting(scene, r.meshes.find((m) => m.skeleton === sk) ?? r.meshes[0], sk, { root, intensity: 1 });
  animator.play('idle_stand', { loop: true });
  rightHandHoops(animator, sk); leftDribbleTwins(animator, sk);
  const tree = new BT.BasketballAnimTree(animator);
  const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
  rightHandBall(ball);
  attachBallToHand(ball, sk, hoopsHand({ skeleton: sk, root }));
  const carry = mountBallCarry({ scene, ball, root, skeleton: sk, hoops: true });
  const hands = (['Left', 'Right'] as const).map((sd) => ({ h: boneNode(sk, `${sd}Hand`)!, f: boneNode(sk, `${sd}ForeArm`)! }));
  const speed01 = Math.min(1, speed / TOP_MPS);
  const rec: { by: number; palm: number; hand: number; step: number }[] = []; let last: InstanceType<typeof Vector3> | null = null; let state = '';
  const n = Math.round(SEC * 60) + 90;
  let v = LAUNCH ? 0 : speed;
  for (let k = 0; k < n; k++) {
    vt += DT * 1000;
    const live = !LAUNCH || k >= 60;
    if (LAUNCH && live) v = Math.min(speed, v + LAUNCH_ACCEL * DT);
    root.position.z += v * DT;
    const sp01 = Math.min(1, v / TOP_MPS);
    state = String(tree.update({ dtSec: DT, speedMps: v, speed01: sp01, crossover: false, nearestDefender: Infinity, hasBall: true, shooting: false, dunking: false, driving: false, defending: false, bracing: false, staggered: false, ballHand: 'right' }));
    carry.update(DT, sp01, live);
    scene.render();
    ball.computeWorldMatrix(true); const b = ball.getAbsolutePosition().clone();
    let palm = Infinity, hand = Infinity;
    for (const { h, f } of hands) { h.computeWorldMatrix(true); f.computeWorldMatrix(true); const hp = h.getAbsolutePosition(), fp = f.getAbsolutePosition(); const d = hp.subtract(fp).normalize(); const pp = hp.add(d.scale(PALM_M)); palm = Math.min(palm, Vector3.Distance(pp, b) - BALL_R); hand = Math.min(hand, Vector3.Distance(hp, b)); }
    const relStep = last ? Vector3.Distance(b, last) : 0; last = b;
    if (LAUNCH ? k >= 60 : k >= 90) rec.push({ by: b.y, palm, hand, step: relStep });
  }
  const tops = rec.filter((x, i) => i > 0 && i < rec.length - 1 && x.by > rec[i - 1].by && x.by >= rec[i + 1].by && x.by > 0.5 && x.by < 1.4);
  const gaps = tops.map((t) => t.palm * 100), hd = tops.map((t) => t.hand * 100), steps = rec.map((x) => x.step * 100);
  console.log(`${String(speed).padEnd(5)} ${state.padEnd(16)} ${String(tops.length).padStart(7)} ${r1(pct(gaps, 0.5)).padStart(26)} ${r1(pct(gaps, 0.9)).padStart(5)} ${r1(100 * gaps.filter((g) => g <= 5).length / Math.max(1, gaps.length)).padStart(10)}      | ${r1(pct(hd, 0.5)).padStart(22)} ${r1(pct(hd, 0.9)).padStart(5)} | ${r1(pct(steps, 0.99)).padStart(13)} ${String(steps.filter((s) => s > 15).length).padStart(8)}`);
  if (process.argv.includes('--list')) console.log('   tops: ' + tops.map((t) => `y ${t.by.toFixed(2)} palm ${r1(t.palm * 100)} hand ${r1(t.hand * 100)}`).join(' | '));
  carry.dispose(); scene.dispose(); engine.dispose();
}
process.exit(0);
