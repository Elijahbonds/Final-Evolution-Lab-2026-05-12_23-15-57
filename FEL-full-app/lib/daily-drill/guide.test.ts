// TODAY-DRILL — the plain guide: why today from the real number, steps read from the chart the day runs, one cue at a
// time during the run, the result as saw / means / next, and every fixed line held to the copy style (reading level,
// no medical words, never shaming).
import { describe, expect, it } from 'vitest';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import { SETUP_HINT } from '@/components/games/body-play';
import { drillById } from '@/lib/drills/drills';
import type { DrillResult } from '@/lib/drills/DrillRunner';
import { fkGrade } from '@/tests/helpers/readingLevel';
import { GATE_SHUT, NOW, OPEN, YOUTH, hooper, jumper, newAdult, teen } from '@/tests/helpers/dailyDrillRows';
import { FOCUS_DRILLS, planFor } from './plan';
import { composeDailyDrill, phaseOf } from './compose';
import { viewFrom } from './load';
import {
  GUIDES, allFixedLines, needChips, phaseReps, readResult, rewardChip, runStep, shortValue, stepsFor, tomorrowLine, whyNumber, whyToday,
} from './guide';

const view = (rows = hooper(), acc = OPEN) => viewFrom('u1', rows, acc, NOW);

describe('why today: one short line from the real number', () => {
  it('names the lowest score, its value, and what today works on', () => {
    expect(view().whyToday).toBe('Shooting is your lowest score (40%). Today: soft landings.');
    expect(view(jumper(), OPEN).whyToday).toBe('Jump is your lowest score (26 in). Today: springy hops.');
    expect(view(jumper(), GATE_SHUT).whyToday).toBe('Jump is your lowest score (26 in). Today: slow squats.');
    expect(view(newAdult()).whyToday).toBe('No scores yet. Today: a full-body wake-up.');
  });
  it('the page\'s why is the number alone (its title says the drill)', () => {
    expect(whyNumber('shot', view().skill)).toBe('Shooting is your lowest score (40%).');
    expect(whyNumber('starter', null)).toBe('No scores yet.');
  });
  it('every why-line is one short line (≤ 10 words)', () => {
    for (const v of [view(), view(jumper()), view(jumper(), GATE_SHUT), view(newAdult()), view(teen(), YOUTH)]) {
      expect(v.whyToday.split(/\s+/).length, v.whyToday).toBeLessThanOrEqual(10);
    }
  });
  it('the value is the reading\'s own, cut short', () => {
    const r = (display: string) => shortValue({ key: 'jump', label: 'Jump', standing: 1, display, trend: null, source: 'prq', latestAt: 0 });
    expect(r('26 in best jump')).toBe('26 in');
    expect(r('40% of 30 shots made')).toBe('40%');
    expect(r('power 48 of 100')).toBe('48/100');
    expect(r('62% clean reps')).toBe('62%');
  });
});

describe('steps: at most 3, each ≤ 6 words, counts from the chart the day runs', () => {
  it('pogo: warm-up, 3 sets of 20 hops, the rest', () => {
    const p = planFor('jump', OPEN)!;
    expect(stepsFor(p.drillId, p.phases)).toEqual(['Warm up, 4 min.', '3 sets of 20 hops.', 'Rest 1 min between.']);
  });
  it('landings and squats: the chart\'s own rep count; the Wake-Up: its moves and minutes', () => {
    const l = planFor('shot', OPEN)!;
    expect(stepsFor(l.drillId, l.phases)).toEqual(['Warm up, 4 min.', '10 hops, land and freeze.']);
    const g = planFor('form', OPEN)!;
    expect(stepsFor(g.drillId, g.phases)).toEqual(['Warm up, 4 min.', '5 slow squats, hold 3.']);
    const w = planFor('starter', OPEN)!;
    expect(stepsFor(w.drillId, w.phases)).toEqual(['6 moves, 10 min.', 'Follow the screen.']);
  });
  it('every plan, every gate: ≤ 3 steps of ≤ 6 words, and every rep count is the chart\'s', () => {
    for (const acc of [OPEN, GATE_SHUT, YOUTH]) {
      for (const f of Object.keys(FOCUS_DRILLS) as (keyof typeof FOCUS_DRILLS)[]) {
        const p = planFor(f, acc);
        if (!p) continue;
        const steps = stepsFor(p.drillId, p.phases);
        expect(steps.length).toBeLessThanOrEqual(3);
        for (const st of steps) expect(st.split(/\s+/).length, st).toBeLessThanOrEqual(6);
        if (p.drillId === 'wake-up') continue;
        const main = p.phases.filter((r) => r.drill !== 'wake-up').map((r) => phaseOf(r)!).filter((x) => x.presence === 'required');
        for (const ph of main) expect(steps.join(' ')).toContain(String(phaseReps(ph)));
      }
    }
  });
});

