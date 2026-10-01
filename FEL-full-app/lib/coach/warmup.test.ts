// The warm-up generator (MIRROR-COACH P6, 2026-09-29): every pattern gets a warm-up; the Wake-Up's order is the
// Playbook's, never reshuffled; the minutes are a cap the plan never passes; an athlete under 18 (or with no birth year)
// never gets a jump or a landing unless a coach assigned it; a step-down or stop pain decision drops the primer and the
// jumping; a low readiness day shortens the launch and the primer and says so; and every line a plan can show is FEL's
// own words — nothing that names a condition, promises an outcome, says "risk" or "prevent", or borrows the book.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MovementPattern } from '@/public/_prisma/client';
import { PROTOCOL_WHY } from './protocolGate';
import { WAKE_UP } from '@/lib/drills/drills';
import { DrillRunner } from '@/lib/drills/DrillRunner';
import { CORRECTIVE_BLOCK } from '@/lib/mirror/screenCorrectives';
import { GRADER_IDS } from '@/lib/mirror/stationGraders';
import { screenText } from '@/lib/share/screen';
import { PATTERNS } from './catalogue';
import { SESSION_SECTIONS } from './taxonomy';
import type { PainDecision } from '@/lib/health/painRule';
import {
  JUMP_GATE_DEFAULT_WHY, WARMUP_FOLLOWS_JUMP_GATE, jumpGateNote,
  DEFAULT_WARMUP_MINUTES, FALLBACK_WARMUP_CONTEXT, LOW_DAY_WARMUP_MINUTES, WAKE_UP_IMPACT_GATED, LAUNCH_PHASE_ID, LOW_DAY_LAUNCH_SEC, NOTE_COPY, PAIN_LOOKBACK_DAYS,
  WAKE_UP_BY_MINUTES, WAKE_UP_CAMERA_HREF, WAKE_UP_SOURCE_LINE, WARMUP_MEANING, WARMUP_MINUTES, breathAt, generateWarmup,
  guidedElapsed, heldBackLines, lowDayNote, nextGuided, painDecisionToday, pauseGuided, phaseImpact, pickPrimer, pickRockHolds,
  readWarmupContext, resumeGuided, runnerAt, screenClearNote, screenNoneNote, sessionWarmupInputs, shortenPhase, startGuided,
  stepStartSec, suggestedMinutes, untaggedNote, wakeUpDrillFor, weakestZone, zoneNote,
  type WarmupInput, type WarmupMinutes, type WarmupPlan, type WarmupReadiness,
} from './warmup';
import { MAX_LOW_DAY_ROUNDS } from './warmup';
import { READINESS_EXTRA_WARMUP_MINUTES, warmupMinutesFor, type ReadinessLevel } from '@/lib/health/readiness';
import {
  CHECK_ZONE, GENERAL_PRIMER_ID, GENERAL_ROCK_HOLDS, HOLD_SEC, PRIMERS, ROCK_HOLDS, ROCK_HOLD_SEC, ROCK_SEC, WARMUP_ZONES, ZONE_WORDS,
  type WarmupZone,
} from './warmupContent';

const ALL_PATTERNS: (MovementPattern | null)[] = [...PATTERNS, null];
const ZONES: (WarmupZone | null)[] = [...WARMUP_ZONES, null];
const PAINS: (PainDecision | null)[] = [null, 'continue', 'easier_variation', 'step_down_flag_coach', 'stop_see_clinician', 'stop_tell_adult'];
const STOPS: PainDecision[] = ['step_down_flag_coach', 'stop_see_clinician', 'stop_tell_adult'];
const READINESS: (WarmupReadiness | null)[] = [null, 'low', 'ok', 'skip'];

// MIRROR-COACH P6 FIX (2026-09-29): the usual warm-up is 14 minutes now (DEFAULT_WARMUP_MINUTES — the whole Wake-Up,
// extended). The base plan was 10, which is now the Wake-Up alone (no stretch, no primer) — see 'the four lengths'.
const base: WarmupInput = { pattern: 'squat', weakestZone: null, minutes: DEFAULT_WARMUP_MINUTES, isYouth: false, painDecision: null, readiness: null };
const gen = (over: Partial<WarmupInput> = {}) => generateWarmup({ ...base, ...over });

/** Every input the generator can be handed (92,160 plans). */
function* everyInput(): Generator<WarmupInput> {
  for (const pattern of ALL_PATTERNS) for (const weakestZone of ZONES) for (const minutes of WARMUP_MINUTES)
    for (const isYouth of [false, true]) for (const painDecision of PAINS) for (const readiness of READINESS)
      for (const coachAssignedImpact of [false, true]) for (const coachPrime of [false, true])
        yield { pattern, weakestZone, minutes, isYouth, painDecision, readiness, coachAssignedImpact, coachPrime };
}

/** Every string a plan can put on the screen. */
const planText = (p: WarmupPlan): string[] => [
  ...p.notes.map((n) => n.text), ...heldBackLines(p),
  ...p.steps.flatMap((s) => [s.name, s.cue, s.dose ?? '', ...s.lines.map((l) => l.text)]),
].filter(Boolean);

