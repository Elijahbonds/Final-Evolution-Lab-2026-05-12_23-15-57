// BEACH DRESSING (vis-court, wave 2, 2026-10-13) — the beach around the Beach Pro court.
//
// The audit (volleyball): "Instanced beach crowd on towels and bleachers", "beach flags waving", an ocean behind the court. The
// court stood on a sand plate with a sea painted flat past the far baseline, a crowd of eight bodies and a few palms: nobody
// had been to this beach. This lays the beach out: striped umbrellas and towels outside the crowd (each kind ONE thin-instanced
// mesh with a colour per instance, so a dozen of them are two draws), and four feather flags on the far side whose cloth
// ripples (a 3 × 10 grid, a travelling wave that grows toward the free edge, pinned at the pole).
//
// Everything stands outside the free zone and the crowd, so nothing here is a place a ball can land and nothing blocks the
// play camera. Visual only: it adds scenery and never reads or moves a rally.

import { Color3, Color4, Matrix, MeshBuilder, Quaternion, StandardMaterial, Vector3, VertexBuffer } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';

export interface BeachSpot { x: number; z: number; yaw: number; color: string; scale: number }
export interface BeachLayout { umbrellas: BeachSpot[]; towels: BeachSpot[]; flags: BeachSpot[] }

const UMBRELLA_COLORS = ['#ff5a5f', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#ff9f1c'];
const TOWEL_COLORS = ['#f94144', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#f3722c', '#9b5de5'];
const FLAG_COLORS = ['#ff4d6d', '#00b4d8', '#ffd60a', '#80ed99'];

/** The deterministic scatter (no Math.random: a capture and its before/after stay comparable). */
function hash(n: number): number { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

/**
 * Pure: where the beach life stands for a court of this size. `phone` thins it. Everything is outside `halfWidth + 7` (past the
 * crowd bank at `halfWidth + 5`) or beyond the far baseline, never inside the free zone.
 */
export function beachLayout(halfWidth: number, halfLength: number, phone = false): BeachLayout {
  const umbrellas: BeachSpot[] = [], towels: BeachSpot[] = [], flags: BeachSpot[] = [];
  const n = phone ? 2 : 4;
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const z = -halfLength * 1.1 + t * halfLength * 2.3 + (hash(i + side * 7) - 0.5) * 2;
      const x = side * (halfWidth + 8.5 + (i % 2) * 2.2 + hash(i * 3 + side) * 1.2);
      const color = UMBRELLA_COLORS[(i * 2 + (side > 0 ? 1 : 0)) % UMBRELLA_COLORS.length];
      umbrellas.push({ x, z, yaw: hash(i + 5) * Math.PI, color, scale: 0.9 + hash(i + side * 11) * 0.35 });
      // a towel on the sand beside each umbrella, and one more scattered nearer the crowd
      towels.push({ x: x - side * 1.7, z: z + 0.6, yaw: hash(i + 9) * 0.8 - 0.4, color: TOWEL_COLORS[(i + (side > 0 ? 3 : 0)) % TOWEL_COLORS.length], scale: 1 });
      if (!phone) towels.push({ x: side * (halfWidth + 6.6 + hash(i * 5 + 2) * 0.8), z: z - 2.4, yaw: hash(i + 13) * 3 - 1.5, color: TOWEL_COLORS[(i * 3 + 1) % TOWEL_COLORS.length], scale: 0.9 });
    }
  }
  // four feather flags on the far side, outside the sideline (never between the camera and the net's middle)
  const fx = halfWidth + 2.3;
  flags.push({ x: -fx, z: -halfLength - 1.2, yaw: 0, color: FLAG_COLORS[0], scale: 1 }, { x: fx, z: -halfLength - 1.2, yaw: 0, color: FLAG_COLORS[1], scale: 1 });
  if (!phone) flags.push({ x: -fx, z: -halfLength * 0.5, yaw: 0, color: FLAG_COLORS[2], scale: 1 }, { x: fx, z: -halfLength * 0.5, yaw: 0, color: FLAG_COLORS[3], scale: 1 });
  return { umbrellas, towels, flags };
}

/** Pure: a flag's cloth offset (along the wind) at span fraction `u` (0 pole .. 1 free edge) and height fraction `v`, at time `t`. */
export function flagWave(t: number, u: number, v: number, amp = 0.16): number {
  const grow = u * u;                                   // pinned at the pole, free at the edge
  return amp * grow * (Math.sin(t * 5.2 - u * 7.5 - v * 2.2) + 0.45 * Math.sin(t * 9.1 - u * 11 + v * 3));
}

export interface BeachDressingHandle { update(dt: number): void; readonly meshes: readonly Mesh[]; dispose(): void }

export function buildBeachDressing(scene: Scene, halfWidth: number, halfLength: number, opts: { phone?: boolean; night?: boolean } = {}): BeachDressingHandle {
  const L = beachLayout(halfWidth, halfLength, opts.phone);
  const made: Mesh[] = [];
  const mats: StandardMaterial[] = [];
  const mat = (name: string, c = '#ffffff', emissive = 0.0): StandardMaterial => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(c); m.specularColor = Color3.Black(); m.emissiveColor = m.diffuseColor.scale(emissive);
    mats.push(m); return m;
  };
  const instance = (mesh: Mesh, spots: readonly BeachSpot[], y: number, tilt = 0): void => {
    const mats16 = new Float32Array(spots.length * 16), cols = new Float32Array(spots.length * 4);
    spots.forEach((s, i) => {
      Matrix.Compose(new Vector3(s.scale, s.scale, s.scale), Quaternion.RotationYawPitchRoll(s.yaw, tilt, 0), new Vector3(s.x, y * s.scale, s.z)).copyToArray(mats16, i * 16);
      const c = Color4.FromHexString(s.color + 'ff'); cols.set([c.r, c.g, c.b, 1], i * 4);
    });
    mesh.thinInstanceSetBuffer('matrix', mats16, 16, true);
    mesh.thinInstanceSetBuffer('color', cols, 4, true);
    mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true; mesh.receiveShadows = true;
    made.push(mesh);
  };
  // umbrellas: a canopy (a cone of eight stripes' worth of colour per instance) and its pole
  const canopy = MeshBuilder.CreateCylinder('court_beach_canopy', { height: 0.62, diameterTop: 0.06, diameterBottom: 2.5, tessellation: 10 }, scene);
  canopy.material = mat('court_beach_canopy_m', '#ffffff', 0.18);
  instance(canopy, L.umbrellas, 2.2, 0.1);
  const pole = MeshBuilder.CreateCylinder('court_beach_pole', { height: 2.3, diameter: 0.05, tessellation: 6 }, scene);
  pole.material = mat('court_beach_pole_m', '#e9e4da', 0.1);
  instance(pole, L.umbrellas, 1.15, 0.1);
  // towels: flat and striped by colour (one mesh, a colour each)
  const towel = MeshBuilder.CreateBox('court_beach_towel', { width: 0.9, height: 0.025, depth: 1.8 }, scene);
  towel.material = mat('court_beach_towel_m', '#ffffff', 0.12);
  instance(towel, L.towels, 0.012);
  // flags: a pole each, and a rippling cloth of 3 × 10 cells
  const poleM = mat('court_beach_flagpole_m', '#d8d4cc', 0.1);
  const flags = L.flags.map((f, i) => {
    const p = MeshBuilder.CreateCylinder(`court_beach_flagpole_${i}`, { height: 3.8, diameterTop: 0.04, diameterBottom: 0.07, tessellation: 6 }, scene);
    p.position.set(f.x, 1.9, f.z); p.material = poleM; p.isPickable = false; made.push(p);
    const cloth = MeshBuilder.CreateGround(`court_beach_flag_${i}`, { width: 0.95, height: 2.4, subdivisionsX: 3, subdivisionsY: 10, updatable: true }, scene);
    cloth.rotation.x = Math.PI / 2; cloth.rotation.y = Math.PI / 2;   // stand it up, its length along the wind
    cloth.position.set(f.x, 2.45, f.z);
    const fm = mat(`court_beach_flag_${i}_m`, f.color, 0.28); fm.backFaceCulling = false;
    cloth.material = fm; cloth.isPickable = false; cloth.alwaysSelectAsActiveMesh = true; made.push(cloth);
    return { cloth, base: (cloth.getVerticesData(VertexBuffer.PositionKind) ?? []).slice() as number[] };
  });
  let t = 0;
  return {
    update(dt) {
      t += Math.min(0.1, dt);
      for (const f of flags) {
        const pos = f.base.slice();
        for (let k = 0; k < pos.length; k += 3) {
          const u = (pos[k] + 0.475) / 0.95, v = (pos[k + 2] + 1.2) / 2.4;   // the ground's local x (across) and z (height)
          pos[k + 1] += flagWave(t, 1 - u, v);                               // pinned on the +x edge after the turn: the pole side
        }
        f.cloth.updateVerticesData(VertexBuffer.PositionKind, pos);
      }
    },
    get meshes() { return made; },
    dispose() { for (const m of made) m.dispose(); for (const m of mats) m.dispose(); },
  };
}
