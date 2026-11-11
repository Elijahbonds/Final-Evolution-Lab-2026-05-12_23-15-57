import { describe, expect, it } from 'vitest';
import { BUDGET, CHECKS, faultsOf, judge, kindOf, type ScreenFacts } from './judge';

/** A screen with nothing wrong: one bright button, few words, fast, every link good. */
const clean = (over: Partial<ScreenFacts> = {}): ScreenFacts => ({
  kind: 'do', wordsFold: 22, wordsAll: 22, primaryFold: ['Start the test'], actionsAll: 5, actionsMain: 2, smallTargets: [],
  unfinished: [], emptyNoNext: [], spinnersNoWords: 0, blank: false, textSizes: ['14px', '16px', '28px'], buttonLooks: 2,
  hscroll: { phone: 0, zoom200: 0, font150: 0 }, clipped: { phone: [], zoom200: [], font150: [] }, tiny: 0, bodySmall: 0,
  fcpMs: 900, cls: 0, tapMs: 48, tapDidNothing: false, tapLabel: 'Start the test',
  brokenLinks: [], nowhereLinks: [], pageErrors: [], a11yCritical: 0, a11ySerious: 0, a11yRules: [], numbers: [], methodLine: false,
  ...over,
});
const ids = (f: ScreenFacts) => faultsOf(f).map((x) => x.id);

