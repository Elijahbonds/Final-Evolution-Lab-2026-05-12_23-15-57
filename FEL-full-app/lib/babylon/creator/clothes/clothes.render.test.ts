// CODE-BUILT CLOTHES on the REAL kit bodies (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e), through the real path
// (identityFrom → applyIdentity → the Creator hook → renderClothes), in NullEngine scenes.
//
// What is proven here, on the male and the female kit:
//   - every style of every kind builds: a sane vertex count, the hem / sleeve / leg / shaft where the body says, skinned to
//     the BODY'S OWN skeleton with valid joints and weights that sum to 1, one mesh and one material for the whole outfit,
//     never pickable, never in spawn.meshes, disposed with the body;
//   - NO POKE-THROUGH: every body vertex still drawn in a covered region (the band near a hem) is behind the garment's
//     nearest triangle — at rest and in the extreme poses of four authored clips (the dunk gather crouch, the dunk hang
//     with the arms overhead, the Spider-Man crouch and the splits); the skin deep inside is not drawn at all; a tube (a
//     skirt, a coat's tails) is measured and logged, and must clear the body at rest;
//   - layers: a later piece is outside an earlier one wherever they overlap, by at least most of LAYER_GAP; an inner
//     piece is culled where an outer one covers it deeply;
//   - the 4b shape morph shapes the garments (one target on the cloth mesh, influence 1; the chest pushed out with the skin);
//   - the kit interplay: a built piece hides its kit slot (even the sport's uniform and a kit pack that lands late), an
//     empty slot keeps the Closet pick or the sport default, gloves replace nothing, the hair goes under a raised hood;
//   - paint on the garments reaches the cloth mesh (the body's own surface map at the garment size);
//   - the cache: the same doc rebuilds nothing, a colour change rewrites colours only, the LRU is bounded.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3, VertexBuffer } from '@babylonjs/core';
import type { AbstractMesh, AnimationGroup, AssetContainer, Mesh, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyIdentity, identityFrom } from '../../core/playerIdentity';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { applyKit, kitOf, kitSlotCovered } from '../../core/kit';
import { maskBodyNow, skinnedWorld } from '../../core/bodyMask';
import { defaultFace } from '../../../closet/wearable-catalog';
import { CLOTH_KINDS, CLOTH_STYLES, emptyCreatorDoc, type CreatorCloth, type CreatorDoc, type CreatorSlotV2 } from '../../../creator/look/doc';
import { sanitizeClothes } from '../../../creator/look/sanitize';
import { LAYER_GAP, legCutHeight, resolveCloth, riseHeight, shaftHeight, sleeveReach } from '../../../creator/look/clothes';
import { flushPaint, paintStats, setPaintBaseReader } from '../paint/renderPaint';
import { shapeTargetOf } from '../shape/renderShape';
import { clothFieldOf } from './bodyField';
import { HIDE_MARGIN, buildClothes, keepField } from './build';
import { CLOTH_CACHE_MAX, clothCacheStats, clothMeshOf, resetClothCaches, syncClothes } from './renderClothes';
import { buildChargeGather, buildScoreHang } from '../../anim/authored/dunkSuite';
import { buildCelebSpidermanSplits, CELEB_SPIDERMAN_SEC } from '../../anim/authored/dunkCelebrations';

