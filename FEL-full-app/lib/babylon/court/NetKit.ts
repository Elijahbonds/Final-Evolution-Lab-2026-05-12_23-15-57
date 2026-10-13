// THE NET (vis-court, wave 2, 2026-10-13) — a net you can read, that moves when a ball finds the tape.
//
// The net sports' net was a translucent white panel from the venue spec (the audit: "net posts"), which vanished on bright
// sand, so volleyball got a readable one in SCORECARD VISUALS (2026-09-15: two posts, a dark band, a white tape). Tennis never
// did: the whole match is played over a pane of glass-white. This is one net for both: padded posts, a real mesh (a painted grid
// with gaps, so the court shows through it), a white tape at the height RallyCore plays to, and — new — a shake when the ball
// brushes it: the band swings from the tape in a damped wobble. The sizes are the config's (netHeight, halfWidth): the net IS
// the line the rally judges against, so nothing here moves it; the shake is a rotation of a visual band about its top edge.
//
// Visual only. `shake()` is called by the mode on an event it already detected; nothing is read back.

import { Color3, Matrix, MeshBuilder, PBRMaterial, Texture } from '@babylonjs/core';
import type { DynamicTexture, Mesh, Scene } from '@babylonjs/core';
import { makeTexture } from './texture';

export type NetStyle = 'volley' | 'tennis';

export interface NetLook {
  /** how far the band hangs from the tape (m) */
  drop: number;
  postColor: string;
  postDiameter: number;
  tapeColor: string;
  /** the mesh's line colour */
  line: string;
  /** the band's opacity (lines / gaps) */
  lineAlpha: number; gapAlpha: number;
}

/** Pure: the net's look and how far its band hangs. A volleyball net is a one-metre strip under the tape; a tennis net hangs to the court. */
export function netLook(style: NetStyle, netHeight: number): NetLook {
  return style === 'volley'
    ? { drop: Math.min(1, netHeight * 0.42), postColor: '#e8e2d0', postDiameter: 0.1, tapeColor: '#ffffff', line: '#232f47', lineAlpha: 0.88, gapAlpha: 0.3 }
    : { drop: Math.max(0.3, netHeight - 0.04), postColor: '#2c3a4c', postDiameter: 0.12, tapeColor: '#ffffff', line: '#10151f', lineAlpha: 0.88, gapAlpha: 0.2 };
}

/** Pure: the shake's lean at `age` seconds after a brush of `strength` (0..1): a damped swing about the tape, radians. */
export function netSwing(age: number, strength: number): number {
  if (age < 0 || strength <= 0) return 0;
  const A = 0.11 * Math.min(1, strength), tau = 0.55, w = 2 * Math.PI * 3.2;
  const a = A * Math.exp(-age / tau) * Math.sin(w * age);
  return Math.abs(a) < 0.0008 ? 0 : a;
}

/** Pure: how hard the ball brushed the net as it crossed: 0 (clear by a hand) .. 1 (on the tape). `clear` = ball height − net height. */
export function brushStrength(clear: number): number {
  const c = Math.abs(clear);
  return Math.max(0, 1 - c / 0.45);
}

export interface NetHandle {
  /** The ball brushed the tape (0..1). */
  shake(strength: number): void;
  update(dt: number): void;
  /** The net's visible meshes (probes and tests). */
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

function meshTexture(scene: Scene, look: NetLook): DynamicTexture | null {
  const S = 128;
  const t = makeTexture(scene, 'court_net_tex', S, S, (g) => {
    g.clearRect(0, 0, S, S);
    g.fillStyle = `rgba(0,0,0,${look.gapAlpha})`; g.fillRect(0, 0, S, S);
    g.strokeStyle = look.line; g.globalAlpha = look.lineAlpha; g.lineWidth = 9;
    g.beginPath();
    for (let i = 0; i <= S; i += S / 2) { g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); }
    g.stroke();
  });
  if (t) { t.hasAlpha = true; t.wrapU = Texture.WRAP_ADDRESSMODE; t.wrapV = Texture.WRAP_ADDRESSMODE; }
  return t;
}

export function buildNet(scene: Scene, cfg: { halfWidth: number; netHeight: number }, style: NetStyle): NetHandle {
  const look = netLook(style, cfg.netHeight);
  const span = cfg.halfWidth * 2 + 1.6, top = cfg.netHeight;
  const post = new PBRMaterial('court_net_post_m', scene);
  post.albedoColor = Color3.FromHexString(look.postColor); post.metallic = style === 'volley' ? 0.6 : 0.1; post.roughness = style === 'volley' ? 0.35 : 0.55;
  const tape = new PBRMaterial('court_net_tape_m', scene);
  tape.albedoColor = Color3.FromHexString(look.tapeColor); tape.emissiveColor = Color3.White().scale(0.22); tape.metallic = 0; tape.roughness = 0.6;
  const tex = meshTexture(scene, look);
  const band = new PBRMaterial('court_net_band_m', scene);
  band.albedoColor = tex ? Color3.White() : Color3.FromHexString(look.line); if (tex) { band.albedoTexture = tex; band.useAlphaFromAlbedoTexture = true; } else band.alpha = 0.6; band.transparencyMode = 2; band.metallic = 0; band.roughness = 0.9; band.backFaceCulling = false;
  if (tex) { tex.uScale = span / 0.14; tex.vScale = look.drop / 0.14; }   // a ~14 cm mesh cell, as a real net has
  const made: Mesh[] = [];
  for (const sx of [-1, 1]) {
    const p = MeshBuilder.CreateCylinder('court_net_post', { diameter: look.postDiameter, height: top + 0.15, tessellation: 12 }, scene);
    p.position.set(sx * span / 2, (top + 0.15) / 2, 0); p.material = post; made.push(p);
  }
  // the band hangs from its top edge: its pivot is the tape line, so a shake swings it like a curtain
  const b = MeshBuilder.CreatePlane('court_net_band', { width: span, height: look.drop }, scene);
  b.bakeTransformIntoVertices(Matrix.Translation(0, -look.drop / 2, 0));
  b.position.set(0, top - 0.02, 0); b.material = band; made.push(b);
  const t = MeshBuilder.CreateBox('court_net_tape', { width: span, height: 0.07, depth: 0.03 }, scene);
  t.position.set(0, top - 0.035, 0); t.material = tape; made.push(t);
  for (const m of made) { m.isPickable = false; m.receiveShadows = true; }
  for (const m of [...made.filter((x) => x !== b)]) m.freezeWorldMatrix();
  let age = Infinity, strength = 0;
  return {
    shake(s) { if (s <= 0) return; const left = age === Infinity ? 0 : strength * Math.exp(-age / 0.55); strength = Math.max(s, left); age = 0; },
    update(dt) {
      if (age === Infinity) return;
      age += Math.min(0.1, dt);
      const r = netSwing(age, strength);
      b.rotation.x = r;
      if (r === 0 && age > 0.3) { age = Infinity; strength = 0; b.rotation.x = 0; }
    },
    get meshes() { return made; },
    dispose() { for (const m of made) m.dispose(); post.dispose(); tape.dispose(); band.dispose(); tex?.dispose(); },
  };
}

/** The venue spec's own translucent net panel (nexus/NexusWebScene 'net'): hidden when this net stands in its place. */
export function hideVenueNet(scene: Scene): void {
  for (const m of scene.meshes) if (m.name === 'net') m.setEnabled(false);
}
