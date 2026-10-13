// STADIUM DRESSING (vis-court, wave 2, 2026-10-13) — the boards, the chair and the posts that make a court a stadium court.
//
// The audit (tennis): "Stadium dressing: umpire chair, net posts, ball-kid figures (reuse roster bodies), sponsor boards
// (signTexture)". The court was blue paint in front of a painted crowd. This adds the court furniture a broadcast always shows:
// a ring of low sponsor boards just outside the playing area (each one a lit panel, court_ad_panel_<n> — deliberately NOT named like
// an LED wall: the foundation's glow haloes those, and a halo over a board this wide whited the sponsors out on the first capture),
// and the umpire's high chair beside the net. The sponsors are the game's own invented names;
// no real brand is painted. Ball kids are a body each, and a roster body is a full skinned character — they are left for wave 3
// (the phone budget has no room for two more).
//
// Everything stands OUTSIDE the cage (when there is one) and outside the crowd's bank. Visual only.

import { Color3, Mesh, MeshBuilder, PBRMaterial, StandardMaterial, Texture } from '@babylonjs/core';
import type { DynamicTexture, Scene } from '@babylonjs/core';
import { makeTexture } from './texture';
import { placeRng } from '../visual/PlacePack';

export const SPONSORS: readonly { text: string; bg: string; fg: string }[] = [
  { text: 'NEXUS ENERGY', bg: '#0b3d91', fg: '#ffffff' }, { text: 'FEL SPORTS', bg: '#d90429', fg: '#ffffff' },
  { text: 'AEROLITE', bg: '#ff9f1c', fg: '#101010' }, { text: 'ORBIT TV', bg: '#6a1b9a', fg: '#ffffff' },
  { text: 'KINETIC', bg: '#0a8f4f', fg: '#ffffff' }, { text: 'VOLT', bg: '#111111', fg: '#ffe600' },
];

export interface BoardSpec { name: string; x: number; z: number; yaw: number; length: number }

/** Pure: the yaw that turns a plane's face (it looks down −z) to look along the ground direction (nx, nz). */
export const faceYaw = (nx: number, nz: number): number => Math.atan2(-nx, -nz);

/** Pure: the boards round a court — two end boards and two side boards, `gap` metres outside `(rx, rz)` (the cage or the lines; a
 *  negative gap stands them just INSIDE it, against the glass, where nothing is between them and the camera). */
export function boardLayout(rx: number, rz: number, gap = 1.0): BoardSpec[] {
  const x = rx + gap, z = rz + gap;
  return [
    { name: 'far', x: 0, z: -z, yaw: faceYaw(0, 1), length: rx * 2 + gap * 2 },
    { name: 'near', x: 0, z: z, yaw: faceYaw(0, -1), length: rx * 2 + gap * 2 },
    { name: 'left', x: -x, z: 0, yaw: faceYaw(1, 0), length: rz * 2 + gap * 2 },
    { name: 'right', x: x, z: 0, yaw: faceYaw(-1, 0), length: rz * 2 + gap * 2 },
  ];
}

/** Pure: how many sponsor panels run along a board of this length (a panel is ~3.2 m). */
export const panelsFor = (length: number): number => Math.max(2, Math.round(length / 3.2));

