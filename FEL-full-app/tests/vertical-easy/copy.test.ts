// VERTICAL-EASY (2026-10-27): every word of "Measure my vertical" held to docs/CUE-STYLE.md (lib/cue-style), and to the
// jump tools' no-claims rule (tests/helpers/claimFree.ts). Pure.
import { describe, expect, it } from 'vitest';
import { lintStyle, type CueTier } from '@/lib/cue-style/style';
import { result, shapeProblems } from '@/lib/cue-style/result';
import { CLAIM_WORDS } from '@/tests/helpers/claimFree';
import * as V from '@/lib/vertical/copy';
import { rejectionFromInvalidWhy } from '@/lib/assess/rejection';
import { JUMP_ONLY_BUTTON } from '@/lib/screen/copy';
import { changeOf } from '@/lib/vertical/result';

const LINES: [string, CueTier][] = [
  [V.MEASURE_VERTICAL, 'label'], [V.MEASURE_VERTICAL_LINE, 'card'], [V.SETUP_EYEBROW, 'label'], [V.SETUP_PLACE, 'setup'],
  [V.SETUP_READY, 'label'], [V.SETUP_READY_LINE, 'prompt'], ...V.SETUP_HEADLINES.map((l) => [l, 'label'] as [string, CueTier]),
  [V.JUMP_HOW, 'card'], [V.RESULT_LABEL, 'label'], [V.RESULT_NEXT, 'result'], [V.RESULT_NONE_SAW, 'result'],
  [V.RESULT_NONE_MEANS, 'result'], [V.RESULT_NONE_NEXT, 'result'], [V.RESULT_DONE, 'label'], [V.RESULT_AGAIN, 'label'],
  [V.RESULT_MORE, 'label'], [JUMP_ONLY_BUTTON, 'label'],
  ...['the camera never saw you land', 'your hands left your hips', 'it read over 130 cm, so the camera lost your feet']
    .map((w) => [rejectionFromInvalidWhy(w).text, 'prompt'] as [string, CueTier]),
];

describe('the words pass the style guide', () => {
  it.each(LINES)('%s', (line, tier) => {
    expect(lintStyle(line, tier)).toEqual([]);
    expect(line).not.toMatch(CLAIM_WORDS);
  });

  it('every refused jump says a reason AND what to do, then "jump again"', () => {
    for (const w of ['the camera never saw you land', 'your hands left your hips', 'your feet did not rise as far as that air time needs, so the camera lost them']) {
      const t = rejectionFromInvalidWhy(w).text;
      expect(t, w).toMatch(/\. .*jump again\.$/);
    }
  });

  it('the result is three parts, every variant, and each part passes as a result line', () => {
    const variants = [null, changeOf(44, 40, 'in'), changeOf(40, 44, 'cm'), changeOf(41, 40.5, 'in')];
    for (const c of variants) {
      for (const n of [3, 2, 1]) {
        const r = result(V.resultSaw(n, '17 in'), V.resultMeans(c), V.RESULT_NEXT);
        expect(shapeProblems(r)).toEqual([]);
        for (const part of [r.saw, r.means, r.next.text]) expect(lintStyle(part, 'result'), part).toEqual([]);
      }
    }
    expect(shapeProblems(result(V.RESULT_NONE_SAW, V.RESULT_NONE_MEANS, V.RESULT_NONE_NEXT))).toEqual([]);
  });

  it('"about the same" inside the camera\'s noise (profile v2\'s band), a change outside it', () => {
    expect(changeOf(41, 40.5, 'in')!.kind).toBe('same');
    expect(changeOf(45, 40, 'in')).toEqual({ kind: 'up', text: '2 in' });
    expect(changeOf(36, 40, 'cm')).toEqual({ kind: 'down', text: '4 cm' });
    expect(changeOf(40, null, 'in')).toBeNull();
  });
});
