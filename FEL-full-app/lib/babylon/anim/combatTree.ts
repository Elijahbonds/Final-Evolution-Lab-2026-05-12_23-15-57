// combatTree — the combat animation blend tree, and the ONE OWNER of a fighter's clips.
//
// Same discipline as basketballTree / boardTree: ONE pure decision function maps combat context to clip + loop + fade,
// one thin class dedupes per-frame play() calls. States cover stance idles (weapon-aware), locomotion, dash, strike by
// WEIGHT, block / parry / guard-impact, hit reactions by weight, knockdown / KO / ring-out fall, the floor hold, the
// get-up, ultimate and celebrate.
//
// ANIM-READABILITY (combat, 2026-09-07). Karate VS / Mixed Combat used to play clips from three places at once: the
// per-frame update (stance / guard step), the swing's own one-shot with an onEnd chain, and the hit / parry / guard-break
// branches. Measured per rendered frame on the fake pad: a parried jab's chained "play the stance" fired from INSIDE the
// animator's fade handler (Babylon raises a group's end observable from stop()), which removed the new fade's observer —
// the stance sat at weight 0 while the react ran out and the hero FROZE in a held pose for 3 s (187 frames under 0.05
// total weight). Every rival strike ended in a one-frame stance flash before the guard step (0.5 m hand pop each time),
// both fighters guard-stepped on the spot, and the block was the stance clip (invisible). Now the tree is the only thing
// that plays on a fighter: it passes its own onEnd for every one-shot, settles a finished one-shot into what the context
// asks for with that one-shot's trigger cleared (a strike that ran out while the stick is held goes straight to the
// guard step — no idle flash), ignores the callback when the tree itself cut the clip (state + token guard), holds the
// floor after a knockdown until the mode lets the fighter rise, and rises through the get-up before any standing state.

import type { CharacterAnimator } from './CharacterAnimator';

export type StrikeWeight = 'light' | 'medium' | 'heavy' | 'finisher';

export type CombatAnimState =
  | 'idle' | 'idle_weapon' | 'walk' | 'dash'
  | 'strike_light' | 'strike_medium' | 'strike_heavy' | 'strike_finisher'
  | 'block_hold' | 'parry_flash' | 'guard_impact'
  | 'react_light' | 'react_medium' | 'react_heavy' | 'react_launch'
  | 'knockdown' | 'ko' | 'fall' | 'floor' | 'get_up'
  | 'dodge' | 'ultimate' | 'celebrate';

export interface CombatAnimInput {
  speed01: number;
  dashing: boolean;
  hasWeapon: boolean;
  striking: StrikeWeight | null;
  /** The attack's own clip (FightCore's AttackDef.clip); the weight's default clip plays when absent. */
  strikeClip?: string;
  blocking: boolean;
  parryFlash: boolean;          // one-beat, set on successful parry (the defender)
  guardImpactFlash: boolean;    // one-beat, set when a hit lands on the guard
  hitBy: StrikeWeight | null;   // one-beat; 'finisher' launches (knockdown → floor)
  down: boolean;                // knocked down (guard break) — holds the floor
  out: boolean;                 // KO'd / round lost — holds the floor
  /** Ring-out: the body leaves the platform (Mixed Combat). */
  falling?: boolean;
  /** The i-frame dodge roll (Karate endless). */
  dodging?: boolean;
  /** The dodge's own clip (KARATE-NEO-COOP: the lean with no stick held, the juke with one); the juke plays when absent. */
  dodgeClip?: string;
  ulting: boolean;
  celebrating?: boolean;
}

export interface CombatClipChoice { state: CombatAnimState; clip: string; loop: boolean; fadeSec: number }

