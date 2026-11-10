// EVERY-SCREEN P3 (2026-11-10): the plan's gate for the AI program builder — "a fixed set of 24 asks (band only,
// dumbbells, no equipment, teen, bad knee, 20 minutes, and so on) all pass written rules, kept as tests: only equipment
// the person has, every major movement covered each week, sensible weekly volume, youth rules kept, no medical claims."
//
// The rules are ./rules24.ts. Each is first shown to catch a planted break (a rule that cannot fail proves nothing), then
// the 24 asks are read as a person types them and built as the server builds them, and every rule must hold. The same
// rules run over 5,040 requests in scripts/every-screen/builder-rules.mts.
import { describe, expect, it } from 'vitest';
import { loadLibraryFiles } from '@/lib/library/files';
import { buildProgram } from './build';
import { LONGER_THAN_ASKED } from './copy';
import { buildKept } from './kept';
import { readProgramAsk } from './request';
import { builderRuleFailures } from './rules24';
import type { BuiltProgram, ProgramRequest } from './types';

const LIB = loadLibraryFiles();
const byId = new Map(LIB.map((e) => [e.id, e]));

interface Ask { q: string; jumps?: boolean; youthAccount?: boolean; read: Partial<Pick<ProgramRequest, 'equipment' | 'age' | 'goal' | 'days' | 'minutes' | 'level' | 'lowLoad'>>; injury?: true }

/** The 24. Each says what the reader must take from it, so a wrong read fails here before any rule is checked. */
export const ASKS24: readonly Ask[] = [
  { q: 'All I have is a band. Full body, 3 days a week.', read: { equipment: ['band'], goal: 'full-body', days: 3, age: 'adult' } },
  { q: 'I have a pair of dumbbells. Build muscle, 4 days a week, 45 minutes.', read: { equipment: ['dumbbell'], goal: 'muscle', days: 4, minutes: 45 } },
  { q: 'No equipment at all. 3 days a week, 30 minutes.', read: { equipment: [], days: 3, minutes: 30 } },
  { q: 'Bodyweight only, I am a beginner, 2 days a week.', read: { equipment: [], days: 2, level: 'beginner' } },
  { q: 'I am 15 and play basketball. A band and a pull-up bar, 3 days, 45 minutes.', read: { equipment: ['band', 'pull-up-bar'], age: 'teen', goal: 'sport' } },
  { q: 'For my 12 year old: no equipment, 2 days a week, 30 minutes.', read: { equipment: [], age: 'child', days: 2, minutes: 30 } },
  { q: 'I have a bad knee. Band only, 3 days a week.', read: { equipment: ['band'] }, injury: true },
  { q: '20 minutes a day, 5 days a week, no equipment.', read: { equipment: [], days: 5, minutes: 20 } },
  { q: 'Full gym: barbell, rack, bench, dumbbells and cables. Strength, 4 days, 60 minutes, advanced.', read: { goal: 'strength', days: 4, minutes: 60, level: 'advanced' } },
  { q: 'One kettlebell, conditioning, 3 days, 30 minutes.', read: { equipment: ['kettlebell'], goal: 'conditioning', minutes: 30 } },
  { q: 'Dumbbells and a bench, 3 days, 40 minutes, intermediate, 8 weeks.', read: { equipment: ['dumbbell', 'bench'], level: 'intermediate' } },
  { q: 'Easy on my back please. Dumbbells, full body, 3 days.', read: { equipment: ['dumbbell'], lowLoad: ['back'] } },
  { q: 'Knee-friendly, a band, 3 days, 40 minutes.', read: { equipment: ['band'], lowLoad: ['knee'] } },
  { q: 'I want to jump higher. No equipment, 3 days, 45 minutes.', read: { equipment: [], goal: 'athletic' } },
  { q: 'Mobility, 4 days a week, 20 minutes, no equipment.', read: { goal: 'mobility', days: 4, minutes: 20 } },
  { q: 'A pull-up bar and a band, build muscle, 5 days, 50 minutes.', read: { equipment: ['band', 'pull-up-bar'], goal: 'muscle', days: 5 } },
  { q: 'Just a mini band and a long band, 3 days, 35 minutes.', read: { equipment: ['mini-band', 'band'], minutes: 35 } },
  { q: 'Strength, 6 days a week, 90 minutes, advanced, barbell and dumbbells, 12 weeks.', read: { goal: 'strength', days: 6, minutes: 90, level: 'advanced' } },
  { q: 'I am 16. Dumbbells, build muscle, 4 days, 60 minutes.', read: { equipment: ['dumbbell'], age: 'teen', goal: 'muscle' } },
  { q: 'Soccer player, 17, no equipment, 3 days, 40 minutes.', read: { equipment: [], age: 'teen', goal: 'sport' } },
  { q: 'Lose weight. Treadmill and dumbbells, 4 days, 30 minutes.', read: { days: 4, minutes: 30 } },
  { q: 'My shoulder hurts when I press. Dumbbells, 3 days.', read: { equipment: ['dumbbell'] }, injury: true },
  { q: 'Something quick: 2 days, 20 minutes, a band. I am 65.', read: { equipment: ['band'], days: 2, minutes: 20, age: 'adult' } },
  { q: 'Kettlebells and a box, athletic, 4 days, 45 minutes, intermediate.', read: { equipment: ['kettlebell', 'box'], goal: 'athletic' }, jumps: true },
];

const items = (p: BuiltProgram) => p.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.flatMap((b) => b.items)));
const clone = (p: BuiltProgram): BuiltProgram => JSON.parse(JSON.stringify(p));