describe('every pattern gets a warm-up, in the Wake-Up\'s own order, inside its minutes', () => {
  it('sweeps every input: steps are Wake-Up → rock-and-hold → primer, the Wake-Up a subsequence of WAKE_UP, the total ≤ the cap', () => {
    const order = WAKE_UP.phases.map((p) => p.id);
    let n = 0;
    for (const input of everyInput()) {
      const p = generateWarmup(input);
      n++;
      expect(p.steps.length, JSON.stringify(input)).toBeGreaterThan(0);
      expect(p.totalSec).toBe(p.steps.reduce((s, x) => s + x.seconds, 0));
      expect(p.totalSec, JSON.stringify(input)).toBeLessThanOrEqual(input.minutes * 60);
      // kinds in running order
      const kinds = p.steps.map((s) => s.kind);
      const rank = { wake_up: 0, rock_hold: 1, primer: 2 } as const;
      expect(kinds.every((k, i) => i === 0 || rank[kinds[i - 1]] <= rank[k]), JSON.stringify(input)).toBe(true);
      // the Wake-Up's phases in WAKE_UP's order, never reshuffled
      const ids = p.steps.filter((s) => s.kind === 'wake_up').map((s) => s.id);
      const idx = ids.map((id) => order.indexOf(id));
      expect(idx.every((x) => x >= 0)).toBe(true);
      expect(idx.every((x, i) => i === 0 || idx[i - 1] < x), JSON.stringify(input)).toBe(true);
      // EVERY Wake-Up phase the length keeps is there — FEL's stretch and primer never push one out (decisions #7 +
      // #14, the P6 fix); only the jumping phases can be gated out, and only by the youth or pain gate
      const gated = (!!input.isYouth && !input.coachAssignedImpact) || (!!input.painDecision && STOPS.includes(input.painDecision));
      for (const id of WAKE_UP_BY_MINUTES[input.minutes]) {
        const ph = WAKE_UP.phases.find((x) => x.id === id)!;
        if (!phaseImpact(ph) || !gated) expect(ids, `${id} ${JSON.stringify(input)}`).toContain(id);
      }
      // a rock-and-hold whenever the Wake-Up leaves a stretch's worth of room (an adult's 10 is the Wake-Up alone)
      const wakeSec = p.steps.filter((s) => s.kind === 'wake_up').reduce((t, s) => t + s.seconds, 0);
      if (wakeSec + ROCK_HOLD_SEC <= input.minutes * 60) expect(p.steps.filter((s) => s.kind === 'rock_hold').length, JSON.stringify(input)).toBeGreaterThanOrEqual(1);
    }
    expect(n).toBe(12 * 5 * WARMUP_MINUTES.length * 2 * 6 * 4 * 2 * 2);
  });

  it('with nothing gating it, every pattern gets its full length, two stretches at 14 minutes and a primer', () => {
    for (const pattern of ALL_PATTERNS) {
      const p = gen({ pattern, minutes: 14 });
      expect(p.steps.filter((s) => s.kind === 'wake_up').map((s) => s.id)).toEqual(WAKE_UP.phases.map((x) => x.id));
      expect(p.steps.filter((s) => s.kind === 'rock_hold')).toHaveLength(2);
      expect(p.steps.filter((s) => s.kind === 'primer')).toHaveLength(1);
      expect(p.primer).toBe(pattern && pattern !== 'other' && PRIMERS.some((x) => x.patterns !== 'general' && x.patterns.includes(pattern)) ? 'pattern' : 'general');
    }
  });

  // MIRROR-COACH P6 FIX (2026-09-29; owner decisions #7 + #14): this test pinned "10 = without Release the Locks" as the
  // DEFAULT, so every default warm-up dropped the owner's phase 1. Now 10, 14 (the default) and 18 all run the whole
  // Wake-Up and FEL's additions take only the minutes it leaves; 6 is FEL's quick version, picked by the athlete.
  it('the four lengths: 18, 14 and 10 run the whole Wake-Up (10 is the Wake-Up alone); 6 = breath, feet and joints', () => {
    const six = ['release-the-locks', 'pressurize', 'wake-the-tripod', 'open-the-joints', 'build-the-rhythm', 'prime-the-launch'];
    const ids = (m: WarmupMinutes) => gen({ minutes: m }).steps.filter((s) => s.kind === 'wake_up').map((s) => s.id);
    for (const m of [18, 14, 10] as const) expect(ids(m), String(m)).toEqual(six);
    expect(ids(6)).toEqual(['pressurize', 'wake-the-tripod', 'open-the-joints']);
    expect(DEFAULT_WARMUP_MINUTES).toBe(14);
    // every length filled to the second on an adult squat day: 14 = the Wake-Up (600 s) + two stretches, the first with
    // a pair of extra rounds (180 s) + the primer (60 s); 18 = + a third stretch and extra rounds; 10 = the Wake-Up
    const kinds = (m: WarmupMinutes) => gen({ minutes: m }).steps.map((s) => s.kind);
    expect(gen({ minutes: 18 }).totalSec).toBe(18 * 60);
    expect(gen({ minutes: 14 }).totalSec).toBe(14 * 60);
    expect(gen({ minutes: 10 }).totalSec).toBe(10 * 60);
    expect(gen({ minutes: 6 }).totalSec).toBe(6 * 60);
    expect(kinds(18).filter((k) => k === 'rock_hold')).toHaveLength(3);
    expect(kinds(14).filter((k) => k === 'rock_hold')).toHaveLength(2);
    expect(kinds(10)).toEqual(six.map(() => 'wake_up'));
    // left out for time, and named — at 10 it is FEL's stretch and primer that step aside, never a Wake-Up phase
    expect(heldBackLines(gen({ minutes: 10 }))).toEqual(['Squat Jump Primer, Ankle Rock and Hold: left out to fit the time.']);
    expect(heldBackLines(gen({ minutes: 6 }))).toContain('Release the Locks, Build the Rhythm, Prime the Launch: left out to fit the time.');
    // the Wake-Up alone says nothing about a stretch it does not have
    expect(gen({ minutes: 10, weakestZone: 'foot' }).notes.map((n) => n.id)).toEqual([]);
  });

  it('the Wake-Up steps are the drill\'s own words, and WAKE_UP itself is never touched', () => {
    const before = JSON.stringify(WAKE_UP);
    for (const input of everyInput()) generateWarmup(input);
    expect(JSON.stringify(WAKE_UP)).toBe(before);
    for (const s of gen({ minutes: 14 }).steps.filter((x) => x.kind === 'wake_up')) {
      const ph = WAKE_UP.phases.find((x) => x.id === s.id)!;
      expect(s.name).toBe(ph.name);
      expect(s.cue).toBe(ph.cue);
      expect(s.seconds).toBe(ph.durationSec);
      expect(s.phase).toBe(ph);
    }
    // the pressurize pacer rides through to the guided run
    expect(gen({ minutes: 6 }).steps.find((s) => s.id === 'pressurize')!.pacer).toEqual(WAKE_UP.phases[1].pacer);
  });

  it('an unknown length falls back to the default', () => {
    expect(generateWarmup({ ...base, minutes: 7 as WarmupMinutes }).minutes).toBe(DEFAULT_WARMUP_MINUTES);
  });
});

