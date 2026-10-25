// COACH-READINESS: every line the check says is product copy, not medical copy — held to the drafts engine's
// MEDICAL_WORDS screen, and every reason has a line.
import { describe, expect, it } from 'vitest';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import { BAND_LABEL, FIXED_LINES, coachAlertLine, coachedNextLine, reasonLine, ruleLine, soloLine } from '@/lib/coach/readiness/copy';
import type { ReadinessBand, ReadinessReason } from '@/lib/coach/readiness/types';

const REASONS: ReadinessReason[] = ['building', 'up', 'steady', 'dip_noise', 'dip_small', 'feel_caps', 'low_drop', 'low_drop_feel', 'low_twice'];
const BANDS: ReadinessBand[] = ['ready', 'normal', 'low', 'building'];

describe('readiness copy', () => {
  const all: string[] = [...FIXED_LINES, ...Object.values(BAND_LABEL)];
  for (const reason of REASONS) {
    all.push(reasonLine({ reason, dropPct: 8.4, feel: 2, baselineN: 6, priorChecks: 1, ruleDropPct: 5 }));
    for (const action of ['ease', 'tell'] as const) all.push(coachAlertLine({ name: 'Maya', dropPct: 8.4, reason, action }));
  }
  for (const band of BANDS) {
    const s = soloLine(band); if (s) all.push(s);
    for (const ease of [true, false]) for (const coachTold of [true, false]) for (const shared of [true, false]) {
      const l = coachedNextLine({ band, ease, coachName: 'Coach Dee', coachTold, shared }); if (l) all.push(l);
    }
  }
  for (const kind of ['drop_pct', 'low_twice'] as const) for (const action of ['ease', 'tell'] as const) all.push(ruleLine({ kind, dropPct: 5, action, source: 'default' }));

  it('no line names a cause, a condition or a treatment', () => {
    expect(all.length).toBeGreaterThan(40);
    for (const l of all) expect(l, l).not.toMatch(MEDICAL_WORDS);
  });

  it('every reason has its own words, and a drop says its size', () => {
    const lines = REASONS.map((reason) => reasonLine({ reason, dropPct: 8.4, feel: 2, baselineN: 6, priorChecks: 1, ruleDropPct: 5 }));
    expect(new Set(lines).size).toBe(REASONS.length);
    expect(lines[REASONS.indexOf('low_drop')]).toContain('8.4%');
    expect(lines[REASONS.indexOf('building')]).toContain('2 more checks');
  });

  it('a Low day the coach was not told about says why (the grant), and an eased one says what eased', () => {
    expect(coachedNextLine({ band: 'low', ease: true, coachName: 'Coach Dee', coachTold: false, shared: false })).toMatch(/not told: you have not shared/);
    expect(coachedNextLine({ band: 'low', ease: true, coachName: 'Coach Dee', coachTold: true, shared: true })).toMatch(/eased: a set fewer.*Coach Dee has been told/);
    expect(coachedNextLine({ band: 'normal', ease: false, coachName: null, coachTold: false, shared: true })).toBeNull();
  });
});
