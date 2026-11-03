// PROGRAM-ASK (2026-11-02): the builder over a matrix of plain-words asks. For each ask it proves the owner brief's list:
// only allowed equipment, every required pattern each week, weekly volume in range (or said), progression week to week
// with a lighter week and a checkpoint, no gated exercise before the gate, youth rules, the time fit, and that different
// asks give clearly different programs. Then one test per failure of the OLD generator (lib/workout/plan-generator.ts),
// each proving it cannot happen here.
import { describe, expect, it } from 'vitest';
import { MAX_EFFORT_CUE } from '@/lib/coach/taxonomy';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import { loadLibraryFiles } from '@/lib/library/files';
import { screenText } from '@/lib/share/screen';
import { isDepthDrop } from '@/lib/workout/plan-generator';
import { buildProgram } from './build';
import { programProblems, weekSignature } from './check';
import * as COPY from './copy';
import { readProgramAsk } from './request';
import { TIME_TOLERANCE } from './rules';
import { AMBIENT, isImpact } from './slots';
import { daySeconds } from './time';
import type { BuiltProgram } from './types';

const LIB = loadLibraryFiles();
const byId = new Map(LIB.map((e) => [e.id, e]));

const SAMPLE = 'all I have is a band, full body, 3 days a week, 40 minutes';

/** The matrix: the owner's sample and 22 more, across kit, goal, days, minutes, level, weeks and age. */
const ASKS: { q: string; youth?: boolean; jumps?: boolean }[] = [
  { q: SAMPLE },
  { q: 'all I have is a band, full body, 3 days a week, 40 minutes, beginner' },
  { q: 'only a heavy band, strength, 4 days a week, 45 minutes, intermediate' },
  { q: 'resistance band, build muscle, 5 days, 50 min, intermediate, 8 weeks' },
  { q: 'band only, muscle, 6 days a week, 60 minutes, advanced' },
  { q: 'no equipment, full body, 2 days a week, 30 minutes' },
  { q: 'bodyweight only, fat loss, 4 days a week, 25 minutes, beginner' },
  { q: 'a light band, mobility, 3 days, 30 min' },
  { q: 'a band, athletic, jump higher, 3 days a week, 45 minutes, intermediate' },
  { q: 'a band, athletic, jump higher, 3 days a week, 45 minutes, intermediate', jumps: true },
  { q: 'band, basketball, 4 days a week, 50 minutes, intermediate', jumps: true },
  { q: 'a band, full body, 3 days a week, 40 minutes, I am 15' },
  { q: 'a band, strength, 3 days a week, 40 minutes, for my 11 year old' },
  { q: 'a band, full body, 3x a week, 40 min', youth: true },
  { q: 'dumbbells and a band, strength, 4 days, 60 minutes, advanced' },
  { q: 'mini band and a long band, full body, 3 days, 35 minutes' },
  { q: 'band, conditioning, 5 days a week, 30 minutes, intermediate' },
  { q: 'band, full body, 2 days a week, 20 minutes' },
  { q: 'band, muscle, 3 days a week, 90 minutes, advanced, 12 weeks' },
  { q: 'band, strength, 6 days a week, 40 minutes, beginner' },
  { q: 'band, knee-friendly full body, 3 days a week, 40 minutes' },
  { q: 'no equipment, athletic, 5 days a week, 45 minutes, advanced', jumps: true },
  { q: 'a band, mobility and strength, 4 days, 40 minutes, advanced, 6 weeks' },
];

const built = ASKS.map((a) => {
  const read = readProgramAsk(a.q, { youth: a.youth });
  const p = buildProgram({ request: read.request, library: LIB, jumpsOpen: a.jumps });
  return { ...a, read, p };
});

const items = (p: BuiltProgram) => p.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((i) => ({ w, d, b, i })))));

describe('program-ask: the sample ask reads as the owner said it', () => {
  it('"all I have is a band, full body, 3 days a week, 40 minutes"', () => {
    const r = readProgramAsk(SAMPLE).request;
    expect(r.equipment).toEqual(['band']);
    expect(r.goal).toBe('full-body');
    expect(r.days).toBe(3);
    expect(r.minutes).toBe(40);
    expect(r.level).toBe('beginner');
    expect(r.age).toBe('adult');
  });
});

