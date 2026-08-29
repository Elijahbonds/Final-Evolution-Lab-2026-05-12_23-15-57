// combatTree — Mode 2 Phase 5: the combat animation blend tree.
//
// Same discipline as basketballTree (Mode 1): ONE pure decision function
// maps combat context to clip + loop + fade, one thin class dedupes
// per-frame play() calls. States cover stance idles (weapon-aware),
// locomotion, dash, strike by WEIGHT, block/parry/guard-impact, stagger,
// knockdown, KO, and ultimate.
//
// Hit reactions scale by strike weight — a jab flinch and a finisher
// launch are different clips at different fades, not the same clip faster.

import type { CharacterAnimator } from './CharacterAnimator';

export type CombatAnimState =
  | 'idle' | 'idle_weapon' | 'walk' | 'dash'
  | 'strike_light' | 'strike_medium' | 'strike_heavy' | 'strike_finisher'
  | 'block_hold' | 'parry_flash' | 'guard_impact'
  | 'react_light' | 'react_medium' | 'react_heavy' | 'react_launch'
  | 'knockdown' | 'ko' | 'ultimate' | 'celebrate';

export interface CombatAnimInput {
  speed01: number;
  dashing: boolean;
  hasWeapon: boolean;
  striking: 'light' | 'medium' | 'heavy' | 'finisher' | null;
  blocking: boolean;
  parryFlash: boolean;          // one-beat, set on successful parry
  guardImpactFlash: boolean;    // one-beat, set on successful impact
  hitBy: 'light' | 'medium' | 'heavy' | 'finisher' | null;
  down: boolean;                // knocked down (gettable)
  out: boolean;                 // KO'd
  ulting: boolean;
  celebrating?: boolean;
}

const CLIP_FOR: Record<CombatAnimState, { clip: string; loop: boolean; fadeSec: number }> = {
  idle:            { clip: 'karate_idle_stance', loop: true, fadeSec: 0.2 },
  idle_weapon:     { clip: 'karate_idle_stance', loop: true, fadeSec: 0.2 },
  walk:            { clip: 'walk_forward', loop: true, fadeSec: 0.16 },
  dash:            { clip: 'run_forward', loop: true, fadeSec: 0.06 },
  strike_light:    { clip: 'karate_punch_light', loop: false, fadeSec: 0.05 },
  strike_medium:   { clip: 'karate_kick_roundhouse', loop: false, fadeSec: 0.05 },
  strike_heavy:    { clip: 'karate_punch_heavy', loop: false, fadeSec: 0.05 },
  strike_finisher: { clip: 'karate_counter_throw', loop: false, fadeSec: 0.04 },
  block_hold:      { clip: 'karate_block', loop: true, fadeSec: 0.1 },
  parry_flash:     { clip: 'karate_block', loop: false, fadeSec: 0.03 },
  guard_impact:    { clip: 'karate_counter_throw', loop: false, fadeSec: 0.03 },
  react_light:     { clip: 'karate_hit_react', loop: false, fadeSec: 0.04 },
  react_medium:    { clip: 'karate_hit_react', loop: false, fadeSec: 0.04 },
  react_heavy:     { clip: 'karate_hit_react', loop: false, fadeSec: 0.05 },
  react_launch:    { clip: 'karate_knockdown', loop: false, fadeSec: 0.05 },
  knockdown:       { clip: 'karate_knockdown', loop: false, fadeSec: 0.1 },
  ko:              { clip: 'karate_knockdown', loop: false, fadeSec: 0.12 },
  ultimate:        { clip: 'karate_counter_throw', loop: false, fadeSec: 0.08 },
  celebrate:       { clip: 'karate_victory_pose', loop: false, fadeSec: 0.2 },
};

/** The single decision: combat context in, clip choice out. Pure. */
export function chooseCombatClip(i: CombatAnimInput): { state: CombatAnimState; clip: string; loop: boolean; fadeSec: number } {
  let state: CombatAnimState;
  if (i.out) state = 'ko';
  else if (i.ulting) state = 'ultimate';
  else if (i.hitBy) state = i.hitBy === 'finisher' ? 'react_launch' : (`react_${i.hitBy}` as CombatAnimState);
  else if (i.down) state = 'knockdown';
  else if (i.guardImpactFlash) state = 'guard_impact';
  else if (i.parryFlash) state = 'parry_flash';
  else if (i.striking) state = i.striking === 'finisher' ? 'strike_finisher' : (`strike_${i.striking}` as CombatAnimState);
  else if (i.dashing) state = 'dash';
  else if (i.blocking) state = 'block_hold';
  else if (i.celebrating) state = 'celebrate';
  else if (i.speed01 > 0.15) state = 'walk';
  else state = i.hasWeapon ? 'idle_weapon' : 'idle';
  return { state, ...CLIP_FOR[state] };
}

/** Thin animator wiring with state dedupe (per-frame safe). */
export class CombatAnimTree {
  private current: CombatAnimState | null = null;
  constructor(private animator: CharacterAnimator) {}
  update(input: CombatAnimInput): CombatAnimState {
    const c = chooseCombatClip(input);
    if (c.state !== this.current) {
      this.animator.play(c.clip, { loop: c.loop, fadeSec: c.fadeSec });
      this.current = c.state;
    }
    return c.state;
  }
  /** One-beat states must be re-playable: call when the beat ends. */
  clearBeat(...states: CombatAnimState[]): void {
    if (this.current && states.includes(this.current)) this.current = null;
  }
  reset(): void { this.current = null; }
}
