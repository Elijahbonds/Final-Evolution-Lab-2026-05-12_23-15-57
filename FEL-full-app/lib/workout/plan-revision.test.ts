import { describe, expect, it, vi } from 'vitest';
import { analyzeMovement, defaultMetrics, type Pillar } from './movement-screen';
import {
  EARLY_WEEKS, NO_FLIGHT_FALLBACK, PLAN_POOLS, depthDropSwap, generatePlan, isDepthDrop, landingOf, legacyWeeks as legacyFromGenerator,
  type PlanExercise, type PlanWeek,
} from './plan-generator';
import {
  HELD_FOR_PROTOCOL, PLAN_REVISED_NOTE, PLAN_REVISED_NOTE_YOUTH, PLAN_REVISION, PLAN_REVISION_ALL_WEEKS,
  PLAN_REVISION_YOUTH, YOUTH_FALLBACK, isPlyometric, planAudience, planRevisionNote, revisePlan,
  revisePlanForStorage, revisePlansOnRead, reviseDepthDrops, reviseEarlyDepthDrops, reviseForYouth, undoYouthRevision, youthSwap,
} from './plan-revision';
import { PLAN_SALE_PAUSED, RELAUNCH_FREE_LINE } from './plan-sale';
import { screenText } from '@/lib/share/screen';

// MIRROR-COACH P1 (2026-09-25), owner decision #3: every plan bought on /workout carries "Depth Drop to Vertical" 4x4 in
// week 1 (a power focus, in each of weeks 1-4), past the protocol gate that holds that same depth drop back. Past
// buyers keep their plans, revised: everything else as it was, and a note.
// MIRROR-COACH P2 (2026-09-25), owner decisions #22-#23: no depth drop in ANY week, for everyone (P1 stopped at week 4
// and held the rest for an adult), a swap that never repeats its week (P1's Trap-Bar Jump did), and a note with no
// refund offer that says the new training plans are free for them when they ship.

const PILLARS: Pillar[] = ['power', 'mobility', 'symmetry', 'stability', 'cadence', 'posture'];
const TIERS = ['plan_4w', 'program_12w'] as const;

/**
 * What generatePlan wrote before 2026-09-25, rebuilt here from the same pools and independently of the generator: the
 * rows buyers have in the database. (plan-generator.ts legacyWeeks is pinned to this below.)
 */
function legacyWeeks(focus: Pillar, tier: (typeof TIERS)[number]): PlanWeek[] {
  const THEMES = ['Foundation', 'Build', 'Intensify', 'Express'];
  const keys = Object.keys(PLAN_POOLS) as Pillar[];
  const out: PlanWeek[] = [];
  for (let week = 1; week <= (tier === 'program_12w' ? 12 : 4); week++) {
    const primary = PLAN_POOLS[focus];
    const secondary = PLAN_POOLS[keys.filter((p) => p !== focus)[(week - 1) % 5]];
    out.push({
      week, theme: THEMES[(week - 1) % 4],
      days: ['Mon', 'Wed', 'Fri'].map((day, i) => ({
        day, block: i === 1 ? 'Corrective + Skill' : 'Strength + Power',
        exercises: [primary[(week + i) % primary.length], secondary[(week + i) % secondary.length]].map((e) => ({ ...e })),
      })),
    });
  }
  // what the database hands back: plain JSON
  return JSON.parse(JSON.stringify(out));
}

/**
 * What P1's adult read stored (deployed 2026-09-25, dbb4e91c lib/workout/plan-revision.ts revisePlan 'adult'): in weeks
 * 1-4 each depth drop became the same pool's lowest-landing exercise not on that DAY (always the Trap-Bar Jump: the day
 * never holds another power exercise) marked `replaced`; after week 4 each was kept and marked held; every week it
 * touched carries P1's mark. Rebuilt by hand; checked equal to P1's own code over all 12 shapes with tsx on 2026-09-25.
 */
function p1Adult(weeks: PlanWeek[]): PlanWeek[] {
  const trap = PLAN_POOLS.power.find((e) => e.name === 'Trap-Bar Jump')!;
  return JSON.parse(JSON.stringify(weeks.map((w) => {
    if (!w.days.some((d) => d.exercises.some(isDepthDrop))) return w;
    return {
      ...w, revision: PLAN_REVISION,
      days: w.days.map((d) => ({
        ...d,
        exercises: d.exercises.map((e) => (!isDepthDrop(e) ? e : w.week <= EARLY_WEEKS ? { ...trap, replaced: e.name } : { ...e, held: HELD_FOR_PROTOCOL })),
      })),
    };
  })));
}

