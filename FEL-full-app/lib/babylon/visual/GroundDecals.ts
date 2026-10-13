// GROUND DECALS (vis-foundation-2 A9.14, routed from vis-combat 2026-10-13) — scuffs and footprints, pooled.
//
// The audit (A4): "Missing: decals (scuffs, tyre marks, footprints)". A planted cut, a slide, a fighter's pivot leaves
// nothing on the floor, so a hard-fought round looks exactly like the first second of it. This is one shared pool per
// scene: a flat quad per kind (scuff, foot), every live mark a THIN INSTANCE of it — one draw per kind however many marks
// are down — in a ring buffer (the oldest mark is reused when the pool is full), each fading out over its life through a
// per-instance colour. The textures are painted in code. Modes stamp through `scene.metadata.felDecals` (mounted by the
// rig after load on the wave-2 modes): `felDecals.stamp('scuff', x, z, yaw)`.
//
// Lying a hair over the floor with a depth offset (no z-fight), unlit-ish (a dark multiply read), never casting, never
// pickable. Phones get a smaller pool and shorter lives.

import { Color3, DynamicTexture, Matrix, MeshBuilder, Quaternion, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Mesh, Observer, Scene } from '@babylonjs/core';
import type { QualityTier } from '../scene/QualityTier';
import { sceneModeId, wave2Look } from '../scene/lookPolicy';

export type DecalKind = 'scuff' | 'foot' | 'tyre';
export const DECAL_KINDS: readonly DecalKind[] = ['scuff', 'foot', 'tyre'];
/** Live marks per kind, per tier. */
export function decalCap(tier: QualityTier): number { return tier === 'mobile' ? 24 : 64; }
/** Seconds a mark lasts (fully visible for the first 60 %, then fading). */
export function decalLife(tier: QualityTier): number { return tier === 'mobile' ? 8 : 18; }
/** Default footprint of each kind, metres (width, length). */
/** `tyre` (vis-race, wave 2): a pair of rubber streaks the width of a kart's rear track (1.32 m between tyre centres), 2.2 m long,
 *  stamped end to end along a slide or a burnout. */
export const DECAL_SIZE: Record<DecalKind, [number, number]> = { scuff: [0.5, 1.1], foot: [0.13, 0.3], tyre: [1.62, 2.2] };

/** Pure: a mark's opacity `age` seconds into a `life`-second life. */
export function decalAlpha(age: number, life: number): number {
  if (age < 0 || age >= life) return 0;
  const k = age / life;
  return k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
}

/** Pure: the ring buffer — the slot the next stamp takes. */
export function nextSlot(cursor: number, cap: number): number { return (cursor + 1) % cap; }

function paint(scene: Scene, kind: DecalKind): DynamicTexture {
  const S = 128;
  const tex = new DynamicTexture(`fel_decal_${kind}`, { width: S, height: S }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.clearRect(0, 0, S, S);
  if (kind === 'tyre') {
    // two tyre tracks: dark rubber, ragged edges, and the ends faded so stamps laid end to end read as
    // one unbroken streak (the pair sits at u = 0.093 and 0.907 of a 1.62 m quad: 1.32 m apart, a kart's rear tyres)
    for (const cx of [S * 0.093, S * 0.907]) {
      // a pale rubber-dust shoulder either side (a skid on dark asphalt reads by its edge: the core alone is black on near-black)
      const sh = g.createLinearGradient(0, 0, 0, S);
      sh.addColorStop(0, 'rgba(150,140,128,0)'); sh.addColorStop(0.2, 'rgba(150,140,128,0.12)'); sh.addColorStop(0.8, 'rgba(150,140,128,0.12)'); sh.addColorStop(1, 'rgba(150,140,128,0)');
      g.fillStyle = sh; g.fillRect(cx - 17, 0, 34, S);
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, 'rgba(6,5,5,0)'); gr.addColorStop(0.18, 'rgba(6,5,5,0.85)'); gr.addColorStop(0.82, 'rgba(6,5,5,0.85)'); gr.addColorStop(1, 'rgba(6,5,5,0)');
      g.fillStyle = gr; g.fillRect(cx - 10, 0, 20, S);
      // rubber laid down unevenly: ragged notches out of the core (no regular tread ladder — it read as a tank track)
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 38; i++) {
        const y = (i * 37) % S, w = 3 + ((i * 7) % 6), x = cx - 10 + ((i * 13) % 17);
        g.fillStyle = `rgba(0,0,0,${0.18 + ((i * 5) % 4) * 0.08})`; g.fillRect(x, y, w, 2 + (i % 4));
      }
      g.globalCompositeOperation = 'source-over';
    }
  } else if (kind === 'scuff') {
    // a dragged smear: a soft dark streak, ragged at the ends
    for (let i = 0; i < 14; i++) {
      const x = S * (0.35 + 0.3 * Math.sin(i * 1.7)), w = 6 + (i % 4) * 3;
      const gr = g.createLinearGradient(0, 8, 0, S - 8);
      gr.addColorStop(0, 'rgba(20,16,12,0)'); gr.addColorStop(0.25, 'rgba(20,16,12,0.22)'); gr.addColorStop(0.8, 'rgba(20,16,12,0.3)'); gr.addColorStop(1, 'rgba(20,16,12,0)');
      g.fillStyle = gr; g.fillRect(x, 8 + (i % 3) * 4, w, S - 20);
    }
  } else {
    // a shoe print: the sole and the heel, with tread bars
    g.fillStyle = 'rgba(18,14,12,0.42)';
    g.beginPath(); g.ellipse(S / 2, S * 0.33, S * 0.2, S * 0.27, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(S / 2, S * 0.78, S * 0.15, S * 0.16, 0, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.5)';
    for (let y = S * 0.12; y < S * 0.58; y += 9) g.fillRect(S * 0.3, y, S * 0.4, 3);
    g.globalCompositeOperation = 'source-over';
  }
  tex.update(false);
  tex.hasAlpha = true;
  return tex;
}