describe('the four checks (docs/PLAN-EVERY-SCREEN-10PHASE.md)', () => {
  it('a clean screen passes all four, with no worst problem', () => {
    const v = judge(clean());
    expect(v.checks).toEqual({ clear: 'pass', finished: 'pass', fast: 'pass', right: 'pass' });
    expect(v.passAll).toBe(true);
    expect(v.worst).toBeNull();
  });

  it('the budgets are the plan\'s numbers', () => {
    expect(BUDGET).toMatchObject({ wordsFoldDo: 40, tapPx: 44, textSizes: 4, buttonLooks: 3, fcpMs: 2500, cls: 0.02, tapMs: 200 });
  });

  describe('1. clear and quick', () => {
    it('a dead end fails, and is the worst thing on the screen', () => {
      const v = judge(clean({ actionsAll: 0, actionsMain: 0, primaryFold: [], tapMs: null, tapLabel: null }));
      expect(v.checks.clear).toBe('fail');
      expect(v.worst?.id).toBe('dead-end');
    });
    it('a screen whose only ways on are the app\'s own bars is flagged apart from a true dead end', () => {
      expect(ids(clean({ actionsAll: 5, actionsMain: 0 }))).toContain('only-chrome');
      expect(ids(clean({ actionsAll: 5, actionsMain: 0 }))).not.toContain('dead-end');
    });
    it('41 words before scrolling fails a do-this screen; 40 passes; a menu or a reading page is not held to it', () => {
      expect(ids(clean({ wordsFold: 41 }))).toContain('too-many-words');
      expect(ids(clean({ wordsFold: 40 }))).not.toContain('too-many-words');
      expect(ids(clean({ wordsFold: 300, kind: 'hub' }))).not.toContain('too-many-words');
      expect(ids(clean({ wordsFold: 300, kind: 'read' }))).not.toContain('too-many-words');
    });
    it('two bright buttons compete; one does not', () => {
      expect(ids(clean({ primaryFold: ['Start', 'Buy'] }))).toContain('many-primary');
      expect(ids(clean({ primaryFold: ['Start'] }))).not.toContain('many-primary');
    });
    it('a small tap target fails, and the screen\'s own are counted apart from the shared bars\'', () => {
      const own = ids(clean({ smallTargets: [{ label: 'x', w: 30, h: 30, chrome: false }] }));
      const bar = ids(clean({ smallTargets: [{ label: 'Home', w: 40, h: 40, chrome: true }] }));
      expect(own).toEqual(['small-targets']);
      expect(bar).toEqual(['small-targets-bars']);
    });
  });

  describe('2. looks finished', () => {
    it.each([
      ['coming soon', { unfinished: [{ mark: 'coming soon', text: 'Coming soon' }] }, 'unfinished:coming soon'],
      ['an owner placeholder', { unfinished: [{ mark: 'placeholder text', text: '[OWNER: write this]' }] }, 'unfinished:placeholder text'],
      ['an empty state with no next step', { emptyNoNext: ['No sessions yet'] }, 'empty-no-next'],
      ['a spinner with no words', { spinnersNoWords: 1 }, 'spinner-no-words'],
      ['a blank screen', { blank: true }, 'blank'],
      ['sideways scroll at 390 px', { hscroll: { phone: 310, zoom200: 0, font150: 0 } }, 'hscroll:phone'],
      ['sideways scroll at 200 % zoom', { hscroll: { phone: 0, zoom200: 60, font150: 0 } }, 'hscroll:zoom200'],
      ['sideways scroll with 150 % text', { hscroll: { phone: 0, zoom200: 0, font150: 12 } }, 'hscroll:font150'],
      ['text cut off', { clipped: { phone: ['Score 12,345'], zoom200: [], font150: [] } }, 'clipped:phone'],
      ['text under 12 px', { tiny: 3 }, 'tiny-text'],
      ['body copy under 16 px', { bodySmall: 1 }, 'body-small'],
      // test changed (owner decision 2026-11-10): 16 px body text no longer counts, so the five planted sizes are all others
      ['five text sizes besides 16 px body', { textSizes: ['12px', '13px', '14px', '20px', '28px'] }, 'text-sizes'],
      ['four button looks', { buttonLooks: 4 }, 'button-looks'],
    ] as [string, Partial<ScreenFacts>, string][])('%s fails the check', (_name, over, id) => {
      const v = judge(clean(over));
      expect(v.faults.map((x) => x.id)).toEqual([id]);
      expect(v.checks).toEqual({ clear: 'pass', finished: 'fail', fast: 'pass', right: 'pass' });
    });
    it('owner decision 2026-11-10: 16 px body text does not count against the four sizes; an off-scale size still does', () => {
      expect(ids(clean({ textSizes: ['12px', '14px', '16px', '20px', '30px'] }))).toEqual([]);
      expect(ids(clean({ textSizes: ['12px', '13px', '14px', '16px', '20px', '30px'] }))).toEqual(['text-sizes']);
    });
    it('2 px of sideways scroll is rounding, not a fault; four text sizes and three button looks are allowed', () => {
      expect(ids(clean({ hscroll: { phone: 2, zoom200: 2, font150: 2 }, textSizes: ['12px', '14px', '16px', '28px'], buttonLooks: 3 }))).toEqual([]);
    });
  });

  describe('3. fast and smooth', () => {
    it('each budget is the edge: at it passes, past it fails', () => {
      expect(ids(clean({ fcpMs: 2500, cls: 0.02, tapMs: 200 }))).toEqual([]);
      expect(ids(clean({ fcpMs: 2501 }))).toEqual(['slow-first-content']);
      expect(ids(clean({ cls: 0.021 }))).toEqual(['layout-shift']);
      expect(ids(clean({ tapMs: 208 }))).toEqual(['slow-tap']);
    });
    it('a speed number the rig could not read is listed, never a silent pass or a fail', () => {
      const v = judge(clean({ tapMs: null }));
      expect(v.checks.fast).toBe('pass');
      expect(v.unmeasured).toContain('tap response');
    });
    it('a check the rig cannot finish reads n/m, which is not a pass; a fault found there still fails it', () => {
      const cannot = { fast: 'a 3D screen' };
      const v = judge(clean({ tapMs: null, cannot }));
      expect(v.checks.fast).toBe('n/m');
      expect(v.passAll).toBe(false);
      expect(judge(clean({ tapMs: null, fcpMs: 4000, cannot })).checks.fast).toBe('fail');
    });
  });

  describe('4. right and trustworthy', () => {
    it.each([
      ['a link to a 404', { brokenLinks: [{ href: '/nope', status: 404, label: 'See all' }] }, 'broken-link'],
      ['a link that answers 500', { brokenLinks: [{ href: '/boom', status: 500, label: 'Open' }] }, 'broken-link'],
      ['a link to nowhere', { nowhereLinks: ['Share'] }, 'link-nowhere'],
      ['a main action that does nothing', { tapDidNothing: true }, 'button-does-nothing'],
      ['an uncaught error', { pageErrors: ['TypeError: x is undefined'] }, 'page-error'],
      ['a critical accessibility finding', { a11yCritical: 1, a11yRules: ['name'] }, 'a11y-critical'],
      ['a serious accessibility finding', { a11ySerious: 2, a11yRules: ['contrast'] }, 'a11y-serious'],
    ] as [string, Partial<ScreenFacts>, string][])('%s fails the check', (_name, over, id) => {
      const v = judge(clean(over));
      expect(v.faults.map((x) => x.id)).toEqual([id]);
      expect(v.checks).toEqual({ clear: 'pass', finished: 'pass', fast: 'pass', right: 'fail' });
    });
    it('a measured number with no method line is flagged for a person, and does not fail the check by itself', () => {
      const bare = judge(clean({ numbers: [{ text: '61.2 cm', px: 28 }] }));
      expect(bare.review).toHaveLength(1);
      expect(bare.checks.right).toBe('pass');
      expect(judge(clean({ numbers: [{ text: '61.2 cm', px: 28 }], methodLine: true })).review).toEqual([]);
    });
  });

  it('the single worst problem is the heaviest fault, whichever check it is in', () => {
    const v = judge(clean({ tiny: 1, brokenLinks: [{ href: '/nope', status: 404, label: 'See all' }], tapMs: 400 }));
    expect(v.worst?.id).toBe('broken-link');
    expect(CHECKS.filter((c) => v.checks[c] === 'fail')).toEqual(['finished', 'fast', 'right']);
  });

  it('sorts routes into do / hub / read for the 40-word rule', () => {
    expect(kindOf('/train/jumps')).toBe('do');
    expect(kindOf('/train')).toBe('hub');
    expect(kindOf('/terms')).toBe('read');
    expect(kindOf('/education/playbook/[chapter]')).toBe('read');
    expect(kindOf('/coach/join/[token]')).toBe('do');
  });
});