const screenFor = (focus: Pillar) => ({ ...analyzeMovement(defaultMetrics()), weakest: focus });
const exercisesOf = (weeks: unknown): PlanExercise[] => (weeks as PlanWeek[]).flatMap((w) => w.days.flatMap((d) => d.exercises));
const drops = (weeks: unknown, pred: (week: number) => boolean = () => true): number => (weeks as PlanWeek[])
  .filter((w) => pred(w.week)).reduce((n, w) => n + w.days.reduce((m, d) => m + d.exercises.filter(isDepthDrop).length, 0), 0);
/** The weeks with the revision's marks taken off. */
const unmarked = (weeks: unknown): PlanWeek[] => JSON.parse(JSON.stringify(weeks, (k, v) => (k === 'revision' || k === 'replaced' || k === 'held' ? undefined : v)));
/** Swaps (exercises marked `replaced`) whose name is on another slot of the same week. */
const swapsRepeatingTheirWeek = (weeks: unknown): string[] => (weeks as PlanWeek[]).flatMap((w) => {
  const names = w.days.flatMap((d) => d.exercises.map((e) => e.name));
  return w.days.flatMap((d) => d.exercises.filter((e) => e.replaced && names.filter((n) => n === e.name).length > 1).map((e) => `w${w.week} ${d.day} ${e.name}`));
});

describe('the plans buyers hold today (the baseline this fixes)', () => {
  it('every one of the 12 legacy plans has a depth drop in week 1, and a power focus has one in each of weeks 1-4', () => {
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        const w1 = legacyWeeks(focus, tier)[0];
        expect(w1.days.some((d) => d.exercises.some(isDepthDrop)), `${tier} ${focus}`).toBe(true);
        expect(drops(legacyWeeks(focus, tier), (n) => n <= EARLY_WEEKS), `${tier} ${focus}`).toBe(focus === 'power' ? 4 : 1);
      }
    }
  });

  it('plan-generator.ts legacyWeeks is the same rebuild', () => {
    for (const tier of TIERS) for (const focus of PILLARS) expect(legacyFromGenerator(focus, tier), `${tier} ${focus}`).toEqual(legacyWeeks(focus, tier));
  });

  it('36 depth drops in 36 weeks; 18 of them in weeks 5-12 (a mobility focus: weeks 1, 6 and 11)', () => {
    let all = 0, late = 0;
    for (const tier of TIERS) for (const focus of PILLARS) { all += drops(legacyWeeks(focus, tier)); late += drops(legacyWeeks(focus, tier), (n) => n > EARLY_WEEKS); }
    expect(all).toBe(36);
    expect(late).toBe(18);
    const mob = legacyWeeks('mobility', 'program_12w').filter((w) => w.days.some((d) => d.exercises.some(isDepthDrop))).map((w) => w.week);
    expect(mob).toEqual([1, 6, 11]);
  });

  it('in every one of those weeks, the power pool\'s other two exercises are already in the week (why the swap falls to a no-flight stand-in)', () => {
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        for (const w of legacyWeeks(focus, tier).filter((x) => x.days.some((d) => d.exercises.some(isDepthDrop)))) {
          const names = w.days.flatMap((d) => d.exercises.map((e) => e.name));
          expect(names, `${tier} ${focus} w${w.week}`).toEqual(expect.arrayContaining(['Trap-Bar Jump', 'Approach Bound']));
        }
      }
    }
  });

  it('P1\'s stored adult plans: 18 swaps, every one of them already in its week (the wart), and 18 held depth drops', () => {
    let p1Swaps = 0, repeats = 0, held = 0;
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        const p1 = p1Adult(legacyWeeks(focus, tier));
        p1Swaps += exercisesOf(p1).filter((e) => e.replaced).length;
        repeats += swapsRepeatingTheirWeek(p1).length;
        held += exercisesOf(p1).filter((e) => e.held === HELD_FOR_PROTOCOL).length;
      }
    }
    expect({ p1Swaps, repeats, held }).toEqual({ p1Swaps: 18, repeats: 18, held: 18 });
  });
});

