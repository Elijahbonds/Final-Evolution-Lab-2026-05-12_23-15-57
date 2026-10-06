// PROCEDURAL EYES (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a, tool #3): the kit's eyeballs drawn in code, so the
// iris can be any colour and size, the pupil round, a slit or gone, the sclera any colour, and the iris can glow. Pure
// maths over a typed array (no Babylon): renderEyes.ts uploads it.
//
// WHERE THE IRISES ARE (measured 2026-10-06, not assumed). The kit's `eyes` mesh (53 vertices, both eyeballs, material
// `eyes`, the MakeHuman `brown_eye` texture) maps each eyeball as a front-on disc: the left eye's island spans
// u 0.03–0.56, v 0.43–0.97 and the right eye's u 0.44–0.97, v 0.03–0.56 (glTF UVs, v down the image). The vertices
// facing straight forward sit at the island centres, and the shipped texture's irises are drawn there: (0.288, 0.708)
// and (0.703, 0.298), iris radius 0.113, pupil 0.037, eyeball disc ~0.28 (read off the 1024² map). eyeTexture.test.ts
// re-measures the forward vertices' UVs on both real kit GLBs and checks they land inside these irises. The texture is a
// RawTexture with invertY false, the glTF loader's own convention, so texel row = v × size.
//
// WHAT IT DRAWS: a sclera shaded darker towards the edge of each eyeball disc, an iris with radial fibres and a dark
// limbal ring, a pupil, all antialiased over ~1.5 texels; and, only when the iris glows, a second (emissive) map holding
// the iris alone (the sclera never glows).

import { EYE_DEFAULTS, EYE_RANGES, type CreatorEyes, type PupilShape } from '../../../creator/look/doc';

/** The iris centres in UV (u right, v down), measured off the kit's eye texture (see the header). */
export const EYE_CENTRES: readonly (readonly [number, number])[] = [[0.288, 0.708], [0.703, 0.298]];
/** The natural iris radius, pupil radius and eyeball disc radius, in UV. */
export const IRIS_RADIUS = 0.113;
export const EYEBALL_RADIUS = 0.28;
/** One texture per body at this size (256² RGBA = 256 KiB; 342 KiB on the GPU with mips). */
export const EYE_TEX_SIZE = 256;

export interface EyeParams {
  iris: string;
  sclera: string;
  /** iris radius multiplier */
  size: number;
  pupil: PupilShape;
  /** pupil radius as a fraction of the iris */
  pupilSize: number;
  /** 0..1 */
  glow: number;
}

/** The look's eyes: the base's eye colour, the doc's eyes block, the defaults for the rest (clamped again). */
export function eyeParams(eyeColor: string | null | undefined, eyes: CreatorEyes | null | undefined): EyeParams {
  const e = eyes ?? {};
  const cl = (v: number | undefined, [lo, hi]: readonly [number, number], d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    iris: isHex(eyeColor) ? eyeColor! : '#3B2A1A',
    sclera: isHex(e.sclera) ? e.sclera! : EYE_DEFAULTS.sclera,
    size: cl(e.size, EYE_RANGES.size, EYE_DEFAULTS.size),
    pupil: e.pupil === 'slit' || e.pupil === 'none' ? e.pupil : 'round',
    pupilSize: cl(e.pupilSize, EYE_RANGES.pupilSize, EYE_DEFAULTS.pupilSize),
    glow: cl(e.glow, EYE_RANGES.glow, 0),
  };
}
const isHex = (v: unknown): boolean => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/** A cache key: two looks with the same signature draw the same texels. */
export function eyeSig(p: EyeParams): string {
  return [p.iris, p.sclera, p.size, p.pupil, p.pupilSize, p.glow].join('|');
}

/** How much of a point (in iris units: 1 = the iris edge) is pupil. A slit is a tall ellipse (v is up and down the eye). */
export function pupilCover(dx: number, dy: number, shape: PupilShape, r: number, aa: number): number {
  if (shape === 'none') return 0;
  if (shape === 'round') return clamp01(0.5 - (Math.hypot(dx, dy) - r) / aa);
  // slit: half-width a third of the radius, half-height 0.9 of the iris
  const a = Math.max(0.04, r * 0.35), b = 0.9;
  const d = (Math.hypot(dx / a, dy / b) - 1) * Math.min(a, b);
  return clamp01(0.5 - d / aa);
}

/** Fibres around the iris: a fixed pseudo-random pattern of the angle (deterministic, no Math.random). */
function fibre(ang: number): number {
  return 0.5 + 0.22 * Math.sin(ang * 23) + 0.16 * Math.sin(ang * 61 + 1.3) + 0.12 * Math.sin(ang * 137 + 0.7);
}

/** Draw the eye map. `emissive` is null unless the iris glows. */
export function drawEyes(p: EyeParams, size = EYE_TEX_SIZE): { albedo: Uint8Array; emissive: Uint8Array | null } {
  const albedo = new Uint8Array(size * size * 4);
  const emissive = p.glow > 0 ? new Uint8Array(size * size * 4) : null;
  const [ir, ig, ib] = rgb(p.iris), [sr, sg, sb] = rgb(p.sclera);
  const R = IRIS_RADIUS * p.size;
  const aa = 1.5 / size / R;   // antialias width in iris units
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      // the nearer eye
      let best = Infinity, cu = 0, cv = 0;
      for (const [eu, ev] of EYE_CENTRES) { const d = Math.hypot(u - eu, v - ev); if (d < best) { best = d; cu = eu; cv = ev; } }
      const dx = (u - cu) / R, dy = (v - cv) / R;
      const r = best / R;
      // sclera, darker towards the edge of the eyeball (it curves away)
      const shade = 1 - 0.28 * smooth(0.45, 1, best / EYEBALL_RADIUS);
      let cr = sr * shade, cg = sg * shade, cb = sb * shade;
      const inIris = clamp01(0.5 - (r - 1) / aa);
      let er = 0, eg = 0, eb = 0;
      if (inIris > 0) {
        const f = fibre(Math.atan2(dy, dx));
        const k = (0.62 + 0.5 * f) * (1 - 0.55 * smooth(0.72, 1, r));   // fibres, and the dark limbal ring
        let pr = ir * k, pg = ig * k, pb = ib * k;
        const pc = pupilCover(dx, dy, p.pupil, p.pupilSize, aa);
        pr *= 1 - pc; pg *= 1 - pc; pb *= 1 - pc;
        cr += (pr - cr) * inIris; cg += (pg - cg) * inIris; cb += (pb - cb) * inIris;
        if (emissive) { const gk = p.glow * inIris * (1 - pc) * (0.75 + 0.25 * f); er = ir * gk; eg = ig * gk; eb = ib * gk; }
      }
      const o = (y * size + x) * 4;
      albedo[o] = Math.round(clamp01(cr) * 255); albedo[o + 1] = Math.round(clamp01(cg) * 255); albedo[o + 2] = Math.round(clamp01(cb) * 255); albedo[o + 3] = 255;
      if (emissive) { emissive[o] = Math.round(clamp01(er) * 255); emissive[o + 1] = Math.round(clamp01(eg) * 255); emissive[o + 2] = Math.round(clamp01(eb) * 255); emissive[o + 3] = 255; }
    }
  }
  return { albedo, emissive };
}
