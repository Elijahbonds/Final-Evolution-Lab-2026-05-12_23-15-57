// lib/library/demo.ts — EXERCISE-LIBRARY (2026-10-25): the demo data the follow-up lanes render.
//
// Owner decision (2026-10-25): every exercise gets all four demos — the 3D avatar, a coach video, a muscle view on the
// 3D body, and text cues and faults. This lane ships the text and the data the other three key on:
//   · CLIP_KEYS — one avatar clip key per movement shape, chosen BY PATTERN (and family where a pattern holds two
//     shapes: a jump is locomotion, so is a sprint). CLIP_COVERAGE says which keys the shipped rig can already play
//     (components/coach/exercise-avatar-canvas.tsx loads public/models/elijah.glb); the rest are null until the avatar
//     clip lane authors them, and a card shows no avatar for an uncovered key rather than the wrong motion.
//   · muscleMap — an entry's primary and secondary muscles as anatomy-mesh keys (vocab.ts MUSCLES.anatomyKey).
//   · reviewMovementOf — which camera review (the form-review lane's squat / lunge / hinge / push-up) an entry gets,
//     from its pattern, family and laterality — never from its English name.
//
// Pure. Client-safe.

import { MUSCLES, type MovementPattern, type MuscleId } from './vocab';

export const CLIP_KEYS = [
  'idle', 'squat', 'hinge', 'lunge', 'push', 'pull', 'carry', 'rotate', 'brace', 'jump', 'hop', 'bound', 'sprint',
  'shuffle', 'backpedal', 'dribble', 'shoot', 'layup', 'stretch', 'breathe', 'throw', 'crawl',
] as const;
export type ClipKey = (typeof CLIP_KEYS)[number];
export const isClipKey = (v: unknown): v is ClipKey => typeof v === 'string' && (CLIP_KEYS as readonly string[]).includes(v);

/**
 * Clip key → the rig clip that plays it today, or null (not authored yet). The three non-null ones are the clips the
 * shipped demo already loops (exercise-avatar-canvas.tsx clipForStat): this lane maps onto them, it adds no motion.
 */
export const CLIP_COVERAGE: Readonly<Record<ClipKey, string | null>> = {
  idle: 'idle_stand', jump: 'jump_up', hop: 'jump_up', bound: 'jump_up', sprint: 'run_forward',
  squat: null, hinge: null, lunge: null, push: null, pull: null, carry: null, rotate: null, brace: null, shuffle: null,
  backpedal: null, dribble: null, shoot: null, layup: null, stretch: null, breathe: null, throw: null, crawl: null,
};

/** The clip a pattern shows when its family names no better one. */
export const CLIP_BY_PATTERN: Readonly<Record<MovementPattern, ClipKey>> = {
  squat: 'squat', hinge: 'hinge', lunge: 'lunge', push: 'push', pull: 'pull', carry: 'carry', rotation: 'rotate',
  locomotion: 'sprint', breath: 'breathe', mobility: 'stretch', other: 'idle',
};

/** Families whose motion is not their pattern's default. */
const CLIP_BY_FAMILY: Readonly<Record<string, ClipKey>> = {
  pogo: 'hop', 'line-hop': 'hop', 'ankle-hop': 'hop', 'single-leg-hop': 'hop', 'hurdle-hop': 'hop', 'jump-rope': 'hop',
  'box-jump': 'jump', 'broad-jump': 'jump', 'squat-jump': 'jump', 'countermovement-jump': 'jump', 'approach-jump': 'jump',
  'depth-drop': 'jump', 'depth-jump': 'jump', 'tuck-jump': 'jump', 'split-jump': 'jump', 'seated-box-jump': 'jump', 'jump': 'jump',
  'lateral-bound': 'bound', 'skater-bound': 'bound', bound: 'bound',
  'defensive-slide': 'shuffle', shuffle: 'shuffle', closeout: 'shuffle', backpedal: 'backpedal',
  dribble: 'dribble', 'two-ball': 'dribble', layup: 'layup', finish: 'layup', 'form-shot': 'shoot', shot: 'shoot',
  'med-ball-throw': 'throw', 'med-ball-slam': 'throw', crawl: 'crawl', plank: 'brace', 'side-plank': 'brace',
  'dead-bug': 'brace', 'bird-dog': 'brace', pallof: 'brace', 'breath-drill': 'breathe',
};

export function clipKeyFor(pattern: MovementPattern, family: string): ClipKey {
  return CLIP_BY_FAMILY[family] ?? CLIP_BY_PATTERN[pattern];
}

/** The rig clip to play, or null when the avatar cannot show this motion yet. */
export function avatarClip(key: ClipKey | null | undefined): string | null {
  return key ? CLIP_COVERAGE[key] ?? null : null;
}

/** How many of the keys the rig covers today (the avatar clip lane's backlog is the rest). */
export function clipCoverage(): { covered: ClipKey[]; missing: ClipKey[] } {
  const covered = CLIP_KEYS.filter((k) => CLIP_COVERAGE[k] !== null);
  return { covered, missing: CLIP_KEYS.filter((k) => CLIP_COVERAGE[k] === null) };
}

const ANATOMY: ReadonlyMap<string, string> = new Map(MUSCLES.map((m) => [m.id, m.anatomyKey]));

/** The anatomy view's input: mesh keys, primary and secondary, no repeats. */
export function muscleMap(e: { primaryMuscles: readonly MuscleId[]; secondaryMuscles: readonly MuscleId[] }): { primary: string[]; secondary: string[] } {
  const primary = [...new Set(e.primaryMuscles.map((m) => ANATOMY.get(m) ?? m))];
  const secondary = [...new Set(e.secondaryMuscles.map((m) => ANATOMY.get(m) ?? m))].filter((m) => !primary.includes(m));
  return { primary, secondary };
}

// ── the camera review, by pattern ─────────────────────────────────────────────────────────────────────────────────

export type ReviewMovement = 'squat' | 'lunge' | 'hinge' | 'pushup';

/** Families the camera's push-up review reads (a push-up from the floor; not a press, not a dip). */
const PUSHUP_FAMILIES = new Set(['push-up']);

/**
 * Which camera review fits a library entry, from its structured tags only: the lunge pattern (split stance, step-ups,
 * split squats) is a lunge whatever it is called; a two-foot squat pattern is a squat; a two-foot hinge is a hinge; only the floor push-up
 * family is the push-up. Everything else (a single-leg hinge, a press, a jump) has no review yet: null.
 * The form-review lane (lib/coach/formReview/movements.ts on lane/coach-video-review, not on this lane's base) matches
 * catalogue rows by English name; a catalogue row copied from the library carries libraryExerciseId, so that matcher
 * can call this first and keep its name rules for rows a coach wrote by hand.
 */
export function reviewMovementOf(e: { pattern: MovementPattern; family: string; laterality: string }): ReviewMovement | null {
  if (PUSHUP_FAMILIES.has(e.family)) return 'pushup';
  if (e.pattern === 'lunge') return 'lunge';
  // a single-leg squat (pistol, skater) is neither the two-foot squat nor the split stance the lunge audit reads
  if (e.pattern === 'squat') return e.laterality === 'bilateral' ? 'squat' : null;
  if (e.pattern === 'hinge') return e.laterality === 'bilateral' ? 'hinge' : null;
  return null;
}
