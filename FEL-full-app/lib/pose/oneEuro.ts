// oneEuro — the One Euro filter (Casiez, Roussel & Vogel, "1€ Filter", CHI 2012), for one number and for a whole
// pose (movement play, phase 2, 2026-09-24).
//
// A low-pass whose cutoff rises with speed: slow motion gets a low cutoff (the jitter of a still stand is smoothed
// away), fast motion a high one (a slam's wrist is not lagged or shaved). Timed from the frame's own capture clock
// (PoseFrame.t, ms), so a dropped frame is a longer step, not a wrong one.
//
//   cutoff = minCutoff + beta·|ẋ|          ẋ low-passed at dCutoff
//   α      = 1 / (1 + τ/Δt),  τ = 1/(2π·cutoff)
//
// TUNING (lib/pose/oneEuro.test.ts measures both on the fixtures). The two asks pull against each other:
//   • a still stand is still: on stand_still the frame-to-frame jitter (the second difference, which the real slow
//     sway of a video solve does not reach) of the hips, a wrist and an ankle falls to 0.18–0.28 of the raw stream's;
//   • a slam's wrist speed survives: on every fast swing in the owner's takes (strikes and reaches of 4–10 m/s) the
//     filtered wrist reaches ≥ 0.9 of the raw stream's peak speed, on the same frame or one either side.
// Swept minCutoff 0.5–3 Hz, beta 0.5–64 (image units) and dCutoff 1–5 Hz on those two measures. The paper's dCutoff of
// 1 Hz (with beta 4) holds the stand stiller (jitter 0.12–0.15) but keeps only 0.70–0.88 of the fast peaks and puts
// some 2 frames late: a slam is over in ~5 frames, before a 1 Hz speed estimate has risen, so the cutoff never opens.
// dCutoff 3 Hz lets it keep up; minCutoff 1 Hz holds the stand; beta 16 is where the fast peaks stop gaining (32 and
// 64 raise the jitter to 0.4–0.5 of raw for ≤ 2 % more peak).
// Image and world points move in different units (image widths vs metres: ~3.5 m per image unit at 3 m), so the
// world beta is the image one ÷ 3.5: both open at the same real speed.
//
// Pure: no DOM.
import type { Lm, Wm, PoseFrame } from './landmarks';

export interface OneEuroParams {
  /** Hz: the cutoff at rest. Lower = a stiller stand, more lag on slow motion. */
  minCutoff: number;
  /** How fast the cutoff rises with speed (per unit/s of the signal). Higher = less lag on fast motion, more jitter. */
  beta: number;
  /** Hz: the cutoff of the speed estimate that drives the adaptation (the paper suggests 1 Hz; see TUNING). */
  dCutoff: number;
}

/**
 * Image landmarks (x, y in image units, z on x's scale). A still stand's jitter at 640×480 is ~0.002–0.005 units
 * (the synth's noise model, MediaPipe lite's own); a slam's wrist crosses ~2–3 units/s.
 */
export const IMAGE_EURO: OneEuroParams = { minCutoff: 1, beta: 16, dCutoff: 3 };
/**
 * World landmarks (metres). Jitter ~0.8–1.5 cm (3 cm in depth); a slam's wrist reaches 5–9 m/s. beta scaled by the
 * ~3.5 m an image unit spans at 3 m, so the two filters open at the same real speed.
 */
export const WORLD_EURO: OneEuroParams = { minCutoff: 1, beta: 4.5, dCutoff: 3 };

/** A gap this long (ms) restarts a filter: the body was lost, and smoothing across it would drag the old pose in. */
export const EURO_GAP_RESET_MS = 300;

const alpha = (cutoffHz: number, dtS: number) => {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtS);
};

/** One Euro on a single number. */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  constructor(readonly p: OneEuroParams = IMAGE_EURO) {}

  /** Filter a sample taken at tMs. The first sample (or one after a reset / a long gap) passes through. */
  filter(x: number, tMs: number): number {
    if (this.x === null || tMs - this.t > EURO_GAP_RESET_MS) {
      this.x = x; this.dx = 0; this.t = tMs;
      return x;
    }
    const dt = (tMs - this.t) / 1000;
    if (!(dt > 0)) return this.x;                    // a repeated frame: nothing new to say
    const rawDx = (x - this.x) / dt;
    this.dx += alpha(this.p.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.p.minCutoff + this.p.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (x - this.x);
    this.t = tMs;
    return this.x;
  }

  get value(): number | null { return this.x; }
  /** The smoothed speed that drives the cutoff (units/s). Heavily low-passed: for the adaptation, not for events. */
  get speed(): number { return this.dx; }
  reset(): void { this.x = null; this.dx = 0; this.t = 0; }
}

/**
 * One Euro on every landmark of a pose: image x, y, z and world x, y, z, each its own filter. Visibility passes
 * through untouched. A frame with no body leaves the filters alone (absence is unknown, not a pose at 0,0).
 */
export class PoseFilter {
  private img: OneEuro[][] = [];
  private wld: OneEuro[][] = [];
  constructor(readonly image: OneEuroParams = IMAGE_EURO, readonly world: OneEuroParams = WORLD_EURO) {}

  filter(f: PoseFrame): PoseFrame {
    if (!f.present || !f.image.length) return f;
    const image: Lm[] = f.image.map((l, i) => {
      const e = (this.img[i] ??= [new OneEuro(this.image), new OneEuro(this.image), new OneEuro(this.image)]);
      return { x: e[0].filter(l.x, f.t), y: e[1].filter(l.y, f.t), z: e[2].filter(l.z, f.t), v: l.v };
    });
    let world: Wm[] | undefined;
    if (f.world) {
      world = f.world.map((w, i) => {
        const e = (this.wld[i] ??= [new OneEuro(this.world), new OneEuro(this.world), new OneEuro(this.world)]);
        return { x: e[0].filter(w.x, f.t), y: e[1].filter(w.y, f.t), z: e[2].filter(w.z, f.t) };
      });
    }
    return world ? { ...f, image, world } : { ...f, image };
  }

  reset(): void { this.img = []; this.wld = []; }
}
