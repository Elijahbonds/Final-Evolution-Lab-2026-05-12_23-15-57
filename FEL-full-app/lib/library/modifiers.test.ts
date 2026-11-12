// EXERCISE-LIBRARY batches 2–4 (2026-10-25): the modifier applicability rules. Each rule has a NEGATIVE control (the
// nonsense the first generation wrote, or the incompatibility the rule names, is refused) and every modifier has a
// POSITIVE control (a base it is meant for passes), so a green run means the rule draws the line in the right place —
// not that it refuses everything. The validator half: a '+modifier' entry on a refused base FAILS checkLibrary.
import { describe, expect, it } from 'vitest';
import { loadLibraryFiles } from './files';
import { MODIFIERS, modifierById, modifierOf, ruleFailures, type ModifierRule } from './modifiers';
import type { LibraryExercise } from './types';
import { checkAgainst, checkLibrary } from './validate';

type Base = Parameters<typeof ruleFailures>[1];
const base = (over: Partial<Base> & { name: string }): Base => ({
  category: 'strength', pattern: 'squat', laterality: 'bilateral', equipment: [], goals: ['strength'], level: 'intermediate', ...over,
});
const rule = (id: string): ModifierRule => modifierById(id)!.rule;
const refused = (id: string, b: Base) => ruleFailures(rule(id), b).length > 0;

describe('every modifier has a base it is meant for (positive controls)', () => {
  const fits: Record<string, Base> = {
    paused: base({ name: 'Goblet Squat', equipment: ['kettlebell'] }),
    tempo: base({ name: 'Dumbbell Romanian Deadlift', pattern: 'hinge', equipment: ['dumbbell'] }),
    'iso-hold': base({ name: 'Split Squat', pattern: 'lunge', laterality: 'unilateral' }),
    'one-and-a-half': base({ name: 'Dumbbell Bench Press', pattern: 'push', equipment: ['dumbbell', 'bench'] }),
    'single-arm': base({ name: 'Bent-Over Dumbbell Row', pattern: 'pull', equipment: ['dumbbell'] }),
    offset: base({ name: 'Dumbbell Reverse Lunge', pattern: 'lunge', equipment: ['dumbbell'] }),
    'half-kneeling': base({ name: 'Cable Shoulder Press', pattern: 'push', equipment: ['cable'] }),
    deficit: base({ name: 'Conventional Barbell Deadlift', pattern: 'hinge', equipment: ['barbell'] }),
    kettlebell: base({ name: 'Dumbbell Front Squat', equipment: ['dumbbell'] }),
    staggered: base({ name: 'Dumbbell Romanian Deadlift', pattern: 'hinge', equipment: ['dumbbell'] }),
    'wide-stance': base({ name: 'Barbell Back Squat', equipment: ['barbell'] }),
    'grip-swap': base({ name: 'Dumbbell Bench Press', pattern: 'push', equipment: ['dumbbell', 'bench'] }),
    vest: base({ name: 'Feet-Elevated Push-Up', pattern: 'push', equipment: ['bench'] }),
    'band-resisted': base({ name: 'Glute Bridge', pattern: 'hinge', equipment: ['mat'] }),
    alternating: base({ name: 'Standing Dumbbell Shoulder Press', pattern: 'push', equipment: ['dumbbell'] }),
    supported: base({ name: 'Rear-Foot-Elevated Split Squat', pattern: 'lunge', laterality: 'unilateral', equipment: ['bench'] }),
    'off-hand': base({ name: 'Floater', category: 'sport-skill', pattern: 'locomotion', goals: ['finishing'], equipment: ['basketball', 'hoop'] }),
    reactive: base({ name: 'Lateral Shuffle', category: 'speed-agility', pattern: 'locomotion', goals: ['agility'] }),
    'eyes-closed': base({ name: 'Single-Leg Balance on Foam Pad', category: 'prehab', pattern: 'other', goals: ['balance'], equipment: ['mat'] }),
    'game-speed': base({ name: 'Closeout', category: 'sport-skill', pattern: 'locomotion', goals: ['defense'], equipment: ['basketball'] }),
    timed: base({ name: 'Ladder Two Feet In', category: 'speed-agility', pattern: 'locomotion', goals: ['footwork'], equipment: ['agility-ladder'] }),
  };
  it('the list covers every modifier', () => expect(Object.keys(fits).sort()).toEqual(MODIFIERS.map((m) => m.id).sort()));
  for (const [id, b] of Object.entries(fits)) it(`${id} fits "${b.name}"`, () => expect(ruleFailures(rule(id), b)).toEqual([]));
});

