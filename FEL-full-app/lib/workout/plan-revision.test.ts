import { describe, expect, it, vi } from 'vitest';
import { analyzeMovement, defaultMetrics, type Pillar } from './movement-screen';
import {
  EARLY_WEEKS, PLAN_POOLS, earlyWeekSwap, generatePlan, isDepthDrop, landingOf,
  type PlanExercise, type PlanWeek,
} from './plan-generator';
import {
  HELD_FOR_PROTOCOL, HELD_LINE, PLAN_REVISED_NOTE, PLAN_REVISED_NOTE_HELD, PLAN_REVISED_NOTE_YOUTH, PLAN_REVISION,
  PLAN_REVISION_YOUTH, YOUTH_FALLBACK, holdLateDepthDrops, isPlyometric, planAudience, planRevisionNote, revisePlan,
  revisePlansOnRead, reviseEarlyDepthDrops, reviseForYouth, youthSwap,
} from './plan-revision';
import { PLAN_SALE_PAUSED } from './plan-sale';
import { screenText } from '@/lib/share/screen';

// MIRROR-COACH P1 (2026-09-25), owner decision #3: every plan bought on /workout carries "Depth Drop to Vertical" 4x4 in
// week 1 (a power focus, in each of weeks 1-4), past the protocol gate that holds that same depth drop back. Past
// buyers keep their plans, revised on read: no depth drop in weeks 1-4, everything else as it was, and a note.

const PILLARS: Pillar[] = ['power', 'mobility', 'symmetry', 'stability', 'cadence', 'posture'];
const TIERS = ['plan_4w', 'program_12w'] as const;

/** What generatePlan wrote before today, rebuilt from the same pools: the rows buyers have in the database now. */
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

const screenFor = (focus: Pillar) => ({ ...analyzeMovement(defaultMetrics()), weakest: focus });
const earlyDrops = (weeks: unknown): number => (weeks as PlanWeek[])
  .filter((w) => w.week <= EARLY_WEEKS)
  .reduce((n, w) => n + w.days.reduce((m, d) => m + d.exercises.filter(isDepthDrop).length, 0), 0);
/** The weeks with the revision's marks taken off. */
const unmarked = (weeks: unknown): PlanWeek[] => JSON.parse(JSON.stringify(weeks, (k, v) => (k === 'revision' || k === 'replaced' || k === 'held' ? undefined : v)));
const all = (weeks: unknown): PlanExercise[] => (weeks as PlanWeek[]).flatMap((w) => w.days.flatMap((d) => d.exercises));

describe('the plans buyers hold today (the baseline this fixes)', () => {
  it('every one of the 12 legacy plans has a depth drop in week 1, and a power focus has one in each of weeks 1-4', () => {
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        const w1 = legacyWeeks(focus, tier)[0];
        expect(w1.days.some((d) => d.exercises.some(isDepthDrop)), `${tier} ${focus}`).toBe(true);
        expect(earlyDrops(legacyWeeks(focus, tier)), `${tier} ${focus}`).toBe(focus === 'power' ? 4 : 1);
      }
    }
  });
});

describe('the swap for an early-week depth drop', () => {
  it('is the lowest-landing exercise of the same pool: the trap-bar jump for the power pool', () => {
    const s = earlyWeekSwap('power');
    expect(s?.name).toBe('Trap-Bar Jump');
    expect(s?.targets).toBe('power');
    expect(isDepthDrop(s)).toBe(false);
    expect(landingOf('Trap-Bar Jump')).toBeLessThan(landingOf('Depth Drop to Vertical'));
    expect(landingOf('Trap-Bar Jump')).toBeLessThan(landingOf('Approach Bound'));
  });

  it('never picks what is already on the day, and never a depth drop', () => {
    expect(earlyWeekSwap('power', ['Trap-Bar Jump'])?.name).toBe('Approach Bound');
    expect(earlyWeekSwap('power', ['Trap-Bar Jump', 'Approach Bound'])).toBeNull();
  });

  it('knows a depth drop by name, whatever the variation calls itself, and nothing else', () => {
    for (const n of ['Depth Drop to Vertical', 'depth drop', 'Depth-Drop Jump', 'Low Depth Drops']) expect(isDepthDrop({ name: n }), n).toBe(true);
    for (const n of ['Trap-Bar Jump', 'Drop Step', 'Squat to depth', 'Snap Down']) expect(isDepthDrop({ name: n }), n).toBe(false);
    expect(isDepthDrop(null)).toBe(false);
    expect(isDepthDrop({ name: 7 })).toBe(false);
  });
});

