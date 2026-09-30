// MIRROR-COACH P6 FIX (2026-09-29, code review minor): the off day's walk read "1 × 12 min" on its dose line and asked
// for SECONDS in its logger (placeholder "720", an "s" after the box), so an athlete who typed "12" logged 12 seconds —
// which P9 will read as easy-cardio minutes. A timed item prescribed in whole minutes from five up now logs in minutes;
// the draft (and the save, and P9) still carry seconds. Node environment: the logger's first paint is a server render.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SetLogger } from './set-logger';
import { SET_LOG_ERROR_COPY, draftsToInput, emptySetDraft, logsInMinutes, minutesText, minutesToSecondsText, validateSet } from '@/lib/coach/setLog';
import { timedAmount } from '@/lib/coach/structure';
import { OFF_DAY_ITEMS } from '@/lib/coach/offDay';

const WALK = OFF_DAY_ITEMS.find((i) => i.key === 'easy-walk')!;
const render = (workHint: string, workSeconds = '') => renderToStaticMarkup(createElement(SetLogger, {
  name: 'Easy Walk', rows: [{ ...emptySetDraft(), workSeconds }], unit: 'kg', timed: true, simple: true, repsHint: '', workHint, onChange: () => {},
}));

describe('a long timed item logs in minutes — the unit its dose line uses', () => {
  it('the rule is the dose line\'s: whole minutes from five up; anything else stays in seconds', () => {
    expect(logsInMinutes(WALK.prescription.workSeconds)).toBe(true);
    expect(timedAmount(WALK.prescription.workSeconds)).toBe('12 min');
    for (const sec of [30, 60, 120, 290, 330, 0, null, undefined]) expect(logsInMinutes(sec), String(sec)).toBe(sec != null && timedAmount(sec).endsWith('min'));
    expect(logsInMinutes('720')).toBe(true);
  });

  it('the walk\'s box asks for minutes ("12" placeholder, "min" after it), never seconds', () => {
    const html = render(String(WALK.prescription.workSeconds));
    expect(html).toContain('aria-label="Set 1 minutes"');
    expect(html).toContain('placeholder="12"');
    expect(html).toMatch(/min<\/label>/);
    expect(html).not.toContain('aria-label="Set 1 seconds"');
    // a 30-second hold keeps its seconds box
    const hold = render('30');
    expect(hold).toContain('aria-label="Set 1 seconds"');
    expect(hold).not.toContain('Set 1 minutes');
  });

  it('typed "12" is 720 seconds in the draft and the save; a timer\'s 713 s reads back as 11.9', () => {
    expect(minutesToSecondsText('12')).toBe('720');
    expect(minutesToSecondsText('12.5')).toBe('750');
    expect(minutesToSecondsText('')).toBe('');
    expect(minutesToSecondsText('12.')).toBeNull();      // mid-typing: keep the text, change nothing yet
    expect(minutesToSecondsText('abc')).toBeNull();
    expect(minutesText('720')).toBe('12');
    expect(minutesText('713')).toBe('11.9');
    expect(minutesText('')).toBe('');
    const [set] = draftsToInput([{ ...emptySetDraft(), workSeconds: minutesToSecondsText('12')! }], 'kg');
    expect(validateSet(set)).toMatchObject({ ok: true, set: { workSeconds: 720 } });
    expect(render('720', '713')).toContain('value="11.9"');
  });

  it('past a set\'s 30 minutes, the refusal says so in minutes and what to do', () => {
    const [set] = draftsToInput([{ ...emptySetDraft(), workSeconds: minutesToSecondsText('40')! }], 'kg');
    expect(validateSet(set)).toEqual({ ok: false, error: 'work_seconds_range' });
    expect(SET_LOG_ERROR_COPY.work_seconds_range).toMatch(/up to 30 minutes\). Add a set for longer\./);
  });
});
