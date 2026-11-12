// KIT-GLITCH rig, the browser half (owner 2026-11-12: "the clothes look glitched out sometimes"). Bundled by rig.mts with
// esbuild and served with public/ into headless Chromium (SwiftShader GL). It spawns bodies through the REAL path
// (CharacterLibrary.spawn, applyKit, the body mask, applyIdentity for a Closet look), poses them through real clips and
// measures the four symptoms the owner named, with numbers:
//   1. poke-through  — a KEY pass: the real draw (depth offsets, culling, the ink hull) with every material swapped for a
//                      flat class colour; the body's skin is KEY green where it lies within POKE_NEAR of a garment surface
//                      (this pose), dark green elsewhere (an arm in front of the chest is not poke-through). A second pass
//                      draws the garments alone: key pixels inside that silhouette are skin showing through cloth.
//   2. flicker       — the key pass twice, the camera nudged by JITTER metres: interior pixels (3×3 uniform in the first
//                      frame) whose class flips are depth fights (z-fighting stripes).
//   3. stretch/tear  — CPU: every garment triangle edge, skinned in this pose vs its bind length (scale-normalised by the
//                      median), flagged past ×2; the same for the body under it; bone influencer counts and weight sums.
//   4. wrong/missing/floating — CPU: which garments show per slot, skeleton binding (the garment's bones linked to the
//                      body's own nodes), each shown garment's distance off the skin (p95), and its pixel count on screen.
// window.__KG is the API rig.mts drives. Nothing here is shipped.
import { ArcRotateCamera, Color3, Color4, Engine, Mesh, Scene, StandardMaterial, Vector3, VertexBuffer } from '@babylonjs/core';
import type { AbstractMesh, Material, Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CharacterLibrary, type SpawnedCharacter } from '@/lib/babylon/core/CharacterLibrary';
import { applyIdentity, applyProportions, type PlayerIdentity } from '@/lib/babylon/core/playerIdentity';
import { urlForHeroBody, type HeroBodyKind } from '@/lib/babylon/core/heroBody';
import { mountLightRig } from '@/lib/babylon/scene/LightRig';
import { autoInk, inkStyleFor } from '@/lib/babylon/visual/AnimeInk';
import { StudioStage, FRONT_ALPHA } from '@/lib/babylon/creator/studio/stageRig';
import { isBodyMesh, maskSlotOf, skinnedWorld } from '@/lib/babylon/core/bodyMask';
import { isClothMesh, clothMeshOf } from '@/lib/babylon/creator/clothes/renderClothes';
import { defaultFace, defaultJersey } from '@/lib/closet/wearable-catalog';
import type { CreatorDoc } from '@/lib/creator/look/doc';
import { kitOf } from '@/lib/babylon/core/kit';

/** A body vertex within this of a garment surface (this pose) is "under the garment" for the poke count. */
const POKE_NEAR = 0.04;
/** The flicker pass's camera nudge (m): a hair's width, far under a pixel at every distance shot. */
const JITTER = 0.0004;

type Tier = 'mobile' | 'desktop' | 'high';
interface InitOpts { tier: Tier; modeId: string; closet: boolean; w: number; h: number }
interface SpawnOptsKG { kind: 'player' | 'rival'; body?: HeroBodyKind; url?: string; name?: string; tint?: string; creator?: CreatorDoc | null; wardrobe?: Record<string, string>; frame?: { heightScale: number; buildScale: number } }

const CLASS = {
  bg: [0, 0, 0], key: [0, 255, 0], skin: [0, 90, 0], tops: [255, 0, 0], shorts: [0, 0, 255], shoes: [255, 0, 255], cloth: [255, 255, 0], other: [128, 128, 128],
} as const;
type ClassName = keyof typeof CLASS;
const CLASS_NAMES = Object.keys(CLASS) as ClassName[];

let engine: Engine; let scene: Scene; let cam: ArcRotateCamera; let opts: InitOpts;
let bodies: SpawnedCharacter[] = [];
const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(String(e.message).slice(0, 200)));
const origWarn = console.warn.bind(console);
console.warn = (...a: unknown[]) => { const s = a.map(String).join(' '); if (/FEL-KIT|FEL-CHAR|mask|garment/.test(s)) errors.push(s.slice(0, 200)); origWarn(...a); };

function canvasEl(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.style.width = `${w}px`; c.style.height = `${h}px`;
  document.body.appendChild(c); return c;
}