describe('the swap for a depth drop (depthDropSwap)', () => {
  it('is the lowest-landing exercise of the same pool not already in the week: the trap-bar jump, then the bound', () => {
    const s = depthDropSwap('power');
    expect(s?.name).toBe('Trap-Bar Jump');
    expect(s?.targets).toBe('power');
    expect(isDepthDrop(s)).toBe(false);
    expect(landingOf('Trap-Bar Jump')).toBeLessThan(landingOf('Approach Bound'));
    expect(landingOf('Approach Bound')).toBeLessThan(landingOf('Depth Drop to Vertical'));
    expect(depthDropSwap('power', ['Trap-Bar Jump'])?.name).toBe('Approach Bound');
  });

  it('when the pool has nothing left that is not in the week, the first no-flight stand-in that is not', () => {
    expect(depthDropSwap('power', ['Trap-Bar Jump', 'Approach Bound'])?.name).toBe(NO_FLIGHT_FALLBACK[0]);
    expect(depthDropSwap('power', ['Trap-Bar Jump', 'Approach Bound', NO_FLIGHT_FALLBACK[0]])?.name).toBe(NO_FLIGHT_FALLBACK[1]);
    for (const n of NO_FLIGHT_FALLBACK) {
      expect(landingOf(n), n).toBe(0);
      expect(isPlyometric({ name: n }), n).toBe(false);
      expect(Object.values(PLAN_POOLS).flat().some((e) => e.name === n), `${n} is a pool exercise`).toBe(true);
    }
    expect(YOUTH_FALLBACK).toBe(NO_FLIGHT_FALLBACK);                      // one list, P1's name kept
  });

  it('the last resort, for a shape no stored plan has: the same pool, not on the day; else nothing', () => {
    const week = ['Trap-Bar Jump', 'Approach Bound', ...NO_FLIGHT_FALLBACK];
    expect(depthDropSwap('power', week, ['Approach Bound'])?.name).toBe('Trap-Bar Jump');
    expect(depthDropSwap('power', week, ['Trap-Bar Jump', 'Approach Bound'])).toBeNull();
    expect(depthDropSwap(null, week)).toBeNull();
    expect(depthDropSwap(null, [])?.name).toBe(NO_FLIGHT_FALLBACK[0]);
  });

  it('knows a depth drop by name, whatever the variation calls itself, and nothing else', () => {
    for (const n of ['Depth Drop to Vertical', 'depth drop', 'Depth-Drop Jump', 'Low Depth Drops']) expect(isDepthDrop({ name: n }), n).toBe(true);
    for (const n of ['Trap-Bar Jump', 'Drop Step', 'Squat to depth', 'Snap Down']) expect(isDepthDrop({ name: n }), n).toBe(false);
    expect(isDepthDrop(null)).toBe(false);
    expect(isDepthDrop({ name: 7 })).toBe(false);
  });
});

describe('generatePlan', () => {
  it('puts no depth drop in ANY week, for every focus and tier', () => {
    for (const tier of TIERS) for (const focus of PILLARS) expect(drops(generatePlan(screenFor(focus), tier).weeks), `${tier} ${focus}`).toBe(0);
  });

  it('is the legacy plan with only the depth drops swapped, in every week; nothing repeats in a week that did not before', () => {
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        const now = JSON.parse(JSON.stringify(generatePlan(screenFor(focus), tier).weeks)) as PlanWeek[];
        const was = legacyWeeks(focus, tier);
        expect(now).toHaveLength(was.length);
        now.forEach((w, wi) => {
          expect({ ...w, days: undefined }).toEqual({ ...was[wi], days: undefined });
          const names = w.days.flatMap((d) => d.exercises.map((e) => e.name));
          expect(new Set(names).size, `${tier} ${focus} w${w.week}`).toBe(names.length);
          w.days.forEach((d, di) => d.exercises.forEach((ex, ei) => {
            const old = was[wi].days[di].exercises[ei];
            if (isDepthDrop(old)) expect(NO_FLIGHT_FALLBACK, `${tier} ${focus} w${w.week}`).toContain(ex.name);
            else expect(ex).toEqual(old);
          }));
        });
      }
    }
  });
});