describe('youth never gets a jump or a landing unless a coach assigned it (owner decision #6, #20; P6 rule (b))', () => {
  it('sweeps every input: a youth athlete without a coach assignment has no impact step at all', () => {
    for (const input of everyInput()) {
      if (!input.isYouth || input.coachAssignedImpact) continue;
      const p = generateWarmup(input);
      expect(p.steps.filter((s) => s.impact).map((s) => s.id), JSON.stringify(input)).toEqual([]);
    }
  });

  it('the Wake-Up\'s jumping phases are read off the drill\'s own targets: the pogos and the launch, nothing else', () => {
    expect(WAKE_UP.phases.filter(phaseImpact).map((p) => p.id)).toEqual(['build-the-rhythm', 'prime-the-launch']);
  });

  it('a youth squat day: the calm Wake-Up in order, the non-impact primer, and the line saying why', () => {
    const p = gen({ isYouth: true, minutes: 14 });
    expect(p.steps.filter((s) => s.kind === 'wake_up').map((s) => s.id)).toEqual(['release-the-locks', 'pressurize', 'wake-the-tripod', 'open-the-joints']);
    expect(p.steps.find((s) => s.kind === 'primer')!.id).toBe('fast-squat-primer');
    expect(p.notes.map((n) => n.id)).toContain('youth_impact');
    expect(heldBackLines(p)).toContain('Build the Rhythm, Prime the Launch, Squat Jump Primer: jumps and landings wait for your coach.');
  });

  it('with a coach\'s jump work in today\'s Prime, a youth athlete keeps the Wake-Up\'s jumps (and is told why)', () => {
    const p = gen({ isYouth: true, coachAssignedImpact: true, coachPrime: true, minutes: 14 });
    expect(p.steps.filter((s) => s.impact).map((s) => s.id)).toEqual(['build-the-rhythm', 'prime-the-launch']);
    expect(p.notes.map((n) => n.id)).toEqual(expect.arrayContaining(['coach_impact', 'coach_prime']));
    expect(p.notes.map((n) => n.id)).not.toContain('youth_impact');
    // MIRROR-COACH P6 FIX (2026-09-29, review minor): this line pinned the OPPOSITE — youth + coachAssignedImpact with no
    // Prime section got FEL's own Squat Jump Primer, a jump FEL chose, not the coach. Unreachable through
    // sessionWarmupInputs (impact is only ever read from a Prime section), but the pure function broke rule (b) for any
    // future caller. A coach's jump work keeps the Wake-Up's own jumping phases; FEL's primer for a minor is the calm one.
    const noPrime = gen({ isYouth: true, coachAssignedImpact: true });
    expect(noPrime.steps.find((s) => s.kind === 'primer')!.id).toBe('fast-squat-primer');
    expect(noPrime.steps.filter((s) => s.impact).map((s) => s.id)).toEqual(['build-the-rhythm', 'prime-the-launch']);
    expect(heldBackLines(noPrime).join(' ')).not.toMatch(/wait for your coach/);
  });

  it('the Wake-Up\'s jumping phases stay gated for youth: the owner-decision conflict (#6 vs #7/#14), held on the careful side', () => {
    expect(WAKE_UP_IMPACT_GATED).toBe(true);
    // and the minutes the two phases free go to the stretches, so a youth plan runs close to its length (it ran 6 of 10)
    for (const m of [10, 14] as const) {
      const p = gen({ isYouth: true, minutes: m });
      expect(p.totalSec, String(m)).toBeGreaterThanOrEqual(m * 60 - 60);
      expect(p.steps.filter((s) => s.kind === 'rock_hold').some((s) => s.extraRounds)).toBe(true);
    }
  });

  it('an adult gets the pattern\'s impact primer where there is one', () => {
    const want: Partial<Record<MovementPattern, string>> = { squat: 'squat-jump-primer', hinge: 'broad-jump-primer', lunge: 'split-hop-primer', locomotion: 'pogo-stick-primer' };
    for (const [pattern, id] of Object.entries(want)) expect(gen({ pattern: pattern as MovementPattern }).steps.find((s) => s.kind === 'primer')!.id).toBe(id);
  });
});

describe('a step-down or stop pain decision drops the primer and the jumping (P6 rule (b); owner decision #5)', () => {
  it('sweeps every input: no primer, no impact step, and the pain line — whatever else is true', () => {
    for (const input of everyInput()) {
      if (!input.painDecision || !STOPS.includes(input.painDecision)) continue;
      const p = generateWarmup(input);
      expect(p.steps.some((s) => s.kind === 'primer'), JSON.stringify(input)).toBe(false);
      expect(p.primer).toBe('none');
      expect(p.steps.some((s) => s.impact)).toBe(false);
      expect(p.notes.some((n) => n.id === 'pain' || n.id === 'pain_hard')).toBe(true);
    }
  });

  it('a hard stop (clinician, or tell an adult) says to do what the check-in said before training that exercise again', () => {
    expect(gen({ painDecision: 'stop_see_clinician' }).notes.find((n) => n.id === 'pain_hard')!.text).toBe(NOTE_COPY.pain_hard);
    expect(gen({ painDecision: 'stop_tell_adult', isYouth: true }).notes.find((n) => n.id === 'pain_hard')).toBeTruthy();
    expect(gen({ painDecision: 'step_down_flag_coach' }).notes.find((n) => n.id === 'pain')!.text).toBe(NOTE_COPY.pain);
  });

  it('continue and an easier variation leave the primer in (they are not stop outcomes)', () => {
    for (const painDecision of ['continue', 'easier_variation'] as const) {
      const p = gen({ painDecision });
      expect(p.steps.find((s) => s.kind === 'primer')!.id).toBe('squat-jump-primer');
      expect(p.notes.some((n) => n.id.startsWith('pain'))).toBe(false);
    }
  });
});

