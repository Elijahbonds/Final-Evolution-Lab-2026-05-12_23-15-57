// PAINT ON A BODY (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md phase 3). The thin Babylon adapter around the pure
// compositor (composite.ts): one texture per painted mesh, the material bound to it, suit mode, the work spread over
// frames, and everything released with the body.
//
// ONE TEXTURE PER BODY, over its own albedo. The skin's texture is the photographed skin map the identity layer chose
// (playerIdentity.applySkinMap) times its tint, read back once from the GPU (shared by every body wearing that map) and
// composited under the layers, so an unpainted texel looks exactly as it did. The texture replaces the material's albedo
// texture and the material's colour goes to white (the tint is baked in: colour^(1/2.2) on the gamma bytes, which is what
// the PBR shader's linear multiply does). A garment a layer paints gets its own, smaller one the same way.
//
// SIZE BY TIER (CREATOR-PLAN: "1024 on phones, 2048 on desktop"): the skin 2048² on desktop and 1024² on mobile
// (QualityTier, the harness's `scene.metadata.felTier`; a scene without one — the Closet preview — is desktop); a garment
// half that. It is a RawTexture (an RGBA buffer uploaded as is), not a canvas: no 2D context to keep in step, nothing to
// shim in tests, and a sub-rectangle upload when only a few tiles changed.
//
// NEVER A HITCH. An edit marks only the tiles it changes (composite.dirtyTiles) and they are drawn within a per-frame
// budget (8 ms desktop, 5 ms mobile) before the scene renders, so a big change sweeps in over a few frames instead of
// freezing one. While one layer is being dragged the layers under it are cached (composite.BelowCache). Measured
// 2026-10-06 on a shared cloud CPU, 10-layer suit doc: a 12 cm stamp moved redraws ~5% of the tiles, ~10 ms at 1024
// (two mobile frames) and ~35 ms at 2048 (four or five desktop frames) with the cache; a whole-body recolour ~0.1 s at
// 1024 and ~0.5 s at 2048, swept in over frames. The first build of a kit's surface map (~0.4 s at 1024, ~1.6 s at
// 2048, once per kit and session) is spread over frames the same way.
//
// SUIT MODE (doc.flags.suit) hides the garments (the shown top, shorts and shoes, their soles, the number plate) and
// paints every layer on the skin, whatever its surface: a skin-tight suit, a full-head mask and a chest emblem are the
// same tool. Parts stay (they are not garments). applyKit re-shows garments on every identity apply, before this runs,
// so turning suit mode off needs nothing undone here; the body mask is rescheduled so the skin under the hidden garments
// is drawn again (bodyMask.ts hides skin only under VISIBLE garments).
//
// Cosmetic only: nothing here touches a mesh's geometry, a bone, a hitbox or a pick.

import { Color3, RawTexture, Texture } from '@babylonjs/core';
import type { AbstractMesh, BaseTexture, Material, Mesh, Scene, TransformNode } from '@babylonjs/core';
import type { CreatorDoc, PaintLayer } from '../../../creator/look/doc';
import { kitOf } from '../../core/kit';
import { scheduleBodyMask } from '../../core/bodyMask';
import { syncGarmentVisibility } from '../../core/garmentFixes';
import { SKIN_LIBRARY } from '../../core/skinLibrary';
import {
  atomBitsOf, cachedSurfaceMap, chartForBody, clearSurfaceCache, geometryKey, isPaintBody, storeSurfaceMap, surfaceMapKey, surfaceMapSteps,
} from './surfaceMap';
import { ATOM_MIRROR, regionLabelMask, type BodyChart } from './bodyChart';
import type { SurfaceMap } from './rasterise';
import { compileLayers, compositeDirty, dirtyTiles, layerApplies, type BelowCache, type ChartInfo, type CompiledLayer, type PaintBuffers } from './composite';

