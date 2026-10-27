// TODAY-DRILL (owner playtest 2026-10-27: "the today's drill section needs big improvement. Needs clearer instructions
// and better purpose"): the plain-language guide around today's drill — why today, what it improves, the numbered
// steps, the 2–3 key cues, what you need, the one-cue-at-a-time words during the run, and the result read back as
// what we saw / what it means / what's next.
//
// Pure and client-safe. It never edits a chart: the drills (lib/drills/drills.ts) keep the book's words, and this file
// says the same moves in plain words beside them. Every count in a step (sets, reps, rest) is READ FROM THE CHART the
// day runs (lib/daily-drill/compose.ts phaseOf), so a step can never promise a rep the drill does not ask for.
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
  /** The plain name ("Soft landings"); the book's name stays beside it, small. */
  title: string;
  /** What today's drill works on, said inside the why-line ("soft, balanced landings"). */
  works: string;
  /** What it improves, in one line. */
  improves: string;
  /** The 2–3 key cues, in plain words. */
  cues: string[];
  /** What one rep is called, plural ("hops"). */
  unit: string;
  /** Jumps or lands: nothing overhead, shoes with grip. */
  jumps: boolean;
  /** The shared library stage's loop for this movement (components/library/exercise-stage.tsx; lib/library/demo.ts
   *  names the same loops). null: no loop shows it faithfully, so the page shows the cue card instead. */
  demoClip: string | null;
  /** Plain words for each phase of the drill (and of the warm-up), by phase id. */
  phases: Record<string, PhaseWords>;
}

/** The quick Wake-Up's phases, as a short drill's warm-up runs them (plan.ts PREP_PHASES). */
const WARMUP_WORDS: Record<string, PhaseWords> = {
  'release-the-locks': { name: 'Loosen up', cue: 'Hands on a wall. Tense, relax, then sink a little lower.' },
  pressurize: { name: 'Breathe', cue: 'Hands on your ribs. Breathe in for 4, hold for 2, out for 6.' },
  'wake-the-tripod': { name: 'Wake up your feet', cue: 'Press down heel, big toe and little toe. Lift your arch and hold.' },
  'open-the-joints': { name: 'Joint circles', cue: 'Slow circles, as big as feels easy.' },
  'build-the-rhythm': { name: 'Bounce', cue: 'Quick, quiet bounces on the balls of your feet.' },
  'prime-the-launch': { name: 'Jump and freeze', cue: 'Dip, jump, land soft, and freeze.' },
};

const REST_WORDS: PhaseWords = { name: 'Rest', cue: 'Walk it off. Come back into the picture before the timer ends.' };