const kits: Record<'male' | 'female', AssetContainer> = {} as never;
let scene: Scene;
beforeAll(async () => {
  setPaintBaseReader((_t, size) => new Uint8Array(size * size * 4).fill(128));
  scene = new Scene(new NullEngine());
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  scene.metadata = { felTier: 'desktop' };
  for (const sex of ['male', 'female'] as const) {
    kits[sex] = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(`public/models/candidates/fel-kit-${sex}.glb`).toString('base64')}`, scene, undefined, '.glb');
  }
}, 120_000);
afterAll(() => setPaintBaseReader(null));

let n = 0;
function spawn(sex: 'male' | 'female' = 'male'): SpawnedCharacter {
  const inst = kits[sex].instantiateModelsToScene((x) => `${x}_c${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `c${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
const WEAR = { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' };
const HERO = (sex: 'male' | 'female') => ({ body: sex === 'female' ? 'kit-female' : 'kit-male', frame: { heightScale: 100, buildScale: 100 }, scanOwned: false }) as const;
function wear(s: SpawnedCharacter, d: CreatorDoc | null, o: { sex?: 'male' | 'female'; equipped?: Record<string, string | null> } = {}): void {
  const sex = o.sex ?? 'male';
  const slot: CreatorSlotV2 = { id: 'w1', label: 'W', body: sex, base: {}, doc: d ?? emptyCreatorDoc(), equipped: (o.equipped ?? WEAR) as CreatorSlotV2['equipped'] };
  applyIdentity(s, identityFrom({ look: { face: { ...defaultFace(), creatorSlots: [slot], activeSlot: 'w1' }, equipped: o.equipped ?? WEAR } }, HERO(sex), null));
}
const dressed = (raw: unknown[], extra: Partial<CreatorDoc> = {}): CreatorDoc => ({ ...emptyCreatorDoc(), ...extra, clothes: sanitizeClothes(raw) });
const bodyOf = (s: SpawnedCharacter) => s.meshes.find((m) => /^Body/.test(m.name)) as Mesh;

// ── the extreme poses ────────────────────────────────────────────────────────────────────────────────────────────────
type Pose = { name: string; set: (s: SpawnedCharacter) => AnimationGroup | null };
const POSES: Pose[] = [
  { name: 'rest', set: () => null },
  { name: 'gather crouch', set: (s) => at(buildChargeGather(scene, s.skeleton!), Infinity) },
  { name: 'dunk hang (arms up)', set: (s) => at(buildScoreHang(scene, s.skeleton!), 0.5) },
  { name: 'Spider-Man crouch', set: (s) => at(buildCelebSpidermanSplits(scene, s.skeleton!), 0.95) },
  { name: 'splits', set: (s) => at(buildCelebSpidermanSplits(scene, s.skeleton!), CELEB_SPIDERMAN_SEC) },
];
function at(g: AnimationGroup | null, sec: number): AnimationGroup | null {
  if (!g) return null;
  g.start(false, 1, g.from, g.to, false);
  g.goToFrame(Number.isFinite(sec) ? Math.min(g.to, sec * 30) : g.to);
  g.pause();
  return g;
}
const restOf = new WeakMap<TransformNode, { p: Vector3; q: Quaternion | null }[]>();
function resetPose(s: SpawnedCharacter): void {
  for (const g of [...scene.animationGroups]) { g.stop(); g.dispose(); }
  const nodes = s.skeleton!.bones.map((b) => b.getTransformNode()).filter(Boolean) as TransformNode[];
  let saved = restOf.get(s.root);
  if (!saved) { saved = nodes.map((nd) => ({ p: nd.position.clone(), q: nd.rotationQuaternion?.clone() ?? null })); restOf.set(s.root, saved); return; }
  nodes.forEach((nd, i) => { nd.position.copyFrom(saved![i].p); nd.rotationQuaternion = saved![i].q?.clone() ?? null; });
}
function settle(s: SpawnedCharacter): void {
  s.root.computeWorldMatrix(true);
  for (const t of s.root.getDescendants(false) as TransformNode[]) t.computeWorldMatrix?.(true);
  for (const m of [bodyOf(s), clothMeshOf(s.root)]) m?.skeleton?.prepare(true);
}

/** Body vertices still drawn inside a covered region that stick out through the nearest garment triangle (posed). */
function pokes(s: SpawnedCharacter, doc: CreatorDoc): { checked: number; out: number; worst: number } {
  const body = bodyOf(s), cloth = clothMeshOf(s.root)!;
  const F = clothFieldOf(body)!;
  const geo = buildClothes(F, doc.clothes!, 'desktop');
  const B = skinnedWorld(body)!, G = skinnedWorld(cloth)!;
  const gi = cloth.getIndices()!;
  // the garment's triangles (body-derived pieces only: a tube is measured on its own), filed in 4 cm cells
  const cell = 0.04, grid = new Map<string, number[]>();
  const key = (i: number, j: number, k: number) => `${i},${j},${k}`;
  for (let t = 0; t < gi.length; t += 3) {
    if (geo.from[gi[t]] < 0) continue;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) { const v = gi[t + k] * 3; x0 = Math.min(x0, G.P[v]); x1 = Math.max(x1, G.P[v]); y0 = Math.min(y0, G.P[v + 1]); y1 = Math.max(y1, G.P[v + 1]); z0 = Math.min(z0, G.P[v + 2]); z1 = Math.max(z1, G.P[v + 2]); }
    for (let i = Math.floor((x0 - 0.05) / cell); i <= Math.floor((x1 + 0.05) / cell); i++) for (let j = Math.floor((y0 - 0.05) / cell); j <= Math.floor((y1 + 0.05) / cell); j++) for (let k = Math.floor((z0 - 0.05) / cell); k <= Math.floor((z1 + 0.05) / cell); k++) {
      const kk = key(i, j, k); let a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(t);
    }
  }
  const covered = new Uint8Array(F.n);
  for (const c of doc.clothes!) {
    const r = resolveCloth(c);
    if (r.kind === 'bottom' && r.style === 'skirt') continue;
    const f = keepField(F, r);
    for (let v = 0; v < F.n; v++) if (f[v] < -0.004) covered[v] = 1;   // inside, not on the cut itself
  }
  let checked = 0, out = 0, worst = 0;
  for (let v = 0; v < F.n; v++) {
    if (!covered[v] || geo.bodyHide[v]) continue;
    const x = B.P[v * 3], y = B.P[v * 3 + 1], z = B.P[v * 3 + 2];
    const cands = grid.get(key(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)));
    if (!cands) continue;
    // bodyMask's own test: the nearest garment triangle the skin vertex PROJECTS INTO and that faces the same way as the
    // skin (a neighbouring finger's glove, or the far wall of a sleeve, is not the cloth over this skin)
    let best = Infinity, sd = 0;
    for (const t of cands) {
      const a = gi[t] * 3, b = gi[t + 1] * 3, c = gi[t + 2] * 3;
      const e1x = G.P[b] - G.P[a], e1y = G.P[b + 1] - G.P[a + 1], e1z = G.P[b + 2] - G.P[a + 2];
      const e2x = G.P[c] - G.P[a], e2y = G.P[c + 1] - G.P[a + 1], e2z = G.P[c + 2] - G.P[a + 2];
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz); if (l < 1e-12) continue;
      nx /= l; ny /= l; nz /= l;
      const vn = G.N[a] + G.N[b] + G.N[c], vnx = G.N[a] + G.N[b] + G.N[c];
      if (nx * vnx + ny * (G.N[a + 1] + G.N[b + 1] + G.N[c + 1]) + nz * (G.N[a + 2] + G.N[b + 2] + G.N[c + 2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      void vn;
      if (nx * B.N[v * 3] + ny * B.N[v * 3 + 1] + nz * B.N[v * 3 + 2] < 0.3) continue;
      const px = x - G.P[a], py = y - G.P[a + 1], pz = z - G.P[a + 2];
      const d = px * nx + py * ny + pz * nz;
      // barycentric of the projection
      const qx = px - d * nx, qy = py - d * ny, qz = pz - d * nz;
      const d00 = e1x * e1x + e1y * e1y + e1z * e1z, d01 = e1x * e2x + e1y * e2y + e1z * e2z, d11 = e2x * e2x + e2y * e2y + e2z * e2z;
      const d20 = qx * e1x + qy * e1y + qz * e1z, d21 = qx * e2x + qy * e2y + qz * e2z, den = d00 * d11 - d01 * d01;
      if (Math.abs(den) < 1e-14) continue;
      const bv = (d11 * d20 - d01 * d21) / den, bw = (d00 * d21 - d01 * d20) / den, bu = 1 - bv - bw;
      if (bu < -0.1 || bv < -0.1 || bw < -0.1) continue;
      if (Math.abs(d) < best) { best = Math.abs(d); sd = d; }
    }
    if (best > 0.05) continue;
    checked++;
    if (sd > 0.001) { out++; worst = Math.max(worst, sd); if (process.env.FEL_POKE_DEBUG && out < 25) console.info(`poke v${v} h ${F.h[v].toFixed(3)} x ${F.x[v].toFixed(3)} sArm ${F.sArm[v].toFixed(3)} face ${F.faceW[v].toFixed(2)} head ${F.headW[v].toFixed(2)} neck ${F.neckW[v].toFixed(2)} torso ${F.torsoW[v].toFixed(2)} arm ${F.armW[v].toFixed(2)} hand ${F.handW[v].toFixed(2)} leg ${F.legW[v].toFixed(2)} foot ${F.footW[v].toFixed(2)} sd ${(sd * 1000).toFixed(1)}mm`); }
  }
  return { checked, out, worst };
}

const OUTFIT = [
  { id: 'p', kind: 'bottom', style: 'pants', colour: '#222222', colour2: '#FFFFFF' },
  { id: 'g', kind: 'gloves', style: 'gloves', colour: '#111111' },
  { id: 't', kind: 'top', style: 'tee', colour: '#CC0000', colour2: '#FFFFFF' },
  { id: 'j', kind: 'top', style: 'jacket', colour: '#1B3A8A', hood: 'up' },
  { id: 'f', kind: 'feet', style: 'boots', colour: '#333333', colour2: '#EEEEEE' },
];

describe('every style of every kind builds on both kits', () => {
  for (const sex of ['male', 'female'] as const) {
    for (const kind of CLOTH_KINDS) for (const style of CLOTH_STYLES[kind]) {
      it(`${sex}: ${style}`, () => {
        const s = spawn(sex);
        const doc = dressed([{ id: 'c1', kind, style, colour: '#C04020', colour2: '#F0F0F0' }]);
        const count0 = s.meshes.length;
        wear(s, doc, { sex });
        const cloth = clothMeshOf(s.root)!;
        const body = bodyOf(s);
        expect(cloth).toBeTruthy();
        expect(cloth.skeleton).toBe(body.skeleton);
        expect(cloth.isPickable).toBe(false);
        expect(cloth.checkCollisions).toBe(false);
        expect(s.meshes.length).toBe(count0);
        expect(s.meshes).not.toContain(cloth);
        const nv = cloth.getTotalVertices();
        expect(nv).toBeGreaterThan(300);
        expect(nv).toBeLessThan(9_000);
        const J = cloth.getVerticesData(VertexBuffer.MatricesIndicesKind)!, W = cloth.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
        for (let v = 0; v < nv; v++) {
          const sum = W[v * 4] + W[v * 4 + 1] + W[v * 4 + 2] + W[v * 4 + 3];
          expect(Math.abs(sum - 1)).toBeLessThan(1e-4);
          for (let k = 0; k < 4; k++) { expect(J[v * 4 + k]).toBeGreaterThanOrEqual(0); expect(J[v * 4 + k]).toBeLessThan(body.skeleton!.bones.length); }
        }
        // where the cuts land, on this body's own measurements (rest space)
        const F = clothFieldOf(body)!;
        const geo = buildClothes(F, doc.clothes!, 'desktop');
        const r = resolveCloth(doc.clothes![0]);
        let hLo = Infinity, hHi = -Infinity, sMax = -Infinity;
        for (let v = 0; v < geo.P.length / 3; v++) {
          const h = geo.P[v * 3] * F.L.up[0] + geo.P[v * 3 + 1] * F.L.up[1] + geo.P[v * 3 + 2] * F.L.up[2];
          hLo = Math.min(hLo, h); hHi = Math.max(hHi, h);
          if (geo.from[v] >= 0) sMax = Math.max(sMax, F.sArm[geo.from[v]]);
        }
        if (kind === 'top' && r.sleeve !== 'none') expect(sMax).toBeLessThanOrEqual(sleeveReach(r.sleeve, F.L.arm.L.len, Math.max(F.L.arm.L.hand, F.L.arm.R.hand)) + 0.03);
        if (kind === 'bottom') { expect(hHi).toBeLessThanOrEqual(riseHeight(r.rise, F.L) + 0.05); expect(hLo).toBeGreaterThanOrEqual(legCutHeight(r.leg, F.L) - 0.06); }
        if (kind === 'feet') expect(hHi).toBeLessThanOrEqual(shaftHeight(r.shaft, F.L) + 0.03);
        if (kind === 'gloves') expect(hLo).toBeGreaterThan(F.L.crotch);
        console.info(`[4e build] ${sex} ${style}: ${nv} vertices, ${cloth.getTotalIndices() / 3} triangles, ${geo.bodyHide.reduce((a, b) => a + b, 0)} body vertices hidden`);
        s.root.dispose();
        expect(cloth.isDisposed()).toBe(true);
      });
    }
  }
});

describe('where the cuts are, and what stays drawn', () => {
  for (const sex of ['male', 'female'] as const) {
    it(`${sex}: a sleeve is whole from the shoulder to its cuff (no cut along an arm held above the base of the neck)`, async () => {
      const { openEdges } = await import('./build');
      const { blend3, bodyCMesh, clipKeep } = await import('./clip');
      const s = spawn(sex);
      const F = clothFieldOf(bodyOf(s))!;
      for (const raw of [{ style: 'longsleeve' }, { style: 'jacket' }, { style: 'hoodie', hood: 'up' }, { style: 'highneck' }, { style: 'tee', sleeve: 'elbow', neck: 'v' }]) {
        const c = resolveCloth(sanitizeClothes([{ id: 'c1', kind: 'top', colour: '#111111', ...raw }])[0]);
        const pm = clipKeep(bodyCMesh(F.n, F.ind), keepField(F, c)).mesh;
        const e = openEdges(blend3(pm, F.P), pm.tris);
        const reach = sleeveReach(c.sleeve, F.L.arm.L.len, Math.min(F.L.arm.L.hand, F.L.arm.R.hand));
        let onArm = 0;
        for (let i = 0; i < e.points.length; i += 3) {
          const x = e.points[i] - F.L.mid[0];
          const a = x >= 0 ? F.L.arm.L : F.L.arm.R;
          const sArm = (e.points[i] - a.o[0]) * a.d[0] + (e.points[i + 1] - a.o[1]) * a.d[1] + (e.points[i + 2] - a.o[2]) * a.d[2];
          if (sArm > 0.06 && sArm < reach - 0.03) onArm++;
        }
        expect(onArm, `${sex} ${raw.style}`).toBe(0);
      }
      s.root.dispose();
    });
    it(`${sex}: the skin within the margin of a hem stays drawn; the skin deep inside is hidden`, () => {
      const s = spawn(sex);
      const F = clothFieldOf(bodyOf(s))!;
      const clothes = sanitizeClothes([{ id: 't', kind: 'top', style: 'tee', colour: '#111111' }, { id: 'p', kind: 'bottom', style: 'shorts', colour: '#222222' }, { id: 'f', kind: 'feet', style: 'boots', colour: '#222222' }]);
      for (const c of clothes) {
        const geo = buildClothes(F, [c], 'desktop');   // each alone: another piece may hide what this one keeps
        const r = resolveCloth(c);
        const f = keepField(F, r);
        let deepInside = 0, nearEdgeHidden = 0;
        for (let v = 0; v < F.n; v++) {
          if (f[v] > 0) continue;
          // a body vertex 1 cm or less inside the hem / cuff / neckline (the field is metric there) is near an edge
          if (f[v] > -0.01 && geo.bodyHide[v]) nearEdgeHidden++;
          if (f[v] < -0.08 && geo.bodyHide[v]) deepInside++;
        }
        expect(nearEdgeHidden, `${sex} ${c.style} near its edges`).toBe(0);
        expect(deepInside, `${sex} ${c.style} deep`).toBeGreaterThan(100);
      }
      s.root.dispose();
    });
    it(`${sex}: a loose fit is smoothed but never pulled towards the skin (each original vertex keeps ≥ 85 % of its offset)`, async () => {
      const { bodyCMesh, clipKeep } = await import('./clip');
      const s = spawn(sex);
      const F = clothFieldOf(bodyOf(s))!;
      for (const raw of [{ kind: 'top', style: 'hoodie', fit: 1 }, { kind: 'bottom', style: 'pants', fit: 1 }]) {
        const clothes = sanitizeClothes([{ id: 'c1', colour: '#111111', ...raw }]);
        const geo = buildClothes(F, clothes, 'desktop');
        // the cloth vertices that ARE a body vertex (not a cut point): the piece's own clip says which body vertices are kept whole
        const kept = clipKeep(bodyCMesh(F.n, F.ind), keepField(F, resolveCloth(clothes[0]))).mesh;
        const whole = new Set<number>();
        for (let v = 0; v < kept.n; v++) if (kept.vw[v * 4] === 1) whole.add(kept.vi[v * 4]);
        let worst = Infinity, n = 0;
        for (let v = 0; v < geo.from.length; v++) {
          const b = geo.from[v];
          if (b < 0 || !whole.has(b) || !(geo.off[v] > 0)) continue;
          const d = (geo.P[v * 3] - F.P[b * 3]) * F.N[b * 3] + (geo.P[v * 3 + 1] - F.P[b * 3 + 1]) * F.N[b * 3 + 1] + (geo.P[v * 3 + 2] - F.P[b * 3 + 2]) * F.N[b * 3 + 2];
          // a vertex can only be one of its body vertex's positions if it sits on it; the two-tone duplicates share it
          if (Math.hypot(geo.P[v * 3] - F.P[b * 3], geo.P[v * 3 + 1] - F.P[b * 3 + 1], geo.P[v * 3 + 2] - F.P[b * 3 + 2]) > geo.off[v] * 3 + 0.03) continue;
          n++; worst = Math.min(worst, d / geo.off[v]);
        }
        expect(n, `${sex} ${raw.style}`).toBeGreaterThan(500);
        expect(worst, `${sex} ${raw.style}: the smallest share of its offset a smoothed vertex kept`).toBeGreaterThanOrEqual(0.85 - 1e-3);   // float32 positions
      }
      s.root.dispose();
    });
    it(`${sex}: footwear never sinks more than 2 mm below the skin it covers; a tube never tucks in going down`, async () => {
      const { tubeRadii } = await import('./build');
      const s = spawn(sex);
      const F = clothFieldOf(bodyOf(s))!;
      const geo = buildClothes(F, sanitizeClothes([{ id: 'f', kind: 'feet', style: 'boots', colour: '#111111', fit: 1 }]), 'desktop');
      let lowest = Infinity;
      for (let v = 0; v < geo.P.length / 3; v++) lowest = Math.min(lowest, geo.P[v * 3] * F.L.up[0] + geo.P[v * 3 + 1] * F.L.up[1] + geo.P[v * 3 + 2] * F.L.up[2]);
      expect(lowest).toBeGreaterThanOrEqual(F.L.sole - 0.0025);
      const rows = Array.from({ length: 10 }, (_, i) => F.L.crotch + 0.1 - i * 0.04);
      const { r, hull } = tubeRadii(F, rows, 24, { clearance: 0.01, flare: 0.3, flareFrom: F.L.crotch + 0.05 });
      for (let i = 1; i < rows.length; i++) for (let k = 0; k < 24; k++) expect(r[i * 24 + k]).toBeGreaterThanOrEqual(r[(i - 1) * 24 + k] - 1e-6);
      for (let i = 0; i < r.length; i++) expect(r[i]).toBeGreaterThanOrEqual(hull[i] + 0.01 - 1e-6);
      s.root.dispose();
    });
  }
});

describe('the second colour lands where it says', () => {
  for (const sex of ['male', 'female'] as const) {
    it(`${sex}: a skirt's trim at its hem and waistband; a side stripe down the outside of each leg, never the inside`, () => {
      const s = spawn(sex);
      const F = clothFieldOf(bodyOf(s))!;
      const skirt = buildClothes(F, sanitizeClothes([{ id: 'k', kind: 'bottom', style: 'skirt', colour: '#552266', colour2: '#FFFFFF' }]), 'desktop');
      const ys: number[] = [];
      for (let v = 0; v < skirt.colour.length; v++) if (skirt.colour[v] === 1) ys.push(skirt.P[v * 3] * F.L.up[0] + skirt.P[v * 3 + 1] * F.L.up[1] + skirt.P[v * 3 + 2] * F.L.up[2]);
      const r = resolveCloth(sanitizeClothes([{ id: 'k', kind: 'bottom', style: 'skirt', colour: '#552266' }])[0]);
      expect(ys.length).toBeGreaterThan(40);
      expect(Math.min(...ys)).toBeCloseTo(legCutHeight(r.leg, F.L), 3);
      expect(Math.max(...ys)).toBeCloseTo(riseHeight(r.rise, F.L), 3);
      const pants = buildClothes(F, sanitizeClothes([{ id: 'p', kind: 'bottom', style: 'pants', colour: '#111111', colour2: '#FFFFFF' }]), 'desktop');
      let outer = 0, inner = 0;
      for (let v = 0; v < pants.colour.length; v++) {
        if (pants.colour[v] !== 1 || pants.from[v] < 0) continue;
        const b = pants.from[v];
        if (F.legW[b] < 0.9 || F.h[b] > F.L.knee) continue;   // the shin, well below the hips
        // the leg's own axis at this height (hip joint → ankle joint), sideways from the midline
        const leg = F.x[b] >= 0 ? F.L.leg.L : F.L.leg.R;
        const t = (F.P[b * 3 + 1] - leg.o[1]) / leg.d[1];
        const axisX = Math.abs(leg.o[0] + leg.d[0] * t - F.L.mid[0]);
        if (Math.abs(F.x[b]) > axisX + 0.015) outer++; else if (Math.abs(F.x[b]) < axisX - 0.015) inner++;
      }
      expect(outer).toBeGreaterThan(20);
      expect(inner).toBe(0);
      s.root.dispose();
    });
  }
});

