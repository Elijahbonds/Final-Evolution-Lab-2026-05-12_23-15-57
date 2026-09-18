// soccerTree — Mode 5 Phase 8: the soccer animation blend tree. Same
// discipline as the other mode trees; all clips registry-resolvable.

import type { CharacterAnimator } from './CharacterAnimator';

export type SoccerAnimState =
  | 'idle' | 'jog' | 'sprint' | 'dribble' | 'jockey'
  | 'pass_ground' | 'pass_loft' | 'shot_power' | 'shot_finesse'
  | 'first_touch' | 'tackle_standing' | 'tackle_slide'
  | 'gk_dive_left' | 'gk_dive_right' | 'celebrate' | 'dejected';

export interface SoccerAnimInput {
  speed01: number;
  dribbling: boolean;
  jockeying: boolean;
  action: 'none' | 'pass_ground' | 'pass_loft' | 'shot_power' | 'shot_finesse'
        | 'first_touch' | 'tackle_standing' | 'tackle_slide' | 'gk_dive_left' | 'gk_dive_right';
  celebrating?: boolean;
  dejected?: boolean;
}

const CLIP_FOR: Record<SoccerAnimState, { clip: string; loop: boolean; fadeSec: number }> = {
  idle:            { clip: 'idle_stand', loop: true, fadeSec: 0.2 },
  jog:             { clip: 'walk_forward', loop: true, fadeSec: 0.15 },
  sprint:          { clip: 'sprint_forward', loop: true, fadeSec: 0.1 },
  dribble:         { clip: 'soccer_dribble_jog', loop: true, fadeSec: 0.12 },
  jockey:          { clip: 'bball_defend_stance', loop: true, fadeSec: 0.14 },
  pass_ground:     { clip: 'soccer_kick_pass', loop: false, fadeSec: 0.06 },
  pass_loft:       { clip: 'soccer_kick_pass', loop: false, fadeSec: 0.06 },
  shot_power:      { clip: 'soccer_kick_shoot', loop: false, fadeSec: 0.05 },
  shot_finesse:    { clip: 'soccer_kick_shoot', loop: false, fadeSec: 0.05 },
  first_touch:     { clip: 'idle_stand', loop: false, fadeSec: 0.08 },
  tackle_standing: { clip: 'karate_punch_light', loop: false, fadeSec: 0.06 },
  tackle_slide:    { clip: 'soccer_tackle_slide', loop: false, fadeSec: 0.05 },
  gk_dive_left:    { clip: 'keeper_dive_left', loop: false, fadeSec: 0.05 },
  gk_dive_right:   { clip: 'keeper_dive_right', loop: false, fadeSec: 0.05 },
  celebrate:       { clip: 'soccer_goal_celebrate', loop: false, fadeSec: 0.15 },
  dejected:        { clip: 'football_tackled_fall', loop: false, fadeSec: 0.2 },
};

export function chooseSoccerClip(i: SoccerAnimInput): { state: SoccerAnimState; clip: string; loop: boolean; fadeSec: number } {
  let state: SoccerAnimState;
  if (i.celebrating) state = 'celebrate';
  else if (i.dejected) state = 'dejected';
  else if (i.action !== 'none') state = i.action;
  else if (i.jockeying) state = 'jockey';
  else if (i.dribbling) state = 'dribble';
  else if (i.speed01 > 0.75) state = 'sprint';
  else if (i.speed01 > 0.15) state = 'jog';
  else state = 'idle';
  return { state, ...CLIP_FOR[state] };
}

export class SoccerAnimTree {
  private current: SoccerAnimState | null = null;
  constructor(private animator: CharacterAnimator) {}
  update(input: SoccerAnimInput): SoccerAnimState {
    const c = chooseSoccerClip(input);
    if (c.state !== this.current) {
      this.animator.play(c.clip, { loop: c.loop, fadeSec: c.fadeSec });
      this.current = c.state;
    }
    return c.state;
  }
  clearBeat(...states: SoccerAnimState[]): void {
    if (this.current && states.includes(this.current)) this.current = null;
  }
  reset(): void { this.current = null; }
}
