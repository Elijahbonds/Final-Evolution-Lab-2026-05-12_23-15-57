// COMBAT FX — the fight's own hit language (visual pass, lane/vis-combat, 2026-10-13).
//
// Every combat mode fired EffectsKit.burst('sparks') for every contact: the same orange dots for a jab, a parry, a guard
// and an ultimate, alpha-blended soft circles that read as sparks only because of what they were named. A fighting game's
// first visual language is its HIT: a flash with a shape, a streak that says which way the blow went, a ring when it is
// answered. This is that, as one mount per mode (CombatFx), pooled and tier-budgeted:
//
//   hit(at, from, kind)   an additive impact STAR, directional streaks along the blow, a ring on a parry / heavy / break
//   slam(at)              a ground shockwave ring, a crack decal that fades, debris chunks, dust
//   puff(at)              a soft smoke puff (a blink-in, a landing, a ring-out)
//   blink(from, to)       an afterimage trail: ghosts along the path and a puff at each end (Naruto-Storm's body flicker)
//   aura(key, root, 0..1) a column of energy round a fighter, a light pool at the feet, rising motes — the chi / chakra meter
//
// What it is NOT: it does not time anything, hit-stop anything or change a number. It consumes the shared particle budget
// (visual/ParticleBudget) and the tier the harness recorded on the scene; the sprites are procedural (fxPaint.ts).
// Everything pooled is built once at mount and warmed there, so the first hit of a match never compiles a shader.

import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, StandardMaterial, Texture, TransformNode, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene, ShadowGenerator } from '@babylonjs/core';
import { fitBurst, liveParticles, particleBudget, particleBudgetScale } from '../visual/ParticleBudget';
import { paintAuraColumn, paintCrack, paintDot, paintLightPool, paintRing, paintSmoke, paintStar, type Ctx } from './fxPaint';

export type HitKind = 'light' | 'medium' | 'heavy' | 'special' | 'parry' | 'guard' | 'break';
export const HIT_KINDS: readonly HitKind[] = ['light', 'medium', 'heavy', 'special', 'parry', 'guard', 'break'];
export type FxTier = 'mobile' | 'desktop' | 'high';

export interface HitLook {
  /** the impact star's diameter, metres */
  star: number;
  /** the ring's final diameter, metres (0 = no ring) */
  ring: number;
  /** streak sparks at the desktop tier */
  streaks: number;
  /** streak launch speed, m/s */
  speed: number;
  /** a spark's life, seconds */
  life: number;
  /** [hot core, body] colours; a caller's tint replaces the body */
  colors: readonly [string, string];
  /** dust puffs the blow kicks up (0..1 = none..a full cloud) */
  dust: number;
}

/**
 * How each kind of contact looks, as one table a test can argue with. Light < medium < heavy < special in size and in
 * spark count; the two DEFENCE reads are blue-white (a parry is a ring, the loudest thing in a defence; a guard is a small
 * pale chip); a guard BREAK is cyan, big and shattering. Colour carries the read before the shape does.
 */
export const HIT_LOOK: Record<HitKind, HitLook> = {
  light:   { star: 0.7, ring: 0,   streaks: 8,  speed: 4.5, life: 0.20, colors: ['#fff6d2', '#ffd36b'], dust: 0 },
  medium:  { star: 1.0,  ring: 0,   streaks: 12, speed: 5.5, life: 0.24, colors: ['#ffecb8', '#ff9a3d'], dust: 0.3 },
  heavy:   { star: 1.4,  ring: 1.3, streaks: 18, speed: 7,   life: 0.28, colors: ['#fff0c0', '#ff6a1f'], dust: 0.7 },
  special: { star: 1.95, ring: 2.1, streaks: 28, speed: 9,   life: 0.34, colors: ['#ffffff', '#ff4d8a'], dust: 1 },
  parry:   { star: 0.85, ring: 1.7, streaks: 10, speed: 6,   life: 0.26, colors: ['#f0fdff', '#4cc9ff'], dust: 0 },
  guard:   { star: 0.45, ring: 0.8, streaks: 6,  speed: 3.2, life: 0.18, colors: ['#e2eeff', '#8fa8d8'], dust: 0.3 },
  break:   { star: 1.6,  ring: 1.8, streaks: 22, speed: 8,   life: 0.32, colors: ['#f0fdff', '#22d3ee'], dust: 0.5 },
};