describe('reviseDepthDrops, a plan bought before 2026-09-25', () => {
  it('takes every depth drop out of EVERY week, for every focus and tier; days keep their length; no swap repeats its week', () => {
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        const was = legacyWeeks(focus, tier);
        const r = reviseDepthDrops(was);
        expect(r.changed, `${tier} ${focus}`).toBe(true);
        expect(drops(r.weeks), `${tier} ${focus}`).toBe(0);
        expect(swapsRepeatingTheirWeek(r.weeks), `${tier} ${focus}`).toEqual([]);
        (r.weeks as PlanWeek[]).forEach((w, wi) => w.days.forEach((d, di) => {
          expect(d.exercises).toHaveLength(was[wi].days[di].exercises.length);
          expect(new Set(d.exercises.map((e) => e.name)).size).toBe(d.exercises.length);
        }));
      }
    }
  });

  it('all 12 weeks: a 12-week power plan has a depth drop in every week, and every week is revised and marked', () => {
    const r = reviseDepthDrops(legacyWeeks('power', 'program_12w')).weeks as PlanWeek[];
    expect(r.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const w of r) {
      expect(w.revision, `w${w.week}`).toBe(PLAN_REVISION_ALL_WEEKS);
      expect(w.days.flatMap((d) => d.exercises).filter((e) => e.replaced === 'Depth Drop to Vertical'), `w${w.week}`).toHaveLength(1);
    }
  });

  it('marks each week it changed, once, and only those: a 12-week mobility plan, weeks 1, 6 and 11; the rest are the very same objects', () => {
    const was = legacyWeeks('mobility', 'program_12w');
    const now = reviseDepthDrops(was).weeks as PlanWeek[];
    expect(now.filter((w) => w.revision).map((w) => w.week)).toEqual([1, 6, 11]);
    now.forEach((w, i) => { if (![1, 6, 11].includes(w.week)) expect(w).toBe(was[i]); });
  });

  it('keeps everything else exactly, and the marks are all that sets it apart from a plan made today', () => {
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        const was = legacyWeeks(focus, tier);
        const now = reviseDepthDrops(was).weeks as PlanWeek[];
        now.forEach((w, wi) => w.days.forEach((d, di) => {
          expect({ day: d.day, block: d.block }).toEqual({ day: was[wi].days[di].day, block: was[wi].days[di].block });
          d.exercises.forEach((ex, ei) => {
            const o = was[wi].days[di].exercises[ei];
            if (!isDepthDrop(o)) expect(ex).toEqual(o);
            else expect(ex.replaced).toBe('Depth Drop to Vertical');
          });
        }));
        expect(unmarked(now), `${tier} ${focus}`).toEqual(JSON.parse(JSON.stringify(generatePlan(screenFor(focus), tier).weeks)));
      }
    }
  });

  it('P1\'s wart is gone: week 1 Friday\'s swap is not the Trap-Bar Jump already on Monday', () => {
    const w1 = (reviseDepthDrops(legacyWeeks('mobility', 'plan_4w')).weeks as PlanWeek[])[0];
    expect(w1.days[0].exercises.map((e) => e.name)).toContain('Trap-Bar Jump');                 // Monday, as bought
    expect(w1.days[2].exercises[1]).toEqual({ ...PLAN_POOLS.cadence.find((e) => e.name === 'Wall Drive March'), replaced: 'Depth Drop to Vertical' });
    expect(w1.days.flatMap((d) => d.exercises).filter((e) => e.name === 'Trap-Bar Jump')).toHaveLength(1);
  });

  it('is idempotent: a revised plan comes back unchanged, the same value, with nothing to write', () => {
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        const once = reviseDepthDrops(legacyWeeks(focus, tier));
        const twice = reviseDepthDrops(once.weeks);
        expect(twice.changed, `${tier} ${focus}`).toBe(false);
        expect(twice.weeks).toBe(once.weeks);
        expect(planRevisionNote(twice.weeks)).toBe(PLAN_REVISED_NOTE);
      }
    }
  });

  it('a week it marked is never revised again: even a hand-made repeat in it stays; only a depth drop put back by hand is swapped', () => {
    const once = reviseDepthDrops(legacyWeeks('mobility', 'plan_4w')).weeks as PlanWeek[];
    const w1 = JSON.parse(JSON.stringify(once[0])) as PlanWeek;
    w1.days[1].exercises[1] = { ...PLAN_POOLS.power[1], replaced: 'Depth Drop to Vertical' };      // a Trap-Bar Jump twice, P2-marked week
    const again = reviseDepthDrops([w1, ...once.slice(1)]);
    expect(again.changed).toBe(false);
    w1.days[1].exercises[1] = { ...PLAN_POOLS.power[0] };                                           // a depth drop back in a P2-marked week
    const fixed = reviseDepthDrops([w1, ...once.slice(1)]);
    expect(fixed.changed).toBe(true);
    expect(drops(fixed.weeks)).toBe(0);                                                             // the mark never lets one through
  });

  it('leaves a plan with no depth drop alone (no mark, no note), and does not mutate what it is given', () => {
    const clean = generatePlan(screenFor('mobility'), 'program_12w').weeks;
    const r = reviseDepthDrops(clean);
    expect(r.changed).toBe(false);
    expect(r.weeks).toBe(clean);
    expect(planRevisionNote(r.weeks)).toBeNull();
    const legacy = legacyWeeks('power', 'program_12w');
    const copy = JSON.parse(JSON.stringify(legacy));
    reviseDepthDrops(legacy);
    expect(legacy).toEqual(copy);
  });

  it('a depth drop no pool lists gets the no-flight stand-in; with none left it is removed, and the week is still marked', () => {
    const odd = (more: PlanExercise[] = []) => [{ week: 1, theme: 'Foundation', days: [{ day: 'Mon', block: 'x', exercises: [
      { name: 'Depth-Drop Jump', sets: 3, reps: '3', cue: 'c' }, { name: 'Wall Posture Hold', sets: 3, reps: '30s', cue: 'c', targets: 'posture' }, ...more,
    ] }] }];
    const a = (reviseDepthDrops(odd()).weeks as PlanWeek[])[0];
    expect(a.days[0].exercises.map((e) => e.name)).toEqual([NO_FLIGHT_FALLBACK[0], 'Wall Posture Hold']);
    expect(a.days[0].exercises[0].replaced).toBe('Depth-Drop Jump');
    const full = Object.values(PLAN_POOLS).flat().filter((e) => NO_FLIGHT_FALLBACK.includes(e.name));
    const b = reviseDepthDrops(odd(full));
    expect(b.changed).toBe(true);
    expect((b.weeks as PlanWeek[])[0].days[0].exercises.map((e) => e.name)).toEqual(['Wall Posture Hold', ...full.map((e) => e.name)]);
    expect((b.weeks as PlanWeek[])[0].revision).toBe(PLAN_REVISION_ALL_WEEKS);
  });

  it('finds the pool by name when the stored exercise lost its targets tag', () => {
    const weeks = [{ week: 2, theme: 'Build', days: [{ day: 'Wed', block: 'x', exercises: [{ name: 'Depth Drop to Vertical', sets: 4, reps: '4', cue: 'c' }] }] }];
    const ex = (reviseDepthDrops(weeks).weeks as PlanWeek[])[0].days[0].exercises[0] as PlanExercise;
    expect(ex.name).toBe('Trap-Bar Jump');                                   // nothing else in that week: the pool's lowest
    expect(ex.replaced).toBe('Depth Drop to Vertical');
  });

  it('whatever week number the plan carries, or none', () => {
    const drop = { name: 'Depth Drop to Vertical', sets: 4, reps: '4', cue: 'c', targets: 'power' };
    expect(reviseDepthDrops([{ week: 6, theme: 'Build', days: [{ day: 'Mon', block: 'x', exercises: [drop] }] }]).changed).toBe(true);
    expect(reviseDepthDrops([{ week: 12, theme: 'Build', days: [{ day: 'Mon', block: 'x', exercises: [drop] }] }]).changed).toBe(true);
    expect(reviseDepthDrops([{ theme: 'Build', days: [{ day: 'Mon', block: 'x', exercises: [drop] }] }]).changed).toBe(true);
  });

  it('never throws on a shape it does not know, and changes nothing there', () => {
    for (const odd of [null, undefined, 7, 'weeks', {}, [], [null], [{ week: 1 }], [{ week: 1, days: [null, { exercises: 'x' }] }]]) {
      const r = reviseDepthDrops(odd);
      expect(r.changed, JSON.stringify(odd)).toBe(false);
      expect(r.weeks).toBe(odd);
      expect(planRevisionNote(odd)).toBeNull();
    }
  });

  it('P1\'s name for it is the same function now (kept for the P1 baseline probe)', () => {
    expect(reviseEarlyDepthDrops).toBe(reviseDepthDrops);
  });
});

