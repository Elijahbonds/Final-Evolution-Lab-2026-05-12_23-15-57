// sideRepBuild — whole guided SETS for the live hip hinge and push-up (MIRROR-MOVES P2, 2026-10-07). Test-only:
// sideRepStage.test.ts and tests/mirror-moves/* are the importers.
//
// The stored fixtures (hinge_side.json, pushup_side.json) are ONE rep each; a live set is a setup hold and then many reps,
// some clean and some not. These build that from the SAME bodies — build.ts hingePose / pushupPose, hingeSetupBuild.ts
// hingeLikePose — filmed through the SAME virtual webcam (lib/pose/synth.ts at FIXTURE_CAMERA), never hand-placed in image
// space (build.ts's header: a hand-placed frame is how the knee sign once shipped backwards). Clean film by default; pass a
// seed for the synth's DEFAULT_NOISE landmark jitter. SYNTHETIC: no real person is in any of these — the owner's
// /dev/pose-record capture is what replaces them (the Phase 2 report says what to record).
import { synthesize, type Joints, type SynthOptions } from '@/lib/pose/synth';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { CLEAN_FILM, FIXTURE_CAMERA, hingePose, pushupPose, type PushupOpts } from './build';
import { hingeLikePose, type HingeLikeOpts } from './hingeSetupBuild';

type V3 = [number, number, number];
const ease = (u: number) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };

/** One rep's depth per frame (0 = the top, 1 = the bottom): down, hold, up, then a beat at the top. */
export function repDepths(down = 30, bottom = 10, up = 30, top = 20): number[] {
  const d: number[] = [];
  for (let i = 0; i < down; i++) d.push(ease((i + 1) / down));
  for (let i = 0; i < bottom; i++) d.push(1);
  for (let i = 0; i < up; i++) d.push(ease(1 - (i + 1) / up));
  for (let i = 0; i < top; i++) d.push(0);
  return d;
}

/** Film a list of bodies at 30 fps: clean, or jittered with `seed` (the synth's default landmark noise). */
export function filmBodies(bodies: Joints[], seed: number | null = null): PoseFrame[] {
  const opt: SynthOptions = seed === null ? CLEAN_FILM : { seed, dropRate: 0, missRate: 0, frameJitterMs: 0, latencyJitterMs: 0 };
  return synthesize({ fps: 30, frames: bodies }, { ...opt, camera: { ...FIXTURE_CAMERA } }).frames;
}

/** The frames for the setup hold before the first rep (1.5 s: past SETUP_HOLD_MS with room). */
export const SETUP_FRAMES = 45;

export interface HingeSetOpts {
  reps: number;
  /** Each rep's shape: build.ts's clean hinge (undefined) or a hingeLikePose variant (a knee-dominant rep, a head poke). */
  rep?: (i: number) => HingeLikeOpts | undefined;
  seed?: number | null;
  /** Standing frames first (default SETUP_FRAMES). */
  setup?: number;
}

/** A guided hinge set, side-on (LEFT shoulder to the camera, build.ts's convention): stand still, then `reps` reps. */
export function hingeSet(o: HingeSetOpts): PoseFrame[] {
  const bodies: Joints[] = Array.from({ length: o.setup ?? SETUP_FRAMES }, () => hingePose(0));
  for (let i = 0; i < o.reps; i++) {
    const shape = o.rep?.(i);
    for (const d of repDepths(36, 15, 36, 20)) bodies.push(shape ? hingeLikePose(d, shape) : hingePose(d));
  }
  return filmBodies(bodies, o.seed ?? null);
}

export interface PushupSetOpts {
  reps: number;
  /** Each rep's body (a sag or a pike: hipOffM; the knee variant) and how deep it goes (0..1 of the full rep, default 1). */
  rep?: (i: number) => (PushupOpts & { depth?: number }) | undefined;
  seed?: number | null;
  setup?: number;
}

/** A guided push-up set, side-on (build.ts's pushupPose): hold the top of the plank, then `reps` reps. */
export function pushupSet(o: PushupSetOpts): PoseFrame[] {
  const first = o.rep?.(0);
  const bodies: Joints[] = Array.from({ length: o.setup ?? SETUP_FRAMES }, () => pushupPose(0, first));
  for (let i = 0; i < o.reps; i++) {
    const r = o.rep?.(i) ?? {};
    const depth = r.depth ?? 1;
    for (const d of repDepths()) bodies.push(pushupPose(d * depth, r));
  }
  return filmBodies(bodies, o.seed ?? null);
}

/** Rotate about the Y axis (+ turns +Z toward +X) — build.ts's own private helper, copied (pure math). */
function rotY(p: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

/**
 * Standing side-on with BOTH elbows bent to ~90° (forearms held forward) — someone getting ready to drop to the floor,
 * or fixing a phone. The push-up's live rep must never count this: the body is upright, not lying along the floor.
 */
export function standingBentArms(): Joints {
  const j = hingeLikePose(0, { view: 'front' });
  for (const s of ['Left', 'Right'] as const) {
    const el = j[`${s}ForeArm`];
    j[`${s}Hand`] = [el[0], el[1], el[2] + 0.25];
  }
  return Object.fromEntries(Object.entries(j).map(([k, p]) => [k, rotY(p as V3, -Math.PI / 2)])) as Joints;
}
