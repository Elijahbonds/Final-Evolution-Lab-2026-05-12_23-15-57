// SCREEN-EASY (2026-10-28): the screen's new words fit docs/CUE-STYLE.md §1 (a set-up ≤ 24 words, a prompt ≤ 14, a label
// ≤ 8) and say "device", not "phone" (S-7). A set-up line is said in full before the countdown, so its length is time.
import { describe, expect, it } from 'vitest';
import * as C from '@/lib/screen-easy/copy';
import { PAIN_CHECK_LINE } from '@/lib/screen/copy';
import { QUICK_PARTS } from '@/lib/assess/runner';
import { speechMs } from '@/lib/cue-style/speech';

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const all = (): string[] => Object.values(C).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v as Record<string, string>)));

describe('the set-up lines', () => {
  it('one per part, said by the runner, each ≤ 16 words (about 6.8 s at the voice\'s rate)', () => {
    for (const p of QUICK_PARTS) {
      expect(p.setup, p.id).toBe(C.SETUP[p.id]);
      expect(words(p.setup), p.id).toBeLessThanOrEqual(16);
      expect(speechMs(p.setup), p.id).toBeLessThanOrEqual(6800);
    }
  });
  it('a side switch and the other leg are short (≤ 10 words)', () => {
    for (const id of ['T3-right', 'T2-right'] as const) expect(words(C.SETUP[id]), id).toBeLessThanOrEqual(10);
  });
});

describe('the prompts and labels', () => {
  it('the pain question ≤ 14 words, with the "no" as both hands up and the "yes" a tap', () => {
    expect(words(PAIN_CHECK_LINE)).toBeLessThanOrEqual(14);
    expect(PAIN_CHECK_LINE).toMatch(/both hands up/);
    expect(PAIN_CHECK_LINE).toMatch(/tap Yes/);
    for (const s of Object.values(C.OTHER_LEG)) expect(words(s)).toBeLessThanOrEqual(14);
    for (const s of [C.NO_WALL_BUTTON, C.MORE_DETAIL, C.HANDS_UP_HINT]) expect(words(s), s).toBeLessThanOrEqual(8);
  });
  it('plain words: no "phone" (S-7 says device), no jargon', () => {
    for (const s of all()) {
      expect(s, s).not.toMatch(/\b(this|the) phone\b/i);
      expect(s, s).not.toMatch(/dorsiflexion|valgus|countermovement|thoracic/i);
    }
  });
});
