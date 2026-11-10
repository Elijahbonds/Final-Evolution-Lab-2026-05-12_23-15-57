// hoops-p05: THE SLIDE BENCH — the hero's defensive feet, headless. The browser rig (drive.mjs) is the judge; this is the workbench:
// no browser, no gate lock, a few seconds a table, so a clip choice or a stepping-legs rule can be tried before a rig run is spent on it.
//
// What it builds (NullEngine, a virtual 60 fps clock): the shipped hero rig (public/models/fel-hero.glb) with the clips a 1v1 hero has
// (the authored set, the hoops captures, the right-handed mirrors — CharacterLibrary.spawn's and OneVOneMode.load's own calls), the
// basketball tree, and the leg layers in the mode's order: MoveLegs (insert-first), the foot planter, footGlide (last).
// NOT built: the posture layer, the stop / start accent, the arm layers, the contact body (the root moves on a straight line here).
//
// What it plays: the body faces a man 3 m ahead (the chest stays on him, as on defence) and travels at a fixed speed in a fixed
// direction for SEC seconds; the tree is fed what OneVOneMode feeds it on defence (slideDir, retreat, closeout, defendRun, approach, the
// same helper functions). Optionally a mode beat rides over the loop: the hand-up hold, the steal reach, the block reach.
//
// What it prints, per (overlay, direction, speed): the state the tree settled in, and the PLANTED-FOOT SLIDE by the rig's own test
// (page.js analyse: the lower foot, within 5 cm of the body's 5th-percentile foot height, not rising) — planted frames, p50 / p90 cm a
// frame, the share over 3 cm, and the median height of the "planted" foot over the floor.
//
//   npx tsx scripts/probes/hoops-gap/slide-bench.mts [--speeds 2,3,4,5,6] [--dirs left,right,back,fwd,backleft,fwdleft] [--over none,hand_up,steal,block]
//                                                    [--sec 2.5] [--json out.json] [--trace dir:speed:over]
//   env: FEEL='{"knob.id": value}' (feel-panel values, as the rig's FEEL)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// the virtual clock, before anything reads performance.now (the tree's dwell, the animator's fades)
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
const { installOpponentMotion, HERO_CAPTURE, variantFor } = un(await import(APP + '/lib/babylon/anim/opponentMotion.ts'));
const { rightHandHoops, leftDribbleTwins } = un(await import(APP + '/lib/babylon/anim/hoopsHand.ts'));
const { solveArmsDown } = un(await import(APP + '/lib/babylon/anim/restPose.ts'));
const { applyRestPoseToSkeleton } = un(await import(APP + '/lib/babylon/anim/restPoseApply.ts'));
const { mountFootPlanting } = un(await import(APP + '/lib/babylon/anim/FootPlanting.ts'));
const { FootGlide } = un(await import(APP + '/lib/babylon/anim/footGlide.ts'));
const { MoveLegs } = un(await import(APP + '/lib/babylon/anim/moveLegs.ts'));
const { boneNode } = un(await import(APP + '/lib/babylon/anim/boneLookup.ts'));
const BT = un(await import(APP + '/lib/babylon/anim/basketballTree.ts'));
const { HipSteer } = un(await import(APP + '/lib/babylon/anim/hipSteer.ts'));
const { NullEngine, Scene, FreeCamera, Vector3, SceneLoader } = BJS;

const SPEEDS = arg('--speeds', '2,3,4,5,6').split(',').map(Number);
const DIRS = arg('--dirs', 'left,right,back,fwd,backleft,fwdleft').split(',');
const OVERS = arg('--over', 'none,hand_up,steal,block').split(',');
const SEC = Number(arg('--sec', '2.5'));
const TRACE = arg('--trace', '');
// --ref state=mps[,state=mps]: a calibration sweep's stride reference for a state (the bench only: it writes into this process's copy of
// StrideMatch's captured table) — which reference plants the loop's feet best at a speed
{ const refs = arg('--ref', ''); if (refs) { const SM = un(await import(APP + '/lib/babylon/core/StrideMatch.ts')); const by = SM.HOOPS_STRIDE_CAPTURE.byState as Record<string, number>; for (const kv of refs.split(',')) { const [k, v] = kv.split('='); if (k === 'slide') (SM.HOOPS_STRIDE_CAPTURE as { slide: number }).slide = Number(v); else by[k] = Number(v); } } }
/** The travel direction in the BODY frame (x = body-right, z = body-forward: toward the man). */
const DIR: Record<string, [number, number]> = { left: [-1, 0], right: [1, 0], back: [0, -1], fwd: [0, 1], backleft: [-0.7071, -0.7071], backright: [0.7071, -0.7071], fwdleft: [-0.7071, 0.7071], fwdright: [0.7071, 0.7071] };
const TOP_MPS = 6.4;   // the hoops sprint (GEARS_HOOPS): speed01 = speed / top