describe('skinned to the right bones, painted in the right place', () => {
  for (const sex of ['male', 'female'] as const) {
    it(`${sex}: each cloth vertex rides the bone that carries the skin it was cut from`, () => {
      const s = spawn(sex);
      const doc = dressed(OUTFIT);
      wear(s, doc, { sex });
      const body = bodyOf(s), cloth = clothMeshOf(s.root)!;
      const geo = buildClothes(clothFieldOf(body)!, doc.clothes!, 'desktop');
      const bJ = body.getVerticesData(VertexBuffer.MatricesIndicesKind)!, bW = body.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
      const cJ = cloth.getVerticesData(VertexBuffer.MatricesIndicesKind)!, cW = cloth.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
      const top = (J: ArrayLike<number>, W: ArrayLike<number>, v: number) => { let j = -1, w = -1; for (let k = 0; k < 4; k++) if (W[v * 4 + k] > w) { w = W[v * 4 + k]; j = J[v * 4 + k]; } return j; };
      let same = 0, n = 0;
      for (let v = 0; v < geo.from.length; v++) { const b = geo.from[v]; if (b < 0) continue; n++; if (top(cJ, cW, v) === top(bJ, bW, b)) same++; }
      console.info(`[4e skin] ${sex}: ${same}/${n} cloth vertices share the dominant bone of their body vertex`);
      expect(same / n).toBeGreaterThan(0.95);
      s.root.dispose();
    });
  }
  it('the tubes\' swatch block is empty in the body\'s own UV layout (no body triangle paints there)', async () => {
    const { chartForBody, surfaceMapFor, geometryKey } = await import('../paint/surfaceMap');
    const { SWATCH } = await import('./build');
    for (const sex of ['male', 'female'] as const) {
      const s = spawn(sex);
      const body = bodyOf(s);
      for (const size of [512, 1024]) {
        const map = surfaceMapFor(body, chartForBody(body)!, geometryKey(body), size)!;
        const x0 = Math.floor(SWATCH.u0 * size), x1 = Math.ceil((SWATCH.u0 + 12 * SWATCH.size) * size), y0 = Math.floor(SWATCH.v0 * size), y1 = Math.ceil((SWATCH.v0 + SWATCH.size) * size);
        let labelled = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= Math.min(size - 1, x1); x++) if (map.label[y * size + x]) labelled++;
        expect(labelled, `${sex} @${size}`).toBe(0);
      }
      s.root.dispose();
    }
  });
});

