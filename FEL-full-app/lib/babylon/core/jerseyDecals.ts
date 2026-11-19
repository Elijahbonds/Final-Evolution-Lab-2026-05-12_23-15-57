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
  // Each half is drawn MIRRORED about its own centre: Babylon's glTF loader flips the handedness (x), so a half drawn as read
  // came out reversed on the cloth (the first rig shots: "SDNOB").
  // the chest (left half, 20 × 20 cm): a small number in the middle of the chest
  ctx.save(); ctx.translate(W * 0.25, 0); ctx.scale(-1, 1);
  ctx.font = 'bold 92px sans-serif'; ctx.lineWidth = 8;
  ctx.strokeText(num, 0, H * 0.42); ctx.fillText(num, 0, H * 0.42);
  ctx.restore();
  // the back (right half, 25 × 35 cm): the name across the top, the number large under it
  ctx.save(); ctx.translate(W * 0.75, 0); ctx.scale(-1, BACK_ASPECT);
  const h = H / BACK_ASPECT;
  if (jersey.name) {
    let size = 46; ctx.font = `bold ${size}px sans-serif`;
    while (size > 18 && ctx.measureText(jersey.name).width > W * 0.38) { size -= 2; ctx.font = `bold ${size}px sans-serif`; }
    ctx.lineWidth = 6; ctx.strokeText(jersey.name, 0, h * 0.22); ctx.fillText(jersey.name, 0, h * 0.22);
  }
  ctx.font = `bold ${num.length > 1 ? 170 : 190}px sans-serif`; ctx.lineWidth = 12;
  const ny = jersey.name ? h * 0.58 : h * 0.45;   // every edge of each box keeps a clear margin (cleanDecalUVs samples it)
  ctx.strokeText(num, 0, ny); ctx.fillText(num, 0, ny);
  ctx.restore();
  ctx.clearRect(0, H - 3, 3, 3);   // the (0, 1) corner every unprinted face samples stays clear
}

/** The arrays of one garment the print-safety pass reads and may grow (kitGarmentSet.SetGarment's shape). */
export interface PrintSafeInput { positions: Float32Array; normals: Float32Array; uv: Float32Array | null; uv2: Float32Array; joints: Float32Array; weights: Float32Array; indices: Uint32Array }

/**
 * Pure: the decal UVs made safe to print through. jersey.py prints a face only when it lies in the chest or back box, and parks
 * every other face at one point ((0, 1) as stored). The exporter's decimation then blended some of them: a few dozen faces (male
 * basketball jersey: 10 that mix printed and parked corners, 18 whose UVs are stretched ×2 off their box's scale) sample the
 * canvas where they should not, and the first rig shots showed it as dark marks along the lower back. Each such face gets its own
 * copies of its vertices, parked, so it samples only the canvas's clear corner; every vertex shared with a good face keeps its UV.
 * The shape does not change (a copy sits where its original does, with its weights). Returns the arrays (grown) and the faces parked.
 */
export function printSafe(g: PrintSafeInput): PrintSafeInput & { parked: number } {
  const U = g.uv2, I = g.indices, P = g.positions, nf = I.length / 3;
  const isParked = (v: number) => U[v * 2] < 1e-3 && U[v * 2 + 1] > 1 - 1e-3;
  const ratio = new Float32Array(nf), half = new Int8Array(nf);   // UV area per surface area; 0 chest, 1 back, -1 mixed, 2 parked
  for (let f = 0; f < nf; f++) {
    const a = I[f * 3], b = I[f * 3 + 1], c = I[f * 3 + 2];
    const pk = [a, b, c].map(isParked);
    if (pk.every(Boolean)) { half[f] = 2; continue; }
    const us = [a, b, c].map((v) => U[v * 2]);
    half[f] = pk.some(Boolean) ? -1 : us.every((u) => u < 0.5) ? 0 : us.every((u) => u >= 0.5) ? 1 : -1;
    if (half[f] < 0) continue;
    const ua = Math.abs((U[b * 2] - U[a * 2]) * (U[c * 2 + 1] - U[a * 2 + 1]) - (U[c * 2] - U[a * 2]) * (U[b * 2 + 1] - U[a * 2 + 1])) / 2;
    const e1 = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]), e2 = [0, 1, 2].map((k) => P[c * 3 + k] - P[a * 3 + k]);
    const pa = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
    ratio[f] = pa > 1e-12 ? ua / pa : 0;
  }
  const median = (h: number) => { const r = [...ratio.filter((_: number, f: number) => half[f] === h)].sort((x, y) => x - y); return r[r.length >> 1] ?? 0; };
  const med = [median(0), median(1)];
  const bad = (f: number) => half[f] === -1 || ((half[f] === 0 || half[f] === 1) && !(ratio[f] > med[half[f]] / 2 && ratio[f] < med[half[f]] * 2));
  const badFaces: number[] = []; for (let f = 0; f < nf; f++) if (bad(f)) badFaces.push(f);
  if (!badFaces.length) return { ...g, parked: 0 };
  const n0 = P.length / 3, extra = badFaces.length * 3;
  const grow = (a: Float32Array | null, k: number) => { if (!a) return null; const o = new Float32Array((n0 + extra) * k); o.set(a); return o; };
  const out = { positions: grow(P, 3)!, normals: grow(g.normals, 3)!, uv: grow(g.uv, 2), uv2: grow(U, 2)!, joints: grow(g.joints, 4)!, weights: grow(g.weights, 4)!, indices: Uint32Array.from(I) };
  let next = n0;
  for (const f of badFaces) for (let k = 0; k < 3; k++) {
    const v = I[f * 3 + k], w = next++;
    out.positions.set(P.subarray(v * 3, v * 3 + 3), w * 3); out.normals.set(g.normals.subarray(v * 3, v * 3 + 3), w * 3);
    if (g.uv && out.uv) out.uv.set(g.uv.subarray(v * 2, v * 2 + 2), w * 2);
    out.joints.set(g.joints.subarray(v * 4, v * 4 + 4), w * 4); out.weights.set(g.weights.subarray(v * 4, v * 4 + 4), w * 4);
    out.uv2[w * 2] = 0; out.uv2[w * 2 + 1] = 1;
    out.indices[f * 3 + k] = w;
  }
  return { ...out, parked: badFaces.length };
}

const made = new WeakMap<Mesh, { key: string; tex: DynamicTexture; uv: MeshUVSpaceRenderer }>();

/** Print `jersey` on `top` (now, synchronously). Returns false when it cannot (no decal map support, no canvas). */
export function printJersey(top: Mesh, jersey: JerseyConfig, jerseyHex: string, scene: Scene): boolean {
  const ink = inkFor(jerseyHex), key = `${jersey.number}|${jersey.name}|${ink.fill}`;
  const had = made.get(top);
  if (had?.key === key) return true;
  const t0 = performance.now();
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
  console.info(`[FEL-KIT] jersey print ${top.name}: ${(performance.now() - t0).toFixed(1)} ms (canvas + upload, on an idle turn)`);
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
