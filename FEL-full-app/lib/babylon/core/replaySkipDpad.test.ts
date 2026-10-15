// WAVE 3 (lane/w3-present, shared file: core/ModeHarness.ts): a D-PAD press skips a replay, like a button press. The sprint is played on the
// d-pad alone, and a replay that only a button could skip is unskippable for the player who needs it skippable most.
//
// The harness's input handler is a closure inside mountMode, so the rule is held two ways: the source says it (the skip covers a button OR a
// d-pad press and nothing else — not a release, a stick or a trigger), and the latch the skipped press goes through keys a d-pad press as
// `d:<dir>`, so its release is swallowed unpaired (the mode never sees a release with no press) — run for real on the WakeLatch.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WakeLatch } from './StartWake';
import type { FelInput } from './InputBus';

const harness = readFileSync(path.resolve(__dirname, 'ModeHarness.ts'), 'utf8');

describe('a d-pad press skips a replay', () => {
  it('the harness skips on a button press OR a d-pad press, and on nothing else', () => {
    const m = harness.match(/if \(phase === 'playing' && replayHold && \(([^)]*)\) && e\.pressed\) \{ replay\?\.skip\(\); wakeLatch\.wake\(e, performance\.now\(\), true\); return; \}/);
    expect(m, 'the skip line').not.toBeNull();
    expect(m![1]).toBe("e.t === 'button' || e.t === 'dpad'");
  });

  it('the skipping press is latched like a waking press: a d-pad release that follows is swallowed, a fresh press later is the mode\'s', () => {
    const latch = new WakeLatch();
    const press: FelInput = { t: 'dpad', dir: 'left', pressed: true };
    const release: FelInput = { t: 'dpad', dir: 'left', pressed: false };
    // the harness: a press during a replay -> skip, and `wake(e, now, resume = true)`
    latch.wake(press, 1000, true);
    expect(latch.pass(release, 1050)).toBe(false);          // its release never reaches the mode unpaired
    expect(latch.pass(press, 5000)).toBe(true);             // a later deliberate press is the mode's again
    expect(latch.pass(release, 5040)).toBe(true);
  });

  it('a d-pad key held down through the replay and let go after it is swallowed once, the other direction is untouched', () => {
    const latch = new WakeLatch();
    latch.wake({ t: 'dpad', dir: 'right', pressed: true }, 0, true);
    expect(latch.pass({ t: 'dpad', dir: 'left', pressed: false }, 10)).toBe(true);    // a different key's release is not ours to swallow
    expect(latch.pass({ t: 'dpad', dir: 'right', pressed: false }, 20)).toBe(false);
    expect(latch.pass({ t: 'dpad', dir: 'right', pressed: false }, 30)).toBe(true);   // once
  });

  it('a stick, a trigger or a release does not skip (the line requires e.pressed on a button or d-pad event)', () => {
    expect(harness).not.toMatch(/replayHold && e\.t === 'stick'/);
    expect(harness).not.toMatch(/replayHold && e\.t === 'trigger'/);
  });
});
