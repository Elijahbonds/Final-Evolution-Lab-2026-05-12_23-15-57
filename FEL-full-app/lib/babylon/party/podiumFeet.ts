// podiumFeet — both feet ON the surface a podium body stands on, in every clip (BRAINBRAWL-POLISH-2 N8, 2026-09-24).
//
// The eye measured Brain Brawl's contestants with their toe joints 0.6–6.7 cm above the riser top (0.552), highest in
// party_shrug. The spawn's ground snap is right exactly once: it sits the posed sole on the riser at spawn. The party clips are
// authored in body space, though — a bent knee or a hipsY lift raises the feet off whatever the body stands on — and nothing
// brought them back down: FootPlanting pins a planted foot HORIZONTALLY and keeps the clip's own height. So, every frame, after
// the clips and FootPlanting have run:
//   1. the root drops (or rises) so the LOWER toe sits at its standing height over the surface;
//   2. the other foot, when the clip holds it a few millimetres to a few centimetres up (a soft knee, a hip-shot stance), is
//      brought down onto the surface by the same two-bone solver FootPlanting uses. A foot the clip really lifts (more than
//      MAX_REACH) is left where the clip put it.
// The standing height is the toe joint's height over the body's lowest point, measured once from the posed mesh on the first
// frame (the measure the ground snap itself makes), so it holds for any body in the cast.

import type { Node, Observer, Scene, TransformNode } from '@babylonjs/core';
import type { SpawnedCharacter } from '../core/CharacterLibrary';
import { boneNode } from '../anim/boneLookup';
import { plantLeg } from '../anim/FootPlanting';

/** How far the root may move from where the spawn snapped it (a bad bone read must never sink or float a body by a metre). */
export const MAX_SHIFT = 0.15;
/** A foot held higher than this over the surface is a lift the clip means; it is not pulled down. */
export const MAX_REACH = 0.1;
/** Below this a foot already counts as down. */
const EPS = 0.002;

export interface FeetPlan {
  /** Move the root by this (m, world y). */
  rootDy: number;
  /** Bring each foot (left, right) down by this after the root has moved (0 = leave it). */
  drop: [number, number];
}

/**
 * The plan for one frame (pure). `toe` is each toe joint's world y, `floorY` the height a planted toe joint sits at (the
 * surface plus the standing height), `rootY` the root's y now and `baseY` where the spawn snapped it.
 */
export function planFeet(toe: [number, number], floorY: number, rootY: number, baseY: number): FeetPlan {
  const want = rootY + (floorY - Math.min(toe[0], toe[1]));
  const next = Math.max(baseY - MAX_SHIFT, Math.min(baseY + MAX_SHIFT, want));
  const dy = next - rootY;
  const drop = toe.map((t) => { const f = t + dy - floorY; return f > EPS && f <= MAX_REACH ? f : 0; }) as [number, number];
  return { rootDy: dy, drop };
}

export interface PodiumFeet {
  /** The standing height measured at the first frame (m), and the last frame's toe heights over the surface (for probes). */
  readonly debug: { restToe: number | null; toe: [number, number]; rootDy: number };
  dispose(): void;
}

/** Recompute a node's world matrix from the top of its parent chain down (the clips have just rewritten the locals). */
function refresh(n: TransformNode): void {
  const chain: TransformNode[] = [];
  for (let p: Node | null = n; p; p = p.parent) chain.unshift(p as TransformNode);
  for (const c of chain) c.computeWorldMatrix?.(true);
}

/** Keep `body`'s feet on a surface at world height `surfaceY` (the riser's top, the stage deck). Null when the rig has no legs. */
export function plantFeet(scene: Scene, body: SpawnedCharacter, surfaceY: number): PodiumFeet | null {
  const sk = body.skeleton;
  const legs = (['Left', 'Right'] as const).map((side) => ({
    hip: boneNode(sk, `${side}UpLeg`), knee: boneNode(sk, `${side}Leg`), ankle: boneNode(sk, `${side}Foot`),
    toe: boneNode(sk, `${side}ToeBase`) ?? boneNode(sk, `${side}Foot`),
  }));
  if (legs.some((l) => !l.hip || !l.knee || !l.ankle || !l.toe)) return null;
  const debug: PodiumFeet['debug'] = { restToe: null, toe: [0, 0], rootDy: 0 };
  const baseY = body.root.position.y;
  const toeY = (i: number): number => { refresh(legs[i].toe!); return legs[i].toe!.getAbsolutePosition().y; };

  const obs: Observer<Scene> | null = scene.onAfterAnimationsObservable.add(() => {
    if (body.root.isDisposed() || !body.root.isEnabled()) return;
    if (debug.restToe === null) {
      // the standing height: the toe joint over the posed mesh's lowest point, this frame (skin matrices from these nodes)
      sk.prepare(true);
      let minY = Infinity;
      for (const m of body.meshes) {
        if (!(m.getTotalVertices?.() > 0) || !m.skeleton) continue;
        m.computeWorldMatrix(true); m.refreshBoundingInfo(true, true);
        minY = Math.min(minY, m.getBoundingInfo().boundingBox.minimumWorld.y);
      }
      if (!Number.isFinite(minY)) return;
      debug.restToe = Math.max(0, Math.min(toeY(0), toeY(1)) - minY);
    }
    const floorY = surfaceY + debug.restToe;
    const plan = planFeet([toeY(0), toeY(1)], floorY, body.root.position.y, baseY);
    if (Math.abs(plan.rootDy) > 1e-5) body.root.position.y += plan.rootDy;
    debug.rootDy = body.root.position.y - baseY;
    plan.drop.forEach((d, i) => {
      if (d <= 0) return;
      const l = legs[i];
      refresh(l.ankle!);
      const target = l.ankle!.getAbsolutePosition().clone(); target.y -= d;
      plantLeg(l.hip!, l.knee!, l.ankle!, target, body.root.forward);
    });
    debug.toe = [toeY(0) - surfaceY, toeY(1) - surfaceY];
  });
  return { debug, dispose() { if (obs) scene.onAfterAnimationsObservable.remove(obs); } };
}