async function init(o: InitOpts): Promise<void> {
  opts = o;
  const canvas = canvasEl(o.w, o.h);
  // no MSAA: the class passes count exact colours (a blended edge pixel would be neither class)
  engine = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: !o.closet, alpha: false, adaptToDeviceRatio: false });
  engine.setHardwareScalingLevel(1);
  scene = new Scene(engine);
  (scene.metadata ??= {}).felTier = o.tier;
  scene.metadata.felModeId = o.modeId;
  cam = new ArcRotateCamera('kgCam', FRONT_ALPHA, 1.33, 3.15, new Vector3(0, 0.95, 0), scene);
  if (o.closet) {
    cam.minZ = 0.05;   // the Closet's own camera (avatar-preview.tsx)
    new StudioStage(scene, cam, { tier: o.tier === 'mobile' ? 'mobile' : 'desktop' });
  } else {
    // a mode's play camera is a TargetCamera at Babylon's default planes (minZ 1); the director never changes them
    cam.minZ = 1;
    mountLightRig(scene, 'goldenHour', o.tier);
    autoInk(scene, inkStyleFor(o.modeId));
  }
  scene.activeCamera = cam;
  scene.clearColor = new Color4(0.06, 0.07, 0.09, 1);
  engine.runRenderLoop(() => { if (!frozen) scene.render(); });
}
let frozen = false;

function identityFor(o: SpawnOptsKG): PlayerIdentity {
  const face = defaultFace();
  return {
    proportions: null, face, palette: { jersey: '#2C6E55', shorts: '#1C2622', shoes: '#EDE8DC', accent: '#E0B441' },
    jersey: defaultJersey(), wardrobe: (o.wardrobe ?? {}) as PlayerIdentity['wardrobe'], custom: true, body: o.body ?? 'kit-male',
    accessories: [], creator: o.creator ?? null, wornParts: [],
  };
}

async function spawn(o: SpawnOptsKG): Promise<number> {
  const at = new Vector3(0, 0, 0);
  let s: SpawnedCharacter;
  if (o.kind === 'player') {
    s = await CharacterLibrary.spawn(scene, urlForHeroBody(o.body ?? 'kit-male'), { identity: false, role: 'player', position: at });
    const base = s.root.scaling.clone();
    applyIdentity(s, identityFor(o));
    if (o.frame) applyProportions(s, o.frame, base);
  } else {
    s = await CharacterLibrary.spawn(scene, o.url!, { role: 'opponent', position: at, name: o.name, tint: o.tint });
  }
  bodies.push(s);
  return bodies.length - 1;
}
function clear(): void { for (const b of bodies) b.dispose(); bodies = []; }

const allMeshes = (s: SpawnedCharacter): AbstractMesh[] => s.root.getChildMeshes(false);
const bodyOf = (s: SpawnedCharacter): Mesh | null => (allMeshes(s).find((m) => isBodyMesh(m.name) && !!(m as Mesh).skeleton) as Mesh) ?? null;
function classOf(m: AbstractMesh): ClassName {
  if (isBodyMesh(m.name)) return 'key';
  if (isClothMesh(m)) return 'cloth';
  const slot = maskSlotOf(m.name);
  if (slot === 'tops' || slot === 'shorts' || slot === 'shoes') return slot;
  return 'other';
}
const drawn = (m: AbstractMesh) => m.isVisible && m.isEnabled() && !m.isDisposed() && m.getTotalVertices() > 0;

/** Pause every playing group at `frac` of the named clip's range; a few frames let planting / secondary settle. */
async function pose(clip: string, frac: number): Promise<string | null> {
  let used: string | null = null;
  for (const s of bodies) {
    const g = s.animator.play(clip, { loop: true, fadeSec: 0, restart: true });
    if (!g) continue;
    used = g.name;
    // no blend: every other group on this body stops, the clip holds the whole weight
    const mine = new Set(s.skeleton.bones.map((b) => b.getTransformNode()).filter(Boolean));
    for (const o of scene.animationGroups) if (o !== g && o.targetedAnimations.some((t) => mine.has(t.target))) o.stop();
    g.setWeightForAllAnimatables(1);
    const f = g.from + (g.to - g.from) * frac;
    g.goToFrame(f); g.pause();
  }
  for (let i = 0; i < 4; i++) { scene.render(); await new Promise((r) => requestAnimationFrame(r)); }
  frozen = true;
  return used;
}
function unfreeze(): void { frozen = false; }
function clipNames(): string[] { return bodies[0] ? [...bodies[0].animator.clipNames] : []; }

function setCam(dist: number, yawDeg: number, pitchDeg: number, targetY: number): void {
  cam.setTarget(new Vector3(0, targetY, 0));
  cam.alpha = FRONT_ALPHA + (yawDeg * Math.PI) / 180;
  cam.beta = Math.PI / 2 - (pitchDeg * Math.PI) / 180;
  cam.radius = dist;
}
/** Frame the first body's live bounds (the pose may lift it off the floor). */
function bodyCenterY(): number {
  const b = bodies[0] && bodyOf(bodies[0]); if (!b) return 0.95;
  const sw = skinnedWorld(b); if (!sw) return 0.95;
  let lo = Infinity, hi = -Infinity; for (let i = 1; i < sw.P.length; i += 3) { lo = Math.min(lo, sw.P[i]); hi = Math.max(hi, sw.P[i]); }
  return (lo + hi) / 2;
}

