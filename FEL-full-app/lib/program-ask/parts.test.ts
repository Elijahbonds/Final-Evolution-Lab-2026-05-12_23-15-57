// PROGRAM-ASK (2026-11-02): the parts around the builder — the ask parser and its chips, the AI guards (the model can never
// set a dose, add an exercise or bypass a rule), the checkpoint, the phone's save, and the session-player adapter.
import { describe, expect, it } from 'vitest';
import { MAX_EFFORT_CUE } from '@/lib/coach/taxonomy';
import { parseAsk } from '@/lib/library/ask/parse';
import { loadLibraryFiles } from '@/lib/library/files';
import { fromProgram } from '@/lib/session-player/fromProgram';
import { totalSets } from '@/lib/session-player/model';
import { cleanWhy, parsePolish } from './ai';
import { programWeekAccess, PROGRAM_ASK_ACCESS } from './access';
import { buildProgram } from './build';
import { programProblems } from './check';
import { checkpointDecision, isHarder, plannedWeeks, positionIn } from './checkpoint';
import { addDecision, markDone, PROGRAM_DEVICE_KEY, readSaved, saveProgram } from './device';
import { applyEdits, readProgramAsk, wantsProgram } from './request';

const LIB = loadLibraryFiles();
const SAMPLE = 'all I have is a band, full body, 3 days a week, 40 minutes';
const sample = buildProgram({ request: readProgramAsk(SAMPLE).request, library: LIB });

describe('the ask parser', () => {
  it('reads plain words into a request', () => {
    const cases: [string, Partial<ReturnType<typeof readProgramAsk>['request']>][] = [
      ['only a heavy band, strength, 4 days a week, 45 minutes, intermediate', { equipment: ['band'], tension: 'heavy', goal: 'strength', days: 4, minutes: 45, level: 'intermediate' }],
      ['no equipment, fat loss, 3x a week, half an hour', { equipment: [], goal: 'conditioning', days: 3, minutes: 30 }],
      ['dumbbells and a band, build muscle, 5 days, an hour, advanced, 8 weeks', { equipment: ['band', 'dumbbell'], goal: 'muscle', days: 5, minutes: 60, level: 'advanced', weeks: 8 }],
      ['I want to jump higher, band, 3 days', { goal: 'athletic', equipment: ['band'] }],
      ['basketball program with a mini band', { goal: 'sport', sport: 'basketball', equipment: ['mini-band'] }],
      ['band, full body, 3 days, for my 11 year old', { age: 'child' }],
      ['band, full body, 3 days, I am 16', { age: 'teen' }],
      ['band program for two months', { weeks: 8 }],
    ];
    for (const [q, want] of cases) expect(readProgramAsk(q).request, q).toMatchObject(want);
  });

  it('defaults are filled AND said: beginner, 3 days, 40 minutes, one medium band (not a mini band too)', () => {
    const r = readProgramAsk('a band');
    expect(r.request).toMatchObject({ level: 'beginner', days: 3, minutes: 40, equipment: ['band'], tension: null });
    const a = r.assumptions.join(' ');
    expect(a).toMatch(/medium long loop band — not a mini band/);
    expect(a).toMatch(/beginner/);
    expect(r.assumptions.every((x) => x.startsWith('assumption: '))).toBe(true);
    expect(r.chips.filter((c) => c.assumed).map((c) => c.field)).toEqual(expect.arrayContaining(['days', 'minutes', 'level', 'bands', 'goal']));
  });

  it('a chip changes in one tap: days 3 → 4 by its + step, clamped, and its assumption line goes', () => {
    const r = readProgramAsk('a band');
    const days = r.chips.find((c) => c.field === 'days')!;
    expect(days.step).toMatchObject({ value: 3, by: 1 });
    const e = applyEdits(r, { days: days.step!.value + days.step!.by });
    expect(e.request.days).toBe(4);
    expect(e.assumptions.some((a) => /days a week/.test(a))).toBe(false);
    expect(applyEdits(r, { days: 99, minutes: 3, weeks: 'x' as unknown as number }).request).toMatchObject({ days: 6, minutes: 20, weeks: r.request.weeks });
  });

  it('an edit can never make a youth account an adult', () => {
    const r = readProgramAsk('a band', { youth: true });
    expect(r.request.age).toBe('teen');
    expect(applyEdits(r, { age: 'adult' }, { youth: true }).request.age).toBe('teen');
    expect(r.chips.find((c) => c.field === 'age')!.locked).toBe(true);
  });

  it('knows a program question from an exercise question (the library Ask door)', () => {
    expect(wantsProgram('give me a full body program with a band, 3 days a week')).toBe(true);
    expect(wantsProgram('band rows')).toBe(false);
    expect(wantsProgram('something easier than a pistol squat')).toBe(false);
  });

  it('the library Ask now reads "a band" (it read no equipment before: the alias "bands" became "bandss?")', () => {
    expect(parseAsk('all I have is a band, full body').filters.equipment).toEqual(['band']);
    expect(parseAsk('just bands').filters.equipment).toEqual(['band']);
    expect(parseAsk('trap bar deadlift').filters.equipment).toEqual(['trap-bar']);
  });
});