describe('R1: no slow-tempo modifier on explosive work', () => {
  const explosive: Base[] = [
    base({ name: 'Plyo Kettlebell Pushups', pattern: 'push', equipment: ['kettlebell'] }), // the seed files it under strength
    base({ name: 'Box Jump', category: 'plyometric', pattern: 'locomotion', equipment: ['box'] }),
    base({ name: 'Kettlebell Swing', pattern: 'hinge', equipment: ['kettlebell'] }),
    base({ name: 'Power Clean', category: 'power', pattern: 'hinge', equipment: ['barbell'] }),
    base({ name: 'Clap Push-Up', pattern: 'push' }),
    base({ name: 'Dumbbell Snatch', pattern: 'hinge', equipment: ['dumbbell'] }),
    base({ name: 'Jump Squat', equipment: [] }),
    base({ name: 'Med Ball Chest Throw', pattern: 'push', equipment: ['medicine-ball'] }),
    base({ name: 'Sprint Start', category: 'speed-agility', pattern: 'locomotion' }),
  ];
  for (const m of ['paused', 'tempo', 'iso-hold', 'one-and-a-half']) {
    for (const b of explosive) it(`${m} refuses "${b.name}"`, () => expect(refused(m, b)).toBe(true));
  }
});

describe('R2: "Against the Clock" only on rhythm and conditioning work', () => {
  for (const b of [
    base({ name: 'Vertical Swing', category: 'plyometric', pattern: 'hinge', equipment: ['dumbbell'] }), // the first generation wrote this
    base({ name: 'Barbell Back Squat', equipment: ['barbell'] }),
    base({ name: 'Trap Bar Deadlift', pattern: 'hinge', equipment: ['trap-bar'] }),
    base({ name: 'Depth Jump', category: 'plyometric', pattern: 'locomotion', equipment: ['box'] }),
    base({ name: 'Flying 10', category: 'speed-agility', pattern: 'locomotion', equipment: ['cone'] }),
    base({ name: 'Tuck Jump', category: 'plyometric', pattern: 'locomotion' }),
  ]) it(`refuses "${b.name}"`, () => expect(refused('timed', b)).toBe(true));
});

describe('R3: single-arm never on a two-handed implement or a two-hand drill', () => {
  for (const b of [
    base({ name: 'Barbell Bench Press', pattern: 'push', equipment: ['barbell', 'bench'] }),
    base({ name: 'Trap Bar Shrug', pattern: 'pull', equipment: ['trap-bar'] }),
    base({ name: 'EZ-Bar Curl', pattern: 'pull', equipment: ['ez-bar'] }),
    base({ name: 'Landmine Row', pattern: 'pull', equipment: ['landmine'] }),
    base({ name: 'Band Pull-Apart', pattern: 'pull', equipment: ['band'] }),
    base({ name: 'Dumbbell Squeeze Press', pattern: 'push', equipment: ['dumbbell'] }),
    base({ name: 'Bent Over Two-Dumbbell Row', pattern: 'pull', equipment: ['dumbbell'] }),
  ]) it(`refuses "${b.name}"`, () => expect(refused('single-arm', b)).toBe(true));
});

describe('R4: deficit only where the athlete stands on the floor', () => {
  for (const b of [
    base({ name: 'Seated Good Morning', pattern: 'hinge', equipment: ['barbell'] }),
    base({ name: 'Barbell Hip Thrust', pattern: 'hinge', equipment: ['barbell', 'bench'] }),
    base({ name: 'Dumbbell Box Step-Up', pattern: 'lunge', equipment: ['dumbbell', 'box'] }),
    base({ name: 'Kneeling Hip Hinge', pattern: 'hinge', equipment: ['dumbbell'] }),
    base({ name: 'Dumbbell Bulgarian Split Squat', pattern: 'lunge', equipment: ['dumbbell', 'bench'] }),
    base({ name: 'Cable Pull-Through', pattern: 'hinge', equipment: ['cable'] }),
    base({ name: 'Leg Press', equipment: ['machine'] }),
  ]) it(`refuses "${b.name}"`, () => expect(refused('deficit', b)).toBe(true));
});