// ── the class passes ────────────────────────────────────────────────────────────────────────────────────────────────
function flatMat(name: string, rgb: readonly number[], src: Material | null, vertexColour: boolean): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true; m.specularColor = Color3.Black(); m.emissiveColor = Color3.Black();
  m.diffuseColor = Color3.Black();
  m.ambientColor = new Color3(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  if (vertexColour) m.ambientColor = Color3.White();
  m.fogEnabled = false;
  // the depth state the real material draws with: that is what decides who wins where cloth meets skin
  if (src) { m.zOffset = src.zOffset; m.zOffsetUnits = src.zOffsetUnits; m.backFaceCulling = src.backFaceCulling; m.sideOrientation = src.sideOrientation; }
  else m.backFaceCulling = false;
  return m;
}

interface PassState { restore: () => void }
/** Swap every character mesh's material for its class colour. The body takes per-vertex key / skin colours. */
function classMaterials(hideBody: boolean, hideOthers: boolean): PassState {
  const undo: (() => void)[] = [];
  const amb = scene.ambientColor.clone(); scene.ambientColor = Color3.White(); undo.push(() => { scene.ambientColor = amb; });
  const ip = scene.imageProcessingConfiguration.isEnabled; scene.imageProcessingConfiguration.isEnabled = false; undo.push(() => { scene.imageProcessingConfiguration.isEnabled = ip; });
  const fog = scene.fogEnabled; scene.fogEnabled = false; undo.push(() => { scene.fogEnabled = fog; });
  const cc = scene.clearColor.clone(); scene.clearColor = new Color4(0, 0, 0, 1); undo.push(() => { scene.clearColor = cc; });
  const env = scene.environmentTexture; scene.environmentTexture = null; undo.push(() => { scene.environmentTexture = env; });
  const pp = scene.postProcessesEnabled; scene.postProcessesEnabled = false; undo.push(() => { scene.postProcessesEnabled = pp; });
  const charMeshes = new Set<AbstractMesh>();
  for (const s of bodies) for (const m of allMeshes(s)) charMeshes.add(m);
  for (const m of scene.meshes) {
    if (charMeshes.has(m)) continue;
    if (m.isVisible) { m.isVisible = false; undo.push(() => { m.isVisible = true; }); }   // the stage, plinth, floor, sky
  }
  for (const s of bodies) {
    const body = bodyOf(s);
    const near = body ? nearGarment(s, body) : null;
    for (const m of allMeshes(s)) {
      if (!drawn(m)) continue;
      const cls = classOf(m);
      if ((cls === 'key' && hideBody) || (cls === 'other' && hideOthers)) { m.isVisible = false; undo.push(() => { m.isVisible = true; }); continue; }
      const prev = m.material;
      const vc = cls === 'key' && !!near;
      const mat = flatMat(`kg_${cls}`, CLASS[cls], prev, vc);
      if (vc && m === body) {
        const n = m.getTotalVertices(), col = new Float32Array(n * 4);
        for (let v = 0; v < n; v++) { const c = near![v] ? CLASS.key : CLASS.skin; col[v * 4] = c[0] / 255; col[v * 4 + 1] = c[1] / 255; col[v * 4 + 2] = c[2] / 255; col[v * 4 + 3] = 1; }
        const had = m.getVerticesData(VertexBuffer.ColorKind);
        (m as Mesh).setVerticesData(VertexBuffer.ColorKind, col, false, 4);
        const hvc = m.useVertexColors; m.useVertexColors = true;
        undo.push(() => { if (had) (m as Mesh).setVerticesData(VertexBuffer.ColorKind, had, false, 4); else (m as Mesh).removeVerticesData(VertexBuffer.ColorKind); m.useVertexColors = hvc; });
      }
      m.material = mat;
      undo.push(() => { m.material = prev; mat.dispose(); });
    }
  }
  return { restore: () => { for (let i = undo.length - 1; i >= 0; i--) undo[i](); } };
}