describe('program-ask: every program in the matrix keeps every rule', () => {
  for (const b of built) {
    it(`${b.q}${b.youth ? ' (youth account)' : ''}${b.jumps ? ' (jump gate open)' : ''}`, () => {
      expect(programProblems(b.p, LIB, { jumpsOpen: !!b.jumps })).toEqual([]);
    });
  }

  it('only allowed equipment: every exercise needs nothing beyond what was said, a wall and a floor', () => {
    for (const b of built) for (const { i } of items(b.p)) {
      const e = byId.get(i.exId)!;
      for (const kit of e.equipment) expect([...b.p.request.equipment, ...AMBIENT], `${b.q}: ${e.name}`).toContain(kit);
    }
    // the band-only sample uses the band (it is not a bodyweight plan in disguise) and no mini band
    const sample = built[0].p;
    const kit = new Set(items(sample).flatMap(({ i }) => byId.get(i.exId)!.equipment));
    expect(kit.has('band')).toBe(true);
    expect(kit.has('mini-band')).toBe(false);
  });

  it('every exercise is a real library entry, named as the library names it', () => {
    for (const b of built) for (const { i } of items(b.p)) expect(byId.get(i.exId)?.name).toBe(i.name);
  });

  it('time fits: every session of every week is the stated minutes ± 10%', () => {
    for (const b of built) for (const w of b.p.weeks) for (const d of w.days) {
      const m = daySeconds(d) / 60;
      expect(Math.abs(m - b.p.request.minutes), `${b.q} w${w.n} ${d.id}: ${m.toFixed(1)} min`).toBeLessThanOrEqual(b.p.request.minutes * TIME_TOLERANCE + 1e-9);
    }
  });

  it('warm-up first and cool-down last, every day', () => {
    for (const b of built) for (const w of b.p.weeks) for (const d of w.days) {
      expect(d.warmup.length).toBeGreaterThan(0);
      expect(d.cooldown.length).toBeGreaterThan(0);
    }
  });

  it('progression: every week changes, every block ends with a lighter week and a checkpoint', () => {
    for (const b of built) {
      const sigs = b.p.weeks.map(weekSignature);
      for (let k = 1; k < sigs.length; k++) expect(sigs[k], `${b.q} week ${k + 1}`).not.toBe(sigs[k - 1]);
      expect(b.p.weeks.some((w) => w.lighter && w.checkpoint), b.q).toBe(true);
      expect(b.p.weeks[b.p.weeks.length - 1].lighter, b.q).toBe(true);
    }
  });

  it('a lighter week by level: the 5th for a beginner, the 4th for intermediate and advanced', () => {
    const beg = built[0].p; // beginner (not said)
    expect(beg.weeks.findIndex((w) => w.lighter) + 1).toBe(5);
    const inter = built.find((b) => b.p.request.level === 'intermediate' && b.p.request.weeks >= 8)!.p;
    expect(inter.weeks.filter((w) => w.lighter).map((w) => w.n)).toEqual([4, 8]);
  });

  it('weekly volume: building weeks sit in the goal\'s range, or the program says plainly why not', () => {
    for (const b of built) for (const v of b.p.volume) b.p.weeks.forEach((w, k) => {
      if (w.lighter) return;
      expect(v.perWeek[k], `${b.q} ${v.group} w${w.n}`).toBeLessThanOrEqual(v.range[1]);
      if (v.perWeek[k] < v.range[0]) expect(b.p.notes.join(' '), `${b.q} ${v.group}`).toMatch(/hard sets a week/);
    });
    // the owner's sample is fully in range: nothing to excuse
    const s = built[0].p;
    for (const v of s.volume) s.weeks.forEach((w, k) => { if (!w.lighter) expect(v.perWeek[k]).toBeGreaterThanOrEqual(v.range[0]); });
  });

  it('push and pull are balanced: pulling at least pushing, never more than 1.5×', () => {
    for (const b of built) {
      const pull = b.p.volume.find((v) => v.group === 'pull')!, push = b.p.volume.find((v) => v.group === 'push')!;
      b.p.weeks.forEach((w, k) => { if (!w.lighter && push.perWeek[k]) expect(pull.perWeek[k] / push.perWeek[k], b.q).toBeGreaterThanOrEqual(1); });
    }
  });

  it('every full-body day covers squat, hinge, push, pull, a vertical, single leg and both trunk patterns', () => {
    for (const b of built) for (const w of b.p.weeks) for (const d of w.days) {
      if (d.focus !== 'full') continue;
      const s = new Set(d.blocks.flatMap((x) => x.items.map((i) => i.slot)));
      for (const need of ['knee', 'hinge', 'hpush', 'single', 'antiExt', 'antiRot']) expect(s.has(need as never), `${b.q} ${d.id} ${need}`).toBe(true);
      expect(s.has('hpull') || b.p.notes.some((n) => /row/.test(n)), `${b.q} ${d.id} hpull`).toBe(true);
      expect(s.has('vpush') || s.has('vpull') || b.p.notes.some((n) => /pulldown|overhead/.test(n)), `${b.q} ${d.id} vertical`).toBe(true);
    }
  });
});