describe('no poke-through: the skin still drawn in a covered region stays behind the cloth, at rest and in extreme poses', () => {
  for (const sex of ['male', 'female'] as const) {
    it(`${sex}: a full outfit (pants, gloves, a tee under a jacket with the hood up, boots)`, () => {
      const s = spawn(sex);
      const doc = dressed(OUTFIT);
      wear(s, doc, { sex });
      const rows: string[] = [];
      let worstOut = 0;
      for (const p of POSES) {
        resetPose(s);
        p.set(s);
        settle(s);
        const r = pokes(s, doc);
        rows.push(`${p.name}: ${r.checked} covered skin vertices drawn, ${r.out} through (worst ${(r.worst * 1000).toFixed(1)} mm)`);
        expect(r.checked, p.name).toBeGreaterThan(100);
        worstOut = Math.max(worstOut, r.out / r.checked);
        if (p.name === 'rest') expect(r.out, 'none at rest').toBe(0);
      }
      console.info(`[4e poke] ${sex}\n  ${rows.join('\n  ')}`);
      // in the extreme poses: at most 0.5 % of the drawn covered skin (the LBS pinch at a fully bent knee or elbow)
      expect(worstOut).toBeLessThanOrEqual(0.005);
      resetPose(s);
      s.root.dispose();
    });
  }
  it('the skin deep inside is not drawn: the body mask drops every triangle whose corners the clothes hide', () => {
    const s = spawn('male');
    const doc = dressed(OUTFIT);
    wear(s, doc);
    settle(s);
    const body = bodyOf(s);
    const res = maskBodyNow(body, s.meshes)!;
    const hide = (body.metadata as { felClothHide: Uint8Array }).felClothHide;
    const ind = body.getIndices()!;
    for (let t = 0; t < ind.length; t += 3) expect(hide[ind[t]] && hide[ind[t + 1]] && hide[ind[t + 2]]).toBeFalsy();
    expect(res.hiddenBySlot.clothes).toBeGreaterThan(5000);
    console.info(`[4e mask] body triangles ${res.trisBefore} → ${res.trisAfter} drawn under the full outfit`);
    s.root.dispose();
  });
  it('a skirt and a long coat clear the body at rest; their pokes in the poses are measured', () => {
    for (const sex of ['male', 'female'] as const) {
      const s = spawn(sex);
      const doc = dressed([{ id: 'k', kind: 'bottom', style: 'skirt', colour: '#552266' }, { id: 'c', kind: 'top', style: 'jacket', colour: '#222222', hem: 'knee' }]);
      wear(s, doc, { sex });
      const cloth = clothMeshOf(s.root)!;
      const geo = buildClothes(clothFieldOf(bodyOf(s))!, doc.clothes!, 'desktop');
      const rows: string[] = [];
      for (const p of POSES) {
        resetPose(s); p.set(s); settle(s);
        const B = skinnedWorld(bodyOf(s))!, G = skinnedWorld(cloth)!;
        // each tube ring's centre and radius; a thigh / shin vertex inside the ring's height band and outside its radius pokes
        const F = clothFieldOf(bodyOf(s))!;
        let out = 0, checked = 0;
        const tubeV: number[] = [];
        for (let v = 0; v < geo.from.length; v++) if (geo.from[v] < 0) tubeV.push(v);
        const ys = tubeV.map((v) => G.P[v * 3 + 1]);
        const yLo = Math.min(...ys), yHi = Math.max(...ys);
        for (let v = 0; v < F.n; v++) {
          if (F.legW[v] < 0.5 || geo.bodyHide[v]) continue;
          const y = B.P[v * 3 + 1];
          if (y < yLo + 0.03 || y > yHi - 0.03) continue;
          // the nearest tube vertex: the skin is outside if it is farther from the tube's axis than that vertex
          let best = Infinity, bv = -1;
          for (const t of tubeV) { const d = Math.hypot(G.P[t * 3] - B.P[v * 3], G.P[t * 3 + 1] - y, G.P[t * 3 + 2] - B.P[v * 3 + 2]); if (d < best) { best = d; bv = t; } }
          if (best > 0.12) continue;
          checked++;
          const nx = G.N[bv * 3], ny = G.N[bv * 3 + 1], nz = G.N[bv * 3 + 2];
          if ((B.P[v * 3] - G.P[bv * 3]) * nx + (y - G.P[bv * 3 + 1]) * ny + (B.P[v * 3 + 2] - G.P[bv * 3 + 2]) * nz > 0.002) out++;
        }
        rows.push(`${p.name}: ${out}/${checked} leg vertices outside the tubes`);
        if (p.name === 'rest') expect(out, `${sex} rest`).toBe(0);
      }
      console.info(`[4e tube poke] ${sex}\n  ${rows.join('\n  ')}`);
      resetPose(s);
      s.root.dispose();
    }
  });
});

