// KIT-GLITCH, the headless half (no browser, no GPU): the shipped bodies on a NullEngine through the real kit and mask code,
// posed through the real authored clips, and the two CPU symptoms measured per garment:
//   TEAR   a garment triangle edge stretched past ×2 of its bind length AND past ×1.5 of the skin under it (the skin's own
//          stretch at a knee or an elbow is the body's, not the garment's): the cloth "torn at the shoulders, hips or knees"
//   FLOAT  the farthest garment vertex from the skin (m): a piece "floating off the body" (a spike, a flap)
//   POKE   body vertices drawn (not masked) that lie OUTSIDE a garment surface they sit under, within 3 cm: skin through cloth
//   npx tsx scripts/probes/kit-glitch/cpu.ts [male|female|rival:<key>…]   (default: male female and three rivals)
// Prints one JSON line per body × clip and a total. Used to iterate quickly; the browser rig (rig.mts) is the on-screen proof.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader } from '@babylonjs/core';
import type { AbstractMesh, AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyKit, type Wardrobe } from '../../../lib/babylon/core/kit';
import { skinnedWorld, maskBodyNow, isBodyMesh, maskSlotOf } from '../../../lib/babylon/core/bodyMask';
import { CharacterAnimator } from '../../../lib/babylon/anim/CharacterAnimator';
import { registerAuthoredClips } from '../../../lib/babylon/anim/authored';
import { sanitizeImportedGroups } from '../../../lib/babylon/anim/importSanitizer';

const ROOT = resolve(__dirname, '../../..');
export const CPU_CLIPS: [string, number][] = [['idle_stand', 0.3], ['run', 0.25], ['run', 0.75], ['jumpshot', 0.5], ['dunk_land_crouch', 0.5], ['bball_def_lunge_left', 0.5], ['high_kick', 0.5], ['dunk_finish_tomahawk', 0.35], ['dunk_celebrate_big', 0.5], ['karate_jump', 0.5]];

export interface GarmentRead { mesh: string; tear: number; maxRatio: number; float: number; tearBones: Record<string, number> }
export interface PoseRead { body: string; clip: string; frac: number; garments: GarmentRead[]; poke: number; pokeBySlot: Record<string, number> }

const files: Record<string, string> = { male: 'public/models/candidates/fel-kit-male.glb', female: 'public/models/candidates/fel-kit-female.glb' };
// KIT-FIT: `file:<path>` measures a candidate body file (a rebake) through the same code; CLIPS=<clip@frac,…> narrows the poses
const fileOf = (k: string) => (k.startsWith('file:') ? k.slice(5) : files[k] ?? `public/models/rivals/${k.replace(/^rival:/, '')}.glb`);
const envClips = (): [string, number][] | undefined => (process.env.CLIPS ? process.env.CLIPS.split(',').map((c) => { const [n, f] = c.split('@'); return [n, Number(f ?? 0.5)] as [string, number]; }) : undefined);

