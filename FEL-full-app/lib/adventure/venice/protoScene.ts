/**
 * THE VENICE HUB PROTOTYPE SCENE (lane/venice-hub, 2026-11-12) — DEV ONLY, NOT SHIPPED.
 *
 * The layout (./layout.ts) as a walkable Babylon scene so the owner can walk it: every hub cell a 64 m ground tile in its
 * district's colour, a low placeholder block per district, a marker ring and a sign at every walk-up spot, the sea to the
 * west, and in the courts district the EXISTING Venice court kit — the painted court (visual/CourtSurface.mountStreetCourt,
 * the dunk's palette), the Meshy hoop (visual/meshyProps.spawnMeshyProp) on each of the four courts, and the Venice dunk
 * dressing (nexus/veniceBoardwalk.mountVeniceDunkDressing: the baked palms, the boardwalk row) around them. Every one of
 * those is called read-only, exactly as the modes call it; nothing here changes a shared file.
 *
 * Mounted by app/dev/venice-hub (a 404 outside `next dev`) and by the probe bundle scripts/probes/venice-hub/proto-entry.ts.
 * It is a sketch of PLACE and SCALE, not of look: the placeholders are flat colours on purpose.
 */

import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, DynamicTexture, HemisphericLight, Mesh, MeshBuilder, Scene,
  SceneInstrumentation, StandardMaterial, TransformNode, UniversalCamera, Vector3, type Engine,
} from '@babylonjs/core';
import { mountStreetCourt, VENICE_DUNK_COURT_PALETTE } from '../../babylon/visual/CourtSurface';
import { spawnMeshyProp } from '../../babylon/visual/meshyProps';
import { mountVeniceDunkDressing } from '../../babylon/nexus/veniceBoardwalk';
import { DISTRICTS, HUB_COLS, HUB_ROWS, HUB_MIN_X, HUB_MIN_Z, PIECE_M, SPOTS, cellRect, districtAt, hubHome, spotAt, type Spot } from './layout';

export interface ProtoStats { drawCalls: number; activeMeshes: number; meshes: number; textureMb: number; fps: number }
export interface ProtoHandle {
  scene: Scene;
  /** 'walk' (eye height, WASD / arrows / drag) or 'map' (top-down). */
  view(kind: 'walk' | 'map' | 'courts', at?: { x: number; z: number; lookX?: number; lookZ?: number }): void;
  where(): { district: string | null; spot: Spot | null };
  stats(): ProtoStats;
  ready: Promise<void>;
  dispose(): void;
}

const EYE = 1.7;

function signTexture(scene: Scene, text: string, sub: string): DynamicTexture {
  const t = new DynamicTexture(`vh_sign_${text}`, { width: 512, height: 128 }, scene, false);
  const g = t.getContext() as CanvasRenderingContext2D;
  g.fillStyle = 'rgba(10,12,18,0.88)'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ffd166'; g.font = 'bold 40px sans-serif'; g.fillText(text.slice(0, 22), 16, 52);
  g.fillStyle = '#e6edf3'; g.font = '28px sans-serif'; g.fillText(sub.slice(0, 30), 16, 100);
  t.update(); t.hasAlpha = false;
  return t;
}