describe('layers', () => {
  it('a later piece is outside an earlier one where they overlap; an inner piece is culled deep under an outer one', () => {
    const s = spawn('male');
    const body = bodyOf(s);
    const F = clothFieldOf(body)!;
    const clothes = sanitizeClothes([{ id: 't', kind: 'top', style: 'tee', colour: '#111111', fit: 0.8 }, { id: 'j', kind: 'top', style: 'jacket', colour: '#222222', fit: 0 }]);
    const geo = buildClothes(F, clothes, 'desktop');
    const [tee, jacket] = geo.pieces;
    expect(jacket.offset[1]).toBeGreaterThan(tee.offset[1]);
    expect(tee.culled).toBeGreaterThan(1000);
    // per body vertex: where both have a vertex from it, every jacket vertex from it is at least LAYER_GAP outside the tee's
    const teeMax = new Map<number, number>(), jacketMin = new Map<number, number>();
    for (let v = 0; v < tee.verts; v++) if (geo.from[v] >= 0) teeMax.set(geo.from[v], Math.max(teeMax.get(geo.from[v]) ?? 0, geo.off[v]));
    for (let v = tee.verts; v < tee.verts + jacket.verts; v++) if (geo.from[v] >= 0) jacketMin.set(geo.from[v], Math.min(jacketMin.get(geo.from[v]) ?? Infinity, geo.off[v]));
    let both = 0, worst = Infinity;
    for (const [v, o] of teeMax) { const j = jacketMin.get(v); if (j === undefined) continue; both++; worst = Math.min(worst, j - o); }
    console.info(`[4e layers] ${both} body vertices under both; the jacket's smallest clearance over the tee ${(worst * 1000).toFixed(1)} mm`);
    expect(worst).toBeGreaterThanOrEqual(LAYER_GAP - 1e-6);
    expect(both).toBeGreaterThan(100);
    // the other order: the jacket under a loose tee (tucked into nothing, but legal) puts the tee outside
    const swapped = buildClothes(F, [clothes[1], clothes[0]], 'desktop');
    expect(swapped.pieces[1].offset[0]).toBeGreaterThan(swapped.pieces[0].offset[0] - 1e-9);
    s.root.dispose();
  });
});