describe('generatePlan', () => {
  it('puts no depth drop in weeks 1-4, for every focus and tier', () => {
    for (const tier of TIERS) for (const focus of PILLARS) expect(earlyDrops(generatePlan(screenFor(focus), tier).weeks), `${tier} ${focus}`).toBe(0);
  });

  it('is the legacy plan with only the early depth drops swapped: weeks 5 on are untouched', () => {
    for (const focus of PILLARS) {
      const now = JSON.parse(JSON.stringify(generatePlan(screenFor(focus), 'program_12w').weeks)) as PlanWeek[];
      const was = legacyWeeks(focus, 'program_12w');
      expect(now.slice(EARLY_WEEKS), focus).toEqual(was.slice(EARLY_WEEKS));
      now.slice(0, EARLY_WEEKS).forEach((w, wi) => w.days.forEach((d, di) => d.exercises.forEach((ex, ei) => {
        const old = was[wi].days[di].exercises[ei];
        if (isDepthDrop(old)) expect(ex.name).toBe('Trap-Bar Jump');
        else expect(ex).toEqual(old);
      })));
    }
  });
});

describe('reviseEarlyDepthDrops, a plan bought before today', () => {
  it('takes every depth drop out of weeks 1-4 and replaces it from the same pool, for every focus and tier', () => {
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        const r = reviseEarlyDepthDrops(legacyWeeks(focus, tier));
        expect(r.changed, `${tier} ${focus}`).toBe(true);
        expect(earlyDrops(r.weeks), `${tier} ${focus}`).toBe(0);
        for (const w of r.weeks as PlanWeek[]) {
          for (const d of w.days) {
            const names = d.exercises.map((e) => e.name);
            expect(new Set(names).size, `${tier} ${focus} w${w.week} ${d.day}: no exercise twice on a day`).toBe(names.length);
          }
        }
      }
    }
  });

  it('keeps everything else exactly: every other exercise and dose, the days, themes and blocks, and weeks 5 on', () => {
    for (const focus of PILLARS) {
      const was = legacyWeeks(focus, 'program_12w');
      const now = reviseEarlyDepthDrops(was).weeks as PlanWeek[];
      expect(now).toHaveLength(12);
      expect(now.slice(EARLY_WEEKS)).toEqual(was.slice(EARLY_WEEKS));        // 12-week plans keep weeks 6 and 11 as they were
      now.slice(0, EARLY_WEEKS).forEach((w, wi) => {
        expect({ ...w, days: undefined, revision: undefined }).toEqual({ ...was[wi], days: undefined, revision: undefined });
        w.days.forEach((d, di) => {
          const old = was[wi].days[di];
          expect({ day: d.day, block: d.block }).toEqual({ day: old.day, block: old.block });
          expect(d.exercises).toHaveLength(old.exercises.length);
          d.exercises.forEach((ex, ei) => {
            const o = old.exercises[ei];
            if (!isDepthDrop(o)) expect(ex).toEqual(o);
            else expect(ex).toEqual({ ...PLAN_POOLS.power.find((e) => e.name === 'Trap-Bar Jump'), replaced: 'Depth Drop to Vertical' });
          });
        });
      });
    }
  });

  it('marks each week it changed, once, and only those; the marks are all that sets it apart from a plan made today', () => {
    for (const tier of TIERS) {
      for (const focus of PILLARS) {
        const was = legacyWeeks(focus, tier);
        const now = reviseEarlyDepthDrops(was).weeks as PlanWeek[];
        now.forEach((w, i) => {
          const hadDrop = w.week <= EARLY_WEEKS && was[i].days.some((d) => d.exercises.some(isDepthDrop));
          expect(w.revision, `${tier} ${focus} w${w.week}`).toBe(hadDrop ? PLAN_REVISION : undefined);
        });
        expect(unmarked(now), `${tier} ${focus}`).toEqual(JSON.parse(JSON.stringify(generatePlan(screenFor(focus), tier).weeks)));
      }
    }
  });

  it('is idempotent: a revised plan comes back unchanged, the same value, with nothing to write', () => {
    for (const focus of PILLARS) {
      const once = reviseEarlyDepthDrops(legacyWeeks(focus, 'program_12w'));
      const twice = reviseEarlyDepthDrops(once.weeks);
      expect(twice.changed).toBe(false);
      expect(twice.weeks).toBe(once.weeks);
      expect(planRevisionNote(twice.weeks)).toBe(PLAN_REVISED_NOTE);
    }
  });

  it('leaves a plan with no early depth drop alone (no mark, no note), and does not mutate what it is given', () => {
    const clean = generatePlan(screenFor('mobility'), 'plan_4w').weeks;
    const r = reviseEarlyDepthDrops(clean);
    expect(r.changed).toBe(false);
    expect(r.weeks).toBe(clean);
    expect(planRevisionNote(r.weeks)).toBeNull();
    const legacy = legacyWeeks('power', 'plan_4w');
    const copy = JSON.parse(JSON.stringify(legacy));
    reviseEarlyDepthDrops(legacy);
    expect(legacy).toEqual(copy);
  });

  it('removes a depth drop whose pool it cannot find, rather than guess, and still marks the week', () => {
    const weeks = [{ week: 1, theme: 'Foundation', days: [{ day: 'Mon', block: 'x', exercises: [
      { name: 'Depth-Drop Jump', sets: 3, reps: '3', cue: 'c' }, { name: 'Wall Posture Hold', sets: 3, reps: '30s', cue: 'c', targets: 'posture' },
    ] }] }];
    const r = reviseEarlyDepthDrops(weeks);
    expect(r.changed).toBe(true);
    const w = (r.weeks as PlanWeek[])[0];
    expect(w.days[0].exercises.map((e) => e.name)).toEqual(['Wall Posture Hold']);
    expect(w.revision).toBe(PLAN_REVISION);
  });

  it('finds the pool by name when the stored exercise lost its targets tag', () => {
    const weeks = [{ week: 2, theme: 'Build', days: [{ day: 'Wed', block: 'x', exercises: [{ name: 'Depth Drop to Vertical', sets: 4, reps: '4', cue: 'c' }] }] }];
    const ex = (reviseEarlyDepthDrops(weeks).weeks as PlanWeek[])[0].days[0].exercises[0] as PlanExercise;
    expect(ex.name).toBe('Trap-Bar Jump');
    expect(ex.replaced).toBe('Depth Drop to Vertical');
  });

  it('goes by the week number the plan carries, not its position', () => {
    const drop = { name: 'Depth Drop to Vertical', sets: 4, reps: '4', cue: 'c', targets: 'power' };
    const weeks = [{ week: 6, theme: 'Build', days: [{ day: 'Mon', block: 'x', exercises: [drop] }] }];
    expect(reviseEarlyDepthDrops(weeks).changed).toBe(false);
    const numberless = [{ theme: 'Build', days: [{ day: 'Mon', block: 'x', exercises: [drop] }] }];   // position 1 → week 1
    expect(reviseEarlyDepthDrops(numberless).changed).toBe(true);
  });

  it('never throws on a shape it does not know, and changes nothing there', () => {
    for (const odd of [null, undefined, 7, 'weeks', {}, [], [null], [{ week: 1 }], [{ week: 1, days: [null, { exercises: 'x' }] }]]) {
      const r = reviseEarlyDepthDrops(odd);
      expect(r.changed, JSON.stringify(odd)).toBe(false);
      expect(r.weeks).toBe(odd);
      expect(planRevisionNote(odd)).toBeNull();
    }
  });
});