/** Build the prototype into a new scene on `engine`. `tier: 'mobile'` marks the scene as the phone tier (the court kit reads it). */
export function buildVeniceProto(engine: Engine, opts: { tier?: 'mobile' | 'desktop'; kit?: boolean; signs?: boolean } = {}): ProtoHandle {
  const scene = new Scene(engine);
  (scene.metadata ??= {}).felTier = opts.tier ?? 'desktop';
  scene.clearColor = new Color4(0.98, 0.72, 0.52, 1);
  scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.0022; scene.fogColor = new Color3(0.95, 0.74, 0.6);
  const hemi = new HemisphericLight('vh_hemi', new Vector3(0, 1, 0), scene); hemi.intensity = 0.55; hemi.groundColor = new Color3(0.25, 0.3, 0.45);
  const sun = new DirectionalLight('fel_sun', new Vector3(0.5, -0.8, 0.3), scene); sun.intensity = 0.75; sun.diffuse = new Color3(1, 0.88, 0.72);
  // the frame's draw calls: Babylon resets the engine's counter per frame only while a SceneInstrumentation exists
  const instr = new SceneInstrumentation(scene);
  const root = new TransformNode('vh_root', scene);
  const mats = new Map<string, StandardMaterial>();
  const mat = (hex: string, emissive = 0): StandardMaterial => {
    const k = `${hex}|${emissive}`; let m = mats.get(k);
    if (!m) { m = new StandardMaterial(`vh_${hex}`, scene); m.diffuseColor = Color3.FromHexString(hex); m.specularColor = Color3.Black(); m.emissiveColor = Color3.FromHexString(hex).scale(emissive); mats.set(k, m); }
    return m;
  };

  // the ground: one merged mesh per district (a district is one draw however many cells it covers)
  for (const d of DISTRICTS) {
    const tiles = d.cells.map(([i, j]) => {
      const r = cellRect(i, j);
      const g = MeshBuilder.CreateGround(`vh_tile_${d.id}_${i}_${j}`, { width: PIECE_M, height: PIECE_M }, scene);
      g.position.set((r.minX + r.maxX) / 2, d.kind === 'water' ? -0.4 : 0, (r.minZ + r.maxZ) / 2);
      return g;
    });
    const merged = Mesh.MergeMeshes(tiles, true, true) ?? tiles[0];
    merged.name = `vh_district_${d.id}`; merged.material = mat(d.color); merged.parent = root; merged.isPickable = false; merged.receiveShadows = true;
  }
  // the open sea past the hub's west edge, and the grid lines (one line system)
  const sea = MeshBuilder.CreateGround('vh_sea', { width: 900, height: 1400 }, scene);
  sea.position.set(HUB_MIN_X - 450, -0.5, 0); sea.material = mat('#164a72', 0.15); sea.parent = root; sea.isPickable = false;
  const lines: Vector3[][] = [];
  for (let i = 0; i <= HUB_COLS; i++) lines.push([new Vector3(HUB_MIN_X + i * PIECE_M, 0.05, HUB_MIN_Z), new Vector3(HUB_MIN_X + i * PIECE_M, 0.05, -HUB_MIN_Z)]);
  for (let j = 0; j <= HUB_ROWS; j++) lines.push([new Vector3(HUB_MIN_X, 0.05, HUB_MIN_Z + j * PIECE_M), new Vector3(-HUB_MIN_X, 0.05, HUB_MIN_Z + j * PIECE_M)]);
  const grid = MeshBuilder.CreateLineSystem('vh_grid', { lines }, scene); grid.color = new Color3(1, 1, 1); grid.alpha = 0.35; grid.parent = root;
  // the bike path (dark strip, every row) and the boardwalk band
  const path = MeshBuilder.CreateGround('vh_bikepath', { width: 8, height: HUB_ROWS * PIECE_M }, scene); path.position.set(26, 0.03, 0); path.material = mat('#2b2f36'); path.parent = root;
  const walk = MeshBuilder.CreateGround('vh_walk', { width: 16, height: HUB_ROWS * PIECE_M }, scene); walk.position.set(42, 0.03, 0); walk.material = mat('#d8ccb4'); walk.parent = root;
  const pier = MeshBuilder.CreateBox('vh_pier', { width: 128, height: 1, depth: 7 }, scene); pier.position.set(-96, 1.2, 159.5); pier.material = mat('#6b4f33'); pier.parent = root;

  // a placeholder block per non-court district: a low box at its first cell's centre, its height by kind
  const H: Record<string, number> = { town: 9, stage: 3, screen: 7, arcade: 5, gym: 1.2, skatepark: 2, diamond: 0.3, canal: 0.5, plaza: 0.4, road: 3.5, field: 0.2, beach: 0.2, court: 0.15, pier: 0, water: 0, track: 0 };
  for (const d of DISTRICTS) {
    if (d.id === 'courts' || !(H[d.kind] > 0)) continue;
    for (const [i, j] of d.cells) {
      const r = cellRect(i, j), h = H[d.kind];
      const b = MeshBuilder.CreateBox(`vh_block_${d.id}_${i}_${j}`, { width: PIECE_M * 0.55, depth: PIECE_M * 0.4, height: h }, scene);
      b.position.set((r.minX + r.maxX) / 2 + (d.kind === 'road' ? 12 : 0), h / 2, (r.minZ + r.maxZ) / 2); b.material = mat(d.color, 0.1); b.parent = root;
    }
  }

  // spots: a marker ring, and a sign on a post
  for (const s of SPOTS) {
    const ring = MeshBuilder.CreateTorus(`vh_ring_${s.id}`, { diameter: s.radius * 2, thickness: 0.35, tessellation: 40 }, scene);
    ring.position.set(s.at[0], 0.15, s.at[1]); ring.material = mat(s.zone ? '#ff7b3d' : s.modes.length ? '#ffd166' : '#58a6ff', 0.6); ring.parent = root; ring.isPickable = false;
    if (opts.signs === false) continue;
    const sign = MeshBuilder.CreatePlane(`vh_sign_${s.id}`, { width: 6, height: 1.5, sideOrientation: Mesh.DOUBLESIDE }, scene);
    sign.position.set(s.at[0], 4.2, s.at[1] - s.radius); sign.billboardMode = Mesh.BILLBOARDMODE_Y; sign.parent = root;
    const sm = new StandardMaterial(`vh_signmat_${s.id}`, scene); sm.disableLighting = true;
    sm.emissiveTexture = signTexture(scene, s.label.replace('[PLACEHOLDER] ', ''), s.zone ? `door: ${s.zone === '*' ? 'every zone' : s.zone}` : s.modes.length ? s.route : 'home');
    sign.material = sm;
  }

  // THE V1 DISTRICT: the four courts with the shipped Venice court kit
  const kitJobs: Promise<unknown>[] = [];
  const courts = new TransformNode('vh_courts', scene); courts.parent = root;
  for (const s of SPOTS.filter((x) => x.district === 'courts' && x.modes.length && x.id !== 'court.camera')) {
    const hw = 8, hl = 14;
    const apron = MeshBuilder.CreateGround(`vh_apron_${s.id}`, { width: hw * 2 + 6, height: hl * 2 + 6 }, scene);
    apron.position.set(s.at[0], 0.01, s.at[1]); apron.material = mat('#9a9a94'); apron.parent = courts;
    if (opts.kit !== false) {
      mountStreetCourt(scene, courts, [s.at[0] - hw, s.at[0] + hw], [s.at[1] - hl, s.at[1] + hl], 0.02, VENICE_DUNK_COURT_PALETTE);
      const hoopAt = new TransformNode(`vh_hoop_at_${s.id}`, scene); hoopAt.parent = courts; hoopAt.position.set(s.at[0], 0, s.at[1] - hl + 0.9);
      kitJobs.push(spawnMeshyProp(scene, 'hoop', hoopAt, `vh_hoop_${s.id}`));
    }
  }
  if (opts.kit !== false) {
    // the dressing, placed as the dunk places it around ITS court (rim at the origin, the row behind the hoop): here around Court 3
    const flight = SPOTS.find((x) => x.id === 'court.flight')!;
    const dress = new TransformNode('vh_venice_dressing', scene); dress.parent = courts; dress.position.set(flight.at[0], 0, flight.at[1] - 14 + 1.32);
    kitJobs.push(mountVeniceDunkDressing(scene, dress, { crowdCards: false, phoneRail: true }).catch((e) => console.warn('[VENICE-HUB] dressing', e)));
  }

  // cameras
  const home = hubHome('V1');
  const walkCam = new UniversalCamera('vh_walk', new Vector3(home.at[0], EYE, home.at[1]), scene);
  walkCam.setTarget(new Vector3(-24, EYE, -70)); walkCam.speed = 1.2; walkCam.minZ = 0.1; walkCam.maxZ = 1500; walkCam.fov = 0.95;
  walkCam.keysUp = [87, 38]; walkCam.keysDown = [83, 40]; walkCam.keysLeft = [65, 37]; walkCam.keysRight = [68, 39];
  const mapCam = new ArcRotateCamera('vh_map', -Math.PI / 2, 0.001, 700, new Vector3(0, 0, 0), scene); mapCam.maxZ = 3000; mapCam.minZ = 1;
  const courtsCam = new ArcRotateCamera('vh_courtscam', -Math.PI / 2 - 0.55, 0.95, 120, new Vector3(-40, 0, -64), scene); courtsCam.maxZ = 2000;
  scene.activeCamera = walkCam;
  const canvas = engine.getRenderingCanvas();
  if (canvas) walkCam.attachControl(canvas, true);
  scene.onBeforeRenderObservable.add(() => { if (scene.activeCamera === walkCam) walkCam.position.y = EYE; });

  // the dunk's dressing is laid out round ONE court: its palm rows would stand on the other three. Hide the palms inside a court.
  const onCourt = (x: number, z: number) => SPOTS.some((s) => s.district === 'courts' && s.modes.length && s.id !== 'court.camera' && Math.abs(x - s.at[0]) < 12 && Math.abs(z - s.at[1]) < 18);
  const ready = Promise.allSettled(kitJobs).then(() => {
    for (const n of scene.transformNodes) if (/^vb_palm_\d+$/.test(n.name)) { const p = n.getAbsolutePosition(); if (onCourt(p.x, p.z)) n.setEnabled(false); }
  });
  return {
    scene,
    ready,
    view(kind, at) {
      if (canvas) scene.activeCamera?.detachControl();
      scene.fogMode = kind === 'map' ? Scene.FOGMODE_NONE : Scene.FOGMODE_EXP2;
      if (kind === 'map') scene.activeCamera = mapCam;
      else if (kind === 'courts') scene.activeCamera = courtsCam;
      else {
        if (at) { walkCam.position.set(at.x, EYE, at.z); walkCam.setTarget(new Vector3(at.lookX ?? at.x, EYE, at.lookZ ?? at.z - 10)); }
        scene.activeCamera = walkCam;
      }
      if (canvas) scene.activeCamera?.attachControl(canvas, true);
    },
    where() {
      const p = scene.activeCamera === walkCam ? walkCam.position : mapCam.target;
      return { district: districtAt(p.x, p.z)?.id ?? null, spot: spotAt(p.x, p.z) };
    },
    stats() {
      let tex = 0;
      for (const t of scene.textures) { const s = t.getSize(); tex += s.width * s.height * 4 * ((t as { noMipmap?: boolean }).noMipmap ? 1 : 1.33); }
      return { drawCalls: instr.drawCallsCounter.current, activeMeshes: scene.getActiveMeshes().length, meshes: scene.meshes.length, textureMb: Math.round(tex / 1e6), fps: Math.round(engine.getFps()) };
    },
    dispose() { instr.dispose(); scene.dispose(); },
  };
}