function paintBoard(g: CanvasRenderingContext2D, W: number, H: number, n: number, seed: number): void {
  const r = placeRng(seed);
  g.fillStyle = '#0c0f16'; g.fillRect(0, 0, W, H);
  const pw = W / n;
  for (let i = 0; i < n; i++) {
    const s = SPONSORS[(i + Math.floor(r() * 3)) % SPONSORS.length];
    g.fillStyle = s.bg; g.fillRect(i * pw + 4, 4, pw - 8, H - 8);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(i * pw + 4, 4, pw - 8, (H - 8) * 0.3);
    g.fillStyle = s.fg; g.font = `900 ${Math.round(H * 0.5)}px system-ui, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(s.text, i * pw + pw / 2, H / 2 + 2, pw - 24);
  }
}

export interface StadiumHandle { readonly meshes: readonly Mesh[]; dispose(): void }

/** Sponsor boards round a court whose outer edge is (rx, rz), and the umpire's chair at (cx, cz). */
export function buildStadiumDressing(scene: Scene, rx: number, rz: number, chair: { x: number; z: number }, opts: { phone?: boolean; gap?: number } = {}): StadiumHandle {
  const made: Mesh[] = [];
  const texes: DynamicTexture[] = [];
  const mats: (StandardMaterial | PBRMaterial)[] = [];
  const specs = boardLayout(rx, rz, opts.gap ?? 1.0);
  for (const b of specs) {
    if (b.name === 'near') continue;   // the end the camera stands behind: a board there is seen from behind, and the camera is in the way of it
    const n = panelsFor(b.length);
    const tex = makeTexture(scene, `court_ad_panel_${b.name}_tex`, 1024, 64, (g) => paintBoard(g, 1024, 64, Math.min(n, 8), b.name.length * 11 + 3));
    if (tex) { tex.uScale = Math.max(1, n / 8); tex.wrapU = Texture.WRAP_ADDRESSMODE; texes.push(tex); }
    const m = new StandardMaterial(`court_ad_panel_${b.name}_m`, scene);
    m.disableLighting = true; m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black(); m.emissiveColor = Color3.White().scale(opts.phone ? 0.95 : 0.9); if (tex) m.emissiveTexture = tex; else m.emissiveColor = Color3.FromHexString('#20344f');
    mats.push(m);
    // a plane's face looks down −z; yaw it so the face looks at the middle of the court
    const p = MeshBuilder.CreatePlane(`court_ad_panel_${b.name}`, { width: b.length, height: 1.15 }, scene);
    p.position.set(b.x, 0.6, b.z); p.rotation.y = b.yaw; p.material = m; p.isPickable = false; p.receiveShadows = false;
    made.push(p);
    // the board's back and top, so the grazing angle sees a box and not a card
    const back = MeshBuilder.CreateBox(`court_ad_back_${b.name}`, { width: b.length, height: 1.2, depth: 0.14 }, scene);
    const off = 0.09, nx = Math.sin(b.yaw), nz = Math.cos(b.yaw);
    back.position.set(b.x + nx * off, 0.6, b.z + nz * off); back.rotation.y = b.yaw;
    const bm = new PBRMaterial(`court_ad_back_${b.name}_m`, scene); bm.albedoColor = Color3.FromHexString('#161a24'); bm.metallic = 0.2; bm.roughness = 0.7; mats.push(bm);
    back.material = bm; back.isPickable = false; made.push(back);
  }
  // the umpire's chair: a platform on four legs, a seat, a back rail and a step ladder (one merged mesh, one draw)
  const parts: Mesh[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx_ = 0): void => { const m = MeshBuilder.CreateBox('c', { width: w, height: h, depth: d }, scene); m.position.set(x, y, z); m.rotation.x = rx_; parts.push(m); };
  for (const lx of [-0.42, 0.42]) for (const lz of [-0.4, 0.4]) box(0.07, 2.2, 0.07, lx, 1.1, lz);     // legs
  box(1.0, 0.07, 1.0, 0, 2.2, 0);                                                                  // platform
  box(0.7, 0.1, 0.6, 0, 2.4, 0);                                                                   // seat
  box(0.7, 0.8, 0.07, 0, 2.8, -0.34);                                                              // back (behind the seat: the sitter faces +z)
  box(0.06, 0.45, 0.9, -0.42, 2.55, 0); box(0.06, 0.45, 0.9, 0.42, 2.55, 0);                      // arms
  box(0.8, 0.05, 0.36, 0, 1.3, 0.82); box(0.8, 0.05, 0.36, 0, 0.55, 0.92);                       // the steps, at the back
  const chairM = new PBRMaterial('court_umpire_chair_m', scene); chairM.albedoColor = Color3.FromHexString('#2f4a6b'); chairM.metallic = 0.3; chairM.roughness = 0.6; mats.push(chairM);
  const chair3 = Mesh.MergeMeshes(parts, true, true);
  if (chair3) { chair3.name = 'court_umpire_chair'; chair3.material = chairM; chair3.position.set(chair.x, 0, chair.z); chair3.rotation.y = chair.x < 0 ? Math.PI / 2 : -Math.PI / 2; chair3.isPickable = false; chair3.receiveShadows = true; made.push(chair3); }
  for (const m of made) m.freezeWorldMatrix();
  return { meshes: made, dispose() { for (const m of made) m.dispose(); for (const m of mats) m.dispose(); for (const t of texes) t.dispose(); } };
}