describe('chips and reward: short, amounts unchanged', () => {
  it('setup as icon chips: time, phone distance, floor; shoes and clear above when it jumps', () => {
    expect(needChips(true, 7).map((c) => c.text)).toEqual(['7 min', '4 m', '2 m floor', 'Shoes on', 'Clear above']);
    expect(needChips(false, 5).map((c) => c.id)).toEqual(['time', 'phone', 'floor']);
  });
  it('the reward line is the claim\'s own numbers', () => {
    expect(rewardChip(10, { opensToday: true, nextDays: 4 }, null)).toBe('+10 Lab Credits · Day 4 streak');
    expect(rewardChip(10, { opensToday: false, nextDays: 4 }, null)).toBe('+10 Lab Credits');
    expect(rewardChip(10, { opensToday: true, nextDays: 4 }, { amount: 30, streakDays: 4 })).toBe('Done · +30 Lab Credits · Day 4 streak');
  });
});

describe('during the run: one step, one cue, the rep, what is next', () => {
  const p = planFor('jump', OPEN)!;
  const drill = composeDailyDrill(p)!;
  it('a hop set: its plain name, the rep the chart is on, next = rest', () => {
    const i = drill.phases.findIndex((x) => x.id === 'set-1');
    const s = runStep(p.drillId, drill.phases, i, 8, 'book line')!;
    expect(s).toMatchObject({ index: i + 1, count: drill.phases.length, name: 'Hops: set 1', rest: false, next: 'Rest' });
    expect(s.rep).toEqual({ at: drill.phases[i].targets.filter((t) => t.t <= 8.05).length, of: 20 });
    expect(s.cue).toBe('Quick, quiet hops.');
  });
  it('a rest says rest, and the last step has no next', () => {
    const r = drill.phases.findIndex((x) => x.id === 'rest-1');
    expect(runStep(p.drillId, drill.phases, r, 3, null)).toMatchObject({ rest: true, name: 'Rest', rep: null, next: 'Hops: set 2' });
    expect(runStep(p.drillId, drill.phases, drill.phases.length - 1, 0, null)!.next).toBeNull();
  });
  it('a phase that changes side inside it keeps the timed line ("Right ankle.")', () => {
    const j = drill.phases.findIndex((x) => x.id === 'open-the-joints');
    expect(runStep(p.drillId, drill.phases, j, 31, 'Right ankle circles.')!.cue).toBe('Right ankle circles.');
  });
});

const resultOf = (drillId: string, refs: { drill: string; phase: string }[], share: number, status: 'complete' | 'abandoned' = 'complete'): DrillResult => {
  const phases = refs.map((r) => {
    const ph = phaseOf(r)!;
    const hit = Math.round(ph.targets.length * share);
    return { id: ph.id, name: ph.name, targets: ph.targets.length, counts: { PERFECT: hit, GREAT: 0, GOOD: 0, MISS: ph.targets.length - hit }, accuracy: null, stars: null, score: 0, maxCombo: 0, meanDeltaMs: null, holds: { held: 0, broken: 0 }, cadence: null, attempts: 1, finished: status === 'complete' || ph.id === 'pressurize' };
  });
  return { drillId, status, phases, counts: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 }, accuracy: share, stars: null, score: 0 };
};