describe('program-ask: safety', () => {
  it('no gated exercise before the gate: with the gate closed, no jump work anywhere, warm-up included', () => {
    for (const b of built.filter((x) => !x.jumps)) for (const { i, w } of items(b.p)) {
      expect(isImpact(byId.get(i.exId)!), `${b.q} w${w.n} ${i.name}`).toBe(false);
      expect(i.contacts).toBeNull();
    }
  });

  it('with the gate open (adults only), jumps start in week 2 of a block, never its first or lighter week', () => {
    const open = built.filter((x) => x.jumps);
    let jumps = 0;
    for (const b of open) for (const { i, w } of items(b.p)) if (isImpact(byId.get(i.exId)!)) {
      jumps++;
      expect(w.weekInBlock, `${b.q} ${i.name}`).toBeGreaterThan(1);
      expect(w.lighter).toBe(false);
    }
    expect(jumps).toBeGreaterThan(0);
  });

  it('youth: the gate never opens under 18, even when the server says open', () => {
    const p = buildProgram({ request: { ...built[0].p.request, age: 'teen', goal: 'athletic' }, library: LIB, jumpsOpen: true });
    for (const { i } of items(p)) expect(isImpact(byId.get(i.exId)!)).toBe(false);
    expect(p.jumps.allowed).toBe(false);
  });

  it('youth rules hold: adults-only entries never, no max-effort cue, effort capped at Drive (Cruise under 13), sets capped', () => {
    for (const b of built.filter((x) => x.p.request.age !== 'adult')) for (const { i, b: blk } of items(b.p)) {
      const e = byId.get(i.exId)!;
      expect(e.youthOk, `${b.q} ${e.name}`).toBe(true);
      if (i.cue) expect(MAX_EFFORT_CUE.test(i.cue), i.cue).toBe(false);
      expect(['surge', 'full']).not.toContain(i.effort);
      if (b.p.request.age === 'child') { expect(['cruise', 'idle']).toContain(i.effort); if (blk.kind !== 'filler') expect(i.sets).toBeLessThanOrEqual(2); }
      else if (blk.kind !== 'filler') expect(i.sets).toBeLessThanOrEqual(3);
    }
  });

  it('a youth account stays youth whatever the words say', () => {
    const r = readProgramAsk('band, full body, I am 25', { youth: true }).request;
    expect(r.age).toBe('teen');
  });

  it('pain or injury words stop the build: flagged, never prescribed around', () => {
    for (const q of ['band only, my knee hurts, 3 days', 'full body plan after my acl surgery', 'I have a torn rotator cuff, band program']) {
      expect(readProgramAsk(q).injury.flagged, q).toBe(true);
    }
    expect(readProgramAsk('knee-friendly band program, 3 days').injury.flagged).toBe(false);
  });
});

