import { describe, expect, it } from 'vitest';
import { cuePresets, cueText, flagLine, GENERAL_CUES, LIVE_MOVEMENTS, LIVE_SPECS } from './movements';
import { lintCue } from '@/lib/coach/cueLint';

describe('the live presets', () => {
  it('every exercise offers its faults\' own Mirror cues, then the general ones', () => {
    for (const m of LIVE_MOVEMENTS) {
      const p = cuePresets(m);
      expect(p.length).toBe(LIVE_SPECS[m].faults.length + GENERAL_CUES.length);
      for (const c of p) expect(cueText(c.key)).toBe(c.text);
    }
  });

  it('the new general presets pass the external-focus lint (lib/coach/cueLint.ts), as attention cues', () => {
    for (const c of GENERAL_CUES) expect(lintCue(c.text, 'attention'), c.text).toEqual([]);
  });

  it('a cue is a key: unknown or foreign keys show nothing', () => {
    expect(cueText('gen:nope')).toBeNull();
    expect(cueText('squat:bodyLine')).toBeNull();          // a push-up fault under the squat
    expect(cueText('deadlift:x')).toBeNull();
    expect(cueText('<b>hi</b>')).toBeNull();
    expect(cueText(7)).toBeNull();
  });

  it('a flag reads as the Mirror\'s review label, with a knee\'s side', () => {
    expect(flagLine('squat', 'kneeValgus', 'left')).toBe('Knee drifting inward on the descent (left)');
    expect(flagLine('pushup', 'bodyLine')).toBe('Hips off the head-to-heels line (sagging or piking)');
  });
});
