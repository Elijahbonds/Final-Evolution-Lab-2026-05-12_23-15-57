// TODAY-DRILL (owner playtest 2026-10-27: "the today's drill section needs big improvement. Needs clearer instructions
// and better purpose"): the plain-language guide around today's drill — why today, what it improves, the numbered
// steps, the 2–3 key cues, what you need, the one-cue-at-a-time words during the run, and the result read back as
// what we saw / what it means / what's next.
//
// Pure and client-safe. It never edits a chart: the drills (lib/drills/drills.ts) keep the book's words, and this file
// says the same moves in plain words beside them. Every count in a step (sets, reps, rest) is READ FROM THE CHART the
// day runs (lib/daily-drill/compose.ts phaseOf), so a step can never promise a rep the drill does not ask for.
//
// LESS TEXT (owner 2026-10-27: the app "feels cheap" partly from "too much text"; a dark premium athletic look): big
// numbers, the demo and icon chips carry the meaning. Budgets, held by tests/daily-drill/today-drill-flow.test.tsx: a
// first-timer's page ≤ 110 words before Start, a returning player's ≤ 40; ≤ 3 steps of ≤ 6 words; 2 cues; the result's
// three rows ≤ 12 words each.
//
// COPY STYLE (until lane/cue-rewrite's docs/CUE-STYLE.md lands): short, positive, action-first; about a 6th–8th grade
// reading level (guide.test.ts holds every fixed line to Flesch–Kincaid grade ≤ 8); no jargon without a plain gloss; no
// medical words (lib/coach/weeklyDraft/copy.ts MEDICAL_WORDS, held by the test); teen-appropriate; never shaming. Product
// copy for the owner's review — none of it is legal, policy or pain-rule text (the pain rule's words stay in
// lib/health/painRule.ts and are shown verbatim by the pain check-in).
import type { DrillPhase } from '@/lib/drills/chart';
import type { DrillPhaseResult, DrillResult } from '@/lib/drills/DrillRunner';
import { phaseOf, type PhaseRef } from './compose';
import type { Focus } from './plan';
import type { SkillReading } from './skills';

/** The drills a day can run (plan.ts FOCUS_DRILLS). */
export type GuideDrillId = 'pogo-bilateral' | 'countermovement-geometry' | 'safe-landing' | 'wake-up';

interface PhaseWords { name: string; cue: string }

export interface DrillGuide {
  /** The plain name ("Soft landings"); the book's name stays beside it as a small label. */
  title: string;
  /** What today's drill works on, in the why-line ("soft landings"). */
  works: string;
  /** What it improves: one short phrase. */
  improves: string;
  /** The 2 key cues, as big chips. */
  cues: [string, string];
  /** What one rep is called, plural ("hops"). */
  unit: string;
  /** The work step's tail after the rep count, for a one-set drill ("slow squats, hold 3"). */
  workStep?: string;
  /** Jumps or lands: clear above, shoes on. */
  jumps: boolean;
  /** Plain words for each phase of the drill (and of the warm-up), by phase id. */
  phases: Record<string, PhaseWords>;
}

/** The quick Wake-Up's phases, as a short drill's warm-up runs them (plan.ts PREP_PHASES). */
const WARMUP_WORDS: Record<string, PhaseWords> = {
  'release-the-locks': { name: 'Loosen up', cue: 'Hands on a wall. Tense, relax, sink lower.' },
  pressurize: { name: 'Breathe', cue: 'In for 4. Hold 2. Out for 6.' },
  'wake-the-tripod': { name: 'Wake up your feet', cue: 'Grip with heel and toes. Lift the arch.' },
  'open-the-joints': { name: 'Joint circles', cue: 'Slow circles, as big as feels easy.' },
  'build-the-rhythm': { name: 'Bounce', cue: 'Quick, quiet bounces on your toes.' },
  'prime-the-launch': { name: 'Jump and freeze', cue: 'Dip, jump, land soft, freeze.' },
};

const REST_WORDS: PhaseWords = { name: 'Rest', cue: 'Walk it off. Back in the picture soon.' };