/** Phones draw about half the sparks and fewer motes: fill is what a phone has least of. */
export const TIER_SCALE: Record<FxTier, number> = { mobile: 0.5, desktop: 1, high: 1.25 };

export interface HitPlan { streaks: number; star: boolean; ring: boolean; dust: number }
/** Pure: what a hit of `kind` emits on `tier`. The star is the one thing every kind keeps on every tier. */
export function planHit(kind: HitKind, tier: FxTier): HitPlan {
  const L = HIT_LOOK[kind], k = TIER_SCALE[tier];
  return { streaks: Math.max(4, Math.round(L.streaks * k)), star: true, ring: L.ring > 0, dust: tier === 'mobile' ? Math.round(L.dust * 0.5 * 10) / 10 : L.dust };
}

/** Aura strength 0..1 → what is drawn. Pure, so a test can hold that a fuller meter is a bigger, brighter column. */
export function auraLook(level: number, tier: FxTier): { on: boolean; height: number; radius: number; alpha: number; motes: number; pool: number } {
  const l = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
  if (l < 0.04) return { on: false, height: 0, radius: 0, alpha: 0, motes: 0, pool: 0 };
  const k = TIER_SCALE[tier];
  return { on: true, height: 2.15 + l * 0.55, radius: 0.4 + l * 0.1, alpha: 0.2 + l * 0.5, motes: Math.round((4 + l * 26) * (tier === 'mobile' ? 0.4 : k)), pool: 0.16 + l * 0.3 };
}

/** A strike's weight (any mode's spelling: a karate key, a move weight) → the hit look. `special` = a super / DRAGON / finisher. */
export function hitKindOf(weight: string | undefined, special = false): HitKind {
  if (special) return 'special';
  switch (weight) {
    case 'finisher': return 'special';
    case 'heavy': return 'heavy';
    case 'medium': case 'kick': return 'medium';
    default: return 'light';   // 'light', 'jab', and anything a table forgot: the smallest read, never a missing one
  }
}

/**
 * A fighter's meter → the aura's level. The aura is the FULL-meter read (the DRAGON / the ultimate is ready), so it is
 * a hint from `from` of the way up and a column at full: 0 below `from`, a quarter strength at it, 1 at the top.
 */
export function auraLevel(value: number, max: number, from = 0.7): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  const r = value / max;
  if (r >= 1) return 1;
  if (r <= from) return 0;
  return ((r - from) / (1 - from)) * 0.25;
}

export interface CombatFx {
  /** An impact at `at` (world; the contact point), the blow travelling away from `from` (the attacker; null = no direction). */
  hit(at: Vector3, from: { x: number; z: number } | null, kind: HitKind, tint?: string): void;
  /** A heavy body-slam on the floor at `at`: shockwave, crack, debris, dust. */
  slam(at: Vector3, strength?: number, tint?: string): void;
  /** Chunks thrown up from `at` (a gate breaking, a wall giving way): `amount` scales the count; `tint` the colour (default timber-brown). */
  debris(at: Vector3, amount?: number, tint?: string): void;
  /** A flat shockwave ring on the floor at `at` (its y is the floor): `radius` m across at the end, `life` s. */
  ring(at: Vector3, radius: number, tint?: string, life?: number): void;
  /** A soft smoke puff. */
  puff(at: Vector3, scale?: number, tint?: string): void;
  /** An afterimage trail from `from` to `to`: ghosts along the path, a puff at each end. */
  blink(from: Vector3, to: Vector3, tint?: string): void;
  /** The aura round a fighter. `level` 0..1 (0 = off); call every frame or on change, it only does work when it changes. */
  aura(key: string, root: TransformNode, level: number, color?: string): void;
  /** Turn every aura off (a round's end, a KO). */
  clearAuras(): void;
  tick(dt: number): void;
  dispose(): void;
}

// ── textures (one per scene, cached by name) ──────────────────────────────────────────────────────────────────────────

