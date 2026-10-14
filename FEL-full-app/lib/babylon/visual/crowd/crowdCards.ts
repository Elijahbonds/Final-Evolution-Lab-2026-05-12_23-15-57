// crowdCards — the far rows as card impostors (w3-crowds, A9.9; the dunk's crowd-card idea, made from the crowd itself).
//
// A fan at 60 m is a few dozen pixels: a skinned, baked-animation body there is vertex work nobody sees. A CARD is a quad
// with a picture of that body, facing the play camera's usual position. Four pictures per body — seated, seated with both
// arms up, standing, standing with arms up — so a card can cheer, groan (it drops a little), stand for the finish and sit
// back down on the same director (crowdReact) as the real fans, swapping its picture and bobbing instead of bending.
//
// Two atlases, one card system:
//   · desktop / high — `snapshotAtlas`: the five baked bodies rendered ONCE into a 640×256 target in their four poses, under
//     the scene's own lights (an isolated ortho camera far below the venue; the card material is unlit, so the light is
//     not counted twice). The card is the 3D crowd's own picture.
//   · phone — `paintAtlas`: no crowd GLB is ever loaded on a phone (its texture set alone is 21 MB to decode); people are
//     painted on a 256×128 canvas instead — shirt, trousers, skin, hair, the same four poses — and the material is LIT, so a
//     night venue darkens them like everything else.
// Cells are 1.2 m × 2.4 m of world at the body's true scale, feet on the cell's bottom edge, so a card is that quad.
//
// One quad mesh per (picture, pose) holds that picture's cards as thin instances; a card moves between its picture's pose
// meshes by writing its matrix into one and a zero matrix into the others. A pose mesh with no card in it is disabled (no
// draw): an idle seated crowd of five pictures is five draws.

import { Color3, Color4, DynamicTexture, FreeCamera, Matrix, Mesh, PBRMaterial, Quaternion, RenderTargetTexture, Vector3, VertexData } from '@babylonjs/core';
import type { BaseTexture, Scene } from '@babylonjs/core';
import type { CrowdBake } from './crowdBake';
import { CROWD_FPS, holdSettings } from './crowdVat';

export const CARD_W = 1.2, CARD_H = 2.4;
export const CARD_POSES = 4;   // 0 seated, 1 seated arms up, 2 standing, 3 standing arms up
export type CardPose = 0 | 1 | 2 | 3;

export interface CardAtlas {
  texture: BaseTexture;
  /** How many pictures (bodies or painted people). */
  variants: number;
  /** uv rect of a (variant, pose) cell: [u0, v0, u1, v1]. */
  cell(variant: number, pose: CardPose): [number, number, number, number];
  /** True: the picture already carries the scene's light (draw unlit). */
  prelit: boolean;
  dispose(): void;
}

const COLS = 10, ROWS = 2;   // the snapshot atlas: 5 bodies × 4 poses in two rows of ten 64 × 128 cells