const CLIP_FOR: Record<CombatAnimState, { clip: string; loop: boolean; fadeSec: number }> = {
  idle:            { clip: 'karate_idle_stance', loop: true, fadeSec: 0.2 },
  idle_weapon:     { clip: 'karate_idle_stance', loop: true, fadeSec: 0.2 },
  walk:            { clip: 'karate_guard_step', loop: true, fadeSec: 0.16 },   // MODE-STICK-FACE: the guard stays up on the walk (was the shared walk, arms at the hips)
  dash:            { clip: 'run_forward', loop: true, fadeSec: 0.06 },
  strike_light:    { clip: 'karate_punch_light', loop: false, fadeSec: 0.06 },
  strike_medium:   { clip: 'karate_kick_roundhouse', loop: false, fadeSec: 0.06 },
  strike_heavy:    { clip: 'karate_punch_heavy', loop: false, fadeSec: 0.06 },
  strike_finisher: { clip: 'karate_counter_throw', loop: false, fadeSec: 0.05 },
  block_hold:      { clip: 'karate_block', loop: true, fadeSec: 0.1 },          // authored high guard (was the stance clip at 1.6× — invisible)
  parry_flash:     { clip: 'karate_parry', loop: false, fadeSec: 0.04 },
  guard_impact:    { clip: 'karate_guard_impact', loop: false, fadeSec: 0.04 },
  react_light:     { clip: 'karate_hit_react', loop: false, fadeSec: 0.05 },
  react_medium:    { clip: 'karate_hit_react', loop: false, fadeSec: 0.05 },
  react_heavy:     { clip: 'karate_hit_react', loop: false, fadeSec: 0.05 },
  react_launch:    { clip: 'karate_knockdown', loop: false, fadeSec: 0.05 },
  knockdown:       { clip: 'karate_knockdown', loop: false, fadeSec: 0.08 },
  ko:              { clip: 'karate_knockdown', loop: false, fadeSec: 0.1 },
  fall:            { clip: 'football_tackled_fall', loop: false, fadeSec: 0.06 },
  floor:           { clip: 'karate_floor_hold', loop: true, fadeSec: 0.15 },
  get_up:          { clip: 'karate_get_up', loop: false, fadeSec: 0.1 },
  dodge:           { clip: 'karate_evade', loop: false, fadeSec: 0.1 },    // KARATE-NEO-COOP: the authored slip (was the football juke — the walk at 1.8×); 0.1: the stance → the slip / the lean is a 0.5 m hand move (0.3 m/frame at 0.06, measured)
  ultimate:        { clip: 'karate_counter_throw', loop: false, fadeSec: 0.08 },
  celebrate:       { clip: 'karate_victory_pose', loop: false, fadeSec: 0.2 },
};

const pick = (state: CombatAnimState): CombatClipChoice => ({ state, ...CLIP_FOR[state] });

/** The single decision: combat context in, clip choice out. Pure. */
export function chooseCombatClip(i: CombatAnimInput): CombatClipChoice {
  let state: CombatAnimState;
  if (i.out) state = 'ko';
  else if (i.falling) state = 'fall';
  else if (i.ulting) state = 'ultimate';
  else if (i.hitBy) state = i.hitBy === 'finisher' ? 'react_launch' : (`react_${i.hitBy}` as CombatAnimState);
  else if (i.down) state = 'knockdown';
  else if (i.dodging) state = 'dodge';
  else if (i.guardImpactFlash) state = 'guard_impact';
  else if (i.parryFlash) state = 'parry_flash';
  else if (i.striking) state = i.striking === 'finisher' ? 'strike_finisher' : (`strike_${i.striking}` as CombatAnimState);
  else if (i.dashing) state = 'dash';
  else if (i.blocking) state = 'block_hold';
  else if (i.celebrating) state = 'celebrate';
  else if (i.speed01 > 0.15) state = 'walk';
  else state = i.hasWeapon ? 'idle_weapon' : 'idle';
  const c = pick(state);
  if (i.strikeClip && state.startsWith('strike_')) c.clip = i.strikeClip;
  if (i.dodgeClip && state === 'dodge') c.clip = i.dodgeClip;
  return c;
}

/** States that live on the floor: leaving any of them for a standing state goes through the get-up. */
export const FLOOR_FAMILY: ReadonlySet<CombatAnimState> = new Set<CombatAnimState>(['react_launch', 'knockdown', 'ko', 'fall', 'floor', 'get_up']);
const isOneShot = (s: CombatAnimState): boolean => !CLIP_FOR[s].loop;
const isStrike = (s: CombatAnimState): boolean => s.startsWith('strike_');
const isReact = (s: CombatAnimState): boolean => s.startsWith('react_') && s !== 'react_launch';
/** Standing states a get-up must finish before; a hit, a knockdown or a KO may cut it. */
const RISE_INTERRUPTS: ReadonlySet<CombatAnimState> = new Set<CombatAnimState>(['react_light', 'react_medium', 'react_heavy', 'react_launch', 'knockdown', 'ko', 'fall', 'ultimate']);

