// GOLF DRESSING (vis-court, wave 2, 2026-10-13) — the small furniture that makes a hole read as a hole.
//
// The audit (golf): "A flag-cloth wave, a cup with a lip, and a putting grid/slope overlay on the green", "tee box markers,
// yardage signs". Four pieces, each one mesh or two:
//   FlagCloth  the pin's flag as cloth: a 6 × 2 grid that ripples (pinned at the pole, free at the tip) instead of a stiff box.
//              The mode still turns and droops it with the wind exactly as before (the same mesh, the same rotations); only
//              the surface moves.
//   PuttGrid   a faint grid and three distance rings round the cup that wake when the player is putting and sleep otherwise —
//              the read a putting broadcast draws. NOT a slope: the green is a flat disc whose break the mode computes from the
//              ball's offset, so no slope is drawn that the game does not play.
//   TeeMarkers two tee blocks on the box.
//   TeeSign    a yardage plate beside the tee: "HOLE 3 · PAR 4 · 31 m".
// Visual only; the mode feeds them positions and numbers it already has.

import { Color3, Matrix, Mesh, MeshBuilder, PBRMaterial, StandardMaterial, VertexBuffer } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { makeTexture, repaint } from './texture';
import { flagWave } from './BeachDressing';

// ── the flag ────────────────────────────────────────────────────────────────────────────────────────────────
export interface ClothHandle { readonly mesh: Mesh; update(t: number): void; dispose(): void }

/** A vertical cloth `w × h`, its pole edge on local x = 0, lying in the XY plane (normal ±z); `cols × rows` cells. */
export function makeCloth(scene: Scene, name: string, w: number, h: number, cols: number, rows: number, amp = 0.09): ClothHandle {
  const mesh = MeshBuilder.CreateGround(name, { width: w, height: h, subdivisionsX: cols, subdivisionsY: rows, updatable: true }, scene);
  mesh.bakeTransformIntoVertices(Matrix.RotationX(Math.PI / 2).multiply(Matrix.Translation(w / 2, 0, 0)));
  const base = (mesh.getVerticesData(VertexBuffer.PositionKind) ?? []).slice() as number[];
  mesh.alwaysSelectAsActiveMesh = true;
  return {
    mesh,
    update(t) {
      const pos = base.slice();
      for (let k = 0; k < pos.length; k += 3) pos[k + 2] += flagWave(t, pos[k] / w, 0.5 + pos[k + 1] / h, amp);
      mesh.updateVerticesData(VertexBuffer.PositionKind, pos);
    },
    dispose() { mesh.dispose(); },
  };
}

// ── the putting grid ───────────────────────────────────────────────────────────────────────────────────────
/** Pure: the radii (m) of the distance rings drawn round the cup, for a green of radius `r`. */
export function puttRings(r: number): number[] { return [1, 2, 3].filter((m) => m < r); }

/** Pure: the grid's strength 0..1 moving toward `on`, at `rate` per second. */
export function gridStep(k: number, on: boolean, dt: number, rate = 3): number {
  const next = k + ((on ? 1 : 0) - k) * Math.min(1, dt * rate);
  return next < 0.01 ? 0 : next > 0.99 ? 1 : next;
}

export interface PuttGridHandle { at(x: number, z: number): void; drive(dt: number, on: boolean): void; readonly strength: number; dispose(): void }

