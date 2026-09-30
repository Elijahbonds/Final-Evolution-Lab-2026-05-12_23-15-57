// Today's generated Prep, rendered (MIRROR-COACH P6, 2026-09-29). The lane's dev server is down and its database
// offline, so this is the render proof: a server render is the card's first paint, with the context handed in the way
// the fetch would hand it. A coach's own Prep wins (nothing renders); a hard stop shows nothing; the fallback is the
// careful plan and says why; an adult's flagged-heel squat day aims the stretch at the feet and primes with jumps; a low
// readiness day defaults to the longer warm-up; the steps render in the plan's order; no camera link while nothing
// mounts the drill runner.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { WarmupPrep, planFor, planInputs } from './warmup-prep';
import { FALLBACK_WARMUP_CONTEXT, NOTE_COPY, generateWarmup, zoneNote, type WarmupContext } from '@/lib/coach/warmup';
import { ZONE_WORDS } from '@/lib/coach/warmupContent';

afterEach(() => { vi.unstubAllGlobals(); });

const ex = (id: string, order: number, section: string, pattern: string | null, isKeySet = false, jumpLand = false) =>
  ({ id, order, section, isKeySet, coaching: { pattern: pattern ? { id: pattern as 'squat', label: pattern } : null, jumpLand } });
const SQUAT_DAY = [ex('a', 1, 'key', 'squat', true), ex('b', 2, 'assist', 'lunge'), ex('c', 3, 'cooldown', 'breath')];
const ADULT_HEEL: WarmupContext = { isYouth: false, painDecision: null, zone: { id: 'foot', words: ZONE_WORDS.foot, checks: ['heelLine'] }, screen: 'flagged', screenAt: '2026-09-28T10:00:00.000Z', hardStopped: false };

const html = (props: Parameters<typeof WarmupPrep>[0]) => renderToStaticMarkup(createElement(WarmupPrep, props));
const stepIds = (m: string) => [...m.matchAll(/data-step="([^"]+)"/g)].map((x) => x[1]);
/** Text as the athlete reads it (the server render escapes apostrophes). */
const text = (m: string) => m.replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

