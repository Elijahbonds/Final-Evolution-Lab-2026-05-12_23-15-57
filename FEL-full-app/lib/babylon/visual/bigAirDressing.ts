// THE BIG AIR EVENT (vis-board, visual wave 2, 2026-10-13) — Part B bigair: "an X-Games-style kicker structure: scaffold tower,
// banner wraps, a start gate with LEDs ... a judges' booth and 3D score reveal ... fireworks on a landed double."
//
// The kicker stood on an empty slope: a snow ramp, a table, a landing, and nothing that said an event was on. This builds the
// event around it, from the same hill table the core and the hill meshes read (lib/feel/cores/air-hill), so nothing floats:
//   · THE START GATE — two legs and a crossbar over the run-in with an LED panel facing the rider ("BIG AIR · DROP IN"); the panel
//     is named `bigair_gate_led` on an emissive texture, which is what the shared glow layer matches (desktop/high get the halo);
//   · THE SCAFFOLD — a truss tower either side of the kicker, banner wraps hung on the side that faces the run;
//   · THE JUDGES' BOOTH — a cabin beside the landing with three score panels on the front. After each landing the judges' read
//     flips onto them (a 3D reveal: three cards that swing up one after another, each its own judge's score around the read);
//   · FIREWORKS — a few bursts over the booth for a landed double (rotation ≥ 2); queued, fired from `update(dt)` on the mode's clock.
// All of it is merged scenery: the towers one draw each, the gate one for its legs, the cabin one. Never pickable (the camera's
// occlusion probe must not treat it as a wall), never casting. Texture painting is guarded (a canvas-less test scene builds the
// geometry and skips the paint). The judges' numbers are DISPLAY: the read is the mode's own `judgeRead`, passed in; the three
// scores around it are a fixed spread, so the panels always average to what the card says.

import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import type { AirHill } from '../../feel/cores/air-hill';
import { hillSurface } from '../../feel/cores/air-hill';
import { EffectsKit } from './EffectsKit';
import { lookFeatureOff } from '../scene/graphicsSetting';   // vis-board: ?lookoff=… switches one feature off for a one-build A/B
import { settleEmissive, unlitDiffuse } from './unlit';

/** Pure: the three judges' scores around the panel's read — a fixed spread that averages back to `read` (held to 0..10). */
export function judgeSpread(read: number, attempt: number): [number, number, number] {
  const r = Math.max(0, Math.min(10, Number.isFinite(read) ? read : 0));
  const k = ((attempt % 3) + 3) % 3;
  const base: [number, number, number][] = [[-0.3, 0.1, 0.2], [0.2, -0.3, 0.1], [0.1, 0.2, -0.3]];
  const d = base[k];
  const out = d.map((x) => Math.max(0, Math.min(10, Math.round((r + x) * 10) / 10))) as [number, number, number];
  return out;
}

/** Pure: the colour of a judge's number — gold from 8.5, cyan from 6, amber from 3, red below. */
export function scoreColor(score: number): string {
  return score >= 8.5 ? '#ffd75e' : score >= 6 ? '#22d3ee' : score >= 3 ? '#ff9d5c' : '#ef4444';
}

/** Pure: a landed double — two full rotations or more, on a clean or stuck landing. */
export function fireworksWorthy(rotations: number, grade: string): boolean {
  return Math.abs(rotations) >= 2 && (grade === 'stuck' || grade === 'clean');
}

/** Pure: where the structures stand — the kicker's towers, the start gate, the booth and where the fireworks go up. */
export function eventLayout(hill: AirHill, launchZ: number): {
  gate: { z: number; half: number };
  towers: { x: number; z: number }[];
  booth: { x: number; z: number };
  fireworksAt: { x: number; y: number; z: number };
} {
  const surf = hillSurface(hill, launchZ);
  const mid = (surf.sweetFromZ + surf.bottomZ) / 2;
  return {
    gate: { z: -6, half: 4.2 },
    towers: [-1, 1].map((s) => ({ x: s * 5.6, z: launchZ + hill.kickerLen * 0.45 })),
    booth: { x: 11.8, z: mid },
    fireworksAt: { x: 11.8, y: 11, z: mid },
  };
}

export interface BigAirEventHandle {
  /** Flip the judges' scores onto the booth's panels (the read, 0..10; `attempt` picks the spread). */
  reveal(read: number, attempt: number): void;
  /** Blank the panels (a new run-up). */
  clear(): void;
  /** Queue fireworks over the booth. */
  fireworks(): void;
  /** Every frame, on the mode's clock. */
  update(dt: number): void;
  readonly meshes: readonly AbstractMesh[];
  dispose(): void;
}

