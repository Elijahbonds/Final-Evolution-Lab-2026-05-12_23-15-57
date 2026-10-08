// MIRROR-COACH P8 (2026-09-29): the /workout relaunch, the pure half (lib/workout/relaunch.ts, plan-sale.ts). What a plan
// is now — a FEL template matched to the answers, stored as its weeks — what it can never hold (a depth drop in any
// week, for anyone; any jump at all for youth or a blank birth year), how it reads behind the protocol gate, the prices
// it is sold at (the same as before P1 pulled it), and the words. The route, with the real spend(), is
// relaunch-route.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { patternCoverage, pullPushCheck, type PatternedItem } from '@/lib/coach/coverage';
import { TEMPLATES, WAVE_LINE, templateFor, templateProblems } from '@/lib/coach/templates';
import { templateExercise } from '@/lib/coach/templateCatalogue';
import { EFFORT_BANDS } from '@/lib/coach/taxonomy';
import {
  LANDING_CHECK_HREF, LANDING_CHECK_WEEKS, PROTOCOL_WHY, heldLine, isProtocolGated, swappedLine, type ProtocolReason,
} from '@/lib/coach/protocolGate';
import { CATALOG, NOT_ON_SALE, SPEND_ROUTE_SKUS, getSku, skuOnSale } from '@/lib/wallet/catalog';
import { screenText } from '@/lib/share/screen';
import { isDepthDrop } from './plan-generator';
import { isPlyometric, planRevisionNote, reviseDepthDrops, reviseForYouth, revisePlan, revisePlanForStorage, undoYouthRevision } from './plan-revision';
import {
  WORKOUT_AGE_NEEDED_LINE, WORKOUT_AGE_UNREAD, WORKOUT_TEMPLATE_CHANGED, unfinishedLine,
  DAY_CHOICES, PLAN_SALE_PAUSED, RELAUNCH_FREE_LINE, WORKOUT_CHECK_FAILED, WORKOUT_FREE_LINE, WORKOUT_INTRO, WORKOUT_JUMP_LINE,
  WORKOUT_PLAN_NOT_SAVED, WORKOUT_PLAN_SKUS, WORKOUT_PRODUCTS, WORKOUT_YOUTH_LINE, parseAnswers, type WorkoutAnswers, type WorkoutTier,
} from './plan-sale';
import {
  GATE_UNREAD_LINE, GATE_UNREAD_REASON, TEMPLATE_PLAN_SOURCE, easierReps, gatedPlanView, hasGatedItem, isGatedTemplateItem, isTemplatePlan,
  pickTemplate, templateIdOf, templatePlanWeeks, type TemplatePlanWeek,
} from './relaunch';

const ANSWERS: WorkoutAnswers[] = ([2, 3, 4] as const).flatMap((daysPerWeek) => (['bodyweight', 'gym'] as const).map((equipment) => ({ daysPerWeek, equipment })));
const TIERS: WorkoutTier[] = ['plan_4w', 'program_12w'];
const items = (weeks: readonly TemplatePlanWeek[]) => weeks.flatMap((w) => w.sessions.flatMap((s) => s.items));
/** Every plan /workout can sell: every answer × both products × adult and youth. */
const everyPlan = () => ANSWERS.flatMap((a) => TIERS.flatMap((tier) => [false, true].map((youth) => {
  const t = pickTemplate(a, youth);
  return { a, tier, youth, t, weeks: templatePlanWeeks(t, tier) };
})));

describe('the prices: the same shard prices as before, back on sale (owner decision #24)', () => {
  it('both SKUs are on sale at 60 and 200 shards, the prices they carried when P1 pulled them', () => {
    // the prices in lib/wallet/catalog.ts at dbb4e91c (P1) and before it; neither CATALOG row changed
    expect(getSku('workout_plan_4w')).toEqual({ skuId: 'workout_plan_4w', currency: 'shards', unitPrice: 60, consumable: true });
    expect(getSku('workout_program_12w')).toEqual({ skuId: 'workout_program_12w', currency: 'shards', unitPrice: 200, consumable: true });
    for (const sku of WORKOUT_PLAN_SKUS) {
      expect(skuOnSale(sku), sku).toBe(true);
      expect(NOT_ON_SALE.has(sku), sku).toBe(false);
      // still never the generic spend route's: it would take the shards and write no plan
      expect(SPEND_ROUTE_SKUS.has(sku), sku).toBe(false);
      expect(CATALOG[sku], sku).toBeDefined();
    }
  });

  it('the two products are the two SKUs, stored under the tiers the dead-buy sweep matches (plan_4w, program_12w)', () => {
    expect(WORKOUT_PRODUCTS.map((p) => [p.sku, p.tier, p.weeks, p.waves])).toEqual([
      ['workout_plan_4w', 'plan_4w', 4, 1], ['workout_program_12w', 'program_12w', 12, 3],
    ]);
  });
});

