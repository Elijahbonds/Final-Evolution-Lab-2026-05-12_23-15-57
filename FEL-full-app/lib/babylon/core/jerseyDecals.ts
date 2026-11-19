// jerseyDecals — the player's number and name printed ON the new court jerseys (lane/kit-numbers, 2026-11-19).
//
// The kit-mac-jobs jerseys (`top_basketball`, `top_football`, kitGarmentSet.ts) carry a second UV map, `decal`
// (scripts/avatar/mpfb/jersey.py §4): the chest (20 × 20 cm) in its left half, the back (25 × 35 cm, between the shoulder blades,
// seen from behind) in its right half, every other face at one point, (0, 1) as the GLB stores it (V runs down: v 0 is the top of
// each box, at the neck). A canvas is drawn in that layout — a small number on the chest; the name across the top of the back and
// the number under it — and shown through Babylon's decal map, which mixes it OVER the tinted cloth by its alpha
// (`albedo = mix(albedo, decal.rgb, decal.a)`), so the ink can be light on a dark jersey and dark on a light one. Each body has its
// own (the decal map hangs on the mesh); the material only switches the decal map on.
//
// The number and name are the player's own (`PlayerIdentity.jersey`: closet look / device, sanitizeJersey). A player who never set
// one gets defaultJersey() — assumption: number 0, no name — so the new jersey is never blank. The floating plate on the back
// (playerIdentity.attachJerseyPlate) stays for every other top; a top with decal UVs prints instead.
// `kit.jerseyDecals`: 1 = printed; 0 = a blank jersey, as before (and the plate, as before).
// COST: one 512 × 256 canvas per player and look, drawn on an idle turn of the browser (kitGarmentSet.yieldToBrowser), never in
// the identity apply itself; cached by what it shows, so a re-apply with the same number, name and ink draws nothing.
import { DynamicTexture, MeshUVSpaceRenderer, PBRMaterial, VertexBuffer } from '@babylonjs/core';
import '@babylonjs/core/Materials/material.decalMap';
import '@babylonjs/core/Meshes/abstractMesh.decalMap';
import type { AbstractMesh, Mesh, Scene } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';
import type { JerseyConfig } from '../../closet/wearable-catalog';
import { yieldToBrowser } from './kitGarmentSet';

/** kit.jerseyDecals: 1 = the number and name printed on a jersey with decal UVs; 0 = blank, as before. NEW. */
export const JERSEY_DECALS = 1;
export const jerseyDecalsOn = (): boolean => feel('kit.jerseyDecals', JERSEY_DECALS) >= 0.5;

const W = 512, H = 256;
/** The back box is 25 cm wide and 35 cm tall but fills a square half: text drawn there is squashed by this to come out true. */
const BACK_ASPECT = 25 / 35;

/** The worn top that can carry a print: visible, a court jersey, with the decal UVs. */
export function decalTopOf(meshes: readonly AbstractMesh[]): Mesh | null {
  return (meshes.find((m) => m.isVisible && m.isEnabled() && /^Kit_tops_top_(basketball|football)/.test(m.name) && (m as Mesh).isVerticesDataPresent?.(VertexBuffer.UV2Kind)) as Mesh | undefined) ?? null;
}

/** Pure: the ink for a jersey of this colour — light on a dark jersey, dark on a light one (sRGB luminance). */
export function inkFor(jerseyHex: string): { fill: string; edge: string } {
  const h = /^#?([0-9a-f]{6})$/i.exec(jerseyHex.trim())?.[1] ?? 'ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.5 ? { fill: '#111827', edge: 'rgba(255,255,255,0.85)' } : { fill: '#F8FAFC', edge: 'rgba(17,24,39,0.9)' };
}

/** Draw the print (canvas 2D context, W × H, transparent). Exported for the tests. */
export function drawJersey(ctx: CanvasRenderingContext2D, jersey: JerseyConfig, ink: { fill: string; edge: string }): void {
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.fillStyle = ink.fill; ctx.strokeStyle = ink.edge;
  const num = String(jersey.number);
  // the chest (left half, 20 × 20 cm): a small number, high on the left of the chest as worn (the player's left = u up from 0.5)
  ctx.font = 'bold 92px sans-serif'; ctx.lineWidth = 8;
  ctx.strokeText(num, W * 0.25, H * 0.42); ctx.fillText(num, W * 0.25, H * 0.42);
  // the back (right half, 25 × 35 cm): the name across the top, the number large under it
  ctx.save(); ctx.translate(W * 0.75, 0); ctx.scale(1, BACK_ASPECT);
  const h = H / BACK_ASPECT;
  if (jersey.name) {
    let size = 46; ctx.font = `bold ${size}px sans-serif`;
    while (size > 18 && ctx.measureText(jersey.name).width > W * 0.46) { size -= 2; ctx.font = `bold ${size}px sans-serif`; }
    ctx.lineWidth = 6; ctx.strokeText(jersey.name, 0, h * 0.16); ctx.fillText(jersey.name, 0, h * 0.16);
  }
  ctx.font = `bold ${num.length > 1 ? 170 : 190}px sans-serif`; ctx.lineWidth = 12;
  const ny = jersey.name ? h * 0.56 : h * 0.45;
  ctx.strokeText(num, 0, ny); ctx.fillText(num, 0, ny);
  ctx.restore();
  ctx.clearRect(0, H - 3, 3, 3);   // the (0, 1) corner every unprinted face samples stays clear
}

const made = new WeakMap<Mesh, { key: string; tex: DynamicTexture; uv: MeshUVSpaceRenderer }>();

/** Print `jersey` on `top` (now, synchronously). Returns false when it cannot (no decal map support, no canvas). */
export function printJersey(top: Mesh, jersey: JerseyConfig, jerseyHex: string, scene: Scene): boolean {
  const ink = inkFor(jerseyHex), key = `${jersey.number}|${jersey.name}|${ink.fill}`;
  const had = made.get(top);
  if (had?.key === key) return true;
  const tex = had?.tex ?? new DynamicTexture(`fel_jersey_print_${top.uniqueId}`, { width: W, height: H }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D | null;
  if (!ctx) return false;
  drawJersey(ctx, jersey, ink);
  tex.hasAlpha = true; tex.coordinatesIndex = 1;   // the `decal` UV map
  tex.update(false);   // the GLB's UVs run down from the top: the canvas's first row is v 0
  const uv = had?.uv ?? new MeshUVSpaceRenderer(top, scene);
  uv.texture = tex;
  (top as Mesh & { decalMap: MeshUVSpaceRenderer | null }).decalMap = uv;
  const mat = top.material as (PBRMaterial & { decalMap?: { isEnabled: boolean } }) | null;
  if (mat?.decalMap) mat.decalMap.isEnabled = true;
  if (!had) top.onDisposeObservable.addOnce(() => { tex.dispose(); uv.dispose(); made.delete(top); });
  made.set(top, { key, tex, uv });
  return true;
}

/** Take the print off (the knob turned off, or another top went on). */
export function clearJerseyPrint(top: Mesh): void {
  const had = made.get(top); if (!had) return;
  (top as Mesh & { decalMap: MeshUVSpaceRenderer | null }).decalMap = null;
  had.tex.dispose(); had.uv.dispose(); made.delete(top);
}

/** Print on an idle turn (never in the caller's own task: the identity apply runs on a spawn and on every Creator edit). */
export function scheduleJerseyPrint(top: Mesh, jersey: JerseyConfig, jerseyHex: string, scene: Scene): Promise<boolean> {
  return yieldToBrowser().then(() => (top.isDisposed() ? false : printJersey(top, jersey, jerseyHex, scene)));
}
