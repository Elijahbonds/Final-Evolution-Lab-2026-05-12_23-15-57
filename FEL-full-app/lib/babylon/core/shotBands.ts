// THE PERFECT BAND'S SHARE OF THE GREEN (lane/hoops-shot-core, 2026-10-20).
//
// ShotMeter.release() grades a release inside this share of the green half-width as 'perfect' (SHOT_QUALITY_PCT 0.97) and the
// rest of the green as 'good' (0.80). The number was a literal in three places — the grade, the 3D bar's default band, and
// nowhere at all on the HUD bar, which drew the green only. One constant, so the band drawn IS the band graded.
//
// No imports: the HUD component reads it without pulling Babylon into the page bundle.

/** The perfect band is the inner 35 % of the green (about ±23 ms of a jumper's ±65 ms). Unchanged value — not a tune. */
export const PERFECT_BAND_SHARE = 0.35;