function panelTexture(scene: Scene, name: string, w: number, h: number): { tex: DynamicTexture; g: CanvasRenderingContext2D } | null {
  try {
    const tex = new DynamicTexture(name, { width: w, height: h }, scene, false);
    return { tex, g: tex.getContext() as unknown as CanvasRenderingContext2D };
  } catch { return null; }
}

function steelMat(scene: Scene, name: string, hex: string, metallic = 0.6, rough = 0.5): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(hex); m.metallic = metallic; m.roughness = rough;
  return m;
}

/** The burst the fireworks call (EffectsKit's by default; a test passes a recorder — a headless scene has no canvas to paint a spark on). */
export type BurstFn = (scene: Scene, at: Vector3, kind: 'sparks' | 'confetti', scale: number, tint?: string) => void;

export function mountBigAirEvent(scene: Scene, hill: AirHill, launchZ: number, burst: BurstFn = (sc, at, kind, scale, tint) => EffectsKit.burst(sc, at, kind, scale, tint)): BigAirEventHandle {
  if (lookFeatureOff('event')) return { reveal() { /* off */ }, clear() { /* off */ }, fireworks() { /* off */ }, update() { /* off */ }, meshes: [], dispose() { /* nothing was built */ } };
  const L = eventLayout(hill, launchZ);
  const meshes: AbstractMesh[] = [];
  const owned: { dispose(): void }[] = [];
  const keep = <T extends AbstractMesh>(m: T): T => { m.isPickable = false; m.receiveShadows = false; meshes.push(m); return m; };
  const steel = steelMat(scene, 'ba_steel', '#2b3138'); owned.push(steel);
  const paint = steelMat(scene, 'ba_paint', '#e6edf5', 0.1, 0.6); owned.push(paint);

  // ── the start gate ──
  {
    const legs: Mesh[] = [];
    for (const s of [-1, 1]) {
      const leg = MeshBuilder.CreateBox('ba_gate_leg', { width: 0.34, height: 5.8, depth: 0.34 }, scene);
      leg.position.set(s * L.gate.half, 2.9, L.gate.z); legs.push(leg);
    }
    const bar = MeshBuilder.CreateBox('ba_gate_bar', { width: L.gate.half * 2 + 0.34, height: 0.5, depth: 0.5 }, scene);
    bar.position.set(0, 5.75, L.gate.z); legs.push(bar);
    const gate = Mesh.MergeMeshes(legs, true, true);
    if (gate) { gate.name = 'ba_gate'; gate.material = steel; keep(gate); }
    const led = MeshBuilder.CreatePlane('bigair_gate_led', { width: L.gate.half * 2 - 0.5, height: 1.1 }, scene);
    led.position.set(0, 4.95, L.gate.z + 0.3); led.rotation.y = Math.PI;   // faces +z, toward the camera behind the rider (the run goes −z)
    const ledM = new StandardMaterial('led_bigair_gate', scene);
    ledM.disableLighting = true; ledM.diffuseColor = unlitDiffuse(); ledM.specularColor = Color3.Black(); ledM.emissiveColor = new Color3(0.9, 0.95, 1);
    const p = panelTexture(scene, 'ba_gate_led_tex', 1024, 128);
    if (p) {
      const { g, tex } = p;
      g.fillStyle = '#05080f'; g.fillRect(0, 0, 1024, 128);
      g.fillStyle = '#22d3ee'; g.fillRect(0, 0, 1024, 10); g.fillRect(0, 118, 1024, 10);
      g.fillStyle = '#ffd75e'; g.font = 'bold 82px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BIG AIR  ·  DROP IN', 512, 66);
      // the LED matrix: a dot grid laid over the text
      g.fillStyle = 'rgba(0,0,0,0.5)'; for (let y = 0; y < 128; y += 6) g.fillRect(0, y, 1024, 2);
      tex.update(true);
      ledM.emissiveTexture = tex; settleEmissive(ledM); owned.push(tex);
    }
    led.material = ledM; owned.push(ledM);
    keep(led);
  }

  // ── the scaffold towers and their banner wraps ──
  const bannerTex = panelTexture(scene, 'ba_banner_tex', 512, 192);
  const bannerM = new StandardMaterial('ba_banner_m', scene);
  bannerM.disableLighting = true; bannerM.diffuseColor = unlitDiffuse(); bannerM.specularColor = Color3.Black(); bannerM.emissiveColor = new Color3(0.85, 0.88, 0.92); bannerM.backFaceCulling = false;
  if (bannerTex) {
    const { g, tex } = bannerTex;
    const gr = g.createLinearGradient(0, 0, 512, 192); gr.addColorStop(0, '#0a2a6a'); gr.addColorStop(1, '#1f6feb');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 192);
    g.fillStyle = '#ffd75e'; g.fillRect(0, 150, 512, 14); g.fillStyle = '#ffffff'; g.fillRect(0, 168, 512, 6);
    g.fillStyle = '#ffffff'; g.font = 'bold 104px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FEL', 256, 62);
    g.font = 'bold 54px sans-serif'; g.fillStyle = '#ffd75e'; g.fillText('BIG AIR', 256, 122);
    tex.update(true); bannerM.emissiveTexture = tex; settleEmissive(bannerM); owned.push(tex);
  }
  owned.push(bannerM);
  for (const t of L.towers) {
    const parts: Mesh[] = [];
    const H = 12, W = 1.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = MeshBuilder.CreateBox('ba_leg', { width: 0.14, height: H, depth: 0.14 }, scene);
      leg.position.set(t.x + sx * W / 2, H / 2, t.z + sz * W / 2); parts.push(leg);
    }
    for (let y = 1.6; y < H; y += 2) {
      for (const sz of [-1, 1]) { const b = MeshBuilder.CreateBox('ba_tie', { width: W, height: 0.08, depth: 0.08 }, scene); b.position.set(t.x, y, t.z + sz * W / 2); parts.push(b); }
      for (const sx of [-1, 1]) { const b = MeshBuilder.CreateBox('ba_tie', { width: 0.08, height: 0.08, depth: W }, scene); b.position.set(t.x + sx * W / 2, y, t.z); parts.push(b); }
      // a diagonal brace on the run-facing side: the truss read
      const d = MeshBuilder.CreateBox('ba_brace', { width: 0.07, height: 2.5, depth: 0.07 }, scene);
      d.position.set(t.x - Math.sign(t.x) * W / 2, y + 1, t.z); d.rotation.x = 0.7; parts.push(d);
    }
    const deck = MeshBuilder.CreateBox('ba_deck', { width: W + 0.5, height: 0.14, depth: W + 0.5 }, scene);
    deck.position.set(t.x, H + 0.05, t.z); parts.push(deck);
    const tower = Mesh.MergeMeshes(parts, true, true);
    if (tower) { tower.name = 'ba_tower'; tower.material = steel; keep(tower); }
    // the banner wrap on the face that looks at the run (toward x = 0), and one on the face to the camera
    const wrap = MeshBuilder.CreatePlane('ba_banner', { width: 5, height: 1.9 }, scene);
    wrap.position.set(t.x - Math.sign(t.x) * (W / 2 + 0.06), 8.6, t.z); wrap.rotation.y = Math.sign(t.x) * Math.PI / 2;   // a plane's front looks down −z: +π/2 turns it to face −x (the tower at +x looks at the run)
    wrap.material = bannerM; keep(wrap);
    const wrap2 = MeshBuilder.CreatePlane('ba_banner', { width: 1.5, height: 3.6 }, scene);
    wrap2.position.set(t.x, 5.2, t.z + W / 2 + 0.06); wrap2.rotation.y = Math.PI;
    wrap2.material = bannerM; keep(wrap2);
  }

  // ── the judges' booth ──
  const panels: { mesh: Mesh; mat: StandardMaterial; tex: DynamicTexture | null; g: CanvasRenderingContext2D | null; t: number; delay: number; show: boolean }[] = [];
  {
    const bx = L.booth.x, bz = L.booth.z;
    const cabin = MeshBuilder.CreateBox('ba_booth', { width: 4.4, height: 2.7, depth: 3.2 }, scene);
    cabin.position.set(bx, 1.35, bz); cabin.material = paint; keep(cabin);
    const roof = MeshBuilder.CreateBox('ba_booth_roof', { width: 5.0, height: 0.18, depth: 3.8 }, scene);
    roof.position.set(bx, 2.8, bz); roof.material = steel; keep(roof);
    const glass = MeshBuilder.CreatePlane('ba_booth_glass', { width: 3.4, height: 1.0 }, scene);
    glass.position.set(bx, 1.7, bz + 1.62); glass.rotation.y = Math.PI;
    const gm = new StandardMaterial('ba_glass_m', scene);
    gm.diffuseColor = unlitDiffuse(); gm.specularColor = new Color3(0.4, 0.4, 0.4); gm.emissiveColor = new Color3(0.08, 0.14, 0.22); gm.alpha = 0.85; gm.backFaceCulling = false;
    glass.material = gm; owned.push(gm); keep(glass);
    // three score panels on posts, raised above the roof so the camera reads them over the landing
    [-1.55, 0, 1.55].forEach((dx, i) => {
      const post = MeshBuilder.CreateCylinder('ba_post', { diameter: 0.1, height: 1.5, tessellation: 6 }, scene);
      post.position.set(bx + dx, 3.5, bz + 1.5); post.material = steel; keep(post);
      const mesh = MeshBuilder.CreatePlane(`ba_judge_panel_${i}`, { width: 1.35, height: 0.95 }, scene);
      mesh.position.set(bx + dx, 4.65, bz + 1.5); mesh.rotation.y = Math.PI;
      const mat = new StandardMaterial(`ba_judge_m_${i}`, scene);
      mat.disableLighting = true; mat.diffuseColor = unlitDiffuse(); mat.specularColor = Color3.Black(); mat.emissiveColor = new Color3(0.9, 0.92, 0.95); mat.backFaceCulling = false;
      const p = panelTexture(scene, `ba_judge_tex_${i}`, 256, 180);
      if (p) { mat.emissiveTexture = p.tex; settleEmissive(mat); owned.push(p.tex); }
      mesh.material = mat; owned.push(mat); keep(mesh);
      mesh.scaling.y = 0.0001;   // down until the first reveal: a blank card edge-on
      panels.push({ mesh, mat, tex: p?.tex ?? null, g: p?.g ?? null, t: 9, delay: i * 0.14, show: false });
    });
  }
  const drawPanel = (i: number, text: string, color: string, label: string): void => {
    const p = panels[i]; if (!p?.g || !p.tex) return;
    const g = p.g;
    g.fillStyle = '#070b14'; g.fillRect(0, 0, 256, 180);
    g.strokeStyle = color; g.lineWidth = 8; g.strokeRect(6, 6, 244, 168);
    g.fillStyle = '#9fb3c8'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 128, 30);
    g.fillStyle = color; g.font = 'bold 96px sans-serif'; g.fillText(text, 128, 104);
    p.tex.update(true);
  };

  // ── the fireworks ──
  const shells: { t: number; at: Vector3; tint: string }[] = [];
  let clock = 0;
  const TINTS = ['#ffd75e', '#ff4d6d', '#22d3ee', '#a78bfa'];

  return {
    meshes,
    reveal(read, attempt) {
      const s = judgeSpread(read, attempt);
      s.forEach((v, i) => { drawPanel(i, v.toFixed(1), scoreColor(v), `JUDGE ${i + 1}`); const p = panels[i]; if (p) { p.t = -p.delay; p.show = true; } });
    },
    clear() { for (const p of panels) { p.show = false; p.mesh.scaling.y = 0.0001; p.t = 9; } },
    fireworks() {
      const a = L.fireworksAt;
      for (let i = 0; i < 4; i++) shells.push({ t: clock + 0.15 + i * 0.32, at: new Vector3(a.x + (i - 1.5) * 3.2, a.y + (i % 2) * 2.5, a.z - 3 + (i % 3) * 1.4), tint: TINTS[i % TINTS.length] });
    },
    update(dt) {
      clock += dt;
      for (const p of panels) {
        if (!p.show) continue;
        p.t += dt;
        // the card swings up from edge-on, overshoots a hair, settles — a flip, not a fade
        const k = Math.max(0, Math.min(1, p.t / 0.32));
        p.mesh.scaling.y = Math.max(0.0001, k < 1 ? Math.sin(k * Math.PI * 0.5) * 1.12 : 1 + 0.12 * Math.max(0, 1 - (p.t - 0.32) / 0.2));
      }
      for (let i = shells.length - 1; i >= 0; i--) {
        if (shells[i].t > clock) continue;
        const s = shells[i]; shells.splice(i, 1);
        burst(scene, s.at, 'sparks', 2, s.tint);
        burst(scene, s.at, 'confetti', 0.9);
      }
    },
    dispose() {
      shells.length = 0;
      for (let i = meshes.length - 1; i >= 0; i--) meshes[i].dispose();
      for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose();
      meshes.length = 0; panels.length = 0;
    },
  };
}