describe('what a plan is: a FEL template matched to the answers (P8 rule (c))', () => {
  it('the answers pick the template; youth (the server\'s age truth) always gets a youth template whatever the page sends', () => {
    expect(pickTemplate({ daysPerWeek: 3, equipment: 'bodyweight' }, false).id).toBe('adult-bw-3');
    expect(pickTemplate({ daysPerWeek: 4, equipment: 'bodyweight' }, false).id).toBe('adult-bw-4');
    expect(pickTemplate({ daysPerWeek: 3, equipment: 'gym' }, false).id).toBe('adult-gym-3');
    expect(pickTemplate({ daysPerWeek: 4, equipment: 'gym' }, false).id).toBe('adult-gym-4');
    expect(pickTemplate({ daysPerWeek: 4, equipment: 'gym' }, true).id).toBe('youth-bw-3');
    expect(pickTemplate({ daysPerWeek: 2, equipment: 'gym' }, true).id).toBe('youth-bw-2');
    for (const a of ANSWERS) {
      expect(pickTemplate(a, true).audience, JSON.stringify(a)).toBe('youth');
      expect(pickTemplate(a, false).audience, JSON.stringify(a)).toBe('adult');
      expect(pickTemplate(a, true).kind).toBe('program');                    // the camp session is a coach's, never sold
    }
    // the page's day choices are what a template exists for
    for (const d of DAY_CHOICES.adult) expect(templateFor({ daysPerWeek: d, equipment: 'bodyweight', youth: false }).daysPerWeek).toBe(d);
    for (const d of DAY_CHOICES.youth) expect(templateFor({ daysPerWeek: d, equipment: 'bodyweight', youth: true }).daysPerWeek).toBe(d);
  });

  it('every template it can pick passes every template check (six patterns, pull ≥ push, ladders, bands)', () => {
    const picked = new Set(everyPlan().map((p) => p.t));
    expect(picked.size).toBe(6);
    for (const t of picked) expect(templateProblems(t), t.id).toEqual([]);
  });

  it('the 4-week plan is one wave (week 4 easier), the 12-week plan three (weeks 4, 8 and 12 easier)', () => {
    for (const { tier, weeks, t } of everyPlan()) {
      expect(weeks.map((w) => w.week), `${t.id} ${tier}`).toEqual(Array.from({ length: tier === 'plan_4w' ? 4 : 12 }, (_, i) => i + 1));
      expect(weeks.filter((w) => w.easier).map((w) => w.week)).toEqual(tier === 'plan_4w' ? [4] : [4, 8, 12]);
      for (const w of weeks) {
        expect(w.source).toBe(TEMPLATE_PLAN_SOURCE);
        expect(w.template).toBe(t.id);
        expect(w.sessions).toHaveLength(t.daysPerWeek);
      }
      expect(isTemplatePlan(weeks)).toBe(true);
      expect(templateIdOf(weeks)).toBe(t.id);
    }
  });

  it('EVERY WEEK OF EVERY PLAN SOLD covers the six patterns and pulls at least as much as it presses (P2\'s own checks)', () => {
    for (const { weeks, t, tier } of everyPlan()) {
      for (const w of weeks) {
        const pat = (i: TemplatePlanWeek['sessions'][number]['items'][number]): PatternedItem => ({ pattern: templateExercise(i.exercise)!.catalogue.pattern, section: i.section, sets: i.sets });
        const all = w.sessions.flatMap((s) => s.items.map(pat));
        const strip = patternCoverage(all, w.sessions.map((s) => s.items.map(pat)));
        expect(strip.cells.filter((c) => c.state !== 'done').map((c) => c.pattern), `${t.id} ${tier} week ${w.week}`).toEqual([]);
        expect(pullPushCheck(all), `${t.id} ${tier} week ${w.week}`).toBeNull();
      }
    }
  });

  it('NO DEPTH DROP IN ANY WEEK FOR ANYONE (so none in week 1), by name, by key and by the gate\'s own test', () => {
    let checked = 0;
    for (const { weeks } of everyPlan()) {
      for (const it of items(weeks)) {
        checked++;
        expect(isDepthDrop(it), it.name).toBe(false);
        expect(templateExercise(it.exercise)!.impact, it.exercise).not.toBe('depth_drop');
      }
      expect(items(weeks.filter((w) => w.week === 1)).filter(isDepthDrop)).toEqual([]);
    }
    expect(checked).toBeGreaterThan(2000);
  });

  it('YOUTH OR A BLANK BIRTH YEAR: no jump, hop, bound, drop or landing drill in any week — by every detector FEL has', () => {
    for (const { weeks, youth, t } of everyPlan()) {
      if (!youth) continue;
      for (const it of items(weeks)) {
        expect(isGatedTemplateItem(it), `${t.id} ${it.name}`).toBe(false);
        expect(isPlyometric(it), it.name).toBe(false);
        expect(isProtocolGated(templateExercise(it.exercise)!.catalogue), it.name).toBe(false);
        expect(it.section).not.toBe('prime');
        expect(['cruise', 'drive']).toContain(it.effortBand);                // youth bands stop at Drive, never Full throttle
      }
      expect(hasGatedItem(weeks)).toBe(false);
    }
  });

  it('an adult plan holds its jumps only in Prime, marked gated, and never above Cruise; no band anywhere is Full throttle', () => {
    for (const { weeks, youth } of everyPlan()) {
      if (youth) continue;
      expect(hasGatedItem(weeks)).toBe(true);
      for (const it of items(weeks)) {
        if (it.gated) { expect(it.section).toBe('prime'); expect(it.effortBand).toBe('cruise'); }
        expect(it.effortBand).not.toBe('full');
        expect(EFFORT_BANDS.map((b) => b.id)).toContain(it.effortBand);
      }
    }
  });

  it('the old revision passes a template plan through untouched (it holds `sessions`, not `days`), for any reader', () => {
    for (const { weeks } of everyPlan().slice(0, 8)) {
      const copy = JSON.parse(JSON.stringify(weeks));
      for (const f of [reviseDepthDrops, reviseForYouth, undoYouthRevision, revisePlanForStorage]) expect(f(copy).changed).toBe(false);
      expect(revisePlan(copy, 'youth').changed).toBe(false);
      expect(revisePlan(copy, 'adult').weeks).toBe(copy);
      expect(planRevisionNote(copy)).toBeNull();
    }
  });

  it('the old generator writes nothing new: neither the purchase route nor its server half calls it', () => {
    for (const f of ['../../app/api/v1/workout/plan/route.ts', './relaunchServer.ts', './relaunch.ts']) {
      const code = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/generatePlan|legacyWeeks|rotatedWeek/);
    }
  });

  it('a camp template is never a /workout plan', () => {
    expect(() => templatePlanWeeks(TEMPLATES.find((t) => t.kind === 'camp')!, 'plan_4w')).toThrow(/not a program/);
  });
});

