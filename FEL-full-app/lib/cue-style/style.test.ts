// The style screen's own controls (CUE-REWRITE, 2026-10-27): what it catches and what it lets through, so a green corpus
// test means something. lib/cue-style/style.ts is the screen; docs/CUE-STYLE.md is the guide it enforces.
import { describe, expect, it } from 'vitest';
import { grade, lintStyle, longWords, mentionsPain, PAIN_ROUTE, syllables, unglossed, wordCount } from './style';
import { result, shapeProblems } from './result';

const rules = (t: string, tier: Parameters<typeof lintStyle>[1]) => lintStyle(t, tier).map((f) => f.rule);

describe('the screen catches what the guide forbids (negative controls)', () => {
  it.each([
    ['Press the floor apart with your feet — knees travel out over your second toes.', 'live', 'length'],
    ['Knees', 'live', 'too-short'],
    ['Sit to 90 degrees', 'live', 'number'],
    ['Stop the valgus', 'live', 'term'],
    ['Hip hinge with a neutral spine to the wall.', 'card', 'gloss'],
    ['Keep the eccentric slow.', 'card', 'gloss'],
    ['This exercise treats knee pain.', 'card', 'medical'],
    ['Rehab drill for a sprained ankle.', 'card', 'medical'],
    ['See a physician about this.', 'card', 'medical'],
    ['Lazy reps again: that was sloppy.', 'prompt', 'shame'],
    ['Your weak side failed.', 'result', 'shame'],
    ['Burn fat and get toned.', 'card', 'body-image'],
    ['Thoracic extension over a foam roller', 'label', 'term'],
  ] as const)('"%s" (%s) fails %s', (text, tier, rule) => {
    expect(rules(text, tier)).toContain(rule);
  });
});

describe('the screen lets the guide\'s own examples through (positive controls)', () => {
  it.each([
    ['Knees out', 'live'], ['Chest up', 'live'], ['Push the floor away', 'live'], ['Knees out over toes', 'live'],
    ['Hip hinge: push your hips back, back flat.', 'card'],
    ['Keep the eccentric slow: the lowering part takes three seconds.', 'card'],
    ['If anything hurts, stop. Tell your coach or an adult, and see a health professional.', 'result'],
    ['Your jump: about 42 cm, about the same as last week.', 'result'],
    ['Hip hinge', 'label'],
  ] as const)('"%s" (%s) passes', (text, tier) => {
    expect(lintStyle(text, tier)).toEqual([]);
  });
});

describe('the reading-level heuristic', () => {
  it('counts syllables close enough to rank lines', () => {
    expect(syllables('floor')).toBe(1);
    expect(syllables('shoulder')).toBe(2);
    expect(syllables('activation')).toBeGreaterThanOrEqual(4);
  });
  it('a plain line reads low; a jargon line reads high', () => {
    expect(grade('Push the floor away and stand up tall.')).toBeLessThan(6);
    expect(grade('Prioritise posterior chain activation via eccentric-dominant hip extension variations.')).toBeGreaterThan(12);
    expect(longWords('Prioritise posterior chain activation')).toEqual(expect.arrayContaining(['activation']));
  });
  it('a word count ignores dashes and counts hyphenated words once', () => {
    expect(wordCount('Push-up — knees down')).toBe(3);
  });
  it('a gloss only counts in the same line', () => {
    expect(unglossed('Keep a neutral spine.')).toEqual(['neutralSpine']);
    expect(unglossed('Keep a neutral spine: a flat back.')).toEqual([]);
  });
});

describe('the result shape', () => {
  it('needs all three parts, and a number needs its meaning', () => {
    expect(shapeProblems(result('Your jump: 42 cm.', 'About the same as last week.', 'Jump again next Friday.'))).toEqual([]);
    expect(shapeProblems(result('Your jump: 42 cm.', 'Nice.', 'Jump again.'))).toContain('a number with no meaning attached');
    expect(shapeProblems(result('Heels lift.', '', 'Next set: heels down.'))).toContain('no "what it means"');
    expect(shapeProblems(result('Heels lift.', 'Often the ankles need more bend.', ''))).toContain('no "what to do next"');
    expect(shapeProblems(result('Heels lift on rep 4.', 'Often the ankles need more bend.', 'Next set: heels down.'))).toEqual([]);
  });
  it('a next link is a same-origin path', () => {
    expect(shapeProblems(result('a', 'b', { text: 'c', href: 'https://example.com' }))).toHaveLength(1);
    expect(shapeProblems(result('a', 'b', { text: 'c', href: '/train/library?q=squat' }))).toEqual([]);
  });
  it('a pain line routes to stopping and a person', () => {
    expect(mentionsPain('If anything hurts, stop.')).toBe(true);
    expect(PAIN_ROUTE.test('If anything hurts, stop. Tell your coach or an adult, and see a health professional.')).toBe(true);
    expect(PAIN_ROUTE.test('Push through the pain.')).toBe(false);
  });
});