/** Per body vertex: within POKE_NEAR of any shown garment's surface in this pose (CPU skinning, the shader's math). */
function nearGarment(s: SpawnedCharacter, body: Mesh): Uint8Array | null {
  const bw = skinnedWorld(body); if (!bw) return null;
  const n = bw.P.length / 3, out = new Uint8Array(n);
  const C = POKE_NEAR, key = (i: number, j: number, k: number) => `${i},${j},${k}`;
  const grid = new Map<string, number[]>(); const pts: number[] = []; const ptBones: Set<string>[] = [];
  // a body vertex is "under" a garment only when its main bone is one that garment rides (a forearm hanging beside the
  // shorts, or a hand in front of the tee, is an honest occluder, not skin through cloth)
  const bmi = body.getVerticesData(VertexBuffer.MatricesIndicesKind), bmw = body.getVerticesData(VertexBuffer.MatricesWeightsKind), bb = body.skeleton!.bones;
  const domName = (v: number) => { if (!bmi || !bmw) return ''; let bi = 0, bw = -1; for (let q = 0; q < 4; q++) if (bmw[v * 4 + q] > bw) { bw = bmw[v * 4 + q]; bi = bmi[v * 4 + q]; } return bb[bi]?.name ?? ''; };
  for (const m of allMeshes(s)) {
    const cls = classOf(m); if (cls === 'key' || cls === 'other' || !drawn(m) || !(m as Mesh).skeleton) continue;
    const g = skinnedWorld(m as Mesh); if (!g) continue;
    const gmi = m.getVerticesData(VertexBuffer.MatricesIndicesKind), gmw = m.getVerticesData(VertexBuffer.MatricesWeightsKind), gb = (m as Mesh).skeleton!.bones;
    const rides = new Set<string>();
    if (gmi && gmw) for (let q = 0; q < gmw.length; q++) if (gmw[q] > 0.1) rides.add(gb[gmi[q]]?.name ?? '');
    // densify each triangle (centroid + edge midpoints) so a coarse 408-vertex tee still has a point every few cm
    const ind = m.getIndices(); if (!ind) continue;
    const add = (x: number, y: number, z: number) => { const id = pts.length / 3; pts.push(x, y, z); ptBones.push(rides); const kk = key(Math.floor(x / C), Math.floor(y / C), Math.floor(z / C)); let a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(id); };
    for (let t = 0; t + 2 < ind.length; t += 3) {
      const a = ind[t] * 3, b = ind[t + 1] * 3, c = ind[t + 2] * 3, P = g.P;
      for (const [wa, wb, wc] of [[1, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5], [1 / 3, 1 / 3, 1 / 3], [0.66, 0.17, 0.17], [0.17, 0.66, 0.17], [0.17, 0.17, 0.66]]) add(P[a] * wa + P[b] * wb + P[c] * wc, P[a + 1] * wa + P[b + 1] * wb + P[c + 1] * wc, P[a + 2] * wa + P[b + 2] * wb + P[c + 2] * wc);
    }
  }
  for (let v = 0; v < n; v++) {
    const x = bw.P[v * 3], y = bw.P[v * 3 + 1], z = bw.P[v * 3 + 2];
    const ci = Math.floor(x / C), cj = Math.floor(y / C), ck = Math.floor(z / C);
    let hit = false; const dn = domName(v);
    for (let i = -1; i <= 1 && !hit; i++) for (let j = -1; j <= 1 && !hit; j++) for (let k = -1; k <= 1 && !hit; k++) {
      const a = grid.get(key(ci + i, cj + j, ck + k)); if (!a) continue;
      for (const id of a) if (ptBones[id].has(dn) && Math.hypot(pts[id * 3] - x, pts[id * 3 + 1] - y, pts[id * 3 + 2] - z) < C) { hit = true; break; }
    }
    out[v] = hit ? 1 : 0;
  }
  return out;
}

function readClasses(): Uint8Array {
  scene.render();
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  const gl = (engine as unknown as { _gl: WebGLRenderingContext })._gl;
  const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    let best = 255, bd = 60 * 60 * 3;   // farther than this from every class colour: unclassified (an ink line, a blend)
    for (let c = 0; c < CLASS_NAMES.length; c++) { const k = CLASS[CLASS_NAMES[c]]; const d = (r - k[0]) ** 2 + (g - k[1]) ** 2 + (b - k[2]) ** 2; if (d < bd) { bd = d; best = c; } }
    out[i] = best;
  }
  return out;
}
const CI = Object.fromEntries(CLASS_NAMES.map((n, i) => [n, i])) as Record<ClassName, number>;
const GARMENT = new Set([CI.tops, CI.shorts, CI.shoes, CI.cloth]);

