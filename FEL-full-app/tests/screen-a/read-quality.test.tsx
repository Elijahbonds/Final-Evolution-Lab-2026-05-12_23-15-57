// UX advice §3: the reading-quality pill on the live HUD — icon + word, two states, never a percentage; while a rep is up (SCREEN A) only the icon.
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

describe('reading-quality pill (UX §3)', () => {
  it('no pill without a reading', () => {
    expect(render(viewFor('position'))).not.toContain('data-read-quality');
  });
  it('position: icon and word', () => {
    expect(render(viewFor('position', { readQuality: 'clear' }))).toMatch(/data-read-quality="clear"[^>]*>\s*<svg[^>]*lucide[^]*<span>Clear read<\/span>/);
    expect(render(viewFor('position', { readQuality: 'partial' }))).toContain('<span>Partial read</span>');
  });
  it('active: the icon stays, the word goes (SCREEN A); never a percentage', () => {
    const h = render(viewFor('active', { readQuality: 'partial' }));
    expect(h).toContain('data-read-quality="partial"');
    expect(h).not.toContain('<span>Partial read</span>');
    expect(h).not.toMatch(/\d+\s*%/);
  });
});