describe('the answers a request may carry', () => {
  it('exactly what the page sends, or null', () => {
    expect(parseAnswers({ daysPerWeek: 3, equipment: 'gym' })).toEqual({ daysPerWeek: 3, equipment: 'gym' });
    for (const bad of [null, [], {}, { daysPerWeek: 5, equipment: 'gym' }, { daysPerWeek: '3', equipment: 'gym' }, { daysPerWeek: 3, equipment: 'home' }, { daysPerWeek: 1, equipment: 'bodyweight' }]) {
      expect(parseAnswers(bad), JSON.stringify(bad)).toBeNull();
    }
  });
  it("MIRROR-COACH P8 FIX: with the reader's audience, only the days the page offers it (DAY_CHOICES)", () => {
    for (const d of [2, 3, 4] as const) {
      expect(parseAnswers({ daysPerWeek: d, equipment: 'gym' }, 'adult') !== null, `adult ${d}`).toBe((DAY_CHOICES.adult as readonly number[]).includes(d));
      expect(parseAnswers({ daysPerWeek: d, equipment: 'bodyweight' }, 'youth') !== null, `youth ${d}`).toBe((DAY_CHOICES.youth as readonly number[]).includes(d));
    }
  });
});

describe('the protocol gate, at read time (P8 rule (b))', () => {
  const adult = () => templatePlanWeeks(pickTemplate({ daysPerWeek: 3, equipment: 'bodyweight' }, false), 'plan_4w');
  const prime = (v: ReturnType<typeof gatedPlanView>, week = 1, session = 1) => v.weeks[week - 1].sessions[session - 1].items[0];

  it('OPEN (no reasons): every jump shows as written, with no line', () => {
    const v = gatedPlanView(adult(), []);
    expect(v.gatedItems).toBe(12);                                          // 3 days × 4 weeks, one jump a day
    expect(v.swapped + v.held).toBe(0);
    expect(prime(v)).toMatchObject({ exercise: 'cmj-stick', name: 'Countermovement Jump and Stick', dose: '3 × 3 jumps · Cruise' });
    expect(prime(v).gate).toBeUndefined();
  });

  it('SHUT: the jump becomes the first rung below that does not land, with the gate\'s one line and link; nothing held', () => {
    for (const reason of ['landing_never', 'landing_old', 'landing_fault', 'no_health_consent', 'intake_missing', 'red_flag', 'pain_today', 'minor', 'age_unknown'] as ProtocolReason[]) {
      const v = gatedPlanView(adult(), [reason]);
      expect(v.swapped, reason).toBe(12);
      expect(v.held, reason).toBe(0);
      const p = prime(v);
      expect(p.exercise, reason).toBe('fast-bw-squat');
      expect(isProtocolGated(templateExercise(p.exercise)!.catalogue)).toBe(false);
      expect(p.gate, reason).toMatchObject({ from: { id: 'cmj-stick', name: 'Countermovement Jump and Stick' }, line: swappedLine('Countermovement Jump and Stick', PROTOCOL_WHY[reason]), reason });
    }
    const v = gatedPlanView(adult(), ['landing_never']);
    expect(prime(v).gate!.href).toBe(LANDING_CHECK_HREF);
    // the count stays, the jump noun goes; sets, rest and band are the jump's
    expect(prime(v).dose).toBe('3 × 3 · Cruise');
    expect(prime(v, 1, 2)).toMatchObject({ exercise: 'lateral-step-stick', dose: '3 × 3 each side · Cruise' });
    expect(prime(v, 1, 3)).toMatchObject({ exercise: 'hip-snap' });
  });

  it('a youth reason is never lifted on /workout: a FEL template the athlete bought is not a coach\'s assignment', () => {
    const v = gatedPlanView(adult(), ['minor']);
    expect(v.swapped).toBe(12);
    expect(prime(v).gate!.line).toContain(PROTOCOL_WHY.minor);
  });

  it('every jump in every adult plan sold has an ungated step: under any shut gate it is swapped, never held', () => {
    for (const { weeks, youth } of everyPlan()) {
      if (youth) continue;
      const v = gatedPlanView(weeks, ['landing_never']);
      expect(v.held).toBe(0);
      expect(v.swapped).toBe(v.gatedItems);
      for (const w of v.weeks) for (const s of w.sessions) for (const it of s.items) expect(isGatedTemplateItem(it), it.name).toBe(false);
    }
  });

  it('UNREAD (the facts could not be read): the careful direction — the easier step, with FEL\'s own line', () => {
    const v = gatedPlanView(adult(), GATE_UNREAD_REASON);
    expect(v.swapped).toBe(12);
    expect(prime(v).gate).toEqual({ from: { id: 'cmj-stick', name: 'Countermovement Jump and Stick' }, line: swappedLine('Countermovement Jump and Stick', GATE_UNREAD_LINE), href: null, reason: GATE_UNREAD_REASON });
  });

  it('a stored item this catalogue no longer knows, marked gated or named a depth drop, is held back (no ladder to walk)', () => {
    const weeks = adult();
    weeks[0].sessions[0].items[0] = { ...weeks[0].sessions[0].items[0], exercise: 'retired-rung', name: 'Depth Drop to Vertical' };
    const v = gatedPlanView(weeks, ['landing_never']);
    expect(v.held).toBe(1);
    expect(v.weeks[0].sessions[0].held[0]).toMatchObject({ name: 'Depth Drop to Vertical', line: heldLine('Depth Drop to Vertical', PROTOCOL_WHY.landing_never) });
    expect(v.weeks[0].sessions[0].items.map((i) => i.name)).not.toContain('Depth Drop to Vertical');
  });

  it('a youth plan has nothing for the gate to decide', () => {
    const weeks = templatePlanWeeks(pickTemplate({ daysPerWeek: 3, equipment: 'bodyweight' }, true), 'program_12w');
    expect(gatedPlanView(weeks, ['minor'])).toMatchObject({ gatedItems: 0, swapped: 0, held: 0 });
  });

  it('easierReps keeps the count and drops the jump noun', () => {
    expect(easierReps('3 jumps')).toBe('3');
    expect(easierReps('20 contacts')).toBe('20');
    expect(easierReps('2 jumps')).toBe('2');
    expect(easierReps('3 each side')).toBe('3 each side');
    expect(easierReps('jumps')).toBe('jumps');
  });
});