let lastPoke: { a: Uint8Array; b: Uint8Array; w: number; h: number } | null = null;
/** Symptoms 1 and 2 on screen, from the current camera and pose. */
function measureScreen(): Record<string, unknown> {
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  let st = classMaterials(false, false);
  const a = readClasses();
  // flicker: the same draw, the camera nudged sideways and up by a hair
  const p0 = cam.position.clone(), t0 = cam.target.clone();
  const right = Vector3.Cross(cam.getDirection(Vector3.Forward()), Vector3.Up()).normalize();
  const d = right.scale(JITTER).add(new Vector3(0, JITTER * 0.7, 0));
  cam.setTarget(t0.add(d)); cam.setPosition(p0.add(d));
  const a2 = readClasses();
  cam.setTarget(t0); cam.setPosition(p0);
  st.restore();
  st = classMaterials(true, true);
  const b = readClasses();
  st.restore();
  scene.render();
  lastPoke = { a, b, w, h };
  const bySlot: Record<string, number> = {}; const cover: Record<string, number> = {};
  let poke = 0, covered = 0, skinShown = 0;
  for (let i = 0; i < w * h; i++) {
    if (!GARMENT.has(b[i])) continue;
    covered++; const sl = CLASS_NAMES[b[i]]; cover[sl] = (cover[sl] ?? 0) + 1;
    if (a[i] === CI.key) { poke++; bySlot[sl] = (bySlot[sl] ?? 0) + 1; }
    if (a[i] === CI.skin) skinShown++;
  }
  // flicker: interior pixels of the first frame (all 8 neighbours the same class) whose class flips in the nudged frame
  let flips = 0, flipsGarment = 0; const flipPairs: Record<string, number> = {};
  const sk = (c: number) => (c === CI.skin ? CI.key : c);   // the body's two shades are one surface
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, c = sk(a[i]);
    if (c === CI.bg || c === 255) continue;
    let uniform = true;
    for (let dy = -1; dy <= 1 && uniform; dy++) for (let dx = -1; dx <= 1; dx++) if (sk(a[i + dy * w + dx]) !== c) { uniform = false; break; }
    const c2 = sk(a2[i]);
    if (!uniform || c2 === c || c2 === 255 || c2 === CI.bg) continue;
    // the nudged frame's own neighbourhood must be interior too (a moved silhouette edge is not a fight)
    let u2 = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (sk(a2[i + dy * w + dx]) === c2) u2++;
    if (u2 < 3) continue;
    flips++;
    const k = `${CLASS_NAMES[c]}>${CLASS_NAMES[c2]}`; flipPairs[k] = (flipPairs[k] ?? 0) + 1;
    if (GARMENT.has(c) || GARMENT.has(c2)) flipsGarment++;
  }
  return { w, h, garmentPx: covered, cover, poke, pokeBySlot: bySlot, pokePct: covered ? +(100 * poke / covered).toFixed(3) : 0, farSkinOverGarment: skinShown, flips, flipsGarment, flipPairs };
}
/** The last poke pass as an RGBA overlay image (garment silhouette grey, poke pixels red, flicker not shown). */
function pokeImage(): string | null {
  if (!lastPoke) return null;
  const { a, b, w, h } = lastPoke;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
  const im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (h - 1 - y) * w + x, o = (y * w + x) * 4;
    const gar = GARMENT.has(b[i]), pk = gar && a[i] === CI.key;
    const k = a[i] === 255 ? [40, 40, 40] : CLASS[CLASS_NAMES[a[i]]];
    const base = gar ? [70, 70, 90] : a[i] === CI.bg ? [0, 0, 0] : [k[0] * 0.25, k[1] * 0.25, k[2] * 0.25];
    const col = pk ? [255, 40, 40] : base;
    im.data[o] = col[0]; im.data[o + 1] = col[1]; im.data[o + 2] = col[2]; im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c.toDataURL('image/jpeg', 0.85);
}
function shot(): string { scene.render(); return (engine.getRenderingCanvas() as HTMLCanvasElement).toDataURL('image/jpeg', 0.85); }

