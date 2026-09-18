/**
 * lib/feel/cores/karate-constants.ts
 * ==================================
 * M9 Step 3 — per-mode constants for the karate family (karate, karate-vs)
 * skinned onto the Court/free-3D core.
 *
 * Combat tunables ported from the proven engineering-line KarateMode
 * (game__modes__karate__KarateMode.js) plus the strike-window scaffolding the
 * shared-core skin needs. EVERY value is // TUNE(elijah). Preserves the
 * reference combat numbers verbatim; the live components/games/karate-3d.tsx
 * keeps its own inline hit-stop (0.04s punch) untouched — migrating it onto
 * this skin is visual-acceptance-gated.
 *
 * Pure data. No THREE / DOM.
 */

/** Damage by strike type — verbatim from KarateMode STRIKE_DAMAGE. */
export const STRIKE_DAMAGE = {
  light: 8, // TUNE(elijah)
  heavy: 15, // TUNE(elijah)
  special: 25, // TUNE(elijah) — Dragon Strike
  counter: 18, // TUNE(elijah)
} as const;

export type StrikeType = keyof typeof STRIKE_DAMAGE;

/** Defensive timing windows — verbatim from KarateMode. */
export const DODGE_IFRAME_MS = 400; // TUNE(elijah) — invincibility on dodge
export const BLOCK_WINDOW_MS = 800; // TUNE(elijah) — guard active window on tap
export const HIT_STUN_MS = 300; // TUNE(elijah) — stagger + KO hit-stop (spec: KO 0.3s)
export const SPECIAL_CHAIN_REQ = 8; // TUNE(elijah) — combo chain to unlock Dragon Strike

/** Match + HP shape — verbatim from KarateMode. */
export const MATCH_TIME_SECONDS = 180; // TUNE(elijah)
export const MAX_HP = 100; // TUNE(elijah)
export const LOW_HP_THRESHOLD = 25; // TUNE(elijah) — low-HP aura trigger

/**
 * Strike animation windows (NEW shared-core scaffolding — the reference drove
 * these off anim clip lengths). Windup → active (the contact frame lives here)
 * → recovery. Light is snappy, special commits hard. // TUNE(elijah)
 */
export const STRIKE_TIMING_MS: Record<StrikeType, { windup: number; active: number; recovery: number }> = {
  light: { windup: 70, active: 60, recovery: 120 }, // TUNE(elijah)
  heavy: { windup: 140, active: 80, recovery: 220 }, // TUNE(elijah)
  special: { windup: 220, active: 120, recovery: 320 }, // TUNE(elijah) — commits hard
  counter: { windup: 90, active: 70, recovery: 160 }, // TUNE(elijah)
};

/** PRQ deltas per combat event — verbatim from KarateMode prqSystem. */
export const PRQ_DELTAS = {
  dodge: 6, // TUNE(elijah)
  block: 4, // TUNE(elijah)
  strikePerHit: (dmg: number) => Math.max(1, Math.round(dmg / 8)), // TUNE(elijah)
  takeHit: (dmg: number) => -Math.max(2, Math.round(dmg / 6)), // TUNE(elijah)
} as const;

/**
 * SensoryBus event presets for the karate family (FEEL_REFERENCE_SPEC §6 +
 * M9 karate line: hits, KO 0.3s hit-stop, Dragon Strike crimson + slow-mo).
 * shake / hitStopMs / rumble tuned to read on the contact frame. // TUNE(elijah)
 */
export const KARATE_SENSORY = {
  lightHit: { sfx: 'punch', shake: 0.10, hitStopMs: 40, rumbleMs: 60, rumbleStrength: 0.4 }, // TUNE(elijah)
  heavyHit: { sfx: 'punch', shake: 0.22, hitStopMs: 90, rumbleMs: 110, rumbleStrength: 0.7 }, // TUNE(elijah)
  block: { sfx: 'punch', shake: 0.06, hitStopMs: 30, rumbleMs: 40, rumbleStrength: 0.3 }, // TUNE(elijah) — perfect guard
  dragonStrike: { sfx: 'punch', shake: 0.40, hitStopMs: 300, rumbleMs: 200, rumbleStrength: 1.0 }, // TUNE(elijah) — crimson + slow-mo
  ko: { sfx: 'crowd', shake: 0.45, hitStopMs: 300, rumbleMs: 260, rumbleStrength: 1.0 }, // TUNE(elijah) — 0.3s KO hit-stop
} as const;

/** SFX name→url map (the app already ships these MP3s). */
export const KARATE_SFX = {
  punch: '/audio/sfx_punch_impact.mp3',
  crowd: '/audio/sfx_crowd_cheer.mp3',
} as const;

/** Fighter footwork bounds (matches live karate-3d ARENA ±6). // TUNE(elijah) */
export const KARATE_ARENA = { minX: -6, maxX: 6, minZ: -6, maxZ: 6 } as const;
