// faceFromLandmarks (M31) — turn a MediaPipe FaceLandmarker result (478 3D
// normalized landmarks) + optional sampled skin/eye colors into a FLAT FaceConfig
// (the real Closet schema). Everything here is pure + deterministic so the same
// face always yields the same avatar. Hair is NOT derivable from geometry, so we
// leave it to defaultFace()/the Closet picker.
//
// HARD RULE: this maps to the NAMED options the Closet already ships
// (FACE_SHAPES / EYE_SHAPES / NOSES / MOUTHS / BROWS / SKIN_TONES) — never
// invents new option strings.

import {
  type FaceConfig, defaultFace,
  SKIN_TONES, FACE_SHAPES, EYE_SHAPES, NOSES, MOUTHS, BROWS, EYE_COLORS,
} from '@/lib/closet/wearable-catalog';

export interface Landmark { x: number; y: number; z: number }

// ── canonical FaceMesh indices (subset we need) ────────────────────────────
const L = {
  foreheadTop: 10, chin: 152,
  cheekL: 234, cheekR: 454,
  jawL: 172, jawR: 397,
  templeL: 127, templeR: 356,
  // left eye
  eyeLouter: 33, eyeLinner: 133, eyeLup: 159, eyeLdown: 145,
  // right eye
  eyeRinner: 362, eyeRouter: 263, eyeRup: 386, eyeRdown: 374,
  // brows (above eye)
  browL: 105, browR: 334,
  // mouth
  mouthL: 61, mouthR: 291, lipTop: 13, lipBottom: 14, lipCupid: 0,
  // nose
  noseTip: 1, noseAlaL: 129, noseAlaR: 358, noseBridge: 168,
};