describe('the AI polish: guards enforced in code', () => {
  it('drops any pick that is not one of the choice point\'s own options, and any unknown choice key', () => {
    const c = sample.choices[0];
    const other = sample.choices.find((x) => x.slot !== c.slot)!;
    const reply = JSON.stringify({ picks: { [c.key]: c.options[1].id, 'nope/knee/0': c.options[0].id, [other.key]: c.options[0].id }, why: 'x' });
    const p = parsePolish(reply, sample)!;
    expect(p.picks).toEqual({ [c.key]: c.options[1].id });
  });

  it('a valid pick is rebuilt by the rules: same dose, same structure, still passes every check', () => {
    const c = sample.choices.find((x) => x.options.length > 1)!;
    const again = buildProgram({ request: sample.request, library: LIB, picks: { [c.key]: c.options[1].id } });
    expect(programProblems(again, LIB, { jumpsOpen: false })).toEqual([]);
    const strip = (p: typeof sample) => p.weeks.map((w) => w.days.map((d) => d.blocks.map((b) => b.items.map((i) => `${i.sets}:${i.reps}:${i.workSeconds}:${i.restSeconds}:${i.effort}`).join()).join()).join()).join();
    expect(strip(again)).toBe(strip(sample));
    expect(again.weeks[0].days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((i) => i.exId)))).toContain(c.options[1].id);
  });

  it('a pick that is not an option is ignored by the builder too (a forged picks map)', () => {
    const c = sample.choices[0];
    const forged = buildProgram({ request: sample.request, library: LIB, picks: { [c.key]: 'depth-drop' } });
    expect(JSON.stringify(forged.weeks)).toBe(JSON.stringify(sample.weeks));
  });

  it('the why paragraph: medical words, doses, invented exercise names and youth max-effort words are dropped', () => {
    expect(cleanWhy('Three full-body days that work every pattern, with rows to balance the pushing.', sample)).toBeTruthy();
    expect(cleanWhy('This will treat your back pain.', sample)).toBeNull();
    expect(cleanWhy('Do 3 sets of 12 reps.', sample)).toBeNull();
    expect(cleanWhy('Built around the "Barbell Back Squat".', sample)).toBeNull();
    expect(cleanWhy(`Built around the "${sample.weeks[0].days[0].blocks[0].items[0].name}".`, sample)).toBeTruthy();
    const teen = buildProgram({ request: { ...sample.request, age: 'teen' }, library: LIB });
    expect(cleanWhy('Go all-out on every set.', teen)).toBeNull();
    expect(cleanWhy('x'.repeat(700), sample)).toBeNull();
    expect(parsePolish('not json', sample)).toBeNull();
  });
});

