// WHO SCENE IT — the cinematics (vis-party, 2026-10-13; docs/VISUAL-PASS-PLAN.md Part B, who_scene_it). Pure, so a test can
// hold each to its rules; WhoSceneItMode.ts only feeds them time and applies what they say.
//
//   WHIP-PAN   A question's venue arrives with the camera swinging in from the side and settling into the sweep, under a brief
//              bloom flare that hides the cut. The venue is mounted at once (nothing about the clock or the card waits for it) —
//              only the camera's yaw is offset, easing to nothing.
//   PUSH-IN    A right answer's reveal narrows the lens a touch for the beat the card holds; a wrong answer or a timeout does not
//              (nothing to celebrate), and the lens eases back out with the next question.
//   GRADE      Each venue brings its own grade (exposure, contrast, vignette — venueSpecs `environment.grade`): the rig owns the
//              grade now (visual-foundation A9.3), so the venue's own look stopped reaching the screen. The per-question grade is
//              blended toward the venue's, eased so a question does not pop, and never leaves a safe range.
//
// Reduced motion removes the whip (no yaw offset) and the flare; the push-in is a lens change, not a flash, and stays small.

/** TUNED (new): how long the whip-pan takes to settle, and how far (radians) the camera starts round the sweep. */
export const WHIP_SEC = 0.6;
export const WHIP_SWING = 1.5;

/** Ease-out cubic, 0..1 → 0..1. */
export const easeOut = (k: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

/** The extra yaw (radians) added to the sweep `age` seconds after a venue is shown: starts at WHIP_SWING and eases to 0. */
export function whipYaw(age: number, reduced = false): number {
  if (reduced || age >= WHIP_SEC) return 0;
  return WHIP_SWING * (1 - easeOut(age / WHIP_SEC));
}

/** TUNED (new): the lens at the reveal's peak, as a share of the base field of view, and how long it takes to get there. */
export const PUSH_FOV = 0.9;
export const PUSH_SEC = 0.5;
/** The field-of-view share for the reveal `age` seconds in: a right answer pushes in, anything else leaves the lens alone. */
export function pushFov(age: number, correct: boolean): number {
  if (!correct) return 1;
  return 1 + (PUSH_FOV - 1) * easeOut(age / PUSH_SEC);
}

export interface GradeLike { exposure: number; contrast: number; vignette: number }

/** TUNED (new): how far toward the venue's own grade a question goes (the rest is the rig's mood), and the safe range. */
export const GRADE_BLEND = 0.5;
export const GRADE_RANGE = { exposure: [0.85, 1.4], contrast: [1.0, 1.55], vignette: [0, 2.2] } as const;

const clamp = (v: number, [lo, hi]: readonly [number, number] | readonly number[]): number => Math.min(hi, Math.max(lo, v));

/** A venue spec's grade in the pipeline's units (the spec's `vignette` is ×4 on the pipeline, as NexusWebScene.applyVenueGrade did). */
export function pipelineGrade(spec: GradeLike): GradeLike {
  return { exposure: spec.exposure, contrast: spec.contrast, vignette: spec.vignette * 4 };
}

/** The grade a question runs at: the rig's resting grade pulled `blend` of the way to the venue's, kept in range. Pure. */
export function questionGrade(rest: GradeLike, venue: GradeLike | null, blend = GRADE_BLEND): GradeLike {
  if (!venue) return { ...rest };
  const mix = (a: number, b: number): number => a + (b - a) * blend;
  return {
    exposure: clamp(mix(rest.exposure, venue.exposure), GRADE_RANGE.exposure),
    contrast: clamp(mix(rest.contrast, venue.contrast), GRADE_RANGE.contrast),
    vignette: clamp(mix(rest.vignette, venue.vignette), GRADE_RANGE.vignette),
  };
}

/** Ease `cur` toward `to` in place at `rate` per second (no allocation per frame); returns whether it moved. */
export function stepGrade(cur: GradeLike, to: GradeLike, dt: number, rate = 4): boolean {
  const k = Math.min(1, dt * rate);
  let moved = false;
  for (const key of ['exposure', 'contrast', 'vignette'] as const) {
    const d = to[key] - cur[key];
    if (Math.abs(d) < 1e-4) { if (d !== 0) { cur[key] = to[key]; moved = true; } continue; }
    cur[key] += d * k; moved = true;
  }
  return moved;
}