/** Where a finished one-shot settles: the down states hold the floor; every other one-shot re-chooses from the context
 *  with its OWN trigger cleared, so a strike that ran out under a held stick lands on the guard step, not an idle flash. */
export function settleAfter(st: CombatAnimState, i: CombatAnimInput): CombatClipChoice {
  switch (st) {
    case 'react_launch': case 'knockdown': case 'ko': case 'fall': return pick('floor');
    case 'strike_light': case 'strike_medium': case 'strike_heavy': case 'strike_finisher': return chooseCombatClip({ ...i, striking: null });
    case 'react_light': case 'react_medium': case 'react_heavy': return chooseCombatClip({ ...i, hitBy: null });
    case 'parry_flash': return chooseCombatClip({ ...i, parryFlash: false });
    case 'guard_impact': return chooseCombatClip({ ...i, guardImpactFlash: false });
    case 'dodge': return chooseCombatClip({ ...i, dodging: false });
    case 'ultimate': return chooseCombatClip({ ...i, ulting: false });
    case 'celebrate': return chooseCombatClip({ ...i, celebrating: false });
    default: return chooseCombatClip(i);
  }
}

/** The one owner of a fighter's clips (per-frame safe). */
export class CombatAnimTree {
  private current: CombatAnimState | null = null;
  /** A one-shot that ran out while its trigger still holds; re-armed when the trigger drops or the beat is cleared. */
  private spent: CombatAnimState | null = null;
  private token = 0;
  private lastInput: CombatAnimInput | null = null;
  /** Fires when a one-shot ENDS on its own (never when the tree cut it) — the mode clears its strike / beat here. */
  onSettle: ((state: CombatAnimState) => void) | null = null;
  constructor(private animator: CharacterAnimator) {}
  get state(): CombatAnimState | null { return this.current; }
  update(input: CombatAnimInput): CombatAnimState {
    this.lastInput = input;
    let c = chooseCombatClip(input);
    if (this.spent && c.state !== this.spent) this.spent = null;
    if (this.spent && c.state === this.spent) c = settleAfter(this.spent, input);
    const cur = this.current;
    if (cur === 'get_up' && !RISE_INTERRUPTS.has(c.state)) return cur;                       // the get-up finishes before any standing state
    if (cur === 'floor' && isReact(c.state)) c = pick('floor');                                // a flinch on the floor stays on the floor
    if (cur && FLOOR_FAMILY.has(cur) && cur !== 'get_up' && !FLOOR_FAMILY.has(c.state)) c = pick('get_up');   // the floor is left through the get-up
    if (c.state !== cur) this.enter(c);
    return c.state;
  }
  private enter(c: CombatClipChoice): void {
    const st = c.state;
    const tok = ++this.token;
    const onEnd = isOneShot(st) ? () => {
      // Fires on a natural end — and also when the animator cuts this clip for the next one (Babylon raises the group's
      // end observable from stop()). Only the natural case is ours: the tree must still be sitting in this state.
      if (this.current !== st || this.token !== tok) return;
      this.spent = st;
      this.onSettle?.(st);
      this.enter(settleAfter(st, this.lastInput ?? EMPTY_INPUT));
    } : undefined;
    this.animator.play(c.clip, onEnd ? { loop: c.loop, fadeSec: c.fadeSec, onEnd } : { loop: c.loop, fadeSec: c.fadeSec });
    this.current = st;
  }
  /** One-beat states must be re-playable: call when the beat ends or a NEW beat of the same kind lands. */
  clearBeat(...states: CombatAnimState[]): void {
    if (this.current && states.includes(this.current)) this.current = null;
    if (this.spent && states.includes(this.spent)) this.spent = null;
  }
  /** True while a strike one-shot is the current state (the mode's "mid-swing"). */
  get striking(): boolean { return this.current !== null && isStrike(this.current); }
  reset(): void { this.current = null; this.spent = null; this.lastInput = null; }
}

const EMPTY_INPUT: CombatAnimInput = {
  speed01: 0, dashing: false, hasWeapon: false, striking: null, blocking: false, parryFlash: false,
  guardImpactFlash: false, hitBy: null, down: false, out: false, ulting: false,
};
