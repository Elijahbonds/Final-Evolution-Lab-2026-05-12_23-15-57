// THE GYM (vis-court, wave 2, 2026-10-13) — a hall round the Gym place's court.
//
// The audit (volleyball): "Gym look: hardwood with a reflection probe or SSR, overhead clustered lights, banners". The
// foundation put the mirror on the floor (GlossyFloor reads the place's wooden ground); but the room was still the BEACH — the
// mode built its sand plate and sea under every volleyball place, so the Gym was an orange court standing on sand with a
// horizon past it (measured on the Gym's before frame). This is the room: a hardwood floor to the walls, padded lower walls and
// cinder-block uppers carrying banners, a stand along one side with its crowd, a ceiling, and six overhead light bars that are
// real fixtures (named flood_court_gym_<i>: FixtureLights plants a clustered spot under each, EmissiveGlow haloes them).
//
// The hall is bigger than the camera's reach: the play camera stands 11–14 m behind the hero's baseline. Everything is one-sided,
// facing in, so the intro's crane (which starts outside the room) sees through the walls and the roof and then comes down into it.
// Visual only.

import { Color3, MeshBuilder, PBRMaterial, StandardMaterial, Texture, TransformNode } from '@babylonjs/core';
import type { DynamicTexture, Mesh, Scene } from '@babylonjs/core';
import { makeTexture } from './texture';
import { buildCrowdStand, placeRng } from '../visual/PlacePack';

export interface GymPlan {
  halfX: number; backZ: number; frontZ: number; height: number;
  bars: { x: number; z: number }[];
  banners: string[];
}

/** Pure: the hall's size round a court (halfWidth, halfLength) and where its light bars hang. */
export function gymPlan(halfWidth: number, halfLength: number, phone = false): GymPlan {
  const halfX = halfWidth + 11, backZ = halfLength + 17, frontZ = halfLength + 15;
  const bars: { x: number; z: number }[] = [];
  const zs = phone ? [-halfLength * 0.9, halfLength * 0.1] : [-halfLength * 1.05, -halfLength * 0.05, halfLength * 0.9];
  for (const z of zs) for (const x of [-halfWidth * 0.9, halfWidth * 0.9]) bars.push({ x, z });
  return { halfX, backZ, frontZ, height: 10, bars, banners: ['FEL VOLLEY', 'COURT SERIES', 'NEXUS ENERGY', 'ORBIT TV', 'KINETIC', 'AEROLITE'] };
}

function paintWall(g: CanvasRenderingContext2D, W: number, H: number, banners: readonly string[], seed: number): void {
  const r = placeRng(seed);
  g.fillStyle = '#d9d3c5'; g.fillRect(0, 0, W, H);                       // painted block
  g.strokeStyle = 'rgba(80,70,55,0.12)'; g.lineWidth = 2;
  for (let y = 0; y < H * 0.62; y += H * 0.062) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = '#1c2a47'; g.fillRect(0, H * 0.64, W, H * 0.36);        // the padded lower wall
  g.fillStyle = 'rgba(255,255,255,0.07)';
  for (let x = 0; x < W; x += W / 24) g.fillRect(x, H * 0.64, 3, H * 0.36);
  g.fillStyle = '#f2b134'; g.fillRect(0, H * 0.63, W, H * 0.014);       // a rail stripe
  const n = banners.length, bw = W / (n + 1) * 0.86, by = H * 0.12, bh = H * 0.34;
  const palette = ['#e63946', '#2a9d8f', '#3a86ff', '#ffb703', '#8338ec', '#ff7b00'];
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * (W / n) + (r() - 0.5) * 8;
    g.fillStyle = palette[i % palette.length]; g.fillRect(x - bw / 2, by, bw, bh);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x - bw / 2, by, bw, bh * 0.12);
    g.fillStyle = '#ffffff'; g.font = `900 ${Math.round(bh * 0.22)}px system-ui, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(banners[i], x, by + bh / 2, bw * 0.9);
  }
}

function paintFloor(g: CanvasRenderingContext2D, S: number): void {
  const r = placeRng(41);
  g.fillStyle = '#c98a4b'; g.fillRect(0, 0, S, S);
  const plank = S / 16;
  for (let i = 0; i < 16; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,235,200' : '60,30,10'},${0.04 + r() * 0.06})`; g.fillRect(i * plank, 0, plank, S);
    g.fillStyle = 'rgba(60,30,10,0.35)'; g.fillRect(i * plank, 0, 2, S);
    for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(60,30,10,0.22)'; g.fillRect(i * plank, ((i * 37 + k * 61) % 100) / 100 * S, plank, 2); }
  }
}

export interface GymHandle { readonly meshes: readonly Mesh[]; dispose(): void }

