// UX advice §2: the framing outline is cyan while you line up and green with a check + "In frame" when you're in —
// never colour alone — and it turns side-on (with the turn prompt) for side-view parts. The words obey SCREEN A.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RunnerView } from '@/lib/assess/runner';
import { LiveHud } from '@/app/play/mirror/assess/_components/live-hud';

/** A RunnerView for a render test: the fields the HUD reads, on the step given. */
function viewFor(step: RunnerView['step'], over: Partial<RunnerView> = {}): RunnerView {
  return {
    step, test: 'T1', part: 'T1-front', label: null, view: 'front',
    reps: { count: 2, target: 3, marks: ['clean', 'fault'] },
    countdown: step === 'countdown' ? 2 : null,
    restartInMs: step === 'paused' ? 4500 : null,
    framing: null, hold: step === 'calibrate' ? 0.4 : 0,
    instruction: step === 'paused' ? 'Step back into the light. Step into the shot — I cannot see you yet.' : 'Get ready.',
    say: null, skeleton: 'tracking', wantsHighFps: false,
    mini: step === 'miniResult' || step === 'painCheck' ? { test: 'T1', text: 'Overhead squat: done.' } : null,
    done: step === 'partDone' ? { test: 'T1', part: 'T1-front' } : null,
    result: null, progress: { done: 0, total: 7 }, flash: null,
    rejection: step === 'active' ? { text: 'That one did not count — stand tall between reps.', at: 0 } : null,
    move: { index: 1, total: 4, name: 'Overhead squat', cue: 'Overhead squat, facing the camera' },
    setupReady: false, dimWarning: true, retryMessage: 'Lost you for a moment — trying this move once more.',
    handsFree: true,
    ...over,
  };
}

const render = (v: RunnerView, voiceOn = true) =>
  renderToStaticMarkup(createElement(LiveHud, { view: v, voiceOn, onPain: () => {}, onTakeoff: () => {}, onStop: () => {} }));

import { FRAMING_IN_FRAME } from '@/lib/screen/copy';
import { SIDE_TURNED } from '@/lib/mirror/framing';

describe('framing outline (UX §2)', () => {
  it('pins the copy', () => {
    expect(FRAMING_IN_FRAME).toBe('In frame');
    expect(SIDE_TURNED).toBe('Turn side-on to the camera.');
  });

  it('lining up: a cyan dashed front outline, no badge', () => {
    const h = render(viewFor('framing'));
    expect(h).toContain('data-framing-ghost="front"');
    expect(h).toContain('stroke="#00E5FF"');
    expect(h).toContain('stroke-dasharray="2 1.5"');
    expect(h).not.toContain('data-in-frame');
    expect(h).not.toContain('data-turn-side');
  });

  it('in the shot: green, solid, and a check with the words — not colour alone', () => {
    const h = render(viewFor('framing', { setupReady: true }));
    expect(h).toContain('stroke="#00FF9D"');
    expect(h).toContain('data-in-frame');
    expect(h).toMatch(/data-in-frame[^>]*>\s*<svg[^>]*lucide/);
    expect(h).toContain(`<span>${FRAMING_IN_FRAME}</span>`);
  });

  it('while a rep is up (calibrate) the check stays but the words go (SCREEN A)', () => {
    const h = render(viewFor('calibrate', { setupReady: true }));
    expect(h).toContain('data-in-frame');
    expect(h).not.toContain(FRAMING_IN_FRAME);
  });

  it('side-view parts: a side-on outline and the turn prompt until in frame', () => {
    const h = render(viewFor('framing', { view: 'side' }));
    expect(h).toContain('data-framing-ghost="side"');
    expect(h).toContain(SIDE_TURNED);
    const ok = render(viewFor('framing', { view: 'side', setupReady: true }));
    expect(ok).not.toContain('data-turn-side');
    expect(render(viewFor('calibrateSide', { view: 'side' }))).not.toContain('data-turn-side');
  });
});