describe('the words (P8 rule (c) and the honesty rule): FEL\'s draft, for the owner to approve', () => {
  const BOOK = /Pain[- ]?Free|Rusin|Cordoza|Victory Belt|biphasic|pin[- ]and[- ]stretch|nervous[- ]system primer|tension table|PPSC|Linchpin|pyramid/i;
  const BANNED = /periodi[sz]|\bscor(e|ed|es|ing)\b|\bclear(ed|s)?\b|\bsafe(ty|ly|r)?\b|prevent|injur|\brisks?\b|reduc|diagnos|treat|prescri|personali[sz]ed|guarantee|\bAI\b/i;
  const LINES = [
    WORKOUT_INTRO, WORKOUT_JUMP_LINE, WORKOUT_YOUTH_LINE, WORKOUT_FREE_LINE, WORKOUT_CHECK_FAILED, WORKOUT_PLAN_NOT_SAVED,
    RELAUNCH_FREE_LINE, GATE_UNREAD_LINE, WAVE_LINE, ...WORKOUT_PRODUCTS.flatMap((p) => [p.name, p.line]),
    // MIRROR-COACH P8 FIX (2026-09-30): the new lines
    WORKOUT_AGE_NEEDED_LINE, WORKOUT_AGE_UNREAD, WORKOUT_TEMPLATE_CHANGED, ...WORKOUT_PRODUCTS.map((p) => unfinishedLine(p.name)),
  ];

  it('says what it is — "a FEL template matched to your answers" — and names the waves as FEL\'s choice', () => {
    expect(WORKOUT_INTRO).toMatch(/^A FEL template matched to your answers/);
    expect(WAVE_LINE).toMatch(/FEL's choice, not a medical rule/);
  });

  it('never "periodized", never "scored", no claims, no book words, and passes lib/share/screen.ts', () => {
    for (const l of LINES) {
      expect(l, l).not.toMatch(BANNED);
      expect(l, l).not.toMatch(BOOK);
      expect(screenText(l), l).toEqual([]);
      expect(l, l).not.toMatch(/\n/);
    }
  });

  it('the lint is live (negative controls)', () => {
    for (const bad of ['A periodized block', 'Scored against your screen', 'Cleared for jumps', 'Reduces the risk of injury']) expect(bad).toMatch(BANNED);
  });

  it('the jump line\'s weeks are the gate\'s LANDING_CHECK_WEEKS, and the free line is the one the old notes carry', () => {
    expect(WORKOUT_JUMP_LINE).toContain(`last ${LANDING_CHECK_WEEKS} weeks`);
    // MIRROR-COACH P8 FIX (2026-09-30): the gate also holds jumps on a flag or a "yes" in the answers — the line says so
    // (it listed fewer conditions than the gate checks, so an adult with a cleared flag met every one and saw no jump)
    expect(WORKOUT_JUMP_LINE).toMatch(/hold nothing that keeps jumps back/);
    expect(RELAUNCH_FREE_LINE).not.toMatch(/when .* ship/i);                 // the promise is kept: they shipped
    expect(PLAN_SALE_PAUSED).toBe('The training plan is being rebuilt; it will be back with real programs.');   // P1's, kept for its probe
  });
});
