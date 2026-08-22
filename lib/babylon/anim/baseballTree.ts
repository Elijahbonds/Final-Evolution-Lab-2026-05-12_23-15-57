// baseballTree — Mode 6 Phase 8: the baseball animation blend tree.
// Same discipline as the other mode trees; all clips registry-resolvable.

import type { CharacterAnimator } from './CharacterAnimator';

export type BaseballAnimState =
  | 'idle' | 'windup' | 'pitch_release' | 'stance' | 'swing_contact' | 'swing_power'
  | 'field_routine' | 'field_dive' | 'throw' | 'run' | 'slide'
  | 'celebrate' | 'dejected';

export interface BaseballAnimInput {
  pitching: boolean;
  windingUp: boolean;
  releasing: boolean;
  batting: boolean;
  swinging: 'contact' | 'power' | null;
  fielding: 'none' | 'routine' | 'dive';
  throwing: boolean;
  running: boolean;
  sliding: boolean;
  celebrating?: boolean;
  dejected?: boolean;
}

const CLIP_FOR: Record<BaseballAnimState, { clip: string; loop: boolean; fadeSec: number }> = {
  idle:          { clip: 'idle_stand', loop: true, fadeSec: 0.2 },
  windup:        { clip: 'baseball_bat_stance', loop: true, fadeSec: 0.2 },
  pitch_release: { clip: 'derby_pitch', loop: false, fadeSec: 0.08 },
  stance:        { clip: 'baseball_bat_stance', loop: true, fadeSec: 0.18 },
  swing_contact: { clip: 'baseball_swing_full', loop: false, fadeSec: 0.05 },
  swing_power:   { clip: 'baseball_contact_drive', loop: false, fadeSec: 0.04 },
  field_routine: { clip: 'idle_stand', loop: true, fadeSec: 0.15 },
  field_dive:    { clip: 'keeper_dive_left', loop: false, fadeSec: 0.05 },
  throw:         { clip: 'jab', loop: false, fadeSec: 0.07 },
  run:           { clip: 'baseball_homer_trot', loop: true, fadeSec: 0.12 },
  slide:         { clip: 'soccer_tackle_slide', loop: false, fadeSec: 0.05 },
  celebrate:     { clip: 'uppercut', loop: false, fadeSec: 0.12 },
  dejected:      { clip: 'football_tackled_fall', loop: false, fadeSec: 0.2 },
};

export function chooseBaseballClip(i: BaseballAnimInput): { state: BaseballAnimState; clip: string; loop: boolean; fadeSec: number } {
  let state: BaseballAnimState;
  if (i.celebrating) state = 'celebrate';
  else if (i.dejected) state = 'dejected';
  else if (i.sliding) state = 'slide';
  else if (i.swinging) state = i.swinging === 'power' ? 'swing_power' : 'swing_contact';
  else if (i.fielding === 'dive') state = 'field_dive';
  else if (i.throwing) state = 'throw';
  else if (i.releasing) state = 'pitch_release';
  else if (i.fielding === 'routine') state = 'field_routine';
  else if (i.running) state = 'run';
  else if (i.windingUp) state = 'windup';
  else if (i.batting) state = 'stance';
  else if (i.pitching) state = 'windup';
  else state = 'idle';
  return { state, ...CLIP_FOR[state] };
}

export class BaseballAnimTree {
  private current: BaseballAnimState | null = null;
  constructor(private animator: CharacterAnimator) {}
  update(input: BaseballAnimInput): BaseballAnimState {
    const c = chooseBaseballClip(input);
    if (c.state !== this.current) {
      this.animator.play(c.clip, { loop: c.loop, fadeSec: c.fadeSec });
      this.current = c.state;
    }
    return c.state;
  }
  clearBeat(...states: BaseballAnimState[]): void {
    if (this.current && states.includes(this.current)) this.current = null;
  }
  reset(): void { this.current = null; }
}
