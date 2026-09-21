import { beforeEach, describe, expect, it } from 'vitest';
import { captions } from '../core/captions';

// The juice channel feeds the caption bus, so every mode is captioned without every mode remembering to do it.
// JuiceKit itself touches the DOM and Babylon, so this drives the bus the way JuiceKit does and pins the contract
// the wiring depends on: cue() raises a caption, and visible() hands it to the region CRITICAL FIRST.

describe('the caption bus behind the juice channel', () => {
  beforeEach(() => { captions.clear?.(); });

  it('raises a caption that the region can read back', () => {
    captions.cue('FIRST DOWN!', 'feedback');
    expect(captions.visible().map((c) => c.text)).toContain('FIRST DOWN!');
  });

  it('puts a critical cue ahead of routine ones, however they arrived', () => {
    captions.cue('CLOSE PASS', 'feedback');
    captions.cue('NO BALL', 'critical');
    captions.cue('WAVE CLEAR', 'feedback');
    expect(captions.visible()[0].importance).toBe('critical');
  });

  it('notifies a subscriber, which is how the region updates at all', () => {
    let seen: string[] = [];
    const off = captions.subscribe((all) => { seen = all.map((c) => c.text); });
    captions.cue('LIFT CABLE GRIND!', 'feedback');
    expect(seen).toContain('LIFT CABLE GRIND!');
    off();
  });

  it('stops notifying once unsubscribed — a disposed region must not be written to', () => {
    let calls = 0;
    const off = captions.subscribe(() => { calls++; });
    captions.cue('one', 'feedback');
    const after = calls;
    off();
    captions.cue('two', 'feedback');
    expect(calls).toBe(after);
  });
});
