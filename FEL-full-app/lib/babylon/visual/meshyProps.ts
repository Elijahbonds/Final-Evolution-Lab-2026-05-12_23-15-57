// meshyProps — the owner's Meshy scans as game props (owner ask 2026-09-05: "use my other hoop asset… use my other
// Meshy assets too, look at them all and decide"). Baked by scripts/meshy/bake-prop.py into public/models/meshy/:
// one mesh each, real-metre scale, bottom-centre pivot for standing props and centre pivot for balls, ≤2K textures.
//
// Three dressers, all visual only — physics, rim constants and the gameplay meshes they ride on are untouched:
//   dressHoop(scene, venueRoot)  the scanned Venice hoop replaces the procedural pole/board/rim under every `prop_hoop_*`
//   dressBall(ball, kind)        a textured ball mesh rides the mode's physics sphere (the sphere goes invisible)
//   dressBoard(board, kind)      a textured deck rides the board sport's box (the box goes invisible)
// Every load is cached per scene as an AssetContainer; a failed load leaves the procedural look in place and warns once.
import { AssetContainer, SceneLoader, TransformNode } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export type MeshyPropKey = 'hoop' | 'ball-basketball' | 'ball-soccer' | 'ball-tennis' | 'skateboard' | 'snowboard' | 'surfboard' | 'hoopbus' | 'shuttle' | 'sedan' | 'dojo' | 'store' | 'helmet' | 'helmet2' | 'bat' | 'glove';
export type BallKind = 'basketball' | 'soccer' | 'tennis' | 'volleyball';
export type BoardKind = 'skateboard' | 'snowboard' | 'surfboard';

export const MESHY_PROP_URL = (key: MeshyPropKey): string => `/models/meshy/${key}.glb`;

/**
 * Where the scan's rim ring sits relative to its bottom-centre pivot, in metres, measured on the baked mesh with Blender
 * (vertex slabs by height: ring at ~2.95 m spanning z 0.15–0.80, board plane at z 0.09–0.13, pole centre at z −0.71).
 * The procedural hoop puts the rim at HOOP_RIM_OFFSET (y 3.05, z 0.72 in front of the pole); dressHoop scales the scan so
 * its ring height meets 3.05 and slides it so the ring centre meets the procedural rim. Adjust here, never in a mode.
 */
export const HOOP_SCAN = { rimY: 2.95, rimZ: 0.47 };

const containers = new WeakMap<Scene, Map<string, Promise<AssetContainer | null>>>();
const warned = new Set<string>();

function loadContainer(scene: Scene, key: MeshyPropKey): Promise<AssetContainer | null> {
  let map = containers.get(scene);
  if (!map) {
    map = new Map(); containers.set(scene, map);
    const m = map;   // OOM-HYGIENE: the baked props' containers are outside the scene's arrays — release them with the scene
    scene.onDisposeObservable.addOnce(() => { for (const q of m.values()) void q.then((c) => { try { c?.dispose(); } catch { /* lost context */ } }, () => undefined); m.clear(); containers.delete(scene); });
  }
  let p = map.get(key);
  if (!p) {
    p = SceneLoader.LoadAssetContainerAsync('', MESHY_PROP_URL(key), scene).catch((e: unknown) => {
      if (!warned.has(key)) { warned.add(key); console.warn(`[FEL-MESHY] ${key} did not load — procedural look kept: ${String((e as Error)?.message ?? e).slice(0, 120)}`); }
      return null;
    });
    map.set(key, p);
  }
  return p;
}

/** Instantiate one copy of a baked prop under `parent`. Resolves null when the file is missing. */
export async function spawnMeshyProp(scene: Scene, key: MeshyPropKey, parent: TransformNode | AbstractMesh | null, name = `meshy_${key}`): Promise<TransformNode | null> {
  const c = await loadContainer(scene, key);
  if (!c || scene.isDisposed) return null;
  const inst = c.instantiateModelsToScene((n) => `${name}_${n}`, false, { doNotInstantiate: true });
  const root = new TransformNode(name, scene);
  for (const n of inst.rootNodes) n.parent = root;
  for (const m of root.getChildMeshes()) { m.isPickable = false; m.receiveShadows = true; }
  if (parent) root.parent = parent;
  return root;
}

/** The scanned Venice hoop under every hoop prop the venue built. The procedural pole/board/rim/net go invisible. */
export async function dressHoop(scene: Scene, venueRoot: TransformNode): Promise<number> {
  const hoops = venueRoot.getChildTransformNodes(false).filter((n) => n.name.startsWith('prop_hoop_'));
  if (!hoops.length) return 0;
  const c = await loadContainer(scene, 'hoop');
  if (!c) return 0;
  let n = 0;
  for (const h of hoops) {
    if (h.isDisposed()) continue;
    const root = await spawnMeshyProp(scene, 'hoop', h, `meshy_hoop_${n}`);
    if (!root) break;
    // the scan's ring → the procedural rim's spot (the procedural 'rim' torus carries the prop's own scale)
    const rim = h.getChildMeshes().find((m) => m.name === 'rim');
    const rimY = rim?.position.y ?? 3.05, rimZ = rim?.position.z ?? 0.72;
    const s = rimY / HOOP_SCAN.rimY;
    root.scaling.setAll(s);
    root.position.set(0, 0, rimZ - HOOP_SCAN.rimZ * s);
    for (const m of h.getChildMeshes()) if (!m.name.startsWith('meshy_')) m.isVisible = false;
    n++;
  }
  return n;
}

