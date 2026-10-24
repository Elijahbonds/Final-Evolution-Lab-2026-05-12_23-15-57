// DAILY-DRILL — the pick, from realistic rows: the weakest measured number, ties, no data, the same drill all day on
// every device, and the safety gates (the drills page's own) deciding the jumping or the calm version.
import { describe, expect, it } from 'vitest';
import { skillsFrom, SHOT_MIN_ATTEMPTS, type SkillReading } from './skills';
import { fnv1a, pickFocus, planFor, rankSkills, FOCUS_DRILLS, PREP_PHASES, focusDrillIds } from './plan';
import { viewFrom } from './load';
import { composeDailyDrill, specMinutes } from './compose';
import { ptDayBounds } from '@/lib/wallet/dailyKey';
import { phaseImpact } from '@/lib/coach/warmup';
import { drillById } from '@/lib/drills/drills';
import {
  GATE_SHUT, NOW, OPEN, STOPPED, YOUTH, ago, blank, dunk, hooper, jumper, newAdult, prq, set, shots, teen,
} from '@/tests/helpers/dailyDrillRows';

const START = ptDayBounds(NOW).start.getTime();
const U = 'user_daily_1';

describe('the readings (skills.ts) from realistic rows', () => {
  it('an opted-in hooper: jump 50 (26.0 in on the 12→40 in map), form 76, shooting 40', () => {
    const s = skillsFrom(hooper(), START, true);
    const by = Object.fromEntries(s.map((r) => [r.key, r]));
    expect(by.jump.standing).toBe(50);
    expect(by.jump.display).toBe('26 in best jump');
    expect(Math.round(by.form.standing)).toBe(76);
    expect(by.shot.standing).toBe(40);
    expect(by.shot.display).toBe('40% of 30 shots made');
  });

  it('the account gate repeated in JS: canSave false drops every account row (a teen, an adult not opted in)', () => {
    expect(skillsFrom(hooper(), START, false)).toEqual([]);
  });

  it('a shot record under SHOT_MIN_ATTEMPTS is not a number yet', () => {
    const rows = { ...blank(), shotScans: shots(2, SHOT_MIN_ATTEMPTS - 1, 3) };
    expect(skillsFrom(rows, START, true)).toEqual([]);
  });

  it('PRQ: a real source on the score scale counts; a game\'s drillResult copy and another unit do not', () => {
    const rows = { ...blank(), prqEntries: [prq('flexibility', 31, 4), prq('power', 20, 5, 'drillResult'), prq('power', 25, 6, 'manual', 'in')] };
    const s = skillsFrom(rows, START, false);
    expect(s.map((r) => [r.key, r.standing, r.source])).toEqual([['mobility', 31, 'prq']]);
  });

  it('PRQ power stands in for the jump only when no saved jump is in the window', () => {
    expect(skillsFrom({ ...blank(), prqEntries: [prq('power', 22, 3)] }, START, true).map((r) => r.display)).toEqual(['power 22 of 100']);
    const both = skillsFrom({ ...jumper(), prqEntries: [prq('power', 22, 3)] }, START, true).filter((r) => r.key === 'jump');
    expect(both).toHaveLength(1);
    expect(both[0].source).toBe('account');
  });

  it('nothing taken today counts (the window ends at the start of the PT day), nor anything older than four weeks', () => {
    const today = { ...blank(), jumpScans: [{ kind: 'dunk', metrics: { verticalCm: 30 }, createdAt: new Date(START + 60_000) }] };
    expect(skillsFrom(today, START, true)).toEqual([]);
    const old = { ...blank(), jumpScans: [dunk(30, 29)] };
    expect(skillsFrom(old, START, true)).toEqual([]);
  });

  it('a trend is this week against last, before today: form fell from 0.875 to 0.65 → worse', () => {
    const s = skillsFrom(hooper(), START, true);
    expect(s.find((r) => r.key === 'form')!.trend).toBe('worse');
    expect(s.find((r) => r.key === 'jump')!.trend).toBe('better');
  });
});