const dist = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Snap an arbitrary rgb hex to the nearest catalog swatch (perceptual-ish). */
function nearestSwatch(hex: string, palette: string[]): string {
  const [r, g, b] = hexToRgb(hex);
  let best = palette[0];
  let bestD = Infinity;
  for (const c of palette) {
    const [cr, cg, cb] = hexToRgb(c);
    // weighted euclidean (luma-biased) — good enough for skin/eye snapping
    const d = 2 * (r - cr) ** 2 + 4 * (g - cg) ** 2 + 3 * (b - cb) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/**
 * Map 478 landmarks (+ optional sampled colors) to a partial FaceConfig.
 * @param lm      landmarks array from FaceLandmarker (normalized 0..1)
 * @param skinHex optional cheek-sampled color "#rrggbb"
 * @param eyeHex  optional iris-sampled color "#rrggbb"
 */
export function faceFromLandmarks(
  lm: Landmark[],
  skinHex?: string,
  eyeHex?: string,
): Partial<FaceConfig> {
  if (!lm || lm.length < 468) return {};
  const out: Partial<FaceConfig> = {};

  // ── face shape: width/height ratio + jaw-vs-cheek taper + forehead width ──
  const faceW = dist(lm[L.cheekL], lm[L.cheekR]);
  const faceH = dist(lm[L.foreheadTop], lm[L.chin]);
  const jawW = dist(lm[L.jawL], lm[L.jawR]);
  const templeW = dist(lm[L.templeL], lm[L.templeR]);
  const whr = faceW / (faceH || 1e-6);          // width:height
  const jawTaper = jawW / (faceW || 1e-6);        // 1 = square jaw, <0.8 = pointed
  const foreheadTaper = templeW / (faceW || 1e-6);
  let faceShape = 'Oval';
  if (whr > 0.95) faceShape = jawTaper > 0.86 ? 'Round' : 'Heart';
  else if (whr < 0.72) faceShape = 'Long';
  else if (jawTaper > 0.9) faceShape = 'Square';
  else if (foreheadTaper < 0.82 && jawTaper < 0.8) faceShape = 'Diamond';
  else if (jawTaper < 0.78) faceShape = 'Heart';
  else faceShape = 'Oval';
  out.faceShape = FACE_SHAPES.includes(faceShape) ? faceShape : 'Oval';

  // ── eye shape: aspect (openness) + canthal tilt (up/down turned) ──
  const eyeLw = dist(lm[L.eyeLouter], lm[L.eyeLinner]);
  const eyeLh = dist(lm[L.eyeLup], lm[L.eyeLdown]);
  const eyeRw = dist(lm[L.eyeRinner], lm[L.eyeRouter]);
  const eyeRh = dist(lm[L.eyeRup], lm[L.eyeRdown]);
  const openness = ((eyeLh / (eyeLw || 1e-6)) + (eyeRh / (eyeRw || 1e-6))) / 2;
  // canthal tilt: outer corner y vs inner corner y (image y grows downward)
  const tiltL = lm[L.eyeLinner].y - lm[L.eyeLouter].y;
  const tiltR = lm[L.eyeRinner].y - lm[L.eyeRouter].y;
  const tilt = (tiltL + tiltR) / 2;
  let eyeShape = 'Almond';
  if (openness > 0.42) eyeShape = 'Wide';
  else if (openness > 0.34) eyeShape = 'Round';
  else if (openness < 0.2) eyeShape = 'Monolid';
  else if (tilt > 0.012) eyeShape = 'Upturned';
  else if (tilt < -0.012) eyeShape = 'Downturned';
  else if (openness < 0.26) eyeShape = 'Hooded';
  else eyeShape = 'Almond';
  out.eyeShape = EYE_SHAPES.includes(eyeShape) ? eyeShape : 'Almond';

  // ── nose: width (alae span vs face) + bridge length ──
  const noseW = dist(lm[L.noseAlaL], lm[L.noseAlaR]) / (faceW || 1e-6);
  const noseLen = dist(lm[L.noseBridge], lm[L.noseTip]) / (faceH || 1e-6);
  let nose = 'Straight';
  if (noseW > 0.33) nose = 'Wide';
  else if (noseW < 0.24) nose = noseLen < 0.2 ? 'Button' : 'Narrow';
  else if (noseLen > 0.3) nose = 'Aquiline';
  else if (noseLen < 0.2) nose = 'Rounded';
  else nose = 'Straight';
  out.nose = NOSES.includes(nose) ? nose : 'Straight';

  // ── mouth: width vs face + lip fullness ──
  const mouthW = dist(lm[L.mouthL], lm[L.mouthR]) / (faceW || 1e-6);
  const lipFull = dist(lm[L.lipTop], lm[L.lipBottom]) / (faceH || 1e-6);
  let mouth = 'Neutral';
  if (mouthW > 0.42) mouth = 'Wide';
  else if (lipFull > 0.075) mouth = 'Full';
  else if (lipFull < 0.04) mouth = 'Defined';
  else if (mouthW < 0.34) mouth = 'Soft';
  else mouth = 'Neutral';
  out.mouth = MOUTHS.includes(mouth) ? mouth : 'Neutral';

  // ── brows: thickness proxy (brow-to-eye gap, smaller gap = bolder/thicker) ──
  const browGapL = Math.abs(lm[L.browL].y - lm[L.eyeLup].y) / (faceH || 1e-6);
  const browGapR = Math.abs(lm[L.browR].y - lm[L.eyeRup].y) / (faceH || 1e-6);
  const browGap = (browGapL + browGapR) / 2;
  let brows = 'Natural';
  if (browGap < 0.045) brows = 'Bold';
  else if (browGap < 0.06) brows = 'Thick';
  else if (browGap > 0.1) brows = 'Thin';
  else brows = 'Natural';
  out.brows = BROWS.includes(brows) ? brows : 'Natural';

  // ── sampled colors (only if the capture layer measured them) ──
  if (skinHex) out.skinTone = nearestSwatch(skinHex, SKIN_TONES);
  if (eyeHex) out.eyeColor = nearestSwatch(eyeHex, EYE_COLORS);

  return out;
}

/** Convenience: full FaceConfig = derived fields merged over the catalog default. */
export function faceConfigFromLandmarks(
  lm: Landmark[],
  skinHex?: string,
  eyeHex?: string,
): FaceConfig {
  return { ...defaultFace(), ...faceFromLandmarks(lm, skinHex, eyeHex) };
}
