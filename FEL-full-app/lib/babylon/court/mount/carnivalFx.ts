// CARNIVAL FX (vis-hoops-court, 2026-10-14) — the one mount CourtCarnivalMode calls: the fair, its marquee, the intro's camera and
// the celebrations between events.
//
//   the set       (carnivalSet)      string lights, booths, big tops, a carousel, a ferris wheel, balloons — shown with the hub
//   the marquee   (carnivalMarquee)  the standings on a sign with chaser bulbs
//   the intro     `intro: 'establish'` puts a crane over the plaza when the night opens. The hub never stepped the camera director (its
//                 shot is a snapTo), so the director is stepped here while the intro runs — on the pick screen and the first card
//                 only; the moment an event takes the floor the intro is ended (an event drives its own camera)
//   the party     a confetti volley from both sides of the plaza when a card turns, and when an event is taken; fireworks over the
//                 horizon between events and at the finale when the sky is dark (the Neon Block's night) — sparks over a bright sunset
//                 are a smudge — and always at the champion's finale
//
// The mode tells it what happened (a card turned, the player took an event, the night ended, the standings) and it paints and bursts;
// it never decides who took what. No score, rule or clock of the night is read or written here.

import { Vector3 } from '@babylonjs/core';
import type { ModeContext } from '../../core/ModeHarness';
import { EffectsKit } from '../../visual/EffectsKit';
import { motionPolicy } from '../../../a11y/reducedMotion';
import { mountCarnivalSet, type CarnivalSetHandle } from '../carnivalSet';
import { mountMarquee, type MarqueeHandle, type MarqueeState } from '../carnivalMarquee';
import { FireworkShow, fireworkPlan } from '../Fireworks';

export type EventTaker = -1 | 0 | 1;
export interface CarnivalFx {
  showSet(on: boolean): void;
  board(s: MarqueeState): void;
  /** Hand the frame back NOW (an event is about to take the floor and set its own camera: call this BEFORE it builds, so the intro's
   *  restore of the hub's pose cannot land on top of the event's). */
  endIntro(): void;
  /** Step the director while the intro runs; true = an intro is on screen. `hubPhase` false ends it (an event is up). */
  stepIntro(subject: Vector3, objective: Vector3 | null, hubPhase: boolean): boolean;
  reveal(): void;
  eventResult(w: EventTaker): void;
  finale(playerWon: boolean): void;
  update(dt: number): void;
  readonly night: boolean;
  dispose(): void;
}

/** Where the volleys fire from: either side of the plaza, in front of the party-goers. */
export const CANNONS: readonly [number, number, number][] = [[-6.5, 1.2, 2.5], [6.5, 1.2, 2.5]];
const COLOURS = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585'];
const ZERO = Vector3.Zero();

/** Pure: how many shells a show fires (the finale is the big one; a phone fires fewer). */
export function showSize(kind: 'event' | 'finale', tier: string): number { return (kind === 'finale' ? 10 : 6) - (tier === 'mobile' ? 3 : 0); }

export function mountCarnivalFx(ctx: ModeContext): CarnivalFx {
  const { scene } = ctx;
  const tier = (scene.metadata as { felTier?: string } | null)?.felTier ?? 'desktop';
  const night = ctx.lights.mood === 'nightGame';
  const calm = (): boolean => !motionPolicy().travel;   // reduced motion: the fair holds still and the chasers do not swap
  const set: CarnivalSetHandle = mountCarnivalSet(scene, { tier, calm });
  const marquee: MarqueeHandle = mountMarquee(scene, { at: { x: 0, y: 6.4, z: 21 }, yaw: 0, tier, calm });
  const fireworks = new FireworkShow(scene);
  let seed = 1, on = true;
  // the show steps on the render loop, not the mode's update(): the night's finale calls ctx.end, after which the harness stops the mode — and the champion's
  // fireworks are exactly what plays over the end card. A pause still freezes it.
  const stepper = scene.onBeforeRenderObservable.add(() => { if (ctx.phase() !== 'paused') fireworks.update(Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)); });
  const pos = new Vector3();
  const volley = (n = 1): void => {
    for (let k = 0; k < n; k++) for (const [i, c] of CANNONS.entries()) { pos.set(c[0], c[1], c[2]); EffectsKit.burst(scene, pos, 'confetti', 2 + k * 0.4, COLOURS[(seed + i + k) % COLOURS.length]); }
    seed++;
  };
  const show = (kind: 'event' | 'finale'): void => { if (motionPolicy().travel) fireworks.launch(fireworkPlan({ x: 0, z: 36 }, showSize(kind, tier), seed++)); };
  const fx: CarnivalFx = {
    night,
    showSet(v) { on = v; set.setEnabled(v); marquee.meshes.forEach((m) => m.setEnabled(v)); },
    board(s) { marquee.show(s); },
    endIntro() { if (ctx.camDirector.inIntro) ctx.camDirector.endIntro(); },
    stepIntro(subject, objective, hubPhase) {
      if (!ctx.camDirector.inIntro) return false;
      if (!hubPhase || !on) { ctx.camDirector.endIntro(); return false; }
      ctx.camDirector.update(subject, ZERO, objective);
      return true;
    },
    reveal() { if (on) volley(1); },
    eventResult(w) { if (w !== 0) return; volley(2); if (night) show('event'); },
    finale(won) { if (won) { volley(3); show('finale'); } else if (night) show('event'); },
    update(dt) { marquee.update(dt); },
    dispose() {
      scene.onBeforeRenderObservable.remove(stepper); fireworks.clear(); marquee.dispose(); set.dispose();
      const m = scene.metadata as { felCarnivalFx?: unknown } | null;
      if (m?.felCarnivalFx === fx) delete m.felCarnivalFx;
    },
  };
  (scene.metadata ??= {}).felCarnivalFx = fx;   // for probes and the rig: a result can be called by hand
  return fx;
}
