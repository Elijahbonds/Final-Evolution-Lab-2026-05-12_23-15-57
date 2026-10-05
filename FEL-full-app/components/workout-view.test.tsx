import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyzeMovement, defaultMetrics } from '@/lib/workout/movement-screen';
import { generatePlan, legacyWeeks } from '@/lib/workout/plan-generator';
import { HELD_LINE, PLAN_REVISED_NOTE, PLAN_REVISED_NOTE_YOUTH, planRevisionNote, reviseDepthDrops, revisePlan } from '@/lib/workout/plan-revision';
import {
  PLAN_SALE_PAUSED, WORKOUT_AGE_HREF, WORKOUT_AGE_NEEDED_LINE, WORKOUT_AGE_UNREAD, WORKOUT_CHECK_FAILED, WORKOUT_FREE_LINE, WORKOUT_INTRO,
  WORKOUT_JUMP_LINE, WORKOUT_PRODUCTS, WORKOUT_YOUTH_LINE, unfinishedLine,
} from '@/lib/workout/plan-sale';
import type { OfferProduct, WorkoutOffer } from '@/lib/workout/relaunchServer';
import { gatedPlanView, pickTemplate, templatePlanWeeks } from '@/lib/workout/relaunch';
import { PROTOCOL_WHY, swappedLine } from '@/lib/coach/protocolGate';
import { WAVE_LINE } from '@/lib/coach/templates/waves';
import { dailyTargetLine } from '@/lib/coach/templates/list';
import { screenText } from '@/lib/share/screen';
import { DEMO_CONSENT, demoScan, SavedPlans, WorkoutView, type SavedPlan } from './workout-view';
import { OFF_DAY_WEEK_LINE } from '@/lib/coach/offDay';