export type PaintTier = 'desktop' | 'mobile';
export const PAINT_SIZES: Record<PaintTier, { skin: number; garment: number }> = {
  desktop: { skin: 2048, garment: 1024 },
  mobile: { skin: 1024, garment: 512 },
};
/** Per-frame drawing budget (ms). */
export const PAINT_BUDGET_MS: Record<PaintTier, number> = { desktop: 8, mobile: 5 };

type AlbedoMat = Material & { albedoTexture?: BaseTexture | null; albedoColor?: Color3; diffuseTexture?: BaseTexture | null; diffuseColor?: Color3 };

interface Target {
  mesh: Mesh;
  kind: 'skin' | 'garment';
  size: number;
  mapKey: string;
  map: SurfaceMap | null;
  /** the material we bound to, and what it showed before */
  mat: AlbedoMat | null;
  src: { tex: BaseTexture | null; color: Color3 } | null;
  tex: RawTexture | null;
  out: Uint8Array | null;
  base: Uint8Array | null;
  baseKey: string;
  baseState: 'none' | 'loading' | 'ready';
  flat: [number, number, number];
  tint: [number, number, number];
  compiled: CompiledLayer[];
  dirty: Uint8Array | null;
  /** the texture holds a complete composite of the current base (it may be bound) */
  complete: boolean;
  /** pending upload rectangle */
  up: { x0: number; y0: number; x1: number; y1: number } | null;
  below: (BelowCache & { sigs: string }) | null;
}

interface BodyPaint {
  root: TransformNode;
  scene: Scene;
  tier: PaintTier;
  targets: Map<Mesh, Target>;
  layers: readonly PaintLayer[];
  suit: boolean;
  chart: BodyChart | null;
  chartKey: string;
}

const bodies = new WeakMap<TransformNode, BodyPaint>();
const live = new Map<Scene, Set<BodyPaint>>();
const hooked = new WeakSet<TransformNode>();

/** Maps being built, shared by every body that needs the same one (key → its steps). Built maps live in surfaceMap's
 *  cache, per kit mesh and size. */
const mapJobs = new Map<string, Generator<void, SurfaceMap, void>>();

/** How long a body waits for its albedo map before painting over the map's mean colour instead (ms). */
export const BASE_TIMEOUT_MS = 4000;

/** How the albedo under the paint is read: the GPU read-back by default; tests and probes may hand in their own
 *  (a deterministic image, or null for the flat mean colour). Returns RGBA bytes at `size` × `size`, or null. */
export type BaseReader = (tex: BaseTexture, size: number) => Uint8Array | null;
let baseReader: BaseReader | null = null;
export function setPaintBaseReader(r: BaseReader | null): void { baseReader = r; }

/** Bases read back from the GPU, per source texture and size: shared by every body wearing that map. */
const bases = new WeakMap<BaseTexture, Map<number, { data: Uint8Array | null; state: 'loading' | 'ready'; waiters: Set<Target> }>>();

const tierOf = (scene: Scene): PaintTier => ((scene.metadata as { felTier?: string } | undefined)?.felTier === 'mobile' ? 'mobile' : 'desktop');

function albedoOf(m: AlbedoMat): { tex: BaseTexture | null; color: Color3 | null } {
  if ('albedoColor' in m && m.albedoColor) return { tex: m.albedoTexture ?? null, color: m.albedoColor };
  if ('diffuseColor' in m && m.diffuseColor) return { tex: m.diffuseTexture ?? null, color: m.diffuseColor };
  return { tex: null, color: null };
}
function setAlbedo(m: AlbedoMat, tex: BaseTexture | null, color: Color3): void {
  if ('albedoColor' in m && m.albedoColor) { m.albedoTexture = tex; m.albedoColor = color.clone(); return; }
  if ('diffuseColor' in m && m.diffuseColor) { m.diffuseTexture = tex; m.diffuseColor = color.clone(); }
}

