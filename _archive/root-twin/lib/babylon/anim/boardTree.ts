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
  | 'cruise' | 'push' | 'carve_left' | 'carve_right'
  | 'air_tuck' | 'air_grab' | 'air_flip' | 'air_spin'
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
}

const CLIP_FOR: Record<BoardAnimState, { clip: string; loop: boolean; fadeSec: number }> = {
  cruise:        { clip: 'board_ride_idle', loop: true, fadeSec: 0.18 },
  push:          { clip: 'walk_forward', loop: false, fadeSec: 0.12 },
  carve_left:    { clip: 'strafe_left', loop: true, fadeSec: 0.14 },
  carve_right:   { clip: 'strafe_right', loop: true, fadeSec: 0.14 },
  air_tuck:      { clip: 'board_tuck', loop: true, fadeSec: 0.1 },
  air_grab:      { clip: 'board_grab', loop: true, fadeSec: 0.08 },
  air_flip:      { clip: 'skate_kickflip', loop: false, fadeSec: 0.06 },
  air_spin:      { clip: 'board_air', loop: true, fadeSec: 0.08 },
  grind:         { clip: 'board_grind', loop: true, fadeSec: 0.08 },
  manual:        { clip: 'board_ride_idle', loop: true, fadeSec: 0.1 },
  land_clean:    { clip: 'jump_land', loop: false, fadeSec: 0.06 },
  land_sketchy:  { clip: 'jump_land', loop: false, fadeSec: 0.06 },
  bail:          { clip: 'skate_bail', loop: false, fadeSec: 0.05 },
  idle:          { clip: 'board_ride_idle', loop: true, fadeSec: 0.2 },
  celebrate:     { clip: 'bball_score_celebrate', loop: false, fadeSec: 0.15 },
};

export function chooseBoardClip(i: BoardAnimInput): { state: BoardAnimState; clip: string; loop: boolean; fadeSec: number } {
  let state: BoardAnimState;
  if (i.bailing) state = 'bail';
  else if (i.celebrating) state = 'celebrate';
  else if (i.landing === 'sketchy') state = 'land_sketchy';
  else if (i.landing === 'clean') state = 'land_clean';
  else if (i.grinding) state = 'grind';
  else if (i.manual) state = 'manual';
  else if (i.airborne) {
    state = i.grabHeld ? 'air_grab' : i.flipping ? 'air_flip' : i.spinning ? 'air_spin' : 'air_tuck';
  } else if (i.pushing) state = 'push';
  else if (Math.abs(i.lean) > 0.4 && i.speed01 > 0.2) state = i.lean < 0 ? 'carve_left' : 'carve_right';
  else if (i.speed01 > 0.15) state = 'cruise';
  else state = 'idle';
  return { state, ...CLIP_FOR[state] };
}

export class BoardAnimTree {
  private current: BoardAnimState | null = null;
  constructor(private animator: CharacterAnimator) {}
  update(input: BoardAnimInput): BoardAnimState {
    const c = chooseBoardClip(input);
    if (c.state !== this.current) {
      this.animator.play(c.clip, { loop: c.loop, fadeSec: c.fadeSec });
      this.current = c.state;
    }
    return c.state;
  }
  clearBeat(...states: BoardAnimState[]): void {
    if (this.current && states.includes(this.current)) this.current = null;
  }
  reset(): void { this.current = null; }
}
