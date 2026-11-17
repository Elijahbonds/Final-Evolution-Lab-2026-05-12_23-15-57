// phoneCasters — what a phone leaves out of the shadow map (phone-perf pass, 2026-10-14).
//
// The phone tier has one 512² blurred shadow map (QualityTier: mobile). Every caster in it is drawn a second time per
// frame when it moves, and every skinned body moves — so on a phone a character's cost in the shadow pass is one draw
// per PART. The sweep's shadow-pass render list on karate (9 mooks + the hero, cache armed) was 43 draws a frame, and
// half of them were parts whose shadow is hidden inside a bigger part's shadow at any sun angle:
//   acc_<n>_*      the kit accessories (headband, arm and leg sleeves, wristbands, chain) — each wraps a limb, the head or
//                  the neck, so its shadow lies inside that limb's shadow (on a 512² map one texel is ~4 cm on the court)
//   eyes_*         inside the head
//   KitSole_*      under the shoe, on the floor the shoe stands on
// and two world-space HUD pieces the karate horde already meant to keep out (they are flat, unlit, and light-coloured;
// a HUD marker throws no shadow):
//   threat_cue_* / threat_arrow_*   the incoming-attack cue and the off-screen arrow
//   mook_bar_*                      a mook's health bar
// and the hoop's juice (HoopJuice): `juice_rim`, a torus laid over the real rim for the beat of a make, and `juice_net`, a
// wireframe sleeve over the real net — the rim and the net already throw that shadow, and each flash re-baked the phone's
// shadow cache (3-Point, phone sweep).
//
// MOBILE TIER ONLY. Desktop and high keep every caster they had: their map is 4096² with cascades, where nothing here is
// asked to change. The main pass is untouched on every tier (each part still draws where the camera sees it).

/** Caster names a phone keeps out of its shadow map. */
export const PHONE_NO_CAST = /^(acc_|eyes(_|$)|KitSole_|threat_(cue|arrow)_|mook_bar_|juice_(rim|net)$)/;

/** Pure: does this tier skip this mesh as a shadow caster? Only the mobile tier skips anything. */
export function phoneSkipsCaster(name: string | null | undefined, tier: string): boolean {
  return tier === 'mobile' && typeof name === 'string' && PHONE_NO_CAST.test(name);
}

// ── hoops-p08 (2026-11-12): the phone budget (docs/HOOPS-AAA-GAP-SHOW.md 3.9, sinker 7) ───────────────────────────────────
// The census (scripts/probes/hoops-p08/scene-census.mts) on the phone profile: in 3v3 a forge rival is nine draw-producing parts
// and every part is drawn THREE times a frame — the body pass and the ink contour's two (AnimeInk: Babylon's outline renderer
// draws the hull, then the mesh again for depth). Six players were ~156 of the frame's ~218 main-pass draws.
//   * THE INK on a phone skips the parts whose contour lies inside a bigger part's: the eyes (inside the head), the shoe's sole
//     (KitSole, under the shoe), the sock (inside the shoe and the leg), the accessories (they wrap a limb). The silhouette — body,
//     hair, top, shorts, shoes — keeps its line. Two draws saved per skipped part, nothing a player reads.
//   * THE SHADOW MAP on a phone also skips the sock (its shadow is inside the leg's and the shoe's), by its material.
// `perf.phoneInkTrim` (1 on; 0 = every part inked, as before) and `perf.phoneSockCast` (0 off; 1 = the sock casts, as before).

/** Part names a phone draws no ink contour for (the eyes, the sole, the accessories; case-sensitive like PHONE_NO_CAST). */
export const PHONE_NO_INK = /^(eyes(_|$)|KitSole_|acc_)/;
/** Part MATERIAL names a phone draws no ink for and keeps out of the shadow map: the sock under the shoe. */
export const PHONE_SOCK_MATERIAL = /\.sock_/;
/** perf.phoneInkTrim: 1 = the phone skips the enclosed parts' ink (new); 0 = every part inked, as before. */
export const PHONE_INK_TRIM = 1;
/** perf.phoneSockCast: 0 = the phone's shadow map skips the sock (new); 1 = it casts, as before. */
export const PHONE_SOCK_CAST = 0;

/** Pure: does this tier draw no ink contour for this part? `trim` is the knob's value. */
export function phoneSkipsInk(name: string | null | undefined, material: string | null | undefined, tier: string, trim = PHONE_INK_TRIM): boolean {
  if (tier !== 'mobile' || trim < 0.5) return false;
  return (typeof name === 'string' && PHONE_NO_INK.test(name)) || (typeof material === 'string' && PHONE_SOCK_MATERIAL.test(material));
}

/** Pure: does this tier keep this part out of the shadow map by its material (the sock)? `cast` is the knob's value. */
export function phoneSkipsCasterMaterial(material: string | null | undefined, tier: string, cast = PHONE_SOCK_CAST): boolean {
  return tier === 'mobile' && cast < 0.5 && typeof material === 'string' && PHONE_SOCK_MATERIAL.test(material);
}
