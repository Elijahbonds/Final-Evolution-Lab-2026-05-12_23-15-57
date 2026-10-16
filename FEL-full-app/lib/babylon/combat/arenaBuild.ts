// ARENA BUILD — the meshes for a combat arena (combat/arenas.ts): its walls, ropes, pillars, hazards, and for a drop
// arena the platform and the pit under it. Everything under one root, so dispose() is total (the NexusVenue rule).
//
// Walls are named `wall_arena_*` so the CameraDirector's occlusion probe sees them (it keys on the 'wall_' prefix, see
// NexusWebScene's wall prop). The venue paints the floor and the sky (mountVenue with the `arena` option); this builds
// only what the fight touches.
//
// VISUAL PASS (lane/vis-combat, 2026-10-13): what the arena is MADE OF and how it is lit. The walls wear a painted tile
// per style (plaster and timber, shrine stone, riveted steel with glowing vents, a lit billboard, sea rock — arenaPaint.ts),
// the floor wears an overlay (a court's lines, a sigil, a neon octagon, a hazard frame, the house crest), the fire pits
// burn (flame and ember particles, a flickering pool of light on the floor) and the dojo's lanterns give light. Fixtures
// are named so the foundation's glow include list (scene/EmissiveGlow) picks them up on the tiers that have it; nothing
// here adds a real light (clustered lights are the foundation's second half) — the light is faked where it falls.

import {
  Color3, Color4, DynamicTexture, Matrix, Mesh, MeshBuilder, ParticleSystem, PBRMaterial, Quaternion, Scene, StandardMaterial, Texture, TransformNode, Vector3, Vector4,
} from '@babylonjs/core';
import type { AbstractMesh, LinesMesh, ShadowGenerator } from '@babylonjs/core';
import type { CombatArena } from './arenas';
import { addHeatSource } from '../scene/HeatHaze';   // w3-atmos: a fire pit's column of hot air (the light rig mounts the pass once load() is done)
import { paintDot, paintFlame, paintGate, paintLightPool, type Ctx } from './fxPaint';
import {
  FLOOR_HAS_EMISSIVE, WALL_HAS_EMISSIVE, WALL_TILE_M, floorStyleOf, paintFloor, paintWall, wallStyleOf, type FloorStyle, type WallStyle,
} from './arenaPaint';

export interface ArenaHandle {
  root: TransformNode;
  /** Advance the hazard flames and the rope glow. */
  tick(dt: number): void;
  dispose(): void;
}

export interface ArenaBuildOptions {
  /** Build the raised platform + the pit for a DROP arena (Mixed / Duel). Default true for drop edges. */
  platform?: boolean;
  /** How far the platform's top sits above y 0 (Duel stands its bodies on DISC_LIFT). */
  lift?: number;
}

function pbr(scene: Scene, name: string, hex: string, rough = 0.85, metal = 0): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(hex); m.roughness = rough; m.metallic = metal; m.environmentIntensity = 0.35;
  return m;
}
function glow(scene: Scene, name: string, hex: string, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.emissiveColor = Color3.FromHexString(hex); m.disableLighting = true; m.alpha = alpha;
  return m;
}

// ── the dressing plan: what an arena gets, as data (a test holds it) ─────────────────────────────────────────────────────

export interface LanternSpot { x: number; z: number; ang: number }
export interface PoolSpot { x: number; z: number; r: number; hex: string; a: number; flicker: number }

/** Lanterns stand on the cap of a plaster or stone wall, one every ~LANTERN_EVERY_M. Phones take every other one. */
export const LANTERN_EVERY_M = 3.1;
export const LANTERN_RISE = 0.34;
export const LANTERN_HEX = '#ffb561';

export function wantsLanterns(a: CombatArena): boolean {
  const st = wallStyleOf(a);
  return a.walls.length > 0 && (st === 'plaster' || st === 'stone');
}

/** Pure: where the lanterns stand — along each wall, `LANTERN_EVERY_M` apart (at least one per wall), facing in. */
export function lanternSpots(a: CombatArena, mobile = false): LanternSpot[] {
  if (!wantsLanterns(a)) return [];
  const out: LanternSpot[] = [];
  // a disc's wall is an N-gon of short chords: one lantern per ~3.1 m of wall, not one per chord
  let carry = LANTERN_EVERY_M * 0.5;
  for (const w of a.walls) {
    const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, len = Math.hypot(dx, dz);
    let s = carry;
    while (s < len) { const t = s / len; out.push({ x: w.a.x + dx * t, z: w.a.z + dz * t, ang: Math.atan2(w.nx, w.nz) }); s += LANTERN_EVERY_M; }
    carry = s - len;
  }
  return mobile ? out.filter((_, i) => i % 2 === 0) : out;
}

