// THE CITY BEHIND THE PLAZA (vis-board, visual wave 2, 2026-10-13) — Part B skateboard, City Plaza: "skyline silhouettes, planters,
// banners, moving traffic in the distance." The plaza ends at its fence and then there is a photograph. This stands a city in
// the gap: a ring of towers with lit windows past the fence, and a road round the plaza with cars on it that never stop.
//   · THE SKYLINE — 30 boxes on a ring 44–84 m past the plaza's edge, 14–50 m tall, in four dusk blues. Four merged meshes (one per
//     tint) each with its own painted facade (most windows dark, some warm, a few cool), so the whole skyline is
//     four draws; the faces are unlit (drawn as painted), so the city is the same at midday as at dusk.
//   · THE ROAD — a dark strip round the plaza with a dashed line, one mesh per side pair (two draws).
//   · THE TRAFFIC — twelve cars, ONE thin-instanced box, driving the road's two lanes at 7–12 m/s and wrapping at the ends; the
//     only per-frame work is writing twelve matrices.
// A phone gets half the towers and half the cars. Pure placement and motion are in `skylineSpots` / `carAt`, tested without a
// scene. Cosmetic: the play area, the fence and the bound are not touched; nothing here is pickable or casts a shadow.

import { Color3, DynamicTexture, Matrix, Mesh, MeshBuilder, PBRMaterial, Quaternion, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { lookFeatureOff } from '../scene/graphicsSetting';

export interface Tower { x: number; z: number; w: number; d: number; h: number; tint: number }

function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

/** Pure: the ring of towers — `count` of them spread round the plaza (half-extent `bound`), 44–84 m past its edge, 14–50 m tall. */
export function skylineSpots(bound: number, count: number): Tower[] {
  const rand = rng(1217 + Math.round(bound));
  const out: Tower[] = [];
  const n = Math.max(1, Math.floor(count));
  for (let i = 0; i < n; i++) {
    const a = ((i + rand() * 0.6) / n) * Math.PI * 2;
    const r = bound * 1.41 + 44 + rand() * 40;   // past the corners of the square plaza, then 44–84 m
    out.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, w: 10 + rand() * 18, d: 10 + rand() * 18, h: 14 + rand() * 36, tint: i % 4 });
  }
  return out;
}

/** Pure: a car's place on the road at time `t` — the lane's x, the wrapped z along a road `len` long, which way it faces. */
export function carAt(i: number, t: number, bound: number, len: number): { x: number; z: number; yaw: number; speed: number } {
  const lane = i % 4;                                       // two lanes each side of the plaza
  const side = lane < 2 ? -1 : 1, dir = lane % 2 === 0 ? 1 : -1;
  const speed = 7 + ((i * 37) % 6);                         // 7..12 m/s
  const z0 = ((i * 53) % len) - len / 2;
  const z = ((((z0 + dir * speed * t) % len) + len) % len) - len / 2;
  return { x: side * (bound + 14 + (lane % 2) * 3.4), z, yaw: dir > 0 ? 0 : Math.PI, speed };
}

export interface CityHandle { readonly towers: number; readonly cars: number; update(dt: number): void; dispose(): void }

const TINTS = ['#0c121c', '#111a28', '#172233', '#1d2a3e'];   // dusk silhouettes: dark faces, the lit windows are the picture
const LIFT = ['#1d2a40', '#243551', '#2c4163', '#365078'];       // each face is a little lighter at the top

