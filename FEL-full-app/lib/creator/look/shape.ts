// SHAPE V2, the pure half (IMPROVE (2026-10-06), CREATOR-PLAN phase 4b). What a doc's shape values become on a body in a
// given place: which proportions apply where, at what value, and the bulk per segment. No Babylon, no DOM.
//
// THE RULE (REACH-FREEZE + owner decision 2026-10-06). A shape never changes a hitbox, a reach or a gameplay number:
//   - the REACH-SAFE proportions (head, neck, hands, feet) move no shoulder, elbow or hand-bone origin, so they apply in
//     every mode, ranked included, at their full stored value;
//   - the FRAME KEYS (legs, torso, shoulders) move where the hands sit, so — like height and build — they stay inside
//     the play clamp and are exactly 1.0 in a ranked session and every STANDARD_FRAME_MODES mode (playFrame.ts);
//   - BULK (girth) moves no bone at all (a procedural inflate on the mesh), so it applies everywhere;
//   - the PRESENTATION scale is not here: it is a slot field only a Studio or photo scene reads (shape/presentation.ts).
// lib/babylon/creator/shape/renderShape.ts puts the answer on a body.

import { COSMETIC_CLAMP, isStandardFrame, type PlayContext } from '../../babylon/core/playFrame';
import {
  FRAME_KEYS, GIRTH_KEYS, GIRTH_RANGE, PROPORTION_KEYS, PROPORTION_RANGES,
  type CreatorShape, type GirthKey, type ProportionKey,
} from './doc';

export type BodyShape = Record<ProportionKey, number>;
export type GirthShape = Record<GirthKey, number>;
export interface EffectiveShape { body: BodyShape; girth: GirthShape }

const isFrameKey = (k: ProportionKey): boolean => (FRAME_KEYS as readonly string[]).includes(k);
const clamp = (v: unknown, lo: number, hi: number): number =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 1);

/** The play clamp each frame key lives inside: legs and torso move the body's height, shoulders its width. */
export const FRAME_KEY_CLAMP: Record<(typeof FRAME_KEYS)[number], readonly [number, number]> = {
  legs: COSMETIC_CLAMP.height, torso: COSMETIC_CLAMP.height, shoulders: COSMETIC_CLAMP.build,
};

/** Every proportion and every segment's bulk at 1 — the body as modelled. */
export function neutralShape(): EffectiveShape {
  const body = {} as BodyShape;
  for (const k of PROPORTION_KEYS) body[k] = 1;
  const girth = {} as GirthShape;
  for (const k of GIRTH_KEYS) girth[k] = 1;
  return { body, girth };
}

/**
 * The shape a body is drawn with HERE. Frame keys: 1.0 when ranked or in a standard-frame mode, otherwise clamped to the
 * play clamp (FRAME_KEY_CLAMP; the stored range is the same numbers). Reach-safe keys and bulk: clamped to their ranges,
 * the same everywhere. A missing or non-numeric value is 1.
 */
export function effectiveShape(shape: Pick<CreatorShape, 'body' | 'girth'> | null | undefined, ctx: PlayContext = {}): EffectiveShape {
  const out = neutralShape();
  const standard = isStandardFrame(ctx);
  for (const k of PROPORTION_KEYS) {
    if (isFrameKey(k)) {
      if (standard) continue;
      const [lo, hi] = FRAME_KEY_CLAMP[k as keyof typeof FRAME_KEY_CLAMP];
      out.body[k] = clamp(shape?.body?.[k], lo, hi);
    } else {
      const [lo, hi] = PROPORTION_RANGES[k];
      out.body[k] = clamp(shape?.body?.[k], lo, hi);
    }
  }
  for (const k of GIRTH_KEYS) out.girth[k] = clamp(shape?.girth?.[k], GIRTH_RANGE[0], GIRTH_RANGE[1]);
  return out;
}

/** True when the shape changes nothing (every value 1). */
export function isNeutralShape(s: EffectiveShape): boolean {
  return PROPORTION_KEYS.every((k) => s.body[k] === 1) && GIRTH_KEYS.every((k) => s.girth[k] === 1);
}

// ── which bones each value acts through (the kit's 22-joint FEL spec) ─────────────────────────────────────────────────

/** The bones whose skin weight carries each segment's bulk. The clavicles ride the chest; the hips belong to no segment
 *  (the bulk tapers to nothing across the pelvis, through the skin weights). */
export const GIRTH_BONES: Record<GirthKey, readonly string[]> = {
  head: ['Head'],
  neck: ['Neck'],
  chest: ['Spine2', 'LeftShoulder', 'RightShoulder'],
  belly: ['Spine', 'Spine1'],
  upperArms: ['LeftArm', 'RightArm'],
  forearms: ['LeftForeArm', 'RightForeArm'],
  thighs: ['LeftUpLeg', 'RightUpLeg'],
  calves: ['LeftLeg', 'RightLeg'],
};

/** The mesh-scale groups (hands and feet are scaled as a MESH, about a pivot, never as a bone: the hand bone carries the
 *  ball, a staff or a bat, and its scale would scale them too — ballRig.attachBallToHand, arsenal.equipWeapon). */
export const SCALE_GROUPS = {
  LeftHand: { key: 'hands', bones: ['LeftHand'] },
  RightHand: { key: 'hands', bones: ['RightHand'] },
  LeftFoot: { key: 'feet', bones: ['LeftFoot', 'LeftToeBase'] },
  RightFoot: { key: 'feet', bones: ['RightFoot', 'RightToeBase'] },
} as const satisfies Record<string, { key: ProportionKey; bones: readonly string[] }>;
export type ScaleGroup = keyof typeof SCALE_GROUPS;

/** The joints whose bind offset a frame key lengthens (each child joint's offset from its parent, along the bone). */
export const FRAME_JOINTS: Record<(typeof FRAME_KEYS)[number], readonly string[]> = {
  legs: ['LeftLeg', 'LeftFoot', 'RightLeg', 'RightFoot'],
  torso: ['Spine', 'Spine1', 'Spine2'],
  shoulders: ['LeftArm', 'RightArm'],
};

/**
 * A joint offset lengthened by `s`, absolutely from its bind offset: `bind × s`. Moving a child joint along its bone
 * lengthens the bone without scaling any node, so a bent knee cannot shear and nothing compounds down the chain (the
 * shin keeps its length when the thigh grows; applying twice is applying once).
 */
export function lengthenedOffset(bind: readonly [number, number, number], s: number): [number, number, number] {
  return [bind[0] * s, bind[1] * s, bind[2] * s];
}

/**
 * The head joint's offset for a neck multiplier: the bind offset plus `up` × (neck − 1) × the visible neck's length.
 * `up` is the body's up direction in the Neck bone's own space (unit); `neckLength` is measured off the mesh (the span
 * of the vertices the Neck bone dominates), because the kit's Neck→Head joint offset is only ~4 cm.
 */
export function neckOffset(bind: readonly [number, number, number], up: readonly [number, number, number], neck: number, neckLength: number): [number, number, number] {
  const d = (neck - 1) * neckLength;
  return [bind[0] + up[0] * d, bind[1] + up[1] * d, bind[2] + up[2] * d];
}

/** How far the skeleton is lifted so longer legs stand on the floor (and shorter ones do not float): (legs − 1) × the
 *  rest height of the hip joints above the ankles. */
export function legLift(legs: number, hipToAnkle: number): number {
  return (legs - 1) * hipToAnkle;
}
