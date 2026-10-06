// Randomise with locks (IMPROVE (2026-10-06), CREATOR-PLAN phase 1; research item 6). Pure: the random source is a
// parameter, so a test (or a "reroll this seed" button) is deterministic.
//
// Draws only from the catalog lists the editors already offer (wearable-catalog), so a roll can never produce a value
// the renderer or the server does not know. A locked section is returned exactly as it came in. Kit colours are rolled
// as a SET from one hue (a jersey, a darker short, shoes and an accent that answer it) rather than four unrelated dice,
// the same idea as fits.ts' colourways.
//
// assumption: 'Hijab' is never rolled. A religious covering is a choice a player makes, not something a dice hands out;
// it stays one tap away in the list.

import {
  SKIN_TONES, FACE_SHAPES, HAIR_STYLES, HAIR_COLORS, EYE_SHAPES, EYE_COLORS, BROWS, MOUTHS, NOSES, type FaceConfig,
} from '../../closet/wearable-catalog';
import {
  FRAME_KEYS, GIRTH_KEYS, GIRTH_RANGE, PROPORTION_RANGES, REACH_SAFE_KEYS, emptyCreatorDoc, type CreatorDoc, type CreatorShape,
} from './doc';

export const RANDOM_SECTIONS = ['skin', 'face', 'hair', 'eyes', 'colours'] as const;
export type RandomSection = typeof RANDOM_SECTIONS[number];

/** What each section rolls, for the lock chips' labels. */
export const RANDOM_SECTION_FIELDS: Record<RandomSection, string> = {
  skin: 'skin tone',
  face: 'face shape, brows, eyes, mouth, nose',
  hair: 'hair style and colour',
  eyes: 'eye colour',
  colours: 'kit colours',
};

const NOT_ROLLED_HAIR = new Set(['Hijab']);

/** mulberry32 — a seeded source for tests and rerolls. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom<T>(list: readonly T[], rnd: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
}

function hsvHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`.toUpperCase();
}

/** A kit colourway from one hue: jersey, a darker short in the same family, shoes and accent from the complement. */
export function rollKitColours(rnd: () => number): Required<CreatorDoc['colours']> {
  const h = rnd() * 360;
  const comp = (h + 150 + rnd() * 60) % 360;
  return {
    jersey: hsvHex(h, 0.55 + rnd() * 0.4, 0.7 + rnd() * 0.3),
    shorts: hsvHex(h, 0.4 + rnd() * 0.4, 0.15 + rnd() * 0.35),
    shoes: hsvHex(rnd() < 0.5 ? h : comp, 0.5 + rnd() * 0.5, 0.6 + rnd() * 0.4),
    accent: hsvHex(comp, 0.7 + rnd() * 0.3, 0.85 + rnd() * 0.15),
  };
}

export interface RandomLook { face: FaceConfig; doc: CreatorDoc | null }

export function randomiseLook(cur: RandomLook, locks: readonly RandomSection[] = [], rnd: () => number = Math.random): RandomLook {
  const locked = new Set(locks);
  const face: FaceConfig = { ...cur.face };
  if (!locked.has('skin')) face.skinTone = pickFrom(SKIN_TONES, rnd);
  if (!locked.has('face')) {
    face.faceShape = pickFrom(FACE_SHAPES, rnd);
    face.brows = pickFrom(BROWS, rnd);
    face.eyeShape = pickFrom(EYE_SHAPES, rnd);
    face.mouth = pickFrom(MOUTHS, rnd);
    face.nose = pickFrom(NOSES, rnd);
  }
  if (!locked.has('hair')) {
    face.hairStyle = pickFrom(HAIR_STYLES.filter((s) => !NOT_ROLLED_HAIR.has(s)), rnd);
    face.hairColor = pickFrom(HAIR_COLORS, rnd);
  }
  if (!locked.has('eyes')) face.eyeColor = pickFrom(EYE_COLORS, rnd);
  let doc = cur.doc;
  if (!locked.has('colours')) doc = { ...(doc ?? emptyCreatorDoc()), colours: rollKitColours(rnd) };
  return { face, doc };
}

// ── shape (CREATOR-PLAN phase 4b) ────────────────────────────────────────────────────────────────────────────────────
// The Shape tab's own roll, with its own locks, so the face tab's Randomise never changes a body (and its tests hold).
// TUNED (2026-10-06, phase 4b): a roll stays well inside the ranges — head, neck, hands and feet 0.9–1.2; legs, torso and
// shoulders anywhere in the play clamp; bulk one build for the whole body (0.82–1.3) with a ±8 % jitter per segment — so
// a dice gives a believable body, and the extremes stay a deliberate slider move.

export const SHAPE_RANDOM_SECTIONS = ['proportions', 'bulk'] as const;
export type ShapeRandomSection = typeof SHAPE_RANDOM_SECTIONS[number];
export const SHAPE_RANDOM_FIELDS: Record<ShapeRandomSection, string> = {
  proportions: 'head, neck, hands, feet, legs, torso, shoulders',
  bulk: 'bulk per body part',
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function randomiseShape(cur: CreatorShape, locks: readonly ShapeRandomSection[] = [], rnd: () => number = Math.random): CreatorShape {
  const locked = new Set(locks);
  const out: CreatorShape = { ...cur, body: { ...cur.body } };
  if (cur.girth) out.girth = { ...cur.girth };
  if (!locked.has('proportions')) {
    for (const k of REACH_SAFE_KEYS) out.body[k] = r2(0.9 + rnd() * 0.3);
    for (const k of FRAME_KEYS) { const [lo, hi] = PROPORTION_RANGES[k]; out.body[k] = r2(lo + rnd() * (hi - lo)); }
  }
  if (!locked.has('bulk')) {
    const build = 0.82 + rnd() * 0.48;
    const girth: NonNullable<CreatorShape['girth']> = {};
    for (const k of GIRTH_KEYS) girth[k] = r2(Math.min(GIRTH_RANGE[1], Math.max(GIRTH_RANGE[0], build * (0.92 + rnd() * 0.16))));
    out.girth = girth;
  }
  return out;
}