async function build(layers = true) {
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
  const skinned = r.meshes.find((m) => m.skeleton === sk) ?? r.meshes[0];
  if (layers) mountFootPlanting(scene, skinned, sk, { root, intensity: 1 });
  animator.play('idle_stand', { loop: true });
  rightHandHoops(animator, sk); leftDribbleTwins(animator, sk);
  const tree = new BT.BasketballAnimTree(animator);
  if (layers) tree.attachSteer(HipSteer.for(scene, sk, root));   // (the mode's order: the steer is built before the legs layer)
  if (layers) tree.attachLegs(MoveLegs.for(scene, sk, (n: string) => animator.groupFor(n), (n: string) => variantFor(n, animator.clipNames)));
  if (layers) FootGlide.for(scene, sk, root);
  return { engine, scene, root, sk, animator, tree };
}
const pct = (a: number[], p: number) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const r1 = (x: number) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : '-');

interface Row { over: string; dir: string; speed: number; state: string; planted: number; p50: number; p90: number; over3: number; footUp: number; frames: number; states: Record<string, number>; strictN: number; strictP90: number; noFoot: number; pops: number; severe: number; worst: string }
async function run(over: string, dir: string, speed: number): Promise<Row> {
  const B = await build(); const { scene, root, sk, tree } = B;
  const lf = boneNode(sk, 'LeftFoot')!, rf = boneNode(sk, 'RightFoot')!;
  const [bx, bz] = DIR[dir]; const yaw = 0;   // facing +z: body-right is +x
  const vel = new Vector3(bx * speed, 0, bz * speed);
  const man = () => new Vector3(root.position.x, 0, root.position.z + 3.0);   // 3 m ahead, always: the chest stays on him
  const feet: number[][] = []; const stateCount: Record<string, number> = {};
  // the rig's POPS on the lower body and the spine (page.js analyse: a bone's local turn >= 600 deg/s, >= 3.5x the median of the 6 frames
  // either side (floored at 60) and >= 3x the speed 3 frames away; severe >= 3000)
  const POPB = ['Hips', 'Spine', 'Spine1', 'Spine2', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
  const popN = POPB.map((n) => boneNode(sk, n)); const prevQ: (InstanceType<typeof BJS.Quaternion> | null)[] = POPB.map(() => null); const angs: number[][] = POPB.map(() => []);
  const frame = (v: InstanceType<typeof Vector3>, rec: boolean, k: number) => {
    vt += DT * 1000;
    root.position.x += v.x * DT; root.position.z += v.z * DT;
    const sp = Math.hypot(v.x, v.z), speed01 = Math.min(1, sp / TOP_MPS);
    const st = tree.update({
      dtSec: DT, speedMps: sp, speed01, crossover: false, nearestDefender: Infinity, hasBall: false, shooting: false, dunking: false, driving: false,
      defending: true, bracing: false, staggered: false, slideDir: v.x * Math.cos(yaw) - v.z * Math.sin(yaw) > 0.3 ? 'right' : 'left',
      retreat: BT.retreatFor(root.position, v, man()), closeout: BT.closeoutFor(root.position, v, man(), speed01), intense: false,
      defendRun: BT.defendRunFor(yaw, v, tree.state), approach: BT.approachFor(root.position, v, man(), tree.state),
      ...(sp > 0.6 ? { travelOffRad: Math.atan2(v.x, v.z) - yaw } : {}),   // OneVOneMode travelOff: undefined under 0.6 m/s
    });
    // the mode's beats over the loop (OneVOneMode: the hand-up hold while X is held, the steal reach, the block reach)
    if (rec) {
      if (over === 'hand_up' && !tree.busy) tree.hold('bball_hand_up', { fadeSec: 0.14 });
      if (over === 'steal' && k % 54 === 6) tree.beat('bball_steal_reach', { fadeSec: 0.1 });
      if (over === 'block' && k % 72 === 6) tree.beat('bball_block_reach');
    }
    scene.render();
    if (rec) {
      for (const n of [lf, rf]) n.computeWorldMatrix(true);
      const a = lf.getAbsolutePosition(), b = rf.getAbsolutePosition();
      feet.push([a.x, a.y, a.z, b.x, b.y, b.z, root.position.x, root.position.z]);
      const key = tree.held ? `${st}+${tree.held}` : String(st); stateCount[key] = (stateCount[key] || 0) + 1;
      popN.forEach((n, j) => { if (!n || !n.rotationQuaternion) return; const q = n.rotationQuaternion; const pq = prevQ[j]; angs[j].push(pq ? 2 * Math.acos(Math.min(1, Math.abs(BJS.Quaternion.Dot(pq, q)))) * 180 / Math.PI * 60 : 0); prevQ[j] = q.clone(); });
    }
    return st;
  };
  // settle standing, ramp up over 0.4 s, then record at pace
  for (let i = 0; i < 30; i++) frame(new Vector3(0, 0, 0), false, 0);
  for (let i = 0; i < 24; i++) frame(vel.scale((i + 1) / 24), false, 0);
  const n = Math.round(SEC * 60);
  for (let k = 0; k < n; k++) frame(vel, true, k);
  // the rig's planted test
  const ys: number[] = []; for (const f of feet) { ys.push(f[1], f[4]); }
  const floorY = pct(ys, 0.05); const slides: number[] = [], ups: number[] = [];
  // the STRICT read beside the rig's: each foot against its OWN floor (the rig's two feet stand about 1.4 cm apart), "on the floor" within
  // 3 cm of it (footGlide's GROUND_M: a foot footGlide holds 5 cm up is in the air by design) — and the frames with NO foot on the floor
  const fl = [pct(feet.map((f) => f[1]), 0.05), pct(feet.map((f) => f[4]), 0.05)]; const strict: number[] = []; let noFoot = 0;
  const trace: string[] = [];
  for (let i = 1; i < feet.length; i++) {
    const f = feet[i], p = feet[i - 1];
    for (const [o, ob] of [[0, 3], [3, 0]]) {
      const y = f[o + 1], yWas = p[o + 1], yo = f[ob + 1];
      if (y < floorY + 0.05 && y <= yo && !(y - yWas > 0.002)) { const s = Math.hypot(f[o] - p[o], f[o + 2] - p[o + 2]); slides.push(s * 100); ups.push((y - floorY) * 100); }
    }
    { let any = false; for (const [o, k] of [[0, 0], [3, 1]]) { if (f[o + 1] < fl[k] + 0.03) { any = true; strict.push(Math.hypot(f[o] - p[o], f[o + 2] - p[o + 2]) * 100); } } if (!any) noFoot++; }
    if (TRACE === `${dir}:${speed}:${over}`) trace.push(`${i} L y ${r1((f[1] - floorY) * 100)} step ${r1(Math.hypot(f[0] - p[0], f[2] - p[2]) * 100)} | R y ${r1((f[4] - floorY) * 100)} step ${r1(Math.hypot(f[3] - p[3], f[5] - p[5]) * 100)} | root ${r1(Math.hypot(f[6] - p[6], f[7] - p[7]) * 100)}`);
  }
  if (trace.length) console.log(trace.join('\n'));
  let pops = 0, severe = 0; let worst = [0, '', 0] as [number, string, number];
  angs.forEach((w, j) => { for (let i = 1; i < w.length; i++) { const nb: number[] = []; for (let k = Math.max(1, i - 6); k <= Math.min(w.length - 1, i + 6); k++) if (k !== i) nb.push(w[k]); nb.sort((a, b) => a - b); const med = nb[Math.floor(nb.length / 2)] || 0; const side = Math.max(w[i - 3] || 0, w[i + 3] || 0); if (w[i] >= 600 && w[i] >= 3.5 * Math.max(med, 60) && w[i] >= 3 * side) { pops++; if (w[i] >= 3000) severe++; if (w[i] > worst[0]) worst = [w[i], POPB[j], i]; } } });
  const top = Object.entries(stateCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';
  B.scene.dispose(); B.engine.dispose();
  return { over, dir, speed, state: top, planted: slides.length, p50: pct(slides, 0.5), p90: pct(slides, 0.9), over3: slides.length ? 100 * slides.filter((s) => s > 3).length / slides.length : NaN, footUp: pct(ups, 0.5), frames: feet.length, states: stateCount, strictN: strict.length, strictP90: pct(strict, 0.9), noFoot: 100 * noFoot / Math.max(1, feet.length - 1), pops, severe, worst: worst[0] ? `${worst[1]} ${Math.round(worst[0])} f${worst[2]}` : '-' };
}

// --clips: WHERE DOES EACH LOOP STEP? Each locomotion state's clip, played on the spot at rate 1 with no leg layer: a foot on the floor
// (the lower third of its heights) sweeps under the body the opposite way to the travel the clip was made for. Prints, per state: the
// clip the animator really plays, the travel its stance feet imply (deg from the chest, + = body-right) and its speed (m/s), beside the
// travel the tree plays it for and the stride reference it is paced against.
if (process.argv.includes('--clips')) {
  const { rateFor, strideRef } = un(await import(APP + '/lib/babylon/core/StrideMatch.ts'));
  const WANT: Record<string, number> = { defend_slide: -90, defend_slide_right: 90, defend_slide_hard: -90, defend_slide_hard_right: 90, defend_run: -90, defend_run_right: 90, defend_backpedal: 180, closeout: 0, run: 0, carry_slide: -90, carry_slide_right: 90, carry_back: 180, walk_dribble: 0, speed_dribble: 0, sprint_dribble: 0 };
  const table = BT.basketballClipTable();
  console.log('state                     clip played                          stance implies: deg  m/s   |  the tree plays it for: deg   ref m/s  | off by');
  for (const [state, wantDeg] of Object.entries(WANT)) {
    const B = await build(false); const { scene, sk, animator, root } = B;
    const lf = boneNode(sk, 'LeftFoot')!, rf = boneNode(sk, 'RightFoot')!;
    const g = animator.play(table[state as keyof typeof table].clip, { loop: true, fadeSec: 0, speedRatio: 1 });
    const feet: number[][] = [];
    // …and where the pelvis and the chest point while it plays (deg from the root's front): the hip line and the shoulder line, turned 90
    const lu = boneNode(sk, 'LeftUpLeg')!, ru = boneNode(sk, 'RightUpLeg')!, la = boneNode(sk, 'LeftArm')!, ra = boneNode(sk, 'RightArm')!;
    let hipYaw = 0, chestYaw = 0, nY = 0;
    const lineYaw = (l: typeof lu, r: typeof lu) => { l.computeWorldMatrix(true); r.computeWorldMatrix(true); const a = l.getAbsolutePosition(), b = r.getAbsolutePosition(); const dx = a.x - b.x, dz = a.z - b.z; return Math.atan2(-dz, dx) * 180 / Math.PI; };   // the rig's Left* is on the root's +x: a square body reads 0
    for (let i = 0; i < 150; i++) { vt += DT * 1000; scene.render(); if (i < 30) continue; for (const n of [lf, rf]) n.computeWorldMatrix(true); const a = lf.getAbsolutePosition(), b = rf.getAbsolutePosition(); feet.push([a.x, a.y, a.z, b.x, b.y, b.z]); hipYaw += lineYaw(lu, ru); chestYaw += lineYaw(la, ra); nY++; }
    if (arg('--dump', '') === state) { console.log(`${state}: frame | L x y z | R x y z (m, the root's frame; +z = the chest's way, +x = body-right)`); feet.slice(0, 80).forEach((f, i) => console.log(`  ${String(i).padStart(2)} | ${f.slice(0, 3).map((v) => v.toFixed(3).padStart(7)).join(' ')} | ${f.slice(3, 6).map((v) => v.toFixed(3).padStart(7)).join(' ')}`)); }
    let sx = 0, sz = 0, n = 0;
    for (const o of [0, 3]) {
      const ys = feet.map((f) => f[o + 1]); const cut = pct(ys, 0.33);
      for (let i = 1; i < feet.length; i++) if (feet[i][o + 1] <= cut && feet[i - 1][o + 1] <= cut) { sx += (feet[i][o] - feet[i - 1][o]) * 60; sz += (feet[i][o + 2] - feet[i - 1][o + 2]) * 60; n++; }
    }
    // …and THE TRAVEL THAT FITS THE CLIP BEST: the root velocity at which, frame by frame, the better foot is stillest on the floor (the
    // mean over frames of the smaller of the two feet's world speeds, a grid search) — a shuffle's feet are both low, so "the lower
    // third" above misreads them; this does not care about height. `fit` = [deg, m/s, mean slip cm a frame at that travel]
    const rel: number[][] = []; for (let i = 1; i < feet.length; i++) rel.push([(feet[i][0] - feet[i - 1][0]) * 60, (feet[i][2] - feet[i - 1][2]) * 60, (feet[i][3] - feet[i - 1][3]) * 60, (feet[i][5] - feet[i - 1][5]) * 60]);
    let fit = [0, 0, Infinity];
    for (let sp2 = 0; sp2 <= 6.001; sp2 += 0.1) for (let a = -180; a < 180; a += 5) {
      const vx = sp2 * Math.sin(a * Math.PI / 180), vz = sp2 * Math.cos(a * Math.PI / 180); let c = 0;
      for (const r of rel) c += Math.min(Math.hypot(r[0] + vx, r[1] + vz), Math.hypot(r[2] + vx, r[3] + vz));
      c = c / rel.length * 100 / 60; if (c < fit[2]) fit = [a, sp2, c];
    }
    const tx = -sx / Math.max(1, n), tz = -sz / Math.max(1, n);   // the travel = minus the stance foot's sweep
    const deg = Math.atan2(tx, tz) * 180 / Math.PI, sp = Math.hypot(tx, tz);
    const ref = strideRef(true); const refMps = ref.byState?.[state] ?? null; const r1mps = (() => { for (let v = 0.5; v < 9; v += 0.01) { const r = rateFor(state, v, ref); if (r !== null && Math.abs(r - 1) < 0.004) return v; } return NaN; })();
    let off = deg - wantDeg; off = ((off + 180) % 360 + 360) % 360 - 180;
    console.log(`${state.padEnd(25)} ${String(g?.name ?? '?').replace(/_c\d+$/, '').padEnd(36)} ${r1(deg).padStart(18)} ${sp.toFixed(2).padStart(5)}   | ${String(wantDeg).padStart(26)} ${(refMps ?? r1mps).toFixed(2).padStart(8)}  | ${r1(off).padStart(6)} deg | hips ${r1(hipYaw / nY)} chest ${r1(chestYaw / nY)} | best fit ${fit[0]} deg ${fit[1].toFixed(1)} m/s (slip ${r1(fit[2])} cm/f)`);
    void root; B.scene.dispose(); B.engine.dispose();
  }
  process.exit(0);
}
const rows: Row[] = [];
console.log('overlay   dir       m/s  cm/f  state (most frames)                      planted  p50   p90   >3cm%  footUp | strict: on-floor p90  no foot down % | pops severe (worst)');
for (const over of OVERS) for (const dir of DIRS) for (const speed of SPEEDS) {
  const r = await run(over, dir, speed); rows.push(r);
  console.log(`${over.padEnd(9)} ${dir.padEnd(9)} ${String(speed).padEnd(4)} ${r1(speed * 100 / 60).padStart(4)}  ${r.state.slice(0, 40).padEnd(40)} ${String(r.planted).padStart(6)} ${r1(r.p50).padStart(5)} ${r1(r.p90).padStart(5)} ${r1(r.over3).padStart(6)} ${r1(r.footUp).padStart(6)} | ${String(r.strictN).padStart(12)} ${r1(r.strictP90).padStart(5)} ${r1(r.noFoot).padStart(8)} | ${String(r.pops).padStart(3)} ${String(r.severe).padStart(3)} (${r.worst})`);
}
if (arg('--json', '')) fs.writeFileSync(arg('--json', ''), JSON.stringify(rows));
process.exit(0);