describe('the shape morph shapes the clothes', () => {
  it('one target on the cloth mesh, influence 1, and the chest pushed out with the skin', () => {
    const s = spawn('male');
    const doc = dressed([{ id: 't', kind: 'top', style: 'tee', colour: '#111111' }], { shape: { face: {}, body: {}, girth: { chest: 1.4 } } });
    wear(s, doc);
    const cloth = clothMeshOf(s.root)!;
    const t = shapeTargetOf(cloth)!;
    expect(t).toBeTruthy();
    expect(t.influence).toBe(1);
    expect(cloth.morphTargetManager!.numTargets).toBe(1);
    // the chest's morph moves the cloth outward (in its own vertex space, along the body's front)
    const base = cloth.getVerticesData(VertexBuffer.PositionKind)!, moved = t.getPositions()!;
    let maxZ = 0;
    for (let v = 0; v < base.length / 3; v++) maxZ = Math.max(maxZ, moved[v * 3 + 2] - base[v * 3 + 2]);
    expect(maxZ).toBeGreaterThan(0.02);
    // the body keeps its 7 face morphs + 1 shape: within the WebGL1 cap of 8, nothing added for the clothes
    expect(bodyOf(s).morphTargetManager!.numTargets).toBeLessThanOrEqual(8);
    s.root.dispose();
  });
});

