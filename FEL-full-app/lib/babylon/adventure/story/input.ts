/**
 * Where a press goes in the story (Phase B). While a scene plays (the sim is paused) the pad drives the scene: the
 * confirm button (A, or the keyboard's Space / J) taps to finish a line and HOLDS to skip the scene, the d-pad's up and
 * down move a choice's highlight. Otherwise every input goes to the Adventure's mapper (host/inputMap), as in the yard.
 * The mapper is reset when a scene starts so no held button survives into it, or out of it into play.
 * Pure: the mode (AdventureMode's story face) and the headless playthrough route through this one function.
 */

import type { FelInput } from '@/lib/babylon/core/InputBus';
import { KEY_SPACE_DOWN } from '@/lib/babylon/core/StartWake';
import type { InputMapper } from '../host/inputMap';
import type { ChapterRunner } from './chapter';

export interface StoryInputState { wasBlocking: boolean; spaceDown: boolean }

export const storyInputState = (): StoryInputState => ({ wasBlocking: false, spaceDown: false });

/** Route one FelInput. Returns 'scene' when the scene took it, 'play' when the mapper did. */
export function routeStoryInput(e: FelInput, runner: ChapterRunner, mapper: InputMapper, st: StoryInputState): 'scene' | 'play' {
  const blocking = runner.blocking;
  if (blocking !== st.wasBlocking) { st.wasBlocking = blocking; mapper.reset(); }
  if (!blocking) { mapper.onInput(e); return 'play'; }
  switch (e.t) {
    case 'button':
      if (e.btn === 'A' && e.src !== 'space' && e.src !== 'body') { if (e.pressed) runner.press(); else runner.release(); }
      break;
    case 'trigger':
      // the keyboard's SPACE rides the R trigger (its down marker, then 0 on release)
      if (e.side === 'R' && (e.value === KEY_SPACE_DOWN || st.spaceDown)) {
        const down = e.value > 0;
        if (down && !st.spaceDown) { st.spaceDown = true; runner.press(); } else if (!down && st.spaceDown) { st.spaceDown = false; runner.release(); }
      }
      break;
    case 'dpad':
      if (e.pressed && (e.dir === 'up' || e.dir === 'down')) runner.move(e.dir === 'up' ? -1 : 1);
      break;
    default: break;
  }
  return 'scene';
}

/** Call once per frame: a scene that started or ended since the last input lets go of whatever the mapper held. */
export function settleStoryInput(runner: ChapterRunner, mapper: InputMapper, st: StoryInputState): void {
  const blocking = runner.blocking;
  if (blocking !== st.wasBlocking) { st.wasBlocking = blocking; mapper.reset(); st.spaceDown = false; }
}
