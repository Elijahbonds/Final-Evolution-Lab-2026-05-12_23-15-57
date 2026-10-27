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
  GUIDES, allFixedLines, guideFor, needsLines, phaseReps, readResult, runStep, stepsFor, tomorrowLine, whyToday,
} from './guide';

const view = (rows = hooper(), acc = OPEN) => viewFrom('u1', rows, acc, NOW);

describe('why today', () => {
  it('names the lowest number, its value, and what the drill works on', () => {
    const v = view();
    expect(v.whyToday).toBe("Your shooting is your lowest number right now (40% of 30 shots made), so today's drill works on soft, balanced landings. Steady landings are the base of a good jump shot.");
  });
  it('the jump focus with the gate open, and with jumps held (the calm drill says what it works on)', () => {
    expect(view(jumper(), OPEN).whyToday).toContain("Your jump is your lowest number right now (26 in best jump), so today's drill works on quick, springy hops.");
    expect(view(jumper(), GATE_SHUT).whyToday).toContain('works on slow, steady squats');
  });
  it('no number yet says so plainly', () => {
    expect(view(newAdult()).whyToday).toBe("We don't have your numbers yet, so today's drill is waking up your whole body.");
    expect(whyToday('starter', null, false, 'wake-up')).toContain("We don't have your numbers yet");
  });
  it('a tie and a dip are said, never as blame', () => {
    const s = { key: 'jump' as const, label: 'Jump', standing: 40, display: '20 in best jump', trend: 'worse' as const, source: 'account' as const, latestAt: 0 };
    const line = whyToday('jump', s, true, 'pogo-bilateral');
    expect(line).toContain('It dipped a little since last week.');
    expect(line).toContain('the pick stays fixed for today');
  });
});

describe('steps, from the chart the day runs', () => {
  it('pogo: the warm-up, 3 sets of 20 hops, a minute of rest, the result', () => {
    const p = planFor('jump', OPEN)!;
    expect(stepsFor(p.drillId, p.phases)).toEqual([
      'Warm up for 4 minutes: breathe, wake up your feet, joint circles. The screen leads you.',
      '3 sets of 20 hops.',
      'Rest 1 minute between sets. The screen counts it down.',
      'See how you did, and what comes next.',
    ]);
  });
  it('every count in a step is the chart\'s own', () => {
    for (const acc of [OPEN, GATE_SHUT, YOUTH]) {
      for (const f of Object.keys(FOCUS_DRILLS) as (keyof typeof FOCUS_DRILLS)[]) {
        const p = planFor(f, acc);
        if (!p) continue;
        const steps = stepsFor(p.drillId, p.phases).join(' ');
        const main = p.phases.filter((r) => p.drillId === 'wake-up' || r.drill !== 'wake-up').map((r) => phaseOf(r)!);
        for (const ph of main.filter((x) => x.presence === 'required' && x.targets.length > 0 && p.drillId !== 'wake-up')) {
          expect(steps).toContain(String(phaseReps(ph)));
        }
      }
    }
  });
  it('a landing counts with its hop: 10 landings, not 20', () => {
    const p = planFor('shot', OPEN)!;
    expect(stepsFor(p.drillId, p.phases)[1]).toMatch(/^10 landings\. Small hop\./);
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
    expect(s.cue).toBe('Quick, quiet hops. Light feet.');
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

describe('after: what we saw / what it means / what is next', () => {
  const p = planFor('shot', OPEN)!;
  it('reads the drill\'s own phases (not the warm-up), as a camera estimate', () => {
    const r = readResult(p.drillId, resultOf(`daily:${p.key}`, p.phases, 0.85), p.phases, 'Tomorrow will likely work on soft, balanced landings again.');
    expect(r.title).toBe('Done for today');
    expect(r.saw).toBe('The camera saw 17 of 20 hops and landings on time.');
    expect(r.means).toContain('Your landings are steady.');
    expect(r.next).toContain('Tomorrow');
  });
  it('a low share is encouragement, never blame; stopping early says only a finished drill counts', () => {
    const low = readResult(p.drillId, resultOf('x', p.phases, 0.2), p.phases, 't');
    expect(low.means).toMatch(/practice/);
    expect(low.means).not.toMatch(/\b(bad|poor|fail|wrong|weak)\b/i);
    const early = readResult(p.drillId, resultOf('x', p.phases, 0.5, 'abandoned'), p.phases, 't');
    expect(early.title).toBe('Stopped early');
    expect(early.saw).toBe(`You finished 1 of ${p.phases.length} steps before you stopped.`);
  });
  it('tomorrow: the same pick run with tomorrow\'s date, said as likely', () => {
    const v = view();
    expect(v.tomorrow.focus).toBe('shot');
    expect(v.tomorrow.line).toBe('Tomorrow will likely work on soft, balanced landings again, while your shooting is your lowest number. A new score can change that.');
    expect(tomorrowLine('starter', 'starter', 'wake-up', null)).toContain('full-body wake-up');
    expect(tomorrowLine('jump', 'form', 'countermovement-geometry', { key: 'jump', label: 'Jump', standing: 1, display: '', trend: null, source: 'account', latestAt: 0 })).toBe('Tomorrow will likely work on slow, steady squats.');
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
    expect(grades.length).toBeGreaterThan(40);
    for (const [l, g] of grades) expect(g, `${l} → grade ${g.toFixed(1)}`).toBeLessThanOrEqual(8);
    expect(grades.reduce((s, [, g]) => s + g, 0) / grades.length).toBeLessThanOrEqual(6);
  });
  it('the why-lines a real account sees read at grade ≤ 8 too, and name no medical word', () => {
    for (const v of [view(), view(jumper()), view(jumper(), GATE_SHUT), view(newAdult()), view(teen(), YOUTH)]) {
      expect(v.whyToday).not.toMatch(MEDICAL_WORDS);
      expect(fkGrade(v.whyToday), v.whyToday).toBeLessThanOrEqual(8);
      expect(v.tomorrow.line).not.toMatch(MEDICAL_WORDS);
    }
  });
  it('2–3 key cues per drill, each short and action-first', () => {
    for (const g of Object.values(GUIDES)) {
      expect(g.cues.length).toBeGreaterThanOrEqual(2);
      expect(g.cues.length).toBeLessThanOrEqual(3);
      for (const c of g.cues) expect(c.split(/\s+/).length, c).toBeLessThanOrEqual(10);
    }
  });
  it('the setup distance is body play\'s own (SETUP_HINT), so the page and the space check agree', () => {
    expect(SETUP_HINT).toContain('3.5 to 4.5 m');
    expect(needsLines(true).find((n) => n.id === 'distance')!.text).toContain('3.5 to 4.5 m');
    expect(needsLines(true).map((n) => n.id)).toContain('check');
  });
  it('every day\'s drill has a guide, and its demo loop is one the shared library stage plays', async () => {
    const { EXERCISE_CLIPS: REAL_EXERCISE_CLIPS } = await import('@/lib/babylon/anim/authored/exercise');
    for (const f of Object.values(FOCUS_DRILLS)) for (const d of [f.impact, f.calm]) if (d) {
      expect(GUIDES).toHaveProperty(d.id);
      const clip = guideFor(d.id).demoClip;
      if (clip) expect(REAL_EXERCISE_CLIPS).toContain(clip);
      expect(drillById(d.id)).toBeTruthy();
    }
  });
});
