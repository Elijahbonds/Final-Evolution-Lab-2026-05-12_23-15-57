// THE DANCE FLOOR — lit tiles on the stage deck (vis-party, 2026-10-13).
//
// The podium the dancer stands on was one flat pink cylinder: the biggest object in the frame and the least alive. A glossy,
// reflecting deck (MirrorTexture / SSR, VISUAL-PASS-PLAN A9.7 second half) is the foundation's wave-2 work; this is the
// stand-in that needs none of it — a disc of emissive TILES laid on the deck's top, chasing to the beat the way a club floor
// does. What each tile shows is a pure function of the song's beat/bar position (`floorTile`), so it is on the song's clock like
// the wall and the heads; reduced flashing holds it for the whole bar and dims the contrast.
//
// One disc, one PBR material, one small DynamicTexture re-uploaded only when the step changes (a beat, or a bar when calm).

import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, type Scene } from '@babylonjs/core';
import { ledColors } from './ledWall';

/** Tiles across the disc's diameter. */
export const FLOOR_TILES = 10;

export interface FloorState { beatIndex: number; beatPhase: number; barIndex: number; calm: boolean }

/**
 * How lit tile (col, row) is, 0..1. A checker that flips on the beat, with a ring that runs out from the middle one tile a
 * beat; calm holds the checker for the whole bar and the ring still. Pure.
 */
export function floorTile(col: number, row: number, s: FloorState): number {
  const step = s.calm ? Math.floor(s.barIndex) * 3 : s.beatIndex;   // 3: an odd step, so the checker flips bar to bar
  const check = ((col + row + step) % 2 + 2) % 2 === 0;
  const c = (FLOOR_TILES - 1) / 2;
  const d = Math.hypot(col - c, row - c);
  const ring = s.calm ? 0 : Math.abs(d - (((step % 5) + 5) % 5) * 1.1) < 0.9 ? 0.55 : 0;
  const decay = s.calm ? 0.6 : 0.55 + 0.45 * Math.exp(-s.beatPhase * 4);
  return Math.min(1, (check ? 0.55 : 0.12) * decay + ring);
}

/** Is a tile inside the disc? (The canvas is square; the corners are off the deck.) */
export function tileOnDeck(col: number, row: number): boolean {
  const c = (FLOOR_TILES - 1) / 2;
  return Math.hypot(col - c, row - c) <= FLOOR_TILES / 2 - 0.2;
}

export function floorKey(s: FloorState): string {
  return s.calm ? `c|${Math.floor(s.barIndex)}` : `${s.beatIndex}|${Math.floor(s.beatPhase * 3)}`;
}

export interface StageFloorHandle {
  mesh: Mesh;
  update(s: FloorState): boolean;
  dispose(): void;
}

/** TUNED (new): the tiles' emissive gain — the deck's own pink stays underneath, so the tiles only need to light it. */
export const FLOOR_GAIN = 0.7;

export function mountStageFloor(scene: Scene, o: { radius: number; y: number; small: boolean }): StageFloorHandle {
  const px = o.small ? 16 : 32, N = FLOOR_TILES, W = N * px;
  const tex = new DynamicTexture('dance_floor_tex', { width: W, height: W }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const mesh = MeshBuilder.CreateDisc('dance_floor_tiles', { radius: o.radius, tessellation: 48 }, scene);
  mesh.rotation.x = Math.PI / 2;   // facing up
  mesh.position.y = o.y;
  mesh.isPickable = false;
  const mat = new PBRMaterial('dance_floor_mat', scene);
  mat.albedoColor = Color3.Black();
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(FLOOR_GAIN, FLOOR_GAIN, FLOOR_GAIN);
  mat.roughness = 0.9; mat.metallic = 0;
  mat.zOffset = -2;                // coplanar-ish with the deck's top: drawn over it, never z-fighting it
  mesh.material = mat;
  let last = '';
  function paint(s: FloorState): void {
    const [a, b] = ledColors(s.barIndex);
    const ca = Color3.FromHexString(a), cb = Color3.FromHexString(b);
    g.fillStyle = '#000000'; g.fillRect(0, 0, W, W);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!tileOnDeck(c, r)) continue;
      const v = floorTile(c, r, s);
      if (v < 0.03) continue;
      const k = ((c + r) % 2 === 0) ? ca : cb;
      g.fillStyle = `rgba(${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)},${v.toFixed(2)})`;
      g.fillRect(c * px + 1, r * px + 1, px - 2, px - 2);
    }
    tex.update(true);
  }
  return {
    mesh,
    update(s) { const k = floorKey(s); if (k === last) return false; last = k; paint(s); return true; },
    dispose() { mesh.dispose(false, true); tex.dispose(); },
  };
}