describe('readiness: a low day shortens the launch and the primer and says why (owner decision #12)', () => {
  it('Prime the Launch keeps its first round only; the primer is one set; the line names both', () => {
    const p = gen({ readiness: 'low', minutes: 14 });
    const launch = p.steps.find((s) => s.id === LAUNCH_PHASE_ID)!;
    const full = WAKE_UP.phases.find((x) => x.id === LAUNCH_PHASE_ID)!;
    expect(launch.shortened).toBe(true);
    expect(launch.seconds).toBe(LOW_DAY_LAUNCH_SEC);
    expect(launch.phase!.targets).toHaveLength(full.targets.length / 3);
    expect(launch.phase!.targets).toEqual(full.targets.slice(0, full.targets.length / 3));
    expect(launch.phase!.prompts.at(-1)!.id).toBe('coach.drill.done');
    const primer = p.steps.find((s) => s.kind === 'primer')!;
    expect(primer.dose).toBe('1 set of 3 low jumps');
    expect(primer.seconds).toBe(PRIMERS.find((x) => x.id === 'squat-jump-primer')!.lowDay.seconds);
    expect(p.notes.find((n) => n.id === 'low_day')!.text).toBe(lowDayNote(true, true, true));
  });

  it('the time goes to calm work instead: the stretches get extra rounds, in turn, while there is room', () => {
    const p = gen({ readiness: 'low', minutes: 14, weakestZone: 'foot' });
    const stretches = p.steps.filter((s) => s.kind === 'rock_hold');
    // 14 min on a low day: 500 s of Wake-Up (the launch at one round) + a 30 s primer leave 310 s: 3 rounds a side on
    // the first stretch, 2 a side on the second (830 s)
    expect(stretches.map((s) => [s.id, s.extraRounds, s.seconds])).toEqual([['ankle-rock', true, 3 * ROCK_HOLD_SEC], ['hinge-rock', true, 2 * ROCK_HOLD_SEC]]);
    expect(stretches[0].lines).toHaveLength(2 * MAX_LOW_DAY_ROUNDS);
    expect(stretches[0].lines.map((l) => l.text.split(':')[0]).filter((x) => /side/.test(x))).toEqual(['Left side', 'Right side', 'Left side', 'Right side', 'Left side', 'Right side']);
    expect(stretches[0].dose).toMatch(/^20 s of rocks, 10 s held, three times each side\./);
    expect(stretches[1].dose).toMatch(/^20 s of rocks, 10 s held, four times\./);          // a two-sided position
    expect(p.totalSec).toBe(830);
    // extra rounds only where the length has room: at 6 minutes there is none; never past three a side
    expect(gen({ readiness: 'low', minutes: 6 }).steps.some((s) => s.extraRounds)).toBe(false);
    for (const input of everyInput()) for (const s of generateWarmup(input).steps) if (s.kind === 'rock_hold') expect(s.seconds).toBeLessThanOrEqual(MAX_LOW_DAY_ROUNDS * (ROCK_SEC + HOLD_SEC));
  });

  // MIRROR-COACH P6 FIX (2026-09-29): this held the readiness card's old "your warm-up runs 4 minutes longer" to ±30 s.
  // The review found that sentence false wherever no generated warm-up runs (coach Prep, off days) and for youth and
  // pain days, so the card no longer names minutes (lib/health/readiness.ts readinessSuggestion); what it says now is
  // that FEL's warm-up is set longer and gentler. That is what this holds, for every pattern × area × adult or youth:
  // the low day's plan is longer than the usual one, and gentler (the launch at one round where it runs at all).
  it("what the readiness card promises is what the plan does: on a low day FEL's warm-up is set longer and gentler", () => {
    for (const pattern of ALL_PATTERNS) for (const weakestZone of ZONES) for (const isYouth of [false, true]) {
      const usual = gen({ pattern, weakestZone, isYouth, minutes: suggestedMinutes('ok') });
      const lowDay = gen({ pattern, weakestZone, isYouth, minutes: suggestedMinutes('low'), readiness: 'low' });
      const why = `${pattern} ${weakestZone} youth=${isYouth}`;
      expect(lowDay.totalSec, why).toBeGreaterThan(usual.totalSec + 60);
      expect(lowDay.totalSec, why).toBeLessThanOrEqual(suggestedMinutes('low') * 60);
      const launch = lowDay.steps.find((s) => s.id === LAUNCH_PHASE_ID);
      if (launch) expect(launch.shortened, why).toBe(true);
    }
  });

  it('it never touches the calm phases, and ok / skip / not asked change nothing', () => {
    const calm = (p: WarmupPlan) => p.steps.filter((s) => s.kind === 'wake_up' && !s.impact).map((s) => [s.id, s.seconds]);
    expect(calm(gen({ readiness: 'low', minutes: 14 }))).toEqual(calm(gen({ minutes: 14 })));
    for (const readiness of ['ok', 'skip', null] as const) expect(gen({ readiness, minutes: 14 })).toEqual(gen({ minutes: 14 }));
  });

  it('the line says only what was shortened', () => {
    expect(gen({ readiness: 'low', minutes: 6 }).notes.find((n) => n.id === 'low_day')!.text).toBe(lowDayNote(false, true, false));
    // a pain day at 6 minutes: no primer, no launch, so the freed minute goes to the stretch's extra rounds
    expect(gen({ readiness: 'low', minutes: 6, painDecision: 'step_down_flag_coach', isYouth: true }).notes.find((n) => n.id === 'low_day')!.text).toBe(lowDayNote(false, false, true));
    expect(lowDayNote(false, false, false)).toBe('You said today is a low day. An easier session is a good call today.');
    expect(gen({ readiness: 'low', coachPrime: true, minutes: 14 }).notes.find((n) => n.id === 'low_day')!.text).toBe(lowDayNote(true, false, true));
    expect(lowDayNote(true, true, true)).toBe('You said today is a low day, so the stretches get extra rounds, the launch is one round instead of three and the primer is one set. An easier session is a good call today.');
  });

  it("a low day suggests the longer warm-up — the default's fourteen plus the readiness read's four; otherwise the default", () => {
    expect(suggestedMinutes('low')).toBe(18);
    expect(LOW_DAY_WARMUP_MINUTES).toBe(DEFAULT_WARMUP_MINUTES + READINESS_EXTRA_WARMUP_MINUTES.low);
    for (const r of ['ok', 'skip', null, undefined] as const) expect(suggestedMinutes(r)).toBe(DEFAULT_WARMUP_MINUTES);
    // held together with lib/health/readiness.ts: its levels are ours, and its extra minutes are the suggested lengths
    for (const level of ['ok', 'low', 'skip'] as const satisfies readonly ReadinessLevel[]) {
      expect(suggestedMinutes(level)).toBe(warmupMinutesFor(level, DEFAULT_WARMUP_MINUTES));
      expect(WARMUP_MINUTES).toContain(suggestedMinutes(level));
    }
  });
});