// ── CPU: stretch, binding, floating ─────────────────────────────────────────────────────────────────────────────────
function edgeStretch(m: Mesh): { edges: number; over2: number; maxRatio: number; over2Bones: Record<string, number> } | null {
  const sw = skinnedWorld(m); const rest = m.getVerticesData(VertexBuffer.PositionKind); const ind = m.getIndices();
  if (!sw || !rest || !ind) return null;
  const W = m.computeWorldMatrix(true).m;
  const restW = new Float32Array(rest.length);
  for (let v = 0; v < rest.length / 3; v++) { const x = rest[v * 3], y = rest[v * 3 + 1], z = rest[v * 3 + 2]; restW[v * 3] = x * W[0] + y * W[4] + z * W[8]; restW[v * 3 + 1] = x * W[1] + y * W[5] + z * W[9]; restW[v * 3 + 2] = x * W[2] + y * W[6] + z * W[10]; }
  const len = (P: ArrayLike<number>, i: number, j: number) => Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]);
  const rs: number[] = [];
  for (let t = 0; t < ind.length; t += 3) { const r0 = len(restW, ind[t], ind[t + 1]); if (r0 > 1e-6) rs.push(len(sw.P, ind[t], ind[t + 1]) / r0); }
  rs.sort((x, y) => x - y); const k = rs[Math.floor(rs.length / 2)] || 1;
  const mi = m.getVerticesData(VertexBuffer.MatricesIndicesKind), mw = m.getVerticesData(VertexBuffer.MatricesWeightsKind);
  const bones = m.skeleton?.bones ?? [];
  const domBone = (v: number) => { if (!mi || !mw) return '?'; let bi = 0, bw = -1; for (let q = 0; q < 4; q++) if (mw[v * 4 + q] > bw) { bw = mw[v * 4 + q]; bi = mi[v * 4 + q]; } return bones[bi]?.name ?? '?'; };
  // a bind edge under 3 mm in world after the scale is noise (welded seams, the unwelded atlas)
  let edges = 0, over2 = 0, maxRatio = 0; const over2Bones: Record<string, number> = {};
  for (let t = 0; t < ind.length; t += 3) for (const [a, b] of [[ind[t], ind[t + 1]], [ind[t + 1], ind[t + 2]], [ind[t + 2], ind[t]]]) {
    const r0 = len(restW, a, b) * k; if (r0 < 0.003) continue;
    edges++; const r = len(sw.P, a, b) / r0; if (!Number.isFinite(r)) continue;
    if (r > maxRatio) maxRatio = r;
    if (r > 2) { over2++; const bn = domBone(a); over2Bones[bn] = (over2Bones[bn] ?? 0) + 1; }
  }
  return { edges, over2, maxRatio: +maxRatio.toFixed(2), over2Bones };
}

function influencers(m: Mesh): { nbi: number; extra: boolean; weightSumOff: number; zeroWeight: number } {
  const mw = m.getVerticesData(VertexBuffer.MatricesWeightsKind), mwe = m.getVerticesData(VertexBuffer.MatricesWeightsExtraKind);
  let off = 0, zero = 0;
  if (mw) for (let v = 0; v < mw.length / 4; v++) { let s = 0; for (let q = 0; q < 4; q++) s += mw[v * 4 + q]; if (mwe) for (let q = 0; q < 4; q++) s += mwe[v * 4 + q]; if (s < 1e-4) zero++; else if (Math.abs(s - 1) > 0.02) off++; }
  return { nbi: m.numBoneInfluencers, extra: !!mwe, weightSumOff: off, zeroWeight: zero };
}

/** Do this garment's bones read the body's own nodes (the same animated transforms)? */
function binding(m: Mesh, bodySk: Skeleton): { sameSkeleton: boolean; bones: number; linkedToBody: number; maxBoneDelta: number } {
  const sk = m.skeleton; if (!sk) return { sameSkeleton: false, bones: 0, linkedToBody: 0, maxBoneDelta: -1 };
  const bodyNodes = new Map(bodySk.bones.map((b) => [b.name, b.getTransformNode()] as const));
  let linked = 0, maxD = 0;
  for (const b of sk.bones) {
    const tn = b.getTransformNode(); const bn = bodyNodes.get(b.name);
    if (tn && bn && tn === bn) linked++;
    const p = b.getAbsolutePosition(m), q = bodySk.bones.find((x) => x.name === b.name)?.getAbsolutePosition(bodyOfSkeleton(bodySk) ?? undefined);
    if (p && q) maxD = Math.max(maxD, Vector3.Distance(p, q));
  }
  return { sameSkeleton: sk === bodySk, bones: sk.bones.length, linkedToBody: linked, maxBoneDelta: +maxD.toFixed(4) };
}
const skOwner = new WeakMap<Skeleton, Mesh>();
function bodyOfSkeleton(sk: Skeleton): Mesh | null { return skOwner.get(sk) ?? null; }

/** Distance from each shown garment vertex to the nearest body vertex (this pose): p50 / p95 / max (m). */
function offSkin(garment: Mesh, body: Mesh): { p50: number; p95: number; max: number } | null {
  const g = skinnedWorld(garment), b = skinnedWorld(body); if (!g || !b) return null;
  const C = 0.05, key = (i: number, j: number, k: number) => `${i},${j},${k}`; const grid = new Map<string, number[]>();
  for (let v = 0; v < b.P.length / 3; v++) { const kk = key(Math.floor(b.P[v * 3] / C), Math.floor(b.P[v * 3 + 1] / C), Math.floor(b.P[v * 3 + 2] / C)); let a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(v); }
  const ds: number[] = [];
  for (let v = 0; v < g.P.length / 3; v++) {
    const x = g.P[v * 3], y = g.P[v * 3 + 1], z = g.P[v * 3 + 2]; let d = 0.5;
    const ci = Math.floor(x / C), cj = Math.floor(y / C), ck = Math.floor(z / C);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) { const a = grid.get(key(ci + i, cj + j, ck + k)); if (a) for (const u of a) d = Math.min(d, Math.hypot(b.P[u * 3] - x, b.P[u * 3 + 1] - y, b.P[u * 3 + 2] - z)); }
    ds.push(d);
  }
  ds.sort((p, q) => p - q);
  const at = (f: number) => +ds[Math.min(ds.length - 1, Math.floor(f * ds.length))].toFixed(3);
  return { p50: at(0.5), p95: at(0.95), max: at(1 - 1e-9) };
}