describe('the kit interplay', () => {
  const shown = (s: SpawnedCharacter, slot: string) => s.meshes.filter((m) => kitOf(m.name)?.slot === slot && m.isVisible).map((m) => kitOf(m.name)!.itemId);
  it('a built top hides the kit top (the Closet pick too); an empty slot keeps the pick; gloves replace nothing', () => {
    const s = spawn('male');
    wear(s, dressed([{ id: 't', kind: 'top', style: 'hoodie', colour: '#111111' }, { id: 'g', kind: 'gloves', style: 'gloves', colour: '#111111' }]), { equipped: { tops: 'top_bonds', shorts: 'shorts_glitch', shoes: 'shoes_evo' } });
    expect(shown(s, 'tops')).toEqual([]);
    expect(shown(s, 'shorts')).toEqual(['shorts_glitch']);
    expect(shown(s, 'shoes')).toEqual(['shoes_evo']);
    expect(s.root.metadata.felClothes.covered).toEqual(['tops']);
    // take the clothes off: the bought top shows again
    wear(s, null, { equipped: { tops: 'top_bonds', shorts: 'shorts_glitch', shoes: 'shoes_evo' } });
    expect(shown(s, 'tops')).toEqual(['top_bonds']);
    expect(clothMeshOf(s.root)).toBeNull();
    s.root.dispose();
  });
  it('a sport\'s uniform only fills a slot the player left empty', () => {
    scene.metadata = { felTier: 'desktop', felModeId: 'karate' };
    try {
      const s = spawn('male');
      wear(s, dressed([{ id: 'p', kind: 'bottom', style: 'pants', colour: '#111111' }]), { equipped: {} });
      expect(shown(s, 'shorts')).toEqual([]);
      expect(shown(s, 'tops')).toEqual(['top_lab']);    // karate's default top
      expect(shown(s, 'shoes')).toEqual(['shoes_evo']);  // karate's default shoe
      s.root.dispose();
    } finally { scene.metadata = { felTier: 'desktop' }; }
  });
  it('a kit pack that lands after the clothes went on stays hidden (the covered slot is remembered on the body)', () => {
    const s = spawn('male');
    const kitMeshes = s.meshes.filter((m) => kitOf(m.name));
    applyKit(s.meshes, { tops: 'top_lab' }, null, { covered: new Set(['tops']) });
    expect(kitSlotCovered(kitMeshes.find((m) => kitOf(m.name)!.slot === 'tops')!, 'tops')).toBe(true);
    expect(kitSlotCovered(kitMeshes[0], 'shoes')).toBe(false);
    applyKit(s.meshes, { tops: 'top_lab' });
    expect(kitSlotCovered(kitMeshes.find((m) => kitOf(m.name)!.slot === 'tops')!, 'tops')).toBe(false);
    s.root.dispose();
  });
  it('the hair goes under a raised hood and comes back when it is down', () => {
    const s = spawn('male');
    const hair = () => s.meshes.filter((m) => /^Hair_/.test(m.name) && m.isVisible).length;
    wear(s, null);
    expect(hair()).toBe(1);
    wear(s, dressed([{ id: 'h', kind: 'top', style: 'hoodie', colour: '#111111', hood: 'up' }]));
    expect(hair()).toBe(0);
    wear(s, dressed([{ id: 'h', kind: 'top', style: 'hoodie', colour: '#111111' }]));
    expect(hair()).toBe(1);
    s.root.dispose();
  });
});