// MIRROR-COACH P1 review (2026-09-25): these were called "the owner's" words. DECISIONS.md holds neither string —
// decision #3 asks for "an in-app note" and gives no wording — so they are FEL's draft, pinned here so a change is seen,
// and listed for the owner to approve.
describe('the words (FEL\'s draft, for the owner to approve)', () => {
  it('the notes and the sale message say what happened, and none diagnoses, treats or guarantees (lib/share/screen.ts)', () => {
    expect(PLAN_REVISED_NOTE).toBe('We changed your plan: early weeks no longer include depth drops. Nothing to do.');
    expect(PLAN_SALE_PAUSED).toBe('The training plan is being rebuilt; it will be back with real programs.');
    for (const s of [PLAN_REVISED_NOTE, PLAN_REVISED_NOTE_HELD, PLAN_REVISED_NOTE_YOUTH, HELD_LINE, PLAN_SALE_PAUSED]) expect(screenText(s), s).toEqual([]);
    for (const pool of Object.values(PLAN_POOLS)) for (const e of pool) expect(screenText(`${e.name}. ${e.cue}.`), e.name).toEqual([]);
  });
});

// MIRROR-COACH P1 review (2026-09-25), owner decision #6: no depth drops or plyometric primers for an under-18 unless a
// coach assigns them. The revision stopped at week 4 — 18 depth drops were left in weeks 5-12 across the six foci (a
// mobility focus in weeks 6 and 11) — and swapped jumps in for the early ones; GET served them with no age check.
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

