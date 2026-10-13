// MOVING HEADS — the stage rig's sweeping beams (vis-party, 2026-10-13; docs/VISUAL-PASS-PLAN.md Part B, dance + brainbrawl).
//
// A TV stage is lit by fixtures that MOVE: cans on a truss that sweep the floor on the bar and snap to the performer on the
// downbeat. This is the cone-mesh half of that — an additive beam from each fixture, a pool of light where it lands, and a
// small emissive can the foundation's GlowLayer picks up by name. The CLUSTERED SPOT LIGHTS that would make the beams light
// the bodies (VISUAL-PASS-PLAN A9.5, second half) belong to vis-foundation-2; this file is the look that works without them,
// and a light can be added to `HeadHandle.fixtures` later without touching the aim.
//
// THE AIM IS PURE. `headTarget` takes the beat/bar position (BeatBus.phase) and returns where on the floor head `i` of `n`
// points — no clock of its own, so a paused song holds the rig exactly where it was and a count-back-in resyncs it for free,
// the same rule beatBus.ts holds. `headLevel` is the brightness: a beat bob, steadied when the player asked for no flashing
// (motionPolicy().flash), because a beam that strobes on every beat is the "lamp/LED strobing" that setting stops.
//
// Cost: one cone and one pool per head (two draws), one fixture can (a sphere), one shared fade texture. The phones get
// fewer heads (HEADS_BY_TIER) and no pools.

import {
  Color3, Constants, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, Quaternion, TransformNode, Vector3,
  type Scene,
} from '@babylonjs/core';

/** Beat/bar position — structurally BeatBus's BeatPhase, so a caller hands `beatBus.phase(t)` straight in. */
export interface HeadPhase { beatIndex: number; beatPhase: number; barIndex: number; barPhase: number }

export interface HeadSpec {
  /** The can's position on the truss (world). */
  at: [number, number, number];
  /** The beam's colour. */
  color: string;
}

/** The floor point a rig sweeps across: a centre and half-extents. */
export interface HeadFloor { cx: number; cz: number; halfX: number; halfZ: number }

export type HeadMove = 'sweep' | 'cross' | 'fan';

/** TUNED (new): how many bars each move holds before the rig changes its phrase, and the order it runs them. */
export const MOVE_BARS = 2;
const MOVES: readonly HeadMove[] = ['sweep', 'fan', 'cross', 'sweep'];

/** Which move the rig is in at bar `barIndex`. A pure function of the bar, so every head agrees. */
export function moveAt(barIndex: number): HeadMove {
  const k = Math.floor(Math.max(0, barIndex) / MOVE_BARS);
  return MOVES[k % MOVES.length];
}

/**
 * Where head `i` of `n` points on the floor at this instant.
 *   sweep  each head slides across the floor once a bar, offset from its neighbour, so the beams cross and part
 *   fan    the heads spread to a fan and breathe it open and shut on the beat
 *   cross  every head converges on the performer's mark (`floor` centre) — the "all eyes here" phrase; `energy` (0..1, the
 *          combo) ends every second bar on it
 * `calm` (reduced flashing / reduced motion) slows nothing — the aim is smooth already — but takes the beat snap out of
 * the fan and the cross so the rig drifts instead of jumping.
 */
export function headTarget(i: number, n: number, p: HeadPhase, floor: HeadFloor, energy = 0, calm = false): { x: number; z: number } {
  const u = n > 1 ? i / (n - 1) : 0.5;               // this head's place in the line, 0..1
  const side = u * 2 - 1;                             // −1 .. 1
  let move = moveAt(p.barIndex);
  if (energy > 0.6 && p.barIndex % 2 === 1) move = 'cross';
  const snap = calm ? 0 : Math.exp(-p.beatPhase * 5);
  switch (move) {
    case 'cross': {
      // converge on the mark, a hand's width apart so the beams read as several and not one
      const k = calm ? 0.35 : 0.2 + 0.3 * (1 - snap);
      return { x: floor.cx + side * floor.halfX * k, z: floor.cz };
    }
    case 'fan': {
      const spread = 0.35 + 0.45 * (calm ? 0.5 : snap);
      return { x: floor.cx + side * floor.halfX * spread * 1.6, z: floor.cz + floor.halfZ * (0.2 + 0.5 * Math.abs(side)) };
    }
    default: {
      const a = (p.barPhase + i / Math.max(1, n)) * Math.PI * 2;
      return { x: floor.cx + Math.sin(a) * floor.halfX, z: floor.cz + Math.cos(a * 0.5 + i) * floor.halfZ * 0.6 };
    }
  }
}