export const GUIDES: Record<GuideDrillId, DrillGuide> = {
  'pogo-bilateral': {
    title: 'Springy hops',
    works: 'springy hops',
    improves: 'Quicker first step, higher jump.',
    cues: ['On your toes', 'Quick, quiet'],
    unit: 'hops',
    jumps: true,
    phases: {
      ...WARMUP_WORDS,
      'set-1': { name: 'Hops: set 1', cue: 'Quick, quiet hops.' },
      'set-2': { name: 'Hops: set 2', cue: 'Same bounce. Stay quiet.' },
      'set-3': { name: 'Hops: last set', cue: 'Last set. Light feet.' },
      'rest-1': REST_WORDS,
      'rest-2': REST_WORDS,
    },
  },
  'countermovement-geometry': {
    title: 'Slow squat check',
    works: 'slow squats',
    improves: 'A stronger dip before you jump.',
    cues: ['Hips back', 'Heels down'],
    unit: 'squats',
    workStep: 'slow squats, hold 3',
    jumps: false,
    phases: {
      ...WARMUP_WORDS,
      geometry: { name: 'Slow squats', cue: 'Sink slowly. Hold 3. Rise slowly.' },
    },
  },
  'safe-landing': {
    title: 'Soft landings',
    works: 'soft landings',
    improves: 'Steady landings on every jump.',
    cues: ['Both feet together', 'Freeze for 3'],
    unit: 'landings',
    workStep: 'hops, land and freeze',
    jumps: true,
    phases: {
      ...WARMUP_WORDS,
      landings: { name: 'Soft landings', cue: 'Small hop. Land soft. Freeze for 3.' },
    },
  },
  'wake-up': {
    title: 'Full-body wake-up',
    works: 'a full-body wake-up',
    improves: 'Loose joints, ready to play.',
    cues: ['Slow and smooth', 'Easy range only'],
    unit: 'moves',
    jumps: false,
    phases: { ...WARMUP_WORDS },
  },
};

export const isGuideDrill = (id: string): id is GuideDrillId => id in GUIDES;
export function guideFor(drillId: string): DrillGuide {
  return isGuideDrill(drillId) ? GUIDES[drillId] : GUIDES['wake-up'];
}

/** A phase's plain name and cue; the book's own when this guide has none for it. */
export function phaseWords(drillId: string, phase: Pick<DrillPhase, 'id' | 'name' | 'cue' | 'presence'>): PhaseWords {
  const g = guideFor(drillId).phases[phase.id];
  if (g) return g;
  return phase.presence === 'free' ? REST_WORDS : { name: phase.name, cue: phase.cue };
}

/** Reps in a phase: its targets, a landing counted with the jump it ends (one rep = one hop and its landing). */
export const phaseReps = (p: Pick<DrillPhase, 'targets'>): number => p.targets.filter((t) => t.move !== 'land').length;

// ── the copy ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** The first-timer's line: what the daily drill is (the reward line beside it says what finishing pays). */
export const FIRST_TIME_LINE = 'New: one short drill a day, from your lowest score.';
export const START_LABEL = 'Start';
export const START_AGAIN_LABEL = 'Do it again';

/** The setup, as icon chips. The distance is body play's own (SETUP_HINT, 3.5 to 4.5 m), rounded to its middle. */
export function needChips(jumps: boolean, minutes: number): { id: 'time' | 'phone' | 'floor' | 'shoes' | 'above'; text: string; label: string }[] {
  return [
    { id: 'time', text: `${minutes} min`, label: `${minutes} minutes` },
    { id: 'phone', text: '4 m', label: 'Phone 4 m away, whole body in the picture' },
    { id: 'floor', text: '2 m floor', label: '2 m of clear floor' },
    ...(jumps ? [{ id: 'shoes' as const, text: 'Shoes on', label: 'Shoes with grip' }, { id: 'above' as const, text: 'Clear above', label: 'Nothing overhead to hit' }] : []),
  ];
}

/** The reward as two chips for the page: the credits, and the streak day (a flame icon says "streak"). */
export function rewardParts(credit: number, streak: { opensToday: boolean; nextDays: number }, done: { amount: number; streakDays: number | null } | null): { credits: string; day: number | null; done: boolean } {
  if (done) return { credits: `+${done.amount} Lab Credits`, day: done.streakDays || null, done: true };
  return { credits: `+${credit} Lab Credits`, day: streak.opensToday ? streak.nextDays : null, done: false };
}

/** What finishing pays, as one short line (the claim's own amounts, unchanged): "+10 Lab Credits · Day 4 streak". */
export function rewardChip(credit: number, streak: { opensToday: boolean; nextDays: number }, done: { amount: number; streakDays: number | null } | null): string {
  if (done) return `Done · +${done.amount} Lab Credits${done.streakDays ? ` · Day ${done.streakDays} streak` : ''}`;
  return `+${credit} Lab Credits${streak.opensToday ? ` · Day ${streak.nextDays} streak` : ''}`;
}

const FOCUS_LABEL: Record<Exclude<Focus, 'starter'>, string> = {
  jump: 'Jump', form: 'Squat form', shot: 'Shooting', mobility: 'Mobility',
};