function canvasTex(scene: Scene, name: string, w: number, h: number, paint: (c: Ctx) => void, wrap = false): DynamicTexture {
  const hit = scene.getTextureByName(name);
  if (hit) return hit as DynamicTexture;
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, true);
  paint(tex.getContext() as unknown as Ctx);
  tex.update(false);
  tex.hasAlpha = true;
  if (wrap) { tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.CLAMP_ADDRESSMODE; }
  return tex;
}
const starTex = (s: Scene): DynamicTexture => canvasTex(s, 'cfx_star', 128, 128, (c) => paintStar(c, 128));
const ringTex = (s: Scene): DynamicTexture => canvasTex(s, 'cfx_ring', 128, 128, (c) => paintRing(c, 128));
const dotTex = (s: Scene): DynamicTexture => canvasTex(s, 'cfx_dot', 32, 32, (c) => paintDot(c, 32));
const smokeTex = (s: Scene): DynamicTexture => canvasTex(s, 'cfx_smoke', 128, 128, (c) => paintSmoke(c, 128));
const crackTex = (s: Scene): DynamicTexture => canvasTex(s, 'cfx_crack', 256, 256, (c) => paintCrack(c, 256));
const poolTex = (s: Scene): DynamicTexture => canvasTex(s, 'cfx_pool', 128, 128, (c) => paintLightPool(c, 128));
const auraTex = (s: Scene): DynamicTexture => canvasTex(s, 'cfx_aura', 256, 256, (c) => paintAuraColumn(c, 256, 256), true);

/** An unlit, tinted, alpha-shaped material: colour from emissive, shape from the texture's alpha. No lighting, ever. */
function glowMat(scene: Scene, name: string, tex: Texture, hex: string, additive: boolean): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.emissiveColor = Color3.FromHexString(hex);
  m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black();
  m.opacityTexture = tex;
  m.backFaceCulling = false;
  if (additive) m.alphaMode = 1;   // Engine.ALPHA_ADD
  m.disableDepthWrite = true;
  return m;
}

/** FX meshes are light and marks, not bodies: they must never throw a shadow (the rig adds every new mesh as a caster). */
export function uncastShadow(scene: Scene, mesh: AbstractMesh): void { uncast(scene, mesh); }
function uncast(scene: Scene, mesh: AbstractMesh): void {
  mesh.receiveShadows = false; mesh.isPickable = false;
  for (const l of scene.lights) { try { (l.getShadowGenerator() as ShadowGenerator | null)?.removeShadowCaster(mesh, true); } catch { /* no generator */ } }
}

// BABYLON'S SIZE GRADIENT IS ABSOLUTE: with `addSizeGradient` the particle's size is the gradient's factor (minSize / maxSize are ignored),
// and `scale` multiplies it. So every system below uses its gradient as a SHAPE (a curve between 0 and 1) and carries the physical size
// in `minScaleX..maxScaleY`, set per hit. (Measured the hard way: sizes written into the gradient made one streak a metre long.)
function sys(scene: Scene, name: string, capacity: number, tex: Texture, additive: boolean): ParticleSystem {
  const ps = new ParticleSystem(name, capacity, scene);
  ps.particleTexture = tex;
  ps.blendMode = additive ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
  ps.emitter = new Vector3();
  ps.disposeOnStop = false;
  ps.emitRate = 0;
  ps.manualEmitCount = 0;
  ps.minEmitBox = Vector3.Zero(); ps.maxEmitBox = Vector3.Zero();
  ps.start();
  return ps;
}

const c4 = (hex: string, a = 1): Color4 => { const c = Color3.FromHexString(hex); return new Color4(c.r, c.g, c.b, a); };

/** Emit `n` into a pooled system at `at`, taking the next system in the round-robin (a busy one is simply re-armed: its
 *  live particles keep their own colours and sizes, only new ones take the new look). */
function nextOf<T>(pool: T[], cursor: { i: number }): T { const s = pool[cursor.i % pool.length]; cursor.i++; return s; }

const TWO_PI = Math.PI * 2;

function applyAuraColour(a: { hex: string; colMat: StandardMaterial; poolMat: StandardMaterial; motes: ParticleSystem }, color: string): void {
  a.hex = color; const c = Color3.FromHexString(color);
  a.colMat.emissiveColor = c; a.poolMat.emissiveColor = c;
  a.motes.color1 = new Color4(c.r, c.g, c.b, 0.9);
  a.motes.color2 = new Color4(Math.min(1, c.r * 1.2 + 0.2), Math.min(1, c.g * 1.2 + 0.2), Math.min(1, c.b * 1.2 + 0.2), 0.8);
  a.motes.colorDead = new Color4(c.r, c.g, c.b, 0);
}