/** Beam brightness 0..1: a floor level and a beat bob on top. Steady (no bob) when `calm` — the "stops strobing" rule. */
export function headLevel(p: HeadPhase, cheer = 0, calm = false): number {
  const bob = calm ? 0 : Math.exp(-p.beatPhase * 4) * 0.35;
  return Math.min(1, 0.45 + bob + Math.min(1, cheer) * 0.3);
}

/** The heads a tier carries: the phones' fill and overdraw budget is the tight one (VISUAL-PASS-PLAN A8). */
export const HEADS_BY_TIER = { mobile: 2, desktop: 4, high: 6 } as const;
export function headCountFor(tier: string): number {
  return tier === 'high' || tier === 'tv' ? HEADS_BY_TIER.high : tier === 'mobile' ? HEADS_BY_TIER.mobile : HEADS_BY_TIER.desktop;
}

export interface HeadsOptions {
  /** Where the cans hang; the first `count` are used. */
  specs: readonly HeadSpec[];
  floor: HeadFloor;
  /** How many to build (headCountFor). */
  count: number;
  /** The beam's radius at the floor, metres. */
  floorRadius?: number;
  /** The surface height under a floor point (a podium the beam lands on); default the floor, 3 cm. */
  floorY?: (x: number, z: number) => number;
  /** A pool of light where each beam lands (desktop+); the phones skip it. */
  pools?: boolean;
  /** Two stacked cones per beam for a soft edge (desktop+); the phones draw one. Default true. */
  soft?: boolean;
  /** Scales every beam's and pool's alpha (a busy set wants fewer, fainter beams). Default 1. */
  intensity?: number;
  /** Mesh-name prefix, e.g. 'dance_head'. A fixture's name contains `neon`, so the GlowLayer's include list takes the can. */
  name: string;
}

export interface HeadHandle {
  root: TransformNode;
  /** The cans — a clustered light can ride these later. */
  readonly fixtures: readonly Mesh[];
  /** Re-aim and re-level every beam. `energy` is 0..1 (the combo), `cheer` the BeatBus cheer pulse. */
  update(p: HeadPhase, energy: number, cheer: number, calm: boolean): void;
  setEnabled(on: boolean): void;
  dispose(): void;
}

function fadeTexture(scene: Scene): DynamicTexture {
  const existing = scene.getTextureByName('head_fade');
  if (existing) return existing as DynamicTexture;
  const t = new DynamicTexture('head_fade', { width: 16, height: 128 }, scene, false);
  const g = t.getContext() as unknown as CanvasRenderingContext2D;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0.12)');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 128);
  t.hasAlpha = true; t.update(false);
  return t;
}

function poolTexture(scene: Scene): DynamicTexture {
  const existing = scene.getTextureByName('head_pool');
  if (existing) return existing as DynamicTexture;
  const t = new DynamicTexture('head_pool', { width: 64, height: 64 }, scene, false);
  const g = t.getContext() as unknown as CanvasRenderingContext2D;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  t.hasAlpha = true; t.update(false);
  return t;
}

/** An unlit additive PBR material (the repo's StandardMaterial ratchet: PBR, never StandardMaterial). */
function additive(scene: Scene, name: string, hex: string, tex: DynamicTexture): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.unlit = true;
  m.albedoColor = Color3.FromHexString(hex);
  m.opacityTexture = tex;
  m.alphaMode = Constants.ALPHA_ADD;
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  m.alpha = 0.1;
  return m;
}

const DOWN = new Vector3(0, -1, 0);
/** TUNED (new): the beam's two layers — a wide faint cone and a narrow core — as a share of the floor radius and of the alpha. */
const BEAM_LAYERS = [{ radius: 1, alpha: 0.055 }, { radius: 0.5, alpha: 0.1 }] as const;
const _dir = new Vector3();
const _mid = new Vector3();