describe('R5: one level deep — a base that already names a modifier takes no second one', () => {
  const cases: [string, Base][] = [
    ['tempo', base({ name: 'Pause Back Squat', equipment: ['barbell'] })],
    ['paused', base({ name: 'Goblet Squat with 3-Second Lower', equipment: ['kettlebell'] })],
    ['vest', base({ name: 'Tempo Push-Up', pattern: 'push' })],
    ['offset', base({ name: 'Deficit Reverse Lunge', pattern: 'lunge', equipment: ['dumbbell'] })],
    ['wide-stance', base({ name: 'Box Squat with Chains', equipment: ['barbell'] })],
    ['single-arm', base({ name: 'Neutral-Grip Dumbbell Row', pattern: 'pull', equipment: ['dumbbell'] })],
  ];
  for (const [m, b] of cases) it(`${m} refuses "${b.name}"`, () => expect(refused(m, b)).toBe(true));
});

describe('the other incompatibilities', () => {
  const cases: [string, Base, string][] = [
    ['offset', base({ name: 'Goblet Squat', equipment: ['kettlebell'] }), 'one bell held in the middle: nothing to offset'],
    ['half-kneeling', base({ name: 'Bent-Over Dumbbell Row', pattern: 'pull', equipment: ['dumbbell'] }), 'a bent-over lift cannot kneel'],
    ['kettlebell', base({ name: 'Dumbbell Fly', pattern: 'push', equipment: ['dumbbell', 'bench'] }), 'a bell does not hold like a dumbbell in a fly'],
    ['grip-swap', base({ name: 'Barbell Bench Press', pattern: 'push', equipment: ['barbell', 'bench'] }), 'a straight bar has no neutral grip'],
    ['off-hand', base({ name: 'Crossover-Between Combo', category: 'sport-skill', pattern: 'other', goals: ['handles'], equipment: ['basketball'] }), 'a combo already uses both hands'],
    ['reactive', base({ name: 'Ladder One Foot In', category: 'speed-agility', pattern: 'locomotion', goals: ['footwork'], equipment: ['agility-ladder'] }), 'a ladder pattern is set in advance'],
    ['eyes-closed', base({ name: 'Single-Leg Ball Toss', category: 'prehab', pattern: 'other', goals: ['balance'], equipment: ['basketball'] }), 'no catching with the eyes closed'],
    ['game-speed', base({ name: 'One-Hand Form Shooting', category: 'sport-skill', pattern: 'push', goals: ['shooting'], equipment: ['basketball', 'hoop'] }), 'form work is slow on purpose'],
    ['vest', base({ name: 'Band-Assisted Pull-Up', pattern: 'pull', equipment: ['band', 'pull-up-bar'] }), 'no load on an assisted version'],
    ['band-resisted', base({ name: 'Incline Push-Up', pattern: 'push', equipment: ['bench'] }), 'no resistance on a regression'],
    ['staggered', base({ name: 'Sumo Deadlift', pattern: 'hinge', equipment: ['barbell'] }), 'a sumo stance is not staggered'],
    ['alternating', base({ name: 'Barbell Curl', pattern: 'pull', equipment: ['barbell'] }), 'one bar cannot alternate'],
    ['supported', base({ name: 'Barbell Split Squat', pattern: 'lunge', laterality: 'unilateral', equipment: ['barbell'] }), 'a hand on a post and a bar on the back do not mix'],
  ];
  for (const [m, b, why] of cases) it(`${m} refuses "${b.name}" (${why})`, () => expect(refused(m, b)).toBe(true));
  it('no modifier builds on a base whose cues name kit it does not use (a seed cue-family slip)', () => {
    const b = { ...base({ name: 'Cable Chest Press', pattern: 'push', equipment: ['cable'] }), cues: ['Bend the bar: try to snap it in half.'] };
    expect(ruleFailures(rule('paused'), { ...b, cues: ['Push the handles away.'] })).toEqual([]);
    b.equipment = ['band'];
    expect(ruleFailures(rule('paused'), b).some((r) => /cues name/.test(r))).toBe(true);
  });
  it('modifierOf reads the variation suffix', () => {
    expect(modifierOf('goblet+paused')).toBe('paused');
    expect(modifierOf('goblet')).toBeNull();
  });
});