/** The number, short ("26 in", "40%"): the reading's own display, cut to its value. */
export function shortValue(skill: SkillReading): string {
  const m = /^(?:power |mobility )?(\d+(?:\.\d+)?(?: in| of 100|%)?)/.exec(skill.display);
  return m ? m[1].replace(' of 100', '/100') : skill.display;
}

/** Why today, one short line from the person's real number: "Shooting is your lowest score (40%). Today: soft landings." */
export function whyToday(focus: Focus, skill: SkillReading | null, _tied: boolean, drillId: string): string {
  const g = guideFor(drillId);
  if (!skill || focus === 'starter') return `No scores yet. Today: ${g.works}.`;
  return `${FOCUS_LABEL[focus]} is your lowest score (${shortValue(skill)}). Today: ${g.works}.`;
}

/** The page's why: the number alone — its title already says what today works on ("Shooting is your lowest score (40%)."). */
export function whyNumber(focus: Focus, skill: SkillReading | null): string {
  if (!skill || focus === 'starter') return 'No scores yet.';
  return `${FOCUS_LABEL[focus]} is your lowest score (${shortValue(skill)}).`;
}

/** Up to 3 numbered steps of ≤ 6 words, from the chart the day runs: the warm-up, the work, the rest. */
export function stepsFor(drillId: string, refs: readonly PhaseRef[]): string[] {
  const g = guideFor(drillId);
  const phases = refs.map((r) => ({ ref: r, p: phaseOf(r) })).filter((x): x is { ref: PhaseRef; p: DrillPhase } => !!x.p);
  const prep = phases.filter((x) => x.ref.drill === 'wake-up' && drillId !== 'wake-up');
  const main = phases.filter((x) => !(x.ref.drill === 'wake-up' && drillId !== 'wake-up'));
  const mins = (xs: { p: DrillPhase }[]) => Math.round(xs.reduce((s, x) => s + x.p.durationSec, 0) / 60);
  const out: string[] = [];
  if (prep.length) out.push(`Warm up, ${mins(prep)} min.`);
  const work = main.filter((x) => x.p.presence === 'required');
  const rests = main.filter((x) => x.p.presence === 'free');
  if (drillId === 'wake-up') {
    out.push(`${work.length} moves, ${mins(work)} min.`);
    out.push('Follow the screen.');
  } else if (work.length > 1) {
    const reps = work.map((x) => phaseReps(x.p));
    const same = reps.every((n) => n === reps[0]);
    out.push(`${work.length} sets of ${same ? reps[0] : Math.max(...reps)} ${g.unit}.`);
    const restSec = rests[0]?.p.durationSec ?? 0;
    if (restSec) out.push(`Rest ${restSec >= 60 ? `${Math.round(restSec / 60)} min` : `${restSec} s`} between.`);
  } else if (work.length === 1) {
    out.push(`${phaseReps(work[0].p)} ${g.workStep ?? g.unit}.`);
  }
  return out.slice(0, 3);
}

// ── during the run ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface RunStep {
  /** 1-based, of `count`. */
  index: number;
  count: number;
  name: string;
  /** The one cue on screen (a timed line of the book's when the phase changes moves inside it, else the plain cue). */
  cue: string;
  rest: boolean;
  /** Reps in this phase so far by the chart's clock, and in all; null for a phase with none (a guided or rest phase). */
  rep: { at: number; of: number } | null;
  /** The next phase's plain name, or null on the last. */
  next: string | null;
}

/**
 * The running screen's words for one moment of the drill: which step, the one cue, the rep the chart is on, what's
 * next. `line` is the runner's screen line (its timed line or the phase's cue); a phase with timed lines keeps them,
 * because they name the side or joint that changes inside it ("Right ankle.").
 */
export function runStep(drillId: string, phases: readonly DrillPhase[], phaseIndex: number, phaseSec: number, line: string | null): RunStep | null {
  const p = phases[phaseIndex];
  if (!p) return null;
  const w = phaseWords(drillId, p);
  const reps = phaseReps(p);
  const at = p.targets.filter((t) => t.move !== 'land' && t.t <= phaseSec + 0.05).length;
  const nextP = phases[phaseIndex + 1];
  return {
    index: phaseIndex + 1,
    count: phases.length,
    name: w.name,
    cue: p.lines?.length && line ? line : w.cue,
    rest: p.presence === 'free',
    rep: reps > 1 ? { at: Math.min(at, reps), of: reps } : null,
    next: nextP ? phaseWords(drillId, nextP).name : null,
  };
}