/** Pure: the fire pits (and a shock pad's arcs): where they burn and how big. */
export function fireSpots(a: CombatArena): Array<{ x: number; z: number; r: number; kind: 'fire' | 'shock' }> {
  return a.hazards.map((h) => ({ x: h.x, z: h.z, r: h.r, kind: h.kind }));
}

/** Pure: the floor's pools of fake light — under every lantern (pulled in from the wall) and over every hazard. */
export function poolSpots(a: CombatArena, mobile = false): PoolSpot[] {
  const out: PoolSpot[] = [];
  for (const l of lanternSpots(a, mobile)) {
    out.push({ x: l.x + Math.sin(l.ang) * 1.5, z: l.z + Math.cos(l.ang) * 1.5, r: 2.7, hex: LANTERN_HEX, a: 0.2, flicker: 0.06 });
  }
  for (const h of a.hazards) out.push({ x: h.x, z: h.z, r: h.r * 3.6, hex: h.kind === 'fire' ? '#ff7a2a' : '#7dd3fc', a: h.kind === 'fire' ? 0.42 : 0.32, flicker: 0.14 });
  return out;
}

/** The overhead rig a raised octagon (a drop arena the platform is built for) hangs: cans on a ring, each throwing a beam. */
export function wantsOverheadRig(a: CombatArena): boolean {
  return a.edge === 'drop' && a.shape.kind === 'disc' && a.walls.length === 0;
}
export const RIG_CANS = 8;
export const RIG_HEIGHT = 8.4;

// ── textures (owned by the arena: disposed with it) ──────────────────────────────────────────────────────────────────────

function paintedTexture(scene: Scene, name: string, w: number, h: number, paint: (c: Ctx) => void, wrapU = false): DynamicTexture {
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, true);
  paint(tex.getContext() as unknown as Ctx);
  tex.update(true);
  tex.hasAlpha = true;
  tex.anisotropicFilteringLevel = 8;
  if (wrapU) { tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.CLAMP_ADDRESSMODE; }
  return tex;
}

/** Dressing that is light or a mark, not a body: it must not throw a shadow (the rig adds every new mesh as a caster). */
function uncast(scene: Scene, mesh: AbstractMesh): void {
  mesh.receiveShadows = false;
  for (const l of scene.lights) { try { (l.getShadowGenerator() as ShadowGenerator | null)?.removeShadowCaster(mesh, true); } catch { /* none */ } }
}

/** The quaternion that takes +y to `v` (unit). */
function upTo(v: Vector3): Quaternion {
  const c = v.y;
  if (c > 0.99999) return Quaternion.Identity();
  if (c < -0.99999) return Quaternion.RotationAxis(Vector3.Right(), Math.PI);
  const axis = new Vector3(v.z, 0, -v.x).normalize();   // +y × v
  return Quaternion.RotationAxis(axis, Math.acos(c));
}

/**
 * Merge static meshes that share a material into one, keeping the first one's look (parent, shadows, picking). The sources must
 * hang off a root that sits at the origin, unrotated and unscaled: the merge bakes WORLD space, so any other root would apply
 * its transform twice. Returns the merged mesh, or null when it did nothing (fewer than two, a moved root, mixed materials).
 */
export function mergeWallSet(list: Mesh[], name: string, root: TransformNode): Mesh | null {
  if (list.length < 2 || !root.computeWorldMatrix(true).isIdentity()) return null;
  const mat = list[0].material;
  if (list.some((m) => m.material !== mat || m.isDisposed())) return null;
  const receive = list[0].receiveShadows;
  const merged = Mesh.MergeMeshes(list, true, true, undefined, false, false);
  if (!merged) return null;
  merged.name = name; merged.parent = root; merged.material = mat; merged.isPickable = false; merged.receiveShadows = receive;
  return merged;
}

