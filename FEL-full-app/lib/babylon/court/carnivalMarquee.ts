// THE CARNIVAL MARQUEE (vis-hoops-court, 2026-10-14) — Part B carnival: "a 3D scoreboard marquee with chaser lights for the
// between-event standings".
//
// A sign over the back of the plaza, behind the podium, turned to the camera: a dark board in a ring of bulbs that chase round it.
// It says GAME NIGHT while the night is being picked, the event's name on its card, and the standings between events — who is ahead
// and by how much, as the night's own board has them. It is a picture of numbers the mode already computed: the mode hands it rows,
// it paints them, it never adds or compares a score.
//
// The chasers are two sets of bulbs (every other one), each ONE merged mesh and its own material: the sets swap brightness a few
// times a second. Named `bb_wheel_marquee_*` (the glow layer's own name for a chasing marquee) on `lantern_marq_*` materials, so the
// halo is drawn on desktop; on a phone the bulbs are a plain emissive. The sign face is an emissive texture over a black colour (a
// painted sign: `visual/unlit`'s rule) and is not named for the glow (a halo over a screen this size whites the text out).

import { Color3, Mesh, MeshBuilder, PBRMaterial, StandardMaterial } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { makeTexture, repaint } from './texture';
import { unlitDiffuse } from '../visual/unlit';

export interface MarqueeRow { name: string; score: number | string; line?: string }
export interface MarqueeState { title: string; rows: readonly MarqueeRow[]; /** a line under the rows (the leader, the next event) */ footer?: string }

export const MARQUEE_W = 1024, MARQUEE_H = 384;
/** The chasers swap this many times a second. */
export const CHASE_HZ = 3.2;
/** The sign's world size, metres (a 10 × 3.75 board, the texture's own aspect). */
export const MARQUEE_SIZE = { w: 10, h: 3.75 } as const;

/** Pure: which of the two chaser sets is lit at `t` seconds. */
export function chasePhase(t: number): 0 | 1 { return Math.floor(t * CHASE_HZ) % 2 === 0 ? 0 : 1; }

/** Pure: the points around the sign's border where bulbs sit, `n` of them, starting at the top-left and going clockwise. */
export function borderPoints(w: number, h: number, n: number): { x: number; y: number }[] {
  const per = 2 * (w + h), out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    let d = (i / n) * per;
    if (d < w) out.push({ x: -w / 2 + d, y: h / 2 });
    else if ((d -= w) < h) out.push({ x: w / 2, y: h / 2 - d });
    else if ((d -= h) < w) out.push({ x: w / 2 - d, y: -h / 2 });
    else { d -= w; out.push({ x: -w / 2, y: -h / 2 + d }); }
  }
  return out;
}

/** Pure: the text lines of a state, in the order they are drawn (so a test can say what the sign says). */
export function marqueeLines(s: MarqueeState): string[] {
  return [s.title, ...s.rows.slice(0, 2).map((r) => `${r.name}  ${r.score}`), ...(s.footer ? [s.footer] : [])];
}

export function paintMarquee(g: CanvasRenderingContext2D, W: number, H: number, s: MarqueeState): void {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#5b2a8a'); grad.addColorStop(1, '#241048');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffd166'; g.font = `900 ${s.rows.length ? 78 : 112}px system-ui, "Arial Black", sans-serif`;
  g.fillText(s.title, W / 2, s.rows.length ? H * 0.2 : H * 0.42, W - 80);
  const rows = s.rows.slice(0, 2);
  rows.forEach((r, i) => {
    const y = H * (0.48 + i * 0.21), lead = i === 0 ? '#ffffff' : '#bfb3d9';
    g.textAlign = 'left'; g.fillStyle = lead; g.font = '900 64px system-ui, "Arial Black", sans-serif'; g.fillText(r.name, 90, y, W * 0.5);
    g.textAlign = 'right'; g.fillStyle = i === 0 ? '#ff6fd8' : '#8fa0e0'; g.fillText(String(r.score), W - 90, y);
  });
  if (s.footer) { g.textAlign = 'center'; g.fillStyle = '#8fe0c8'; g.font = '800 54px system-ui, Arial, sans-serif'; g.fillText(s.footer, W / 2, s.rows.length ? H * 0.92 : H * 0.8, W - 100); }
}

export interface MarqueeHandle {
  show(s: MarqueeState): void;
  /** Advance the chasers by `dt` seconds (the mode's own clock: they stop with a pause). */
  update(dt: number): void;
  readonly meshes: readonly AbstractMesh[];
  dispose(): void;
}

