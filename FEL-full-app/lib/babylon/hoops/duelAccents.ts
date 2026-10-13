// THE DUEL'S ACCENTS (vis-hoops-dunk, Part B dunkduel: "per-player light accents: a rim-light tint", "crowd react tiers keyed to the
// score gap"). Presentation only: the colour of the light on whoever has the floor, and how many phones go up in the stands.

import { Color3 } from '@babylonjs/core';
import { mixHex } from './hoopsLook';
import { KICKER } from '../scene/KickerLight';
import type { VenueMood } from '../scene/moods';

/** How far the active duellist's colour pulls the rig's own rim light (0 = the mood's, 1 = all theirs). Look number: the pink
 *  must read on the body's silhouette without turning the golden hour's key light pink. */
export const KICKER_PULL = 0.38;

/** Pure: the kicker's colour while `hex` has the floor under `mood`. */
export function kickerFor(mood: VenueMood, hex: string, pull = KICKER_PULL): string {
  return mixHex((KICKER[mood] ?? KICKER.goldenHour).color, hex, pull);
}

/** The slice of the rig this touches (the harness's `ctx.lights`). */
export interface KickerRig { mood: VenueMood; kicker: { light: { diffuse: Color3 } } | null }

/** Tint the rig's rim light to `hex` (the duellist who has the floor). A rig with no kicker (?look=legacy) is left alone. */
export function tintKicker(rig: KickerRig, hex: string, pull = KICKER_PULL): void {
  if (!rig.kicker) return;
  rig.kicker.light.diffuse = Color3.FromHexString(kickerFor(rig.mood, hex, pull));
}

/**
 * Pure: phones that go up for a make — by how big it was (the judges' total over the band lines the mode already has) and how far
 * apart the two duellists now are (a runaway or a comeback is a louder building). Bounded: the stands never strobe.
 */
export function phonesFor(total: number, bands: { eruption: number; approval: number }, gapAbs: number): number {
  const base = total >= bands.eruption ? 20 : total >= bands.approval ? 12 : 6;
  const gap = Number.isFinite(gapAbs) ? Math.max(0, gapAbs) : 0;
  return Math.min(26, base + Math.min(6, Math.floor(gap / 5)));
}