describe('the baseline this closes: late depth drops in the 12-week plans', () => {
  it('18 depth drops in weeks 5-12 across the six foci; a mobility focus has them in weeks 6 and 11', () => {
    let late = 0;
    for (const focus of PILLARS) late += legacyWeeks(focus, 'program_12w').filter((w) => w.week > EARLY_WEEKS)
      .reduce((n, w) => n + w.days.reduce((k, d) => k + d.exercises.filter(isDepthDrop).length, 0), 0);
    expect(late).toBe(18);
    const mob = legacyWeeks('mobility', 'program_12w').filter((w) => w.days.some((d) => d.exercises.some(isDepthDrop))).map((w) => w.week);
    expect(mob).toEqual([1, 6, 11]);
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

  it('an adult-revised plan read later by a youth reader loses the jumps the adult revision put in', () => {
    const adult = revisePlan(legacyWeeks('power', 'program_12w'), 'adult');
    expect(all(adult.weeks).some(isPlyometric)).toBe(true);
    const youth = revisePlan(adult.weeks, 'youth');
    expect(all(youth.weeks).filter(isPlyometric)).toEqual([]);
    expect(all(youth.weeks).filter((e) => e.held)).toEqual([]);
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

describe('an ADULT reader\'s plan: early depth drops swapped, later ones held for the protocol', () => {
  it('every 12-week focus: no depth drop in weeks 1-4, and every one after week 4 carries the held mark', () => {
    for (const focus of PILLARS) {
      const r = revisePlan(legacyWeeks(focus, 'program_12w'), 'adult');
      expect(earlyDrops(r.weeks), focus).toBe(0);
      const late = (r.weeks as PlanWeek[]).filter((w) => w.week > EARLY_WEEKS).flatMap((w) => w.days.flatMap((d) => d.exercises)).filter(isDepthDrop);
      expect(late.length, focus).toBeGreaterThan(0);
      for (const e of late) expect(e.held, focus).toBe(HELD_FOR_PROTOCOL);
      expect(planRevisionNote(r.weeks), focus).toBe(PLAN_REVISED_NOTE_HELD);
    }
  });

  it('a 4-week plan has no later weeks: swapped only, and the plain note', () => {
    const r = revisePlan(legacyWeeks('mobility', 'plan_4w'), 'adult');
    expect(planRevisionNote(r.weeks)).toBe(PLAN_REVISED_NOTE);
  });

  it('holding is idempotent and changes nothing but the mark', () => {
    const once = holdLateDepthDrops(legacyWeeks('power', 'program_12w'));
    expect(once.changed).toBe(true);
    expect(holdLateDepthDrops(once.weeks)).toEqual({ weeks: once.weeks, changed: false });
    expect(unmarked(once.weeks)).toEqual(legacyWeeks('power', 'program_12w'));
    const r = revisePlan(legacyWeeks('power', 'program_12w'), 'adult');
    expect(revisePlan(r.weeks, 'adult')).toEqual({ weeks: r.weeks, changed: false });
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
    expect(out.map((p) => p.revisionNote)).toEqual([PLAN_REVISED_NOTE_HELD, PLAN_REVISED_NOTE, null]);
    for (const p of out) expect(earlyDrops(p.weeks)).toBe(0);
    expect(out.map(({ id, tier, focus, createdAt }) => ({ id, tier, focus, createdAt }))).toEqual(
      mk().map(({ id, tier, focus, createdAt }) => ({ id, tier, focus, createdAt })));
    for (const r of rows) expect(earlyDrops(r.weeks), r.id).toBe(0);         // and it is stored
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

  it('a youth reader\'s plans are revised for youth, and stored that way', async () => {
    const { db, rows } = fakeDb(mk());
    const out = await revisePlansOnRead(db, 'u1', rows.map((r) => ({ ...r })), 'youth');
    for (const p of out) expect(all(p.weeks).filter(isPlyometric), p.id).toEqual([]);
    for (const r of rows) expect(all(r.weeks).filter(isPlyometric), r.id).toEqual([]);
    expect(out.map((p) => p.revisionNote)).toEqual([PLAN_REVISED_NOTE_YOUTH, PLAN_REVISED_NOTE_YOUTH, PLAN_REVISED_NOTE_YOUTH]);
  });

  it('never breaks the read: if the write fails the plan is still shown revised with its note, and the next read tries again', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db, writes, rows } = fakeDb(mk(), true);
    const out = await revisePlansOnRead(db, 'u1', rows.map((r) => ({ ...r })), 'adult');
    expect(out[0].revisionNote).toBe(PLAN_REVISED_NOTE_HELD);
    expect(earlyDrops(out[0].weeks)).toBe(0);
    expect(earlyDrops(rows[0].weeks)).toBe(1);                              // not stored
    await revisePlansOnRead(db, 'u1', rows.map((r) => ({ ...r })), 'adult');
    expect(writes).toHaveLength(4);                                          // tried again
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