export function mountMarquee(scene: Scene, o: { at: { x: number; y: number; z: number }; /** 0 faces −z, toward the hub's camera */ yaw: number; tier: string; /** reduced motion: the chasers hold still (a light swapping three times a second is a flash) */ calm?: () => boolean }): MarqueeHandle {
  const made: AbstractMesh[] = [], mats: { dispose(): void }[] = [];
  const tex = makeTexture(scene, 'carn_marquee_tex', MARQUEE_W, MARQUEE_H);
  const faceM = new StandardMaterial('carn_marquee_face_m', scene);
  faceM.disableLighting = true; faceM.specularColor = Color3.Black(); faceM.diffuseColor = unlitDiffuse();
  if (tex) { faceM.emissiveTexture = tex; faceM.emissiveColor = Color3.Black(); } else faceM.emissiveColor = new Color3(0.2, 0.1, 0.3);
  mats.push(faceM);
  const { w, h } = MARQUEE_SIZE;
  const face = MeshBuilder.CreatePlane('carn_marquee_face', { width: w, height: h }, scene);
  face.position.set(o.at.x, o.at.y, o.at.z); face.rotation.y = o.yaw; face.material = faceM; face.isPickable = false; made.push(face);
  const frameM = new PBRMaterial('carn_marquee_frame_m', scene); frameM.albedoColor = Color3.FromHexString('#1a1020'); frameM.metallic = 0.2; frameM.roughness = 0.7; mats.push(frameM);
  const frame = MeshBuilder.CreateBox('carn_marquee_frame', { width: w + 0.5, height: h + 0.5, depth: 0.3 }, scene);
  // the frame sits a hand behind the face (a plane at yaw 0 faces −z, so behind it is +z)
  frame.position.set(o.at.x + Math.sin(o.yaw) * 0.2, o.at.y, o.at.z + Math.cos(o.yaw) * 0.2); frame.rotation.y = o.yaw; frame.material = frameM; frame.isPickable = false; made.push(frame);

  const phone = o.tier === 'mobile';
  const pts = borderPoints(w - 0.1, h - 0.1, phone ? 28 : 44);
  const sets: Mesh[] = [], setMats: StandardMaterial[] = [];
  for (const k of [0, 1] as const) {
    const parts = pts.filter((_, i) => i % 2 === k).map((p, i) => {
      const s = MeshBuilder.CreateSphere(`carn_marq_bulb_${k}_p${i}`, { diameter: 0.2, segments: 5 }, scene);
      // the sign's x runs along its width: (cos yaw, 0, −sin yaw) in the world (yaw 0 faces −z, toward the hub camera)
      const c = Math.cos(o.yaw), sn = Math.sin(o.yaw);
      s.position.set(o.at.x + p.x * c, o.at.y + p.y, o.at.z - p.x * sn);
      return s;
    });
    const m = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
    if (!m) continue;
    m.name = `bb_wheel_marquee_${k ? 'b' : 'a'}`;
    const mat = new StandardMaterial(`lantern_marq_${k ? 'b' : 'a'}`, scene); mat.diffuseColor = unlitDiffuse(); mat.specularColor = Color3.Black(); mat.disableLighting = true;
    mat.emissiveColor = Color3.FromHexString(k ? '#ff6fd8' : '#ffd166'); mats.push(mat);
    m.material = mat; m.isPickable = false; made.push(m); sets.push(m); setMats.push(mat);
  }
  const hot = [Color3.FromHexString('#ffd166').scale(1.5), Color3.FromHexString('#ff6fd8').scale(1.5)];
  const dim = [Color3.FromHexString('#ffd166').scale(0.18), Color3.FromHexString('#ff6fd8').scale(0.18)];
  let clock = 0, lit = -1;
  const apply = (): void => {
    const p = chasePhase(clock);
    if (p === lit) return;
    lit = p;
    setMats.forEach((m, k) => m.emissiveColor.copyFrom(k === p ? hot[k] : dim[k]));
  };
  apply();
  const draw = (s: MarqueeState): void => repaint(tex, (g) => paintMarquee(g, MARQUEE_W, MARQUEE_H, s));
  draw({ title: 'GAME NIGHT', rows: [] });
  return {
    show: draw,
    update(dt) { if (o.calm?.()) { clock = 0; apply(); return; } clock += dt; apply(); },
    meshes: made,
    dispose() { for (const m of made) if (!m.isDisposed()) m.dispose(false, true); for (const m of mats) m.dispose(); tex?.dispose(); },
  };
}