export function mountMovingHeads(scene: Scene, o: HeadsOptions): HeadHandle {
  const root = new TransformNode(`${o.name}_root`, scene);
  const fade = fadeTexture(scene);
  const pool = o.pools ? poolTexture(scene) : null;
  const n = Math.max(0, Math.min(o.count, o.specs.length));
  const radius = o.floorRadius ?? 1.1;
  const gain = Math.max(0, o.intensity ?? 1);
  const layers = o.soft === false ? BEAM_LAYERS.slice(0, 1) : BEAM_LAYERS;
  const cones: Mesh[][] = [], pools: Mesh[] = [], cans: Mesh[] = [];
  const beamMats: PBRMaterial[][] = [], poolMats: PBRMaterial[] = [], canMats: PBRMaterial[] = [];
  const srcs: Vector3[] = [];
  const canBase: Color3[] = [];
  for (let i = 0; i < n; i++) {
    const spec = o.specs[i];
    const src = new Vector3(spec.at[0], spec.at[1], spec.at[2]);
    srcs.push(src);
    // the beam: unit-height cones, apex at the can (top), wide at the floor (bottom); length and aim are set per frame. A wide
    // faint cone and a narrow stronger core stack into a soft edge (one hard-edged cone reads as a flat triangle)
    const mine: Mesh[] = [], myMats: PBRMaterial[] = [];
    layers.forEach((L, k) => {
      const cone = MeshBuilder.CreateCylinder(`${o.name}_beam_${i}_${k}`, { height: 1, diameterTop: 0.1 * L.radius, diameterBottom: radius * 2 * L.radius, tessellation: 20, cap: Mesh.NO_CAP }, scene);
      cone.parent = root; cone.isPickable = false; cone.rotationQuaternion = new Quaternion();
      const bm = additive(scene, `${o.name}_beam_mat_${i}_${k}`, spec.color, fade);
      cone.material = bm; mine.push(cone); myMats.push(bm);
    });
    cones.push(mine); beamMats.push(myMats);
    if (pool) {
      const disc = MeshBuilder.CreateDisc(`${o.name}_pool_${i}`, { radius: radius * 1.15, tessellation: 24 }, scene);
      disc.parent = root; disc.rotation.x = Math.PI / 2; disc.isPickable = false;
      const pm = additive(scene, `${o.name}_pool_mat_${i}`, spec.color, pool);
      disc.material = pm; poolMats.push(pm); pools.push(disc);
    }
    // the can: a small emissive sphere. The name carries `neon` so EmissiveGlow's include list (scene/EmissiveGlow.ts) halos it.
    const can = MeshBuilder.CreateSphere(`${o.name}_neon_can_${i}`, { diameter: 0.34, segments: 10 }, scene);
    can.parent = root; can.position.copyFrom(src); can.isPickable = false;
    const cm = new PBRMaterial(`${o.name}_can_mat_${i}`, scene);
    const hue = Color3.FromHexString(spec.color); canBase.push(hue);
    cm.albedoColor = Color3.Black(); cm.emissiveColor = hue.scale(1.2); cm.roughness = 0.5; cm.metallic = 0;
    can.material = cm; canMats.push(cm); cans.push(can);
  }
  return {
    root,
    fixtures: cans,
    update(p, energy, cheer, calm) {
      const level = headLevel(p, cheer, calm);
      for (let i = 0; i < n; i++) {
        const t = headTarget(i, n, p, o.floor, energy, calm);
        const src = srcs[i];
        const fy = o.floorY ? o.floorY(t.x, t.z) : 0.03;
        _dir.set(t.x - src.x, fy - src.y, t.z - src.z);
        const len = _dir.length();
        _dir.scaleInPlace(1 / Math.max(1e-4, len));
        _mid.set((src.x + t.x) / 2, (src.y + fy) / 2, (src.z + t.z) / 2);
        for (let k = 0; k < cones[i].length; k++) {
          const cone = cones[i][k];
          // the cone's axis runs top (apex, at the can) to bottom (floor): −y rotated onto the aim
          Quaternion.FromUnitVectorsToRef(DOWN, _dir, cone.rotationQuaternion!);
          cone.position.copyFrom(_mid);
          cone.scaling.y = len;
          beamMats[i][k].alpha = layers[k].alpha * level * gain;
        }
        if (pool) {
          pools[i].position.set(t.x, fy + 0.01, t.z);
          poolMats[i].alpha = 0.32 * level * gain;
        }
        canBase[i].scaleToRef(1.2 * (0.5 + level), canMats[i].emissiveColor);
      }
    },
    setEnabled(on) { root.setEnabled(on); },
    dispose() {
      for (const m of [...cones.flat(), ...pools, ...cans]) m.dispose(false, false);
      for (const m of [...beamMats.flat(), ...poolMats, ...canMats]) m.dispose();
      root.dispose();
    },
  };
}
