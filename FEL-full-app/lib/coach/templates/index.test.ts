// FEL's program templates (MIRROR-COACH P8, 2026-09-29): every template passes P2's own validators, every week of every
// wave covers the six patterns and pulls at least as much as it presses, every exercise a template names has an easier
// and a harder version and the ladders resolve both ways, the youth and camp templates carry no impact item and no band
// above Drive (so never Full throttle), week 4 is lighter than week 3 by a stated measure, and the copy passes the lint.
import { describe, expect, it } from 'vitest';
import { screenText } from '@/lib/share/screen';
import { isPlyometric } from '@/lib/workout/plan-revision';
import { isDepthDrop } from '@/lib/workout/plan-generator';
import { YOUTH_DAILY_ACTIVITY_TARGET_MINUTES } from '@/lib/consent/guardianGate';
import { nameKey, validateCatalogueCreate } from '../catalogue';
import { COVERAGE_PATTERNS, pullPushCheck } from '../coverage';
import { validateExerciseSpec } from '../loop';
import { fullWeek } from '../offDay';
import { doseLine, sessionWarnings } from '../structure';
import { EFFORT_BANDS, MAX_EFFORT_CUE, PIN_EXERCISE, bandAllowed, isSetupCueId } from '../taxonomy';
import { isJumpWork, todayLayout } from '../today';
import { BUILDER_ERROR_COPY } from '../builder';
import {
  TEMPLATE_EXERCISES, TEMPLATE_LADDERS, catalogueCreateInput, easierKey, harderKey, impactFreeStepDown, isImpact, ladderKeysFor, ladderOf,
  rungOf, stepUp, templateExercise, isUnilateral,
} from '../templateCatalogue';
import { WORKOUT_PRODUCTS, productsFor } from '@/lib/workout/plan-sale';
import {
  ADULT_TEMPLATE_LINE, ADULT_WAVE, CAMP_BANDS, CLONE_LINE, MAX_WEEKLY_SET_GROWTH, TEMPLATES, WAVE_LINE, WEEK4_MAX_SHARE, YOUTH_WAVE,
  dailyTargetLine, expandTemplate, planTemplateClone, programIsBlank, sameSpec, specInput, templateAllowedFor, templateById, templateFor,
  templateProblems, templateShapeLine, templateText, templateWeeks, weekCoverage, weekEffort, weekPullPush, weekTopBand, weekWorkingSets,
  sidedReps, type ProgramTemplate, type TemplatePrescription, type TemplateWeekPlan,
} from './index';

const byId = (id: string) => templateById(id)!;
const PROGRAMS = TEMPLATES.filter((t) => t.kind === 'program');
const YOUTH = TEMPLATES.filter((t) => t.audience === 'youth');
const ADULT = TEMPLATES.filter((t) => t.audience === 'adult');
const allWeeks = (t: ProgramTemplate): TemplateWeekPlan[] => (t.kind === 'camp' ? expandTemplate(t) : [1, 2, 3].flatMap((wave) => expandTemplate(t, { wave: wave as 1 | 2 | 3 })));
const items = (w: TemplateWeekPlan): TemplatePrescription[] => w.sessions.flatMap((s) => s.items);
const bandRank = (id: string) => EFFORT_BANDS.findIndex((b) => b.id === id);

describe('the template catalogue', () => {
  it('every exercise passes the catalogue\'s own create validator unchanged, with no claims-screen warning', () => {
    expect(TEMPLATE_EXERCISES.length).toBe(104);
    for (const e of TEMPLATE_EXERCISES) {
      const v = validateCatalogueCreate(catalogueCreateInput(e.key));
      expect(v.ok, e.key).toBe(true);
      if (!v.ok) continue;
      expect(v.warnings, e.key).toEqual([]);
      const { name, category, pattern, braceMode, skillLayer, defaultTempo, equipment, primaryCues, commonFaults } = v.item;
      expect({ name, category, pattern, braceMode, skillLayer, defaultTempo, equipment, primaryCues, commonFaults }, e.key).toEqual(e.catalogue);
      expect(e.catalogue.primaryCues.length, e.key).toBeGreaterThanOrEqual(1);
    }
  });

  it('keys and names are unique (names the way a coach reads them), and every exercise sits on exactly one ladder', () => {
    expect(new Set(TEMPLATE_EXERCISES.map((e) => e.key)).size).toBe(TEMPLATE_EXERCISES.length);
    expect(new Set(TEMPLATE_EXERCISES.map((e) => nameKey(e.catalogue.name))).size).toBe(TEMPLATE_EXERCISES.length);
    for (const e of TEMPLATE_EXERCISES) expect(TEMPLATE_LADDERS.filter((l) => l.rungs.some((r) => r.key === e.key)), e.key).toHaveLength(1);
    expect(new Set(TEMPLATE_LADDERS.map((l) => l.id)).size).toBe(TEMPLATE_LADDERS.length);
  });

  it('every rung of a ladder trains the ladder\'s pattern, so a step up or down never changes what a week covers', () => {
    for (const l of TEMPLATE_LADDERS) {
      expect(l.rungs.length, l.id).toBeGreaterThanOrEqual(3);
      for (const r of l.rungs) expect(r.catalogue.pattern, `${l.id}/${r.key}`).toBe(l.pattern);
    }
  });

  it('ladders resolve both ways: the easier version\'s harder version is the exercise, and the other way round', () => {
    for (const e of TEMPLATE_EXERCISES) {
      const down = easierKey(e.key), up = harderKey(e.key);
      if (down) expect(harderKey(down), e.key).toBe(e.key);
      if (up) expect(easierKey(up), e.key).toBe(e.key);
      const l = ladderOf(e.key)!;
      expect(down === null, e.key).toBe(rungOf(e.key) === 0);
      expect(up === null, e.key).toBe(rungOf(e.key) === l.rungs.length - 1);
    }
    expect(stepUp('backpack-rdl', 1)).toBe('sl-rdl-supported');
    expect(stepUp('backpack-rdl', 9)).toBe('sl-rdl-free');
    expect(stepUp('backpack-rdl', 0)).toBe('backpack-rdl');
    expect(easierKey('nope')).toBeNull();
    expect(rungOf('nope')).toBe(-1);
  });

  it('the owner\'s ch8 ladders are the Playbook\'s rungs in the Playbook\'s order, with FEL\'s one easier rung below two of them', () => {
    const rungs = (id: string) => TEMPLATE_LADDERS.find((l) => l.id === id)!.rungs.map((r) => r.catalogue.name);
    expect(rungs('bw-hinge')).toEqual(['Wall Hip Hinge', 'Bodyweight RDL, 3-Second Hold', 'Backpack RDL', 'Single-Leg RDL Toe Touch, Supported', 'Single-Leg RDL, Free Stand']);
    expect(rungs('bw-split')).toEqual(['Supported Split Squat', 'Split Squat, 3-Second Hold', 'Rear-Foot Elevated Split Squat', 'Rear-Foot Elevated Split Squat, 4-Second Lower']);
    expect(rungs('bw-bridge')).toEqual(['Glute Bridge, 5-Second Squeeze', 'Glute Bridge, Feet Close', 'Single-Leg Bridge, 5-Second Squeeze', 'Single-Leg Bridge with a Backpack']);
    expect(rungs('pogo')).toEqual(['Fast Heel Raise', 'Pogo Hops', 'Single-Leg Pogo Hops']);
    for (const id of ['bw-hinge', 'bw-split', 'bw-bridge']) expect(TEMPLATE_LADDERS.find((l) => l.id === id)!.source).toMatch(/playbook ch8/);
    // FEL's added rungs say they are FEL's
    expect(templateExercise('wall-hip-hinge')!.source).toBe('fel');
    expect(templateExercise('supported-split-squat')!.source).toBe('fel');
  });
});