describe('the validator enforces the rules on the data (check "modifier")', () => {
  const ALL = loadLibraryFiles();
  const byName = (n: string) => ALL.find((e) => e.name === n)!;
  const variantOf = (b: LibraryExercise, mod: string, name: string): LibraryExercise => ({
    ...structuredClone(b), id: `x-${mod}`, slug: `x-${mod}`, name, aliases: [], variation: `${b.variation}+${mod}`, variantOf: b.id,
    regressionId: b.id, progressionId: null, source: { kind: 'authored', ref: null, url: null, licence: 'FEL original (Final Evolution Lab)' },
    review: { status: 'draft', reviewer: null, batch: 'authored-b9-test' },
  });
  const flagged = (list: LibraryExercise[], id: string) => checkLibrary(list).filter((i) => i.id === id && i.check === 'modifier');

  it('the library as written passes (every generated variant sits on a base its rule accepts)', () => {
    expect(checkLibrary(ALL).filter((i) => i.check === 'modifier')).toEqual([]);
    expect(ALL.filter((e) => modifierOf(e.variation)).length).toBeGreaterThan(1000);
  });
  it('R1: "Paused Plyo Kettlebell Pushups" fails', () => {
    const b = byName('Plyo Kettlebell Pushups');
    expect(flagged([b, variantOf(b, 'paused', 'Paused Plyo Kettlebell Pushups')], 'x-paused').length).toBe(1);
  });
  it('R2: "Vertical Swing Against the Clock" fails', () => {
    const b = byName('Vertical Swing');
    expect(flagged([b, variantOf(b, 'timed', 'Vertical Swing Against the Clock')], 'x-timed').length).toBe(1);
  });
  it('R3: a single-arm barbell lift fails', () => {
    const b = ALL.find((e) => e.equipment.includes('barbell') && e.pattern === 'push' && e.category === 'strength')!;
    expect(flagged([b, variantOf(b, 'single-arm', `Single-Arm ${b.name}`)], 'x-single-arm').length).toBe(1);
  });
  it('R4: a deficit on a bench lift fails', () => {
    const b = ALL.find((e) => e.pattern === 'hinge' && e.category === 'strength' && /thrust|bench/i.test(e.name))!;
    expect(flagged([b, variantOf(b, 'deficit', `Deficit ${b.name}`)], 'x-deficit').length).toBe(1);
  });
  it('R5: a variant of a variant fails, and so does a variant that names no base or an unknown modifier', () => {
    const b = byName('Goblet Squat');
    const v1 = variantOf(b, 'tempo', 'Goblet Squat with a Slow Lower Test');
    const v2 = { ...variantOf(v1, 'paused', 'Paused Goblet Squat Slow Lower Test'), id: 'x-stack', slug: 'x-stack', variantOf: v1.id };
    expect(flagged([b, v1, v2], 'x-stack').length).toBe(1);
    expect(checkLibrary([b, { ...v1, variantOf: undefined }]).some((i) => i.check === 'modifier' && /names the base/.test(i.detail))).toBe(true);
    expect(checkLibrary([b, { ...v1, variation: `${b.variation}+levitate` }]).some((i) => i.check === 'modifier' && /unknown modifier/.test(i.detail))).toBe(true);
    expect(checkLibrary([b, { ...v1, variantOf: 'no-such-entry' }]).some((i) => i.check === 'modifier' && /does not exist/.test(i.detail))).toBe(true);
  });
  it('an owner edit is held to the same rule (checkAgainst)', () => {
    const b = byName('Plyo Kettlebell Pushups');
    expect(checkAgainst(variantOf(b, 'tempo', 'Plyo Kettlebell Pushups Slow Lower Test'), ALL).some((i) => i.check === 'modifier')).toBe(true);
  });
});