/** The labels a layer can reach, as bits (bit = label): its region's, and the other side's for a mirrored stamp. */
function layerLabelBits(l: PaintLayer): number {
  const m = regionLabelMask(l.region);
  let bits = 0;
  for (let k = 1; k < m.length; k++) if (m[k]) bits |= (1 << k) | (l.mirror ? 1 << (ATOM_MIRROR[k - 1] + 1) : 0);
  return bits;
}

/**
 * Apply (or clear, with null) a doc's paint on one body. Called by the Creator hook on every identity apply, which
 * matters: applySkinTone and the garment tints re-set each material's albedo before this runs, so this re-binds the
 * painted texture every time (cheap: nothing is redrawn unless the layers, the skin map or a tint changed).
 * `sync` draws everything now (tests, probes); otherwise the work runs within the per-frame budget.
 */
export function syncPaint(
  spawn: { root: TransformNode; meshes?: readonly AbstractMesh[] },
  doc: CreatorDoc | null,
  opts: { sync?: boolean } = {},
): { targets: number; layers: number } {
  const root = spawn.root;
  const meshes = (spawn.meshes ?? root.getChildMeshes()).filter((m) => !m.isDisposed());
  const layers = doc?.paint ?? [];
  const suit = !!doc?.flags.suit;
  const visible = layers.some((l) => !l.hidden);
  let P = bodies.get(root);
  if (!visible && !suit) { if (P) releasePaint(root); return { targets: 0, layers: 0 }; }
  const scene = root.getScene();
  if (!P) {
    P = { root, scene, tier: tierOf(scene), targets: new Map(), layers: [], suit: false, chart: null, chartKey: '' };
    bodies.set(root, P);
    let set = live.get(scene);
    if (!set) { set = new Set(); live.set(scene, set); installScheduler(scene); }
    set.add(P);
    if (!hooked.has(root)) { hooked.add(root); root.onDisposeObservable.addOnce(() => releasePaint(root, true)); }
  }
  P.layers = layers;
  P.suit = suit;
  if (suit) hideGarments(meshes);

  // what gets painted: the skin when a layer paints it; each shown garment a layer paints (never in suit mode)
  const body = meshes.find((m) => isPaintBody(m.name)) as Mesh | undefined;
  if (body && !P.chart) { P.chart = chartForBody(body); P.chartKey = geometryKey(body); }
  const want = new Map<Mesh, 'skin' | 'garment'>();
  if (body && layers.some((l) => layerApplies(l, { target: 'skin', suit }))) want.set(body, 'skin');
  const garmentLayers = suit ? [] : layers.filter((l) => layerApplies(l, { target: 'garment', suit }));
  if (garmentLayers.length && P.chart) {
    // only a shown garment some layer's region reaches (a chest layer leaves the shoes alone)
    let reach = 0;
    for (const l of garmentLayers) reach |= layerLabelBits(l);
    for (const m of meshes) {
      if (!kitOf(m.name) || !m.isVisible || !m.isEnabled()) continue;
      if (atomBitsOf(m as Mesh, P.chart, P.chartKey) & reach) want.set(m as Mesh, 'garment');
    }
  }
  for (const [mesh, t] of [...P.targets]) if (!want.has(mesh)) { restoreTarget(t); disposeTarget(t); P.targets.delete(mesh); }
  if (!P.chart) return { targets: 0, layers: layers.length };
  for (const [mesh, kind] of want) {
    let t = P.targets.get(mesh);
    if (!t) { t = newTarget(P, mesh, kind); P.targets.set(mesh, t); }
    updateTarget(P, t);
  }
  if (opts.sync) flushPaint(root);
  return { targets: P.targets.size, layers: layers.length };
}

function newTarget(P: BodyPaint, mesh: Mesh, kind: 'skin' | 'garment'): Target {
  const size = PAINT_SIZES[P.tier][kind];
  return {
    mesh, kind, size, mapKey: surfaceMapKey(mesh, P.chartKey, size), map: null, mat: null, src: null, tex: null, out: null,
    base: null, baseKey: '', baseState: 'none', flat: [0.5, 0.5, 0.5], tint: [1, 1, 1], compiled: [], dirty: null, complete: false,
    up: null, below: null,
  };
}