describe('WarmupPrep', () => {
  it("a coach's own Prep always wins: nothing renders, and nothing is fetched", () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(html({ exercises: [ex('p', 0, 'prep', 'mobility'), ...SQUAT_DAY], contextUrl: '/api/coach/me/warmup' })).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('under an intake hard stop it renders nothing (Today shows its own card)', () => {
    expect(html({ exercises: SQUAT_DAY, contextUrl: null, initialContext: { ...ADULT_HEEL, hardStopped: true } })).toBe('');
  });

  it("first paint with an endpoint says it is building, not blank — and it is FEL's Prep section", () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const m = text(html({ exercises: SQUAT_DAY, contextUrl: '/api/coach/me/warmup' }));
    expect(m).toContain('data-section="prep"');
    expect(m).toContain("Building today's warm-up");
  });

  // MIRROR-COACH P6 FIX (2026-09-29): the careful fallback used to say "under 18, or with no birth year on your account"
  // and "no graded Movement Screen on file yet" — false for an adult whose request just failed. Same careful plan; the
  // reason it gives is now the true one.
  it('with no endpoint (the dev harness) it is the careful plan: no jumps, no screen aim, and it says the details did not load', () => {
    const m = text(html({ exercises: SQUAT_DAY, contextUrl: null }));
    expect(m).not.toContain('data-impact="true"');
    expect(m).toContain(NOTE_COPY.context_unavailable);
    expect(m).not.toContain(NOTE_COPY.youth_impact);
    expect(m).not.toContain('no graded Movement Screen on file yet');
    const plan = generateWarmup({ pattern: 'squat', patternFrom: 'key_set', weakestZone: null, minutes: 14, isYouth: true, painDecision: null, readiness: null, screen: FALLBACK_WARMUP_CONTEXT.screen, contextUnavailable: true });
    expect(stepIds(m)).toEqual(plan.steps.map((s) => s.id));
  });

  it("an adult's flagged-heel squat day: the WHOLE Wake-Up in order, the foot stretch, the jump primer, the camera line", () => {
    const m = text(html({ exercises: SQUAT_DAY, contextUrl: null, initialContext: ADULT_HEEL }));
    // the default is 14 minutes and the owner's six phases, Release the Locks included (decisions #7 + #14; P6 fix)
    expect(stepIds(m)).toEqual(['release-the-locks', 'pressurize', 'wake-the-tripod', 'open-the-joints', 'build-the-rhythm', 'prime-the-launch', 'ankle-rock', 'hinge-rock', 'squat-jump-primer']);
    expect(m).toContain("Warm-up · 14 min · for today's squat");
    expect(m).toContain(zoneNote('foot'));
    expect(m).toContain('aria-pressed="true" data-minutes="14"');
    expect(m).toContain('Start the warm-up');
    expect(m).not.toContain('data-warmup-camera');           // WAKE_UP_CAMERA_HREF is null until a drills page exists
    expect(m).toMatch(/builds capacity/);
  });

  it('a low readiness day defaults to the longer warm-up and says what changed', () => {
    const m = text(html({ exercises: SQUAT_DAY, contextUrl: null, initialContext: ADULT_HEEL, readiness: 'low' }));
    expect(m).toContain('aria-pressed="true" data-minutes="18"');
    const plan = planFor(SQUAT_DAY, ADULT_HEEL, 18, 'low');
    expect(m).toContain(`Warm-up · ${Math.round(plan.totalSec / 60)} min`);
    expect(m).toContain(plan.notes.find((n) => n.id === 'low_day')!.text);
    expect(stepIds(m)).toEqual(plan.steps.map((s) => s.id));
  });

  it('a pain step-down: no primer, no jumps, and the pain line', () => {
    const m = text(html({ exercises: SQUAT_DAY, contextUrl: null, initialContext: { ...ADULT_HEEL, painDecision: 'step_down_flag_coach' } }));
    expect(m).not.toContain('data-kind="primer"');
    expect(m).not.toContain('data-impact="true"');
    expect(m).toContain(NOTE_COPY.pain);
  });

  it("the coach's own Prime section is today's primer; their JUMP work there lets a youth athlete keep the Wake-Up's jumps", () => {
    const withPrime = [ex('p1', 0, 'prime', 'locomotion', false, true), ...SQUAT_DAY];
    const m = text(html({ exercises: withPrime, contextUrl: null, initialContext: { ...ADULT_HEEL, isYouth: true } }));
    expect(m).not.toContain('data-kind="primer"');
    expect(m).toContain('data-step="build-the-rhythm"');
    expect(m).toContain(NOTE_COPY.coach_prime);
    expect(m).toContain(NOTE_COPY.coach_impact);
    // a walk (locomotion, not jump work) in the same Prime keeps a youth athlete's jumps off (the P6 review's blocker)
    const walk = text(html({ exercises: [ex('w', 0, 'prime', 'locomotion'), ...SQUAT_DAY], contextUrl: null, initialContext: { ...ADULT_HEEL, isYouth: true } }));
    expect(walk).not.toContain('data-impact="true"');
    expect(walk).not.toContain(NOTE_COPY.coach_impact);
    expect(walk).toContain(NOTE_COPY.youth_impact);
  });

  // MIRROR-COACH P6 FIX (2026-09-29, review minor): a live run's plan is frozen at Start — the readiness card above stays
  // live, and answering 'low' mid-run swapped the running plan and re-mapped the seconds already run onto another step.
  it('a live run keeps the length and readiness it started with; with no run, the card follows what is shown now', () => {
    const live = { minutes: 18 as const, readiness: 'low' as const };
    const started = { minutes: 14 as const, readiness: null };
    expect(planInputs(live, started)).toEqual(started);
    expect(planInputs(live, null)).toEqual(live);
    const src = readFileSync('components/coach/warmup-prep.tsx', 'utf8');
    expect(src).toContain('planInputs({ minutes: picked ?? suggestedMinutes(readiness), readiness }, run ? runInputs : null)');
    expect(src).toMatch(/setRunInputs\(\{ minutes, readiness: planReadiness \}\);\s*setRun\(startGuided\(t\)\)/);
  });
});