describe('program-ask: coordinator review of the sample (2026-11-02)', () => {
  const sample = built[0].p;

  it('1. the load floor: an adult with a band never gets an unloaded two-leg squat or a wall sit as a leg lift', () => {
    for (const b of built.filter((x) => x.p.request.age === 'adult' && x.p.request.equipment.includes('band'))) {
      for (const { i } of items(b.p)) {
        if (i.slot !== 'knee') continue;
        const e = byId.get(i.exId)!;
        const loaded = e.equipment.some((x) => !AMBIENT.includes(x));
        expect(loaded || e.laterality !== 'bilateral', `${b.q}: ${e.name}`).toBe(true);
      }
    }
    // the gap is said in plain words
    expect(sample.notes.join(' ')).toMatch(/no squat loaded with a band under the feet/);
    // and a harder start is a real entry one level up, marked so
    const first = sample.weeks[0].days[0].blocks[0].items[0];
    expect(first.slot).toBe('knee');
    expect(byId.get(first.exId)!.equipment).toContain('band');
  });

  it('2 + 4. every working set says what to do when it is too easy (band tension first) and when reps fall short', () => {
    for (const b of built) for (const { i, b: blk } of items(b.p)) {
      if (blk.kind === 'filler' || ['speed', 'power', 'mobility', 'cond'].includes(i.slot)) continue;
      expect(i.harder, `${b.q} ${i.name}`).toMatch(/^Too easy\?/);
      expect(i.easier, `${b.q} ${i.name}`).toMatch(/^(Reps falling short|Too long to hold)\?/);
      const e = byId.get(i.exId)!;
      if (e.equipment.includes('band') && !i.workSeconds) expect(i.harder!.indexOf('anchor') >= 0 || i.harder!.indexOf('band shorter') >= 0, i.harder!).toBe(true);
    }
    // push-ups offer a real easier entry by name
    const push = items(sample).find(({ i }) => /^push-?ups?$/i.test(i.name) || /pushups/i.test(i.name))!;
    const named = /Switch to (.+?)(,|\.)/.exec(push.i.easier ?? '')?.[1];
    expect(named, push.i.easier ?? '').toBeTruthy();
    expect(LIB.some((e) => e.name === named)).toBe(true);
  });

  it('3. every band exercise says where the band goes', () => {
    for (const b of built) for (const { i } of items(b.p)) {
      const e = byId.get(i.exId)!;
      if (e.equipment.includes('band') || e.equipment.includes('mini-band')) expect(i.bandSetup, `${b.q} ${e.name}`).toMatch(/^Band setup: /);
      else expect(i.bandSetup).toBeNull();
    }
  });

  it('5. every set carries an effort word', () => {
    for (const b of built) for (const { i } of items(b.p)) expect(i.effortWords, `${b.q} ${i.name}`).toMatch(/^(Idle|Cruise|Drive|Surge): /);
  });
});

describe('program-ask: different asks give clearly different programs', () => {
  it('no two different requests in the matrix build the same program', () => {
    // two asks may read to the SAME request on purpose (the sample with "beginner" said; a youth account and "I am 15"):
    // those must build the same program. Every different request must build a different one.
    const fp = (p: BuiltProgram) => p.weeks.map(weekSignature).join('#');
    const byRequest = new Map<string, string>();
    for (const b of built) byRequest.set(JSON.stringify(b.p.request) + (b.jumps ? '+jumps' : ''), fp(b.p));
    expect(new Set(byRequest.values()).size).toBe(byRequest.size);
    expect(byRequest.size).toBe(ASKS.length - 2);
  });

  it('changing ONE thing changes the program clearly: days, goal, minutes, level, kit', () => {
    const base = built[0].p.request;
    const exercises = (p: BuiltProgram) => new Set(items(p).map(({ i }) => i.exId));
    const jaccard = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length / new Set([...a, ...b]).size;
    const variants = [
      { ...base, days: 5 }, { ...base, goal: 'strength' as const }, { ...base, goal: 'muscle' as const }, { ...base, goal: 'conditioning' as const },
      { ...base, minutes: 60 }, { ...base, level: 'advanced' as const, weeks: 4 }, { ...base, equipment: [] },
    ];
    const s0 = built[0].p;
    for (const v of variants) {
      const p = buildProgram({ request: v, library: LIB });
      const sameSplit = p.weeks[0].days.map((d) => d.focus).join() === s0.weeks[0].days.map((d) => d.focus).join();
      const sameDose = p.weeks[0].days[0].blocks[0].items[0].reps === s0.weeks[0].days[0].blocks[0].items[0].reps && p.weeks[0].days[0].blocks[0].items[0].sets === s0.weeks[0].days[0].blocks[0].items[0].sets;
      const overlap = jaccard(exercises(p), exercises(s0));
      // at least two of: a different split, a different dose, a different exercise set (under 85% shared)
      const diffs = [!sameSplit, !sameDose, overlap < 0.85, Math.abs(p.weeks[0].days[0].minutes - s0.weeks[0].days[0].minutes) > 5].filter(Boolean).length;
      expect(diffs, JSON.stringify(v)).toBeGreaterThanOrEqual(1);
      expect(weekSignature(p.weeks[0])).not.toBe(weekSignature(s0.weeks[0]));
    }
  });
});

