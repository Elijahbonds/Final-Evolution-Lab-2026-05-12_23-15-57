// GOAL NET (vis-court, wave 2, 2026-10-13) — the net that takes the ball.
//
// The audit (penalty): "Net bulge on goals: vertex-displaced net mesh plus a ripple". The goal is one Meshy mesh (frame and netting
// together, 49 k vertices, a single material), so its netting cannot be pushed on its own. This is a second, light net — a 24 × 10
// grid of netting laid just inside the goal line — that is invisible until a ball finds it. A strike at (x, y) pushes the sheet
// back toward the stanchions (a Gaussian bulge round the strike, a travelling ripple and a swell that settles); the sheet fades in
// as it moves and out as it settles, so the goal looks like itself the rest of the time. 275 vertices, one mesh, only moved while
// live. Visual only: the ball, the line and the judge are the mode's.

import { Color3, Matrix, MeshBuilder, StandardMaterial, Texture, VertexBuffer } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import { makeTexture } from './texture';

export const NET_LIFE_SEC = 1.9;

/**
 * Pure: how far (m) the net is pushed back at a point `dx` across and `dy` up from where the ball struck, `age` seconds after the
 * strike, for a strike of `strength` 0..1. The bulge is Gaussian round the strike and swells then settles; a ring of ripple runs
 * out from it. Zero outside its life and for no strength.
 */
export function netPush(dx: number, dy: number, age: number, strength: number): number {
  if (age < 0 || age >= NET_LIFE_SEC || strength <= 0) return 0;
  const r2 = dx * dx + dy * dy, r = Math.sqrt(r2), s = Math.min(1, strength);
  const swell = Math.exp(-age / 0.85) * (0.62 + 0.38 * Math.cos(2 * Math.PI * 2.2 * age));
  const bulge = 1.05 * s * Math.exp(-r2 / (2 * 0.95 * 0.95)) * swell;
  const ripple = 0.1 * s * Math.sin(2 * Math.PI * 4.5 * age - 5.2 * r) * Math.exp(-age / 0.55) * Math.exp(-r2 / (2 * 2.2 * 2.2));
  return Math.max(0, bulge + ripple);
}

/** Pure: the sheet's opacity 0..1 at `age`: up in a tenth of a second, down over the last half second. */
export function netAlpha(age: number): number {
  if (age < 0 || age >= NET_LIFE_SEC) return 0;
  return Math.min(1, age / 0.1) * Math.min(1, (NET_LIFE_SEC - age) / 0.5);
}

export interface GoalNetHandle { hit(x: number, y: number, strength?: number): void; update(dt: number): void; readonly live: boolean; dispose(): void }

export function buildGoalNet(scene: Scene, o: { halfW: number; height: number; z: number }): GoalNetHandle {
  const W = o.halfW * 2 - 0.1, H = o.height - 0.1;
  const mesh: Mesh = MeshBuilder.CreateGround('court_goal_net', { width: W, height: H, subdivisionsX: 24, subdivisionsY: 10, updatable: true }, scene);
  mesh.bakeTransformIntoVertices(Matrix.RotationX(Math.PI / 2).multiply(Matrix.Translation(0, H / 2 + 0.05, 0)));   // upright in the XY plane, its foot on the grass
  const base = (mesh.getVerticesData(VertexBuffer.PositionKind) ?? []).slice() as number[];
  mesh.position.set(0, 0, o.z + 0.15);
  const tex = makeTexture(scene, 'court_goal_net_tex', 128, 64, (g) => {
    g.clearRect(0, 0, 128, 64); g.strokeStyle = 'rgba(245,248,250,0.95)'; g.lineWidth = 3; g.beginPath();
    for (let i = 0; i <= 128; i += 16) { g.moveTo(i, 0); g.lineTo(i, 64); }
    for (let j = 0; j <= 64; j += 16) { g.moveTo(0, j); g.lineTo(128, j); }
    g.stroke();
  });
  if (tex) { tex.hasAlpha = true; tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE; tex.uScale = 12; tex.vScale = 5; }
  const mat = new StandardMaterial('court_goal_net_m', scene);
  mat.disableLighting = true; mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black(); mat.emissiveColor = Color3.White().scale(0.85);
  if (tex) { mat.emissiveTexture = tex; mat.opacityTexture = tex; }
  mat.backFaceCulling = false; mat.alpha = 0;
  mesh.material = mat; mesh.isPickable = false; mesh.receiveShadows = false; mesh.isVisible = false; mesh.alwaysSelectAsActiveMesh = true;
  let age = Infinity, hx = 0, hy = 0, strength = 0;
  return {
    hit(x, y, s = 1) { hx = Math.max(-o.halfW, Math.min(o.halfW, x)); hy = Math.max(0, Math.min(o.height, y)); strength = Math.max(0.35, Math.min(1, s)); age = 0; mesh.isVisible = true; },
    update(dt) {
      if (age === Infinity) return;
      age += Math.min(0.1, dt);
      const a = netAlpha(age);
      if (a <= 0) { age = Infinity; mesh.isVisible = false; mat.alpha = 0; mesh.updateVerticesData(VertexBuffer.PositionKind, base); return; }
      mat.alpha = a;
      const pos = base.slice();
      for (let k = 0; k < pos.length; k += 3) pos[k + 2] += netPush(pos[k] - hx, pos[k + 1] - hy, age, strength);
      mesh.updateVerticesData(VertexBuffer.PositionKind, pos);
    },
    get live() { return age !== Infinity; },
    dispose() { mesh.dispose(); mat.dispose(); tex?.dispose(); },
  };
}