export async function measureBodies(keys: string[], opts: { wardrobe?: Wardrobe; clips?: [string, number][]; log?: (r: PoseRead) => void } = {}): Promise<PoseRead[]> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  scene.metadata = { felTier: 'desktop', felModeId: 'onevone' };
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  scene.useConstantAnimationDeltaTime = true;
  const out: PoseRead[] = [];
  for (const key of keys) {
    const c: AssetContainer = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(resolve(ROOT, fileOf(key))).toString('base64')}`, scene, undefined, '.glb');
    const inst = c.instantiateModelsToScene((x) => `${x}_c${key}`, false, { doNotInstantiate: true });
    for (const g of inst.animationGroups) g.stop();
    sanitizeImportedGroups(inst.animationGroups);
    const root = inst.rootNodes[0] as TransformNode, sk = inst.skeletons[0];
    const meshes = root.getChildMeshes();
    const animator = new CharacterAnimator(scene, inst.animationGroups);
    registerAuthoredClips(animator, scene, sk, null);
    applyKit(meshes, opts.wardrobe ?? null, 'onevone');
    animator.play('idle_stand', { loop: true, fadeSec: 0, restart: true });
    for (let i = 0; i < 3; i++) scene.render();
    const body = meshes.find((m) => isBodyMesh(m.name.replace(/_c.*$/, '')) || /^Body/.test(m.name)) as Mesh;
    maskBodyNow(body, meshes);
    const garments = root.getChildMeshes().filter((m) => maskSlotOf(m.name) && m.isVisible && (m as Mesh).skeleton && m.getTotalVertices() > 0) as Mesh[];
    // rest (bind-pose) skins, and each garment vertex's nearest body vertex at rest (its "skin under it")
    const restOf = (m: Mesh) => { const P = m.getVerticesData('position')!, W = m.computeWorldMatrix(true).m; const o = new Float32Array(P.length); for (let v = 0; v < P.length / 3; v++) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; o[v * 3] = x * W[0] + y * W[4] + z * W[8]; o[v * 3 + 1] = x * W[1] + y * W[5] + z * W[9]; o[v * 3 + 2] = x * W[2] + y * W[6] + z * W[10]; } return o; };
    const bodyRest = skinnedWorld(body)!.P.slice();   // the idle pose as the reference for the body's own stretch
    const under = new Map<Mesh, Int32Array>();
    const garmentRest = new Map<Mesh, Float32Array>();
    for (const g of garments) {
      const gw = skinnedWorld(g)!.P; const map = new Int32Array(gw.length / 3);
      for (let v = 0; v < map.length; v++) { let bd = Infinity, bi = 0; for (let u = 0; u < bodyRest.length / 3; u += 1) { const d = (bodyRest[u * 3] - gw[v * 3]) ** 2 + (bodyRest[u * 3 + 1] - gw[v * 3 + 1]) ** 2 + (bodyRest[u * 3 + 2] - gw[v * 3 + 2]) ** 2; if (d < bd) { bd = d; bi = u; } } map[v] = bi; }
      under.set(g, map); garmentRest.set(g, restOf(g));
    }
    for (const [clip, frac] of opts.clips ?? CPU_CLIPS) {
      const grp = animator.play(clip, { loop: true, fadeSec: 0, restart: true });
      if (!grp) continue;
      for (const o of scene.animationGroups) if (o !== grp && o.isPlaying) o.stop();
      grp.setWeightForAllAnimatables(1);
      grp.goToFrame(grp.from + (grp.to - grp.from) * frac); grp.pause();
      for (let i = 0; i < 2; i++) scene.render();
      const bw = skinnedWorld(body)!;
      const reads: GarmentRead[] = [];
      for (const g of garments) {
        const gw = skinnedWorld(g)!.P, rest = garmentRest.get(g)!, map = under.get(g)!, ind = g.getIndices()!;
        const len = (P: ArrayLike<number>, a: number, b: number) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
        const rs: number[] = []; for (let t = 0; t < ind.length; t += 3) { const r0 = len(rest, ind[t], ind[t + 1]); if (r0 > 1e-6) rs.push(len(gw, ind[t], ind[t + 1]) / r0); }
        rs.sort((x, y) => x - y); const k = rs[Math.floor(rs.length / 2)] || 1;
        const mi = g.getVerticesData('matricesIndices')!, mw = g.getVerticesData('matricesWeights')!, bones = g.skeleton!.bones;
        const dom = (v: number) => { let bi = 0, bv = -1; for (let q = 0; q < 4; q++) if (mw[v * 4 + q] > bv) { bv = mw[v * 4 + q]; bi = mi[v * 4 + q]; } return bones[bi]?.name ?? '?'; };
        let tear = 0, maxRatio = 0; const tearBones: Record<string, number> = {};
        for (let t = 0; t < ind.length; t += 3) for (const [a, b] of [[ind[t], ind[t + 1]], [ind[t + 1], ind[t + 2]], [ind[t + 2], ind[t]]]) {
          const r0 = len(rest, a, b) * k; if (r0 < 0.003) continue;
          const r = len(gw, a, b) / r0; if (!Number.isFinite(r)) continue;
          maxRatio = Math.max(maxRatio, r);
          if (r <= 2) continue;
          const ba = map[a], bb = map[b], s0 = len(bodyRest, ba, bb), s1 = len(bw.P, ba, bb);
          const rb = s0 > 0.003 ? s1 / s0 : 1;
          if (r > 1.5 * rb) { tear++; const n = dom(a); tearBones[n] = (tearBones[n] ?? 0) + 1; }
        }
        // float: the farthest garment vertex from the skin (nearest body vertex, this pose)
        let far = 0;
        for (let v = 0; v < gw.length / 3; v += 2) { let bd = Infinity; for (let u = 0; u < bw.P.length / 3; u += 3) { const d = (bw.P[u * 3] - gw[v * 3]) ** 2 + (bw.P[u * 3 + 1] - gw[v * 3 + 1]) ** 2 + (bw.P[u * 3 + 2] - gw[v * 3 + 2]) ** 2; if (d < bd) bd = d; } far = Math.max(far, Math.sqrt(bd)); }
        reads.push({ mesh: g.name.replace(/_c[^_]*$/, '').replace(/_c\w+$/, ''), tear, maxRatio: +maxRatio.toFixed(2), float: +far.toFixed(3), tearBones });
      }
      pokeTag = `${key}:${clip}`;
      const pk = cpuPoke(body, bw, garments);
      const r: PoseRead = { body: key, clip, frac, garments: reads, poke: pk.total, pokeBySlot: pk.bySlot };
      out.push(r); opts.log?.(r);
    }
    root.dispose();
    c.dispose();
  }
  scene.dispose(); engine.dispose();
  return out;
}

async function main(): Promise<void> {
  const keys = process.argv.slice(2).length ? process.argv.slice(2) : ['male', 'female', 'rival:ace', 'rival:grit', 'rival:yara'];
  const silence = console.warn; console.warn = () => undefined; console.info = () => undefined; console.log = ((l) => (...a: unknown[]) => { if (!/^(BJS|\[FEL-)/.test(String(a[0]))) l(...a); })(console.log);
  const reads = await measureBodies(keys, { clips: envClips(), log: (r) => console.log(JSON.stringify({ b: r.body, c: `${r.clip}@${r.frac}`, poke: r.poke, pk: r.pokeBySlot, g: r.garments.map((g) => `${g.mesh.replace(/^Kit_/, '')} tear${g.tear} ×${g.maxRatio} float${g.float}${g.tear ? ' ' + JSON.stringify(g.tearBones) : ''}`) })) });
  console.warn = silence;
  let tear = 0, floatMax = 0, poke = 0; const ps: Record<string, number> = {}; for (const r of reads) { poke += r.poke; for (const [k, v] of Object.entries(r.pokeBySlot)) ps[k] = (ps[k] ?? 0) + v; for (const g of r.garments) { tear += g.tear; floatMax = Math.max(floatMax, g.float); } }
  if (process.env.POKE_BONES) console.log('BONES', JSON.stringify(pokeBones));
  console.log('TOTAL', JSON.stringify({ poses: reads.length, tear, floatMax, poke, pokeBySlot: ps }));
}
export const pokeBones: Record<string, number> = {};
let pokeTag = '';
/** POKE (CPU): drawn body vertices (in a triangle the mask kept) that project onto a garment triangle within 3 cm and stand
 *  OUTSIDE it (more than 1 mm along the garment's outward normal): skin through cloth, counted per slot. */
export function cpuPoke(body: Mesh, bw: { P: Float32Array; N: Float32Array }, garments: Mesh[]): { total: number; bySlot: Record<string, number> } {
  const bmi = body.getVerticesData('matricesIndices'), bmw = body.getVerticesData('matricesWeights');
  const drawnV = new Uint8Array(bw.P.length / 3); const bi = body.getIndices()!; for (let i = 0; i < bi.length; i++) drawnV[bi[i]] = 1;
  const C = 0.04, key = (i: number, j: number, k: number) => `${i},${j},${k}`;
  const bySlot: Record<string, number> = {}; let total = 0;
  const hit = new Uint8Array(drawnV.length);
  for (const g of garments) {
    const slot = maskSlotOf(g.name) ?? '?'; const sw = skinnedWorld(g)!; const P = sw.P, N = sw.N, ind = g.getIndices()!;
    // only skin on a bone this garment rides is "under" it (a hand beside the shorts is an honest occluder)
    const gmi = g.getVerticesData('matricesIndices')!, gmw = g.getVerticesData('matricesWeights')!, gb = g.skeleton!.bones, rides = new Set<string>();
    for (let q = 0; q < gmw.length; q++) if (gmw[q] > 0.1) rides.add(gb[gmi[q]]?.name ?? '');
    const domOf = (v: number) => { let bi = 0, bv = -1; for (let q = 0; q < 4; q++) if (bmw![v * 4 + q] > bv) { bv = bmw![v * 4 + q]; bi = bmi![v * 4 + q]; } return body.skeleton!.bones[bi]?.name ?? ''; };
    const grid = new Map<string, number[]>();
    for (let t = 0; t + 2 < ind.length; t += 3) { const a = ind[t] * 3; const kk = key(Math.floor(P[a] / C), Math.floor(P[a + 1] / C), Math.floor(P[a + 2] / C)); let l = grid.get(kk); if (!l) grid.set(kk, l = []); l.push(t); }
    for (let v = 0; v < drawnV.length; v++) {
      if (!drawnV[v] || hit[v] || !rides.has(domOf(v))) continue;
      const x = bw.P[v * 3], y = bw.P[v * 3 + 1], z = bw.P[v * 3 + 2];
      const ci = Math.floor(x / C), cj = Math.floor(y / C), ck = Math.floor(z / C);
      let best = Infinity, sd = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const l = grid.get(key(ci + i, cj + j, ck + k)); if (!l) continue;
        for (const t of l) {
          const a = ind[t], b = ind[t + 1], c = ind[t + 2];
          const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
          const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz); if (nl < 1e-12) continue; nx /= nl; ny /= nl; nz /= nl;
          if (nx * (N[a * 3] + N[b * 3] + N[c * 3]) + ny * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + nz * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
          const px = x - ax, py = y - ay, pz = z - az, d = px * nx + py * ny + pz * nz;
          if (Math.abs(d) > 0.03 || Math.abs(d) >= best) continue;
          // inside the triangle (barycentric, 5 % slack) once projected onto its plane
          const qx = px - d * nx, qy = py - d * ny, qz = pz - d * nz;
          const d00 = ux * ux + uy * uy + uz * uz, d01 = ux * vx + uy * vy + uz * vz, d11 = vx * vx + vy * vy + vz * vz, d20 = qx * ux + qy * uy + qz * uz, d21 = qx * vx + qy * vy + qz * vz, den = d00 * d11 - d01 * d01;
          if (Math.abs(den) < 1e-16) continue;
          const bv = (d11 * d20 - d01 * d21) / den, bw2 = (d00 * d21 - d01 * d20) / den;
          if (bv < -0.05 || bw2 < -0.05 || bv + bw2 > 1.05) continue;
          best = Math.abs(d); sd = d;
        }
      }
      if (best < Infinity && sd > 0.001) {
        hit[v] = 1; total++; bySlot[slot] = (bySlot[slot] ?? 0) + 1;
        if (process.env.POKE_BONES) { let bi = 0, bv = -1; for (let q = 0; q < 4; q++) if (bmw![v * 4 + q] > bv) { bv = bmw![v * 4 + q]; bi = bmi![v * 4 + q]; } const k = `${slot}:${body.skeleton!.bones[bi]?.name}${process.env.POKE_BONES === 'pose' ? '@' + pokeTag : ''}`; pokeBones[k] = (pokeBones[k] ?? 0) + 1; }
      }
    }
  }
  return { total, bySlot };
}

if (require.main === module) void main();
