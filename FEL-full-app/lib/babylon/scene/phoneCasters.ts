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