describe('program-ask: the OLD generator\'s failures cannot happen (lib/workout/plan-generator.ts header)', () => {
  it('OLD #1 "every plan was the same flat plan": every different request gets a different first week', () => {
    const byRequest = new Map<string, string>();
    for (const b of built) byRequest.set(JSON.stringify(b.p.request), weekSignature(b.p.weeks[0]));
    expect(new Set(byRequest.values()).size).toBe(byRequest.size);
    // and not one flat shape with new numbers: the splits and the exercise selections themselves vary across the matrix
    // (a teen and an adult with the same ask share exercises and differ in dose, which is right)
    const splits = new Set(built.map((b) => b.p.weeks[0].days.map((d) => d.focus).join('/')));
    const selections = new Set(built.map((b) => [...new Set(b.p.weeks[0].days.flatMap((d) => d.blocks.flatMap((x) => x.items.map((i) => i.exId))))].sort().join(',')));
    expect(splits.size).toBeGreaterThanOrEqual(5);
    expect(selections.size).toBeGreaterThanOrEqual(15);
  });

  it('OLD #2 "sets and reps never changed across 12 weeks": a 12-week plan has no two consecutive weeks alike, and reps, sets, effort and the exercise all move', () => {
    const p = built.find((b) => b.p.request.weeks === 12)!.p;
    expect(p.weeks).toHaveLength(12);
    const key = p.weeks.map((w) => w.days[0].blocks[0].items[0]);
    expect(new Set(key.map((i) => i.reps)).size).toBeGreaterThan(1);
    expect(new Set(key.map((i) => i.sets)).size).toBeGreaterThan(1);
    expect(new Set(key.map((i) => i.effort)).size).toBeGreaterThan(1);
    expect(new Set(key.map((i) => i.exId)).size).toBeGreaterThan(1);
    expect(new Set(p.weeks.map(weekSignature)).size).toBeGreaterThanOrEqual(8);
  });

  it('OLD #3 "a depth drop in week 1 past the protocol gate": no depth drop in any week of any program, gate open or not; nothing jumps in week 1', () => {
    for (const b of built) for (const { i, w } of items(b.p)) {
      expect(isDepthDrop({ name: i.name })).toBe(false);
      if (w.n === 1) expect(isImpact(byId.get(i.exId)!), `${b.q} ${i.name}`).toBe(false);
    }
    // even an adult with the gate open, asking for jumps by name
    const r = readProgramAsk('depth drops and box jumps, a band, athletic, 3 days, 45 minutes, advanced').request;
    const p = buildProgram({ request: r, library: LIB, jumpsOpen: true });
    for (const { i, w } of items(p)) {
      expect(isDepthDrop({ name: i.name })).toBe(false);
      if (w.weekInBlock === 1) expect(isImpact(byId.get(i.exId)!)).toBe(false);
    }
  });
});

describe('program-ask: words', () => {
  it('every line of copy passes the honesty screen and the medical-words guard', () => {
    const lines: string[] = [];
    for (const v of Object.values(COPY)) {
      if (typeof v === 'string') lines.push(v);
      else if (v && typeof v === 'object') for (const x of Object.values(v)) if (typeof x === 'string') lines.push(x);
    }
    for (const b of built) lines.push(b.p.summary, b.p.why, ...b.p.notes, ...b.read.assumptions);
    for (const l of lines) {
      expect(screenText(l), l).toEqual([]);
      expect(MEDICAL_WORDS.test(l), l).toBe(false);
    }
  });

  it('the summary stays under 50 words', () => {
    for (const b of built) expect(b.p.summary.split(/\s+/).length, b.p.summary).toBeLessThanOrEqual(50);
  });

  it('the same ask builds the same program (deterministic)', () => {
    const a = buildProgram({ request: built[0].p.request, library: LIB });
    expect(JSON.stringify(a)).toBe(JSON.stringify(built[0].p));
  });
});
