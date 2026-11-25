// bodyLod — the soccer 3v3's bodies at a phone's cost (lane/physics-arena §9 slice 2; arena.bodyLod; the PHONE tier only).
//
// WHY (the census, scripts/probes/physics-arena/census.mjs, on the phone profile): a body is about 25 draws a frame — ~10 for its
// parts, ~10 for the ink contour (AnimeInk: the hull and the mesh again, on the 5 parts the phone inks) and 5 into the shadow map —
// and the soccer 3v3 has eight of them (the hoops 3v3 has six). Two of those three costs buy nothing a player can see:
//   THE INK of a far body. The arena modes ink at a fixed 1.5 cm; on the phone's 844 px through the ~0.8 rad field of view that is
//            ~15 px ÷ metres, so a body more than ~14 m from the camera draws its 10 ink draws for a line about one pixel wide.
//            Beyond INK_FAR_M a body's parts drop the contour (back on inside INK_FAR_M − 1 m: no flicker at the edge).
//   THE SHADOW of a body away from the play. Every body still stands on its contact shadow (the soft disc under the feet, one
//            instanced mesh for all of them); the sun's shadow is kept for the player's man and the CASTERS bodies nearest the
//            ball (a body keeps it until it falls a rank further back: no flicker either).
// HOW, without touching what the body merge and the shadow cache watch: the ink is each part's own `renderOutline` (the merge
// copies it per sub-mesh at the draw, and it is not in the merge's change signature); the shadow is a `getCustomRenderList` on
// each shadow map, a filter over whatever list the map renders (the shadow cache rewrites that list every frame) — no part ever
// leaves or joins a render list, so no merge dissolves and no cache re-bakes.

import type { AbstractMesh, Camera, Node, Scene, TransformNode } from '@babylonjs/core';

/** A body farther than this from the camera draws no ink contour (m). */
export const INK_FAR_M = 14;
/** The bodies nearest the ball that keep the sun's shadow (besides the player's man). */
export const CASTERS = 3;
/** How often the choices are made (s). */
const EVERY_SEC = 0.25;

export interface LodBody {
  /** The node the body's character hangs under (its view node). */
  root: TransformNode;
  /** The player's man: always inked, always casting. */
  human: () => boolean;
}

interface Entry { b: LodBody; ink: boolean; cast: boolean }

/** Pure: the bodies that cast, given each one's distance to the ball, who casts now, and who the player is. A body casting now keeps
 *  it while it is among the `n + 1` nearest; a new one joins among the `n` nearest. */
export function castersFor(dist: readonly number[], castingNow: readonly boolean[], human: readonly boolean[], n = CASTERS): boolean[] {
  const order = dist.map((d, i) => i).filter((i) => !human[i]).sort((a, b) => dist[a] - dist[b]);
  const rank = new Map(order.map((i, r) => [i, r]));
  return dist.map((_, i) => human[i] || (rank.get(i)! < (castingNow[i] ? n + 1 : n)));
}

/** Pure: does a body at `d` metres keep its ink, given whether it has it now? */
export function inkAt(d: number, inkedNow: boolean, far = INK_FAR_M): boolean { return d < (inkedNow ? far : far - 1); }

export interface BodyLodHandle { update(dt: number): void; dispose(): void }

/** Mount on a phone-tier scene (anything else: a handle that does nothing). `ball`: where the play is. */
export function mountBodyLod(scene: Scene, camera: () => Camera, bodies: LodBody[], ball: () => { x: number; z: number }): BodyLodHandle {
  const tier = (scene.metadata as { felTier?: string } | null)?.felTier;
  if (tier !== 'mobile') return { update() {}, dispose() {} };
  const entries: Entry[] = bodies.map((b) => ({ b, ink: true, cast: true }));
  const inked = new WeakSet<AbstractMesh>();   // the parts that carried ink when first seen: only those are ever given it back
  const bodyOf = new WeakMap<AbstractMesh, Entry | null>();
  const owner = (m: AbstractMesh): Entry | null => {
    let e = bodyOf.get(m);
    if (e !== undefined) return e;
    e = null;
    for (let n: Node | null = m.parent; n && !e; n = n.parent) e = entries.find((x) => x.b.root === n) ?? null;
    bodyOf.set(m, e);
    return e;
  };
  const setInk = (e: Entry, on: boolean) => {
    for (const m of e.b.root.getChildMeshes(false)) {
      if (m.name.startsWith('__felBody_')) continue;   // a merged body takes each part's own flag at the draw
      if (m.renderOutline) inked.add(m);
      if (inked.has(m)) m.renderOutline = on;
    }
  };
  // the shadow maps' filter: every caster that is not a body that has lost its shadow
  const out: AbstractMesh[] = [];
  const filter = (_layer: number, list: readonly AbstractMesh[] | null, len: number): AbstractMesh[] | null => {
    if (!list) return null;
    out.length = 0;
    for (let i = 0; i < len; i++) { const m = list[i], e = owner(m); if (!e || e.cast) out.push(m); }
    return out;
  };
  // (the maps are looked for on every choice: a mood's sun and its generator can arrive after the mode has loaded)
  const maps: NonNullable<ReturnType<NonNullable<ReturnType<Scene['lights'][number]['getShadowGenerator']>>['getShadowMap']>>[] = [];
  const attach = () => {
    for (const l of scene.lights) {
      const m = l.getShadowGenerator?.()?.getShadowMap?.();
      if (m && !m.getCustomRenderList && maps.indexOf(m) < 0) { m.getCustomRenderList = filter as never; maps.push(m); }
    }
  };
  let acc = EVERY_SEC;
  return {
    update(dt: number) {
      acc += dt;
      if (acc < EVERY_SEC) return;
      acc = 0;
      attach();
      const cam = camera().globalPosition, bp = ball();
      const human = entries.map((e) => e.b.human());
      const dist = entries.map((e) => { const p = e.b.root.position; return Math.hypot(p.x - bp.x, p.z - bp.z); });
      const cast = castersFor(dist, entries.map((e) => e.cast), human);
      entries.forEach((e, i) => {
        e.cast = cast[i];
        const p = e.b.root.position, ink = human[i] || inkAt(Math.hypot(p.x - cam.x, p.y + 1 - cam.y, p.z - cam.z), e.ink);
        // (an ink-less body is re-checked every time: the ink pass can reach a part after it was turned off)
        if (ink !== e.ink || !ink) { e.ink = ink; setInk(e, ink); }
      });
    },
    dispose() {
      for (const m of maps) if (m.getCustomRenderList === (filter as never)) m.getCustomRenderList = null;
      for (const e of entries) if (!e.ink) setInk(e, true);
    },
  };
}