/** The surface map for a target: built (over frames, in `work`) once per kit mesh and size, shared by every body. */
function mapFor(P: BodyPaint, t: Target): SurfaceMap | null {
  if (t.map) return t.map;
  const hit = cachedSurfaceMap(t.mapKey);
  if (hit) { t.map = hit; return hit; }
  if (hit === undefined && !mapJobs.has(t.mapKey) && P.chart) {
    const it = surfaceMapSteps(t.mesh, P.chart, t.size);
    if (it) mapJobs.set(t.mapKey, it); else storeSurfaceMap(t.mapKey, null);
  }
  return null;
}

/** Re-read the material (the identity layer re-sets it every apply), recompile the layers, mark what changed. */
function updateTarget(P: BodyPaint, t: Target): void {
  const mat = t.mesh.material as AlbedoMat | null;
  if (!mat) return;
  // the material changed under us (a different clone): let the old one go back to what it showed
  if (t.mat && t.mat !== mat) { restoreTarget(t); t.src = null; t.complete = false; }
  t.mat = mat;
  const now = albedoOf(mat);
  if (!now.color) return;
  if (!t.tex || now.tex !== t.tex || !t.src) {
    // the identity layer put its own albedo back (applySkinTone sets the skin map and its tint): capture what it chose
    t.src = { tex: now.tex, color: now.color.clone() };
  } else if (!isBound(now.color)) {
    // still our texture but a new colour (tintSlot re-tints a garment in place): that colour is the new tint
    t.src = { tex: t.src.tex, color: now.color.clone() };
  }
  const src = t.src!;
  const gamma = (v: number) => Math.pow(Math.max(0, v), 1 / 2.2);
  const tint: [number, number, number] = [gamma(src.color.r), gamma(src.color.g), gamma(src.color.b)];
  const baseKey = src.tex ? `${src.tex.uniqueId}` : 'flat';
  const tintChanged = tint.some((v, i) => Math.abs(v - t.tint[i]) > 1e-4);
  t.tint = tint;
  if (baseKey !== t.baseKey) {
    t.baseKey = baseKey;
    t.base = null; t.baseState = 'none'; t.complete = false; t.below = null;
    t.flat = flatFor(mat, src.tex);
    requestBase(t);
  }
  const map = mapFor(P, t);
  const chart = P.chart!;
  const info: ChartInfo = { radius: chart.groups.map((g) => g.radius), extent: chart.extent };
  const next = compileLayers(P.layers, info, { target: t.kind, suit: P.suit, aa: map?.metresPerTexel ?? 0.002 });
  if (map) {
    const nTiles = map.tiles.n * map.tiles.n;
    if (!t.dirty) { t.dirty = new Uint8Array(nTiles).fill(1); t.complete = false; }
    if (tintChanged || !t.complete) { t.dirty.fill(1); t.below = null; }
    else {
      // one layer changing again and again (a drag): keep the layers under it cached
      const changed = changedIndices(t.compiled, next);
      if (changed.length === 1 && t.compiled.length === next.length) {
        const from = changed[0];
        const sigs = next.slice(0, from).map((l) => l.sig).join('|');
        if (!t.below || t.below.from !== from || t.below.sigs !== sigs) {
          t.below = from > 0 ? { from, sigs, buf: new Uint8Array(map.size * map.size * 4), valid: new Uint8Array(nTiles) } : null;
        }
      } else if (changed.length) t.below = null;
      dirtyTiles(t.compiled, next, map, t.dirty);
    }
  }
  t.compiled = next;
  // bind now if the texture already holds a composite of this base (a tint-only change shows the old tint for a frame)
  if (t.tex && t.complete) bind(t);
}

function changedIndices(a: readonly CompiledLayer[], b: readonly CompiledLayer[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i]?.sig !== b[i]?.sig) out.push(i);
  return out;
}