describe('the checkpoint', () => {
  it('advance only on a yes; pain never moves up; a block repeats once at most', () => {
    expect(checkpointDecision({ hitTargets: true, pain: false, repeats: 0 }).kind).toBe('advance');
    expect(checkpointDecision({ hitTargets: false, pain: false, repeats: 0 }).kind).toBe('repeat');
    expect(checkpointDecision({ hitTargets: false, pain: false, repeats: 1 }).kind).toBe('advance');
    for (const hit of [true, false, null]) expect(isHarder(checkpointDecision({ hitTargets: hit, pain: true, repeats: 0 }).kind)).toBe(false);
    expect(isHarder(checkpointDecision({ hitTargets: true, pain: false, painDecision: 'step_down_flag_coach', repeats: 0 }).kind)).toBe(false);
    expect(checkpointDecision({ hitTargets: true, pain: false, lowDays: 3, repeats: 0 }).kind).toBe('repeat');
  });

  it('a repeat runs the block again; the position walks sessions in order and stops at an unanswered checkpoint', () => {
    const len = sample.weeks.length;
    const rep = plannedWeeks(sample, [{ afterWeek: len, kind: 'repeat' }]);
    expect(rep).toHaveLength(len * 2);
    expect(rep[len].days[0].id).toBe(`w${len + 1}:d1`);
    const done: Record<string, string> = {};
    for (const w of sample.weeks) for (const d of w.days) done[d.id] = 'x';
    const pos = positionIn(sample.weeks, done, []);
    expect(pos.pendingCheckpoint?.n).toBe(len);
    expect(pos.week).toBeNull();
    expect(positionIn(sample.weeks, {}, []).week?.n).toBe(1);
  });
});

describe('saved on the phone', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m }; };

  it('saves, marks done, keeps decisions; a corrupt value reads as nothing', () => {
    const s = mem();
    expect(saveProgram(s, SAMPLE, {}, sample)?.programId).toBe(sample.id);
    markDone(s, 'w1:d1');
    markDone(s, 'not-a-session');
    addDecision(s, { afterWeek: 5, kind: 'advance' });
    const v = readSaved(s)!;
    expect(Object.keys(v.done)).toEqual(['w1:d1']);
    expect(v.decisions).toEqual([{ afterWeek: 5, kind: 'advance' }]);
    expect(v.program?.id).toBe(sample.id);
    s.setItem(PROGRAM_DEVICE_KEY, '{oops');
    expect(readSaved(s)).toBeNull();
    expect(readSaved(null)).toBeNull();
  });

  it('a throwing storage never throws out', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(readSaved(bad)).toBeNull();
    expect(saveProgram(bad, SAMPLE, {}, sample)).toBeNull();
  });
});

describe('free or FEL Pro: the flag defaults to the signature programs\' free week (an owner call)', () => {
  it('week 1 free, later weeks with FEL Pro; "all-free" opens every week', () => {
    expect(PROGRAM_ASK_ACCESS).toBe('like-signature');
    expect(programWeekAccess(1, false)).toBe('free');
    expect(programWeekAccess(2, false)).toBe('locked');
    expect(programWeekAccess(2, true)).toBe('pro');
    expect(programWeekAccess(2, false, 'all-free')).toBe('free');
  });
});

describe('day 1 in the session player (lib/session-player/fromProgram.ts)', () => {
  const day = sample.weeks[0].days[0];
  const s = fromProgram(day, { title: 'Band full body', clips: {} });

  it('warm-up first, cool-down last, every working set present, pairs alternate set for set', () => {
    expect(s.steps[0].exId.startsWith('warmup:')).toBe(true);
    expect(s.steps[s.steps.length - 1].exId.startsWith('cooldown:')).toBe(true);
    const work = day.blocks.reduce((a, b) => a + b.items.reduce((x, i) => x + i.sets, 0), 0);
    expect(totalSets(s) - day.warmup.length - day.cooldown.length).toBe(work);
    const pair = day.blocks[0];
    const firstTwo = s.steps.slice(day.warmup.length, day.warmup.length + 2);
    expect(firstTwo.map((x) => x.exId)).toEqual(pair.items.map((i) => i.exId));
    expect(firstTwo[0].restSeconds).toBe(0);
    expect(firstTwo[1].restSeconds).toBe(pair.items[1].restSeconds);
  });

  it('carries the band setup, the effort-adjust line and the library words', () => {
    const row = s.steps.find((x) => /Band Row/.test(x.name))!;
    expect(row.setup).toMatch(/^Band setup: /);
    expect(row.note).toMatch(/Too easy\?/);
  });
});

