// DUSK COMES DOWN OVER THE GAME (vis-hoops-court, 2026-10-14) — Part B onevone: "Dusk-to-night progression across a game: the mood
// lerps and the lamps light up".
//
// A pickup game is played under one sun, and the sun does not stand still for a game to eleven. The mode's mood (goldenHour) is the
// look the owner signed off, so this does not replace it: it moves the sun's strength and colour, and the hemisphere's, a fraction of
// the way toward the dusk mood as the game runs down (by the score, or the clock in 3v3) and brings the lamps up. At the start of
// a game every number is exactly the rig's; at the end the same court is a notch deeper and warmer with its lamps lit.
//
// Deliberately NOT moved: the sun's DIRECTION (the shadow cache drew the static scenery's shadows once, from this direction: a
// moved sun would leave them where they were), the exposure and the grade (ONE OWNER FOR THE GRADE — the harness's rest), and the
// photographic backdrop (it is a photograph of one evening). Under reduced motion it stays at the start: a lighting drift is a
// motion the player did not ask for. Pure targets in `duskTarget`; the mount only eases the lights toward them.

import { Color3 } from '@babylonjs/core';
import type { ModeContext } from '../core/ModeHarness';
import { MOODS } from '../scene/moods';
import { motionPolicy } from '../../a11y/reducedMotion';

/** The game is dusk by the time it is this far gone: nothing happens before the first fifth, it is complete at the end. */
export const DUSK_START = 0.2;
/** How far toward the dusk mood the sun and the sky go at the end (0..1 of the way from goldenHour to dusk). */
export const DUSK_REACH = 0.65;
/** The lamps' light, and the glow's halo, at the end, × what they were at the start. */
export const LAMP_GAIN = 2.2, GLOW_GAIN = 1.3;
/** Seconds the lights take to settle on a new target (a basket moves the score by a step; the sky does not jump). */
export const DUSK_EASE_S = 4;

export interface DuskTarget { /** 0..1, the eased progress */ k: number; sunK: number; hemiK: number; sunMix: number; hemiMix: number; lampK: number; glowK: number }

const smooth = (t: number): number => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Pure: where the lights want to be when the game is `progress01` gone. At 0 every factor is 1 and every mix 0. */
export function duskTarget(progress01: number): DuskTarget {
  const k = smooth((progress01 - DUSK_START) / (1 - DUSK_START));
  const g = MOODS.goldenHour, d = MOODS.dusk;
  const reach = k * DUSK_REACH;
  return {
    k,
    sunK: lerp(1, d.sunIntensity / g.sunIntensity, reach),
    hemiK: lerp(1, d.hemiIntensity / g.hemiIntensity, reach),
    sunMix: reach, hemiMix: reach,
    lampK: lerp(1, LAMP_GAIN, k), glowK: lerp(1, GLOW_GAIN, k),
  };
}

/** Pure: how far through the game, from what the mode knows — the better of the two scores against the target, or the clock. */
export function gameProgress(scores: { me: number; foe: number; target: number }, clock?: { left: number; total: number }): number {
  const byScore = scores.target > 0 ? Math.max(scores.me, scores.foe) / scores.target : 0;
  const byClock = clock && clock.total > 0 ? 1 - clock.left / clock.total : 0;
  return Math.max(0, Math.min(1, Math.max(byScore, byClock)));
}

export interface DuskHandle { /** the eased progress 0..1 the lights are at */ readonly progress: number; dispose(): void }

/** Ease the rig's lights toward the game's dusk. `progress` is read each frame. Nothing is touched until the game is past DUSK_START. */
export function mountDusk(ctx: ModeContext, progress: () => number): DuskHandle {
  const { scene } = ctx;
  let base: { sun: number; sunC: Color3; hemi: number; hemiC: Color3; glow: number; lamps: Map<unknown, number> } | null = null;
  let eased = 0;
  const sunTo = Color3.FromHexString(MOODS.dusk.sun), skyTo = Color3.FromHexString(MOODS.dusk.sky);
  const obs = scene.onBeforeRenderObservable.add(() => {
    if (!motionPolicy().travel) return;
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    eased += (Math.max(0, Math.min(1, progress())) - eased) * (1 - Math.exp(-dt / DUSK_EASE_S));
    const t = duskTarget(eased);
    if (t.k < 1e-3 && !base) return;
    const L = ctx.lights;
    if (!base) base = { sun: L.sun.intensity, sunC: L.sun.diffuse.clone(), hemi: L.hemi.intensity, hemiC: L.hemi.diffuse.clone(), glow: L.glow?.layer.intensity ?? 1, lamps: new Map() };
    L.sun.intensity = base.sun * t.sunK;
    L.hemi.intensity = base.hemi * t.hemiK;
    Color3.LerpToRef(base.sunC, sunTo, t.sunMix, L.sun.diffuse);
    Color3.LerpToRef(base.hemiC, skyTo, t.hemiMix * 0.5, L.hemi.diffuse);
    if (L.glow) L.glow.layer.intensity = base.glow * t.glowK;
    const fx = L.fixtureLights;   // mounted by the rig after load(): read each frame
    if (fx) for (const l of fx.lights) { if (!base.lamps.has(l)) base.lamps.set(l, l.intensity); l.intensity = (base.lamps.get(l) as number) * t.lampK; }
  });
  return { get progress() { return eased; }, dispose() { scene.onBeforeRenderObservable.remove(obs); } };
}
