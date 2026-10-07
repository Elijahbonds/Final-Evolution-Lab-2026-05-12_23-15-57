// SCREEN A requirements 3, 4 and 5, on the rendered HUD (app/ is outside vitest's lib includes, so this lives here):
//
//   · While a rep is up (calibrate / calibrateSide / countdown / active / paused) there is NOTHING TO READ: no move
//     header, no framing chips, no dim-light line, no rejection or retry box, no paused card text — the skeleton, the
//     big rep number, the countdown number, colour and the stop button only. (The spoken line is always carried by the
//     page's sr-only live region; with the Voice switch off the visible caption stays — no other channel exists.)
//   · The rep number is one big "N / target" centre-top, text-[clamp(160px,40vh,320px)] — never under 30% of the stage.
//   · The after-test pain check shows with handsFree, as one big tap per answer: each at least 25% of the screen tall.
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
    say: null, sayAt: 0, skeleton: 'tracking', wantsHighFps: false,
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

/** Words that must never show while a rep is up (SCREEN A req. 4). */
const NO_READING_WORDS = [
  'Move 1 of 4', 'Overhead squat, facing the camera',   // the move header + its cue
  'Low light',                                          // the dim-light line
  'did not count',                                      // the rejection box
  'trying this move once more',                         // the retry box
  'Step back into the light', 'Paused',                 // the paused card's words
  'Hold still',
];
/** And the attributes those blocks carry. */
const NO_READING_ATTRS = ['data-rejection', 'data-retry'];

describe('no reading during a rep (SCREEN A req. 4)', () => {
  it.each(['calibrate', 'calibrateSide', 'countdown', 'active', 'paused'] as const)('%s: voice and colour only', (step) => {
    const h = render(viewFor(step));
    for (const w of NO_READING_WORDS) expect(h, `${step}: ${w}`).not.toContain(w);
    for (const a of NO_READING_ATTRS) expect(h, `${step}: ${a}`).not.toContain(a);
    expect(h).toContain('data-stop');                                 // "Something hurts: stop" stays
  });

  it('the reading steps still show their words (framing, position, the mini-result)', () => {
    expect(render(viewFor('framing', { framing: null, move: null }))).toContain('Camera setup');
    const pos = render(viewFor('position'));
    expect(pos).toContain('Move 1 of 4');
    expect(pos).toContain('trying this move once more');              // the retry line lives where reading is safe
    expect(render(viewFor('miniResult'))).toContain('Overhead squat: done.');
  });

  it('with the Voice switch off the paused words stay (no other channel exists)', () => {
    const h = render(viewFor('paused'), false);
    expect(h).toContain('Step back into the light');
    expect(h).toContain('Move 1 of 4');
  });

  it('the stop button stays visible through a rep', () => {
    for (const step of ['position', 'countdown', 'active', 'paused', 'calibrate', 'calibrateSide'] as const) {
      expect(render(viewFor(step)), step).toContain('Something hurts: stop');
    }
  });
});

describe('the big rep counter (SCREEN A req. 5)', () => {
  it('one number "N / target" centre-top, at least 30% of the stage, white — green flash on a counted rep', () => {
    const h = render(viewFor('active'));
    expect(h).toContain('data-rep-counter');
    expect(h).toContain('aria-label="2 of 3 counted"');
    expect(h).toMatch(/text-\[clamp\(160px,40vh,320px\)\]/);          // 40vh ≥ 30% of the stage, always
    expect(h).not.toContain('data-rep-dots');                         // the dots are gone from the HUD
    expect(h).not.toContain('data-dot');
    // white by default; green for FLASH_MS on a counted rep (the flash block pulses amber on a rep that did not count)
    expect(h).toMatch(/data-rep-counter[^>]*text-white/);
    const green = render(viewFor('active', { flash: 'captured' }));
    expect(green).toMatch(/data-rep-counter[^>]*text-\[#00FF9D\]/);
    const rejected = render(viewFor('active', { flash: 'retry', reps: { count: 2, target: 3, marks: ['clean', 'fault', 'notRead'] } }));
    expect(rejected).toMatch(/data-rep-counter[^>]*text-white/);      // a rep that did not count: the number does not move
    expect(rejected).toContain('aria-label="2 of 3 counted"');
  });
});

describe('the after-test pain check, by voice and one big tap (SCREEN A req. 3)', () => {
  it('shows with handsFree: full-screen, one big tap per answer, at least 25% of the screen tall', () => {
    const h = render(viewFor('painCheck'));
    expect(h).toContain('data-pain-check');
    expect(h).toContain('Any pain in that one?');
    expect(h).toContain('data-pain="no"');
    expect(h).toContain('data-pain="yes"');
    expect(h.match(/min-h-\[25%\]/g)?.length).toBe(2);
    expect(h).toContain('flex-1');                                    // the targets stretch to fill the screen
  });

  it('the pre-camera pain prompt (when the runner asks it) uses the same big taps', () => {
    const h = render(viewFor('pain', { handsFree: false }));
    expect(h).toContain('data-pain-check');
    expect(h).toContain('Any pain right now?');
    expect(h.match(/min-h-\[25%\]/g)?.length).toBe(2);
  });

  it('the takeoff prompt stays tap-driven when the runner has to ask (no pre-camera answer)', () => {
    const h = render(viewFor('takeoff', { handsFree: false }));
    expect(h).toContain('Which foot do you take off from?');
  });
});