describe('the pick (plan.ts)', () => {
  it('the weakest number wins: the hooper shoots 40, so the shooting focus', () => {
    expect(pickFocus(skillsFrom(hooper(), START, true), U, '2026-10-24').focus).toBe('shot');
  });

  it('no shots on record: the jump (50) is weaker than form (76)', () => {
    expect(pickFocus(skillsFrom(jumper(), START, true), U, '2026-10-24').focus).toBe('jump');
  });

  it('no measured number: the starter (the Wake-Up)', () => {
    const p = pickFocus([], U, '2026-10-24');
    expect(p).toEqual({ focus: 'starter', skill: null, tiedWith: [] });
  });

  const reading = (key: SkillReading['key'], standing: number, trend: SkillReading['trend'] = null): SkillReading =>
    ({ key, label: key, standing, display: '', trend, source: 'account', latestAt: 0 });

  it('a tie (same whole-number standing) goes to the one that got worse against last week', () => {
    const p = pickFocus([reading('jump', 50.2, 'better'), reading('form', 49.8, 'worse')], U, '2026-10-24');
    expect(p.focus).toBe('form');
    expect(p.tiedWith).toEqual(['jump']);
    const q = pickFocus([reading('jump', 50.2, 'worse'), reading('form', 49.8, 'same')], U, '2026-10-24');
    expect(q.focus).toBe('jump');
  });

  it('a full tie is broken by a hash of (user, day): fixed within a day, and it rotates between equals across days', () => {
    const tie = [reading('jump', 50), reading('form', 50)];
    const days = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
    for (const d of days) {
      const a = pickFocus(tie, U, d).focus;
      // the same answer however the readings arrive, and on every call (device) that day
      expect(pickFocus([...tie].reverse(), U, d).focus).toBe(a);
      expect(pickFocus(tie, U, d).focus).toBe(a);
    }
    const picks = new Set(days.map((d) => pickFocus(tie, U, d).focus));
    expect(picks).toEqual(new Set(['jump', 'form']));
  });

  it('fnv1a is the standard FNV-1a (a stable hash on every server)', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('rankSkills orders weakest first', () => {
    expect(rankSkills([reading('form', 76), reading('shot', 40), reading('jump', 50)], U, 'd').map((r) => r.key)).toEqual(['shot', 'jump', 'form']);
  });
});

describe('the drill for the focus, under the drills page\'s gates', () => {
  it('jump, every gate open: the quick Wake-Up then Pogo Progression: Both Feet', () => {
    const p = planFor('jump', OPEN)!;
    expect(p.key).toBe('jump:pogo-bilateral');
    expect(p.calm).toBe(false);
    expect(p.phases.slice(0, PREP_PHASES.length).map((r) => r.phase)).toEqual(['pressurize', 'wake-the-tripod', 'open-the-joints']);
    expect(p.phases.slice(PREP_PHASES.length).every((r) => r.drill === 'pogo-bilateral')).toBe(true);
  });

  it('jump with the jump gate shut: the calm drill (Countermovement Geometry) and the gate\'s own line', () => {
    const p = planFor('jump', GATE_SHUT)!;
    expect(p.key).toBe('jump:countermovement-geometry');
    expect(p.calm).toBe(true);
    expect(p.heldNote).toContain('Jumps wait for a landing check.');
    expect(p.heldHref).toBe('/screen');   // the gate's landing link goes in at the Quick Screen's front door
  });

  it('a teen: same logic, the youth rule holds every jump — no phase of today\'s drill leaves the floor', () => {
    for (const focus of Object.keys(FOCUS_DRILLS) as (keyof typeof FOCUS_DRILLS)[]) {
      const p = planFor(focus, YOUTH)!;
      expect(p, focus).not.toBeNull();
      const chart = composeDailyDrill(p)!;
      expect(chart.phases.some(phaseImpact), focus).toBe(false);
    }
  });

  it('a standing intake red flag: no drill at all', () => {
    for (const focus of Object.keys(FOCUS_DRILLS) as (keyof typeof FOCUS_DRILLS)[]) expect(planFor(focus, STOPPED)).toBeNull();
  });

  it('every focus under every gate is a 5–10 minute drill, built from catalogue phases with no id twice', () => {
    for (const access of [OPEN, GATE_SHUT, YOUTH]) {
      for (const focus of Object.keys(FOCUS_DRILLS) as (keyof typeof FOCUS_DRILLS)[]) {
        const p = planFor(focus, access)!;
        const min = specMinutes(p);
        expect(min, `${focus}`).toBeGreaterThanOrEqual(5);
        expect(min, `${focus}`).toBeLessThanOrEqual(10);
        const chart = composeDailyDrill(p)!;
        expect(chart.phases).toHaveLength(p.phases.length);
        expect(focusDrillIds(focus)).toContain(p.drillId);
        expect(drillById(p.drillId)).not.toBeNull();
      }
    }
  });
});

describe('the view: deterministic per user per day, the same drill all day', () => {
  it('a hooper\'s day: shooting, Safe Landing with the gates open, the why-line names the number', () => {
    const v = viewFrom(U, hooper(), OPEN, NOW);
    expect(v.day).toBe('2026-10-24');
    expect(v.plan!.key).toBe('shot:safe-landing');
    expect(v.why).toBe('Picked from your lowest number: shooting, 40% of 30 shots made.');
    expect(v.nudge).toBeNull();
  });

  it('every hour of the PT day gives the same drill, and a jump check taken today does not move it', () => {
    const { start, end } = ptDayBounds(NOW);
    const keys = new Set<string>();
    for (let t = start.getTime(); t < end.getTime(); t += 3_600_000) {
      const rows = jumper();
      // a great jump at 10:00 today: tomorrow's pick sees it, today's does not
      rows.jumpScans.push({ kind: 'dunk', metrics: { verticalCm: 110 }, createdAt: new Date(start.getTime() + 3 * 3_600_000) });
      keys.add(viewFrom(U, rows, OPEN, new Date(t)).plan!.key);
    }
    expect([...keys]).toEqual(['jump:pogo-bilateral']);
  });

  it('the next PT day starts a new pick (here the 110 cm jump makes form the weakest)', () => {
    const rows = jumper();
    rows.jumpScans.push({ kind: 'dunk', metrics: { verticalCm: 110 }, createdAt: new Date(ptDayBounds(NOW).start.getTime() + 3 * 3_600_000) });
    const tomorrow = new Date(ptDayBounds(NOW).end.getTime() + 3_600_000);
    expect(viewFrom(U, rows, OPEN, tomorrow).focus).toBe('form');
  });

  it('no measurements: the Wake-Up and a nudge to measure, by gate', () => {
    const adult = viewFrom(U, { ...newAdult(), optIn: { scope: 'jump_numbers', granted: true, revokedAt: null } }, OPEN, NOW);
    expect(adult.plan!.drillId).toBe('wake-up');
    expect(adult.nudge!.href).toBe('/play/mirror/assess?run=jump');
    const notOpted = viewFrom(U, newAdult(), OPEN, NOW);
    expect(notOpted.nudge!.href).toBe('/account');
    const kid = viewFrom(U, teen(), YOUTH, NOW);
    expect(kid.focus).toBe('starter');
    expect(kid.nudge!.text).toContain('Under 18');
    // the Wake-Up runs its calm phases for the teen
    expect(kid.plan!.calm).toBe(true);
  });

  it('a teen whose own account carries a PRQ score: the same logic picks from it', () => {
    const v = viewFrom(U, { ...teen(), prqEntries: [prq('flexibility', 35, 2)] }, YOUTH, NOW);
    expect(v.focus).toBe('mobility');
  });

  it('a claimed day reads done, with what it paid and the streak it left', () => {
    const v = viewFrom(U, { ...hooper(), claim: { delta: BigInt(30), metadata: { streakDays: 4 } } }, OPEN, NOW);
    expect(v.done).toEqual({ amount: 30, streakDays: 4 });
  });

  it('the streak line: 24 h since the last streak day means finishing opens the next one', () => {
    const v = viewFrom(U, hooper(), OPEN, NOW);
    expect(v.streak).toEqual({ days: 3, opensToday: true, nextDays: 4 });
    const played = viewFrom(U, { ...hooper(), profile: { streakDays: 4, lastStreakAt: ago(0.1), lastActiveAt: ago(0.1) } }, OPEN, NOW);
    expect(played.streak.opensToday).toBe(false);
  });

  it('a mixed account (form only): the pick reads form and its trend', () => {
    const v = viewFrom(U, { ...blank(), optIn: { scope: 'jump_numbers', granted: true, revokedAt: null }, mirrorSessions: [set(0.5, 2), set(0.9, 9)] }, OPEN, NOW);
    expect(v.focus).toBe('form');
    expect(v.why).toContain('slipped against last week');
  });
});