export const PAUSE_LABEL = 'Pause';
export const STOP_LABEL = 'Stop';
export const HURT_LABEL = 'This hurts';
export const REST_TITLE = 'Rest';
export const NEXT_PREFIX = 'Next:';
export const LAST_STEP_LINE = 'Last step';
/** The pain stop's own words. What to do next is the pain check-in's (lib/health/painRule.ts), shown verbatim. */
export const HURT_TITLE = 'Stopped. Rest now.';
export const HURT_LINE = 'Where does it hurt? Your answer sets what comes next.';
export const HURT_SKIP_LINE = 'Or skip this and rest.';

// ── after ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ResultRead {
  title: string;
  saw: string;
  means: string;
  next: string;
}

const MEANS: Record<GuideDrillId, [string, string, string]> = {
  'pogo-bilateral': [
    'Quick, steady bounce. That spring carries into your jump.',
    'Mostly on the beat. Keep the hops light.',
    'Quick hops take practice. They get easier each day.',
  ],
  'countermovement-geometry': [
    'Steady at the bottom. That is a strong dip.',
    'Mostly steady. Go slower on the way down.',
    'Holding the bottom takes practice. Slow down a little.',
  ],
  'safe-landing': [
    'Steady landings. That is the base of every jump.',
    'Most landings held. Keep freezing for 3.',
    'Landings take practice. Each day makes them quieter.',
  ],
  'wake-up': [
    'Every joint moved. You are ready to play.',
    'Every joint moved. You are ready to play.',
    'Every joint moved. You are ready to play.',
  ],
};
export const STOPPED_MEANS = 'Only a finished drill counts. Try again later today.';

/** The drill's own phases (not the warm-up's) that the run finished. */
function mainPhases(drillId: string, r: DrillResult, refs: readonly PhaseRef[]): DrillPhaseResult[] {
  const mainIds = new Set(refs.filter((x) => drillId === 'wake-up' || x.drill !== 'wake-up').map((x) => x.phase));
  return r.phases.filter((p) => mainIds.has(p.id) && p.finished);
}

/** What we saw / what it means / what's next (≤ 12 words each), from the run's result. Camera numbers are estimates. */
export function readResult(drillId: string, r: DrillResult, refs: readonly PhaseRef[], tomorrow: string): ResultRead {
  const done = r.status === 'complete';
  const main = mainPhases(drillId, r, refs);
  const targets = main.reduce((s, p) => s + p.targets, 0);
  const hits = main.reduce((s, p) => s + p.counts.PERFECT + p.counts.GREAT + p.counts.GOOD, 0);
  const held = main.reduce((s, p) => s + p.holds.held, 0);
  const holds = held + main.reduce((s, p) => s + p.holds.broken, 0);
  const finishedSteps = r.phases.filter((p) => p.finished).length;
  const id = isGuideDrill(drillId) ? drillId : 'wake-up';

  let saw: string;
  if (!done) saw = `You finished ${finishedSteps} of ${refs.length} steps.`;
  else if (targets === 0 || id === 'wake-up') saw = 'You finished every step.';
  else saw = `Camera saw ${hits} of ${targets} on time${holds > 0 ? `, ${held} of ${holds} held still` : ''}.`;
  const share = targets ? hits / targets : 1;
  return {
    title: done ? 'Done for today' : 'Stopped early',
    saw,
    means: done ? MEANS[id][share >= 0.8 ? 0 : share >= 0.5 ? 1 : 2] : STOPPED_MEANS,
    next: tomorrow,
  };
}

/** What tomorrow's drill will likely work on (the same pick, run with tomorrow's date: nothing new is read or kept). */
export function tomorrowLine(today: Focus, tomorrow: Focus, tomorrowDrillId: string | null, skill: SkillReading | null): string {
  if (today === 'starter' || !skill) return 'Tomorrow: the wake-up again, until we have a score.';
  const works = tomorrowDrillId ? guideFor(tomorrowDrillId).works : 'your next lowest score';
  return tomorrow === today ? `Tomorrow: likely ${works} again.` : `Tomorrow: likely ${works}.`;
}

/** Every fixed line this file can show (the reading-level and word tests read this list). */
export function allFixedLines(): string[] {
  const out = [FIRST_TIME_LINE, HURT_TITLE, HURT_LINE, HURT_SKIP_LINE, REST_WORDS.cue, STOPPED_MEANS, ...needChips(true, 7).map((x) => x.text)];
  for (const g of Object.values(GUIDES)) {
    out.push(g.improves, ...g.cues);
    for (const w of Object.values(g.phases)) out.push(w.cue);
  }
  for (const m of Object.values(MEANS)) out.push(...m);
  return out;
}