export function mountPuttGrid(scene: Scene, radius = 6): PuttGridHandle {
  const S = 512;
  const tex = makeTexture(scene, 'fel_decal_puttgrid_tex', S, S, (g) => {
    g.clearRect(0, 0, S, S);
    const px = S / (radius * 2);
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    for (let m = -radius; m <= radius; m += 1) { const p = (m + radius) * px; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p); g.lineTo(S, p); g.stroke(); }
    g.strokeStyle = 'rgba(255,226,140,0.95)'; g.lineWidth = 4;
    for (const m of puttRings(radius)) { g.beginPath(); g.arc(S / 2, S / 2, m * px, 0, Math.PI * 2); g.stroke(); }
    // the disc's edge fades out so the grid does not end in a hard line
    g.globalCompositeOperation = 'destination-in';
    const f = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
    f.addColorStop(0, 'rgba(0,0,0,1)'); f.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = f; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over';
  });
  if (tex) tex.hasAlpha = true;
  const mat = new StandardMaterial('fel_decal_puttgrid_m', scene);
  mat.disableLighting = true; mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black(); mat.emissiveColor = Color3.White();
  if (tex) { mat.emissiveTexture = tex; mat.opacityTexture = tex; }
  mat.alpha = 0; mat.zOffset = -2; mat.backFaceCulling = false;
  const mesh = MeshBuilder.CreateGround('fel_decal_puttgrid', { width: radius * 2, height: radius * 2 }, scene);
  mesh.material = mat; mesh.isPickable = false; mesh.receiveShadows = false; mesh.isVisible = false; mesh.position.y = 0.045;
  let k = 0;
  return {
    at(x, z) { mesh.position.x = x; mesh.position.z = z; },
    drive(dt, on) { k = gridStep(k, on, dt); mat.alpha = 0.55 * k; mesh.isVisible = k > 0; },
    get strength() { return k; },
    dispose() { mesh.dispose(); mat.dispose(); tex?.dispose(); },
  };
}

// ── the tee ────────────────────────────────────────────────────────────────────────────────────────────────
/** Pure: the yardage plate's lines. Metres, because the game's numbers are metres. */
export function holeSignLines(hole: number, holes: number, par: number, m: number): [string, string] {
  return [`HOLE ${hole} · PAR ${par}`, `${Math.round(m)} m  ·  ${hole}/${holes}`];
}

export interface TeeHandle { setHole(hole: number, holes: number, par: number, m: number): void; dispose(): void }

export function buildTee(scene: Scene, tee: { x: number; z: number }): TeeHandle {
  const made: Mesh[] = [];
  const block = new PBRMaterial('court_tee_block_m', scene);
  block.albedoColor = Color3.FromHexString('#d62828'); block.emissiveColor = Color3.FromHexString('#d62828').scale(0.25); block.metallic = 0; block.roughness = 0.5;
  for (const sx of [-1, 1]) {   // the two tee markers: a small cone each, red, either side of the box
    const b = MeshBuilder.CreateCylinder('court_tee_block', { diameterTop: 0.03, diameterBottom: 0.13, height: 0.2, tessellation: 10 }, scene);
    b.position.set(tee.x + sx * 1.5, 0.1, tee.z + 0.1); b.material = block; b.isPickable = false; made.push(b);
  }
  const W = 512, H = 192;
  const tex = makeTexture(scene, 'court_tee_sign_tex', W, H);
  const mat = new StandardMaterial('court_tee_sign_m', scene);
  mat.disableLighting = true; mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black(); mat.emissiveColor = Color3.White().scale(0.82); if (tex) mat.emissiveTexture = tex;
  const plate = MeshBuilder.CreatePlane('court_tee_sign', { width: 1.5, height: 1.5 * H / W }, scene);
  plate.position.set(tee.x - 3.4, 1.15, tee.z + 1.2); plate.material = mat; plate.isPickable = false; made.push(plate);
  const post = MeshBuilder.CreateCylinder('court_tee_sign_post', { diameter: 0.07, height: 1.0, tessellation: 6 }, scene);
  post.position.set(plate.position.x, 0.5, plate.position.z + 0.04); const pm = new PBRMaterial('court_tee_post_m', scene); pm.albedoColor = Color3.FromHexString('#5a4630'); pm.roughness = 0.9; pm.metallic = 0; post.material = pm; post.isPickable = false; made.push(post);
  return {
    setHole(hole, holes, par, m) {
      const [a, b] = holeSignLines(hole, holes, par, m);
      repaint(tex, (g) => {
        g.fillStyle = '#12301d'; g.fillRect(0, 0, W, H);
        g.strokeStyle = '#f2d57a'; g.lineWidth = 8; g.strokeRect(10, 10, W - 20, H - 20);
        g.fillStyle = '#fff6dc'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '900 64px system-ui, "Arial Black", sans-serif'; g.fillText(a, W / 2, H * 0.36, W - 60);
        g.font = '800 46px system-ui, Arial, sans-serif'; g.fillStyle = '#f2d57a'; g.fillText(b, W / 2, H * 0.7, W - 60);
      });
    },
    dispose() { for (const m of made) m.dispose(); block.dispose(); mat.dispose(); pm.dispose(); tex?.dispose(); },
  };
}