export function buildGymHall(scene: Scene, halfWidth: number, halfLength: number, opts: { phone?: boolean } = {}): GymHandle {
  const P = gymPlan(halfWidth, halfLength, opts.phone);
  const made: Mesh[] = [];
  const nodes: TransformNode[] = [];
  const mats: (PBRMaterial | StandardMaterial)[] = [];
  const texes: DynamicTexture[] = [];
  const tex = (name: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): DynamicTexture | null => {
    const t = makeTexture(scene, name, w, h, paint);   // null where there is no canvas (headless): the hall is plain colour there
    if (t) texes.push(t);
    return t;
  };
  const pbr = (name: string, t: DynamicTexture | null, color = '#ffffff', rough = 0.85): PBRMaterial => {
    const m = new PBRMaterial(name, scene); m.albedoColor = Color3.FromHexString(color); if (t) m.albedoTexture = t;
    m.metallic = 0; m.roughness = rough; m.environmentIntensity = 0.55; mats.push(m); return m;
  };
  // the floor, a hair under the court's own so the court's lines read on top
  const floor = MeshBuilder.CreateGround('court_gym_floor', { width: P.halfX * 2, height: P.backZ + P.frontZ }, scene);
  floor.position.set(0, -0.012, (P.frontZ - P.backZ) / 2);
  const ft = tex('court_gym_floor_tex', 512, 512, (g) => paintFloor(g, 512)); if (ft) { ft.uScale = P.halfX * 2 / 5; ft.vScale = (P.backZ + P.frontZ) / 5; ft.wrapU = Texture.WRAP_ADDRESSMODE; ft.wrapV = Texture.WRAP_ADDRESSMODE; }
  floor.material = pbr('court_gym_floor_m', ft, '#ffffff', 0.5); made.push(floor);
  // the four walls, each facing in (a plane's front looks down −z: yaw it to face the room)
  const wallTex = tex('court_gym_wall_tex', 2048, 512, (g) => paintWall(g, 2048, 512, P.banners, 9));
  const wallM = pbr('court_gym_wall_m', wallTex, '#ffffff', 0.9);
  // a plane's face looks down −z, so a wall facing the room is yawed by atan2(−nx, −nz) for its inward normal (nx, nz)
  const walls: [string, number, number, number, number][] = [
    ['far', 0, -P.backZ, Math.atan2(0, -1), P.halfX * 2], ['near', 0, P.frontZ, Math.atan2(0, 1), P.halfX * 2],
    ['left', -P.halfX, (P.frontZ - P.backZ) / 2, Math.atan2(-1, 0), P.backZ + P.frontZ], ['right', P.halfX, (P.frontZ - P.backZ) / 2, Math.atan2(1, 0), P.backZ + P.frontZ],
  ];
  for (const [n, x, z, yaw, w] of walls) {
    const p = MeshBuilder.CreatePlane(`court_gym_wall_${n}`, { width: w, height: P.height }, scene);
    p.position.set(x, P.height / 2, z); p.rotation.y = yaw; p.material = wallM; made.push(p);
  }
  // the ceiling: dark, facing down
  const ceil = MeshBuilder.CreateGround('court_gym_ceiling', { width: P.halfX * 2, height: P.backZ + P.frontZ }, scene);
  ceil.position.set(0, P.height, (P.frontZ - P.backZ) / 2); ceil.rotation.x = Math.PI;
  const cm = pbr('court_gym_ceiling_m', null, '#2a2e37', 0.95); ceil.material = cm; made.push(ceil);
  // the light bars (fixtures): a long emissive tube under a dark housing
  const bar = new StandardMaterial('flood_court_gym_m', scene);
  bar.disableLighting = true; bar.diffuseColor = Color3.Black(); bar.specularColor = Color3.Black(); bar.emissiveColor = Color3.FromHexString('#fff6e0'); mats.push(bar);
  const housing = pbr('court_gym_housing_m', null, '#15181e', 0.8);
  P.bars.forEach((b, i) => {
    const h = MeshBuilder.CreateBox(`court_gym_housing_${i}`, { width: 5.6, height: 0.3, depth: 0.7 }, scene);
    h.position.set(b.x, P.height - 1.35, b.z); h.material = housing; made.push(h);
    const tube = MeshBuilder.CreateBox(`flood_court_gym_${i}`, { width: 5.2, height: 0.12, depth: 0.5 }, scene);
    tube.position.set(b.x, P.height - 1.52, b.z); tube.material = bar; made.push(tube);
    const rod = MeshBuilder.CreateCylinder(`court_gym_rod_${i}`, { height: 1.2, diameter: 0.06, tessellation: 5 }, scene);
    rod.position.set(b.x, P.height - 0.6, b.z); rod.material = housing; made.push(rod);
  });
  // a stand along the left wall, with its crowd (the shared stand: faces +z in its own frame, so yaw it to face the court, +x)
  if (!opts.phone) {
    try {
      const stand = buildCrowdStand(scene, null, 'court_gym_stand', { width: P.backZ + P.frontZ - 14, rows: 5, accent: '#f2b134', seed: 21, emissive: 0.22 });
      stand.position.set(-P.halfX + 0.5, 0, (P.frontZ - P.backZ) / 2); stand.rotation.y = Math.PI / 2;
      nodes.push(stand);
      for (const m of stand.getChildMeshes()) { m.isPickable = false; }
    } catch { /* no canvas for the crowd's painting: the hall stands without its stand */ }
  }
  for (const m of made) { m.isPickable = false; m.receiveShadows = true; m.freezeWorldMatrix(); }
  return { meshes: made, dispose() { for (const n of nodes) n.dispose(false, true); for (const m of made) m.dispose(); for (const m of mats) m.dispose(); for (const t of texes) t.dispose(); } };
}
