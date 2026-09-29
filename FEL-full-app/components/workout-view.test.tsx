import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyzeMovement, defaultMetrics } from '@/lib/workout/movement-screen';
import { generatePlan, legacyWeeks } from '@/lib/workout/plan-generator';
import { HELD_LINE, PLAN_REVISED_NOTE, PLAN_REVISED_NOTE_YOUTH, planRevisionNote, reviseDepthDrops, revisePlan } from '@/lib/workout/plan-revision';
import { PLAN_SALE_PAUSED } from '@/lib/workout/plan-sale';
import { screenText } from '@/lib/share/screen';
import { DEMO_CONSENT, demoScan, SavedPlans, WorkoutView, type SavedPlan } from './workout-view';

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

// MIRROR-COACH P1 (2026-09-25), owner decision #3: /workout's plans are pulled from sale, buyers keep theirs (revised
// on read, with a note), and the page stops promising what is not there.
describe('WorkoutView, the sale pulled', () => {
  const page = renderToStaticMarkup(createElement(WorkoutView));

  it('says the plan is being rebuilt (FEL\'s draft line, for the owner to approve), and offers nothing to buy', () => {
    expect(page).toContain(PLAN_SALE_PAUSED);
    expect(page).not.toMatch(/>\s*Unlock\s*</);
    expect(page).not.toMatch(/◆/);                                          // no shard prices
    expect(page).not.toMatch(/60 ◆|200 ◆/);
    // and the source has no purchase left in it: nothing POSTs to the plan route
    expect(src).not.toMatch(/fetch\('\/api\/v1\/workout\/plan',\s*\{[^}]*method:\s*'POST'/);
    expect(code).not.toMatch(/buyPlan|idempotency_key|newIdempotencyKey/);
  });

  it('no longer calls anything "periodized": the plan never changed a set or a rep from week to week', () => {
    expect(code).not.toMatch(/periodi[sz]/i);
    expect(page).not.toMatch(/periodi[sz]/i);
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
  });

  it('promises no video analysis, no AI and no animated avatar: none of them exist here', () => {
    for (const s of [code, page]) {
      expect(s).not.toMatch(/Upload a video/i);
      expect(s).not.toMatch(/AI-generated/);
      expect(s).not.toMatch(/Exercise movies/i);
      expect(s).not.toMatch(/animated with/i);
      expect(s).not.toMatch(/Personalized Workout/);
    }
  });

  it('asks for the buyer\'s saved plans on load (GET, the route that revises them)', () => {
    expect(src).toMatch(/fetch\('\/api\/v1\/workout\/plan',\s*\{\s*cache:\s*'no-store'\s*\}\)/);
  });

  it('every sentence on the page passes the no-diagnosis, no-treatment, no-guarantee screen (lib/share/screen.ts)', () => {
    const text = page.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, ' ');
    expect(screenText(text)).toEqual([]);
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

/** Week 1 of a mobility plan as the route saved it before 2026-09-25: Friday's second exercise is the depth drop. */
function legacyWeek1() {
  const weeks = generatePlan(analyzeMovement(defaultMetrics()), 'plan_4w').weeks.map((w) => ({ ...w, days: w.days.map((d) => ({ ...d, exercises: [...d.exercises] })) }));
  weeks[0].days[2].exercises[1] = { name: 'Depth Drop to Vertical', sets: 4, reps: '4', cue: 'Absorb soft, explode tall', targets: 'power' };
  return weeks;
}
