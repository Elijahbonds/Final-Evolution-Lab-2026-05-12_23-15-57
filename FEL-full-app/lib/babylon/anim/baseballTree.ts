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
  /** BASEBALL-FEEL §2: a hit's run to the base plays baseball_run (run ×1.0); a homer keeps the trot. */
  sprint?: boolean;
  /** §2: the release on a slider is the side-arm (baseball_pitch_side, as Derby). */
  sideArm?: boolean;
  /** §2: a fielder closing in on the ball strafes (strafe_left / strafe_right) under the routine slot. */
  strafe?: 'left' | 'right' | null;
  /** §3: the swing's requested speedRatio (contact starts at Derby's 1.7; power ≥ contact). */
  swingSpeed?: number;
}

export const BASEBALL_CLIP_FOR: Readonly<Record<BaseballAnimState, { clip: string; loop: boolean; fadeSec: number }>> = {
  idle:          { clip: 'idle_stand', loop: true, fadeSec: 0.2 },
  // BASEBALL-FEEL §2: the pitcher's wind-up HOLDS idle_stand (baseball_stance is a batter's), then the release clip plays.
  windup:        { clip: 'idle_stand', loop: true, fadeSec: 0.2 },
  pitch_release: { clip: 'derby_pitch', loop: false, fadeSec: 0.08 },
  stance:        { clip: 'baseball_bat_stance', loop: true, fadeSec: 0.18 },
  swing_contact: { clip: 'baseball_swing_full', loop: false, fadeSec: 0.05 },
  swing_power:   { clip: 'baseball_contact_drive', loop: false, fadeSec: 0.04 },
  field_routine: { clip: 'idle_stand', loop: true, fadeSec: 0.15 },
  field_dive:    { clip: 'jump_land', loop: false, fadeSec: 0.05 },
  // BASEBALL-3INN (2026-10-22, ALL-MODES §6B / ANIM-ALL-1): the throw played the karate jab and the celebration the
  // uppercut — borrowed combat clips, which the baseball clip scope does not even build. The throw is the over-the-top
  // pitch (an arm that throws a ball) and the celebration the core jump; both clips already exist, no new asset.
  // BASEBALL-FEEL (2026-10-23, PM): a fielder's throw is the side-arm, not the pitcher's over-the-top delivery.
  throw:         { clip: 'baseball_pitch_side', loop: false, fadeSec: 0.07 },
  run:           { clip: 'baseball_homer_trot', loop: true, fadeSec: 0.12 },
  slide:         { clip: 'jump_land', loop: false, fadeSec: 0.05 },
  celebrate:     { clip: 'jump_up', loop: false, fadeSec: 0.12 },
  dejected:      { clip: 'idle_stand', loop: false, fadeSec: 0.2 },
};

export function chooseBaseballClip(i: BaseballAnimInput): { state: BaseballAnimState; clip: string; loop: boolean; fadeSec: number; speedRatio: number } {
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
  const c = { state, ...BASEBALL_CLIP_FOR[state], speedRatio: 1 };
  // §2 / §3: the same slot, a different existing clip or speed
  if (state === 'run' && i.sprint) c.clip = 'baseball_run';
  else if (state === 'pitch_release' && i.sideArm) c.clip = 'baseball_pitch_side';
  else if (state === 'field_routine' && i.strafe) { c.clip = i.strafe === 'left' ? 'strafe_left' : 'strafe_right'; c.loop = true; }
  else if ((state === 'swing_contact' || state === 'swing_power') && i.swingSpeed) c.speedRatio = i.swingSpeed;
  return c;
}

export class BaseballAnimTree {
  private current: BaseballAnimState | null = null;
  private currentClip: string | null = null;
  constructor(private animator: CharacterAnimator) {}
  update(input: BaseballAnimInput): BaseballAnimState {
    const c = chooseBaseballClip(input);
    if (c.state !== this.current || c.clip !== this.currentClip) {
      this.animator.play(c.clip, c.speedRatio !== 1 ? { loop: c.loop, fadeSec: c.fadeSec, speedRatio: c.speedRatio } : { loop: c.loop, fadeSec: c.fadeSec });
      this.current = c.state; this.currentClip = c.clip;
    }
    return c.state;
  }
  clearBeat(...states: BaseballAnimState[]): void {
    if (this.current && states.includes(this.current)) { this.current = null; this.currentClip = null; }
  }
  reset(): void { this.current = null; this.currentClip = null; }
}