describe('impact: what leaves the floor and lands', () => {
  it('agrees with every reader that already decides it: Today\'s jump signal, /workout\'s plyometric and depth-drop tests', () => {
    let impact = 0;
    for (const e of TEMPLATE_EXERCISES) {
      const jumps = e.impact !== null;
      if (jumps) impact++;
      expect(isJumpWork(e.catalogue), e.key).toBe(jumps);
      expect(isPlyometric({ name: e.catalogue.name }), e.key).toBe(jumps);
      expect(isDepthDrop({ name: e.catalogue.name }), e.key).toBe(e.impact === 'depth_drop');
      expect(isImpact(e.key), e.key).toBe(jumps);
    }
    expect(impact).toBe(9);
  });

  it('every impact exercise has an impact-free rung below it, at most three steps down (the gate walks up to four)', () => {
    for (const e of TEMPLATE_EXERCISES) {
      const down = impactFreeStepDown(e.key);
      expect(down, e.key).not.toBeNull();
      expect(isImpact(down!), e.key).toBe(false);
      if (e.impact === null) { expect(down).toBe(e.key); continue; }
      expect(rungOf(e.key) - rungOf(down!), e.key).toBeGreaterThanOrEqual(1);
      expect(rungOf(e.key) - rungOf(down!), e.key).toBeLessThanOrEqual(3);
      expect(ladderOf(down!)!.id).toBe(ladderOf(e.key)!.id);
    }
    expect(impactFreeStepDown('box-jump-stick')).toBe('fast-bw-squat');   // past the countermovement jump, which lands
    expect(impactFreeStepDown('low-box-depth-drop')).toBe('fast-bw-squat');
    expect(impactFreeStepDown('pogo-hops')).toBe('fast-heel-raise');
    expect(impactFreeStepDown('nope')).toBeNull();
  });

  it('there is one depth drop, the top rung of the vertical-jump ladder, and no template programs it', () => {
    const drops = TEMPLATE_EXERCISES.filter((e) => e.impact === 'depth_drop');
    expect(drops.map((d) => d.key)).toEqual(['low-box-depth-drop']);
    expect(harderKey('low-box-depth-drop')).toBeNull();
    for (const t of TEMPLATES) for (const w of allWeeks(t)) for (const p of items(w)) expect(p.impact, `${t.id} ${p.exercise}`).not.toBe('depth_drop');
  });
});

