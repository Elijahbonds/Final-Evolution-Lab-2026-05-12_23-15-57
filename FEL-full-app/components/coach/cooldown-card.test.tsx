// Today's automatic cool-down and this-week strip, rendered (MIRROR-COACH P6, 2026-09-29). The lane's dev server is
// down and its database offline, so this is the render proof: a server render is the card's first paint. A coach's own
// Cool-down wins (nothing renders); an off day gets none; a squat day's card is the breath first, then a stretch per
// trained pattern, 5 minutes, with Start and the done tap; a card already done says so and offers no tap; the week
// strip names the off day as an off day.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CooldownCard, DONE_BUTTON, cooldownPlanFor } from './cooldown-card';
import { WeekStrip } from '@/app/coach/_components/today-view';
import { BREATH_SOURCE_LINE, COOLDOWN_DONE_LINE, EASY_RANGE_LINE, RECOVERY_BREATH_STEP, UNTAGGED_NOTE, cooldownMeaning } from '@/lib/coach/cooldown';

const ex = (id: string, order: number, section: string, pattern: string | null, isKeySet = false) =>
  ({ id, order, section, isKeySet, coaching: { pattern: pattern ? { id: pattern as 'squat' } : null } });
const SQUAT_DAY = [ex('p', 1, 'prep', 'breath'), ex('a', 2, 'key', 'squat', true), ex('b', 3, 'assist', 'lunge'), ex('c', 4, 'assist', 'pull')];
const base = { programId: 'p1', sessionId: 's1', endpoint: '/api/coach/me/cooldown' };

const html = (props: Parameters<typeof CooldownCard>[0]) => renderToStaticMarkup(createElement(CooldownCard, props));
const text = (m: string) => m.replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
const stepIds = (m: string) => [...m.matchAll(/data-step="([^"]+)"/g)].map((x) => x[1]);

describe('CooldownCard', () => {
  it("renders nothing when the coach wrote a Cool-down (theirs wins), on an off day, or for an empty session", () => {
    expect(html({ ...base, exercises: [...SQUAT_DAY, ex('z', 9, 'cooldown', 'breath')] })).toBe('');
    expect(html({ ...base, exercises: SQUAT_DAY, kind: 'recovery' })).toBe('');
    expect(html({ ...base, exercises: [] })).toBe('');
  });

  it('a squat day: the Cool-down section after the work, the breath first, then a stretch per trained pattern, 5 minutes', () => {
    const m = text(html({ ...base, exercises: SQUAT_DAY }));
    expect(m).toContain('data-section="cooldown"');
    expect(m).toContain('Cool-down · 5 min');
    expect(m).toContain(cooldownMeaning(5));
    const plan = cooldownPlanFor(SQUAT_DAY);
    expect(stepIds(m)).toEqual(plan.steps.map((s) => s.id));
    expect(stepIds(m)[0]).toBe(RECOVERY_BREATH_STEP.id);
    expect(m).toContain(RECOVERY_BREATH_STEP.name);
    expect(m).toContain(EASY_RANGE_LINE);
    expect(m).toContain(BREATH_SOURCE_LINE);
    expect(m).not.toContain(UNTAGGED_NOTE);
    expect(m).toContain('data-cooldown-start');
    expect(m).toContain(DONE_BUTTON);
    expect(m).not.toContain(COOLDOWN_DONE_LINE);
  });

  it('an untagged session: the general stretches, and it says why', () => {
    const m = text(html({ ...base, exercises: [ex('a', 1, 'key', null, true)] }));
    expect(m).toContain(UNTAGGED_NOTE);
    expect(stepIds(m)).toEqual(['recovery-breath', 'ninety-ninety-rock', 'open-book-rock']);
  });

  it('already done (Today says so for the open session): the done line, no tap, no Start', () => {
    const m = text(html({ ...base, exercises: SQUAT_DAY, done: true }));
    expect(m).toContain(COOLDOWN_DONE_LINE);
    expect(m).not.toContain(DONE_BUTTON);
    expect(m).not.toContain('data-cooldown-start');
  });

  it("after Done: the lead line above the card names the session just finished", () => {
    const m = text(html({ ...base, exercises: SQUAT_DAY, lead: "Day 2 done. Cool down now, while you're still warm." }));
    expect(m).toContain("Day 2 done. Cool down now, while you're still warm.");
  });
});

describe('WeekStrip, the week on Today', () => {
  it('every session in order with its state; the off day is named "Off day", marked recovery', () => {
    const m = text(renderToStaticMarkup(createElement(WeekStrip, { label: 'Week 1', entries: [
      { id: 's1', label: 'Day 1', kind: 'training', state: 'done' },
      { id: 'off', label: 'Off day', kind: 'recovery', state: 'today' },
      { id: 's2', label: 'Day 2', kind: 'training', state: 'upcoming' },
    ] })));
    expect(m).toContain('This week · Week 1');
    const rows = [...m.matchAll(/data-week-entry="([^"]+)" data-kind="([^"]+)" data-state="([^"]+)"/g)].map((x) => x.slice(1).join(':'));
    expect(rows).toEqual(['s1:training:done', 'off:recovery:today', 's2:training:upcoming']);
    expect(m).toMatch(/<span>Off day<\/span>/);
    expect(m).toContain('(today)');
  });
});
