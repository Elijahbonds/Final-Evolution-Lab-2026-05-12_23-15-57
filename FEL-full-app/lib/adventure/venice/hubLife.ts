/**
 * VENICE HUB, improvement pass phase 6 (life): cheap ambient life round the courts, inside the phone row.
 *
 *   gulls     a small flock wheeling over the sand and the water's edge on slow ellipses: one billboard quad (a painted chevron, the Venice dunk's own
 *             gull look, nexus/veniceBoardwalk) drawn as thin instances — one draw, its matrices moved each frame. A phone flies
 *             half of them (the shipped phoneHalf rule).
 *   watchers  people standing at "the run" (along Court 2's far fence, looking in) and a few by the other courts, through the
 *             shipped crowd system (visual/crowd: baked vertex-animation bodies, thin instances, one material). DESKTOP AND UP
 *             ONLY: the crowd's phone policy draws flat cut-out cards (CROWD_TIER.mobile: fans 0), which the owner has called
 *             "black cardboard people" (HOOPS-AAA-GAP-SHOW sinker 4), so a phone gets the gulls and no cards.
 * `venue.veniceLife` 0 mounts none of it (V1's empty park).
 */

import { Color3, DynamicTexture, Matrix, Mesh, MeshBuilder, Quaternion, StandardMaterial, Vector3, type Scene, type TransformNode } from '@babylonjs/core';
import { mountCrowd, type CrowdHandle } from '@/lib/babylon/visual/crowd/crowdStands';
import type { CrowdVenue } from '@/lib/babylon/visual/crowd/crowdLayout';
import { v1Area, v1Spots } from './hubWorld';
import { FENCE } from './courtsDressing';

export const VENICE_LIFE = 1;
export const GULLS = { desktop: 6, phone: 3 } as const;

/** Pure: a gull's position at time t (s) on its ellipse over the sand and the water's edge west of the courts (`seaX`: the
 *  water's edge); the nearer loops reach over the western courts, so a player sees them pass. */
export function gullAt(i: number, t: number, seaX: number): [number, number, number] {
  const cx = seaX + 10 - (i % 3) * 14, cz = -70 + ((i * 37) % 90) - 45;
  const rx = 26 + (i % 2) * 10, rz = 16 + (i % 3) * 6, w = 0.12 + (i % 4) * 0.02, ph = i * 1.7;
  return [cx + Math.cos(t * w + ph) * rx, 16 + (i % 3) * 3 + Math.sin(t * 0.7 + ph) * 1.2, cz + Math.sin(t * w + ph) * rz];
}

/** Pure: the watchers' crowd venue — a standing line along the run's far (west) fence, looking in across the court at the walk-up
 *  side, and small groups by the other three courts' west fences. Outside the fence, off every path the player walks to a ring. */
export function watchersVenue(): CrowdVenue {
  const spots = v1Spots();
  const run = spots.find((s) => s.id === 'court.run') ?? spots[0];
  const mid: [number, number] = [spots.reduce((a, s) => a + s.at[0], 0) / spots.length, spots.reduce((a, s) => a + s.at[1], 0) / spots.length];
  const stands: CrowdVenue['stands'] = [
    { id: 'venice_run_line', front: [run.at[0] - FENCE.halfW - 1.4, 0, run.at[1]], yaw: Math.PI / 2, width: 20, rows: 1, step: [0.9, 0], posture: 'standing', pitch: 1.1, gaps: 0.2 },
  ];
  for (const s of spots) {
    if (s.id === run.id) continue;
    stands.push({ id: `venice_watch_${s.id}`, front: [s.at[0] - FENCE.halfW - 1.4, 0, s.at[1] + 4], yaw: Math.PI / 2, width: 3.2, rows: 1, step: [0.9, 0], posture: 'standing', pitch: 1.2, gaps: 0.1 });
  }
  return {
    stands,
    focus: [run.at[0], 1.2, run.at[1]],
    // no camera line to keep behind: the hub's camera walks anywhere (a very negative margin admits every seat)
    camera: { at: [run.at[0], 0, run.at[1] + 40], into: [0, -1], margin: -1e4 },
    // the eye in the middle of the four courts: every watcher is within CARD_BEYOND_M of it, so a desktop draws them all as bodies
    // (a card is the cut-out the owner turned down)
    eye: [mid[0], 1.7, mid[1]],
  };
}

export interface HubLife { update(dt: number): void; dispose(): void; gulls: number; watchers: Promise<number> }

export function mountHubLife(scene: Scene, parent: TransformNode, tier: string): HubLife {
  const phone = tier === 'mobile';
  const n = phone ? GULLS.phone : GULLS.desktop;
  const seaX = v1Area().minX;
  // the gull: a painted chevron on a quad, billboarded, thin-instanced
  const tex = new DynamicTexture('venice_gull_tex', 64, scene, false);
  { const c = tex.getContext() as CanvasRenderingContext2D; c.clearRect(0, 0, 64, 64); c.strokeStyle = '#2A2630'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(6, 26); c.quadraticCurveTo(20, 18, 32, 34); c.quadraticCurveTo(44, 18, 58, 26); c.stroke(); tex.hasAlpha = true; tex.update(); }
  const mat = new StandardMaterial('venice_gull_mat', scene);
  mat.emissiveTexture = tex; mat.opacityTexture = tex; mat.emissiveColor = new Color3(1, 1, 1); mat.disableLighting = true; mat.backFaceCulling = false;
  const quad = MeshBuilder.CreatePlane('venice_gulls', { size: 2.2 }, scene);
  quad.parent = parent; quad.material = mat; quad.isPickable = false; quad.billboardMode = Mesh.BILLBOARDMODE_ALL;
  const m = new Matrix(), q = Quaternion.Identity(), one = Vector3.One(), p = new Vector3();
  for (let i = 0; i < n; i++) { const [x, y, z] = gullAt(i, 0, seaX); p.set(x, y, z); Matrix.ComposeToRef(one, q, p, m); quad.thinInstanceAdd(m, i === n - 1); }
  let t = 0;
  // the watchers: desktop and up only (above)
  let crowd: CrowdHandle | null = null;
  if (!phone) crowd = mountCrowd(scene, watchersVenue(), { tier, seed: 23 });
  return {
    gulls: n,
    watchers: crowd ? crowd.ready.then((ok) => (ok ? crowd!.fans : 0)) : Promise.resolve(0),
    update(dt) {
      t += dt;
      for (let i = 0; i < n; i++) { const [x, y, z] = gullAt(i, t, seaX); p.set(x, y, z); Matrix.ComposeToRef(one, q, p, m); quad.thinInstanceSetMatrixAt(i, m, i === n - 1); }
    },
    dispose() { crowd?.dispose(); quad.dispose(); mat.dispose(); tex.dispose(); },
  };
}