describe('PROGRAM-ASK-2: the authored band and home entries (data/library/authored/b5-program-ask.json)', () => {
  const NEW = ['band-under-feet-squat', 'band-front-squat', 'band-split-squat', 'band-rear-foot-elevated-split-squat', 'pike-push-up', 'step-in-mountain-climber'];
  const byId = new Map(LIB.map((e) => [e.id, e]));

  it('are drafts, youth-safe, and every regression / progression link resolves to a real entry', () => {
    for (const id of NEW) {
      const e = byId.get(id)!;
      expect(e, id).toBeTruthy();
      expect(e.review.status).toBe('draft');
      expect(e.youthOk).toBe(true);
      for (const c of [...e.cues, ...e.faults.map((f) => f.fix), e.setup]) expect(MAX_EFFORT_CUE.test(c), c).toBe(false);
      expect(e.regressionId && byId.has(e.regressionId), `${id} regression`).toBe(true);
      expect(e.progressionId && byId.has(e.progressionId), `${id} progression`).toBe(true);
    }
  });

  it('the builder prefers them: the sample\'s squats are both band-loaded, a no-equipment plan presses overhead, a beginner finisher stays on the floor', () => {
    const knee = sample.weeks[0].days.flatMap((d) => d.blocks.flatMap((b) => b.items.filter((i) => i.slot === 'knee').map((i) => i.exId)));
    expect(new Set(knee)).toEqual(new Set(['band-under-feet-squat', 'band-front-squat']));
    const bw = buildProgram({ request: readProgramAsk('no equipment, full body, 3 days a week, 40 minutes').request, library: LIB });
    expect(bw.weeks[0].days.some((d) => d.blocks.some((b) => b.items.some((i) => i.exId === 'pike-push-up')))).toBe(true);
    const fin = sample.weeks[0].days[0].blocks.find((b) => b.kind === 'filler')!;
    expect(fin.items.map((i) => i.exId)).toContain('step-in-mountain-climber');
  });

  it('a later block climbs onto the band split squat ladder', () => {
    const long = buildProgram({ request: { ...sample.request, level: 'intermediate', weeks: 8 }, library: LIB });
    const names = long.weeks.filter((w) => w.block === 2).flatMap((w) => w.days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((i) => i.exId))));
    expect(names.some((id) => ['band-split-squat', 'band-rear-foot-elevated-split-squat', 'band-front-squat'].includes(id))).toBe(true);
  });
});

describe('PROGRAM-ASK-2: "What bands do you have?"', () => {
  it('reads a band set, offers it as a chip, and the chip edits it', () => {
    const r = readProgramAsk('I have light, medium and heavy bands, full body, 3 days');
    expect(r.request.bands).toEqual(['light', 'medium', 'heavy']);
    expect(r.assumptions.some((a) => /medium long loop band/.test(a))).toBe(false);
    expect(readProgramAsk('a set of resistance bands').request.bands).toEqual(['light', 'medium', 'heavy']);
    expect(readProgramAsk('a heavy band').request).toMatchObject({ tension: 'heavy', bands: [] });
    const one = readProgramAsk('a band');
    const chip = one.chips.find((c) => c.field === 'bands')!;
    expect(chip.options!.map((o) => o.value)).toContain('light,heavy');
    expect(applyEdits(one, { bands: 'light,heavy' }).request).toMatchObject({ bands: ['light', 'heavy'], tension: null });
    expect(applyEdits(one, { bands: 'heavy' }).request).toMatchObject({ bands: [], tension: 'heavy' });
    expect(applyEdits(one, { bands: 'purple' }).request.bands).toEqual([]);
  });

  it('with a set, each band exercise names its band: heavy for the legs and hips, lightest for the trunk', () => {
    const p = buildProgram({ request: readProgramAsk('light, medium and heavy bands, full body, 3 days a week, 40 minutes').request, library: LIB });
    expect(programProblems(p, LIB, { jumpsOpen: false })).toEqual([]);
    const all = p.weeks[0].days.flatMap((d) => d.blocks.flatMap((b) => b.items)).filter((i) => i.bandSetup);
    for (const i of all.filter((x) => ['knee', 'hinge'].includes(x.slot))) expect(i.bandSetup, i.name).toMatch(/Use the heavy band/);
    for (const i of all.filter((x) => x.slot === 'antiRot')) expect(i.bandSetup, i.name).toMatch(/Use the light band/);
    for (const i of all.filter((x) => x.slot === 'hpull')) expect(i.bandSetup, i.name).toMatch(/Use the medium band/);
    // one band: no band named
    for (const i of sample.weeks[0].days.flatMap((d) => d.blocks.flatMap((b) => b.items))) expect(i.bandSetup ?? '').not.toMatch(/Use the/);
  });
});