function measureCpu(): Record<string, unknown>[] {
  return bodies.map((s) => {
    const body = bodyOf(s);
    if (body?.skeleton) skOwner.set(body.skeleton, body);
    const rows: Record<string, unknown>[] = [];
    const slots: Record<string, string[]> = {};
    for (const m of allMeshes(s)) {
      const cls = classOf(m);
      if (cls === 'other') continue;
      const vis = drawn(m);
      if (cls !== 'key' && vis) (slots[cls] ??= []).push(m.name.replace(/_c\d+$/, ''));
      if (!vis || !(m as Mesh).skeleton) continue;
      const mat = m.material;
      rows.push({
        mesh: m.name.replace(/_c\d+$/, ''), cls, verts: m.getTotalVertices(),
        mat: mat ? { name: mat.name, zOffset: mat.zOffset, zOffsetUnits: mat.zOffsetUnits, cull: mat.backFaceCulling, alphaMode: mat.transparencyMode, needBlend: mat.needAlphaBlending() } : null,
        infl: influencers(m as Mesh), stretch: edgeStretch(m as Mesh),
        bind: body?.skeleton && m !== body ? binding(m as Mesh, body.skeleton) : null,
        offSkin: body && m !== body ? offSkin(m as Mesh, body) : null,
        culled: !m.isInFrustum(scene.frustumPlanes ?? []),
        felFix: (m.metadata as { felGarmentFix?: string } | null)?.felGarmentFix ?? null,
      });
    }
    const md = body?.metadata as { felBodyMask?: { hiddenBySlot: Record<string, number>; trisBefore: number; trisAfter: number } } | undefined;
    const kit = allMeshes(s).filter((m) => kitOf(m.name)).map((m) => ({ n: m.name.replace(/_c\d+$/, ''), v: m.isVisible }));
    return { root: s.root.name, rows, slots, mask: md?.felBodyMask ? { hiddenBySlot: md.felBodyMask.hiddenBySlot, trisBefore: md.felBodyMask.trisBefore, trisAfter: md.felBodyMask.trisAfter } : null, kit, cloth: !!clothMeshOf(s.root) };
  });
}

/** Signed distance (m) of each shown garment vertex off the body's skin along the skin's normal, this pose (+ = outside).
 *  Percentiles, and the share of the garment within 3 mm of the skin or inside it (where a depth fight or poke starts). */