/** The albedo a texel shows when no texture can be read: the skin map's measured mean (skinLibrary), else mid grey. */
function flatFor(mat: AlbedoMat, tex: BaseTexture | null): [number, number, number] {
  if (!tex) return [1, 1, 1];
  const key = (mat.metadata as { felSkin?: string } | null | undefined)?.felSkin;
  const e = SKIN_LIBRARY.find((s) => s.key === key || (tex as Texture).url === s.albedo);
  return e ? [e.meanRGB[0] / 255, e.meanRGB[1] / 255, e.meanRGB[2] / 255] : [0.5, 0.5, 0.5];
}

/** Read the source texture's pixels back at the target's size (once per texture and size, shared). */
function requestBase(t: Target): void {
  const tex = t.src?.tex;
  if (!tex) { t.baseState = 'ready'; t.base = null; return; }
  let per = bases.get(tex);
  if (!per) { per = new Map(); bases.set(tex, per); }
  let e = per.get(t.size);
  if (e?.state === 'ready') { t.base = e.data; t.baseState = 'ready'; return; }
  t.baseState = 'loading';
  if (e) { e.waiters.add(t); return; }
  const entry = { data: null as Uint8Array | null, state: 'loading' as 'loading' | 'ready', waiters: new Set<Target>([t]) };
  e = entry;
  per.set(t.size, entry);
  const size = t.size;
  const finish = (data: Uint8Array | null) => {
    if (entry.state === 'ready') return;
    entry.data = data; entry.state = 'ready';
    for (const w of entry.waiters) {
      if (w.src?.tex !== tex) continue;
      w.base = data; w.baseState = 'ready'; w.complete = false; w.below = null;
      w.dirty?.fill(1);
    }
    entry.waiters.clear();
  };
  const read = () => {
    if (entry.state === 'ready') return;
    if (baseReader) { finish(baseReader(tex, size)); return; }
    try {
      const sz = tex.getSize();
      const p = tex.readPixels(0, 0);
      if (!p) { finish(null); return; }
      void Promise.resolve(p).then((buf) => {
        const w = sz.width, h = sz.height;
        finish(buf && buf.byteLength >= w * h * 4 ? resample(new Uint8Array(buf.buffer, buf.byteOffset, w * h * 4), w, h, size) : null);
      }, () => finish(null));
    } catch { finish(null); }
  };
  // a map that never loads (a 404, a lost context) must not hold the paint back forever: after this long the albedo is
  // the map's measured mean colour instead
  setTimeout(() => { if (entry.state !== 'ready') finish(null); }, BASE_TIMEOUT_MS);
  if (baseReader || tex.isReady()) read();
  else Texture.WhenAllReady([tex], read);
}

/** Resample an RGBA image to size × size: a box filter when it shrinks by a whole factor (2048 → 1024), nearest
 *  otherwise, a copy at the same size. Alpha is set opaque (the albedo's alpha is not paint's business). */
export function resample(src: Uint8Array, w: number, h: number, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const fx = w / size, fy = h / size;
  const box = Number.isInteger(fx) && Number.isInteger(fy) && fx >= 1 && fy >= 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = (y * size + x) * 4;
      if (box) {
        let r = 0, g = 0, b = 0;
        for (let yy = 0; yy < fy; yy++) for (let xx = 0; xx < fx; xx++) { const s = ((y * fy + yy) * w + x * fx + xx) * 4; r += src[s]; g += src[s + 1]; b += src[s + 2]; }
        const k = fx * fy;
        out[d] = Math.round(r / k); out[d + 1] = Math.round(g / k); out[d + 2] = Math.round(b / k);
      } else {
        const sy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / size)), sx = Math.min(w - 1, Math.floor(((x + 0.5) * w) / size));
        const s = (sy * w + sx) * 4;
        out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2];
      }
      out[d + 3] = 255;
    }
  }
  return out;
}

