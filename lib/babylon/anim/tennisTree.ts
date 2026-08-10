// tennisTree — Mode 7 Phase 8: the tennis animation blend tree.
import type { CharacterAnimator } from './CharacterAnimator';

export type TennisAnimState =
  | 'idle' | 'split_step' | 'footwork' | 'recover'
  | 'stroke_topspin' | 'stroke_slice' | 'stroke_flat'
  | 'serve_toss' | 'serve_flat' | 'serve_kick' | 'serve_slice'
  | 'volley' | 'overhead' | 'celebrate' | 'dejected';

export interface TennisAnimInput {
  speed01: number;
  splitStepping: boolean;
  recovering: boolean;
  stroke: 'topspin' | 'slice' | 'flat' | null;
  serve: 'flat' | 'kick' | 'slice' | null;
  tossing: boolean;
  volleying: boolean;
  overhead: boolean;
  celebrating?: boolean;
  dejected?: boolean;
}

const CLIP_FOR: Record<TennisAnimState, { clip: string; loop: boolean; fadeSec: number }> = {
  idle:           { clip: 'idle_stand', loop: true, fadeSec: 0.2 },
  split_step:     { clip: 'idle_stand', loop: false, fadeSec: 0.08 },
  footwork:       { clip: 'walk_forward', loop: true, fadeSec: 0.12 },
  recover:        { clip: 'run_forward', loop: true, fadeSec: 0.1 },
  stroke_topspin: { clip: 'tennis_forehand', loop: false, fadeSec: 0.05 },
  stroke_slice:   { clip: 'karate_kick_roundhouse', loop: false, fadeSec: 0.05 },
  stroke_flat:    { clip: 'tennis_forehand', loop: false, fadeSec: 0.05 },
  serve_toss:     { clip: 'jump_up', loop: false, fadeSec: 0.1 },
  serve_flat:     { clip: 'tennis_forehand', loop: false, fadeSec: 0.05 },
  serve_kick:     { clip: 'tennis_forehand', loop: false, fadeSec: 0.05 },
  serve_slice:    { clip: 'tennis_forehand', loop: false, fadeSec: 0.05 },
  volley:         { clip: 'jab', loop: false, fadeSec: 0.04 },
  overhead:       { clip: 'jump_land', loop: false, fadeSec: 0.05 },
  celebrate:      { clip: 'uppercut', loop: false, fadeSec: 0.12 },
  dejected:       { clip: 'football_tackled_fall', loop: false, fadeSec: 0.2 },
};

export function chooseTennisClip(i: TennisAnimInput): { state: TennisAnimState; clip: string; loop: boolean; fadeSec: number } {
  let state: TennisAnimState;
  if (i.celebrating) state = 'celebrate';
  else if (i.dejected) state = 'dejected';
  else if (i.overhead) state = 'overhead';
  else if (i.serve) state = (`serve_${i.serve}`) as TennisAnimState;
  else if (i.tossing) state = 'serve_toss';
  else if (i.volleying) state = 'volley';
  else if (i.stroke) state = (`stroke_${i.stroke}`) as TennisAnimState;
  else if (i.splitStepping) state = 'split_step';
  else if (i.recovering) state = 'recover';
  else if (i.speed01 > 0.15) state = 'footwork';
  else state = 'idle';
  return { state, ...CLIP_FOR[state] };
}

export class TennisAnimTree {
  private current: TennisAnimState | null = null;
  constructor(private animator: CharacterAnimator) {}
  update(input: TennisAnimInput): TennisAnimState {
    const c = chooseTennisClip(input);
    if (c.state !== this.current) {
      this.animator.play(c.clip, { loop: c.loop, fadeSec: c.fadeSec });
      this.current = c.state;
    }
    return c.state;
  }
  clearBeat(...states: TennisAnimState[]): void {
    if (this.current && states.includes(this.current)) this.current = null;
  }
  reset(): void { this.current = null; }
}