// MIRROR-COACH P9 fix (2026-09-30, code review): the owner's Playbook, ch4 — "Don't stretch the psoas … kneeling lunge
// stretch, hold" — against the Half-Kneel Hip Rock and Hold that ran before every lunge, hinge, squat, locomotion and
// carry session. The Playbook's line wins; decision #7's rock-then-hold step stays (the other eight).
describe('no kneeling hip-flexor stretch-and-hold (the owner\'s Playbook, ch4)', () => {
  it('the pool holds no half-kneeling forward stretch, and the Playbook line it follows is still there', () => {
    expect(ROCK_HOLDS.map((r) => r.id)).not.toContain('hip-front-rock');
    for (const r of ROCK_HOLDS) {
      const kneelingForward = /half-kneel/i.test(`${r.name} ${r.setup}`) && /ease (the hips )?forward|hips forward/i.test(r.cue);
      expect(kneelingForward, r.id).toBe(false);
      expect(`${r.name} ${r.setup} ${r.cue}`, r.id).not.toMatch(/hip flexor|psoas|couch stretch/i);
    }
    expect(readFileSync('lib/education/playbook.data.json', 'utf8')).toMatch(/Don't stretch the psoas/);
  });
  it('every warm-up and every cool-down still has its rock-then-hold (decision #7), for every pattern', () => {
    for (const pattern of PATTERNS.filter((x) => x !== 'other')) {
      expect(ROCK_HOLDS.filter((r) => r.patterns.includes(pattern)).length, pattern).toBeGreaterThanOrEqual(2);
    }
    expect(ROCK_HOLDS.some((r) => r.zones.includes('lumbo_pelvic'))).toBe(true);   // the hips keep the owner's 90/90
  });
});

describe('the stretch aims at the weakest screen area; the primer at the pattern; general is said to be general', () => {
  it('a flagged area picks a stretch for that area (and the pattern where one fits both)', () => {
    for (const zone of WARMUP_ZONES) for (const pattern of ALL_PATTERNS) {
      const first = gen({ weakestZone: zone, pattern }).steps.find((s) => s.kind === 'rock_hold')!;
      expect(first.aim).toBe('zone');
      expect(ROCK_HOLDS.find((r) => r.id === first.id)!.zones).toContain(zone);
    }
    expect(gen({ weakestZone: 'foot', pattern: 'squat' }).steps.find((s) => s.kind === 'rock_hold')!.id).toBe('ankle-rock');
    expect(gen({ weakestZone: 'rib_thoracic', pattern: 'push' }).steps.find((s) => s.kind === 'rock_hold')!.id).toBe('open-book-rock');
  });

  it('the second stretch (14 minutes) fits the pattern and aims somewhere else', () => {
    const [a, b] = pickRockHolds('squat', 'foot', 2);
    expect(a.step.id).toBe('ankle-rock');
    expect(b.aim).toBe('pattern');
    expect(b.step.patterns).toContain('squat');
    expect(b.step.zones).not.toContain('foot');
    // with no screen area too: the two stretches for a pattern cover two different areas where the pattern has them
    // (found by the P6 trace: a squat day with no area got the ankle AND the wall calf, both the feet)
    for (const pattern of PATTERNS.filter((x) => x !== 'other')) {
      const [x, y] = pickRockHolds(pattern, null, 2).map((o) => o.step);
      const canSpread = ROCK_HOLDS.some((r) => r.id !== x.id && r.patterns.includes(pattern) && !r.zones.some((z) => x.zones.includes(z)));
      if (canSpread) expect(y.zones.some((z) => x.zones.includes(z)), `${pattern}: ${x.id} + ${y.id}`).toBe(false);
    }
    expect(pickRockHolds('squat', null, 2).map((o) => o.step.id)).toEqual(['ankle-rock', 'hinge-rock']);
  });

  it('every pattern has two stretches that fit it; nothing and "other" take the general pair', () => {
    for (const pattern of PATTERNS.filter((x) => x !== 'other')) {
      expect(ROCK_HOLDS.filter((r) => r.patterns.includes(pattern)).length, pattern).toBeGreaterThanOrEqual(2);
      expect(pickRockHolds(pattern, null, 2).map((x) => x.aim)).toEqual(['pattern', 'pattern']);
    }
    for (const pattern of [null, 'other'] as const) expect(pickRockHolds(pattern, null, 2).map((x) => x.step.id)).toEqual([...GENERAL_ROCK_HOLDS]);
  });

  it('untagged, "other", ungraded and clear each say so honestly', () => {
    expect(gen({ pattern: null, patternFrom: 'untagged_key_set' }).notes.find((n) => n.id === 'untagged')!.text).toBe(untaggedNote('untagged_key_set', false));
    expect(gen({ pattern: null, patternFrom: null }).notes.find((n) => n.id === 'untagged')!.text).toBe(untaggedNote(null, false));
    expect(gen({ pattern: 'other', patternFrom: 'key_set' }).notes.find((n) => n.id === 'untagged')!.text).toBe(untaggedNote('key_set', true));
    expect(gen({ pattern: null }).primer).toBe('general');
    expect(gen({ pattern: null }).steps.find((s) => s.kind === 'primer')!.id).toBe(GENERAL_PRIMER_ID);
    expect(gen({ screen: 'clear' }).notes.find((n) => n.id === 'screen_clear')!.text).toBe(screenClearNote(true));
    expect(gen({ screen: 'ungraded', pattern: null }).notes.find((n) => n.id === 'screen_none')!.text).toBe(screenNoneNote(false));
    expect(gen({ weakestZone: 'foot' }).notes.find((n) => n.id === 'zone')!.text).toBe(zoneNote('foot'));
    expect(gen({ pattern: 'hinge', patternFrom: 'key_section' }).notes.map((n) => n.id)).toContain('no_key_set');
    expect(gen({ pattern: 'hinge', patternFrom: 'key_set' }).notes.map((n) => n.id)).not.toContain('untagged');
  });

  it('a coach\'s own Prime section is today\'s primer: none added, and said', () => {
    const p = gen({ coachPrime: true });
    expect(p.steps.some((s) => s.kind === 'primer')).toBe(false);
    expect(p.notes.find((n) => n.id === 'coach_prime')!.text).toBe(NOTE_COPY.coach_prime);
  });
});

describe('the content: FEL\'s, youth-safe where it says so, and every line clean', () => {
  it('ids are unique; every impact primer is off for youth; every pattern has a non-impact primer to fall back on', () => {
    const ids = [...ROCK_HOLDS.map((r) => r.id), ...PRIMERS.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRIMERS) if (p.impact) expect(p.youthSafe, p.id).toBe(false);
    for (const pattern of ALL_PATTERNS) expect(pickPrimer(pattern, false).primer.impact, String(pattern)).toBe(false);
    for (const r of ROCK_HOLDS) { expect(r.impact).toBe(false); expect(r.youthSafe).toBe(true); expect(r.seconds).toBe(ROCK_HOLD_SEC); }
    expect(ROCK_HOLD_SEC).toBe(2 * (ROCK_SEC + HOLD_SEC));
    for (const p of PRIMERS) { expect(p.lowDay.sets).toBe(1); expect(p.lowDay.seconds).toBeLessThan(p.dose.seconds); }
  });

  it('the screen areas agree with the corrective mapping; the heel line (no block) is the foot', () => {
    for (const id of GRADER_IDS) expect(CHECK_ZONE[id], id).toBe(CORRECTIVE_BLOCK[id]?.zone ?? 'foot');
    for (const z of WARMUP_ZONES) expect(ZONE_WORDS[z]).toMatch(/^your /);
  });

  // MIRROR-COACH P6 FIX (2026-09-29, review — honesty rule): the zone note is a claim about what the CAMERA flagged, and
  // it said "your upper back and ribs" (a shoulder/head-landmark read) and "the backs of your legs" (a knee-window read).
  // MediaPipe's 33 landmarks have no rib or abdomen point. Words name only what the landmarks read.
  it('no area and no zone note names a body part the camera has no landmark for (ribs, abdomen, belly, backs of the legs)', () => {
    const NOT_A_LANDMARK = /\bribs?\b|abdom\w*|belly|stomach|\bcore\b|backs? of (the|your) legs|hamstrings?|glutes?|spine|lumbar|pelvi\w*/i;
    for (const z of WARMUP_ZONES) {
      expect(ZONE_WORDS[z], z).not.toMatch(NOT_A_LANDMARK);
      expect(zoneNote(z), z).not.toMatch(NOT_A_LANDMARK);
      expect(zoneNote(z)).toMatch(/camera estimate/);
    }
    expect(ZONE_WORDS.rib_thoracic).toBe('your shoulders and upper back');
    expect(ZONE_WORDS.posterior_chain).toBe('your hips and knees');
  });

  // The book (Pain-Free Performance, Rusin & Cordoza) appears only as Education's further reading: none of its names,
  // method names or phase names here. And the honesty rule: no risk, prevent or injury, no treatment or cure claim.
  const BOOK = /Pain[- ]?Free|Rusin|Cordoza|Victory Belt|biphasic|pin[- ]and[- ]stretch|soft[- ]tissue|nervous[- ]system primer|tension table/i;
  // acronyms, case-sensitive: the owner's own Wall Drive says "a straight ramp", which is not the warm-up acronym
  const ACRONYMS = /\bRAMP\b|\bPAILs?\b|\bRAILs?\b|\bCARs\b|\bRPR\b/;
  // MIRROR-COACH P8 FIX (2026-09-30): `heal\w*` also caught "health", so the protocol gate's own lines ("…your health
  // answers") could not appear in the warm-up's jump-gate note. NARROWED ON PURPOSE, and only that far: heal, heals,
  // healed, healing (the claim words) stay banned — the negative control below proves it; "health" is not a claim.
  const CLAIMS = /\b(injur\w*|prevent\w*|risks?|reduc\w*|protect\w*|heal(?!th)\w*|cure\w*|treat\w*|rehab\w*|guarantee\w*|safer)\b/i;
  const lint = (text: string) => {
    expect(text, text).not.toMatch(BOOK);
    expect(text, text).not.toMatch(ACRONYMS);
    expect(text, text).not.toMatch(CLAIMS);
    expect(text, text).not.toMatch(/diagnos/i);
    expect(screenText(text), text).toEqual([]);
  };

  it('the claims lint still bans the heal words (negative control for the P8 narrowing), and lets "health answers" through', () => {
    for (const bad of ['It helps you heal', 'Heals the knee', 'healed faster', 'a healing warm-up']) expect(bad).toMatch(CLAIMS);
    expect('Jumps and drops wait for your health answers.').not.toMatch(CLAIMS);
  });

  it('every line of content, every note and every step of every plan passes the lint', () => {
    for (const r of ROCK_HOLDS) [r.name, r.setup, r.cue].forEach(lint);
    for (const p of PRIMERS) [p.name, p.cue, p.dose.reps, p.lowDay.reps].forEach(lint);
    [WARMUP_MEANING, WAKE_UP_SOURCE_LINE, ...Object.values(NOTE_COPY), ...WARMUP_ZONES.map(zoneNote),
      screenClearNote(true), screenClearNote(false), screenNoneNote(true), screenNoneNote(false),
      untaggedNote('untagged_key_set', false), untaggedNote(null, false), untaggedNote('key_set', true),
      lowDayNote(true, true), lowDayNote(true, false), lowDayNote(false, true), lowDayNote(false, false),
      // MIRROR-COACH P8 FIX: the jump gate's note (with the gate's own lines — protocolGate.test.ts lints those too)
      jumpGateNote(''), jumpGateNote(PROTOCOL_WHY.landing_never), jumpGateNote(PROTOCOL_WHY.intake_answer), JUMP_GATE_DEFAULT_WHY,
      ...heldBackLines({ heldBack: [{ id: 'x', name: 'Build the Rhythm', why: 'jump_gate' }] })].forEach(lint);
    const seen = new Set<string>();
    for (const input of everyInput()) for (const t of planText(generateWarmup(input))) seen.add(t);
    seen.forEach(lint);
    expect(seen.size).toBeGreaterThan(50);
    expect(WARMUP_MEANING).toMatch(/builds capacity/);
  });

  it('the section it stands in for is FEL\'s own Prep section', () => {
    expect(SESSION_SECTIONS[0].id).toBe('prep');
  });
});

describe('today\'s inputs', () => {
  const ex = (order: number, section: string, pattern: MovementPattern | null, isKeySet = false) =>
    ({ order, section, isKeySet, coaching: { pattern: pattern ? { id: pattern } : null } });

  it('the main pattern is the key set\'s; an untagged key set is untagged, not swapped for another exercise', () => {
    expect(sessionWarmupInputs([ex(1, 'assist', 'lunge'), ex(2, 'key', 'hinge', true)])).toMatchObject({ pattern: 'hinge', patternFrom: 'key_set' });
    expect(sessionWarmupInputs([ex(1, 'key', 'squat'), ex(2, 'key', null, true)])).toMatchObject({ pattern: null, patternFrom: 'untagged_key_set' });
    expect(sessionWarmupInputs([ex(2, 'key', 'push'), ex(1, 'assist', 'pull')])).toMatchObject({ pattern: 'push', patternFrom: 'key_section' });
    expect(sessionWarmupInputs([ex(1, 'assist', 'pull')])).toMatchObject({ pattern: null, patternFrom: null });
  });

  // MIRROR-COACH P6 FIX (2026-09-29, review BLOCKER): this pinned ANY 'locomotion' item in Prime as "coach assigned
  // impact". FEL's own off-day Easy Walk is tagged locomotion (lib/coach/offDay.ts), so a walk in a 14-year-old's Prime
  // unlocked the pogos and the dip-jump-stomp and told them their coach put jumping there (trace in the review). Jump
  // work is now the catalogue row's jump tagging (lib/coach/today.ts isJumpWork → TodayCoaching.jumpLand).
  const jump = (order: number, section: string, pattern: MovementPattern | null) =>
    ({ order, section, isKeySet: false, coaching: { pattern: pattern ? { id: pattern } : null, jumpLand: true } });
  it('coach Prep, coach Prime and a coach\'s JUMP work in Prime are read off the sections — the jump tagging, not the pattern', () => {
    expect(sessionWarmupInputs([ex(1, 'prep', 'mobility'), ex(2, 'key', 'squat', true)])).toMatchObject({ coachPrep: true, coachPrime: false, coachAssignedImpact: false });
    expect(sessionWarmupInputs([jump(1, 'prime', 'locomotion'), ex(2, 'key', 'squat', true)])).toMatchObject({ coachPrep: false, coachPrime: true, coachAssignedImpact: true });
    // jump work tagged with another pattern still counts: a box jump filed under squat
    expect(sessionWarmupInputs([jump(1, 'prime', 'squat'), ex(2, 'key', 'squat', true)])).toMatchObject({ coachAssignedImpact: true });
    // jump work anywhere but Prime is not a Prime assignment
    expect(sessionWarmupInputs([ex(1, 'prime', 'squat'), jump(2, 'key', 'locomotion')])).toMatchObject({ coachPrime: true, coachAssignedImpact: false });
  });

  it('a WALK, a sprint or any non-jump locomotion item in Prime leaves a youth athlete\'s jumps off — and the card says nothing about the coach assigning them', async () => {
    const { todayExercise } = await import('./today');
    const { OFF_DAY_ITEMS } = await import('./offDay');
    const walkRow = OFF_DAY_ITEMS.find((i) => i.key === 'easy-walk')!.catalogue;
    expect(walkRow.pattern).toBe('locomotion');
    const te = (id: string, section: string, row: Record<string, unknown>, isKeySet = false) => todayExercise({
      id, order: section === 'prime' ? 1 : 2, exerciseId: `pe-${id}`, name: String(row.name), sets: 1, reps: '5', load: '', tempo: '0-0-0-0', restSeconds: 0,
      coachNote: null, section: section as never, isKeySet, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null,
    }, row, new Map());
    const squat = te('sq', 'key', { name: 'Goblet Squat', pattern: 'squat', category: 'lower-body' }, true);
    const primes = {
      'the off-day Easy Walk': te('walk', 'prime', walkRow),
      'a build-up sprint': te('sprint', 'prime', { name: 'Build-up Sprint', pattern: 'locomotion', category: 'conditioning', skillLayer: 'speed' }),
      'a lateral shuffle': te('shuffle', 'prime', { name: 'Lateral Shuffle', pattern: 'locomotion', category: 'conditioning' }),
    };
    for (const [name, item] of Object.entries(primes)) {
      expect(item.coaching.jumpLand, name).toBe(false);
      const inputs = sessionWarmupInputs([item, squat]);
      expect(inputs.coachAssignedImpact, name).toBe(false);
      for (const minutes of [10, 14] as const) {
        const p = generateWarmup({ pattern: inputs.pattern, weakestZone: null, minutes, isYouth: true, painDecision: null, readiness: null, coachAssignedImpact: inputs.coachAssignedImpact, coachPrime: inputs.coachPrime });
        expect(p.steps.filter((s) => s.impact).map((s) => s.id), `${name} ${minutes}`).toEqual([]);
        expect(p.notes.map((n) => n.id), name).not.toContain('coach_impact');
        expect(p.notes.map((n) => n.id), name).toContain('youth_impact');
      }
    }
    // and real jump work in Prime does turn it on: a Jump & Land row, or a plyometric one
    for (const row of [{ name: 'Single-leg Pogos', pattern: 'locomotion', skillLayer: 'jump-land' }, { name: 'Box Jump', pattern: 'squat', category: 'plyometric' }]) {
      const item = te('j', 'prime', row);
      expect(item.coaching.jumpLand, row.name).toBe(true);
      const inputs = sessionWarmupInputs([item, squat]);
      const p = generateWarmup({ pattern: inputs.pattern, weakestZone: null, minutes: 14, isYouth: true, painDecision: null, readiness: null, coachAssignedImpact: inputs.coachAssignedImpact, coachPrime: inputs.coachPrime });
      expect(p.steps.filter((s) => s.impact).map((s) => s.id), row.name).toEqual(['build-the-rhythm', 'prime-the-launch']);
      expect(p.notes.map((n) => n.id)).toContain('coach_impact');
    }
  });
});

describe('the weakest screen area', () => {
  const o = (checkId: string, status = 'flag', borderline?: boolean) => ({ checkId, status, ...(borderline ? { borderline } : {}) });
  it('most flags wins; a tie goes from the ground up; borderline counts half; passes and retests count nothing', () => {
    expect(weakestZone([o('hipLevel'), o('singleLeg'), o('heelLine')])).toEqual({ zone: 'lumbo_pelvic', checks: ['hipLevel', 'singleLeg'] });
    expect(weakestZone([o('shoulderLevel'), o('heelLine')])).toEqual({ zone: 'foot', checks: ['heelLine'] });
    expect(weakestZone([o('kneeWindow'), o('headFloat', 'flag', true), o('shoulderLevel', 'flag', true)])!.zone).toBe('posterior_chain');
    expect(weakestZone([o('kneeWindow', 'pass'), o('heelLine', 'retest'), o('nope')])).toBeNull();
    expect(weakestZone([])).toBeNull();
  });
});

describe('today\'s pain decision', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  const r = (exerciseName: string, bodyArea: string, decision: string, hoursAgo: number) => ({ exerciseName, bodyArea, decision, createdAt: new Date(now.getTime() - hoursAgo * 3_600_000) });
  it('the newest per exercise and area (a settled follow-up replaces a step-down), then the most careful across them', () => {
    expect(painDecisionToday([r('Squat', 'knee', 'step_down_flag_coach', 20), r('Squat', 'knee', 'easier_variation', 2)], now)).toBe('easier_variation');
    expect(painDecisionToday([r('Squat', 'knee', 'easier_variation', 2), r('Row', 'shoulder', 'step_down_flag_coach', 30)], now)).toBe('step_down_flag_coach');
    expect(painDecisionToday([r('Row', 'shoulder', 'stop_see_clinician', 50), r('Squat', 'knee', 'continue', 1)], now)).toBe('stop_see_clinician');
    expect(painDecisionToday([], now)).toBeNull();
  });
  it('a week back and no further; an unknown decision or a row from the future is ignored', () => {
    expect(painDecisionToday([r('Squat', 'knee', 'step_down_flag_coach', PAIN_LOOKBACK_DAYS * 24 + 1)], now)).toBeNull();
    expect(painDecisionToday([r('Squat', 'knee', 'step_down_flag_coach', PAIN_LOOKBACK_DAYS * 24 - 1)], now)).toBe('step_down_flag_coach');
    expect(painDecisionToday([r('Squat', 'knee', 'nonsense', 1)], now)).toBeNull();
    expect(painDecisionToday([r('Squat', 'knee', 'stop_see_clinician', -5)], now)).toBeNull();
  });
});