describe('the five rules each catch a planted break (on a program that passes them all)', () => {
  const base = buildProgram({ request: readProgramAsk(ASKS24[0].q).request, library: LIB });
  const kinds = (p: BuiltProgram, req?: Partial<ProgramRequest>) =>
    [...new Set(builderRuleFailures(req ? { ...p, request: { ...p.request, ...req } } : p, LIB, { jumpsOpen: false }).map((f) => f.split(':')[0]))];

  it('the control passes every rule', () => expect(builderRuleFailures(base, LIB, { jumpsOpen: false })).toEqual([]));
  it('kit: an exercise that needs a barbell, in a band-only plan', () => {
    const p = clone(base);
    const bar = LIB.find((e) => e.equipment.includes('barbell') && e.review.status !== 'rejected')!;
    Object.assign(items(p)[0], { exId: bar.id, name: bar.name });
    expect(kinds(p)).toContain('kit');
  });
  it('patterns: a week with no hinge', () => {
    const p = clone(base);
    for (const d of p.weeks[0].days) for (const b of d.blocks) b.items = b.items.filter((i) => i.slot !== 'hinge');
    expect(builderRuleFailures(p, LIB, { jumpsOpen: false }).some((f) => f.startsWith('patterns: week 1: no a hinge'))).toBe(true);
  });
  it('volume: 30 hard sets for the legs in a week', () => {
    const p = clone(base);
    for (const i of items(p).filter((x) => x.slot === 'knee')) i.sets = 10;
    expect(kinds(p)).toContain('volume');
  });
  it('youth: the same plan for a 15-year-old with a jump and a Surge set in it', () => {
    const p = clone(base);
    const jump = LIB.find((e) => /\bjump\b/i.test(e.name) && e.youthOk)!;
    Object.assign(items(p)[0], { exId: jump.id, name: jump.name, effort: 'surge' });
    expect(kinds(p, { age: 'teen' })).toContain('youth');
  });
  it('medical: a line that promises to fix a knee, and one that says "treats"', () => {
    for (const line of ['This plan will cure your knee pain.', 'It treats tight hips.']) {
      const p = clone(base);
      p.notes = [...p.notes, line];
      expect(kinds(p)).toContain('medical');
    }
  });
});

describe('a request the builder cannot fit as asked gets the nearest one that keeps every rule, said so (./kept.ts)', () => {
  it('a 20-minute muscle plan with no kit, two days, intermediate: built 25 or 30 minutes long, and the plan says why', () => {
    const request = { ...readProgramAsk('No equipment, build muscle, 2 days a week, 20 minutes, intermediate.').request };
    expect(builderRuleFailures(buildProgram({ request, library: LIB }), LIB, { jumpsOpen: false }).length).toBeGreaterThan(0);
    const k = buildKept({ request, library: LIB });
    expect(k.failures).toEqual([]);
    expect(k.longer).toBeGreaterThan(0);
    expect(k.program.notes[0]).toMatch(/^These sessions run about (25|30) minutes, not 20: /);
  });
  it('a request that fits is built exactly as asked, with no such line', () => {
    const k = buildKept({ request: readProgramAsk(ASKS24[0].q).request, library: LIB });
    expect(k.longer).toBe(0);
    expect(k.program.notes.join(' ')).not.toMatch(/These sessions run about/);
  });
});

describe('the 24 asks, read as typed and built as the server builds them', () => {
  for (const a of ASKS24) {
    it(a.q, () => {
      const read = readProgramAsk(a.q, { youth: a.youthAccount });
      for (const [k, v] of Object.entries(a.read)) expect(read.request[k as keyof ProgramRequest], `${k} read from "${a.q}"`).toEqual(v);
      if (a.injury) {
        // pain or an injury stops the build: no program is made, and the page shows FEL's existing "see a professional"
        // lines (lib/program-ask/server.ts) — never a plan written around the pain
        expect(read.injury.flagged).toBe(true);
        return;
      }
      expect(read.injury.flagged).toBe(false);
      const { program: p, longer } = buildKept({ request: read.request, library: LIB, jumpsOpen: a.jumps });
      expect(builderRuleFailures(p, LIB, { jumpsOpen: !!a.jumps })).toEqual([]);
      // the asked length, or (said on the plan) the nearest longer one that keeps every rule
      if (longer) expect(p.notes[0]).toBe(LONGER_THAN_ASKED(read.request.minutes, read.request.minutes + longer));
      else expect(p.request.minutes).toBe(read.request.minutes);
      // and the plan is a real one: every exercise is a library entry
      for (const i of items(p)) expect(byId.get(i.exId)?.name).toBe(i.name);
    });
  }

  it('24 asks: 22 programs and 2 stops for pain, across every kit, both youth bands, and 20 to 90 minutes', () => {
    expect(ASKS24).toHaveLength(24);
    expect(ASKS24.filter((a) => a.injury)).toHaveLength(2);
    const reads = ASKS24.map((a) => readProgramAsk(a.q).request);
    expect(new Set(reads.map((r) => r.age))).toEqual(new Set(['adult', 'teen', 'child']));
    expect(Math.min(...reads.map((r) => r.minutes))).toBe(20);
    expect(Math.max(...reads.map((r) => r.minutes))).toBe(90);
    for (const kit of ['band', 'dumbbell', 'kettlebell', 'barbell', 'pull-up-bar', 'mini-band']) expect(reads.some((r) => r.equipment.includes(kit as never)), kit).toBe(true);
    expect(reads.some((r) => r.equipment.length === 0)).toBe(true);
  });
});
