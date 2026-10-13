// READOUT (vis-court, wave 2, 2026-10-13) — a lit text card in the world: "APEX 21 m · CARRY 186 m", the jumbotron's
// "EXIT VELO 101 MPH". One camera-facing plane with a painted texture, shown where the ball is, scaled with its distance to the
// camera so it reads as the same size on screen from the tee or from the stands, and faded after its hold.
//
// Visual only; nothing reads it back. Named `fel_decal_readout` (never a shadow caster, never mirrored).

import { Color3, Mesh, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { makeTexture, repaint } from './texture';
import { readoutScale } from './flightRead';

export const READOUT_W = 512, READOUT_LINE_H = 54, READOUT_MAX_LINES = 3;
export const READOUT_HOLD_SEC = 2.6, READOUT_FADE_SEC = 0.6;

/** Pure: the card's strength 0..1 `age` seconds after it was shown. */
export function readoutAlpha(age: number, hold = READOUT_HOLD_SEC): number {
  if (age < 0) return 0;
  if (age < 0.12) return age / 0.12;                 // a quick fade-in, not a pop
  if (age < hold) return 1;
  return Math.max(0, 1 - (age - hold) / READOUT_FADE_SEC);
}

export interface ReadoutHandle {
  show(at: { x: number; y: number; z: number }, lines: string | readonly string[], opts?: { color?: string; holdSec?: number }): void;
  hide(): void;
  readonly visible: boolean;
  dispose(): void;
}

export function mountReadout(scene: Scene, name = 'fel_decal_readout'): ReadoutHandle {
  const H = READOUT_LINE_H * READOUT_MAX_LINES + 24;
  const tex = makeTexture(scene, `${name}_tex`, READOUT_W, H, undefined, false);
  if (tex) tex.hasAlpha = true;
  const mat = new StandardMaterial(`${name}_m`, scene);
  mat.disableLighting = true; mat.emissiveColor = Color3.White(); mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black();
  if (tex) { mat.emissiveTexture = tex; mat.opacityTexture = tex; }
  mat.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane(name, { width: 1, height: H / READOUT_W }, scene);
  plane.material = mat; plane.billboardMode = Mesh.BILLBOARDMODE_ALL; plane.isPickable = false; plane.receiveShadows = false;
  plane.isVisible = false; plane.alwaysSelectAsActiveMesh = true;
  let age = Infinity, hold = READOUT_HOLD_SEC;
  const at = new Vector3();

  const paint = (lines: readonly string[], color: string): void => repaint(tex, (g) => {
    g.clearRect(0, 0, READOUT_W, H);
    const rows = Math.min(READOUT_MAX_LINES, lines.length);
    const h = rows * READOUT_LINE_H + 16, y0 = (H - h) / 2;
    g.fillStyle = 'rgba(8,12,20,0.78)';
    g.beginPath(); (g as unknown as { roundRect?: (...a: number[]) => void }).roundRect?.(6, y0, READOUT_W - 12, h, 18);
    if (!(g as unknown as { roundRect?: unknown }).roundRect) g.rect(6, y0, READOUT_W - 12, h);
    g.fill();
    g.fillStyle = color; g.fillRect(6, y0, 8, h);   // the accent bar
    g.font = '800 40px system-ui, "Segoe UI", Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
    for (let i = 0; i < rows; i++) {
      g.fillStyle = i === 0 ? '#ffffff' : '#d7e3f3';
      g.fillText(lines[i], 30, y0 + 8 + READOUT_LINE_H * (i + 0.5), READOUT_W - 48);
    }
  });

  const obs = scene.onBeforeRenderObservable.add(() => {
    if (!plane.isVisible) return;
    age += Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    const a = readoutAlpha(age, hold);
    if (a <= 0) { plane.isVisible = false; return; }
    mat.alpha = a;
    const cam = scene.activeCamera;
    const d = cam ? Vector3.Distance(cam.globalPosition ?? cam.position, at) : 20;
    const s = readoutScale(d);
    plane.scaling.set(s * 2.4, s * 2.4, 1);
  });

  return {
    show(p, lines, opts = {}) {
      const arr = typeof lines === 'string' ? [lines] : lines;
      paint(arr, opts.color ?? '#ffd24a');
      at.set(p.x, p.y, p.z); plane.position.copyFrom(at);
      age = 0; hold = opts.holdSec ?? READOUT_HOLD_SEC; mat.alpha = 0; plane.isVisible = true;
    },
    hide() { plane.isVisible = false; age = Infinity; },
    get visible() { return plane.isVisible; },
    dispose() { scene.onBeforeRenderObservable.remove(obs); plane.dispose(); mat.dispose(); tex?.dispose(); },
  };
}