export interface GroundDecalsHandle {
  /** Leave a mark at (x, z) on the floor at height `y`, turned `yaw` radians, scaled ×`scale`. */
  stamp(kind: DecalKind, x: number, z: number, yaw?: number, opts?: { y?: number; scale?: number }): void;
  /** Live marks of a kind (for probes and tests). */
  live(kind: DecalKind): number;
  dispose(): void;
}

interface Pool { mesh: Mesh; mats: Float32Array; cols: Float32Array; born: Float32Array; cursor: number; count: number }

export function mountGroundDecals(scene: Scene, tier: QualityTier): GroundDecalsHandle {
  const cap = decalCap(tier), life = decalLife(tier);
  let clock = 0;
  const pools = new Map<DecalKind, Pool>();
  const pool = (kind: DecalKind): Pool => {
    let p = pools.get(kind);
    if (p) return p;
    const mesh = MeshBuilder.CreateGround(`fel_decal_${kind}`, { width: 1, height: 1 }, scene);
    const mat = new StandardMaterial(`fel_decal_${kind}_m`, scene);
    try { mat.diffuseTexture = paint(scene, kind); mat.useAlphaFromDiffuseTexture = true; }
    catch { mat.diffuseColor = new Color3(0.08, 0.07, 0.06); mat.alpha = 0.3; }   // a canvas-less runtime (headless): a plain dark mark
    if (mat.diffuseTexture) mat.diffuseColor = Color3.White();
    mat.specularColor = Color3.Black();
    mat.zOffset = -2; mat.backFaceCulling = true;
    mesh.material = mat; mesh.isPickable = false; mesh.receiveShadows = true; mesh.alwaysSelectAsActiveMesh = true;
    mesh.hasVertexAlpha = true;
    const mats = new Float32Array(cap * 16), cols = new Float32Array(cap * 4), born = new Float32Array(cap).fill(-1e9);
    for (let i = 0; i < cap; i++) Matrix.Scaling(0, 0, 0).copyToArray(mats, i * 16);
    mesh.thinInstanceSetBuffer('matrix', mats, 16, false);
    mesh.thinInstanceSetBuffer('color', cols, 4, false);
    p = { mesh, mats, cols, born, cursor: -1, count: 0 };
    pools.set(kind, p);
    return p;
  };
  const tmp = new Matrix(), q = new Quaternion(), s = new Vector3(), t = new Vector3();
  const obs: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
    clock += Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    for (const p of pools.values()) {
      if (!p.count) continue;
      let alive = 0;
      for (let i = 0; i < cap; i++) {
        const a = decalAlpha(clock - p.born[i], life);
        if (a > 0) alive++;
        if (p.cols[i * 4 + 3] !== a) p.cols[i * 4 + 3] = a;
      }
      p.count = alive;
      p.mesh.thinInstanceBufferUpdated('color');
    }
  });
  return {
    stamp(kind, x, z, yaw = 0, opts = {}) {
      const p = pool(kind);
      p.cursor = nextSlot(p.cursor, cap);
      const [w, l] = DECAL_SIZE[kind]; const k = opts.scale ?? 1;
      s.set(w * k, 1, l * k); t.set(x, (opts.y ?? 0) + 0.012, z);
      Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, q);
      Matrix.ComposeToRef(s, q, t, tmp);
      tmp.copyToArray(p.mats, p.cursor * 16);
      p.cols.set([1, 1, 1, 1], p.cursor * 4);
      p.born[p.cursor] = clock;
      p.count = Math.min(cap, p.count + 1);
      p.mesh.thinInstanceBufferUpdated('matrix'); p.mesh.thinInstanceBufferUpdated('color');
    },
    live(kind) { const p = pools.get(kind); if (!p) return 0; let n = 0; for (let i = 0; i < cap; i++) if (decalAlpha(clock - p.born[i], life) > 0) n++; return n; },
    dispose() {
      scene.onBeforeRenderObservable.remove(obs);
      for (const p of pools.values()) { p.mesh.material?.dispose(true, true); p.mesh.dispose(); }
      pools.clear();
    },
  };
}

/** The rig's mount: the pool on the scene for the modes to stamp into (wave-2 modes only; every tier). */
export function mountSceneDecals(scene: Scene, tier: QualityTier): GroundDecalsHandle | null {
  if (!wave2Look(sceneModeId(scene))) return null;
  const h = mountGroundDecals(scene, tier);
  (scene.metadata ??= {}).felDecals = h;
  return {
    ...h,
    stamp: h.stamp, live: h.live,
    dispose() { h.dispose(); if ((scene.metadata as { felDecals?: unknown } | null)?.felDecals === h) delete scene.metadata.felDecals; },
  };
}