describe('a plan P1 already revised on read (deployed 2026-09-25)', () => {
  it('ends exactly where a never-opened plan does: every held depth drop swapped, every P1 swap that repeats its week picked again', () => {
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        const legacy = legacyWeeks(focus, tier);
        const fromP1 = revisePlan(p1Adult(legacy), 'adult');
        expect(fromP1.changed, `${tier} ${focus}`).toBe(true);
        expect(fromP1.weeks, `${tier} ${focus}`).toEqual(revisePlan(legacy, 'adult').weeks);
        expect(exercisesOf(fromP1.weeks).filter((e) => e.held)).toEqual([]);
        expect(swapsRepeatingTheirWeek(fromP1.weeks)).toEqual([]);
        expect(planRevisionNote(fromP1.weeks)).toBe(PLAN_REVISED_NOTE);
        expect(revisePlan(fromP1.weeks, 'adult').changed).toBe(false);
      }
    }
  });

  it('a P1 swap that does not repeat its week is left as it is', () => {
    const weeks = [{ week: 2, theme: 'Build', revision: PLAN_REVISION, days: [{ day: 'Wed', block: 'x', exercises: [
      { ...PLAN_POOLS.power[1], replaced: 'Depth Drop to Vertical' }, { ...PLAN_POOLS.mobility[0] },
    ] }] }];
    const r = reviseDepthDrops(weeks);
    expect(r.changed).toBe(false);
    expect(planRevisionNote(r.weeks)).toBe(PLAN_REVISED_NOTE);             // P1's mark still brings the (new) note
  });
});

