// KIT-FIT: the browser rig's "skin through cloth" without a browser — so a garment change can be measured in seconds instead of
// an hour in the gate queue. Headless (NullEngine), the real kit, mask and (optionally) Creator shape code, posed through real
// clips, then per camera direction (the rig's five cameras, as parallel rays):
//   EXPOSED  a DRAWN skin vertex (in a triangle the mask kept) within POKE_NEAR of a garment surface, that a ray from the camera
//            reaches before any garment, and behind which the ray then meets a garment: skin seen inside the garment's
//            silhouette — what the rig's key pass counts as pixels (it also counts the skin's own occlusion, which this ignores).
//   LAYER    a SHORT's vertex a ray reaches before the TOP, inside the top's silhouette: the short drawn over the tee (job 3,
//            the waistband through the tee's hem). The skin metric cannot see this.
//   npx tsx scripts/probes/kit-fit/exposed.ts <male|female|rival:<k>|file:<glb>> [girth] [clip@frac,…]
// Morph targets (the Creator's shape) are applied to the positions before skinning, as the GPU does.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader } from '@babylonjs/core';
import type { AbstractMesh, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyKit } from '../../../lib/babylon/core/kit';
import { skinnedWorld, maskBodyNow, isBodyMesh, maskSlotOf } from '../../../lib/babylon/core/bodyMask';
import { CharacterAnimator } from '../../../lib/babylon/anim/CharacterAnimator';
import { registerAuthoredClips } from '../../../lib/babylon/anim/authored';
import { sanitizeImportedGroups } from '../../../lib/babylon/anim/importSanitizer';
import { syncShape } from '../../../lib/babylon/creator/shape/renderShape';
import type { CreatorDoc } from '../../../lib/creator/look/doc';
import { setFeelOverride, setFeelSession, setFeelUser } from '../../../lib/feel-panel/feel';

const ROOT = resolve(__dirname, '../../..');
const POKE_NEAR = 0.04;
/** The rig's cameras as view directions (yaw from the front, pitch down), the body facing −Z in Babylon. */
export const DIRS: { id: string; yaw: number; pitch: number }[] = [
  { id: 'close-front', yaw: 25, pitch: 5 }, { id: 'close-side', yaw: 95, pitch: 0 }, { id: 'mid-front', yaw: -20, pitch: 8 },
  { id: 'mid-back', yaw: 160, pitch: 12 }, { id: 'far-front', yaw: 10, pitch: 15 },
];
export const CLIPS: [string, number][] = [['idle_stand', 0.3], ['run', 0.25], ['jumpshot', 0.5], ['dunk_land_crouch', 0.5], ['bball_def_lunge_left', 0.5], ['high_kick', 0.5], ['dunk_finish_tomahawk', 0.35], ['dunk_celebrate_big', 0.5]];
const files: Record<string, string> = { male: 'public/models/candidates/fel-kit-male.glb', female: 'public/models/candidates/fel-kit-female.glb' };
const fileOf = (k: string) => (k.startsWith('file:') ? k.slice(5) : resolve(ROOT, files[k] ?? `public/models/rivals/${k.replace(/^rival:/, '')}.glb`));
const GIRTH = (v: number) => ({ head: v, neck: v, chest: v, belly: v, upperArms: v, forearms: v, thighs: v, calves: v });

/** World positions of a skinned mesh with its morph targets applied first (the GPU's order). */
function posed(m: Mesh): Float32Array {
  const base = m.getVerticesData('position')!;
  const mgr = m.morphTargetManager;
  if (!mgr || !mgr.numTargets) return skinnedWorld(m)!.P;
  const P = Float32Array.from(base);
  for (let t = 0; t < mgr.numTargets; t++) {
    const tg = mgr.getTarget(t); if (!(tg.influence > 0)) continue;
    const tp = tg.getPositions(); if (!tp) continue;
    for (let i = 0; i < P.length; i++) P[i] += tg.influence * (tp[i] - base[i]);
  }
  return skinnedWorld(m, P)!.P;
}

interface Tri { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number; slot: string }
/** Ray (o + t d) against a triangle: t, or -1. Möller–Trumbore. */
function hit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, T: Tri): number {
  const e1x = T.bx - T.ax, e1y = T.by - T.ay, e1z = T.bz - T.az, e2x = T.cx - T.ax, e2y = T.cy - T.ay, e2z = T.cz - T.az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det, tx = ox - T.ax, ty = oy - T.ay, tz = oz - T.az, u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) return -1;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}

