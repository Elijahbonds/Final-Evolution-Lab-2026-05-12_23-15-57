// SPRINT DRESSING (vis-race, visual wave 2, 2026-10-13) — the 100 m straight gets a start line and a finish.
//
// Part B, sprint: "starting blocks, gun smoke, a starter figure · lane numbers, distance boards, a finish gantry with an LED
// timer · floodlight towers for Night Meet". Before: a tartan straight, nine lane ticks and a finish box. The lane numbers
// are already painted on the track (VenueKit.paintTrack); this adds what stands ON it and beside it:
//   · starting blocks behind both runners' heels (two merged meshes, two draws);
//   · a starter in white on the track's edge with his arm up, and the gun's smoke and flash at GO (EffectsKit bursts);
//   · distance boards at 25 / 50 / 75 m on both sides, turned toward the runner coming up behind them (one atlas, one draw);
//   · a finish gantry over the tape with a timer that counts the race clock (a DynamicTexture repainted at 10 Hz at most);
//   · at Night Meet (a night or dusk mood), floodlight towers along the straight: `flood_*` heads the fixture lights find.
// The small things are named `__…` (LightRig never lists them as shadow casters: each caster is a draw per cascade on desktop);
// the starter, the gantry and the posts of the towers that matter to the picture still throw their shadows.
// Nothing here is collision, scoring or timing: it is scenery that reads the clock the core already keeps.
//
// Every material is PBR (VenueKit.paint) for the reason trackside.ts gives; the timer and the boards are lit by their own
// emissive texture. The timer is deliberately NOT named like an LED wall: the glow's halo whites out small digits.

import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, TransformNode, VertexBuffer, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { EffectsKit } from '../visual/EffectsKit';

/** Distances, metres from the start line, where a board stands (both sides). */
export function boardMarks(raceDist: number): number[] { return [0.25, 0.5, 0.75].map((f) => Math.round(raceDist * f)); }

/** Pure: the timer's digits for a race clock in seconds ("07.42"); null = the clock is not running yet. */
export function timerText(clockS: number | null): string {
  const s = Math.max(0, Math.min(99.99, clockS ?? 0));
  return `${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

/** Pure: do the floodlight towers stand? Night Meet (and any dusk) only. */
export function floodsFor(mood: string | null | undefined): boolean { return mood === 'nightGame' || mood === 'dusk'; }

/** Pure: where the floodlight towers stand along a straight of `raceDist` — three a side, outside the stands' rail. */
export function towerPlan(raceDist: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const f of [0.1, 0.5, 0.9]) for (const x of [-13, 13]) out.push({ x, z: -Math.round(raceDist * f) });
  return out;
}

export interface SprintDressingHandle {
  /** The race clock for the finish gantry's timer (seconds), or null before the gun. Repaints at most 10×/s, and only on a change;
   *  `final` (the tape) paints the last digits at once, whatever the gate says. */
  setClock(clockS: number | null, final?: boolean): void;
  /** The gun: a flash and a puff at the starter's raised hand. */
  fireGun(): void;
  /** The starter's gun hand in the world (probes and the smoke read it). */
  readonly gunTip: Vector3;
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

const TIMER_W = 512, TIMER_H = 128;
/** The timer's digits are repainted (a canvas upload) at most this often. */
export const TIMER_REPAINT_MS = 100;

function paintTimer(tex: DynamicTexture, text: string): void {
  const g = tex.getContext() as unknown as CanvasRenderingContext2D | undefined;
  if (!g) return;   // a canvas-less runtime (a headless test): the digits stay unpainted
  g.fillStyle = '#04070d'; g.fillRect(0, 0, TIMER_W, TIMER_H);
  g.fillStyle = '#1b2433'; g.fillRect(0, 0, TIMER_W, 10); g.fillRect(0, TIMER_H - 10, TIMER_W, 10);
  g.fillStyle = '#ffb703'; g.font = '800 96px "Courier New", ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, TIMER_W / 2 - 20, TIMER_H / 2 + 4);
  g.fillStyle = '#7dd3fc'; g.font = '700 34px system-ui, Arial, sans-serif'; g.textAlign = 'right';
  g.fillText('s', TIMER_W - 28, TIMER_H / 2 + 22);
  tex.update();
}

function paintBoards(tex: DynamicTexture, labels: readonly string[]): void {
  const g = tex.getContext() as unknown as CanvasRenderingContext2D | undefined;
  if (!g) return;
  const cw = tex.getSize().width / labels.length, h = tex.getSize().height;
  labels.forEach((label, i) => {
    g.fillStyle = '#f4f1de'; g.fillRect(i * cw, 0, cw, h);
    g.fillStyle = '#c1121f'; g.fillRect(i * cw, 0, cw, h * 0.16); g.fillRect(i * cw, h * 0.84, cw, h * 0.16);
    g.fillStyle = '#111827'; g.font = `900 ${Math.round(h * 0.52)}px system-ui, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, i * cw + cw / 2, h * 0.52, cw * 0.9);
  });
  tex.update();
}

