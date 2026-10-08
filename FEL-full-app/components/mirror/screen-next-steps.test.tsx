// The athlete's own view after a Movement Screen (MIRROR-COACH P3, 2026-09-26): the same flag → FIX line + corrective
// block mapping the coach's draft uses, in plain words; what to run again; what needs nothing; and "this is what the
// camera saw, not a diagnosis". A server render is the card's first paint, so it is pinned here without a DOM. The
// grades are the real grader's (regradeFromSummary over summary numbers).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { screenCorrectiveFor } from '@/lib/mirror/correctives';
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

// MIRROR-COACH P9 (2026-09-30), PLAN item 9 rule (e): under a flag, its matching written corrective for an adult (the
// same mapping as the coach's draft, lib/mirror/correctives.ts SCREEN_CORRECTIVE) and the way into the correctives page.
describe('P9: the written corrective under a flag', () => {
  it('an adult: the shoulder flag names its release and band drill and links to them', () => {
    const html = render(grades({ shoulderLevel: g('shoulderLevel', { value: 0.1 }) }));
    const t = text(html);
    expect(t).toContain('Written corrective: release first: where the neck meets the shoulder · band drill: Band-up shoulder hold.');
    expect(html).toContain('href="/play/mirror/correctives#band-drills"');
    expect(html).toContain('data-written-corrective="shoulderLevel"');
    // MIRROR-COACH P9 fix: the screen's own set-up — standing, no rowing handle, and the side the screen read higher
    expect(t).toMatch(/Stand tall facing the camera, a light band tied high and held in (your (left|right) hand — the side the screen read higher|the hand on the side the screen read higher)\./);
    expect(t).not.toMatch(/rowing handle|working hand|the pull/);
  });

  it('P9 fix: the set-up names the side the screen measured (a level check flags the HIGHER side)', () => {
    for (const side of ['left', 'right'] as const) {
      const c = screenCorrectiveFor('shoulderLevel', null, side)!;
      expect(c.drill!.setup).toContain(`held in your ${side} hand — the side the screen read higher`);
      expect(c.drill!.cue).not.toMatch(/handle/);
      const hip = screenCorrectiveFor('hipLevel', null, side)!;
      expect(hip.drill!.setup).toContain(`The screen read your ${side} hip higher`);
      expect(hip.drill!.setup).not.toMatch(/how far you drift, not which way/);   // the press/row's line
      expect(screenCorrectiveFor('singleLeg', null, side)!.drill!.setup).toContain(`The screen read your ${side} leg`);
    }
  });

  it('the knee flag links to the release; a check with none (the head float) shows no line', () => {
    const knee = render(grades({ kneeWindow: g('kneeWindow', { value: 0.7, bySide: { left: 0.7, right: 0.05 } }) }));
    // MIRROR-COACH P9 fix: "release first:" with no drill after it read as cut off — the knee has a release only
    expect(text(knee)).toContain('Written corrective: release: the back of the hip — the fleshy part you sit on.');
    expect(text(knee)).not.toContain('release first');
    expect(knee).toContain('href="/play/mirror/correctives#release"');
    const head = render(grades({ headFloat: g('headFloat', { value: 0.2 }) }));
    expect(head).toContain('data-work-item');
    expect(head).not.toContain('data-written-corrective');
  });

  it('two flags: each work item gets its own check\'s corrective, in order', () => {
    const html = render(grades({ hipLevel: g('hipLevel', { value: 0.12 }), shoulderLevel: g('shoulderLevel', { value: 0.1 }) }));
    const ids = [...html.matchAll(/data-written-corrective="(\w+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['hipLevel', 'shoulderLevel']);
  });

  it('youth rules (and no birth year, the card\'s default): no written corrective at all', () => {
    const gs = grades({ shoulderLevel: g('shoulderLevel', { value: 0.1 }), kneeWindow: g('kneeWindow', { value: 0.7, bySide: { left: 0.7, right: 0.05 } }) });
    for (const youth of ['minor', 'unknownAge'] as const) expect(render(gs, youth)).not.toContain('data-written-corrective');
    expect(renderToStaticMarkup(createElement(ScreenNextSteps, { screen: 'modified', grades: gs }))).not.toContain('data-written-corrective');
  });
});