/** Render the five baked bodies into an atlas, once. Resolves after the target has rendered. */
export function snapshotAtlas(scene: Scene, bake: CrowdBake): Promise<CardAtlas> {
  const W = COLS * 64, H = ROWS * 128;
  const rtt = new RenderTargetTexture('crowd_card_atlas', { width: W, height: H }, scene, true);
  rtt.clearColor = new Color4(0, 0, 0, 0);
  rtt.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  const O = new Vector3(0, -600, 0);
  const cam = new FreeCamera('crowd_card_cam', O.add(new Vector3(0, (ROWS * CARD_H) / 2, 40)), scene, false);
  cam.setTarget(O.add(new Vector3(0, (ROWS * CARD_H) / 2, 0)));
  cam.mode = FreeCamera.ORTHOGRAPHIC_CAMERA;
  cam.orthoLeft = -(COLS * CARD_W) / 2; cam.orthoRight = (COLS * CARD_W) / 2;
  cam.orthoTop = (ROWS * CARD_H) / 2; cam.orthoBottom = -(ROWS * CARD_H) / 2;
  cam.minZ = 1; cam.maxZ = 100;
  rtt.activeCamera = cam;   // the target draws only its own render list, 600 m under the venue where the play camera never looks
  const pose = (): number[] => {
    const r = bake.ranges;
    return [r.sit_idle.start + 1, r.sit_cheer.start + 1 + Math.round(0.32 * CROWD_FPS), r.stand_idle.start + 1, r.stand_cheer.start + 1 + Math.round(0.33 * CROWD_FPS)];
  };
  const clones: Mesh[] = [];
  bake.bodies.forEach((body, b) => {
    const m = body.mesh.clone(`crowd_card_src_${b}`, null, true) as Mesh;
    m.makeGeometryUnique();   // see crowdStands: thin-instance extra buffers live on the geometry
    m.parent = null;
    m.setEnabled(true);
    m.receiveShadows = false;
    m.bakedVertexAnimationManager = body.manager;
    m.freezeWorldMatrix(body.w0);
    const mats = new Float32Array(16 * CARD_POSES), set = new Float32Array(4 * CARD_POSES);
    const rows = pose();
    for (let p = 0; p < CARD_POSES; p++) {
      const idx = b * CARD_POSES + p, col = idx % COLS, row = Math.floor(idx / COLS);
      // the camera looks down −z, so its screen-left is +x: column 0 sits at +x
      const at = new Vector3(O.x + (COLS * CARD_W) / 2 - (col + 0.5) * CARD_W, O.y + (ROWS - 1 - row) * CARD_H + 0.04, O.z);
      const place = Matrix.Compose(Vector3.One(), Quaternion.Identity(), at);
      body.w0.multiply(place).multiply(body.w0inv).copyToArray(mats, p * 16);
      set.set(holdSettings(rows[p]), p * 4);
    }
    m.thinInstanceSetBuffer('matrix', mats, 16, true);
    m.thinInstanceSetBuffer('bakedVertexAnimationSettingsInstanced', set, 4, true);
    clones.push(m);
  });
  rtt.renderList = clones;
  scene.customRenderTargets.push(rtt);
  const cell = (v: number, p: CardPose): [number, number, number, number] => {
    const idx = v * CARD_POSES + p, col = idx % COLS, row = Math.floor(idx / COLS);
    // a render target's v runs bottom-up: row 0 (the top row on screen) is the upper half
    return [col / COLS, 1 - (row + 1) / ROWS, (col + 1) / COLS, 1 - row / ROWS];
  };
  return new Promise((resolve) => {
    rtt.onAfterRenderObservable.addOnce(() => {
      // the next frame: the target is drawn (and its mips made) before the sources go
      scene.onAfterRenderObservable.addOnce(() => {
        const i = scene.customRenderTargets.indexOf(rtt);
        if (i >= 0) scene.customRenderTargets.splice(i, 1);
        for (const m of clones) m.dispose(false, false);
        cam.dispose();
      });
      resolve({ texture: rtt, variants: bake.bodies.length, cell, prelit: true, dispose: () => rtt.dispose() });
    });
  });
}

/** Deterministic 0..1. */
function r01(seed: number, k: number): number {
  let t = Math.imul(seed ^ 0x9e3779b9, 2654435761) ^ Math.imul(k + 1, 1597334677);
  t = Math.imul(t ^ (t >>> 15), 2246822519);
  return ((t ^ (t >>> 13)) >>> 0) / 4294967296;
}

const SHIRTS = ['#d23b3b', '#2f6fd6', '#f2f2f2', '#1d8a4a', '#f5c518', '#7a3fc0', '#ff7a1a', '#20232b', '#3ab0c8', '#e45d9b'];
const TROUSERS = ['#2b3346', '#3b3f45', '#4a5c7a', '#6b5a44', '#1f2226'];
const SKIN = ['#f1c7a5', '#d9a07a', '#b8794f', '#8c5a3a', '#5e3b26'];
const HAIR = ['#1b130e', '#3a2414', '#6b4320', '#c9a15a', '#2a2a2a'];

/** Paint `variants` people in the four poses (phones). Cells of CELL_PX × 2·CELL_PX = 1.2 m × 2.4 m: 256 × 128 for four
 *  people (170 KB with mips — a phone's texture budget is the tightest row in mobileBudget.json). */
