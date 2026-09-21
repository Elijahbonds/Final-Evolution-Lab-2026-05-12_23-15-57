// boardTree — Mode 3 Phase 8: the board-sport animation blend tree.
//
// Same discipline as basketballTree/combatTree: one pure decision fn maps
// ride context to clip + loop + fade; a thin class dedupes per-frame
// play(). States: push/cruise/carve (lean), air (tuck/grab/flip pose),
// grind, manual, landing (clean/sketchy), bail. The board prop follows the
// rider root (BoardSync owns that — this tree never touches the board).
//
// Foot-on-board contact: FootPlant (Mode 1) is reused — on landings and
// grinds we pin BOTH feet (the plant window) so the carve/landing reads
// with zero foot-skate on the board. Court is flat; here the "ground" is
// the moving board, so the pin target is the rider root space, not world.

import type { CharacterAnimator } from './CharacterAnimator';

export type BoardAnimState =
  | 'cruise' | 'push' | 'carve_left' | 'carve_right' | 'tuck'
  | 'ollie' | 'air_tuck' | 'air_grab' | 'air_flip' | 'air_spin'
  | 'grind' | 'manual'
  | 'land_clean' | 'land_sketchy' | 'bail'
  | 'idle' | 'celebrate';

export interface BoardAnimInput {
  speed01: number;
  pushing: boolean;
  lean: number;                 // -1..1
  airborne: boolean;
  grabHeld: boolean;
  flipping: boolean;
  spinning: boolean;
  grinding: boolean;
  manual: boolean;
  landing: 'none' | 'clean' | 'sketchy';   // one-beat
  bailing: boolean;
  celebrating?: boolean;
  /** The pop beat (VENICE-SKATE-THPS): the mode holds this for the ollie clip's plant/pop/hang, then drops it. */
  popping?: boolean;
  /** Grounded speed tuck (snow's throttle, surf's buried rail). A carve wins over it — a racer rises to turn. */
  tucking?: boolean;
}

const CLIP_FOR: Record<BoardAnimState, { clip: string; loop: boolean; fadeSec: number }> = {
  cruise:        { clip: 'board_ride_idle', loop: true, fadeSec: 0.18 },
  push:          { clip: 'board_push', loop: false, fadeSec: 0.1 },       // was 'walk_forward': walk arms on a board
  carve_left:    { clip: 'board_carve_left', loop: true, fadeSec: 0.2 },   // the lean-in IS the fade — the clips hold the pose
  carve_right:   { clip: 'board_carve_right', loop: true, fadeSec: 0.2 },
  tuck:          { clip: 'board_tuck', loop: true, fadeSec: 0.22 },
  ollie:         { clip: 'skate_ollie', loop: false, fadeSec: 0.05 },   // VENICE-SKATE-THPS: plant -> pop -> hang; the pop had no body before

  // ANIM-READABILITY (2026-09-21): the plain air was 'board_tuck' — the grounded SPEED tuck (spine folded 46°, head down,
  // hands behind the hips). On a plain ollie or a straight air that is a racing crouch falling through the sky, and it
  // was also the one clip a grounded snow tuck and an air shared, so leaving the lip changed nothing on the body. Every
  // trick def already names 'board_air' for the ollie and the straight air (BoardTricks), and BoardPosture's air window
  // opens the chest for exactly this reason ("a tucked-forward air reads as a fall"). The state keeps its name.
  air_tuck:      { clip: 'board_air', loop: true, fadeSec: 0.12 },
  air_grab:      { clip: 'board_grab', loop: true, fadeSec: 0.12 },
  air_flip:      { clip: 'skate_kickflip', loop: false, fadeSec: 0.06 },
  air_spin:      { clip: 'board_air', loop: true, fadeSec: 0.12 },
  grind:         { clip: 'board_grind', loop: true, fadeSec: 0.08 },
  manual:        { clip: 'board_manual', loop: true, fadeSec: 0.12 },   // VENICE-SKATE-THPS: was the ride idle — the THPS link looked exactly like coasting
  land_clean:    { clip: 'board_land', loop: false, fadeSec: 0.08 },
  land_sketchy:  { clip: 'board_land_sketchy', loop: false, fadeSec: 0.08 },   // ANIM-READABILITY (2026-09-21): was the clean land — the judge said sketchy and the body said stomped
  bail:          { clip: 'skate_bail', loop: false, fadeSec: 0.05 },
  idle:          { clip: 'board_stand_idle', loop: true, fadeSec: 0.3 },   // ANIM-READABILITY (2026-09-21): was the ride idle — stopped looked exactly like cruising
  celebrate:     { clip: 'board_land', loop: false, fadeSec: 0.15 },   // SHARED-ANIM-BUS: was the hoops score celebrate (→ karate uppercut) on a board; a rider stomps the landing
};

/** Carve hysteresis: enter above 0.4, leave below 0.3 — a lean hovering on one threshold used to flip the state every
 *  frame, and each flip restarts the animator's crossfade from weight 0 (measured as a 0.33 m hand snap per flip). */
