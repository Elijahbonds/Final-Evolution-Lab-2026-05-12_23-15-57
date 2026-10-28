// SCREEN-EASY (2026-10-28): the live HUD's new pieces, rendered — the pain check's hands-up "no" beside its two big
// buttons (the "yes" one tap away), the wall card's way out, the wrong leg's one big word.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RunnerView } from '@/lib/assess/runner';
import { LiveHud } from '@/app/play/mirror/assess/_components/live-hud';
import { HANDS_UP_HINT, NO_WALL_BUTTON, WALL_LINE } from '@/lib/screen-easy/copy';

function viewFor(step: RunnerView['step'], over: Partial<RunnerView> = {}): RunnerView {
  return {
    step, test: 'T3', part: step === 'painCheck' ? null : 'T3-left', label: null, view: 'front',
    reps: { count: 0, target: 3, marks: [] }, countdown: null, restartInMs: null, framing: null, hold: 0,
    instruction: 'Get ready.', say: null, skeleton: 'tracking', wantsHighFps: false,
    mini: step === 'painCheck' ? { test: 'T3', text: 'Single-leg squat: done.' } : null,
    done: null, result: null, progress: { done: 2, total: 7 }, flash: null, rejection: null,
    move: { index: 2, total: 5, name: 'Single-leg squat', cue: 'Left leg' }, setupReady: true, dimWarning: false, retryMessage: null,
    handsFree: true, armsFree: false,
    ...over,
  };
}
const render = (v: RunnerView, skip?: () => void) =>
  renderToStaticMarkup(createElement(LiveHud, { view: v, onPain: () => {}, onTakeoff: () => {}, onStop: () => {}, onSkipWall: skip }));

describe('the pain check', () => {
  it('heads with the done line, says "No pain? Put both hands up.", and keeps the big No and Yes taps', () => {
    const h = render(viewFor('painCheck', { handsUpAnswer: true, handsUpHold: 0.5 }));
    expect(h).toContain('data-pain-done');
    expect(h).toContain('Single-leg squat: done.');
    expect(h).toContain(HANDS_UP_HINT);
    expect(h).toContain('width:50%');
    expect(h).toContain('data-pain="yes"');
    expect(h).toContain('data-pain="no"');
    expect(h).not.toMatch(/rounded-full bg-black\/60[^>]*>Single-leg squat/);   // no test chip over the done line
  });
});

describe('the wall', () => {
  it('while the ankle bend is set up: the picture, the line and "No wall here? Skip it" in the setup card', () => {
    const h = render(viewFor('position', { test: 'T2', part: 'T2-left', view: 'side', canSkipWall: true }), () => {});
    expect(h).toContain('data-wall-card');
    expect(h).toContain('data-wall-picture');
    expect(h).toContain(WALL_LINE);
    expect(h).toContain(NO_WALL_BUTTON);
    expect(render(viewFor('position'), () => {})).not.toContain('data-skip-wall');
  });
});

describe('the wrong leg', () => {
  it('"Other leg" is the one big word', () => {
    const h = render(viewFor('position', { setupReady: false, wrongLeg: true, instruction: 'Other leg. Stand on your left leg.' }));
    expect(h).toMatch(/data-setup-word[^>]*>(<svg[\s\S]*?<\/svg>)?Other leg</);
  });
});
