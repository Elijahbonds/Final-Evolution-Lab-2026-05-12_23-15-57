// improve-camera (phase 8): REPLAY a recorded 1v1 run (../hoops-cam/possession.mjs JSON) through the real CameraDirector on a NullEngine:
// the bodies' recorded floor spots drive the high view, with Canopy Court's venue box (basketball_h2h's 16 × 19 m ground), and it prints
// the share of frames with both bodies (feet, middle, head) and the rim on screen. No browser, no scenery (trees are not in it): a fast
// check of a fit change against a real play before a rig run. The knobs read their defaults (feel() is closed outside a page).
//   npx tsx scripts/probes/improve-camera/replay.ts <run.json> [W H]
import fs from 'node:fs';
import { ArcRotateCamera, NullEngine, Scene, Vector3, Matrix } from '@babylonjs/core';
import { CameraDirector } from '../../../lib/babylon/core/CameraDirector';
import * as H from '../../../lib/babylon/core/HighSidelineCam';
const [file, W, Hh] = [process.argv[2], Number(process.argv[3] ?? 390), Number(process.argv[4] ?? 844)];
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const F = j.frames.filter((f: { ph: string; me?: number[]; foe?: number[] }) => f.ph === 'playing' && f.me && f.foe);
const engine = new NullEngine({ renderWidth: W, renderHeight: Hh, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });
const scene = new Scene(engine); (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
const cam = new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene); cam.fov = 0.8;
const dir = new CameraDirector(scene, cam, 'hoops'); dir.leadEase = false; dir.leadEaseHoopsKnob = true;
dir.setBounds({ minX: -8, maxX: 8, minZ: -1.9, maxZ: 17.1, minY: 0 });
const me = new Vector3(), foe = new Vector3();
const RIM = { x: 0, y: 3.05, z: -0.6 };
const must = () => [{ x: me.x, y: 0, z: me.z }, { x: me.x, y: 1.9, z: me.z }, { x: foe.x, y: 0, z: foe.z }, { x: foe.x, y: 1.9, z: foe.z }, RIM];
dir.setHighView({ court: { rimX: 0, rimZ: -0.6, axisX: 0, axisZ: 1, side: 1 }, on: () => true, frame: () => ({ play: { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, must: must() }) });
const inn = (s: { x: number; y: number }) => Math.abs(s.x) <= 0.94 && Math.abs(s.y) <= 0.94;
let n = 0, all = 0, rim = 0, mi = 0, first = true;
for (const f of F) {
  me.set(f.me[0], 0, f.me[1]); foe.set(f.foe[0], 0, f.foe[1]);
  if (first) { dir.snapTo(me, new Vector3(0, 3.05, -0.6)); first = false; } else dir.update(me, Vector3.Zero(), new Vector3(0, 3.05, -0.6));
  if (f.t - F[0].t < 1.5 || f.cin) continue;
  const pose = { eye: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, target: { x: cam.getTarget().x, y: cam.getTarget().y, z: cam.getTarget().z } };
  const P = (q: H.P3) => H.project(pose, cam.fov, W / Hh, q);
  const pts = ([[me, 0], [me, 1.0], [me, 1.8], [foe, 0], [foe, 1.0], [foe, 1.8]] as Array<[Vector3, number]>).map(([b, y]) => P({ x: b.x, y, z: b.z }));
  n++; const r = inn(P(RIM)); if (r) rim++; if (pts.slice(0, 3).every(inn)) mi++; if (r && pts.every(inn)) all++;
}
console.log(`${file.split('/').pop()}: all ${(100 * all / n).toFixed(1)}% me ${(100 * mi / n).toFixed(1)}% rim ${(100 * rim / n).toFixed(1)}% (n ${n})`);