// The notes are FEL's draft (decisions #3, #22 and #23 gave no wording), pinned here so a change is seen, and listed for
// the owner to approve.
describe('the words (FEL\'s draft, for the owner to approve)', () => {
  it('the notes say what changed and that the new plans are free when they ship: no refund, no date', () => {
    expect(RELAUNCH_FREE_LINE).toBe('When our new training plans ship, you get them free.');
    expect(PLAN_REVISED_NOTE).toBe('We changed your plan: every depth drop, in every week, is swapped for a move with a softer landing or none. When our new training plans ship, you get them free. Nothing to do.');
    expect(PLAN_REVISED_NOTE_YOUTH).toBe('We changed your plan: it no longer includes depth drops or jumps unless a coach assigns them. When our new training plans ship, you get them free. Nothing to do.');
    for (const s of [PLAN_REVISED_NOTE, PLAN_REVISED_NOTE_YOUTH]) {
      expect(s, s).toContain(RELAUNCH_FREE_LINE);
      expect(s, s).toMatch(/\bwhen\b.*\bship\b/i);
      expect(s, s).not.toMatch(/refund|money back|shards? back|credit/i);
      expect(s, s).not.toMatch(/\b(19|20)\d\d\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b\d{1,2}\/\d{1,2}\b|\bsoon\b|\bnext (week|month)\b/i);
      expect(s, s).not.toMatch(/early weeks|held/i);                         // P1's scope and P1's hold are gone
    }
  });

  it('the notes and the sale message pass the no-diagnosis, no-treatment, no-guarantee screen (lib/share/screen.ts)', () => {
    expect(PLAN_SALE_PAUSED).toBe('The training plan is being rebuilt; it will be back with real programs.');
    for (const s of [PLAN_REVISED_NOTE, PLAN_REVISED_NOTE_YOUTH, RELAUNCH_FREE_LINE, PLAN_SALE_PAUSED]) expect(screenText(s), s).toEqual([]);
    for (const pool of Object.values(PLAN_POOLS)) for (const e of pool) expect(screenText(`${e.name}. ${e.cue}.`), e.name).toEqual([]);
  });

  it('which note a plan shows: youth over everything, then either revision\'s mark, else none', () => {
    const wk = (revision?: string) => ({ week: 1, theme: 't', days: [], ...(revision ? { revision } : {}) });
    expect(planRevisionNote([wk(PLAN_REVISION_ALL_WEEKS)])).toBe(PLAN_REVISED_NOTE);
    expect(planRevisionNote([wk(PLAN_REVISION)])).toBe(PLAN_REVISED_NOTE);
    expect(planRevisionNote([wk(PLAN_REVISION_ALL_WEEKS), wk(PLAN_REVISION_YOUTH)])).toBe(PLAN_REVISED_NOTE_YOUTH);
    expect(planRevisionNote([wk(), wk('something-else')])).toBeNull();
  });
});

// MIRROR-COACH P1 review (2026-09-25), owner decision #6: no depth drops or plyometric primers for an under-18 unless a
// coach assigns them; GET served the plans with no age check.
describe('who reads the plan', () => {
  const now = new Date('2026-09-25T12:00:00Z');
  it('is youth unless the birth year makes them certainly 18 or over — an unknown age is youth', () => {
    expect(planAudience(null, now)).toBe('youth');
    expect(planAudience(undefined, now)).toBe('youth');
    expect(planAudience(Number.NaN, now)).toBe('youth');
    expect(planAudience(2012, now)).toBe('youth');
    expect(planAudience(2008, now)).toBe('youth');           // 17 or 18 — a year alone cannot say, so the safe way
    expect(planAudience(2007, now)).toBe('adult');
    expect(planAudience(1990, now)).toBe('adult');
  });
});