function gaps(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const s of bodies) {
    const body = bodyOf(s); if (!body) continue;
    const bw = skinnedWorld(body); const bi = (body.metadata as { felBodyIndices0?: number[] } | null)?.felBodyIndices0 ?? body.getIndices();
    if (!bw || !bi) continue;
    const C = 0.04, key = (i: number, j: number, k: number) => `${i},${j},${k}`; const grid = new Map<string, number[]>();
    for (let t = 0; t + 2 < bi.length; t += 3) { const a = bi[t] * 3; const kk = key(Math.floor(bw.P[a] / C), Math.floor(bw.P[a + 1] / C), Math.floor(bw.P[a + 2] / C)); let l = grid.get(kk); if (!l) grid.set(kk, l = []); l.push(t); }
    for (const m of allMeshes(s)) {
      const cls = classOf(m); if (cls === 'key' || cls === 'other' || !drawn(m) || !(m as Mesh).skeleton) continue;
      const g = skinnedWorld(m as Mesh); if (!g) continue;
      const ds: number[] = [];
      for (let v = 0; v < g.P.length / 3; v++) {
        const x = g.P[v * 3], y = g.P[v * 3 + 1], z = g.P[v * 3 + 2];
        let bd = Infinity, sd = 0;
        const ci = Math.floor(x / C), cj = Math.floor(y / C), ck = Math.floor(z / C);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
          const l = grid.get(key(ci + i, cj + j, ck + k)); if (!l) continue;
          for (const t of l) {
            const q = closestPt(x, y, z, bw.P, bi[t], bi[t + 1], bi[t + 2]); const d = Math.hypot(x - q[0], y - q[1], z - q[2]);
            if (d < bd) { bd = d; const a = bi[t] * 3, b = bi[t + 1] * 3, c = bi[t + 2] * 3; const nx = bw.N[a] + bw.N[b] + bw.N[c], ny = bw.N[a + 1] + bw.N[b + 1] + bw.N[c + 1], nz = bw.N[a + 2] + bw.N[b + 2] + bw.N[c + 2]; sd = ((x - q[0]) * nx + (y - q[1]) * ny + (z - q[2]) * nz) >= 0 ? d : -d; }
          }
        }
        if (bd < 0.06) ds.push(sd);
      }
      ds.sort((p, q) => p - q);
      const at = (f: number) => ds.length ? +(ds[Math.min(ds.length - 1, Math.floor(f * ds.length))] * 1000).toFixed(1) : null;
      const within3 = ds.filter((d) => d < 0.003).length, inside = ds.filter((d) => d < 0).length;
      out.push({ mesh: m.name.replace(/_c\d+$/, ''), n: ds.length, mm: { p1: at(0.01), p5: at(0.05), p25: at(0.25), p50: at(0.5), p95: at(0.95) }, within3mmPct: ds.length ? +(100 * within3 / ds.length).toFixed(1) : 0, insidePct: ds.length ? +(100 * inside / ds.length).toFixed(1) : 0 });
    }
  }
  return out;
}
/** Per shown garment: metres one bind unit along a vertex normal becomes (live skin, and from the inverse binds alone). */
function bindScale(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const s of bodies) for (const m of allMeshes(s)) {
    if (classOf(m) === 'other' || !drawn(m) || !(m as Mesh).skeleton) continue;
    const mesh = m as Mesh, sk = mesh.skeleton!, M = sk.getTransformMatrices(mesh), W = mesh.computeWorldMatrix(true).m;
    const nrm = mesh.getVerticesData('normal'), mi = mesh.getVerticesData('matricesIndices'), mw = mesh.getVerticesData('matricesWeights');
    if (!nrm || !mi || !mw) continue;
    const live: number[] = [], ibm: number[] = [];
    const ibms = sk.bones.map((b) => b.getAbsoluteInverseBindMatrix().m);
    for (let v = 0; v < nrm.length / 3; v += 7) {
      const nx = nrm[v * 3], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2]; let lx = 0, ly = 0, lz = 0, ix = 0, iy = 0, iz = 0;
      for (let k = 0; k < 4; k++) { const w = mw[v * 4 + k]; if (!(w > 0)) continue; const b = mi[v * 4 + k] * 16; lx += w * (M[b] * nx + M[b + 4] * ny + M[b + 8] * nz); ly += w * (M[b + 1] * nx + M[b + 5] * ny + M[b + 9] * nz); lz += w * (M[b + 2] * nx + M[b + 6] * ny + M[b + 10] * nz);
        const I = ibms[mi[v * 4 + k]]; ix += w * Math.hypot(I[0] * nx + I[4] * ny + I[8] * nz, I[1] * nx + I[5] * ny + I[9] * nz, I[2] * nx + I[6] * ny + I[10] * nz); }
      const n = Math.hypot(nx, ny, nz) || 1;
      live.push(Math.hypot(lx * W[0] + ly * W[4] + lz * W[8], lx * W[1] + ly * W[5] + lz * W[9], lx * W[2] + ly * W[6] + lz * W[10]) / n);
      ibm.push(ix / n);
    }
    live.sort((a, b) => a - b); ibm.sort((a, b) => a - b);
    const med = (a: number[]) => +a[Math.floor(a.length / 2)].toFixed(4);
    out.push({ mesh: m.name.replace(/_c\d+$/, ''), live: med(live), ibm: med(ibm), liveMin: +live[0].toFixed(4), liveMax: +live[live.length - 1].toFixed(4) });
  }
  return out;
}
function closestPt(px: number, py: number, pz: number, P: ArrayLike<number>, a: number, b: number, c: number): [number, number, number] {
  const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2], cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [ax, ay, az];
  const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [bx, by, bz];
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const t = d1 / (d1 - d3); return [ax + t * abx, ay + t * aby, az + t * abz]; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [cx, cy, cz];
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const t = d2 / (d2 - d6); return [ax + t * acx, ay + t * acy, az + t * acz]; }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const t = (d4 - d3) / (d4 - d3 + d5 - d6); return [bx + t * (cx - bx), by + t * (cy - by), bz + t * (cz - bz)]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w];
}

(window as unknown as { __name?: unknown }).__name ??= (f: unknown) => f;
(window as unknown as { __KG: unknown }).__KG = {
  init, spawn, clear, gaps, bindScale, run: (src: string) => new Function('scene', 'bodies', 'KG', src)(scene, bodies, (window as unknown as { __KG: unknown }).__KG), pose, unfreeze, clipNames, setCam, bodyCenterY, measureScreen, measureCpu, pokeImage, shot,
  errors: () => errors.splice(0),
  scene: () => scene,
  bodies: () => bodies,
  ready: true,
};
