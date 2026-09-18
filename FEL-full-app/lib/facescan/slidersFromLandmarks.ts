// slidersFromLandmarks — photo-to-avatar LIKENESS (Phase 3, ship pass 2026-09-02).
//
// faceFromLandmarks.ts snaps a scan to the Closet's named presets. This maps
// the same MediaPipe FaceMesh landmarks (478, canonical indices) to the forge's
// CONTINUOUS morph sliders, so the avatar carries the person's proportions,
// not the nearest of six shapes. Pure: ratios only, no pixels, unit-tested.
//
// Every ratio is normalised by the inter-ocular distance (outer eye corners)
// so camera distance and photo size cancel out. Each ratio is then placed
// against a population-typical band and mapped to 0..1 — 0 means "no more
// than the neutral forge head already has", 1 means "as far as the morph goes".

import type { FaceMorphName } from '../babylon/core/faceMorphs';

export interface LM { x: number; y: number; z?: number }

// canonical FaceMesh indices
const I = {
  eyeOuterL: 33, eyeOuterR: 263,
  forehead: 10, chin: 152,
  cheekL: 234, cheekR: 454,          // widest points of the face
  jawL: 172, jawR: 397,              // gonial angles
  templeL: 127, templeR: 356,        // forehead width
  browL: 105, browR: 334,            // brow arch peaks
  eyeTopL: 159, eyeTopR: 386,        // upper eyelid centres
  lipTop: 13, lipBottom: 14,
} as const;

const dist = (a: LM, b: LM) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Map a ratio inside [lo, hi] to 0..1 (linear, clamped). */
const band = (v: number, lo: number, hi: number) => clamp01((v - lo) / (hi - lo));

export type FaceSliders = Partial<Record<FaceMorphName, number>>;

/**
 * Derive slider weights from landmarks. Returns {} when the landmark set is
 * too short to be a FaceMesh result, so a failed scan never sculpts a face.
 */
export function slidersFromLandmarks(lm: LM[]): FaceSliders {
  if (!lm || lm.length < 468) return {};
  const iod = dist(lm[I.eyeOuterL], lm[I.eyeOuterR]);
  if (!(iod > 1e-6)) return {};
  const faceLen   = dist(lm[I.forehead], lm[I.chin]) / iod;      // typical ~1.55..2.0
  const cheekW    = dist(lm[I.cheekL], lm[I.cheekR]) / iod;      // typical ~1.35..1.6
  const jawW      = dist(lm[I.jawL], lm[I.jawR]) / iod;          // typical ~1.0..1.35
  const templeW   = dist(lm[I.templeL], lm[I.templeR]) / iod;    // typical ~1.25..1.5
  const browLift  = ((lm[I.eyeTopL].y - lm[I.browL].y) + (lm[I.eyeTopR].y - lm[I.browR].y)) / 2 / iod; // ~0.10..0.22
  const mouthOpen = dist(lm[I.lipTop], lm[I.lipBottom]) / iod;  // ~0 closed .. 0.25 open

  const out: FaceSliders = {};
  const long = band(faceLen, 1.72, 2.05);            if (long > 0) out.faceLong = long;
  const round = band(cheekW - jawW * 0.0, 1.48, 1.68) * band(2.0 - faceLen, 0.1, 0.4);
  if (round > 0) out.faceRound = round;
  const square = band(jawW, 1.18, 1.40);             if (square > 0) out.faceSquare = square;
  const heart = band(cheekW - jawW, 0.36, 0.56);     if (heart > 0) out.faceHeart = heart;
  // diamond = cheekbones wider than BOTH the jaw and the temples
  const diamond = band(cheekW - Math.max(jawW, templeW), 0.25, 0.40);
  if (diamond > 0) out.faceDiamond = diamond;
  const brow = band(browLift, 0.15, 0.24);           if (brow > 0) out.browRaise = brow;
  const jaw = band(mouthOpen, 0.08, 0.22);           if (jaw > 0) out.jawOpen = jaw;
  for (const k of Object.keys(out) as FaceMorphName[]) out[k] = Math.round(out[k]! * 1000) / 1000;
  return out;
}