/** Draw a target's dirty tiles within `budget` ms; upload what changed; bind once complete. True when it is done. */
function work(P: BodyPaint, t: Target, budget: number, now: () => number): boolean {
  if (!t.map) {
    if (!mapFor(P, t)) {
      const job = mapJobs.get(t.mapKey);
      if (!job) return true;   // this mesh cannot be painted (no UVs / no skin)
      const start = now();
      for (;;) {
        const r = job.next();
        if (r.done) { storeSurfaceMap(t.mapKey, r.value); mapJobs.delete(t.mapKey); break; }
        if (now() - start > budget) return false;
      }
      if (!mapFor(P, t)) return true;
    }
    updateTarget(P, t);   // compile against the map's texel size and mark everything
  }
  if (t.baseState !== 'ready') return false;
  const map = t.map;
  if (!map) return true;
  if (!t.out) t.out = new Uint8Array(map.size * map.size * 4);
  if (!t.dirty) return true;
  const B: PaintBuffers = { map, base: t.base, flat: t.flat, tint: t.tint, out: t.out, aa: map.metresPerTexel, radius: P.chart!.groups.map((g) => g.radius) };
  const r = compositeDirty(B, t.compiled, t.dirty, budget, now, t.below);
  if (r && r.x1 > r.x0) t.up = t.up ? { x0: Math.min(t.up.x0, r.x0), y0: Math.min(t.up.y0, r.y0), x1: Math.max(t.up.x1, r.x1), y1: Math.max(t.up.y1, r.y1) } : { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
  const finished = !r || r.left === 0;
  if (finished && !t.complete) { upload(P, t, true); t.complete = true; bind(t); }
  else if (t.complete && t.up) upload(P, t, false);
  return finished;
}

/** Push the buffer to the GPU: the whole texture the first time, else just the changed rectangle. */
function upload(P: BodyPaint, t: Target, whole: boolean): void {
  const map = t.map!, out = t.out!;
  if (!t.tex) {
    t.tex = new RawTexture(out, map.size, map.size, 5 /* RGBA */, P.scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    t.tex.name = `fel_paint_${t.kind}_${t.mesh.name}`;
    t.tex.wrapU = Texture.CLAMP_ADDRESSMODE; t.tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    t.up = null;
    return;
  }
  const r = t.up; t.up = null;
  if (!r) return;
  const engine = P.scene.getEngine() as unknown as { updateTextureData?: (tex: unknown, data: ArrayBufferView, x: number, y: number, w: number, h: number, face?: number, lod?: number, mips?: boolean) => void };
  const internal = t.tex.getInternalTexture();
  const area = (r.x1 - r.x0) * (r.y1 - r.y0);
  if (!whole && internal && typeof engine.updateTextureData === 'function' && area < map.size * map.size * 0.5) {
    const w = r.x1 - r.x0, h = r.y1 - r.y0;
    const sub = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) sub.set(out.subarray(((r.y0 + y) * map.size + r.x0) * 4, ((r.y0 + y) * map.size + r.x1) * 4), y * w * 4);
    try { engine.updateTextureData(internal, sub, r.x0, r.y0, w, h, 0, 0, true); return; } catch { /* fall through to a whole upload */ }
  }
  t.tex.update(out);
}

/** The colour a painted material carries: white, but for a blue a hex colour can never make (254.97/255), so a garment
 *  re-tinted while painted (tintSlot copies its hex into this same Color3) is told apart from "still ours". */
const BOUND = new Color3(1, 1, 0.9999);
const isBound = (c: Color3 | null): boolean => !!c && c.r === BOUND.r && c.g === BOUND.g && c.b === BOUND.b;

function bind(t: Target): void {
  if (!t.mat || !t.tex) return;
  const cur = albedoOf(t.mat);
  if (cur.tex === t.tex && isBound(cur.color)) return;
  setAlbedo(t.mat, t.tex, BOUND);
}

function restoreTarget(t: Target): void {
  if (!t.mat || !t.src) return;
  if (albedoOf(t.mat).tex === t.tex) setAlbedo(t.mat, t.src.tex, t.src.color);
}

function disposeTarget(t: Target): void {
  try { t.tex?.dispose(); } catch { /* gone with the scene */ }
  t.tex = null; t.out = null; t.base = null; t.below = null; t.dirty = null;
}

/** Draw everything a body still owes, now (tests, probes, a photo). Map builds included. */
export function flushPaint(root: TransformNode): void {
  const P = bodies.get(root);
  if (!P) return;
  for (const t of P.targets.values()) {
    for (let guard = 0; guard < 4 && !work(P, t, Infinity, () => 0); guard++) { /* map, then composite */ }
  }
}

/** One frame's work for every painted body in a scene, within the tier's budget. */
function installScheduler(scene: Scene): void {
  const obs = scene.onBeforeRenderObservable.add(() => {
    const set = live.get(scene);
    if (!set?.size) return;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const start = now();
    for (const P of set) {
      const budget = PAINT_BUDGET_MS[P.tier];
      for (const t of P.targets.values()) {
        const left = budget - (now() - start);
        if (left <= 0) return;
        work(P, t, left, now);
      }
    }
  });
  scene.onDisposeObservable.addOnce(() => { scene.onBeforeRenderObservable.remove(obs); live.delete(scene); });
}

/** Take the paint off a body: materials back to what the identity layer gave them, textures and buffers released. */
export function releasePaint(root: TransformNode, disposing = false): void {
  const P = bodies.get(root);
  if (!P) return;
  for (const t of P.targets.values()) { if (!disposing) restoreTarget(t); disposeTarget(t); }
  P.targets.clear();
  bodies.delete(root);
  live.get(P.scene)?.delete(P);
}

/** SUIT MODE: hide the shown garments, their soles and the number plate; the skin under them is drawn again. */
function hideGarments(meshes: readonly AbstractMesh[]): void {
  let changed = false;
  for (const m of meshes) {
    const garment = !!kitOf(m.name) || /^KitSole_/.test(m.name) || m.name.startsWith('jersey_decal_');
    if (!garment || !m.isVisible) continue;
    m.isVisible = false;
    if (kitOf(m.name)) syncGarmentVisibility(m);
    changed = true;
  }
  if (changed) scheduleBodyMask([...meshes]);
}

/** What a body carries (for tests and probes): painted meshes, texture sizes and the bytes held. */
export function paintStats(root: TransformNode): { targets: { mesh: string; kind: string; size: number; complete: boolean; bound: boolean; pendingTiles: number; tiles: number }[]; cpuBytes: number; gpuBytes: number } | null {
  const P = bodies.get(root);
  if (!P) return null;
  let cpu = 0, gpu = 0;
  const targets = [...P.targets.values()].map((t) => {
    cpu += (t.out?.byteLength ?? 0) + (t.below?.buf.byteLength ?? 0);
    if (t.tex) gpu += Math.round(t.size * t.size * 4 * (4 / 3));   // RGBA8 plus its mip chain
    const pendingTiles = t.dirty ? t.dirty.reduce((a, b) => a + b, 0) : 0;
    return { mesh: t.mesh.name, kind: t.kind, size: t.size, complete: t.complete, bound: !!t.tex && !!t.mat && albedoOf(t.mat).tex === t.tex, pendingTiles, tiles: t.dirty?.length ?? 0 };
  });
  return { targets, cpuBytes: cpu, gpuBytes: gpu };
}

/** The painted texture on a body's mesh (probes). */
export function paintTextureOf(root: TransformNode, mesh: AbstractMesh): RawTexture | null {
  return bodies.get(root)?.targets.get(mesh as Mesh)?.tex ?? null;
}

/** The composited RGBA buffer behind a mesh's paint texture (probes and tests read pixels from it). */
export function paintBufferOf(root: TransformNode, mesh: AbstractMesh): Uint8Array | null {
  return bodies.get(root)?.targets.get(mesh as Mesh)?.out ?? null;
}

/** Tests: drop every shared map. */
export function resetPaintCaches(): void { mapJobs.clear(); clearSurfaceCache(); }