export interface ExposedRead { body: string; clip: string; exposed: number; bySlot: Record<string, number>; layer: number }

export async function measureExposed(key: string, opts: { girth?: number; clips?: [string, number][] } = {}): Promise<ExposedRead[]> {
  const engine = new NullEngine(); const scene = new Scene(engine);
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  scene.metadata = { felTier: 'desktop', felModeId: 'onevone' };
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60; scene.useConstantAnimationDeltaTime = true;
  const c = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(fileOf(key)).toString('base64')}`, scene, undefined, '.glb');
  const inst = c.instantiateModelsToScene((x) => `${x}_c`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop(); sanitizeImportedGroups(inst.animationGroups);
  const root = inst.rootNodes[0] as TransformNode, sk = inst.skeletons[0], meshes = root.getChildMeshes();
  const animator = new CharacterAnimator(scene, inst.animationGroups); registerAuthoredClips(animator, scene, sk, null);
  applyKit(meshes, null, 'onevone');
  const doc = opts.girth ? ({ v: 1, parts: [], paint: [], colours: {}, shape: { face: {}, body: {}, girth: GIRTH(opts.girth) }, flags: { suit: false } } as unknown as CreatorDoc) : null;
  if (doc) syncShape({ root, skeleton: sk, meshes }, doc);
  animator.play('idle_stand', { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < 3; i++) scene.render();
  const body = meshes.find((m) => isBodyMesh(m.name.replace(/_c$/, '')) || /^Body/.test(m.name)) as Mesh;
  maskBodyNow(body, meshes);
  if (doc) syncShape({ root, skeleton: sk, meshes }, doc);   // the Creator re-applies on every identity apply
  const garments = root.getChildMeshes().filter((m) => maskSlotOf(m.name) && m.isVisible && (m as Mesh).skeleton && m.getTotalVertices() > 0) as Mesh[];
  const out: ExposedRead[] = [];
  for (const [clip, frac] of opts.clips ?? CLIPS) {
    const grp = animator.play(clip, { loop: true, fadeSec: 0, restart: true }); if (!grp) continue;
    for (const o of scene.animationGroups) if (o !== grp && o.isPlaying) o.stop();
    grp.setWeightForAllAnimatables(1); grp.goToFrame(grp.from + (grp.to - grp.from) * frac); grp.pause();
    for (let i = 0; i < 2; i++) scene.render();
    const B = posed(body), bInd = body.getIndices()!;
    const drawn = new Uint8Array(B.length / 3); for (let i = 0; i < bInd.length; i++) drawn[bInd[i]] = 1;
    const tris: Tri[] = [];
    for (const g of garments) { const P = posed(g), ind = g.getIndices()!, slot = maskSlotOf(g.name)!; for (let t = 0; t < ind.length; t += 3) { const a = ind[t] * 3, b = ind[t + 1] * 3, cc = ind[t + 2] * 3; tris.push({ ax: P[a], ay: P[a + 1], az: P[a + 2], bx: P[b], by: P[b + 1], bz: P[b + 2], cx: P[cc], cy: P[cc + 1], cz: P[cc + 2], slot }); } }
    // skin near a garment (any slot): a 4 cm grid over the garment vertices
    const G = 0.04, near = new Set<string>(); for (const T of tris) for (const [x, y, z] of [[T.ax, T.ay, T.az], [T.bx, T.by, T.bz], [T.cx, T.cy, T.cz]]) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) near.add(`${Math.floor(x / G) + i},${Math.floor(y / G) + j},${Math.floor(z / G) + k}`);
    let exposed = 0, layer = 0; const bySlot: Record<string, number> = {};
    for (const dir of DIRS) {
      // view direction: from the camera toward the body (Babylon: the body faces −Z, so the front camera looks along +Z)
      const yaw = dir.yaw * Math.PI / 180, pit = dir.pitch * Math.PI / 180;
      const dx = -Math.sin(yaw) * Math.cos(pit), dy = -Math.sin(pit), dz = Math.cos(yaw) * Math.cos(pit);
      // bin the triangles in the plane perpendicular to the view (2 cm cells)
      const ux = Math.abs(dy) < 0.9 ? 0 : 1, uy = Math.abs(dy) < 0.9 ? 1 : 0;
      let e1 = [uy * dz - 0 * dy, 0 * dx - ux * dz, ux * dy - uy * dx]; const l1 = Math.hypot(e1[0], e1[1], e1[2]); e1 = e1.map((q) => q / l1);
      const e2 = [dy * e1[2] - dz * e1[1], dz * e1[0] - dx * e1[2], dx * e1[1] - dy * e1[0]];
      const C = 0.02, bins = new Map<string, number[]>(); const proj = (x: number, y: number, z: number) => [x * e1[0] + y * e1[1] + z * e1[2], x * e2[0] + y * e2[1] + z * e2[2]];
      tris.forEach((T, ti) => { const p = [proj(T.ax, T.ay, T.az), proj(T.bx, T.by, T.bz), proj(T.cx, T.cy, T.cz)]; const u0 = Math.floor(Math.min(p[0][0], p[1][0], p[2][0]) / C), u1 = Math.floor(Math.max(p[0][0], p[1][0], p[2][0]) / C), v0 = Math.floor(Math.min(p[0][1], p[1][1], p[2][1]) / C), v1 = Math.floor(Math.max(p[0][1], p[1][1], p[2][1]) / C); for (let i = u0; i <= u1; i++) for (let j = v0; j <= v1; j++) { const k = `${i},${j}`; let a = bins.get(k); if (!a) bins.set(k, a = []); a.push(ti); } });
      const cast = (x: number, y: number, z: number) => { const [u, v] = proj(x, y, z); const cand = bins.get(`${Math.floor(u / C)},${Math.floor(v / C)}`) ?? []; const ox = x - dx * 3, oy = y - dy * 3, oz = z - dz * 3; const hits: { t: number; slot: string }[] = []; for (const ti of cand) { const t = hit(ox, oy, oz, dx, dy, dz, tris[ti]); if (t > 0) hits.push({ t, slot: tris[ti].slot }); } return hits; };
      for (let v = 0; v < B.length / 3; v++) {
        if (!drawn[v]) continue; const x = B[v * 3], y = B[v * 3 + 1], z = B[v * 3 + 2];
        if (!near.has(`${Math.floor(x / G)},${Math.floor(y / G)},${Math.floor(z / G)}`)) continue;
        const hs = cast(x, y, z), at = 3;   // the vertex is at t = 3 along the ray
        if (hs.some((h) => h.t < at - 0.002)) continue;   // a garment in front: covered
        const behind = hs.find((h) => h.t > at + 0.002); if (!behind) continue;   // nothing behind: outside the silhouette (a bare arm)
        exposed++; bySlot[behind.slot] = (bySlot[behind.slot] ?? 0) + 1;
      }
      // the short over the top: a short's vertex seen before any top, with a top behind it
      for (const g of garments) { if (maskSlotOf(g.name) !== 'shorts') continue; const P = posed(g); for (let v = 0; v < P.length / 3; v += 1) { const hs = cast(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); if (hs.some((h) => h.t < 3 - 0.002 && h.slot === 'tops')) continue; if (hs.some((h) => h.t > 3 + 0.002 && h.slot === 'tops')) layer++; } }
    }
    out.push({ body: key, clip: `${clip}@${frac}`, exposed, bySlot, layer });
  }
  root.dispose(); c.dispose(); scene.dispose(); engine.dispose();
  return out;
}

async function main(): Promise<void> {
  const [key = 'male', girth, clipsArg] = process.argv.slice(2);
  // KNOBS='{"kit.garmentFollowBody":1}' measures a feel switch through the panel's own path
  if (process.env.KNOBS) { setFeelUser(true); setFeelSession(null); for (const [k, v] of Object.entries(JSON.parse(process.env.KNOBS) as Record<string, number>)) setFeelOverride(k, v); }
  const quiet = console.log; console.warn = () => undefined; console.info = () => undefined; console.log = (...a: unknown[]) => { if (!/^(BJS|\[FEL-)/.test(String(a[0]))) quiet(...a); };
  const clips = clipsArg ? clipsArg.split(',').map((c) => { const [n, f] = c.split('@'); return [n, Number(f ?? 0.5)] as [string, number]; }) : undefined;
  const reads = await measureExposed(key, { girth: girth && girth !== '-' ? Number(girth) : undefined, clips });
  let e = 0, l = 0; const s: Record<string, number> = {};
  for (const r of reads) { e += r.exposed; l += r.layer; for (const [k, v] of Object.entries(r.bySlot)) s[k] = (s[k] ?? 0) + v; quiet(`${r.clip.padEnd(28)} exposed ${String(r.exposed).padStart(4)} ${JSON.stringify(r.bySlot)} layer ${r.layer}`); }
  quiet('TOTAL', JSON.stringify({ body: key, girth: girth ?? null, exposed: e, bySlot: s, layer: l }));
}
if (require.main === module) void main();