export function mountPlazaCity(scene: Scene, bound: number, tier: string | null | undefined): CityHandle {
  const phone = tier === 'mobile';
  if (lookFeatureOff('dress')) return { towers: 0, cars: 0, update() { /* off */ }, dispose() { /* nothing built */ } };
  const spots = skylineSpots(bound, phone ? 15 : 30);
  const owned: { dispose(): void }[] = [];
  const meshes: AbstractMesh[] = [];

  // the facade: a painted wall, one per tint — a grid of windows (most dark, some warm, a few cool) on a face that is a little
  // lighter at the top. Unlit (PBR `unlit`): the plaza's lighting is a hard sun and an arena's worth of IBL, which turned every
  // dark face to the same pale slate (measured: albedo 0.05 rendered ~0.4); a skyline at dusk is a flat dark shape with lit windows,
  // so the picture is painted and drawn as it is. Fog still takes it.
  const facade = (k: number): DynamicTexture | null => {
    try {
      const tex = new DynamicTexture(`plaza_city_tex_${k}`, { width: 256, height: 512 }, scene, true);
      const g = tex.getContext() as unknown as CanvasRenderingContext2D;
      const gr = g.createLinearGradient(0, 512, 0, 0);
      gr.addColorStop(0, TINTS[k]); gr.addColorStop(1, LIFT[k]);
      g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
      const rand = rng(77 + k);
      for (let y = 8; y < 504; y += 16) for (let x = 8; x < 248; x += 16) {
        const r = rand();
        g.fillStyle = r < 0.62 ? '#0a1018' : r < 0.9 ? '#ffd9a0' : '#bfe6ff';
        g.fillRect(x, y, 9, 10);
      }
      tex.update(true); tex.uScale = 0.5; tex.vScale = 0.45; owned.push(tex);   // a face is ~7 columns by ~13 floors of windows, not a haze of dots
      return tex;
    } catch { return null; }
  };

  for (let k = 0; k < TINTS.length; k++) {
    const parts: Mesh[] = [];
    for (const s of spots) {
      if (s.tint !== k) continue;
      const b = MeshBuilder.CreateBox('plaza_tower', { width: s.w, height: s.h, depth: s.d }, scene);
      b.position.set(s.x, s.h / 2 - 0.5, s.z); b.rotation.y = Math.atan2(s.x, s.z); parts.push(b);
    }
    if (!parts.length) continue;
    const m = new PBRMaterial(`plaza_city_m_${k}`, scene);
    m.unlit = true;
    const tex = facade(k);
    if (tex) { m.albedoTexture = tex; m.albedoColor = Color3.White(); } else m.albedoColor = Color3.FromHexString(LIFT[k]);
    owned.push(m);
    for (const p of parts) p.computeWorldMatrix(true);
    const one = parts.length === 1 ? parts[0] : Mesh.MergeMeshes(parts, true, true);
    if (!one) continue;
    one.name = `plaza_city_${k}`; one.material = m; one.isPickable = false; one.receiveShadows = false; one.applyFog = true; one.freezeWorldMatrix();
    meshes.push(one);
  }

  // the road round the plaza: a dark strip each side, a dashed line down the middle of its two lanes
  const roadLen = (bound + 14) * 2 + 120;
  const roadM = new PBRMaterial('plaza_road_m', scene); roadM.albedoColor = new Color3(0.045, 0.05, 0.06); roadM.metallic = 0; roadM.roughness = 0.85; owned.push(roadM);
  for (const side of [-1, 1]) {
    const road = MeshBuilder.CreateGround(`plaza_road_${side < 0 ? 'w' : 'e'}`, { width: 9, height: roadLen }, scene);
    road.position.set(side * (bound + 15.7), -0.02, 0); road.material = roadM; road.isPickable = false; road.receiveShadows = false; road.freezeWorldMatrix();
    meshes.push(road);
  }

  // the traffic: one box, thin-instanced; the cars' matrices are rewritten each frame
  const nCars = phone ? 6 : 12;
  const carM = new PBRMaterial('plaza_car_m', scene); carM.albedoColor = Color3.White(); carM.metallic = 0.5; carM.roughness = 0.35; owned.push(carM);
  const car = MeshBuilder.CreateBox('plaza_car', { width: 1.9, height: 1.45, depth: 4.4 }, scene);
  car.material = carM; car.isPickable = false; car.receiveShadows = false; car.alwaysSelectAsActiveMesh = true;
  const mats = new Float32Array(nCars * 16), cols = new Float32Array(nCars * 4);
  const PAINT = ['#b3382c', '#2f6db3', '#d98a1f', '#d8dde4', '#3f8a5a', '#1b1f27'];
  for (let i = 0; i < nCars; i++) { const c = Color3.FromHexString(PAINT[i % PAINT.length]); cols.set([c.r, c.g, c.b, 1], i * 4); }
  car.thinInstanceSetBuffer('matrix', mats, 16, false); car.thinInstanceSetBuffer('color', cols, 4, true);
  meshes.push(car);
  const tmp = new Matrix(), q = new Quaternion(), s = new Vector3(1, 1, 1), p = new Vector3();
  let clock = 0;
  const write = (): void => {
    for (let i = 0; i < nCars; i++) {
      const c = carAt(i, clock, bound, roadLen);
      Quaternion.RotationYawPitchRollToRef(c.yaw, 0, 0, q); p.set(c.x, 0.72, c.z);
      Matrix.ComposeToRef(s, q, p, tmp); tmp.copyToArray(mats, i * 16);
    }
    car.thinInstanceBufferUpdated('matrix');
  };
  write();

  return {
    towers: spots.length, cars: nCars,
    update(dt) { clock += Math.max(0, Math.min(0.1, dt)); write(); },
    dispose() { for (const m of meshes) m.dispose(); for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose(); meshes.length = 0; },
  };
}
