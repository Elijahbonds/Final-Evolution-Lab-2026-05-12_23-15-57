// AnimeInk — NEW (M59). The third leg of the anime style pass: INK LINES
// and CEL MATERIALS. Babylon's outline renderer re-draws a mesh expanded
// along its normals behind itself — on characters that reads as the drawn
// contour line of cel animation. Plus a material flattening pass that kills
// photoreal specular shine (cel shading holds flat color; glints come from
// the rim light, not glossy materials).
//
// ZERO-WIRING DESIGN: autoInk(scene) watches new meshes and inks every
// SKINNED mesh automatically (skinned = a character, in every FEL mode).
// Venue/prop meshes keep their painted look — anime backgrounds are
// painterly, characters are inked, which is exactly the classic cel-over-
// background contrast.

import '@babylonjs/core/Rendering/outlineRenderer';     // side-effect: enables mesh.renderOutline
import { Color3 } from '@babylonjs/core';
import type { AbstractMesh, PBRMaterial, Scene, StandardMaterial } from '@babylonjs/core';

const INK_COLOR = Color3.FromHexString('#1a1230');      // deep indigo, softer than pure black
export const INK_WIDTH = 0.015;

// ── THE INK DECISION (visual-foundation A9.6, 2026-10-06) ─────────────────────────────────────────────────────────────
//
// The audit's style clash: a fixed 0.015 m inverted hull is ~7 px of black at a 3 m close-up on a 1080p screen, drawn
// around a photoreal Meshy scan standing in a photographed venue. The anime/party modes are built for that line and keep
// it. The photoreal sports keep a CONTOUR — the silhouette separation is still worth having on a TV — but its width
// follows the camera distance so it stays about one pixel at any range, and never exceeds the anime width.
//
//   anime     the fixed line, exactly as before (combat, party, dance, quiz, the toy racers; any mode not listed)
//   distance  ~1.25 px at 1080p wherever the body is (the sports)
//   off       no line at all (and half the character draws) — for a mode pass that wants it; `?ink=` tries any style
export type InkStyle = 'anime' | 'distance' | 'off';

/** The photoreal sports (keyed by ModeDefinition.modeId). Unlisted modes are 'anime'. */
export const INK_STYLE_BY_MODE: Readonly<Record<string, InkStyle>> = {
  dunk: 'distance', dunkduel: 'distance', onevone: 'distance', threevthree: 'distance', threepoint: 'distance',
  tennis: 'distance', tiebreak: 'distance', volleyball: 'distance', golf: 'distance', baseball: 'distance',
  soccer: 'distance', football: 'distance', sprint: 'distance', skateboard: 'distance', snowboard: 'distance',
  surf: 'distance', bigair: 'distance', freerun: 'distance',
};

/** Ink width per metre of camera distance: ~1.25 px at 1080p through the game's ~0.8 rad vertical field of view. */
export const INK_PER_METRE = 0.0009;
/** Never thinner than this (a hull that collapses to nothing z-fights its own body). */
export const INK_MIN = 0.002;

function parseInkStyle(v: unknown): InkStyle | null {
  return v === 'anime' || v === 'distance' || v === 'off' ? v : null;
}

/** The ink style a mode mounts with: `?ink=` for one load (the owner's A/B), else the table, else anime.
 *  `?look=legacy` is the pre-pass look: anime everywhere. */
export function inkStyleFor(modeId: string, search: string | null = typeof window !== 'undefined' ? window.location.search : null): InkStyle {
  const q = search ? new URLSearchParams(search) : null;
  if (q?.get('look') === 'legacy') return 'anime';
  return parseInkStyle(q?.get('ink')) ?? INK_STYLE_BY_MODE[modeId] ?? 'anime';
}

/** The hull width for a body `distance` metres from the camera. Pure. */
export function inkWidthAt(style: InkStyle, distance: number): number {
  if (style === 'off') return 0;
  if (style === 'anime' || !Number.isFinite(distance)) return INK_WIDTH;
  return Math.min(INK_WIDTH, Math.max(INK_MIN, distance * INK_PER_METRE));
}