export const GUIDES: Record<GuideDrillId, DrillGuide> = {
  'pogo-bilateral': {
    title: 'Springy hops',
    works: 'quick, springy hops',
    improves: 'Builds springy ankles for a quicker first step and a higher jump.',
    cues: ['Stay on the balls of your feet.', 'Keep your knees almost straight.', 'Quick and quiet, like the floor is hot.'],
    unit: 'hops',
    jumps: true,
    demoClip: 'ex_pogo',
    phases: {
      ...WARMUP_WORDS,
      'set-1': { name: 'Hops: set 1', cue: 'Quick, quiet hops. Light feet.' },
      'set-2': { name: 'Hops: set 2', cue: 'Same bounce. Stay quiet.' },
      'set-3': { name: 'Hops: last set', cue: 'Last set. Quick and light.' },
      'rest-1': REST_WORDS,
      'rest-2': REST_WORDS,
    },
  },
  'countermovement-geometry': {
    title: 'Slow squat check',
    works: 'slow, steady squats',
    improves: 'Teaches the dip before a good jump: hips back, knees over toes, heels down.',
    cues: ['Sit your hips back, like reaching for a chair.', 'Knees point the same way as your toes.', 'Heels stay down the whole time.'],
    unit: 'squats',
    jumps: false,
    demoClip: 'ex_squat',
    phases: {
      ...WARMUP_WORDS,
      geometry: { name: 'Slow squats', cue: 'Sink slowly. Hold for 3. Rise slowly. No jump.' },
    },
  },
  'safe-landing': {
    title: 'Soft landings',
    works: 'soft, balanced landings',
    improves: 'Trains quiet, balanced landings, so every jump ends steady.',
    cues: ['Land on both feet at the same time.', 'Bend your knees and hips to soak it up.', 'Freeze and count to 3.'],
    unit: 'landings',
    jumps: true,
    demoClip: 'ex_jump',
    phases: {
      ...WARMUP_WORDS,
      landings: { name: 'Soft landings', cue: 'Small hop. Land on both feet, soft, and freeze for 3.' },
    },
  },
  'wake-up': {
    title: 'Full-body wake-up',
    works: 'waking up your whole body',
    improves: 'Gets your joints moving and your body ready to play.',
    cues: ['Move slowly and smoothly.', 'Breathe out as you move.', 'Go only as far as feels easy.'],
    unit: 'moves',
    jumps: false,
    // no one loop shows six different phases faithfully: the page shows the cues instead of a wrong movement
    demoClip: null,
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

export const FIRST_TIME_TITLE = 'New to the daily drill?';
/** The first-timer's two lines: what the daily drill is. */
export const FIRST_TIME_LINES: readonly [string, string] = [
  'Each day we pick one short drill from your lowest number.',
  'Do it on camera to keep your streak and earn Lab Credits. A new one comes tomorrow.',
];
export const STEPS_TITLE = 'What you will do';
export const CUES_TITLE = 'Remember';
export const NEEDS_TITLE = 'Before you start';
export const DEMO_TITLE = 'Watch it first';
export const HOW_TITLE = 'Steps, cues and setup';
export const START_LABEL = 'Start';
export const START_AGAIN_LABEL = 'Do it again';
export const DEMO_STILL_LINE = 'The 3D demo is off on this device. Follow the steps and cues.';
export const DEMO_NONE_LINE = 'This one changes every minute, so follow the screen. It shows each move as you go.';

/** What you need: space, shoes, the phone. Distances match body play's own setup hint (SETUP_HINT, 3.5 to 4.5 m). */
export function needsLines(jumps: boolean): { id: string; text: string }[] {
  return [
    { id: 'phone', text: 'Phone on its side, about chest high. Lean it on something steady.' },
    { id: 'distance', text: 'Step back 3.5 to 4.5 m, so your whole body fits, head to feet.' },
    { id: 'space', text: jumps ? 'About 2 m of clear floor, and nothing overhead to hit.' : 'About 2 m of clear floor.' },
    { id: 'shoes', text: jumps ? 'Shoes with grip.' : 'Shoes with grip, or bare feet on a floor that does not slip.' },
    { id: 'check', text: 'The camera checks your framing before the clock starts.' },
  ];
}

const FOCUS_LABEL: Record<Exclude<Focus, 'starter'>, string> = {
  jump: 'jump', form: 'squat form', shot: 'shooting', mobility: 'mobility',
};

/** Why today, tied to the person's real number: "Your shooting is your lowest number right now (…), so …". */
export function whyToday(focus: Focus, skill: SkillReading | null, tied: boolean, drillId: string): string {
  const g = guideFor(drillId);
  if (!skill || focus === 'starter') return `We don't have your numbers yet, so today's drill is ${g.works}.`;
  const label = FOCUS_LABEL[focus];
  const base = `Your ${label} is your lowest number right now (${skill.display}), so today's drill works on ${g.works}.`;
  const link = focus === 'shot' && drillId === 'safe-landing' ? ' Steady landings are the base of a good jump shot.' : '';
  const slipped = skill.trend === 'worse' ? ' It dipped a little since last week.' : '';
  const tie = tied ? ' It tied with another number, so the pick stays fixed for today.' : '';
  return `${base}${link}${slipped}${tie}`;
}

/** The numbered steps, from the chart the day runs: the warm-up, the work, the rests, the finish. */
export function stepsFor(drillId: string, refs: readonly PhaseRef[]): string[] {
  const g = guideFor(drillId);
  const phases = refs.map((r) => ({ ref: r, p: phaseOf(r) })).filter((x): x is { ref: PhaseRef; p: DrillPhase } => !!x.p);
  const prep = phases.filter((x) => x.ref.drill === 'wake-up' && drillId !== 'wake-up');
  const main = phases.filter((x) => !(x.ref.drill === 'wake-up' && drillId !== 'wake-up'));
  const out: string[] = [];
  if (prep.length) {
    const min = Math.round(prep.reduce((s, x) => s + x.p.durationSec, 0) / 60);
    out.push(`Warm up for ${min} minutes: ${prep.map((x) => phaseWords(drillId, x.p).name.toLowerCase()).join(', ')}. The screen leads you.`);
  }
  const work = main.filter((x) => x.p.presence === 'required');
  const rests = main.filter((x) => x.p.presence === 'free');
  if (drillId === 'wake-up') {
    for (const x of work) out.push(`${phaseWords(drillId, x.p).name} (${Math.round(x.p.durationSec / 60)} min): ${phaseWords(drillId, x.p).cue}`);
  } else if (work.length > 1) {
    const reps = work.map((x) => phaseReps(x.p));
    const same = reps.every((n) => n === reps[0]);
    const restSec = rests[0]?.p.durationSec ?? 0;
    out.push(`${work.length} sets of ${same ? reps[0] : `${Math.min(...reps)} to ${Math.max(...reps)}`} ${g.unit}.`);
    if (restSec) out.push(`Rest ${restSec >= 60 ? `${Math.round(restSec / 60)} minute${restSec >= 120 ? 's' : ''}` : `${restSec} seconds`} between sets. The screen counts it down.`);
  } else if (work.length === 1) {
    out.push(`${phaseReps(work[0].p)} ${g.unit}: ${phaseWords(drillId, work[0].p).cue}`);
  }
  out.push('See how you did, and what comes next.');
  return out;
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
export const HURT_LABEL = 'This hurts: stop';
export const REST_TITLE = 'Rest';
export const NEXT_PREFIX = 'Next:';
export const LAST_STEP_LINE = 'Last step';
/** The pain stop's own words. What to do next is the pain check-in's (lib/health/painRule.ts), shown verbatim. */
export const HURT_TITLE = 'Drill stopped. Rest now.';
export const HURT_LINE = 'Tell us where it hurts. Your answer sets what happens next, here and in tomorrow’s drill.';
export const HURT_SKIP_LINE = 'You can skip this. Today’s drill stays stopped either way.';

// ── after ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ResultRead {
  title: string;
  saw: string;
  means: string;
  next: string;
}

const MEANS: Record<GuideDrillId, [string, string, string]> = {
  'pogo-bilateral': [
    'Your bounce is quick and steady. That spring carries into your first step and your jump.',
    'Most hops kept the beat. The ones that slipped are where your spring grows.',
    'Quick hops take practice. A few days of this and the beat gets easier.',
  ],
  'countermovement-geometry': [
    'Your squat stays steady at the bottom. That is the dip a strong jump starts from.',
    'Most squats held steady. Slow down a little more on the way down.',
    'Holding the bottom is hard at first. Going slower makes it easier.',
  ],
  'safe-landing': [
    'Your landings are steady. That is the base every jump and jump shot stands on.',
    'Most landings held. The shaky ones are where today’s work pays off.',
    'Steady landings take practice. Doing this each day is how they get quiet.',
  ],
  'wake-up': [
    'You moved every joint through its range. Your body is ready to play.',
    'You moved every joint through its range. Your body is ready to play.',
    'You moved every joint through its range. Your body is ready to play.',
  ],
};

/** The drill's own phases (not the warm-up's) that the run finished. */
function mainPhases(drillId: string, r: DrillResult, refs: readonly PhaseRef[]): DrillPhaseResult[] {
  const mainIds = new Set(refs.filter((x) => drillId === 'wake-up' || x.drill !== 'wake-up').map((x) => x.phase));
  return r.phases.filter((p) => mainIds.has(p.id) && p.finished);
}

/** What we saw / what it means / what's next, from the run's result. Camera numbers are estimates, and say so. */
export function readResult(drillId: string, r: DrillResult, refs: readonly PhaseRef[], tomorrow: string): ResultRead {
  const g = guideFor(drillId);
  const done = r.status === 'complete';
  const main = mainPhases(drillId, r, refs);
  const targets = main.reduce((s, p) => s + p.targets, 0);
  const hits = main.reduce((s, p) => s + p.counts.PERFECT + p.counts.GREAT + p.counts.GOOD, 0);
  const held = main.reduce((s, p) => s + p.holds.held, 0);
  const holds = held + main.reduce((s, p) => s + p.holds.broken, 0);
  const finishedSteps = r.phases.filter((p) => p.finished).length;
  const id = isGuideDrill(drillId) ? drillId : 'wake-up';

  let saw: string;
  if (!done) saw = `You finished ${finishedSteps} of ${refs.length} steps before you stopped.`;
  else if (targets === 0 || id === 'wake-up') saw = 'You finished every step.';
  else {
    // a landing counts with its jump in the steps; here the camera's count of every move it timed is said as such
    const repWord = id === 'safe-landing' ? 'hops and landings' : g.unit;
    saw = `The camera saw ${hits} of ${targets} ${repWord} on time${holds > 0 ? `, and ${held} of ${holds} holds kept still` : ''}.`;
  }
  const share = targets ? hits / targets : 1;
  const means = !done
    ? 'Stopping early is fine. Only a finished drill counts for today, so you can try again later.'
    : MEANS[id][share >= 0.8 ? 0 : share >= 0.5 ? 1 : 2];
  return {
    title: done ? 'Done for today' : 'Stopped early',
    saw,
    means,
    next: tomorrow,
  };
}

/** What tomorrow's drill will likely work on (the same pick, run with tomorrow's date: nothing new is read or kept). */
export function tomorrowLine(today: Focus, tomorrow: Focus, tomorrowDrillId: string | null, skill: SkillReading | null): string {
  if (today === 'starter' || !skill) return 'Tomorrow: the full-body wake-up again, until we have one of your numbers.';
  const works = tomorrowDrillId ? guideFor(tomorrowDrillId).works : 'your next lowest number';
  if (tomorrow === today) return `Tomorrow will likely work on ${works} again, while ${FOCUS_LABEL[today]} is your lowest number. A new score can change that.`;
  return `Tomorrow will likely work on ${works}.`;
}

/** Every fixed line this file can show (the reading-level and word tests read this list). */
export function allFixedLines(): string[] {
  const out = [
    FIRST_TIME_TITLE, ...FIRST_TIME_LINES, STEPS_TITLE, CUES_TITLE, NEEDS_TITLE, DEMO_TITLE, HOW_TITLE, DEMO_STILL_LINE, DEMO_NONE_LINE,
    HURT_TITLE, HURT_LINE, HURT_SKIP_LINE, REST_WORDS.cue,
    ...needsLines(true).map((x) => x.text), ...needsLines(false).map((x) => x.text),
  ];
  for (const g of Object.values(GUIDES)) {
    out.push(g.improves, ...g.cues);
    for (const w of Object.values(g.phases)) out.push(w.cue);
  }
  for (const m of Object.values(MEANS)) out.push(...m);
  return out;
}