describe('after: what we saw / what it means / what is next, ≤ 12 words each', () => {
  const p = planFor('shot', OPEN)!;
  it('reads the drill\'s own phases (not the warm-up), as a camera estimate', () => {
    const r = readResult(p.drillId, resultOf(`daily:${p.key}`, p.phases, 0.85), p.phases, 'Tomorrow: likely soft landings again.');
    expect(r.title).toBe('Done for today');
    expect(r.saw).toBe('Camera saw 17 of 20 on time.');
    expect(r.means).toBe('Steady landings. That is the base of every jump.');
    expect(r.next).toBe('Tomorrow: likely soft landings again.');
  });
  it('a low share is encouragement, never blame; stopping early says only a finished drill counts', () => {
    const low = readResult(p.drillId, resultOf('x', p.phases, 0.2), p.phases, 't');
    expect(low.means).toMatch(/practice/);
    expect(low.means).not.toMatch(/\b(bad|poor|fail|wrong|weak)\b/i);
    const early = readResult(p.drillId, resultOf('x', p.phases, 0.5, 'abandoned'), p.phases, 't');
    expect(early.title).toBe('Stopped early');
    expect(early.saw).toBe(`You finished 1 of ${p.phases.length} steps.`);
    expect(early.means).toBe('Only a finished drill counts. Try again later today.');
  });
  it('every row a real account can see is ≤ 12 words', () => {
    for (const [f, acc] of [['shot', OPEN], ['jump', OPEN], ['form', OPEN], ['starter', OPEN], ['jump', GATE_SHUT]] as const) {
      const pl = planFor(f, acc)!;
      for (const share of [0.9, 0.6, 0.1]) for (const st of ['complete', 'abandoned'] as const) {
        const rr = readResult(pl.drillId, resultOf('x', pl.phases, share, st), pl.phases, view().tomorrow.line);
        for (const line of [rr.saw, rr.means, rr.next]) expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(12);
      }
    }
  });
  it('tomorrow: the same pick run with tomorrow\'s date, said as likely', () => {
    const v = view();
    expect(v.tomorrow.focus).toBe('shot');
    expect(v.tomorrow.line).toBe('Tomorrow: likely soft landings again.');
    expect(tomorrowLine('starter', 'starter', 'wake-up', null)).toBe('Tomorrow: the wake-up again, until we have a score.');
    expect(tomorrowLine('jump', 'form', 'countermovement-geometry', { key: 'jump', label: 'Jump', standing: 1, display: '', trend: null, source: 'account', latestAt: 0 })).toBe('Tomorrow: likely slow squats.');
  });
});

describe('newcomer', () => {
  it('no drill in the 28 days before today, and none today: the explainer', () => {
    expect(view(newAdult()).newcomer).toBe(true);
    expect(view(hooper()).newcomer).toBe(false);
    expect(view({ ...newAdult(), claim: { delta: 10, metadata: {} } }).newcomer).toBe(false);
    // not read (the count failed or the db has none): a returning player's page, never a guess of "new"
    expect(view({ ...newAdult(), recentDrills: null }).newcomer).toBe(false);
    expect(view(teen(), YOUTH).newcomer).toBe(false);
  });
});

describe('copy style', () => {
  const lines = allFixedLines();
  it('no medical words in any fixed line', () => {
    for (const l of lines) expect(l, l).not.toMatch(MEDICAL_WORDS);
  });
  it('about a 6th–8th grade reading level: every line ≤ grade 8, the set ≤ grade 6 on average', () => {
    // a heading of one or two words has no sentence to grade (FK reads "Remember" as grade 20): lines of 5+ words
    const grades = lines.filter((l) => l.split(/\s+/).length >= 5).map((l) => [l, fkGrade(l)] as const);
    expect(grades.length).toBeGreaterThan(20);
    for (const [l, g] of grades) expect(g, `${l} → grade ${g.toFixed(1)}`).toBeLessThanOrEqual(8);
    expect(grades.reduce((s, [, g]) => s + g, 0) / grades.length).toBeLessThanOrEqual(6);
  });
  it('the why-lines a real account sees name no medical word', () => {
    for (const v of [view(), view(jumper()), view(jumper(), GATE_SHUT), view(newAdult()), view(teen(), YOUTH)]) {
      expect(v.whyToday).not.toMatch(MEDICAL_WORDS);
      expect(v.tomorrow.line).not.toMatch(MEDICAL_WORDS);
    }
  });
  it('2 key cues per drill, chip-short (≤ 4 words)', () => {
    for (const g of Object.values(GUIDES)) {
      expect(g.cues).toHaveLength(2);
      for (const c of g.cues) expect(c.split(/\s+/).length, c).toBeLessThanOrEqual(4);
      expect(g.improves.split(/\s+/).length, g.improves).toBeLessThanOrEqual(6);
    }
  });
  it('the phone distance chip is the middle of body play\'s own SETUP_HINT (3.5 to 4.5 m)', () => {
    expect(SETUP_HINT).toContain('3.5 to 4.5 m');
    expect(needChips(true, 7).find((c) => c.id === 'phone')!.text).toBe('4 m');
    expect(needChips(true, 7).find((c) => c.id === 'phone')!.label).toContain('Phone 4 m away');
  });
  it('every day\'s drill has a guide and a catalogue drill (the shared DrillDemo shows its loop, lib/library/surfaceDemo.ts)', () => {
    for (const f of Object.values(FOCUS_DRILLS)) for (const d of [f.impact, f.calm]) if (d) {
      expect(GUIDES).toHaveProperty(d.id);
      expect(drillById(d.id)).toBeTruthy();
    }
  });
});