describe('every template passes P2\'s validators', () => {
  it('templateProblems finds nothing in any template, any wave, any week', () => {
    for (const t of TEMPLATES) expect(templateProblems(t), t.id).toEqual([]);
  });

  it('seven templates: 3 and 4 days × bodyweight and full gym for adults, a 3-day and a 2-day youth week, a camp session', () => {
    expect(TEMPLATES.map((t) => [t.id, t.audience, t.equipment, t.daysPerWeek, t.kind])).toEqual([
      ['adult-bw-3', 'adult', 'bodyweight', 3, 'program'], ['adult-bw-4', 'adult', 'bodyweight', 4, 'program'],
      ['adult-gym-3', 'adult', 'gym', 3, 'program'], ['adult-gym-4', 'adult', 'gym', 4, 'program'],
      ['youth-bw-3', 'youth', 'bodyweight', 3, 'program'], ['youth-bw-2', 'youth', 'bodyweight', 2, 'program'],
      ['camp-session', 'youth', 'bodyweight', 1, 'camp'],
    ]);
    for (const t of TEMPLATES) expect(t.sessions.length, t.id).toBe(t.daysPerWeek);
  });

  it('every prescription goes through the builder\'s validator and comes back exactly as the template wrote it', () => {
    let n = 0;
    for (const t of TEMPLATES) for (const w of allWeeks(t)) for (const p of items(w)) {
      const v = validateExerciseSpec({ exerciseId: 'pe-x', ...specInput(p) });
      expect(v.ok, `${t.id} ${p.exercise}`).toBe(true);
      if (!v.ok) continue;
      const { exerciseId: _e, ...spec } = v.spec;
      expect(sameSpec(spec, specInput(p)), `${t.id} w${w.week} ${p.exercise}`).toBe(true);
      for (const c of p.setupCues) expect(isSetupCueId(c)).toBe(true);
      n++;
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('every session has P2\'s shape with no builder warning and exactly one key set, in the Key section', () => {
    for (const t of TEMPLATES) for (const w of allWeeks(t)) for (const s of w.sessions) {
      const rows = s.items.map((p, i) => ({ id: `i${i}`, order: i + 1, section: p.section, isKeySet: p.isKeySet, supersetGroup: p.supersetGroup }));
      expect(sessionWarnings(rows), `${t.id} ${s.label}`).toEqual([]);
      const keys = s.items.filter((p) => p.isKeySet);
      expect(keys, `${t.id} ${s.label}`).toHaveLength(1);
      expect(keys[0].section).toBe('key');
      // stored order is running order: the builder writes them in this order and Today reads them back the same
      expect(todayLayout(rows).map((x) => x.section)).toEqual([...new Set(s.items.map((p) => p.section))]);
      // Prep and Cool-down are P6's (the generated warm-up and cool-down); a template never writes them
      for (const p of s.items) expect(['prime', 'key', 'assist', 'finish']).toContain(p.section);
    }
  });

  it('reads on Today as written: no "@ RPE", the band named, a timed carry per side', () => {
    const mon = expandTemplate(byId('adult-bw-3'))[0].sessions[0].items;
    expect(mon.map((p) => `${p.name}: ${doseLine(p)}`)).toEqual([
      'Countermovement Jump and Stick: 3 × 3 jumps · Cruise',
      'Backpack Hug Squat: 3 × 8 · Drive',
      'Bent-Over Backpack Row: 3 × 10 · Cruise',
      'Push-Up: 3 × 8 · Cruise',
      'Backpack RDL: 3 × 10 · Cruise',
      'Suitcase Carry: 2 × 40 s each side · Cruise',
    ]);
  });
});

describe('each week covers the six patterns and pulls at least as much as it presses', () => {
  it('P2\'s coverage strip reads all six done in every week of every wave of every template', () => {
    for (const t of TEMPLATES) for (const w of allWeeks(t)) {
      const strip = weekCoverage(w);
      expect(strip.cells.map((c) => c.state), `${t.id} week ${w.week}`).toEqual(COVERAGE_PATTERNS.map(() => 'done'));
    }
  });

  it('P2\'s pull-over-push check has nothing to say about any week (pulling sets ≥ pressing sets); the counts', () => {
    const counts: Record<string, string[]> = {};
    for (const t of TEMPLATES) {
      counts[t.id] = [];
      for (const w of allWeeks(t)) {
        expect(weekPullPush(w), `${t.id} week ${w.week}`).toBeNull();
        const work = items(w).filter((p) => p.section !== 'prime');
        const sum = (pat: string) => work.filter((p) => p.pattern === pat).reduce((s, p) => s + p.sets, 0);
        expect(sum('pull'), `${t.id} week ${w.week}`).toBeGreaterThanOrEqual(sum('push'));
        if (w.week <= 4) counts[t.id].push(`${sum('pull')}:${sum('push')}`);
      }
    }
    expect(counts).toEqual({
      'adult-bw-3': ['11:9', '11:9', '11:9', '7:6'],
      'adult-bw-4': ['16:9', '17:10', '17:10', '10:6'],
      'adult-gym-3': ['11:9', '11:9', '11:9', '7:6'],
      'adult-gym-4': ['16:9', '17:10', '17:10', '10:6'],
      'youth-bw-3': ['8:5', '8:5', '8:6', '5:3'],
      // MIRROR-COACH P8 FIX (2026-09-30): a row paired with Thursday's push-up (it was the Y-T raise, 3 sets): 6:5 → 7:5
      'youth-bw-2': ['7:5', '7:5', '7:5', '4:3'],
      'camp-session': ['2:2'],
    });
  });

  it('a push-heavy week, an untagged pattern, a missing carry: the checks catch each (negative controls)', () => {
    const base = byId('adult-bw-3');
    const pushHeavy: ProgramTemplate = { ...base, id: 'x-push', sessions: base.sessions.map((s) => ({ ...s, items: s.items.map((i) => (templateExercise(i.exercise)!.catalogue.pattern === 'push' ? { ...i, sets: 5 } : i)) })) };
    expect(templateProblems(pushHeavy).some((p) => /pressing sets/.test(p))).toBe(true);
    const noCarry: ProgramTemplate = { ...base, id: 'x-carry', sessions: base.sessions.map((s) => ({ ...s, items: s.items.filter((i) => i.section !== 'finish') })) };
    expect(templateProblems(noCarry).some((p) => /misses carry/.test(p))).toBe(true);
    expect(pullPushCheck([{ pattern: 'push', section: 'key', sets: 3 }])).not.toBeNull();   // the check itself is live
  });
});

describe('variation ladders: every exercise a template names has an easier and a harder version', () => {
  it('in every template, as written (wave 1)', () => {
    for (const t of TEMPLATES) for (const s of t.sessions) for (const i of s.items) {
      expect(easierKey(i.exercise), `${t.id} ${i.exercise}`).not.toBeNull();
      expect(harderKey(i.exercise), `${t.id} ${i.exercise}`).not.toBeNull();
    }
  });

  it('an exercise at the end of a ladder is refused as a template item (negative control)', () => {
    const base = byId('youth-bw-3');
    const bottom: ProgramTemplate = { ...base, id: 'x-bottom', sessions: [{ ...base.sessions[0], items: base.sessions[0].items.map((i, k) => (k === 0 ? { ...i, exercise: 'wall-hip-hinge' } : i)) }, ...base.sessions.slice(1)] };
    expect(templateProblems(bottom)).toContain('wall-hip-hinge needs an easier and a harder version on its ladder');
  });

  it('the expanded items carry both links and the gate\'s step-down', () => {
    const p = expandTemplate(byId('adult-gym-4'))[0].sessions[0].items[0];
    // MIRROR-COACH P8 FIX (2026-09-30): adult-gym-4's Monday opens with the countermovement jump now (no box — the
    // owner's Playbook ch6 pogo-base rule; adultGym.ts header). This pinned Box Jump and Stick.
    expect([p.exercise, p.easier, p.harder, p.stepDown, p.impact]).toEqual(['cmj-stick', 'fast-bw-squat', 'box-jump-stick', 'fast-bw-squat', 'plyometric']);
    const key = expandTemplate(byId('adult-gym-4'))[0].sessions[0].items[1];
    expect([key.exercise, key.easier, key.harder, key.stepDown, key.impact]).toEqual(['back-squat', 'goblet-squat', 'back-squat-pause', 'back-squat', null]);
  });
});

describe('youth and camp templates (owner decisions #6, #10, #20)', () => {
  it('carry no impact item — by FEL\'s flag, Today\'s jump signal and /workout\'s plyometric test — and no Prime section', () => {
    for (const t of YOUTH) for (const w of allWeeks(t)) for (const p of items(w)) {
      const e = templateExercise(p.exercise)!;
      expect(p.impact, `${t.id} ${p.exercise}`).toBeNull();
      expect(isJumpWork(e.catalogue), `${t.id} ${p.exercise}`).toBe(false);
      expect(isPlyometric({ name: p.name }), `${t.id} ${p.exercise}`).toBe(false);
      expect(p.section, `${t.id} ${p.exercise}`).not.toBe('prime');
    }
  });

  it('carry no Full throttle band and nothing above Drive in any week; every band is one youth rules allow', () => {
    for (const t of YOUTH) for (const w of allWeeks(t)) for (const p of items(w)) {
      expect(p.effortBand).not.toBe('full');
      expect(bandRank(p.effortBand), `${t.id} ${p.exercise}`).toBeLessThanOrEqual(bandRank('drive'));
      expect(bandAllowed(p.effortBand, true)).toBe(true);
    }
    expect(Object.values(CAMP_BANDS)).not.toContain('surge');
    for (const w of YOUTH_WAVE) for (const b of Object.values(w.bands)) expect(bandRank(b)).toBeLessThanOrEqual(bandRank('drive'));
  });

  it('no max-effort cue and no pin anywhere in what they seed; every row stays on the floor', () => {
    for (const t of YOUTH) for (const k of ladderKeysFor(t.sessions.flatMap((s) => s.items.map((i) => i.exercise)))) {
      const e = templateExercise(k)!;
      expect(e.catalogue.name).not.toMatch(PIN_EXERCISE);
      for (const c of e.catalogue.primaryCues) expect(c).not.toMatch(MAX_EFFORT_CUE);
      expect(e.impact, `${t.id} seeds ${k}`).toBeNull();
    }
  });

  it('show the 60 min/day youth activity target, the owner\'s number', () => {
    for (const t of YOUTH) expect(t.dailyTargetMinutes, t.id).toBe(YOUTH_DAILY_ACTIVITY_TARGET_MINUTES);
    expect(YOUTH_DAILY_ACTIVITY_TARGET_MINUTES).toBe(60);
    for (const t of ADULT) expect(t.dailyTargetMinutes).toBeUndefined();
    expect(dailyTargetLine(60)).toMatch(/about 60 minutes of movement a day/);
  });

  it('a youth template with a jump in it is refused (negative control)', () => {
    const base = byId('youth-bw-2');
    const jumpy: ProgramTemplate = { ...base, id: 'x-jump', sessions: [{ ...base.sessions[0], items: [{ exercise: 'cmj-stick', section: 'prime', sets: 2, reps: '3 jumps', restSeconds: 60 }, ...base.sessions[0].items] }, base.sessions[1]] };
    expect(templateProblems(jumpy).some((p) => /no jump and no Prime/.test(p))).toBe(true);
  });

  it('adult templates hold their jumps in Prime only — one per day that has a Prime — and never Full throttle either', () => {
    for (const t of ADULT) for (const w of allWeeks(t)) {
      for (const s of w.sessions) expect(s.items.filter((p) => p.section === 'prime').length, `${t.id} ${s.label}`).toBeLessThanOrEqual(1);
      for (const p of items(w)) {
        expect(p.effortBand).not.toBe('full');
        expect(p.impact !== null, `${t.id} ${p.exercise}`).toBe(p.section === 'prime');
      }
    }
  });
});

describe('the 4-week wave: weeks 1–3 build, week 4 is easier (FEL\'s choice)', () => {
  // The stated measure (./waves.ts): week 4's working sets are at most WEEK4_MAX_SHARE of week 3's, and week 4's top
  // working band (Cruise) is below week 3's; weeks 1–3 build (working sets never fall, FEL's effort index rises every
  // week); no week grows by more than MAX_WEEKLY_SET_GROWTH.
  it('holds for every program template and every wave; the numbers', () => {
    expect(WEEK4_MAX_SHARE).toBe(0.75);
    expect(MAX_WEEKLY_SET_GROWTH).toBe(0.1);
    const table: Record<string, { sets: number[]; effort: number[]; top: string[] }> = {};
    for (const t of PROGRAMS) for (const wave of [1, 2, 3] as const) {
      const w = expandTemplate(t, { wave });
      const sets = w.map(weekWorkingSets), effort = w.map(weekEffort), top = w.map(weekTopBand);
      if (wave === 1) table[t.id] = { sets, effort, top };
      expect(w.map((x) => x.easier)).toEqual([false, false, false, true]);
      expect(sets[3], `${t.id} w4 vs w3`).toBeLessThan(sets[2]);
      expect(sets[3] / sets[2], `${t.id}`).toBeLessThanOrEqual(WEEK4_MAX_SHARE);
      expect(top[3]).toBe('cruise');
      expect(bandRank(top[3])).toBeLessThan(bandRank(top[2]));
      expect(effort[3]).toBeLessThan(effort[2]);
      expect(sets[1]).toBeGreaterThanOrEqual(sets[0]);
      expect(sets[2]).toBeGreaterThanOrEqual(sets[1]);
      expect(effort[0]).toBeLessThan(effort[1]);
      expect(effort[1]).toBeLessThan(effort[2]);
      for (let k = 1; k < 3; k++) expect((sets[k] - sets[k - 1]) / sets[k - 1], `${t.id} week ${k + 1}`).toBeLessThanOrEqual(MAX_WEEKLY_SET_GROWTH);
    }
    expect(table).toEqual({
      'adult-bw-3': { sets: [46, 49, 49, 28], effort: [248, 343, 367, 140], top: ['drive', 'drive', 'surge', 'cruise'] },
      'adult-bw-4': { sets: [52, 56, 56, 32], effort: [284, 392, 424, 160], top: ['drive', 'drive', 'surge', 'cruise'] },
      'adult-gym-3': { sets: [45, 48, 48, 28], effort: [243, 336, 360, 140], top: ['drive', 'drive', 'surge', 'cruise'] },
      'adult-gym-4': { sets: [52, 56, 56, 32], effort: [284, 392, 424, 160], top: ['drive', 'drive', 'surge', 'cruise'] },
      'youth-bw-3': { sets: [35, 35, 38, 21], effort: [175, 191, 266, 105], top: ['cruise', 'drive', 'drive', 'cruise'] },
      // MIRROR-COACH P8 FIX (2026-09-30): + Thursday's row (2 sets), the Y-T raise 3 → 2 (was sets [27, 27, 29, 16], effort
      // [135, 147, 203, 80]); every rule above still holds (the growth cap, the easier week)
      'youth-bw-2': { sets: [28, 28, 30, 16], effort: [140, 152, 210, 80], top: ['cruise', 'drive', 'drive', 'cruise'] },
    });
  });

  it('jumps never climb: the same sets at Cruise in weeks 1–3, one fewer in week 4', () => {
    for (const t of ADULT) {
      const w = expandTemplate(t);
      const prime = (k: number) => w[k].sessions.flatMap((s) => s.items.filter((p) => p.section === 'prime').map((p) => `${p.exercise} ${p.sets} ${p.effortBand}`));
      expect(prime(1)).toEqual(prime(0));
      expect(prime(2)).toEqual(prime(0));
      expect(prime(3)).toEqual(prime(0).map((x) => x.replace(/ (\d+) cruise$/, (_m, n) => ` ${Math.max(1, Number(n) - 1)} cruise`)));
    }
    for (const w of ADULT_WAVE) expect(w.sets.prime).toBeLessThanOrEqual(0);
  });

  it('the wave line says it is FEL\'s choice, not a medical rule, and says nothing about a body', () => {
    expect(WAVE_LINE).toMatch(/FEL's choice, not a medical rule/);
    expect(WAVE_LINE).toMatch(/week 4 is an easier week/);
    expect(expandTemplate(byId('adult-bw-3')).map((w) => w.label)).toEqual(['Learn the moves', 'Build', 'Build more', 'Easier week']);
  });

  it('the 12-week plan is three waves: adult lifts step one rung up per wave, jumps never, youth weeks never on their own', () => {
    const t = byId('adult-gym-4');
    const key = (wave: 1 | 2 | 3) => expandTemplate(t, { wave })[0].sessions.map((s) => s.items.find((p) => p.isKeySet)!.exercise);
    expect(key(1)).toEqual(['back-squat', 'bb-bench', 'trap-bar-deadlift', 'bb-row']);
    expect(key(2)).toEqual(['back-squat-pause', 'bb-bench-pause', 'barbell-deadlift', 'bb-row-squeeze']);
    expect(key(3)).toEqual(['back-squat-pause', 'bb-bench-pause', 'barbell-deadlift', 'bb-row-squeeze']);   // the top of each ladder
    expect(expandTemplate(t, { wave: 2 }).map((w) => w.week)).toEqual([5, 6, 7, 8]);
    expect(expandTemplate(t, { wave: 3 }).map((w) => w.week)).toEqual([9, 10, 11, 12]);
    expect(expandTemplate(t, { wave: 2 })[0].label).toBe('Step up');
    const primes = (wave: 1 | 2 | 3) => expandTemplate(t, { wave })[0].sessions.flatMap((s) => s.items.filter((p) => p.impact).map((p) => p.exercise));
    expect(primes(3)).toEqual(primes(1));
    const y = byId('youth-bw-3');
    const names = (wave: 1 | 2 | 3) => expandTemplate(y, { wave }).flatMap((w) => items(w).map((p) => p.exercise));
    expect(names(2)).toEqual(names(1));
    expect(expandTemplate(y, { wave: 2 })[0].label).toBe('Start again');
    // a stepped-up rung keeps its own tempo ("3-Second Lower" is its tempo)
    expect(expandTemplate(byId('adult-gym-3'), { wave: 2 })[0].sessions[0].items.find((p) => p.exercise === 'barbell-rdl-slow')!.tempo).toBe('3-0-1-0');
  });

  it('the camp session is one week of one session at the camp\'s own bands', () => {
    const w = expandTemplate(byId('camp-session'), { wave: 3 });
    expect(w).toHaveLength(1);
    expect(w[0].sessions).toHaveLength(1);
    expect([...new Set(items(w[0]).map((p) => p.effortBand))].sort()).toEqual(['cruise', 'drive']);
    expect(templateWeeks(byId('camp-session'))).toBe(1);
  });
});

describe('picking a template', () => {
  it('an adult template needs an adult birth year; a youth or camp template goes to anyone', () => {
    for (const t of ADULT) { expect(templateAllowedFor(t, true)).toBe(false); expect(templateAllowedFor(t, false)).toBe(true); }
    for (const t of YOUTH) { expect(templateAllowedFor(t, true)).toBe(true); expect(templateAllowedFor(t, false)).toBe(true); }
  });

  it('/workout\'s answers → a template: youth rules pick a youth week whatever the equipment, adults their equipment at 3 or 4 days', () => {
    const pick = (daysPerWeek: number, equipment: 'bodyweight' | 'gym', youth: boolean) => templateFor({ daysPerWeek, equipment, youth }).id;
    expect(pick(3, 'gym', true)).toBe('youth-bw-3');
    expect(pick(5, 'bodyweight', true)).toBe('youth-bw-3');
    expect(pick(2, 'gym', true)).toBe('youth-bw-2');
    expect(pick(2, 'bodyweight', false)).toBe('adult-bw-3');
    expect(pick(3, 'bodyweight', false)).toBe('adult-bw-3');
    expect(pick(4, 'bodyweight', false)).toBe('adult-bw-4');
    expect(pick(6, 'gym', false)).toBe('adult-gym-4');
    expect(pick(3, 'gym', false)).toBe('adult-gym-3');
    expect(pick(Number.NaN, 'gym', false)).toBe('adult-gym-3');
    expect(TEMPLATES.map((t) => templateFor({ daysPerWeek: t.daysPerWeek, equipment: t.equipment, youth: t.audience === 'youth' }).id).filter((id) => id === 'camp-session')).toEqual([]);
    expect(templateById('nope')).toBeNull();
    expect(templateById(7)).toBeNull();
  });

  it('a program template\'s days are real weekdays, so /workout\'s week view places them and names the rest off days', () => {
    for (const t of PROGRAMS) {
      const week = fullWeek(t.sessions);
      expect(week, t.id).not.toBeNull();
      expect(week!.filter((d) => d.kind === 'training').length, t.id).toBe(t.daysPerWeek);
    }
  });

  it('programIsBlank: nothing prescribed, nothing opened, no dated week', () => {
    const blank = [{ targetDate: null, sessions: [{ exercises: [] }, { exercises: [] }] }];
    expect(programIsBlank(blank, 0)).toBe(true);
    expect(programIsBlank(blank, 1)).toBe(false);
    expect(programIsBlank([{ targetDate: '2026-10-01T00:00:00.000Z', sessions: [{ exercises: [] }] }], 0)).toBe(false);
    expect(programIsBlank([{ targetDate: null, sessions: [{ exercises: [{}] }] }], 0)).toBe(false);
    expect(programIsBlank([], 0)).toBe(true);
  });
});

describe('the clone plan', () => {
  it('seeds every rung of every ladder a template uses, linked both ways, and writes wave 1 as blocks', () => {
    const t = byId('adult-gym-4');
    const plan = planTemplateClone(t);
    const used = new Set(t.sessions.flatMap((s) => s.items.map((i) => i.exercise)));
    expect(plan.exerciseKeys).toEqual(ladderKeysFor(used));
    for (const k of used) expect(plan.exerciseKeys).toContain(k);
    for (const l of plan.links) {
      if (l.easier) expect(plan.exerciseKeys).toContain(l.easier);
      if (l.harder) expect(plan.exerciseKeys).toContain(l.harder);
    }
    expect(plan.durationWeeks).toBe(4);
    expect(plan.blocks.map((b) => b.label)).toEqual(['Week 1 · Learn the moves', 'Week 2 · Build', 'Week 3 · Build more', 'Week 4 · Easier week']);
    expect(plan.blocks[0].sessions.map((s) => s.label)).toEqual(['Mon · Lower: squat', 'Tue · Upper: press', 'Thu · Lower: deadlift', 'Fri · Upper: row']);
    const camp = planTemplateClone(byId('camp-session'));
    expect([camp.durationWeeks, camp.blocks.map((b) => b.label), camp.blocks[0].sessions.map((s) => s.label)]).toEqual([1, ['Camp'], ['Camp session']]);
    const seeded: Record<string, number> = {};
    for (const x of TEMPLATES) seeded[x.id] = planTemplateClone(x).exerciseKeys.length;
    // MIRROR-COACH P8 FIX (2026-09-30): adult-gym-3 seeds the 3-rung pogo ladder in place of the 4-rung vertical-jump one
    // (54 → 53); the camp's backpack-row ladder replaces its prone ladder (27, unchanged)
    expect(seeded).toEqual({ 'adult-bw-3': 57, 'adult-bw-4': 54, 'adult-gym-3': 53, 'adult-gym-4': 51, 'youth-bw-3': 38, 'youth-bw-2': 38, 'camp-session': 27 });
  });

  it('the picker lines say what a template holds', () => {
    expect(templateShapeLine(byId('adult-bw-4'))).toBe('4 weeks · 4 sessions a week');
    expect(templateShapeLine(byId('camp-session'))).toBe('One session, run as often as the camp meets');
  });
});

describe('copy lint (the IP rule and the honesty rule)', () => {
  // The book (Pain-Free Performance, Rusin & Cordoza) appears only as Education's further reading: none of its names,
  // method names, phase names or program words here. Same list as lib/coach/warmup.test.ts, plus the crossref critic's
  // trademark list and the "pattern pyramid" the matrix borrowed. And the honesty rule: no risk / prevent / injury, no
  // treatment, no diagnosis, never "periodized" or "scored" (P1's /workout fixes).
  const BOOK = /Pain[- ]?Free|Rusin|Cordoza|Victory Belt|biphasic|pin[- ]and[- ]stretch|soft[- ]tissue|nervous[- ]system primer|tension table|PPSC|Linchpin|pyramid|Huff|Tactical Breath|Positional Breath/i;
  const ACRONYMS = /\bRAMP\b|\bPAILs?\b|\bRAILs?\b|\bCARs\b|\bRPR\b/;
  const CLAIMS = /\b(injur\w*|prevent\w*|risks?|reduc\w*|protect\w*|heal\w*|cure\w*|treat\w*|rehab\w*|guarantee\w*|safer|safe|pain\w*|periodi[sz]\w*|scored|deload\w*)\b/i;
  const lint = (text: string) => {
    expect(text, text).not.toMatch(BOOK);
    expect(text, text).not.toMatch(ACRONYMS);
    expect(text, text).not.toMatch(CLAIMS);
    expect(text, text).not.toMatch(/diagnos|prescri/i);
    expect(screenText(text), text).toEqual([]);
  };

  it('every template line, every exercise row, every wave label and every picker line passes', () => {
    const seen = new Set<string>();
    for (const t of TEMPLATES) for (const s of templateText(t)) seen.add(s);
    for (const e of TEMPLATE_EXERCISES) [e.catalogue.name, ...e.catalogue.primaryCues, ...e.catalogue.commonFaults.flatMap((f) => [f.fault, f.correctionCue]), ...e.catalogue.equipment].forEach((s) => seen.add(s));
    for (const w of [...ADULT_WAVE, ...YOUTH_WAVE]) seen.add(w.label);
    [WAVE_LINE, ADULT_TEMPLATE_LINE, CLONE_LINE, dailyTargetLine(60), 'Step up', 'Start again',
      ...['template_not_found', 'template_adults_only', 'program_not_empty', 'template_invalid', 'template_name_taken_fel'].map((k) => BUILDER_ERROR_COPY[k]),
      ...TEMPLATES.map(templateShapeLine)].forEach((s) => seen.add(s));
    for (const t of TEMPLATES) for (const w of allWeeks(t)) for (const p of items(w)) seen.add(doseLine(p));
    seen.forEach(lint);
    expect(seen.size).toBeGreaterThan(400);
    for (const k of ['template_not_found', 'template_adults_only', 'program_not_empty', 'template_invalid', 'template_name_taken_fel']) expect(BUILDER_ERROR_COPY[k], k).toBeTruthy();
  });

  it('the lint is live (negative controls)', () => {
    expect(() => lint('A periodized block')).toThrow();
    expect(() => lint('Reduces the risk of a knee injury')).toThrow();
    expect(() => lint('The Pain-Free way')).toThrow();
    expect(() => lint('Fixes your knee')).toThrow();
  });
});


// ── MIRROR-COACH P8 FIX (2026-09-30, code review) ────────────────────────────────────────────────────────────────────

/** What a template's equipment line must say for each catalogue equipment word (any one of the words names it). */
const EQUIPMENT_WORDS: Record<string, string[]> = {
  barbell: ['barbell'], 'squat rack': ['rack'], bench: ['bench'], 'spotter or safeties': ['safeties', 'spotter'], landmine: ['landmine'],
  'bench or sturdy table': ['bench', 'table'], box: ['box'], 'plyo box': ['plyo box'], 'dumbbell or kettlebell': ['dumbbell', 'kettlebell'],
  dumbbell: ['dumbbell'], dumbbells: ['dumbbell'], 'kettlebell or dumbbell': ['kettlebell', 'dumbbell'], kettlebell: ['kettlebell'],
  kettlebells: ['two kettlebells'], 'cable or band': ['cable', 'band'], cable: ['cable'], rope: ['rope'], 'lat pulldown': ['lat pulldown'],
  'pull-up bar': ['pull-up bar'], band: ['band'], 'trap bar': ['trap bar'], backpack: ['backpack'], chair: ['chair'], 'step or chair': ['step', 'chair'],
  'sturdy door frame': ['door frame'], towel: ['towel'], 'one bag': ['bag'], 'two bags': ['two bags'],
};

describe('THE EQUIPMENT LINE NAMES EVERYTHING THE WEEKS USE (major: adult-gym-3 left out the trap bar, the pull-up bar and band)', () => {
  it('every catalogue equipment word has a reading (a new word must be added here, on purpose)', () => {
    for (const e of TEMPLATE_EXERCISES) for (const q of e.catalogue.equipment) expect(EQUIPMENT_WORDS[q], `${e.key}: ${q}`).toBeDefined();
  });
  for (const t of TEMPLATES) {
    it(`${t.id}: every item of every wave it writes is covered by "${t.equipmentLine}"`, () => {
      const line = t.equipmentLine.toLowerCase();
      const missing = new Set<string>();
      for (const w of allWeeks(t)) for (const p of items(w)) for (const q of templateExercise(p.exercise)!.catalogue.equipment) {
        if (!EQUIPMENT_WORDS[q].some((word) => line.includes(word))) missing.add(`${q} (${p.exercise}, week ${w.week})`);
      }
      expect([...missing]).toEqual([]);
    });
  }
  it('the check is live (negative control: the old adult-gym-3 line)', () => {
    const old = 'barbell and rack, dumbbells, a kettlebell, a cable stack, a lat pulldown, a bench and a low plyo box.';
    expect(EQUIPMENT_WORDS['trap bar'].some((w) => old.includes(w))).toBe(false);
    expect(EQUIPMENT_WORDS['pull-up bar'].some((w) => old.includes(w))).toBe(false);
  });
});

describe('A ONE-SIDED RUNG SAYS "EACH SIDE" IN EVERY WAVE; A TWO-SIDED ONE DOES NOT (minor: step-ups kept the rung below\'s text)', () => {
  it('every prescription of every template in every wave', () => {
    for (const t of TEMPLATES) for (const w of allWeeks(t)) for (const p of items(w)) {
      const at = `${t.id} week ${w.week} ${p.exercise} "${p.reps}"`;
      if (isUnilateral(p.exercise)) expect(p.reps, at).toMatch(/each side/);
      else expect(p.reps, at).not.toMatch(/each side/);
    }
  });
  it('the measured cases: a door row onto the one-arm rung, a farmer carry onto the suitcase, a one-arm row onto the barbell', () => {
    const w2 = (id: string) => expandTemplate(byId(id), { wave: 2 });
    const find = (id: string, key: string) => w2(id).flatMap(items).find((p) => p.exercise === key)!;
    expect(find('youth-bw-3', 'door-row').reps).toBe('10');                        // youth weeks never move
    expect(find('adult-bw-4', 'door-row-single').reps).toBe('10 each side');       // Tue's door row, stepped up
    expect(find('adult-bw-3', 'suitcase-carry').reps).toBe('40 s each side');
    expect(find('adult-gym-3', 'db-suitcase-carry').reps).toBe('40 s each side');
    expect(w2('adult-gym-3')[0].sessions[0].items.find((p) => p.exercise === 'bb-row')!.reps).toBe('10');
    expect(sidedReps('10', 'door-row', 'door-row')).toBe('10');
    expect(sidedReps('6 each side', 'sl-rdl-supported', 'sl-rdl-free')).toBe('6 each side');
  });
});

describe('THE 12-WEEK PLAN, AS SOLD (major: its line promised a step up in wave 3 for every adult lift)', () => {
  const moves = (t: ProgramTemplate, a: 1 | 2 | 3, b: 1 | 2 | 3) => {
    const x = expandTemplate(t, { wave: a })[0].sessions.flatMap((s) => s.items);
    const y = expandTemplate(t, { wave: b })[0].sessions.flatMap((s) => s.items);
    return x.map((p, i) => ({ from: p.exercise, to: y[i].exercise, impact: p.impact }));
  };
  it('adults: every lift that does not land moves one step in wave 2; in wave 3 it moves again exactly where its ladder has a step left', () => {
    const measured: Record<string, string> = {};
    for (const t of ADULT) {
      const m12 = moves(t, 1, 2), m23 = moves(t, 2, 3);
      for (const m of m12) {
        if (m.impact) expect(m.to, `${t.id} ${m.from}`).toBe(m.from);
        else expect(m.to, `${t.id} ${m.from}`).toBe(harderKey(m.from));
      }
      for (const m of m23) {
        if (m.impact) expect(m.to).toBe(m.from);
        else expect(m.to, `${t.id} ${m.from}`).toBe(harderKey(m.from) ?? m.from);
      }
      measured[t.id] = `${m23.filter((m) => m.to !== m.from).length} of ${m23.length}`;
    }
    // weeks 9–12 are mostly weeks 5–8 again: said in the line, not hidden (the finding measured 5–6 of 20–22)
    expect(measured).toEqual({ 'adult-bw-3': '5 of 21', 'adult-bw-4': '5 of 22', 'adult-gym-3': '5 of 20', 'adult-gym-4': '6 of 22' });
  });
  it('the line says exactly that, and that it is for adults', () => {
    const line = WORKOUT_PRODUCTS.find((p) => p.tier === 'program_12w')!.line;
    expect(line).toMatch(/second wave each lift that does not land moves one step up its ladder/);
    expect(line).toMatch(/in the third it moves again where its ladder has a step left/);
    expect(line).toMatch(/for adults/);
  });
  it('a youth template\'s 12 weeks would be its 4 weeks three times — so the 12-week plan is not sold to a youth reader', () => {
    for (const t of YOUTH.filter((x) => x.kind === 'program')) {
      const w = (wave: 1 | 2 | 3) => JSON.stringify(expandTemplate(t, { wave }).map((x) => x.sessions));
      expect(w(2)).toBe(w(1));
      expect(w(3)).toBe(w(1));
    }
    expect(productsFor('youth').map((p) => p.tier)).toEqual(['plan_4w']);
    expect(productsFor('adult').map((p) => p.tier)).toEqual(['plan_4w', 'program_12w']);
  });
});

describe('THE WAVE BOUNDARY (minor: the growth-cap comment claimed every week)', () => {
  it('week 5 and week 9 come back to exactly week 1\'s working sets — the easier week\'s return, never past week 1', () => {
    const back: Record<string, string> = {};
    for (const t of PROGRAMS) {
      const s = (wave: 1 | 2 | 3, k: number) => weekWorkingSets(expandTemplate(t, { wave })[k]);
      expect(s(2, 0), t.id).toBe(s(1, 0));
      expect(s(3, 0), t.id).toBe(s(1, 0));
      back[t.id] = `${s(1, 3)} → ${s(2, 0)}`;
    }
    expect(back['adult-bw-3']).toBe('28 → 46');
    expect(back['adult-bw-4']).toBe('32 → 52');
  });
});

describe('REAL PULLING (minor: the camp session\'s only pull was a Prone Y-T Raise)', () => {
  const PRONE = new Set(ladderOf('prone-yt')!.rungs.map((r) => r.key));
  it('every session with a push has a row or a pull-down in it (a prone raise is not one)', () => {
    for (const t of TEMPLATES) for (const w of allWeeks(t)) for (const s of w.sessions) {
      const pushes = s.items.some((p) => p.pattern === 'push');
      const rows = s.items.some((p) => p.pattern === 'pull' && !PRONE.has(p.exercise));
      if (pushes) expect(rows, `${t.id} week ${w.week} ${s.label}`).toBe(true);
    }
  });
  it('every week, the rows alone (prone raises left out) are at least the presses', () => {
    for (const t of TEMPLATES) for (const w of allWeeks(t)) {
      const work = items(w).filter((p) => p.section !== 'prime');
      const sum = (f: (p: TemplatePrescription) => boolean) => work.filter(f).reduce((n, p) => n + p.sets, 0);
      expect(sum((p) => p.pattern === 'pull' && !PRONE.has(p.exercise)), `${t.id} week ${w.week}`).toBeGreaterThanOrEqual(sum((p) => p.pattern === 'push'));
    }
  });
});

describe("NO BOX IN ANY TEMPLATE (the owner's Playbook ch6: a pogo base before high boxes or depth jumps)", () => {
  it('no template, in any wave, programs a box jump or a depth drop; the box jump stays on its ladder for a coach', () => {
    for (const t of TEMPLATES) for (const w of allWeeks(t)) for (const p of items(w)) {
      expect(['box-jump-stick', 'low-box-depth-drop'], `${t.id} week ${w.week}`).not.toContain(p.exercise);
    }
    expect(harderKey('cmj-stick')).toBe('box-jump-stick');
  });
  it('the gym templates open Monday with the pogo base (3-day) or the countermovement jump (4-day, pogos on Thursday)', () => {
    expect(byId('adult-gym-3').sessions[0].items[0]).toMatchObject({ exercise: 'pogo-hops', reps: '20 contacts' });
    expect(byId('adult-gym-4').sessions[0].items[0].exercise).toBe('cmj-stick');
    expect(byId('adult-gym-4').sessions[2].items[0].exercise).toBe('pogo-hops');
  });
});