export const CARVE_ON = 0.4;
const CARVE_OFF = 0.3;
/** Rolling hysteresis (ANIM-READABILITY, 2026-09-21): idle and cruise are different clips now, so a board creeping along
 *  the old single 0.15 line would stand up and crouch every frame. Crouch into the ride above 0.15, stand below 0.08. */
export const ROLL_ON = 0.15;
const ROLL_OFF = 0.08;

export function chooseBoardClip(i: BoardAnimInput, prev: BoardAnimState | null = null): { state: BoardAnimState; clip: string; loop: boolean; fadeSec: number } {
  let state: BoardAnimState;
  const inCarve = prev === 'carve_left' || prev === 'carve_right';
  if (i.bailing) state = 'bail';
  else if (i.celebrating) state = 'celebrate';
  else if (i.landing === 'sketchy') state = 'land_sketchy';
  else if (i.landing === 'clean') state = 'land_clean';
  else if (i.grinding) state = 'grind';
  else if (i.manual) state = 'manual';
  // the pop beat wins over the air pose it leads into, but never over a trick the player actually threw
  else if (i.popping && !i.grabHeld && !i.flipping && !i.spinning) state = 'ollie';
  else if (i.airborne) {
    state = i.grabHeld ? 'air_grab' : i.flipping ? 'air_flip' : i.spinning ? 'air_spin' : 'air_tuck';
  } else if (i.pushing) state = 'push';
  else if (Math.abs(i.lean) > (inCarve ? CARVE_OFF : CARVE_ON) && i.speed01 > 0.2) state = i.lean < 0 ? 'carve_left' : 'carve_right';
  else if (i.tucking) state = 'tuck';
  else if (i.speed01 > (prev === 'idle' || prev === null ? ROLL_ON : ROLL_OFF)) state = 'cruise';
  else state = 'idle';
  return { state, ...CLIP_FOR[state] };
}

/** Where a finished one-shot settles while its trigger still holds (a flip that ran out mid-air holds the tuck). */
export const AFTER_ONESHOT: Partial<Record<BoardAnimState, BoardAnimState>> = {
  push: 'cruise', ollie: 'air_tuck', air_flip: 'air_tuck', land_clean: 'cruise', land_sketchy: 'cruise', bail: 'idle', celebrate: 'idle',
};

// ONE OWNER (ANIM-READABILITY, 2026-09-07). The tree is the only thing that plays clips on a board rider. Before, the
// modes and the TrickMachine also called play() directly, and the tree's (or the mode's own per-frame) play cut every
// one of them a frame later: the wipe read as a 0.13 s blend, the grab and the landing never showed. And a one-shot the
// tree DID own ran out on its own: the animator's neverBindPose chain then crossfaded to the ride idle from inside the
// animator's own fade handler, which stranded the fade it was replacing — two loco clips at partial weight for ~1 s
// (skate baseline: ride idle + tuck 0.93 s, ride idle + walk 1.2 s). The tree now passes its own onEnd for every
// one-shot, settles it into AFTER_ONESHOT, and ignores the end callback when it fired because the tree itself moved on.
export class BoardAnimTree {
  private current: BoardAnimState | null = null;
  /** A one-shot that ran out while its trigger still held; re-armed when the trigger drops. */
  private spent: BoardAnimState | null = null;
  private token = 0;
  constructor(private animator: CharacterAnimator) {}
  update(input: BoardAnimInput): BoardAnimState {
    let c = chooseBoardClip(input, this.current);
    if (this.spent && c.state !== this.spent) this.spent = null;
    if (this.spent && c.state === this.spent) { const after = AFTER_ONESHOT[c.state] ?? 'idle'; c = { state: after, ...CLIP_FOR[after] }; }
    if (c.state !== this.current) this.enter(c);
    return c.state;
  }
  private enter(c: { state: BoardAnimState; clip: string; loop: boolean; fadeSec: number }): void {
    const st = c.state;
    const tok = ++this.token;
    const onEnd = c.loop ? undefined : () => {
      // Fires on a natural end — and also when the animator cuts this clip for the next one (Babylon raises the group's
      // end observable from stop()). Only the natural case is ours: the tree must still be sitting in this state.
      if (this.current !== st || this.token !== tok) return;
      this.spent = st;
      const after = AFTER_ONESHOT[st] ?? 'idle';
      this.enter({ state: after, ...CLIP_FOR[after] });
    };
    this.animator.play(c.clip, onEnd ? { loop: c.loop, fadeSec: c.fadeSec, onEnd } : { loop: c.loop, fadeSec: c.fadeSec });
    this.current = st;
  }
  /** The mode's beat window closed: forget the beat state so the next update re-chooses (a no-op if already moved on). */
  clearBeat(...states: BoardAnimState[]): void {
    if (this.current && states.includes(this.current)) this.current = null;
  }
  reset(): void { this.current = null; this.spent = null; }
}