interface GroundRing { mesh: Mesh; mat: StandardMaterial; t: number; life: number; r0: number; r1: number; a: number }
interface Crack { mesh: Mesh; mat: StandardMaterial; t: number; life: number }
interface Aura {
  key: string; root: TransformNode; col: Mesh; colMat: StandardMaterial; pool: Mesh; poolMat: StandardMaterial;
  motes: ParticleSystem; moteAt: Vector3; level: number; target: number; hex: string; t: number;
}
interface Ghost { ps: ParticleSystem; pts: Vector3[]; at: number }

export function mountCombatFx(scene: Scene, opts: { tier?: FxTier } = {}): CombatFx {
  const md = scene.metadata as { felTier?: string } | null;
  const tier: FxTier = opts.tier ?? (md?.felTier === 'mobile' || md?.felTier === 'high' ? md.felTier : 'desktop');
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => { owned.push(x); return x; };

  const star = starTex(scene), ring = ringTex(scene), dot = dotTex(scene), smoke = smokeTex(scene);

  // ── pooled particle systems: built and warmed now ──
  const stars: ParticleSystem[] = [], streaks: ParticleSystem[] = [], rings: ParticleSystem[] = [], smokes: ParticleSystem[] = [], chunks: ParticleSystem[] = [];
  for (let i = 0; i < 4; i++) {
    const s = own(sys(scene, `cfx_star_${i}`, 4, star, true));
    s.billboardMode = ParticleSystem.BILLBOARDMODE_ALL;
    s.minLifeTime = 0.1; s.maxLifeTime = 0.18; s.minEmitPower = 0; s.maxEmitPower = 0;
    s.addSizeGradient(0, 0.35); s.addSizeGradient(0.2, 1); s.addSizeGradient(1, 0);
    s.minAngularSpeed = -2.5; s.maxAngularSpeed = 2.5; s.minInitialRotation = -0.3; s.maxInitialRotation = 0.3;
    stars.push(s);
    const k = own(sys(scene, `cfx_streak_${i}`, 48, dot, true));
    k.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    k.gravity = new Vector3(0, -7, 0);
    k.addSizeGradient(0, 1); k.addSizeGradient(1, 0.15);
    streaks.push(k);
    const r = own(sys(scene, `cfx_ringp_${i}`, 3, ring, true));
    r.billboardMode = ParticleSystem.BILLBOARDMODE_ALL;
    r.minLifeTime = 0.2; r.maxLifeTime = 0.3; r.minEmitPower = 0; r.maxEmitPower = 0;
    r.addSizeGradient(0, 0.2); r.addSizeGradient(0.35, 0.8); r.addSizeGradient(1, 1);
    rings.push(r);
  }
  for (let i = 0; i < 2; i++) {
    const s = own(sys(scene, `cfx_smoke_${i}`, 28, smoke, false));
    s.billboardMode = ParticleSystem.BILLBOARDMODE_ALL;
    s.minLifeTime = 0.45; s.maxLifeTime = 0.9; s.minEmitPower = 0.3; s.maxEmitPower = 1.2;
    s.direction1 = new Vector3(-1, 0.25, -1); s.direction2 = new Vector3(1, 0.9, 1);
    s.gravity = new Vector3(0, 0.6, 0);
    s.addSizeGradient(0, 0.45); s.addSizeGradient(1, 1.6);
    s.minAngularSpeed = -0.8; s.maxAngularSpeed = 0.8; s.minInitialRotation = 0; s.maxInitialRotation = TWO_PI;
    smokes.push(s);
    const c = own(sys(scene, `cfx_chunk_${i}`, 24, dot, false));
    c.billboardMode = ParticleSystem.BILLBOARDMODE_ALL;
    c.minLifeTime = 0.5; c.maxLifeTime = 0.85; c.minEmitPower = 2.2; c.maxEmitPower = 5;
    c.direction1 = new Vector3(-0.8, 0.9, -0.8); c.direction2 = new Vector3(0.8, 1.8, 0.8);
    c.gravity = new Vector3(0, -13, 0);
    c.color1 = c4('#6b5a48'); c.color2 = c4('#3c3128'); c.colorDead = c4('#3c3128', 0);
    c.minSize = 0.05; c.maxSize = 0.13;
    chunks.push(c);
  }
  // the afterimage ghosts: tall soft ovals that stay where they were laid and fade
  const ghost: Ghost = { ps: own(sys(scene, 'cfx_ghost', 12, dot, true)), pts: [], at: 0 };
  ghost.ps.billboardMode = ParticleSystem.BILLBOARDMODE_ALL;
  ghost.ps.minScaleX = 0.34; ghost.ps.maxScaleX = 0.34; ghost.ps.minScaleY = 1; ghost.ps.maxScaleY = 1;
  ghost.ps.minSize = 1.85; ghost.ps.maxSize = 1.85; ghost.ps.minLifeTime = 0.34; ghost.ps.maxLifeTime = 0.34;
  ghost.ps.minEmitPower = 0; ghost.ps.maxEmitPower = 0;
  ghost.ps.startPositionFunction = (_wm, pos) => { const p = ghost.pts[ghost.at++ % Math.max(1, ghost.pts.length)]; if (p) pos.copyFrom(p); };
  // compile every variant now (the stretched and the plain additive, the alpha puff), not on the first blow
  for (const p of [stars[0], streaks[0], rings[0], smokes[0], chunks[0], ghost.ps]) { try { p.isReady(); } catch { /* headless */ } }

  const cur = { star: { i: 0 }, streak: { i: 0 }, ring: { i: 0 }, smoke: { i: 0 }, chunk: { i: 0 } };
  const tmpA = new Vector3(), tmpB = new Vector3();

  const budgeted = (n: number): number => fitBurst(n, liveParticles(scene), particleBudget(scene), particleBudgetScale(scene));

  // ── ground rings and crack decals: a handful of flat meshes, enabled only while they live ──
  const grMat0 = ringTex(scene);
  const groundRings: GroundRing[] = [];
  for (let i = 0; i < 3; i++) {
    const mesh = MeshBuilder.CreateGround(`cfx_groundring_${i}`, { width: 1, height: 1 }, scene);
    const mat = glowMat(scene, `cfx_groundring_m_${i}`, grMat0, '#ffffff', true);
    mesh.material = mat; mesh.setEnabled(false); uncast(scene, mesh);
    own(mesh); own(mat);
    groundRings.push({ mesh, mat, t: 1, life: 0.5, r0: 0.5, r1: 4, a: 0 });
  }
  const cracks: Crack[] = [];
  const crk = crackTex(scene);
  for (let i = 0; i < 4; i++) {
    const mesh = MeshBuilder.CreateGround(`cfx_crack_${i}`, { width: 1, height: 1 }, scene);
    const mat = new StandardMaterial(`cfx_crack_m_${i}`, scene);
    mat.disableLighting = true; mat.emissiveColor = Color3.Black(); mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black();   // the colour is the texture's (emissive adds, it does not multiply)
    mat.opacityTexture = crk; mat.emissiveTexture = crk; mat.backFaceCulling = false; mat.zOffset = -2;
    mesh.material = mat; mesh.setEnabled(false); uncast(scene, mesh);
    own(mesh); own(mat);
    cracks.push({ mesh, mat, t: 1, life: 6 });
  }
  let ringCursor = 0, crackCursor = 0;

  // ── auras ──
  const auras = new Map<string, Aura>();
  const mkAura = (key: string, root: TransformNode): Aura => {
    const colMat = glowMat(scene, `cfx_aura_m_${key}`, auraTex(scene), '#ffffff', true);
    const col = MeshBuilder.CreateCylinder(`cfx_aura_${key}`, { height: 1, diameterTop: 0.78, diameterBottom: 1, tessellation: 20, cap: Mesh.NO_CAP, sideOrientation: Mesh.DOUBLESIDE }, scene);
    col.material = colMat; col.parent = root; col.setEnabled(false); uncast(scene, col);
    const poolMat = glowMat(scene, `cfx_aura_pool_m_${key}`, poolTex(scene), '#ffffff', true);
    const pool = MeshBuilder.CreateGround(`cfx_aura_pool_${key}`, { width: 1, height: 1 }, scene);
    pool.material = poolMat; pool.parent = root; pool.position.y = 0.03; pool.setEnabled(false); uncast(scene, pool);
    const moteAt = new Vector3();
    const motes = sys(scene, `cfx_aura_motes_${key}`, 40, dot, true);
    motes.emitter = moteAt;
    motes.minEmitBox = new Vector3(-0.42, 0, -0.42); motes.maxEmitBox = new Vector3(0.42, 0.25, 0.42);
    motes.direction1 = new Vector3(-0.08, 1, -0.08); motes.direction2 = new Vector3(0.08, 1.5, 0.08);
    motes.minEmitPower = 0.7; motes.maxEmitPower = 1.6; motes.minLifeTime = 0.7; motes.maxLifeTime = 1.2;
    motes.minScaleX = motes.minScaleY = 0.05; motes.maxScaleX = motes.maxScaleY = 0.12; motes.addSizeGradient(0, 1); motes.addSizeGradient(1, 0.1);
    motes.gravity = new Vector3(0, 0.4, 0);
    motes.manualEmitCount = -1;   // a steady stream, not a manual burst
    motes.stop();   // started only while the aura is on (an idle emitter costs nothing but is not free)
    const a: Aura = { key, root, col, colMat, pool, poolMat, motes, moteAt, level: 0, target: 0, hex: '', t: 0 };
    applyAuraColour(a, '#ffd36b');   // gold until a mode says otherwise
    owned.push({ dispose: () => { col.dispose(false, true); pool.dispose(false, true); motes.dispose(); poolMat.dispose(); colMat.dispose(); } });
    return a;
  };

  // The two auras every mode uses are built NOW, docked on a scratch node and switched off, and every pooled material is compiled
  // now (forceCompilation on its mesh): the first full-chi aura or first slam of a match must not stall the frame it appears on.
  const dock = new TransformNode('cfx_dock', scene); own(dock);
  for (const key of ['me', 'foe']) auras.set(key, mkAura(key, dock));
  const warm = (mat: { forceCompilation?: (m: AbstractMesh, cb?: () => void) => void } | null | undefined, mesh: AbstractMesh | undefined): void => {
    if (!mat || !mesh) return;
    try { mat.forceCompilation?.(mesh); } catch { /* a headless engine has nothing to compile */ }
  };
  warm(groundRings[0].mat, groundRings[0].mesh); warm(cracks[0].mat, cracks[0].mesh);
  for (const a of auras.values()) { warm(a.colMat, a.col); warm(a.poolMat, a.pool); try { a.motes.isReady(); } catch { /* headless */ } }

  const fx: CombatFx = {
    hit(at, from, kind, tint) {
      const L = HIT_LOOK[kind], plan = planHit(kind, tier);
      const hot = c4(L.colors[0]), body = c4(tint ?? L.colors[1]);
      // the star: one bright glint, a little bigger than the blow
      const s = nextOf(stars, cur.star);
      (s.emitter as Vector3).copyFrom(at);
      s.color1 = hot; s.color2 = body; s.colorDead = new Color4(body.r, body.g, body.b, 0);
      s.minScaleX = s.minScaleY = L.star * 0.85; s.maxScaleX = s.maxScaleY = L.star;   // (the gradient is the shape; the scale is the metres)
      s.manualEmitCount = 1;
      // the streaks fly along the blow (a cone round the direction away from the attacker), with a lift
      const k = nextOf(streaks, cur.streak);
      (k.emitter as Vector3).copyFrom(at);
      let dx = 0, dz = 0;
      if (from) { dx = at.x - from.x; dz = at.z - from.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
      const spread = from ? 0.5 : 1;
      k.direction1.set(dx * 1.3 - spread, 0.05, dz * 1.3 - spread);
      k.direction2.set(dx * 1.3 + spread, 0.85, dz * 1.3 + spread);
      k.color1 = hot; k.color2 = body; k.colorDead = new Color4(body.r, body.g, body.b, 0);
      k.minEmitPower = L.speed * 0.55; k.maxEmitPower = L.speed;
      k.minLifeTime = L.life * 0.6; k.maxLifeTime = L.life;
      k.minScaleX = 0.03 + 0.02 * L.star; k.maxScaleX = 0.045 + 0.03 * L.star;   // width, metres
      k.minScaleY = 0.2 + 0.17 * L.star; k.maxScaleY = 0.3 + 0.25 * L.star;      // length along the flight, metres
      k.manualEmitCount = budgeted(plan.streaks);
      if (plan.ring) {
        const r = nextOf(rings, cur.ring);
        (r.emitter as Vector3).copyFrom(at);
        r.color1 = hot; r.color2 = body; r.colorDead = new Color4(body.r, body.g, body.b, 0);
        r.minScaleX = r.minScaleY = L.ring * 0.9; r.maxScaleX = r.maxScaleY = L.ring;
        r.manualEmitCount = 1;
      }
      if (plan.dust > 0.2 && tier !== 'mobile') {
        const d = nextOf(smokes, cur.smoke);
        tmpA.copyFrom(at); tmpA.y = Math.max(0.1, at.y - 0.9);   // dust lifts off the floor under the blow, not off the body
        (d.emitter as Vector3).copyFrom(tmpA);
        d.color1 = c4('#d8cfc2', 0.5); d.color2 = c4('#b9ae9f', 0.4); d.colorDead = c4('#b9ae9f', 0);
        d.minScaleX = d.minScaleY = 0.25 * (0.5 + plan.dust); d.maxScaleX = d.maxScaleY = 0.5 * (0.5 + plan.dust);
        d.manualEmitCount = budgeted(Math.round(5 + plan.dust * 6));
      }
    },

    slam(at, strength = 1, tint) {
      const k = Math.max(0.5, Math.min(2, strength));
      const hex = tint ?? '#ffb070';
      // shockwave: a flat ring that races outward and fades
      const g = groundRings[ringCursor++ % groundRings.length];
      g.mesh.position.set(at.x, at.y + 0.04, at.z); g.mat.emissiveColor = Color3.FromHexString(hex);
      g.r0 = 0.4 * k; g.r1 = 3.6 * k; g.t = 0; g.life = 0.5; g.a = 0.9;
      g.mesh.scaling.set(g.r0 * 2, 1, g.r0 * 2); g.mat.alpha = g.a; g.mesh.setEnabled(true);
      // crack decal: stays and fades (cheap: one flat quad, enabled for ~6 s)
      const c = cracks[crackCursor++ % cracks.length];
      c.mesh.position.set(at.x, at.y + 0.012 + (crackCursor % 4) * 0.002, at.z); c.mesh.rotation.y = (crackCursor * 1.7) % TWO_PI;
      c.mesh.scaling.set(2.6 * k, 1, 2.6 * k); c.t = 0; c.life = 6; c.mat.alpha = 0.95; c.mesh.setEnabled(true);
      // debris: chunks thrown out and down, plus a dust ring
      if (tier !== 'mobile' || k > 1) {
        const d = nextOf(chunks, cur.chunk);
        tmpB.set(at.x, at.y + 0.1, at.z); (d.emitter as Vector3).copyFrom(tmpB);
        d.manualEmitCount = budgeted(Math.round(12 * k));
      }
      fx.puff(tmpA.set(at.x, at.y + 0.15, at.z), 1.2 * k);
    },

    debris(at, amount = 1, tint) {
      const d = nextOf(chunks, cur.chunk);
      (d.emitter as Vector3).copyFrom(at);
      const c = tint ?? '#6b5a48';
      d.color1 = c4(c); d.color2 = c4(c).scale(0.55) as Color4; d.colorDead = c4(c, 0);
      d.manualEmitCount = budgeted(Math.round((tier === 'mobile' ? 8 : 16) * Math.max(0.5, Math.min(2, amount))));
    },

    ring(at, radius, tint, life = 0.45) {
      const g = groundRings[ringCursor++ % groundRings.length];
      g.mesh.position.set(at.x, at.y + 0.04, at.z); g.mat.emissiveColor = Color3.FromHexString(tint ?? '#ffffff');
      g.r0 = radius * 0.12; g.r1 = radius; g.t = 0; g.life = life; g.a = 0.85;
      g.mesh.scaling.set(g.r0 * 2, 1, g.r0 * 2); g.mat.alpha = g.a; g.mesh.setEnabled(true);
    },

    puff(at, scale = 1, tint) {
      const d = nextOf(smokes, cur.smoke);
      (d.emitter as Vector3).copyFrom(at);
      const base = tint ?? '#e4ddd0';
      d.color1 = c4(base, 0.55); d.color2 = c4(base, 0.4); d.colorDead = c4(base, 0);
      d.minScaleX = d.minScaleY = 0.35 * scale; d.maxScaleX = d.maxScaleY = 0.7 * scale;
      d.manualEmitCount = budgeted(Math.round((tier === 'mobile' ? 6 : 11) * Math.min(2, scale)));
    },

    blink(from, to, tint) {
      const hex = tint ?? '#cfe8ff';
      const n = tier === 'mobile' ? 4 : 7;
      ghost.pts.length = 0;
      for (let i = 0; i < n; i++) { const t = i / (n - 1); ghost.pts.push(new Vector3(from.x + (to.x - from.x) * t, from.y + 0.95, from.z + (to.z - from.z) * t)); }
      ghost.at = 0;
      ghost.ps.color1 = c4(hex, 0.55); ghost.ps.color2 = c4(hex, 0.4); ghost.ps.colorDead = c4(hex, 0);
      (ghost.ps.emitter as Vector3).set(0, 0, 0);
      ghost.ps.manualEmitCount = n;
      fx.puff(tmpB.set(from.x, from.y + 0.2, from.z), 1);
      fx.puff(tmpB.set(to.x, to.y + 0.2, to.z), 1.25);
    },

    aura(key, root, level, color) {
      let a = auras.get(key);
      if (!a) { if (level < 0.04) return; a = mkAura(key, root); auras.set(key, a); }   // (a key the modes do not use is built on demand)
      if (a.root !== root) { a.root = root; a.col.parent = root; a.pool.parent = root; }
      a.target = Math.max(0, Math.min(1, level));
      if (color && color !== a.hex) applyAuraColour(a, color);
    },

    clearAuras() { for (const a of auras.values()) a.target = 0; },

    tick(dt) {
      for (const g of groundRings) {
        if (!g.mesh.isEnabled()) continue;
        g.t += dt; const u = Math.min(1, g.t / g.life), e = 1 - (1 - u) * (1 - u);
        const r = g.r0 + (g.r1 - g.r0) * e;
        g.mesh.scaling.set(r * 2, 1, r * 2); g.mat.alpha = g.a * (1 - u) * (1 - u);
        if (u >= 1) g.mesh.setEnabled(false);
      }
      for (const c of cracks) {
        if (!c.mesh.isEnabled()) continue;
        c.t += dt;
        const u = c.t / c.life;
        c.mat.alpha = u < 0.6 ? 0.95 : 0.95 * Math.max(0, 1 - (u - 0.6) / 0.4);
        if (u >= 1) c.mesh.setEnabled(false);
      }
      for (const a of auras.values()) {
        a.t += dt;
        a.level += (a.target - a.level) * Math.min(1, dt * 5);   // the aura swells and subsides, it does not pop
        if (a.level < 0.02 && a.target <= 0) { if (a.col.isEnabled()) { a.col.setEnabled(false); a.pool.setEnabled(false); a.motes.stop(); } continue; }
        const L = auraLook(a.level, tier);
        if (!L.on) continue;
        if (!a.col.isEnabled()) { a.col.setEnabled(true); a.pool.setEnabled(true); a.motes.start(); }
        const pulse = 1 + Math.sin(a.t * 9) * 0.05;
        a.col.scaling.set(L.radius * 2 * pulse, L.height, L.radius * 2 * pulse); a.col.position.y = L.height / 2;
        a.col.rotation.y = a.t * 1.1;
        (a.colMat.opacityTexture as Texture).uOffset = a.t * 0.35;   // the ribbons drift sideways through the column as it turns: it flows, it is not a tube
        a.colMat.alpha = L.alpha * (0.85 + Math.sin(a.t * 13) * 0.15);
        a.pool.scaling.set(2.6 + a.level * 0.8, 1, 2.6 + a.level * 0.8); a.poolMat.alpha = L.pool * (0.85 + Math.sin(a.t * 7) * 0.15);
        a.root.computeWorldMatrix(false); a.moteAt.copyFrom(a.root.getAbsolutePosition());
        a.motes.emitRate = L.motes * 3;
      }
    },

    dispose() {
      for (let i = owned.length - 1; i >= 0; i--) { try { owned[i].dispose(); } catch { /* already gone with the scene */ } }
      owned.length = 0; auras.clear();
    },
  };
  // a probe's seam (the way `scene.metadata.fight` is): proofs stage a hit, an aura, a slam on a known frame instead of waiting for play to produce one
  ((scene.metadata ??= {}) as { felCombatFx?: CombatFx }).felCombatFx = fx;
  return fx;
}