describe('the guided run on Today', () => {
  const plan = gen({ minutes: 6 });
  it('finds the step, how far in, and the line to read now', () => {
    expect(runnerAt(plan, 0)).toMatchObject({ index: 0, stepSec: 0, done: false });
    expect(runnerAt(plan, 0).step!.id).toBe('pressurize');
    const tripod = stepStartSec(plan, 1);
    expect(runnerAt(plan, tripod + 1).step!.id).toBe('wake-the-tripod');
    const joints = stepStartSec(plan, 2);
    expect(runnerAt(plan, joints + 31).line).toBe('Right ankle circles.');
    const stretch = stepStartSec(plan, 3);
    expect(runnerAt(plan, stretch + ROCK_SEC + 1).line).toBe('Hold still. One long breath out.');
    expect(runnerAt(plan, plan.totalSec)).toMatchObject({ done: true, step: null });
    expect(runnerAt(plan, -5).index).toBe(0);
  });

  it('reads the breathing pacer: in 4, hold 2, out 6, three rounds, from 6 s', () => {
    const pacer = WAKE_UP.phases[1].pacer!;
    expect(breathAt(pacer, 5)).toBeNull();
    expect(breathAt(pacer, 6)).toEqual({ phase: 'in', left: 4 });
    expect(breathAt(pacer, 10.5)).toEqual({ phase: 'hold', left: 2 });
    expect(breathAt(pacer, 12)).toEqual({ phase: 'out', left: 6 });
    expect(breathAt(pacer, 6 + 36)).toBeNull();
    expect(breathAt(undefined, 10)).toBeNull();
  });

  it('pause holds the clock, resume carries on from it, next jumps to the next step\'s start', () => {
    let r = startGuided(1000);
    expect(guidedElapsed(r, 11_000)).toBe(10);
    r = pauseGuided(r, 11_000);
    expect(guidedElapsed(r, 50_000)).toBe(10);
    r = resumeGuided(r, 50_000);
    expect(guidedElapsed(r, 52_000)).toBe(12);
    r = nextGuided(plan, r, 52_000);
    expect(guidedElapsed(r, 52_000)).toBe(stepStartSec(plan, 1));
    const paused = nextGuided(plan, pauseGuided(r, 53_000), 53_000);
    expect(paused.pausedAt).toBe(53_000);
    expect(guidedElapsed(paused, 90_000)).toBe(stepStartSec(plan, 2));
    expect(guidedElapsed(nextGuided(plan, { from: 0, baseSec: plan.totalSec, pausedAt: null }, 0), 0)).toBe(plan.totalSec);
  });
});