// /workout has no camera capture. Its "scan" used to POST random numbers to /api/v1/workout/scan, which stored them
// as a real WorkoutScan — and playerIdentity reads the newest scan's avatarSpec as a measured body. What it shows now
// is a demo worked out on the page and never sent.
const src = readFileSync(new URL('./workout-view.tsx', import.meta.url), 'utf8');
// the code without its comments, which quote the old copy on purpose to say what was wrong with it
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('WorkoutView, the demo scan', () => {
  it('posts nothing to the scan route: the only call left there is delete-my-data', () => {
    const methods = [...src.matchAll(/fetch\('\/api\/v1\/workout\/scan',\s*\{\s*method:\s*'(\w+)'/g)].map((m) => m[1]);
    expect(methods).toEqual(['DELETE']);
  });

  it('invents no numbers', () => {
    expect(src).not.toMatch(/Math\.random/);
    expect(demoScan()).toEqual(demoScan());
  });

  it('shows the sample baseline, the numbers every plan sold here was planned from', () => {
    // The page sent no scanId, so the plan route planned every plan from defaultMetrics() (Mobility focus) until the
    // sale was pulled on 2026-09-25. The demo shows those same sample numbers.
    expect(demoScan().analysis).toEqual(analyzeMovement(defaultMetrics()));
  });

  it('delete says what the route deletes (every saved scan and plan, Mirror history included), asks first, and checks the answer', () => {
    // DELETE /api/v1/workout/scan runs workoutPlan.deleteMany + workoutScan.deleteMany for the user: the Mirror's dunk
    // history (kind 'dunk') and screens live in WorkoutScan. The old line said "cleared from this session".
    const route = readFileSync(new URL('../app/api/v1/workout/scan/route.ts', import.meta.url), 'utf8');
    expect(route).toMatch(/workoutScan\.deleteMany\(\{ where: \{ userId \} \}\)/);
    expect(src).not.toMatch(/cleared from this session/);
    expect(src).toMatch(/window\.confirm\([\s\S]*Mirror dunk history[\s\S]*workout plans you bought/);
    expect(src).toMatch(/deleted = res\.ok/);
  });

  it('says it is a demo on the button', () => {
    const m = renderToStaticMarkup(createElement(WorkoutView));
    expect(m).toContain('Run Demo Scan');
    expect(m).not.toContain('Run System Scan');
    expect(m).not.toMatch(/Scan your movement, meet your mini-avatar/);   // the intro promised a scan of your body
    expect(m).toMatch(/DEMO|demo/);
  });
});

// MIRROR-COACH P1 (2026-09-25), owner decision #3: /workout's plans were pulled from sale, buyers kept theirs (revised
// on read, with a note), and the page stopped promising what is not there.
// MIRROR-COACH P8 (2026-09-29), owner decisions #3, #24: THE RELAUNCH. P1's "offers nothing to buy" pins are FLIPPED ON
// PURPOSE — the page sells again, at the same prices, a FEL template matched to the answers. What P1 took out stays out.
describe('WorkoutView, the relaunch', () => {
  const page = renderToStaticMarkup(createElement(WorkoutView));
  const text = page.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

  it('says what a plan is — a FEL template matched to your answers — and the waves as FEL\'s choice; the paused line is gone', () => {
    expect(text).toContain(WORKOUT_INTRO);
    expect(WORKOUT_INTRO).toMatch(/^A FEL template matched to your answers/);
    expect(text).toContain(WAVE_LINE);
    expect(page).not.toContain(PLAN_SALE_PAUSED);
  });

  it('buys through the plan route: a POST with the browser\'s key, kept across a retry, and `free` on a free card', () => {
    expect(code).toMatch(/fetch\('\/api\/v1\/workout\/plan',\s*\{\s*method:\s*'POST'/);
    expect(code).toMatch(/idempotency_key: key/);
    expect(code).toMatch(/pendingKey\.current\[p\.tier\] \?\? newIdempotencyKey\(\)/);
    // MIRROR-COACH P8 FIX: a paid product waiting to be finished is never sent as a free claim
    expect(code).toMatch(/p\.free && !p\.unfinished \? \{ free: true \}/);
    // and the page names the template it previewed, so the server sells that one or none
    expect(code).toMatch(/template: preview\.id/);
    // a paid purchase asks first, with the price; the price shown is the server's (offer), never one typed here
    expect(code).toMatch(/window\.confirm\(`Buy the \$\{p\.name\} for \$\{p\.price\} shards\?`\)/);
    expect(code).not.toMatch(/\b(60|200)\s*(shards|◆)/);
  });

  it('never calls anything "periodized" or "scored", and promises no video analysis, no AI and no animated avatar', () => {
    for (const s of [code, page]) {
      expect(s).not.toMatch(/periodi[sz]/i);
      expect(s).not.toMatch(/\bscored\b/i);
      expect(s).not.toMatch(/Upload a video/i);
      expect(s).not.toMatch(/AI-generated/);
      expect(s).not.toMatch(/Exercise movies/i);
      expect(s).not.toMatch(/animated with/i);
      expect(s).not.toMatch(/Personalized Workout/);
    }
  });

  it('the consent box says what happens (a demo: no camera, no video, sample numbers, nothing saved), not "anonymous metrics"', () => {
    expect(page).not.toMatch(/on-device movement analysis/i);
    expect(page).not.toMatch(/anonymous/i);
    expect(page).not.toMatch(/raw video stays/i);
    expect(page).toContain(DEMO_CONSENT);
    expect(DEMO_CONSENT).toMatch(/demo/);
    expect(DEMO_CONSENT).toMatch(/no camera/);
    expect(DEMO_CONSENT).toMatch(/sample numbers/);
    expect(DEMO_CONSENT).toMatch(/nothing is sent or saved/);
    expect(page).toContain('Not medical advice.');
    expect(text).toMatch(/does not change your plan/);
  });

  it('asks for the plans and the offer on load (GET, the route that revises old plans and gates new ones)', () => {
    expect(src).toMatch(/fetch\('\/api\/v1\/workout\/plan',\s*\{\s*cache:\s*'no-store'\s*\}\)/);
  });

  it('every sentence on the page passes the no-diagnosis, no-treatment, no-guarantee screen (lib/share/screen.ts)', () => {
    expect(screenText(text)).toEqual([]);
  });
});

// MIRROR-COACH P8 (2026-09-29): a FEL template plan as the server hands it over — already gated for this reader, today.
describe('SavedPlans, a FEL template plan', () => {
  const weeks = templatePlanWeeks(pickTemplate({ daysPerWeek: 3, equipment: 'bodyweight' }, false), 'plan_4w');
  const view = (reasons: Parameters<typeof gatedPlanView>[1], over: Partial<SavedPlan> = {}): SavedPlan => {
    const v = gatedPlanView(weeks, reasons);
    return {
      id: 'wp_1', kind: 'template', tier: 'plan_4w', focus: '3 days a week · bodyweight', createdAt: '2026-10-01T00:00:00.000Z', free: false,
      template: { id: 'adult-bw-3', name: '3 days a week · bodyweight', summary: 'S', equipmentLine: 'E', audience: 'adult', dailyTargetLine: null },
      weeks: v.weeks, gate: { gatedItems: v.gatedItems, swapped: v.swapped, held: v.held }, revisionNote: null, ...over,
    } as SavedPlan;
  };

  it('a shut gate: the easier step is drawn with the gate\'s one line and its link; the jump is not prescribed', () => {
    const html = renderToStaticMarkup(createElement(SavedPlans, { saved: [view(['landing_never'])] }));
    expect(html).toContain('data-plan-kind="template"');
    expect(html).toContain(swappedLine('Countermovement Jump and Stick', PROTOCOL_WHY.landing_never));
    expect(html).toContain('Fast Bodyweight Squat · 3 × 3 · Cruise');
    expect(html).not.toMatch(/Countermovement Jump and Stick ·/);
    expect(html).toContain('href="/play/mirror/assess"');
    expect(html).toContain('4-week plan · 3 days a week · bodyweight');
  });

  it('an open gate: the jump as written, no line', () => {
    const html = renderToStaticMarkup(createElement(SavedPlans, { saved: [view([])] }));
    expect(html).toContain('Countermovement Jump and Stick · 3 × 3 jumps · Cruise');
    expect(html).not.toContain('data-protocol-gate');
  });

  it('the weeks run Mon → Sun with off days, week 4 named the easier week; a free plan says why it is free', () => {
    const html = renderToStaticMarkup(createElement(SavedPlans, { saved: [view([], { free: true })] }));
    const days = [...html.matchAll(/data-plan-day="(\w+)" data-kind="(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(days.slice(0, 7)).toEqual(['Mon:training', 'Tue:off', 'Wed:training', 'Thu:off', 'Fri:training', 'Sat:off', 'Sun:off']);
    expect(html).toContain('Week 4 · Easier week');
    expect(html).toContain('Free: you bought a plan here before');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    expect(screenText(text)).toEqual([]);
    expect(text).not.toMatch(/periodi[sz]|\bscored\b/i);
  });

  it('a youth template shows the 60-minute daily target where it names the template', () => {
    const youth = templatePlanWeeks(pickTemplate({ daysPerWeek: 3, equipment: 'bodyweight' }, true), 'plan_4w');
    const v = gatedPlanView(youth, ['minor']);
    const html = renderToStaticMarkup(createElement(SavedPlans, { saved: [view([], {
      weeks: v.weeks, template: { id: 'youth-bw-3', name: 'Youth · 3 days a week · bodyweight', summary: 'S', equipmentLine: 'E', audience: 'youth', dailyTargetLine: dailyTargetLine(60) },
    } as Partial<SavedPlan>)] }));
    expect(html).toContain(dailyTargetLine(60));
    expect(html).not.toContain('data-protocol-gate');
  });
});

describe('SavedPlans, a buyer\'s plans', () => {
  const revised = reviseDepthDrops(JSON.parse(JSON.stringify(legacyWeek1())));
  const plan = (weeks: unknown, revisionNote: string | null): SavedPlan => ({ id: 'p1', tier: 'plan_4w', focus: 'Mobility & Range', weeks, revisionNote });

  it('shows a revised plan with the note on it, and names what the swap replaced', () => {
    const html = renderToStaticMarkup(createElement(SavedPlans, { saved: [plan(revised.weeks, planRevisionNote(revised.weeks))] }));
    expect(html).toContain('Your plans');
    expect(html).toContain(PLAN_REVISED_NOTE);
    // MIRROR-COACH P2 (2026-09-25): the swap no longer repeats the Trap-Bar Jump already on Monday (P1's wart)
    expect(html).toContain('Wall Drive March · 3×10 ea');
    expect(html).toContain('in place of Depth Drop to Vertical');
    expect(html).not.toMatch(/Depth Drop to Vertical ·/);                    // not prescribed, only named as replaced
    expect(html).toContain('4-Week Plan — Focus: Mobility &amp; Range');
  });

  it('shows no note on a plan the revision never changed', () => {
    const html = renderToStaticMarkup(createElement(SavedPlans, { saved: [plan(generatePlan(analyzeMovement(defaultMetrics()), 'plan_4w').weeks, null)] }));
    expect(html).toContain('Your plans');
    expect(html).not.toContain('We changed your plan');
  });

  it('shows nothing while loading or when there are none, and says so when they could not be loaded', () => {
    expect(renderToStaticMarkup(createElement(SavedPlans, { saved: null }))).toBe('');
    expect(renderToStaticMarkup(createElement(SavedPlans, { saved: [] }))).toBe('');
    expect(renderToStaticMarkup(createElement(SavedPlans, { saved: 'error' }))).toMatch(/could not be loaded/);
  });

  // MIRROR-COACH P1 review (2026-09-25) held an adult's later depth drops for the protocol and said so beside each one.
  // MIRROR-COACH P2 (2026-09-25), owner decision #22: every depth drop in every week is swapped, so nothing is held and
  // no depth drop is prescribed anywhere on the page; a youth reader's plan has no jumps and says that.
  it('an adult\'s 12-week plan as bought (depth drops in weeks 1, 6 and 11): none prescribed, none held, the note', () => {
    const adult = revisePlan(legacyWeeks('mobility', 'program_12w'), 'adult').weeks;
    const html = renderToStaticMarkup(createElement(SavedPlans, { saved: [plan(adult, planRevisionNote(adult))] }));
    expect(html).not.toMatch(/Depth Drop to Vertical ·/);
    expect(html.match(/in place of Depth Drop to Vertical/g)).toHaveLength(3);
    expect(html).not.toContain(HELD_LINE);
    expect(html).toContain(PLAN_REVISED_NOTE);
  });

  it('a youth reader\'s plan: no jump on the page, and the youth note', () => {
    const weeks = JSON.parse(JSON.stringify(generatePlan(analyzeMovement(defaultMetrics()), 'program_12w').weeks));
    const youth = revisePlan(weeks, 'youth').weeks;
    const html = renderToStaticMarkup(createElement(SavedPlans, { saved: [plan(youth, planRevisionNote(youth))] }));
    expect(html).toContain(PLAN_REVISED_NOTE_YOUTH);
    expect(html).not.toMatch(/(Depth Drop to Vertical|Trap-Bar Jump|Approach Bound|Lateral Bound \+ Stick|A-Skip|Landing Trunk Control) ·/);
    expect(html).not.toContain(HELD_LINE);
  });

  it('survives a stored plan of a shape it does not know', () => {
    expect(() => renderToStaticMarkup(createElement(SavedPlans, { saved: [plan(null, null), plan([{ days: [null] }], null)] }))).not.toThrow();
  });
});

// MIRROR-COACH P6 (2026-09-29): the plan's week showed Mon, Wed and Fri and nothing else — four blanks a week. Every
// week now runs Mon → Sun and the days the plan does not name are off days that say what an off day is.
describe('SavedPlans, the whole week', () => {
  const plan = (weeks: unknown): SavedPlan => ({ id: 'p1', tier: 'plan_4w', focus: 'Mobility & Range', weeks, revisionNote: null });
  const weeks = generatePlan(analyzeMovement(defaultMetrics()), 'plan_4w').weeks;

  it('every week of a bought plan has seven days in order, Tue/Thu/Sat/Sun as off days with the off-day line', () => {
    const html = renderToStaticMarkup(createElement(SavedPlans, { saved: [plan(weeks)] }));
    const days = [...html.matchAll(/data-plan-day="(\w+)" data-kind="(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(days).toHaveLength(7 * weeks.length);
    expect(days.slice(0, 7)).toEqual(['Mon:training', 'Tue:off', 'Wed:training', 'Thu:off', 'Fri:training', 'Sat:off', 'Sun:off']);
    expect(html.split(OFF_DAY_WEEK_LINE).length - 1).toBe(4 * weeks.length);
    expect(html).toContain('Tue — Off day');
    // the training days are exactly what they were
    for (const d of weeks[0].days) for (const ex of d.exercises) expect(html).toContain(`${ex.name} · ${ex.sets}×${ex.reps}`);
  });

  it('a youth reader\'s week has the same off days: the off day is youth-safe (a walk, stretches, a breath)', () => {
    const youth = revisePlan(JSON.parse(JSON.stringify(weeks)), 'youth').weeks as unknown[];
    const html = renderToStaticMarkup(createElement(SavedPlans, { saved: [plan(youth)] }));
    expect(html.split(OFF_DAY_WEEK_LINE).length - 1).toBe(4 * youth.length);
  });

  it('a plan whose days are not days of the week shows as it always did, with no invented off days', () => {
    const html = renderToStaticMarkup(createElement(SavedPlans, { saved: [plan([{ week: 1, days: [{ day: 'Day 1', exercises: [{ name: 'Goblet Squat', sets: 3, reps: '8' }] }] }])] }));
    expect(html).toContain('Goblet Squat · 3×8');
    expect(html).not.toContain(OFF_DAY_WEEK_LINE);
    expect(html).not.toContain('data-plan-day');
  });
});

/** Week 1 of a mobility plan as the route saved it before 2026-09-25: Friday's second exercise is the depth drop. */
function legacyWeek1() {
  const weeks = generatePlan(analyzeMovement(defaultMetrics()), 'plan_4w').weeks.map((w) => ({ ...w, days: w.days.map((d) => ({ ...d, exercises: [...d.exercises] })) }));
  weeks[0].days[2].exercises[1] = { name: 'Depth Drop to Vertical', sets: 4, reps: '4', cue: 'Absorb soft, explode tall', targets: 'power' };
  return weeks;
}


// ── MIRROR-COACH P8 FIX (2026-09-30, code review): what the offer says, rendered ─────────────────────────────────────
describe('WorkoutView, the offer states', () => {
  const product = (tier: 'plan_4w' | 'program_12w', over: Partial<OfferProduct> = {}): OfferProduct => {
    const p = WORKOUT_PRODUCTS.find((x) => x.tier === tier)!;
    return { tier, sku: p.sku, name: p.name, weeks: p.weeks, line: p.line, price: tier === 'plan_4w' ? 60 : 200, currency: 'shards', onSale: true, free: false, unfinished: false, ...over };
  };
  const offer = (over: Partial<WorkoutOffer> = {}): WorkoutOffer => ({
    audience: 'adult', ageKnown: true, pastBuyer: false, purchasable: true, blockedBy: null, ageHref: null,
    products: [product('plan_4w'), product('program_12w')], ...over,
  });
  const render = (o: WorkoutOffer) => {
    const html = renderToStaticMarkup(createElement(WorkoutView, { initialData: { plans: [], offer: o } }));
    return { html, text: html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ') };
  };

  it('an adult: the template preview and both products at the server\'s prices', () => {
    const { html, text } = render(offer());
    expect(html).toContain('data-template="adult-bw-3"');
    expect(text).toContain('Buy for 60 shards');
    expect(text).toContain('Buy for 200 shards');
    expect(text).toContain(WORKOUT_JUMP_LINE);
  });

  it('NO BIRTH YEAR ON FILE: the line and the link to the health answers — no preview, no price, no button (blocker)', () => {
    const { html, text } = render(offer({ audience: 'youth', ageKnown: false, purchasable: false, blockedBy: 'age_needed', ageHref: WORKOUT_AGE_HREF }));
    expect(text).toContain(WORKOUT_AGE_NEEDED_LINE);
    expect(html).toContain(`href="${WORKOUT_AGE_HREF}"`);
    expect(html).not.toContain('data-template=');
    expect(text).not.toMatch(/Buy for|Get the/);
    expect(text).not.toContain(WORKOUT_YOUTH_LINE);
    expect(text).not.toContain(WORKOUT_CHECK_FAILED);
  });

  it('the birth year could not be read: its own line, not the past-purchases one (minor)', () => {
    const { text } = render(offer({ purchasable: false, blockedBy: 'age_unread' }));
    expect(text).toContain(WORKOUT_AGE_UNREAD);
    expect(text).not.toContain(WORKOUT_CHECK_FAILED);
    expect(render(offer({ purchasable: false, blockedBy: 'purchases' })).text).toContain(WORKOUT_CHECK_FAILED);
  });

  it('a youth reader: the youth line (why there is no 12-week plan) and the 4-week plan only', () => {
    const { html, text } = render(offer({ audience: 'youth', products: [product('plan_4w'), product('program_12w', { onSale: false })] }));
    expect(text).toContain(WORKOUT_YOUTH_LINE);
    expect(html).toContain('data-product="plan_4w"');
    expect(html).not.toContain('data-product="program_12w"');
  });

  it('A PAID PLAN THAT DID NOT SAVE: the product says so and offers to get it, with no price (major)', () => {
    const { html, text } = render(offer({ products: [product('plan_4w', { unfinished: true }), product('program_12w')] }));
    expect(html).toContain('data-unfinished');
    expect(text).toContain(unfinishedLine('4-week plan'));
    expect(text).toContain('Get your 4-week plan');
    expect(text).toContain('Buy for 200 shards');
  });

  it('a past buyer: both free', () => {
    const { text } = render(offer({ pastBuyer: true, products: [product('plan_4w', { free: true }), product('program_12w', { free: true })] }));
    expect(text).toContain(WORKOUT_FREE_LINE);
    expect(text).toContain('Get the 4-week plan free');
    expect(text).not.toMatch(/Buy for/);
  });
});