describe('paint reaches the clothes', () => {
  it('a garments layer paints the cloth mesh with the body\'s surface map at the garment size; vertex colours off while bound', () => {
    const s = spawn('female');
    const doc = dressed([{ id: 't', kind: 'top', style: 'tee', colour: '#CC0000' }], {
      paint: [{ id: 'l1', type: 'pattern', pattern: 'stripes', region: 'torsoFront', surface: 'garments', at: { x: 0.5, y: 0.5, rot: 0, scale: 1, stretch: 1 }, colours: ['#FFFFFF'], opacity: 1, mirror: false }],
    });
    wear(s, doc, { sex: 'female' });
    flushPaint(s.root);
    const cloth = clothMeshOf(s.root)!;
    const st = paintStats(s.root)!;
    const t = st.targets.find((x) => x.mesh === cloth.name)!;
    expect(t).toBeTruthy();
    expect(t.size).toBe(1024);
    expect(t.bound).toBe(true);
    expect(cloth.useVertexColors).toBe(false);
    // the layer comes off: the vertex colours are back
    wear(s, dressed([{ id: 't', kind: 'top', style: 'tee', colour: '#CC0000' }]), { sex: 'female' });
    expect(cloth.useVertexColors).toBe(true);
    s.root.dispose();
  });
});

describe('cached by inputs, one draw', () => {
  it('the same doc rebuilds nothing; a colour change rewrites colours only; any other change a new mesh; the LRU is bounded', async () => {
    resetClothCaches();
    const s = spawn('male');
    const a = dressed([{ id: 't', kind: 'top', style: 'tee', colour: '#111111' }]);
    wear(s, a);
    const m1 = clothMeshOf(s.root)!;
    expect(syncClothes(s, a)!.rebuilt).toBe(false);
    const recolour = dressed([{ id: 't', kind: 'top', style: 'tee', colour: '#EE2222' }]);
    const r = syncClothes(s, recolour)!;
    expect(r.rebuilt).toBe(false);
    expect(clothMeshOf(s.root)).toBe(m1);
    const col = m1.getVerticesData(VertexBuffer.ColorKind)!;
    expect(col[0]).toBeCloseTo(0xEE / 255, 4);
    const longer = dressed([{ id: 't', kind: 'top', style: 'tee', colour: '#EE2222', sleeve: 'long' }]);
    expect(syncClothes(s, longer)!.rebuilt).toBe(true);
    expect(m1.isDisposed()).toBe(true);
    for (const sleeve of ['none', 'cap', 'elbow', 'threeQuarter', 'knuckles', 'short', 'long']) syncClothes(s, dressed([{ id: 't', kind: 'top', style: 'tee', colour: '#EE2222', sleeve }]));
    expect(clothCacheStats().entries).toBeLessThanOrEqual(CLOTH_CACHE_MAX);
    // the shape morph's per-kit cache does not grow with every rebuilt garment (a sleeve drag)
    const { shapeCacheStats } = await import('../shape/renderShape');
    const shaped = (sleeve: string) => dressed([{ id: 't', kind: 'top', style: 'tee', colour: '#EE2222', sleeve }], { shape: { face: {}, body: {}, girth: { chest: 1.2 } } });
    syncClothes(s, shaped('long'));
    const { syncShape } = await import('../shape/renderShape');
    syncShape({ ...s, meshes: [...s.meshes, clothMeshOf(s.root)!] }, shaped('long'));
    const preps0 = shapeCacheStats().preps;
    for (const sleeve of ['none', 'cap', 'elbow', 'threeQuarter']) { syncClothes(s, shaped(sleeve)); syncShape({ ...s, meshes: [...s.meshes, clothMeshOf(s.root)!] }, shaped(sleeve)); }
    expect(shapeCacheStats().preps).toBe(preps0);
    // one mesh, one material, however many pieces
    syncClothes(s, dressed(OUTFIT));
    const cloths = s.root.getChildMeshes(false).filter((m) => (m.metadata as { felCloth?: boolean } | null)?.felCloth);
    expect(cloths).toHaveLength(1);
    expect(new Set(cloths.map((m) => m.material)).size).toBe(1);
    s.root.dispose();
  });
});

describe('measured: draws, vertices, memory per outfit (logged for the report)', () => {
  it('each piece alone and the full outfit, on both kits', () => {
    const rows: string[] = [];
    for (const sex of ['male', 'female'] as const) {
      const s = spawn(sex);
      const body = bodyOf(s);
      const F = clothFieldOf(body)!;
      for (const [name, raw] of [['tee', [OUTFIT[2]]], ['jacket+hood', [OUTFIT[3]]], ['pants', [OUTFIT[0]]], ['gloves', [OUTFIT[1]]], ['boots', [OUTFIT[4]]], ['full outfit', OUTFIT]] as [string, unknown[]][]) {
        for (const tier of ['desktop', 'mobile'] as const) {
          const t0 = performance.now();
          const geo = buildClothes(F, sanitizeClothes(raw), tier);
          const ms = performance.now() - t0;
          const bytes = geo.P.byteLength + geo.N.byteLength + geo.UV.byteLength + geo.J.byteLength + geo.W.byteLength + geo.ind.byteLength + geo.P.length / 3 * 16;
          rows.push(`${sex} ${name.padEnd(12)} ${tier.padEnd(7)}: ${geo.P.length / 3} verts, ${geo.ind.length / 3} tris, ${geo.bodyHide.reduce((a, b) => a + b, 0)} body verts hidden, GPU ~${(bytes / 1024).toFixed(0)} KiB, built in ${ms.toFixed(0)} ms`);
        }
      }
      s.root.dispose();
    }
    console.info(`[4e budget]\n${rows.join('\n')}`);
  });
  it(`HIDE_MARGIN is ${HIDE_MARGIN * 100} cm (the skin near a hem stays drawn)`, () => { expect(HIDE_MARGIN).toBeGreaterThan(0.01); });
});

// keep the type imports honest
export type { AbstractMesh, CreatorCloth, Skeleton };
