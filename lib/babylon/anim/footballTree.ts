// footballTree — Mode 4 Phase 8: the football animation blend tree.
// Same discipline as basketballTree/combatTree/boardTree: one pure
// decision fn, one deduping wiring class, all clips registry-resolvable.

import type { CharacterAnimator } from './CharacterAnimator';

export type FootballAnimState =
  | 'presnap_idle' | 'snap' | 'dropback' | 'throw'
  | 'route_run' | 'carry' | 'juke' | 'spin' | 'stiff_arm' | 'truck'
  | 'catch_clean' | 'catch_contested' | 'tackled' | 'block' | 'rush'
  | 'celebrate' | 'dejected';

export interface FootballAnimInput {
  presnap: boolean;
  snapped: boolean;
  isQB: boolean;
  droppingBack: boolean;
  throwing: boolean;
  runningRoute: boolean;
  carrying: boolean;
  move: 'juke' | 'spin' | 'stiffArm' | 'truck' | null;
  catching: 'none' | 'clean' | 'contested';
  beingTackled: boolean;
  blocking: boolean;
  rushing: boolean;
  celebrating?: boolean;
  dejected?: boolean;
}

const CLIP_FOR: Record<FootballAnimState, { clip: string; loop: boolean; fadeSec: number }> = {
  presnap_idle:    { clip: 'idle_stand', loop: true, fadeSec: 0.25 },
  snap:            { clip: 'idle_stand', loop: false, fadeSec: 0.1 },
  dropback:        { clip: 'walk_forward', loop: true, fadeSec: 0.15 },
  throw:           { clip: 'football_stiff_arm', loop: false, fadeSec: 0.06 },
  route_run:       { clip: 'football_sprint_return', loop: true, fadeSec: 0.12 },
  carry:           { clip: 'football_sprint_return', loop: true, fadeSec: 0.1 },
  juke:            { clip: 'football_juke_left', loop: false, fadeSec: 0.06 },
  spin:            { clip: 'football_spin_move', loop: false, fadeSec: 0.06 },
  stiff_arm:       { clip: 'football_stiff_arm', loop: false, fadeSec: 0.06 },
  truck:           { clip: 'football_sprint_return', loop: true, fadeSec: 0.08 },
  catch_clean:     { clip: 'jump_up', loop: false, fadeSec: 0.08 },
  catch_contested: { clip: 'jump_up', loop: false, fadeSec: 0.05 },
  tackled:         { clip: 'football_tackled_fall', loop: false, fadeSec: 0.05 },
  block:           { clip: 'bball_defend_stance', loop: true, fadeSec: 0.15 },
  rush:            { clip: 'run_forward', loop: true, fadeSec: 0.1 },
  celebrate:       { clip: 'football_touchdown_spike', loop: false, fadeSec: 0.12 },
  dejected:        { clip: 'football_tackled_fall', loop: false, fadeSec: 0.2 },
};

export function chooseFootballClip(i: FootballAnimInput): { state: FootballAnimState; clip: string; loop: boolean; fadeSec: number } {
  let state: FootballAnimState;
  if (i.beingTackled) state = 'tackled';
  else if (i.celebrating) state = 'celebrate';
  else if (i.dejected) state = 'dejected';
  else if (i.catching === 'contested') state = 'catch_contested';
  else if (i.catching === 'clean') state = 'catch_clean';
  else if (i.move) state = i.move === 'stiffArm' ? 'stiff_arm' : i.move;
  else if (i.throwing) state = 'throw';
  else if (i.droppingBack) state = 'dropback';
  else if (i.carrying) state = 'carry';
  else if (i.runningRoute) state = 'route_run';
  else if (i.blocking) state = 'block';
  else if (i.rushing) state = 'rush';
  else if (i.snapped) state = 'snap';
  else state = 'presnap_idle';
  return { state, ...CLIP_FOR[state] };
}

export class FootballAnimTree {
  private current: FootballAnimState | null = null;
  constructor(private animator: CharacterAnimator) {}
  update(input: FootballAnimInput): FootballAnimState {
    const c = chooseFootballClip(input);
    if (c.state !== this.current) {
      this.animator.play(c.clip, { loop: c.loop, fadeSec: c.fadeSec });
      this.current = c.state;
    }
    return c.state;
  }
  clearBeat(...states: FootballAnimState[]): void {
    if (this.current && states.includes(this.current)) this.current = null;
  }
  reset(): void { this.current = null; }
}