describe('a YOUTH reader\'s plan: no jumps of any kind, in any week', () => {
  it('every focus and tier: 0 depth drops and 0 plyometrics in ANY week, days never empty, nothing twice on a day', () => {
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        const r = revisePlan(legacyWeeks(focus, tier), 'youth');
        expect(r.changed, `${tier} ${focus}`).toBe(true);
        for (const w of r.weeks as PlanWeek[]) {
          for (const d of w.days) {
            expect(d.exercises.filter(isDepthDrop), `${tier} ${focus} w${w.week} ${d.day}`).toEqual([]);
            expect(d.exercises.filter(isPlyometric).map((e) => e.name), `${tier} ${focus} w${w.week} ${d.day}`).toEqual([]);
            expect(d.exercises.length, `${tier} ${focus} w${w.week} ${d.day}`).toBe(2);
            expect(new Set(d.exercises.map((e) => e.name)).size).toBe(d.exercises.length);
          }
        }
        expect(planRevisionNote(r.weeks), `${tier} ${focus}`).toBe(PLAN_REVISED_NOTE_YOUTH);
      }
    }
  });

  it('a minor\'s 12-week mobility plan: the week 6 and 11 depth drops are gone, and each swap names what it replaced', () => {
    const r = revisePlan(legacyWeeks('mobility', 'program_12w'), 'youth').weeks as PlanWeek[];
    for (const wk of [6, 11]) {
      const ex = r[wk - 1].days.flatMap((d) => d.exercises).filter((e) => e.replaced === 'Depth Drop to Vertical');
      expect(ex.length, `week ${wk}`).toBeGreaterThan(0);
      for (const e of ex) expect(landingOf(e.name)).toBe(0);
      expect(r[wk - 1].revision).toBe(PLAN_REVISION_YOUTH);
    }
  });

  it('the swap has no flight phase: the same pool first, else the fallback list (the power pool is all jumps)', () => {
    expect(youthSwap('power')?.name).toBe(YOUTH_FALLBACK[0]);
    expect(youthSwap('stability')?.name).toBe('Copenhagen Plank');
    expect(youthSwap('power', [YOUTH_FALLBACK[0]])?.name).toBe(YOUTH_FALLBACK[1]);
    for (const n of YOUTH_FALLBACK) expect(isPlyometric({ name: n }), n).toBe(false);
    for (const n of ['Trap-Bar Jump', 'Approach Bound', 'Lateral Bound + Stick', 'A-Skip', 'Landing Trunk Control', 'Depth Drop to Vertical', 'Box Jumps', 'Pogo Hops'])
      expect(isPlyometric({ name: n }), n).toBe(true);
  });

  it('an adult-revised plan — P1\'s or P2\'s — read later by a youth reader loses every jump and every held mark', () => {
    for (const start of [revisePlan(legacyWeeks('power', 'program_12w'), 'adult').weeks, p1Adult(legacyWeeks('power', 'program_12w'))]) {
      expect(exercisesOf(start).some(isPlyometric)).toBe(true);             // the trap-bar jumps and bounds an adult keeps
      const youth = revisePlan(start, 'youth');
      expect(exercisesOf(youth.weeks).filter(isPlyometric)).toEqual([]);
      expect(exercisesOf(youth.weeks).filter((e) => e.held)).toEqual([]);
      expect(planRevisionNote(youth.weeks)).toBe(PLAN_REVISED_NOTE_YOUTH);
    }
  });

  it('is idempotent, and leaves a plan with no jumps alone', () => {
    const once = reviseForYouth(legacyWeeks('cadence', 'program_12w'));
    const twice = reviseForYouth(once.weeks);
    expect(twice.changed).toBe(false);
    expect(twice.weeks).toBe(once.weeks);
    const none = [{ week: 1, theme: 'x', days: [{ day: 'Mon', block: 'x', exercises: [{ name: 'Wall Posture Hold', sets: 3, reps: '30s', cue: 'c', targets: 'posture' }] }] }];
    expect(reviseForYouth(none)).toEqual({ weeks: none, changed: false });
  });
});

describe('an ADULT reader\'s plan: no depth drop in any week, nothing held', () => {
  it('every focus and tier: 0 depth drops in any week, no held mark, the one note', () => {
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        const r = revisePlan(legacyWeeks(focus, tier), 'adult');
        expect(drops(r.weeks), `${tier} ${focus}`).toBe(0);
        expect(exercisesOf(r.weeks).filter((e) => e.held), `${tier} ${focus}`).toEqual([]);
        expect(planRevisionNote(r.weeks), `${tier} ${focus}`).toBe(PLAN_REVISED_NOTE);
        expect(revisePlan(r.weeks, 'adult')).toEqual({ weeks: r.weeks, changed: false });
      }
    }
  });
});

// A stand-in for prisma.workoutPlan that keeps the rows and records every write. Nothing else exists on it, so a write
// to any other table fails the test.
function fakeDb(rows: { id: string; userId: string; tier: string; focus: string; weeks: unknown; createdAt: Date }[], fail = false) {
  const writes: unknown[] = [];
  const db = {
    workoutPlan: {
      updateMany: vi.fn(async (args: { where: { id: string; userId: string }; data: Record<string, unknown> }) => {
        writes.push(args);
        if (fail) throw new Error('database offline');
        let count = 0;
        for (const r of rows) {
          if (r.id === args.where.id && r.userId === args.where.userId) { Object.assign(r, JSON.parse(JSON.stringify(args.data))); count++; }
        }
        return { count };
      }),
    },
  };
  return { db: db as never, writes, rows };
}