/** Remap a plane's UVs to the i-th of n equal cells across an atlas. */
function toCell(m: Mesh, i: number, n: number): void {
  const uv = m.getVerticesData(VertexBuffer.UVKind);
  if (!uv) return;
  const out = Array.from(uv);
  for (let k = 0; k < out.length; k += 2) out[k] = (i + out[k]) / n;
  m.setVerticesData(VertexBuffer.UVKind, out);
}

/** Merge a list of meshes into one that takes `material`; the sources are consumed. Null if there is nothing to merge. */
function merged(name: string, list: Mesh[], material: PBRMaterial, scene: Scene): Mesh | null {
  if (!list.length) return null;
  const m = Mesh.MergeMeshes(list, true, true, new Mesh(name, scene));
  if (!m) return null;
  m.material = material; m.isPickable = false;
  return m;
}

export function buildSprintDressing(scene: Scene, raceDist: number, opts: { laneX: readonly number[]; mood?: string | null }): SprintDressingHandle {
  const meshes: Mesh[] = [];
  const mats: PBRMaterial[] = [];
  const textures: DynamicTexture[] = [];
  const nodes: TransformNode[] = [];
  const keep = (m: Mesh | null): Mesh | null => { if (m) meshes.push(m); return m; };
  const paint = (name: string, hex: string, emissive = 0.06, rough = 0.8): PBRMaterial => { const m = VenueKit.paint(scene, name, hex, emissive, rough); m.environmentIntensity = 0.45; mats.push(m); return m; };   // the sky off the paint: a red under this much light photographs pink (see trackside.ts)

  // ── starting blocks: a base plate and two angled pads behind each runner's heels ──────────────────────────────────
  const plates: Mesh[] = [], pads: Mesh[] = [];
  for (const [i, x] of opts.laneX.entries()) {
    const plate = MeshBuilder.CreateBox(`sb_plate_${i}`, { width: 0.34, height: 0.03, depth: 0.62 }, scene);
    plate.position.set(x, 0.015, 0.5);
    plates.push(plate);
    for (const [j, z] of [0.27, 0.62].entries()) {
      const pad = MeshBuilder.CreateBox(`sb_pad_${i}_${j}`, { width: 0.26, height: 0.2, depth: 0.045 }, scene);
      pad.position.set(x, 0.12, z); pad.rotation.x = j === 0 ? -0.62 : -0.9;
      pads.push(pad);
    }
  }
  keep(merged('__sprint_blocks_base', plates, paint('blocksBase', '#2b2f36', 0.04, 0.5), scene));
  keep(merged('__sprint_blocks_pads', pads, paint('blocksPad', '#a3212d', 0.02, 0.6), scene));

  // ── the starter: white shirt, dark trousers, one arm up with the gun ───────────────────────────────────────────────
  const starter = new TransformNode('sprint_starter', scene); nodes.push(starter);
  starter.position.set(-5.05, 0, 0.9); starter.rotation.y = Math.PI / 2;   // on the track's edge, facing the lanes
  const part = (m: Mesh, x: number, y: number, z: number): Mesh => { m.position.set(x, y, z); return m; };
  const legs = [-0.1, 0.1].map((x) => part(MeshBuilder.CreateCylinder('st_leg', { diameter: 0.16, height: 0.85, tessellation: 8 }, scene), x, 0.425, 0));
  const torso = part(MeshBuilder.CreateBox('st_torso', { width: 0.44, height: 0.62, depth: 0.26 }, scene), 0, 1.16, 0);
  const armDown = part(MeshBuilder.CreateCylinder('st_arm_l', { diameter: 0.1, height: 0.58, tessellation: 8 }, scene), -0.3, 1.1, 0); armDown.rotation.z = 0.12;
  const armUp = part(MeshBuilder.CreateCylinder('st_arm_r', { diameter: 0.1, height: 0.62, tessellation: 8 }, scene), 0.4, 1.72, 0.02); armUp.rotation.z = -0.38;
  const head = part(MeshBuilder.CreateSphere('st_head', { diameter: 0.25, segments: 8 }, scene), 0, 1.62, 0);
  const gun = part(MeshBuilder.CreateBox('st_gun', { width: 0.06, height: 0.1, depth: 0.22 }, scene), 0.5, 2.03, 0.1);
  const bodyParts: Array<[string, Mesh[], string]> = [['sprint_starter_legs', legs, '#222a35'], ['sprint_starter_shirt', [torso, armDown, armUp], '#f4f1de'], ['__sprint_starter_head', [head], '#c68642'], ['__sprint_starter_gun', [gun], '#0b0b0d']];
  for (const [name, list, hex] of bodyParts) { const m = keep(merged(name, list, paint(`${name}Mat`, hex, 0.05, 0.7), scene)); if (m) m.parent = starter; }
  starter.computeWorldMatrix(true);
  const gunTip = Vector3.TransformCoordinates(new Vector3(0.5, 2.05, 0.24), starter.getWorldMatrix());

  // ── distance boards, one atlas, turned toward the runner coming up behind them ────────────────────────────────────
  const marks = boardMarks(raceDist);
  const atlas = new DynamicTexture('sprint_boards_atlas', { width: 1024, height: 128 }, scene, false); textures.push(atlas);
  const labels = [...marks.map((m) => `${m} M`), 'FEL'];
  paintBoards(atlas, labels);
  const boardMat = new PBRMaterial('sprint_boards_mat', scene); mats.push(boardMat);
  boardMat.albedoTexture = atlas; boardMat.emissiveTexture = atlas; boardMat.emissiveColor = new Color3(0.18, 0.18, 0.18);
  boardMat.metallic = 0; boardMat.roughness = 0.75;
  const boards: Mesh[] = [], posts: Mesh[] = [];
  for (const [i, m] of marks.entries()) {
    for (const side of [-1, 1]) {
      const b = MeshBuilder.CreatePlane(`sb_board_${m}_${side}`, { width: 1.6, height: 0.8 }, scene);
      toCell(b, i, labels.length);
      b.position.set(side * 6.4, 1.15, -m); b.rotation.y = Math.PI - side * 0.55;   // the face toward +z (the runner), turned in toward the track
      boards.push(b);
      const post = MeshBuilder.CreateBox(`sb_post_${m}_${side}`, { width: 0.08, height: 1.0, depth: 0.08 }, scene);
      post.position.set(side * 6.4, 0.5, -m + 0.02);
      posts.push(post);
    }
  }
  keep(merged('__sprint_boards', boards, boardMat, scene));
  keep(merged('__sprint_board_posts', posts, paint('boardPost', '#3a4150', 0.04, 0.6), scene));

  // ── the finish gantry and its timer ────────────────────────────────────────────────────────────────────────────────
  const gz = -raceDist - 0.9;   // just beyond the tape
  const frame: Mesh[] = [];
  for (const side of [-1, 1]) { const p = MeshBuilder.CreateBox(`sg_post_${side}`, { width: 0.3, height: 4.8, depth: 0.3 }, scene); p.position.set(side * 5.9, 2.4, gz); frame.push(p); }
  const beam = MeshBuilder.CreateBox('sg_beam', { width: 12.1, height: 0.55, depth: 0.5 }, scene); beam.position.set(0.1, 4.85, gz); frame.push(beam);
  keep(merged('sprint_finish_gantry', frame, paint('gantry', '#c1121f', 0.05, 0.5), scene));
  const timerTex = new DynamicTexture('sprint_timer_tex', { width: TIMER_W, height: TIMER_H }, scene, false); textures.push(timerTex);
  const timerMat = new PBRMaterial('sprint_timer_mat', scene); mats.push(timerMat);
  timerMat.albedoTexture = timerTex; timerMat.emissiveTexture = timerTex; timerMat.emissiveColor = new Color3(1, 1, 1);
  timerMat.metallic = 0; timerMat.roughness = 0.4;
  const panel = MeshBuilder.CreatePlane('__sprint_finish_timer', { width: 5.2, height: 1.3 }, scene);
  panel.position.set(0.1, 4.85, gz + 0.3); panel.rotation.y = Math.PI; panel.material = timerMat; panel.isPickable = false; keep(panel);
  let shown = '', paintedAt = -1e9;
  const showTimer = (text: string, force = false): void => {
    const now = performance.now();
    if (text === shown || (!force && now - paintedAt < TIMER_REPAINT_MS)) return;
    shown = text; paintedAt = now; paintTimer(timerTex, text);
  };
  showTimer(timerText(null), true);

  // ── Night Meet: floodlight towers ─────────────────────────────────────────────────────────────────────────────────
  if (floodsFor(opts.mood)) {
    const poles: Mesh[] = [];
    const floodMat = paint('flood', '#ffffff', 0, 0.4); floodMat.emissiveColor = new Color3(0.9, 0.95, 1);
    for (const [i, t] of towerPlan(raceDist).entries()) {
      const pole = MeshBuilder.CreateCylinder(`st_pole_${i}`, { diameter: 0.35, height: 14, tessellation: 8 }, scene); pole.position.set(t.x, 7, t.z); poles.push(pole);
      const head = MeshBuilder.CreatePlane(`flood_sprint_${i}`, { width: 2.4, height: 1.2 }, scene);
      head.position.set(t.x, 14.4, t.z); head.billboardMode = Mesh.BILLBOARDMODE_ALL; head.material = floodMat; head.isPickable = false;
      keep(head);
    }
    keep(merged('__sprint_tower_poles', poles, paint('towerPole', '#4a5361', 0.04, 0.5), scene));
  }

  return {
    setClock(clockS, final = false) { showTimer(timerText(clockS), final); },
    fireGun() {
      EffectsKit.burst(scene, gunTip, 'sparks', 0.45, '#ffe7a3');
      EffectsKit.burst(scene, gunTip.add(new Vector3(0, 0.1, 0)), 'dust', 0.9, '#f3f4f6');
    },
    gunTip,
    meshes,
    dispose() {
      for (const m of meshes) m.dispose();
      for (const n of nodes) n.dispose();
      for (const m of mats) m.dispose();
      for (const t of textures) t.dispose();
      meshes.length = 0;
    },
  };
}