export const PAINT_CELL_PX = 32;
export function paintAtlas(scene: Scene, variants = 4, seed = 5): CardAtlas {
  const C = PAINT_CELL_PX, k = C / 64;
  const cols = 8, rows = Math.ceil((variants * CARD_POSES) / cols);
  const W = cols * C, H = rows * C * 2;
  const tex = new DynamicTexture('crowd_card_paint', { width: W, height: H }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.clearRect(0, 0, W, H);
  const PX = C / CARD_W;   // pixels a metre
  for (let v = 0; v < variants; v++) {
    const shirt = SHIRTS[Math.floor(r01(seed, v * 5) * SHIRTS.length)], legs = TROUSERS[Math.floor(r01(seed, v * 5 + 1) * TROUSERS.length)];
    const skin = SKIN[Math.floor(r01(seed, v * 5 + 2) * SKIN.length)], hair = HAIR[Math.floor(r01(seed, v * 5 + 3) * HAIR.length)];
    for (let p = 0; p < CARD_POSES; p++) {
      const idx = v * CARD_POSES + p, cx = (idx % cols) * C + C / 2, base = Math.floor(idx / cols) * C * 2 + C * 2 - 1;
      const y = (m: number): number => base - m * PX;   // metres above the feet → canvas y
      const standing = p >= 2, up = p % 2 === 1;
      // "up" is the cheer's picture: these bodies cheer with their legs and spine (crowdClips), so it is up off the seat or
      // up on the toes, leaning back — the same reach the 3D crowd has
      const lift = up ? (standing ? 0.12 : 0.22) : 0;
      const hip = (standing ? 0.92 : 0.5) + lift, sh = (standing ? 1.42 : 0.98) + lift, head = (standing ? 1.6 : 1.16) + lift;
      g.lineCap = 'round';
      g.fillStyle = legs;
      if (standing) { g.fillRect(cx - 9 * k, y(hip), 8 * k, hip * PX); g.fillRect(cx + 1 * k, y(hip), 8 * k, hip * PX); }
      else { g.fillRect(cx - 10 * k, y(0.5), 9 * k, 0.5 * PX); g.fillRect(cx + 1 * k, y(0.5), 9 * k, 0.5 * PX); g.fillRect(cx - 11 * k, y(0.56 + lift), 22 * k, 0.1 * PX); }
      g.fillStyle = shirt;
      roundRect(g, cx - 12 * k, y(sh + 0.02), 24 * k, (sh + 0.02 - hip + 0.04) * PX, 5 * k);
      g.strokeStyle = shirt; g.lineWidth = 6 * k;
      const arm = (s: number): void => {
        g.beginPath(); g.moveTo(cx + s * 10 * k, y(sh - 0.04));
        g.lineTo(cx + s * 14 * k, y(sh - 0.3)); g.lineTo(cx + s * (standing ? 14 : 9) * k, y(standing ? sh - 0.58 : hip + 0.1));
        g.stroke();
        g.fillStyle = skin; g.beginPath();
        g.arc(cx + s * (standing ? 14 : 9) * k, y(standing ? sh - 0.6 : hip + 0.08), 3.2 * k, 0, Math.PI * 2);
        g.fill();
      };
      arm(-1); arm(1);
      const tilt = up ? -2 * k : 0;   // the head thrown back
      g.fillStyle = skin; g.beginPath(); g.arc(cx, y(head) + tilt, 6.5 * k, 0, Math.PI * 2); g.fill();
      g.fillStyle = hair; g.beginPath(); g.arc(cx, y(head) - 1.5 * k + tilt, 6.6 * k, Math.PI, Math.PI * 2); g.fill();
    }
  }
  tex.hasAlpha = true;
  tex.update(true);
  const cell = (v: number, p: CardPose): [number, number, number, number] => {
    const idx = (v % variants) * CARD_POSES + p, col = idx % cols, row = Math.floor(idx / cols);
    return [col / cols, 1 - (row + 1) / rows, (col + 1) / cols, 1 - row / rows];
  };
  return { texture: tex, variants, cell, prelit: false, dispose: () => tex.dispose() };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath(); g.fill();
}

/** A 1 × 1 quad, feet on y = 0, its face toward +z (the card is turned to face the eye), uvs on one atlas cell. */
export function cardQuad(scene: Scene, name: string, uv: [number, number, number, number]): Mesh {
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = [0.5, 0, 0, -0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0];
  vd.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const [u0, v0, u1, v1] = uv;
  // seen from +z (looking down −z) screen-right is −x: the cell's left edge goes on +x, as the snapshot camera saw it
  vd.uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
  vd.indices = [0, 1, 2, 0, 2, 3];
  vd.applyToMesh(m);
  return m;
}

export function cardMaterial(scene: Scene, atlas: CardAtlas): PBRMaterial {
  const m = new PBRMaterial('crowd_card_mat', scene);
  m.albedoTexture = atlas.texture as never;
  m.albedoColor = Color3.White();
  m.useAlphaFromAlbedoTexture = true;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
  m.alphaCutOff = 0.4;
  m.backFaceCulling = false;
  m.metallic = 0; m.roughness = 1;
  m.unlit = atlas.prelit;
  return m;
}