describe('revisePlansOnRead (the plan route\'s GET)', () => {
  const at = new Date('2026-09-01T12:00:00Z');
  const mk = () => [
    { id: 'p1', userId: 'u1', tier: 'program_12w', focus: 'Mobility & Range', weeks: legacyWeeks('mobility', 'program_12w'), createdAt: at },
    { id: 'p2', userId: 'u1', tier: 'plan_4w', focus: 'Explosive Power', weeks: legacyWeeks('power', 'plan_4w'), createdAt: at },
    { id: 'p3', userId: 'u1', tier: 'plan_4w', focus: 'Mobility & Range', weeks: generatePlan(screenFor('mobility'), 'plan_4w').weeks, createdAt: at },
  ];

  it('writes each changed plan once, by its id AND the reader, and writes its weeks only (never tier or createdAt)', async () => {
    const { db, writes, rows } = fakeDb(mk());
    const out = await revisePlansOnRead(db, 'u1', rows.map((r) => ({ ...r })), 'adult');
    expect(writes).toHaveLength(2);                                         // p3 had nothing to change
    for (const w of writes as { where: unknown; data: Record<string, unknown> }[]) {
      expect(Object.keys(w.data)).toEqual(['weeks']);
      expect(w.where).toMatchObject({ userId: 'u1' });
    }
    expect((writes as { where: { id: string } }[]).map((w) => w.where.id)).toEqual(['p1', 'p2']);
    expect(out.map((p) => p.revisionNote)).toEqual([PLAN_REVISED_NOTE, PLAN_REVISED_NOTE, null]);
    for (const p of out) expect(drops(p.weeks)).toBe(0);
    expect(out.map(({ id, tier, focus, createdAt }) => ({ id, tier, focus, createdAt }))).toEqual(
      mk().map(({ id, tier, focus, createdAt }) => ({ id, tier, focus, createdAt })));
    for (const r of rows) expect(drops(r.weeks), r.id).toBe(0);              // and it is stored
  });

  it('a second read writes nothing and shows the same plans and notes', async () => {
    const { db, writes, rows } = fakeDb(mk());
    const first = await revisePlansOnRead(db, 'u1', rows.map((r) => ({ ...r })), 'adult');
    const n = writes.length;
    const second = await revisePlansOnRead(db, 'u1', rows.map((r) => ({ ...r })), 'adult');
    expect(writes).toHaveLength(n);
    expect(second).toEqual(first);
  });

  it('never writes a row that is not the reader\'s', async () => {
    const { db, rows } = fakeDb(mk());
    const before = JSON.parse(JSON.stringify(rows[0].weeks));
    await revisePlansOnRead(db, 'someone-else', [{ ...rows[0] }], 'adult');
    expect(rows[0].weeks).toEqual(before);
  });

  // FLIPPED IN THE P2 REVIEW (2026-09-26): a youth reader is SERVED the youth revision; what is STORED is everyone's
  // depth-drop revision, so an adult birth year answered later gets the adult plan back.
  it('a youth reader\'s plans are served revised for youth; the stored rows get only the depth-drop revision', async () => {
    const { db, rows } = fakeDb(mk());
    const out = await revisePlansOnRead(db, 'u1', rows.map((r) => ({ ...r })), 'youth');
    for (const p of out) expect(exercisesOf(p.weeks).filter(isPlyometric), p.id).toEqual([]);
    for (const r of rows) {
      expect(exercisesOf(r.weeks).filter(isDepthDrop), r.id).toEqual([]);
      expect((r.weeks as PlanWeek[]).some((w) => w.revision === PLAN_REVISION_YOUTH), r.id).toBe(false);
    }
    expect(out.map((p) => p.revisionNote)).toEqual([PLAN_REVISED_NOTE_YOUTH, PLAN_REVISED_NOTE_YOUTH, PLAN_REVISED_NOTE_YOUTH]);
    // the same rows read by an adult: the adult plan, and the adult note
    const adult = await revisePlansOnRead(db, 'u1', rows.map((r) => ({ ...r })), 'adult');
    // (p3 was generated after the swap existed: it never held a depth drop, so an adult reads no note on it)
    expect(adult.map((p) => p.revisionNote)).toEqual([PLAN_REVISED_NOTE, PLAN_REVISED_NOTE, null]);
    expect(adult.map((p) => exercisesOf(p.weeks).filter(isPlyometric).length > 0)).toEqual([true, true, true]);
  });

  it('undoYouthRevision restores every swapped exercise from its pool, drops the youth mark, and is a no-op on a clean plan', () => {
    for (const f of ['power', 'mobility', 'symmetry', 'stability', 'cadence', 'posture'] as const) {
      const legacy = legacyWeeks(f, 'program_12w');
      const undone = undoYouthRevision(reviseForYouth(legacy).weeks);
      expect(undone.changed, f).toBe(true);
      expect(undone.weeks, f).toEqual(legacy);                                 // exactly the plan as bought
      expect(revisePlanForStorage(reviseForYouth(legacy).weeks).weeks, f).toEqual(revisePlanForStorage(legacy).weeks);
      const clean = revisePlanForStorage(legacy).weeks;
      expect(undoYouthRevision(clean), f).toEqual({ weeks: clean, changed: false });
    }
  });

  it('never breaks the read: if the write fails the plan is still shown revised with its note, and the next read tries again', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db, writes, rows } = fakeDb(mk(), true);
    const out = await revisePlansOnRead(db, 'u1', rows.map((r) => ({ ...r })), 'adult');
    expect(out[0].revisionNote).toBe(PLAN_REVISED_NOTE);
    expect(drops(out[0].weeks)).toBe(0);
    expect(drops(rows[0].weeks)).toBe(3);                                    // not stored: weeks 1, 6 and 11 still
    await revisePlansOnRead(db, 'u1', rows.map((r) => ({ ...r })), 'adult');
    expect(writes).toHaveLength(4);                                          // tried again
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
