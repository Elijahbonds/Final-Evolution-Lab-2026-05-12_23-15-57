// The athlete's own view after a Movement Screen (MIRROR-COACH P3, 2026-09-26): the same flag → FIX line + corrective
// block mapping the coach's draft uses, in plain words; what to run again; what needs nothing; and "this is what the
// camera saw, not a diagnosis". A server render is the card's first paint, so it is pinned here without a DOM. The
// grades are the real grader's (regradeFromSummary over summary numbers).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScreenNextSteps } from './screen-next-steps';
import { CAMERA_NOT_DIAGNOSIS, YOUTH_BLOCKS_OFF, type YouthGate } from '@/lib/mirror/screenCorrectives';
import { fixLine } from '@/lib/mirror/screen';
import { regradeFromSummary, type StationGrade } from '@/lib/mirror/stationGraders';
import { screenText } from '@/lib/share/screen';

const S = {
  heelLine: { checkId: 'heelLine', value: 2, bySide: { left: 2, right: 1 }, unit: 'deg', frames: 360, readableFrames: 360, uncertainty: 0.5, spread: 4 },
  kneeWindow: { checkId: 'kneeWindow', value: 0.05, bySide: { left: 0.05, right: 0.02 }, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.01, spread: 0.1 },
  hipLevel: { checkId: 'hipLevel', value: 0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02 },
  shoulderLevel: { checkId: 'shoulderLevel', value: -0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02 },
  headFloat: { checkId: 'headFloat', value: 0.02, unit: 'ratio', frames: 300, readableFrames: 300, uncertainty: 0.005, spread: 0.02 },
  singleLegL: { checkId: 'singleLeg', value: 0.03, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'left' },
  singleLegR: { checkId: 'singleLeg', value: 0.04, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'right' },
} as const;
type Key = keyof typeof S;
const g = (k: Key, over: Record<string, unknown> = {}): StationGrade => regradeFromSummary({ ...S[k], ...over })!;
const grades = (over: Partial<Record<Key, StationGrade>> = {}) => (Object.keys(S) as Key[]).map((k) => over[k] ?? g(k));
// an adult athlete unless a test says otherwise (P3 review: the card's own default is youth rules — no birth year on file)
const render = (gs: StationGrade[], youth: YouthGate = null) => renderToStaticMarkup(createElement(ScreenNextSteps, { screen: 'modified', grades: gs, youth }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('what to work on, after the screen', () => {
  it('a flag: what the camera saw, the FIX line, and the corrective block with its movements', () => {
    const t = text(render(grades({ shoulderLevel: g('shoulderLevel', { value: 0.1 }) })));
    expect(t).toContain('1 thing to work on, from what the camera saw.');
    expect(t).toContain('Shoulder height, left shoulder higher');
    expect(t).toContain('The camera saw 0.10 of a shoulder width, left higher · estimated.');
    expect(t).toContain(`What to do: ${fixLine('shoulderLevel')}`);
    expect(t).toContain('Open the ribcage · about 6 min');
    expect(t).toContain('Side-lying open book, 6 per side');
  });

  it('two flags that share a block show it once', () => {
    const html = render(grades({ hipLevel: g('hipLevel', { value: 0.12 }), singleLegL: g('singleLegL', { touchDowns: 1 }) }));
    expect((html.match(/data-work-item/g) ?? []).length).toBe(2);
    expect(text(html).split('Trunk and hip hold').length - 1).toBe(2);   // the block once, then "same block as above"
    expect(text(html)).toContain('Same block as above: Trunk and hip hold.');
  });

  it('a check the camera could not read is "run it again" — never a pass, never nothing-to-do', () => {
    const t = text(render(grades({ headFloat: g('headFloat', { readableFrames: 5, value: null, uncertainty: null, spread: null }) })));
    expect(t).toContain('Run these again');
    expect(t).toMatch(/Head float Not read: too few clear frames .* Hold still in the shot for the whole count\./);
    expect(t).toContain('Nothing to work on from: Heel line, Knee window, Hip level, Shoulder height, Single-leg stance.');
    expect(t).not.toMatch(/Nothing to work on from:[^.]*Head float/);
  });

  // MIRROR-COACH P3 review (2026-09-26): PLAN item 9 — the written correctives are "off for minors"; no birth year on file
  // is youth rules until answered (decision #20), and that is the card's default
  it('under youth rules the block is not shown, the card says why, and the FIX line stays', () => {
    const gs = grades({ shoulderLevel: g('shoulderLevel', { value: 0.1 }) });
    for (const youth of ['minor', 'unknownAge'] as const) {
      const t = text(render(gs, youth));
      expect(t).not.toContain('Open the ribcage');
      expect(t).not.toContain('Side-lying open book');
      expect(t).toContain(`What to do: ${fixLine('shoulderLevel')}`);
      expect(t).toContain(text(YOUTH_BLOCKS_OFF[youth]).trim());
    }
    const noProp = text(renderToStaticMarkup(createElement(ScreenNextSteps, { screen: 'modified', grades: gs })));
    expect(noProp).not.toContain('Open the ribcage');
    expect(noProp).toContain(text(YOUTH_BLOCKS_OFF.unknownAge).trim());
  });

  it('a pass prescribes nothing', () => {
    const html = render(grades());
    expect(html).not.toContain('data-work-item');
    expect(html).not.toContain('What to do');
    expect(text(html)).toContain('Nothing flagged in any check the camera read.');
  });

  it('closes on "what the camera saw, not a diagnosis", and says nothing else about health', () => {
    const t = text(render(grades({ kneeWindow: g('kneeWindow', { value: 0.7, bySide: { left: 0.7, right: 0.05 } }) })));
    expect(t).toContain(CAMERA_NOT_DIAGNOSIS);
    const rest = t.replace(CAMERA_NOT_DIAGNOSIS, '');
    expect(screenText(rest)).toEqual([]);
    expect(rest).not.toMatch(/\bfail|dysfunction|injur|\brisk|prevent|diagnos/i);
    expect(t).toMatch(/· estimated/);
  });

  it('is a labelled region', () => {
    const html = render(grades());
    expect(html).toContain('aria-labelledby="screen-next-steps-heading"');
    expect(html).toContain('id="screen-next-steps-heading"');
  });
});