/** Ink one character's meshes + flatten their materials to cel. */
export function inkCharacter(meshes: AbstractMesh[], style: InkStyle = 'anime'): void {
  for (const m of meshes) {
    m.renderOutline = style !== 'off';
    m.outlineColor = INK_COLOR;
    m.outlineWidth = style === 'off' ? 0 : INK_WIDTH;
    const mat = m.material as (StandardMaterial & PBRMaterial) | null;
    if (!mat) continue;
    // cel flattening — no glossy hotspots; the rim light supplies the glint
    if ((mat as StandardMaterial).specularColor) (mat as StandardMaterial).specularColor = Color3.Black();
    // Phase 2 (2026-09-02): the skin-shading pass tunes roughness, sheen and
    // subsurface per material and flags them; flattening those again here
    // undid the whole pass (measured roughness 0.95 on skin). The contour
    // line stays on every character; only untuned materials get cel-flattened.
    if ((m.material as { metadata?: { felShaded?: boolean } } | null)?.metadata?.felShaded) continue;
    if ((mat as PBRMaterial).metallic !== undefined) {
      (mat as PBRMaterial).metallic = 0;
      (mat as PBRMaterial).roughness = 0.95;
    }
  }
}

/** Mount once per scene (ModeHarness, right after scene creation): every
 *  skinned mesh that ever spawns — hero, rivals, mobs, the Yeti — gets
 *  inked automatically, existing and future. Returns a disposer.
 *  `style` (A9.6): the mode's ink — see INK_STYLE_BY_MODE; the default is the anime line every caller had. */
export function autoInk(scene: Scene, style: InkStyle = 'anime'): () => void {
  // The outline is an inverted hull drawn with depth: on a body wearing FITTED
  // garments the body's hull buried anything tighter than the ink width — the
  // kit hero played bare-legged (measured 2026-09-04; the Closet, which has no
  // ink, showed the shorts). A NEGATIVE polygon offset pushes every hull behind
  // the surfaces it wraps, so tight cloth wins the depth test while the contour
  // still shows at the silhouette. Trials: +8 speckled, −6 near-clean, −12 clean.
  const outline = scene.getOutlineRenderer();
  outline.zOffset = -12;
  outline.zOffsetUnits = -48;
  const seen = new WeakSet<AbstractMesh>();
  const inked: AbstractMesh[] = [];
  const tryInk = (m: AbstractMesh): void => {
    if (seen.has(m) || !m.skeleton) return;
    seen.add(m);
    inkCharacter([m], style);
    if (style === 'distance') inked.push(m);
  };
  for (const m of scene.meshes) tryInk(m);
  const obs = scene.onNewMeshAddedObservable.add((m) => {
    // skeletons attach slightly after mesh add on instantiate — check next frame
    scene.onBeforeRenderObservable.addOnce(() => tryInk(m));
  });
  // 'distance': re-width each inked body from the active camera every frame (a few dozen meshes at most)
  const follow = style === 'distance' ? scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    if (!cam) return;
    const eye = cam.globalPosition;
    for (let i = inked.length - 1; i >= 0; i--) {
      const m = inked[i];
      if (m.isDisposed()) { inked.splice(i, 1); continue; }
      const c = m.getBoundingInfo().boundingSphere.centerWorld;
      m.outlineWidth = inkWidthAt(style, Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z));
    }
  }) : null;
  return () => {
    scene.onNewMeshAddedObservable.remove(obs);
    if (follow) scene.onBeforeRenderObservable.remove(follow);
  };
}

// WIRING (ModeHarness, once per mode load — one line):
//   const uninke = autoInk(scene);      // ... call uninke() on mode dispose
// Or, for explicit control, call inkCharacter(spawn.meshes) after each
// CharacterLibrary.spawn instead. Either path, not both (both is harmless
// but redundant).