describe('the camera hand-off: the plan\'s Wake-Up as a Drill a DrillRunner can play', () => {
  it('no page mounts the drill runner yet, so the link is off (the guided run is the way in)', () => {
    expect(WAKE_UP_CAMERA_HREF).toBeNull();
  });

  it('keeps only the plan\'s phases, in order; the full 10, 14 and 18 are WAKE_UP itself; nothing kept is null', () => {
    for (const minutes of [10, 14, 18] as const) expect(wakeUpDrillFor(gen({ minutes }))).toBe(WAKE_UP);
    const d = wakeUpDrillFor(gen({ minutes: 14, readiness: 'low' }))!;
    expect(d.id).toBe(WAKE_UP.id);
    expect(d.phases.map((p) => p.id)).toEqual(['release-the-locks', 'pressurize', 'wake-the-tripod', 'open-the-joints', 'build-the-rhythm', 'prime-the-launch']);
    expect(d.phases.at(-1)!.durationSec).toBe(LOW_DAY_LAUNCH_SEC);
    expect(wakeUpDrillFor(gen({ minutes: 6 }))!.phases.map((p) => p.id)).toEqual(['pressurize', 'wake-the-tripod', 'open-the-joints']);
    expect(wakeUpDrillFor({ minutes: 6, steps: [] })).toBeNull();
  });

  it('a DrillRunner runs the shortened drill to the end with a body in frame', () => {
    const drill = wakeUpDrillFor(gen({ minutes: 6, isYouth: true }))!;
    const runner = new DrillRunner(drill);
    let st = runner.tick(0, true);
    for (let t = 0; t < (drill.phases.reduce((s, p) => s + p.durationSec, 0) + 5) * 1000 && st.status !== 'complete'; t += 250) st = runner.tick(t, true);
    expect(st.status).toBe('complete');
  });

  it('shortenPhase makes a copy; the original phase is untouched', () => {
    const launch = WAKE_UP.phases.find((p) => p.id === LAUNCH_PHASE_ID)!;
    const n = launch.targets.length;
    const short = shortenPhase(launch, LOW_DAY_LAUNCH_SEC);
    expect(short).not.toBe(launch);
    expect(launch.targets).toHaveLength(n);
    expect(launch.durationSec).toBe(120);
  });
});