import { BALL_SKINS, readBallSkin, hexToRgb01 } from '../nexus/ballSkins';
import { readBoardSkin } from '../nexus/boardSkins';

const BALL_KEY: Record<BallKind, MeshyPropKey | null> = { basketball: 'ball-basketball', soccer: 'ball-soccer', tennis: 'ball-tennis', volleyball: null };

/** The Meshy ball for a mode's ball diameter — soccer 0.22, basketball 0.24, tennis ≤ 0.07; anything else keeps its sphere. */
export function ballKindFor(diameter: number): BallKind | null {
  if (Math.abs(diameter - 0.24) < 0.005) return 'basketball';
  if (Math.abs(diameter - 0.22) < 0.005) return 'soccer';
  if (diameter <= 0.07) return 'tennis';
  return null;
}

/** A textured ball rides the physics sphere: same position, same rotation, the sphere itself goes invisible. */
export async function dressBall(ball: AbstractMesh, kind: BallKind | null): Promise<boolean> {
  if (!kind) return false;
  const key = BALL_KEY[kind];
  if (!key) return false;
  const root = await spawnMeshyProp(ball.getScene(), key, ball, `meshy_${key}`);
  if (!root || ball.isDisposed()) { root?.dispose(); return false; }
  // THE PLAYER'S BALL. Picked on the boot splash beside the court (ballSkins.ts) and applied here, by
  // re-tinting the baked mesh rather than fetching another one — so every skin is free at runtime and
  // nothing on that screen can 404. A cosmetic must never be the thing that breaks a mode, so the whole
  // application is wrapped: a bad skin leaves the classic leather and the game carries on.
  try {
    const skin = BALL_SKINS[readBallSkin()];
    if (skin && skin.id !== 'classic') {
      const { r, g, b } = hexToRgb01(skin.tint);
      for (const m of root.getChildMeshes()) {
        const mat = m.material as { albedoColor?: { set: (r: number, g: number, b: number) => void }; diffuseColor?: { set: (r: number, g: number, b: number) => void }; emissiveColor?: { set: (r: number, g: number, b: number) => void } } | null;
        if (!mat) continue;
        mat.albedoColor?.set(r, g, b);
        mat.diffuseColor?.set(r, g, b);
        // the glow is what makes a loud ball read as loud under the court lights
        mat.emissiveColor?.set(r * skin.glow, g * skin.glow, b * skin.glow);
      }
      (ball.metadata ??= {} as Record<string, unknown>).felBallSkin = skin.id;
      console.info(`[FEL-BALL] skin ${skin.id}`);
    }
  } catch (e) { console.warn('[FEL-BALL] skin not applied', (e as Error)?.message ?? e); }
  // the baked ball is real diameter; the sphere's own diameter may differ by mode — match it
  const d = ball.getBoundingInfo().boundingBox.extendSizeWorld.x * 2 / (ball.scaling.x || 1);
  const baked = { basketball: 0.24, soccer: 0.22, tennis: 0.067, volleyball: 0.21 }[kind];
  root.scaling.setAll(d > 0 ? d / baked : 1);
  ball.visibility = 0;
  return true;
}

/** A textured deck rides the board box (length along z like the box, pivot at its underside). */
export async function dressBoard(board: AbstractMesh, kind: BoardKind, discipline?: 'skate' | 'snow' | 'surf'): Promise<boolean> {
  const root = await spawnMeshyProp(board.getScene(), kind, board, `meshy_${kind}`);
  if (!root || board.isDisposed()) { root?.dispose(); return false; }
  // THE PLAYER'S DECK. Picked on the boot splash beside the venue (boardSkins.ts) and applied by re-tinting the baked
  // deck, so every skin is free at runtime and nothing on that screen can 404. Wrapped whole: a cosmetic must never be
  // the thing that breaks a mode, so a bad skin leaves the deck as it was and the run carries on.
  if (discipline) {
    try {
      const skin = readBoardSkin(discipline);
      const { r, g, b } = hexToRgb01(skin.tint);
      for (const m of root.getChildMeshes()) {
        const mm = m.material as { albedoColor?: { set: (r: number, g: number, b: number) => void }; diffuseColor?: { set: (r: number, g: number, b: number) => void }; emissiveColor?: { set: (r: number, g: number, b: number) => void } } | null;
        if (!mm) continue;
        mm.albedoColor?.set(r, g, b);
        mm.diffuseColor?.set(r, g, b);
        mm.emissiveColor?.set(r * skin.glow, g * skin.glow, b * skin.glow);
      }
      (board.metadata ??= {} as Record<string, unknown>).felBoardSkin = skin.id;
      console.info(`[FEL-BOARD] deck ${skin.id}`);
    } catch (e) { console.warn('[FEL-BOARD] deck skin not applied', (e as Error)?.message ?? e); }
  }
  root.rotation.y = Math.PI / 2;         // baked with its length along x; the rig's box runs along z
  root.position.y = -0.03;               // the box is 6 cm tall and centred; the deck's pivot is its underside
  board.visibility = 0;
  return true;
}