export function buildArena(scene: Scene, arena: CombatArena, opts: ArenaBuildOptions = {}): ArenaHandle {
  const root = new TransformNode(`arena_${arena.id}`, scene);
  const lift = opts.lift ?? 0;
  const tier = (scene.metadata as { felTier?: string } | null)?.felTier;
  const mobile = tier === 'mobile';
  const owned: { dispose(): void }[] = [];
  const ropes: StandardMaterial[] = [];
  const flicker: Array<(t: number) => void> = [];
  const wallStyle: WallStyle = wallStyleOf(arena);
  const A = arena.look.accent;
  const ropesArena = arena.edge === 'ropes';

  // ── walls: a painted slab per segment, or a translucent rope panel for a cage ──
  let wallMat: PBRMaterial | StandardMaterial;
  let wallAlbedo: DynamicTexture | null = null;   // the pillars wear the same plate (a foundry's pillars are steel too)
  if (ropesArena) {
    wallMat = glow(scene, `arena_${arena.id}_ropes_m`, arena.look.wallColor, 0.28);
    ropes.push(wallMat as StandardMaterial);
  } else {
    const pm = pbr(scene, `arena_${arena.id}_wall_m`, '#ffffff', 0.92);
    // the tile: albedo painted from the arena's own wall colour; vents / the lit board ride an emissive texture
    const albedo = paintedTexture(scene, `arena_${arena.id}_wall_t`, 512, 512, (c) => { paintWall(c, 512, wallStyle, arena.look.wallColor, A); }, true);
    albedo.hasAlpha = false; owned.push(albedo);
    pm.albedoTexture = albedo; wallAlbedo = albedo;
    if (WALL_HAS_EMISSIVE.has(wallStyle)) {
      const em = paintedTexture(scene, `arena_${arena.id}_wall_e`, 512, 512, (c) => { paintWall(c, 512, wallStyle, arena.look.wallColor, A, true); }, true);
      em.hasAlpha = false; owned.push(em);
      // the vents / the lit board shine through BLOOM (depth-aware), not the foundation's GlowLayer: its include list does not
      // occlude, so a glowing wall behind the pillars and the fighters bleeds over them (measured on the Foundry's vents)
      pm.emissiveTexture = em; pm.emissiveColor = Color3.White(); pm.emissiveIntensity = wallStyle === 'billboard' ? 1.0 : 1.35;
    }
    wallMat = pm;
  }
  owned.push(wallMat);
  wallMat.backFaceCulling = true;
  const railMat = glow(scene, ropesArena ? `neon_arena_${arena.id}_rail_m` : `arena_${arena.id}_rail_m`, A);   // only the cage's ropes are named for the glow list: thin tubes, far from the bodies
  owned.push(railMat);
  const wallPanels: Mesh[] = [], wallCaps: Mesh[] = [];   // a phone merges each set into one mesh (below)
  arena.walls.forEach((w, i) => {
    const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, len = Math.hypot(dx, dz);
    const thick = ropesArena ? 0.06 : 0.35;
    // A PLANE FACING IN, not a box. The fight cameras sit BEHIND the player, so a player backed onto a wall puts the camera
    // outside it — and a box's outer face then fills the frame (measured: a solid green frame on the dojo's north wall).
    // A single-sided plane facing the arena is solid from inside and culled from behind, so the camera looks through it.
    // (The tile repeats along the wall by its length; a rope panel is plain.)
    const uRep = Math.max(1, Math.round((len + thick) / WALL_TILE_M));
    const m = MeshBuilder.CreatePlane(`wall_arena_${arena.id}_${i}`, { width: len + thick, height: w.height, sideOrientation: Mesh.FRONTSIDE, frontUVs: new Vector4(0, 0, ropesArena ? 1 : uRep, 1) }, scene);
    m.position.set((w.a.x + w.b.x) / 2, lift + w.height / 2, (w.a.z + w.b.z) / 2);
    m.rotation.y = Math.atan2(w.nx, w.nz) + Math.PI;   // a plane's front faces −z; turn it to face along the inward normal
    m.material = wallMat; m.isPickable = false; m.parent = root; m.receiveShadows = true;
    wallPanels.push(m);
    if (ropesArena) {
      // the top rail and two cables, so the panel reads as ropes rather than glass
      for (const y of [w.height, w.height * 0.66, w.height * 0.33]) {
        const r = MeshBuilder.CreateBox(`arena_${arena.id}_rail_${i}_${y.toFixed(1)}`, { width: len + 0.12, height: 0.06, depth: 0.08 }, scene);
        r.position.set((w.a.x + w.b.x) / 2, lift + y, (w.a.z + w.b.z) / 2); r.rotation.y = Math.atan2(dx, dz) - Math.PI / 2; r.material = railMat; r.isPickable = false; r.parent = root;
      }
    } else {
      // a cap line along the top, in the arena's accent, so the edge reads from the fight camera
      const cap = MeshBuilder.CreateBox(`arena_${arena.id}_cap_${i}`, { width: len + thick, height: 0.05, depth: thick + 0.04 }, scene);
      cap.position.copyFrom(m.position); cap.position.y = lift + w.height + 0.02; cap.rotation.y = Math.atan2(dx, dz) - Math.PI / 2; cap.material = railMat; cap.isPickable = false; cap.parent = root;
      wallCaps.push(cap);
    }
  });
  // PHONE (lane/owner-1016, 2026-10-16): the walls are one material and never move, so a phone draws them as ONE mesh (and the
  // cap line as one): the gauntlet's six wall panels and six caps were 12 of karate's 89 active meshes (budget 77) and 12 draws.
  // The same geometry, UVs and material; the camera's bounds read the union of the walls, which is unchanged. Not the cage (its
  // panels and rails stay), and not desktop or high.
  if (mobile && !ropesArena) {
    mergeWallSet(wallPanels, `wall_arena_${arena.id}`, root);
    mergeWallSet(wallCaps, `arena_${arena.id}_cap`, root);
  }
  if (ropesArena) {
    // a cage corner post: a padded sleeve with an accent band, the turnbuckle pad every ring has, over the old thin post
    const padMat = pbr(scene, `arena_${arena.id}_pad_m`, '#10131c', 0.55, 0.05); owned.push(padMat);
    arena.walls.forEach((w, i) => {
      const post = MeshBuilder.CreateCylinder(`arena_${arena.id}_post_${i}`, { height: w.height + 0.2, diameter: 0.14 }, scene);
      post.position.set(w.a.x, lift + (w.height + 0.2) / 2, w.a.z); post.material = railMat; post.isPickable = false; post.parent = root;
      const pad = MeshBuilder.CreateCylinder(`arena_${arena.id}_postpad_${i}`, { height: w.height * 0.8, diameter: 0.3, tessellation: 14 }, scene);
      pad.position.set(w.a.x, lift + w.height * 0.4 + 0.1, w.a.z); pad.material = padMat; pad.isPickable = false; pad.parent = root;
      const band = MeshBuilder.CreateTorus(`arena_${arena.id}_postband_${i}`, { diameter: 0.34, thickness: 0.035, tessellation: 14 }, scene);
      band.position.set(w.a.x, lift + w.height * 0.8 + 0.1, w.a.z); band.material = railMat; band.isPickable = false; band.parent = root;
    });
  }

  // ── pillars ──
  const pillarMat = pbr(scene, `arena_${arena.id}_pillar_m`, wallAlbedo ? '#ffffff' : arena.look.wallColor, 0.8, 0.1);
  if (wallAlbedo) pillarMat.albedoTexture = wallAlbedo;   // three plates round a pillar, the hazard band at its foot (no vents: the emissive stays on the wall)
  owned.push(pillarMat);
  arena.pillars.forEach((p, i) => {
    const m = MeshBuilder.CreateCylinder(`wall_arena_${arena.id}_pillar_${i}`, { height: p.h, diameter: p.r * 2, tessellation: 12 }, scene);
    m.position.set(p.x, lift + p.h / 2, p.z); m.material = pillarMat; m.isPickable = false; m.parent = root; m.receiveShadows = true;
    const band = MeshBuilder.CreateTorus(`arena_${arena.id}_pillar_band_${i}`, { diameter: p.r * 2 + 0.06, thickness: 0.05, tessellation: 12 }, scene);
    band.position.set(p.x, lift + Math.min(p.h - 0.1, 1.1), p.z); band.material = railMat; band.isPickable = false; band.parent = root;
  });

  // ── the floor overlay: lines, sigil, neon, crest — over what the venue painted ──
  const floorStyle: FloorStyle | null = floorStyleOf(arena);
  if (floorStyle) {
    const W = arena.shape.kind === 'disc' ? arena.shape.radius * 2 : arena.shape.halfX * 2;
    const H = arena.shape.kind === 'disc' ? arena.shape.radius * 2 : arena.shape.halfZ * 2;
    const px = 1024, py = Math.max(256, Math.round((1024 * H) / W));
    const fp = { accent: A, wall: arena.look.wallColor, w: px, h: py, disc: arena.shape.kind === 'disc' };
    const tex = paintedTexture(scene, `arena_${arena.id}_floor_t`, px, py, (c) => paintFloor(c, floorStyle, fp)); owned.push(tex);
    const mat = pbr(scene, `arena_${arena.id}_floor_m`, '#ffffff', 0.9); owned.push(mat);
    mat.albedoTexture = tex; mat.useAlphaFromAlbedoTexture = true; mat.transparencyMode = 2;   // ALPHABLEND
    mat.environmentIntensity = 0.3; mat.zOffset = -2; mat.backFaceCulling = false;
    if (FLOOR_HAS_EMISSIVE.has(floorStyle)) {
      const em = paintedTexture(scene, `arena_${arena.id}_floor_e`, px, py, (c) => paintFloor(c, floorStyle, fp, true)); owned.push(em);
      mat.emissiveTexture = em; mat.emissiveColor = Color3.White(); mat.emissiveIntensity = 1.3;
      // (bloom, not the glow layer: a glowing line under the fighters' feet would bleed over their legs)
    }
    const floor = MeshBuilder.CreateGround(`arena_${arena.id}_floor_overlay`, { width: W, height: H }, scene);
    floor.position.y = lift + 0.014; floor.material = mat; floor.parent = root; floor.isPickable = false; floor.receiveShadows = true;
    floor.rotation.y = Math.PI;   // canvas top toward −z (away from the fight camera): a crest reads upright from behind the player
  }

  // ── lanterns on the wall caps, and the pools of light they throw inside ──
  const lanterns = lanternSpots(arena, mobile);
  if (lanterns.length) {
    const lm = pbr(scene, `lantern_arena_${arena.id}_paper`, '#fff1d6', 0.6);
    lm.albedoColor = Color3.FromHexString('#e8a064'); lm.emissiveColor = Color3.FromHexString(LANTERN_HEX); lm.emissiveIntensity = 0.95; owned.push(lm);
    const capY = lift + arena.walls.reduce((m, w) => Math.max(m, w.height), 0);
    const src = MeshBuilder.CreateSphere(`lantern_arena_${arena.id}`, { diameterX: 0.28, diameterY: 0.4, diameterZ: 0.28, segments: 8 }, scene);
    src.material = lm; src.parent = root; src.isPickable = false; uncast(scene, src);
    const mats = new Float32Array(lanterns.length * 16);
    lanterns.forEach((l, i) => Matrix.Translation(l.x, capY + LANTERN_RISE, l.z).copyToArray(mats, i * 16));
    src.thinInstanceSetBuffer('matrix', mats, 16, true);
    src.thinInstanceRefreshBoundingInfo(true);
    // the little post under each lantern, so it does not float
    const post = MeshBuilder.CreateCylinder(`arena_${arena.id}_lantern_post`, { height: LANTERN_RISE, diameter: 0.05, tessellation: 6 }, scene);
    post.material = railMat; post.parent = root; post.isPickable = false; uncast(scene, post);
    const pm = new Float32Array(lanterns.length * 16);
    lanterns.forEach((l, i) => Matrix.Translation(l.x, capY + LANTERN_RISE / 2, l.z).copyToArray(pm, i * 16));
    post.thinInstanceSetBuffer('matrix', pm, 16, true); post.thinInstanceRefreshBoundingInfo(true);
  }
  const pools = poolSpots(arena, mobile);
  if (pools.length) {
    // one thin-instanced additive mesh per COLOUR of light (a lantern's amber, a pit's orange, a shock pad's blue): a few draws
    // for every pool on the floor. A group flickers together by its material's emissive (an instance colour does not reach an
    // emissive-only material, so the brightness rides the material).
    const ptex = paintedTexture(scene, `arena_${arena.id}_pool_t`, 128, 128, (c) => paintLightPool(c, 128)); owned.push(ptex);
    const groups = new Map<string, PoolSpot[]>();
    for (const p of pools) { const g = groups.get(p.hex) ?? []; g.push(p); groups.set(p.hex, g); }
    let gi = 0;
    for (const [hex, list] of groups) {
      const pmat = new StandardMaterial(`arena_${arena.id}_pool_m_${gi}`, scene);
      pmat.disableLighting = true; pmat.diffuseColor = Color3.Black(); pmat.specularColor = Color3.Black();
      pmat.opacityTexture = ptex; pmat.backFaceCulling = false; pmat.alphaMode = 1; pmat.disableDepthWrite = true; pmat.zOffset = -3; owned.push(pmat);
      const plane = MeshBuilder.CreateGround(`arena_${arena.id}_light_pools_${gi}`, { width: 1, height: 1 }, scene);
      plane.material = pmat; plane.parent = root; plane.position.y = lift + 0.02; plane.isPickable = false; uncast(scene, plane);
      const buf = new Float32Array(list.length * 16);
      list.forEach((p, i) => Matrix.Compose(new Vector3(p.r * 2, 1, p.r * 2), Quaternion.Identity(), new Vector3(p.x, 0, p.z)).copyToArray(buf, i * 16));
      plane.thinInstanceSetBuffer('matrix', buf, 16, true); plane.thinInstanceRefreshBoundingInfo(true);
      const c = Color3.FromHexString(hex), a = list[0].a * 2.4, fl = list[0].flicker, quick = fl > 0.1, phase = gi * 1.9;
      pmat.emissiveColor = new Color3(c.r * a, c.g * a, c.b * a);
      flicker.push((t) => {
        const k = 1 + Math.sin(t * (quick ? 11 : 2.3) + phase) * fl + (quick ? Math.sin(t * 23 + phase) * fl * 0.5 : 0);
        pmat.emissiveColor.set(c.r * a * k, c.g * a * k, c.b * a * k);
      });
      gi++;
    }
  }

  // ── hazards: a glowing grate, real flames and embers (fire) or arcing bolts (shock) ──
  const systems: ParticleSystem[] = [];
  const heatOff: Array<() => void> = [];
  if (arena.hazards.length) {
    const flameTex = paintedTexture(scene, `arena_${arena.id}_flame_t`, 64, 128, (c) => paintFlame(c, 64, 128)); owned.push(flameTex);
    const emberTex = paintedTexture(scene, `arena_${arena.id}_ember_t`, 32, 32, (c) => paintDot(c, 32)); owned.push(emberTex);
    arena.hazards.forEach((h, i) => {
      const hot = h.kind === 'fire';
      const disc = MeshBuilder.CreateDisc(`arena_${arena.id}_hazard_${i}`, { radius: h.r, tessellation: 24 }, scene);
      disc.rotation.x = Math.PI / 2; disc.position.set(h.x, lift + 0.015, h.z);
      disc.material = glow(scene, `arena_${arena.id}_hazard_m_${i}`, hot ? '#ff5a1f' : '#7dd3fc', 0.6);
      disc.isPickable = false; disc.parent = root; uncast(scene, disc);
      const ring = MeshBuilder.CreateTorus(`arena_${arena.id}_hazard_ring_${i}`, { diameter: h.r * 2 + 0.1, thickness: 0.06, tessellation: 24 }, scene);
      ring.position.set(h.x, lift + 0.03, h.z); ring.material = railMat; ring.isPickable = false; ring.parent = root;
      if (hot) {
        const at = new Vector3(h.x, lift + 0.12, h.z);
        // flames: upright additive tongues rising off the pit, yellow-white at the root running to red at the tip
        const f = new ParticleSystem(`arena_${arena.id}_flames_${i}`, mobile ? 28 : 64, scene);
        f.particleTexture = flameTex; f.blendMode = ParticleSystem.BLENDMODE_ADD; f.billboardMode = ParticleSystem.BILLBOARDMODE_Y;
        f.emitter = at; f.minEmitBox = new Vector3(-h.r * 0.62, 0, -h.r * 0.62); f.maxEmitBox = new Vector3(h.r * 0.62, 0.05, h.r * 0.62);
        f.direction1 = new Vector3(-0.12, 1, -0.12); f.direction2 = new Vector3(0.12, 1, 0.12);
        f.minEmitPower = 0.5; f.maxEmitPower = 1.1; f.minLifeTime = 0.5; f.maxLifeTime = 0.95;
        // (Babylon's size gradient is absolute — see combatFx.ts — so the gradient below is the curve and the scale is the metres)
        f.minScaleX = 0.6; f.maxScaleX = 0.85; f.minScaleY = 1.3; f.maxScaleY = 1.75;
        f.emitRate = mobile ? 16 : 34;
        f.addColorGradient(0, new Color4(1, 0.93, 0.62, 0.0)); f.addColorGradient(0.12, new Color4(1, 0.82, 0.38, 0.85)); f.addColorGradient(0.5, new Color4(1, 0.45, 0.1, 0.65)); f.addColorGradient(1, new Color4(0.55, 0.1, 0.03, 0));
        f.addSizeGradient(0, 0.55); f.addSizeGradient(0.35, 0.85); f.addSizeGradient(1, 0.3);
        f.minAngularSpeed = -0.6; f.maxAngularSpeed = 0.6;
        f.start(); systems.push(f);
        // w3-atmos: the hot air over the pit - a column twice the pit's width, 3 m tall (the shimmer is the HeatHaze post)
        heatOff.push(addHeatSource(scene, { x: h.x, y: lift + 0.2, z: h.z, halfWidth: h.r * 1.5, height: 3.4, strength: 1 }));
        // embers: tiny hot motes that climb, drift and die
        const e = new ParticleSystem(`arena_${arena.id}_embers_${i}`, mobile ? 14 : 30, scene);
        e.particleTexture = emberTex; e.blendMode = ParticleSystem.BLENDMODE_ADD;
        e.emitter = at; e.minEmitBox = new Vector3(-h.r * 0.5, 0.1, -h.r * 0.5); e.maxEmitBox = new Vector3(h.r * 0.5, 0.2, h.r * 0.5);
        e.direction1 = new Vector3(-0.5, 1, -0.5); e.direction2 = new Vector3(0.5, 1.6, 0.5);
        e.minEmitPower = 0.8; e.maxEmitPower = 2.2; e.minLifeTime = 0.9; e.maxLifeTime = 1.9; e.gravity = new Vector3(0.25, 0.2, 0);
        e.emitRate = mobile ? 3 : 7;
        e.color1 = new Color4(1, 0.7, 0.25, 1); e.color2 = new Color4(1, 0.45, 0.12, 1); e.colorDead = new Color4(0.6, 0.1, 0.02, 0);
        e.addSizeGradient(0, 0.075); e.addSizeGradient(1, 0.015);   // absolute metres: a hot mote, shrinking to a speck
        e.start(); systems.push(e);
      } else {
        // shock: a few jagged bolts re-rolled ten times a second, white-blue, jumping from the middle to the rim
        const N = 3, SEG = 7;
        const bolts: LinesMesh[] = [];
        for (let b = 0; b < N; b++) {
          const pts = Array.from({ length: SEG }, (_, s) => new Vector3(h.x + (s / (SEG - 1)) * h.r, lift + 0.1, h.z));
          const line = MeshBuilder.CreateLines(`arena_${arena.id}_bolt_${i}_${b}`, { points: pts, updatable: true }, scene);
          line.color = new Color3(0.75, 0.92, 1); line.parent = root; line.isPickable = false; uncast(scene, line);
          bolts.push(line);
        }
        let acc = -1;
        flicker.push((t) => {
          if (t - acc < 0.09) return; acc = t;
          bolts.forEach((line, b) => {
            const a0 = Math.random() * Math.PI * 2 + b * 2.1, pts: Vector3[] = [];
            for (let s = 0; s < SEG; s++) {
              const u = s / (SEG - 1), r = u * h.r * 0.95;
              pts.push(new Vector3(h.x + Math.cos(a0) * r + (Math.random() - 0.5) * 0.35, lift + 0.08 + Math.sin(u * Math.PI) * 0.55 + (Math.random() - 0.5) * 0.12, h.z + Math.sin(a0) * r + (Math.random() - 0.5) * 0.35));
            }
            MeshBuilder.CreateLines(line.name, { points: pts, instance: line });
          });
        });
      }
    });
  }

  // ── a raised octagon: an overhead rig of cans and beams, so the ring is the lit thing in a dark house ──
  if (wantsOverheadRig(arena) && arena.shape.kind === 'disc') {
    const R = arena.shape.radius + 1.6, Y = lift + RIG_HEIGHT, toFloor = arena.shape.radius * 0.55;
    const canMat = glow(scene, 'flood_arena_rig_can_m', '#fff2d8'); owned.push(canMat);
    const can = MeshBuilder.CreateCylinder(`flood_arena_${arena.id}_cans`, { height: 0.36, diameterTop: 0.42, diameterBottom: 0.28, tessellation: 10 }, scene);
    can.material = canMat; can.parent = root; can.isPickable = false; uncast(scene, can);
    const beamTex = paintedTexture(scene, `arena_${arena.id}_beam_t`, 8, 128, (c) => { const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0.05)'); c.fillStyle = g; c.fillRect(0, 0, 8, 128); }); owned.push(beamTex);
    const beamMat = new StandardMaterial(`arena_${arena.id}_beam_m`, scene);
    beamMat.disableLighting = true; beamMat.emissiveColor = new Color3(1, 0.9, 0.7); beamMat.diffuseColor = Color3.Black(); beamMat.specularColor = Color3.Black();
    beamMat.opacityTexture = beamTex; beamMat.alpha = 0.16; beamMat.alphaMode = 1; beamMat.backFaceCulling = false; beamMat.disableDepthWrite = true; owned.push(beamMat);
    const beamLen = Math.hypot(R - toFloor, Y - lift);
    // the beam is a cone, narrow at its top (the can) and wide at its foot; its texture's top is the bright end
    const beam = MeshBuilder.CreateCylinder(`arena_${arena.id}_beams`, { height: beamLen, diameterTop: 0.5, diameterBottom: 3.2, tessellation: 14, cap: Mesh.NO_CAP }, scene);
    beam.material = beamMat; beam.parent = root; beam.isPickable = false; uncast(scene, beam);
    const cm = new Float32Array(RIG_CANS * 16), bm = new Float32Array(RIG_CANS * 16);
    for (let k = 0; k < RIG_CANS; k++) {
      const a = (k / RIG_CANS) * Math.PI * 2 + Math.PI / 8;
      const cx = Math.sin(a) * R, cz = Math.cos(a) * R, tx = Math.sin(a) * toFloor, tz = Math.cos(a) * toFloor;
      Matrix.Translation(cx, Y, cz).copyToArray(cm, k * 16);
      const up = new Vector3(cx - tx, Y - lift, cz - tz).normalize();   // from the spot on the floor up to the can
      Matrix.Compose(Vector3.One(), upTo(up), new Vector3((cx + tx) / 2, (Y + lift) / 2, (cz + tz) / 2)).copyToArray(bm, k * 16);
    }
    can.thinInstanceSetBuffer('matrix', cm, 16, true); can.thinInstanceRefreshBoundingInfo(true);
    beam.thinInstanceSetBuffer('matrix', bm, 16, true); beam.thinInstanceRefreshBoundingInfo(true);
  }

  // ── a drop arena stands on a platform over a pit (the fall has to have somewhere to go) ──
  if (arena.edge === 'drop' && (opts.platform ?? true)) {
    const platMat = pbr(scene, `arena_${arena.id}_plat_m`, arena.look.wallColor, 0.9); owned.push(platMat);
    const plat = arena.shape.kind === 'disc'
      ? MeshBuilder.CreateCylinder(`arena_${arena.id}_platform`, { diameter: arena.shape.radius * 2 + 0.6, height: 1.4, tessellation: 8 }, scene)
      : MeshBuilder.CreateBox(`arena_${arena.id}_platform`, { width: arena.shape.halfX * 2 + 0.6, depth: arena.shape.halfZ * 2 + 0.6, height: 1.4 }, scene);
    plat.position.y = lift - 0.7; plat.material = platMat; plat.parent = root; plat.receiveShadows = true;
    const rim = arena.shape.kind === 'disc'
      ? MeshBuilder.CreateTorus(`arena_${arena.id}_rim`, { diameter: arena.shape.radius * 2, thickness: 0.09, tessellation: 8 }, scene)
      : MeshBuilder.CreateBox(`arena_${arena.id}_rim`, { width: arena.shape.halfX * 2, depth: arena.shape.halfZ * 2, height: 0.04 }, scene);
    rim.position.y = lift + 0.02; rim.material = railMat; rim.isPickable = false; rim.parent = root;
    if (arena.shape.kind === 'box') { rim.material = glow(scene, `arena_${arena.id}_rim_m`, arena.look.accent, 0.35); }
    const pit = MeshBuilder.CreateGround(`arena_${arena.id}_pit`, { width: 60, height: 60 }, scene);
    pit.position.y = -6; pit.material = pbr(scene, `arena_${arena.id}_pit_m`, '#101418', 1); pit.parent = root;
  }

  let t = 0;
  return {
    root,
    tick(dt) {
      t += dt;
      for (const f of flicker) f(t);
      for (const r of ropes) r.alpha = 0.24 + Math.sin(t * 2.2) * 0.05;
    },
    dispose() {
      for (const p of systems) { try { p.dispose(); } catch { /* gone */ } }
      for (const off of heatOff) off();
      for (const m of root.getChildMeshes()) { m.material?.dispose(); m.dispose(); }
      for (const o of owned) { try { o.dispose(); } catch { /* the scene took it */ } }
      root.dispose();
    },
  };
}

/**
 * The Showdown's destructible gate, as a lit timber-and-iron door in the arena's accent (it was one flat brown). The material owns
 * its texture: `mesh.dispose(false, true)` (the mode's shatter and dispose) takes both.
 */
export function gateMaterial(scene: Scene, arena: CombatArena): PBRMaterial {
  const m = pbr(scene, `arena_${arena.id}_gate_m`, '#ffffff', 0.78);
  const tex = paintedTexture(scene, `arena_${arena.id}_gate_t`, 384, 512, (c) => paintGate(c, 384, 512, arena.look.accent));
  tex.hasAlpha = false; m.albedoTexture = tex;
  return m;
}

/** Spawn positions for a two-fighter round: facing each other across the arena's short axis, inside it. */
export function duelSpawns(arena: CombatArena, apart = 4.4): [Vector3, Vector3] {
  return [new Vector3(0, 0, apart / 2), new Vector3(0, 0, -apart / 2)];
}