describe('the server\'s answer, read on the client', () => {
  it('anything but an explicit adult is youth rules; junk is the careful fallback', () => {
    expect(readWarmupContext(null)).toEqual(FALLBACK_WARMUP_CONTEXT);
    expect(readWarmupContext([1])).toEqual(FALLBACK_WARMUP_CONTEXT);
    expect(readWarmupContext({}).isYouth).toBe(true);
    expect(readWarmupContext({ isYouth: 'no' }).isYouth).toBe(true);
    expect(readWarmupContext({ isYouth: false }).isYouth).toBe(false);
  });
  it('an area is kept only when it is one of the four; a decision only when it is painRule\'s', () => {
    expect(readWarmupContext({ isYouth: false, zone: { id: 'foot', words: 'x', checks: ['heelLine', 3] }, screen: 'flagged' }))
      .toMatchObject({ zone: { id: 'foot', words: ZONE_WORDS.foot, checks: ['heelLine'] }, screen: 'flagged' });
    expect(readWarmupContext({ zone: { id: 'elbow' }, screen: 'flagged' })).toMatchObject({ zone: null, screen: 'none' });
    expect(readWarmupContext({ painDecision: 'stop_tell_adult' }).painDecision).toBe('stop_tell_adult');
    expect(readWarmupContext({ painDecision: 'maybe' }).painDecision).toBeNull();
    expect(readWarmupContext({ hardStopped: 'yes' }).hardStopped).toBe(false);
    expect(readWarmupContext({ hardStopped: true }).hardStopped).toBe(true);
  });
  // MIRROR-COACH P6 FIX (2026-09-29, review minor): the fallback used to say NOTE_COPY.youth_impact ("under 18, or with
  // no birth year on your account") and screen_none ("no graded Movement Screen on file yet") — both false for an adult
  // with a birth year and a screen whose request simply failed. The careful rules stay; the stated reason is the truth.
  it('the fallback plan is the careful one — no jumps, no screen aim — and it says the details did not load, not "under 18"', () => {
    expect(FALLBACK_WARMUP_CONTEXT.unavailable).toBe(true);
    expect(readWarmupContext({ isYouth: false }).unavailable).toBeUndefined();
    const p = generateWarmup({ ...base, isYouth: FALLBACK_WARMUP_CONTEXT.isYouth, weakestZone: null, screen: FALLBACK_WARMUP_CONTEXT.screen, contextUnavailable: true });
    expect(p.steps.some((s) => s.impact)).toBe(false);
    expect(p.notes.map((n) => n.id)).toEqual(['context_unavailable']);
    expect(p.notes[0].text).not.toMatch(/under 18|birth year|no graded/i);
    expect(heldBackLines(p)).toEqual(['Build the Rhythm, Prime the Launch, Squat Jump Primer: left out until your details load.']);
    // a real youth context still says why, in its own words
    expect(gen({ isYouth: true }).notes.map((n) => n.id)).toContain('youth_impact');
  });
});


// ── MIRROR-COACH P8 FIX (2026-09-30, code review): P8's protocol gate reaches the warm-up ────────────────────────────
describe("THE JUMP GATE (rule (b)): a shut gate holds the Wake-Up's jumps and FEL's jump primer", () => {
  const shut = { closed: true, why: PROTOCOL_WHY.landing_never, href: '/play/mirror/assess' };
  it('the switch is on (the owner-decision conflict, resolved on the careful side)', () => {
    expect(WARMUP_FOLLOWS_JUMP_GATE).toBe(true);
  });
  it('an adult, gate open (or no verdict handed in): jumps as before', () => {
    for (const jumpGate of [undefined, { closed: false, why: '', href: null }]) {
      expect(gen({ pattern: 'squat', isYouth: false, jumpGate }).steps.filter((x) => x.impact).map((x) => x.id)).toEqual(['build-the-rhythm', 'prime-the-launch', 'squat-jump-primer']);
    }
  });
  for (const pattern of ['squat', 'hinge', 'lunge', 'locomotion'] as const) {
    it(`an adult, gate shut, a ${pattern} day: no impact step at all, the calm primer, and the gate's line`, () => {
      const p = gen({ pattern, isYouth: false, jumpGate: shut });
      expect(p.steps.some((x) => x.impact)).toBe(false);
      expect(p.steps.find((x) => x.kind === 'primer')?.impact ?? false).toBe(false);
      expect(p.heldBack.filter((x) => x.why === 'jump_gate').length).toBeGreaterThanOrEqual(3);
      expect(p.notes.find((n) => n.id === 'jump_gate')!.text).toBe(jumpGateNote(PROTOCOL_WHY.landing_never));
    });
  }
  it("a coach's Prime (no FEL primer that day): the Wake-Up's jumps still wait", () => {
    const p = gen({ pattern: 'squat', isYouth: false, coachPrime: true, jumpGate: shut });
    expect(p.steps.some((x) => x.impact)).toBe(false);
  });
  it("a youth athlete whose coach put jumps in Prime (the youth rule lifted): the gate's other reasons still hold them", () => {
    const open = gen({ pattern: 'squat', isYouth: true, coachAssignedImpact: true });
    expect(open.steps.some((x) => x.kind === 'wake_up' && x.impact)).toBe(true);
    const p = gen({ pattern: 'squat', isYouth: true, coachAssignedImpact: true, jumpGate: shut });
    expect(p.steps.some((x) => x.impact)).toBe(false);
    expect(p.heldBack.filter((x) => x.why === 'jump_gate').map((x) => x.id)).toEqual(['build-the-rhythm', 'prime-the-launch']);
    expect(p.notes.map((n) => n.id)).not.toContain('coach_impact');
  });
  it('the youth rule keeps its own words when both hold', () => {
    const p = gen({ pattern: 'squat', isYouth: true, jumpGate: shut });
    expect(p.heldBack.filter((x) => x.why === 'youth_impact').length).toBeGreaterThan(0);
    expect(p.notes.map((n) => n.id)).toContain('youth_impact');
  });
  it('the time the held phases free goes to the stretches exactly as it does for a youth plan (the same steps, the same length)', () => {
    for (const minutes of WARMUP_MINUTES) {
      const adult = gen({ pattern: 'squat', isYouth: false, minutes, jumpGate: shut });
      const youth = gen({ pattern: 'squat', isYouth: true, minutes });
      expect(adult.steps.map((x) => [x.id, x.seconds])).toEqual(youth.steps.map((x) => [x.id, x.seconds]));
      expect(adult.totalSec).toBeLessThanOrEqual(minutes * 60);
    }
  });
});
