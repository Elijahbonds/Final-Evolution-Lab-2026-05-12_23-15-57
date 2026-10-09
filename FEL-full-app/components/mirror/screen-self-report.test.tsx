// The breath station's answer card and the coach's stations (MIRROR-COACH P3, 2026-09-25). A server render is the
// card's first paint — the state an athlete sees when the screen ends — and the save plan is pure, so both are pinned
// here without a DOM.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { SAVE_LINE, ScreenSelfReport, planSave } from './screen-self-report';
import { COACH_CHECK_LINE, SELF_REPORT_NOTE, SELF_REPORT_NOT_REACHED, SELF_REPORT_QUESTIONS } from '@/lib/mirror/selfReport';

const render = (screen: 'modified' | 'full', screenId: string | null | 'unsaved' = null) =>
  renderToStaticMarkup(createElement(ScreenSelfReport, { screen, screenId, save: async () => true }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('first paint', () => {
  it('asks every breath question with three taps — Yes, No, Not sure — none pressed', () => {
    const html = render('modified');
    for (const q of SELF_REPORT_QUESTIONS) expect(text(html)).toContain(q.text);
    expect((html.match(/<button/g) ?? []).length).toBe(SELF_REPORT_QUESTIONS.length * 3);
    expect((html.match(/>Not sure</g) ?? []).length).toBe(SELF_REPORT_QUESTIONS.length);
    expect(html).not.toContain('aria-pressed="true"');
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(SELF_REPORT_QUESTIONS.length * 3);
    expect(text(html)).toContain(SELF_REPORT_NOTE);
    expect(text(html)).toContain('Rib angle and breath: your answers');
  });

  it('the modified screen names no coach checks; the full one says "Your coach checks this" for both of its', () => {
    expect(render('modified')).not.toContain('Checked by your coach');
    const full = text(render('full'));
    expect(full).toContain('Checked by your coach');
    expect(full).toContain('Pelvic tilt (hands on the hip points)');
    expect(full).toContain('Seated rotation, each side');
    expect(full.split(COACH_CHECK_LINE).length - 1).toBe(2);
  });

  it('shows no score, no grade, no pass/flag and nothing estimated — it is not a measurement', () => {
    for (const s of ['modified', 'full'] as const) {
      // (the note and the coach line say answers and coach checks are never scored — those aside, nothing here is a
      // number or a verdict)
      const rest = text(render(s)).replace(SELF_REPORT_NOTE, '').split(COACH_CHECK_LINE).join('');
      expect(rest).not.toMatch(/score|stable|flag|pass\b|fail|estimated|shards|\d/i);
    }
  });

  it('says so up front when the screen itself was not saved', () => {
    expect(text(render('modified', 'unsaved'))).toContain(SAVE_LINE.noScreen);
    expect(text(render('modified', 'abc'))).not.toContain(SAVE_LINE.noScreen);
  });

  it('every tap target is at least 44 px and the region is labelled', () => {
    const src = readFileSync(new URL('./screen-self-report.tsx', import.meta.url), 'utf8');
    expect(src).toContain('min-h-[44px]');
    expect(src).toContain('aria-labelledby="screen-self-report-heading"');
    expect(src).toContain('id="screen-self-report-heading"');
  });
});

describe('planSave', () => {
  it('waits while the screen\'s own save is in flight, and sends nothing before an answer', () => {
    expect(planSave(null, { lowerRibsWiden: 'yes' })).toEqual({ send: null, state: null });
    expect(planSave('s1', {})).toEqual({ send: null, state: null });
  });

  it('sends EVERY answer so far to the saved screen (the route replaces per question)', () => {
    expect(planSave('s1', { lowerRibsWiden: 'notSure', neckShouldersLift: 'no' })).toEqual({
      send: { screenId: 's1', answers: [{ questionId: 'lowerRibsWiden', answer: 'notSure' }, { questionId: 'neckShouldersLift', answer: 'no' }] },
      state: 'saving',
    });
  });

  it('a screen that was not saved cannot take answers, and says so', () => {
    expect(planSave('unsaved', { lowerRibsWiden: 'yes' })).toEqual({ send: null, state: 'noScreen' });
  });
});

// MIRROR-COACH P3 follow-up review (2026-09-28): after End before the breath station was held, no breath questions — the
// card says why, and the coach's stations are still named on a full screen
describe('the breath station not held (End before it)', () => {
  const unasked = (screen: 'modified' | 'full') =>
    renderToStaticMarkup(createElement(ScreenSelfReport, { screen, screenId: 'saved-1', save: async () => true, asked: false }));
  it('no question, no tap, and the not-reached line in their place', () => {
    const html = unasked('modified');
    for (const q of SELF_REPORT_QUESTIONS) expect(text(html)).not.toContain(q.text);
    expect(html).not.toContain('<button');
    expect(text(html)).toContain(SELF_REPORT_NOT_REACHED);
    expect(text(html)).toContain('Rib angle and breath');
  });
  it('a full screen still names its coach checks', () => {
    const full = text(unasked('full'));
    expect(full).toContain('Checked by your coach');
    expect(full).toContain(COACH_CHECK_LINE);
    expect(full).toContain(SELF_REPORT_NOT_REACHED);
  });
});
