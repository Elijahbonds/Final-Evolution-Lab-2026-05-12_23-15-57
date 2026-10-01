// lib/coach/warmup.ts — MIRROR-COACH P6 (2026-09-29): the warm-up generator.
//
// WHAT WAS MISSING. The crossref (crossref-wf_dfad67b3-209.json, matrix row "Six-phase warm-up") found the owner's
// Pre-Game Wake-Up (lib/drills/drills.ts:88 WAKE_UP — release, pressurize, tripod, joints, rhythm, launch, from the
// Neuro-Mechanic Playbook ch5) written as a camera drill that no page mounts, and no session with a warm-up at all: a
// coach who wrote no Prep items left the client's Today starting cold at the first working set. Measured again today:
// grep for DrillRunner / drillById / 'lib/drills' across app/ and components/ finds nothing (only lib/babylon,
// lib/move and lib/pose import the drill modules), and no branch (lane/movement-play, lane/finish-release, main) has a
// /play/drills route. So "launch the Wake-Up from Today" cannot hand off to a mounted camera runner, because none exists
// — see WAKE_UP_CAMERA_HREF and wakeUpDrillFor below for what the hand-off is instead.
//
// WHAT THIS IS. generateWarmup() — one pure function, today's session in, an ordered warm-up out:
//   1. the Wake-Up's phases, read from WAKE_UP itself and NEVER reordered (the Playbook: "Run the phases in order. Do
//      not shuffle them."): all six at 10, 14 (the default) and 18 minutes, FEL's quick three at 6 (WAKE_UP_BY_MINUTES);
//   2. up to three rock-and-hold steps (lib/coach/warmupContent.ts) for today's main pattern × the athlete's weakest
//      Movement Screen area, in whatever time the Wake-Up leaves;
//   3. a primer matched to the main pattern, gated (rule (b) below).
// Owner decisions #7 and #14: the Wake-Up is the spine (the owner wrote it before reading the book); FEL adds the
// stretch step and the primer. The book is not in here: no method names, no phase names, no doses, no sentences.
//
// THE GATES (P6 rule (b); owner decisions #6, #20, #5):
//   · IMPACT — anything that leaves the floor and lands. For the Wake-Up that is read off the drill's own targets (a
//     'jump' or 'land' target: Build the Rhythm's pogos, Prime the Launch's dip-jump-stomp), so if movement play edits
//     WAKE_UP the gate follows the data rather than a list here. OFF for an athlete under 18 or with no birth year on
//     file (isYouth — the caller reads it from lib/mirror/youth.ts isMinorForMirror, the one age truth) UNLESS a coach
//     put jump work (a Jump & Land or plyometric catalogue row) in today's Prime section (coachAssignedImpact) — and
//     even then FEL's own primer stays the calm one; and OFF on a day the athlete's pain check-in decision is a
//     step-down or a stop (lib/health/painRule.ts isStopOutcome). The careful fallback (no context read) is youth rules.
//     assumption: the Wake-Up's own two jumping phases count as "primers with jumps/landings" under rule (b). The
//     Playbook calls pogos "the core nervous system priming tool" and names phase 6 "Prime the Launch", with the stomp
//     done "with maximum intent" — which decision #6 also bars for youth ("no max-effort bracing cues"). So a gated
//     athlete's Wake-Up keeps its other four phases in their order and says why the two are out. If the owner wants the
//     pogos kept for youth (the Playbook was written for young athletes), it is one line: WAKE_UP_IMPACT_GATED.
//     OWNER-DECISION CONFLICT, resolved for now on the careful side (P6 review, 2026-09-29): #6 ("no plyometric primers
//     unless a coach assigns them") and rule (b) are the more specific rules and #15 says stop sooner, so the gate stays
//     ON; #7/#14 (the Wake-Up is the spine, written for young athletes) is the case for turning it off. It is the
//     owner's call and is flagged as one in the P6 report; the switch is the one line above. The time the two phases
//     free now goes to extra stretch rounds, so a youth plan still runs close to its length.
//   · PAIN — a step-down or stop decision also drops the primer entirely (not just its impact version), and says so.
//   · THE JUMP GATE — MIRROR-COACH P8 FIX (2026-09-30, code review; P8 rule (b), owner decisions #6, #10, #15). P8's
//     protocol gate (lib/coach/protocolGate.ts) holds a coach's plyometrics and depth drops unless the athlete is an
//     adult with a completed intake (no red flag, no "yes" on a recent injury/surgery or pregnancy answer), health-data
//     consent, today's pain decision 'continue' and a landing check from the last 4 weeks. This generator never read
//     it: an adult whose gate was shut — no landing check yet, which is nearly everyone at launch, or an intake "yes" on
//     pregnancy — read "Jumps and drops stay out for now" on their Prime card while this same screen ran two minutes of
//     pogos, three launch-jump rounds and FEL's own Squat Jump Primer (and a Prime the gate held left coachPrime false,
//     so FEL ADDED its impact primer in the jump's place). Now the server hands the gate's verdict in (WarmupContext
//     .jumpGate: closed, and the gate's own one line — lib/coach/warmupServer.ts), and when it is closed:
//       - FEL's own impact primer is never picked (pickPrimer(pattern, false)) — rule (b) plainly covers a jump FEL
//         chose;
//       - the Wake-Up's two jumping phases are held too, while WARMUP_FOLLOWS_JUMP_GATE is true. OWNER-DECISION CONFLICT,
//         resolved on the careful side for now: decision #7 extends the owner's Wake-Up (rhythm and launch included)
//         and #14 says the owner wrote it first; rule (b) (#6, #10) says plyometrics appear only with the gate open,
//         and #15 says stop sooner. Flagged in the P8 report; the switch is the one line below — false keeps the
//         Wake-Up's pogos and launch for adults while FEL's primer still follows the gate.
//     The youth rule is not re-decided here (isYouth and a coach's Prime jumps do that, as before): the verdict carries
//     only the gate's OTHER reasons, which a coach's assignment never lifts (protocolGate.ts itemReasons).
//   · The ramp-up breath is not in this phase (phase 7).
//
// READINESS (owner decision #12). A 'low' check-in never touches a score: it shortens Prime the Launch to its first
// round and the primer to one set, gives the stretches extra rounds where the length allows (the readiness read's own
// "longer, gentler ramp", lib/health/readiness.ts READINESS_EXTRA_WARMUP_MINUTES), and says why in plain words. It never
// removes the Wake-Up's calm phases. The levels are the readiness read's ('ok' | 'low' | 'skip').
//
// HONESTY (lib/share/screen.ts; the P6 contract). The screen area is named as a camera estimate, never a finding about
// the body; an ungraded or clear screen, or an untagged key set, gives the general stretch and primer and SAYS so. A
// warm-up builds capacity for the work; the copy never says it lowers the chance of anything. warmup.test.ts lints
// every line a plan can show.
//
// MIRROR-COACH P6 FIXES (2026-09-29, code review + the owner-decision conflicts it raised). Read these before the knobs:
//   · THE DEFAULT RUNS THE WHOLE WAKE-UP (decisions #7 + #14). The default was 10 minutes, and 10 kept five of the six
//     phases: every default warm-up dropped the owner's Release the Locks, and the full Wake-Up appeared only at 14. That
//     REPLACED part of the owner's protocol with FEL's stretch instead of EXTENDING it. Now the default is 14 (all six +
//     FEL's two stretches + the primer), a low day is 18 (all six + a third stretch and extra rounds), and 10 is the
//     Wake-Up exactly as written (its own ten minutes: FEL's stretch and primer step aside, said so). The fit loop's
//     order says the same thing in code: FEL's additions leave before any Wake-Up phase does. 6 minutes stays FEL's
//     quick version (breath, feet, joints, a stretch and a primer) — the one length that cannot hold the Wake-Up, which
//     the athlete has to pick and which names every phase it leaves out. Numbers flagged for the owner in the P6 report.
//   · "COACH ASSIGNED JUMPS" IS THE CATALOGUE'S JUMP TAGGING, not the pattern (decision #6). It was any 'locomotion'
//     item in Prime, so FEL's own off-day Easy Walk (tagged locomotion) unlocked the pogos and the dip-jump-stomp for a
//     14-year-old and told them their coach put jumping there. Now it is a Prime item whose catalogue row is Jump & Land
//     or plyometric (lib/coach/today.ts TodayCoaching.jumpLand).
//   · FEL NEVER PICKS AN IMPACT PRIMER FOR AN UNDER-18 (rule (b)). A coach's jump work in Prime keeps the Wake-Up's own
//     jumping phases; FEL's primer for a youth athlete is always the calm one (pickPrimer(pattern, !isYouth)).
//   · THE CAREFUL FALLBACK SAYS WHY. When the context cannot be read, youth rules still apply (no jumps), but an adult
//     used to read "under 18, or with no birth year on your account" — false about their account. It now says the
//     details did not load (NOTE_COPY.context_unavailable).
//   · SPARE TIME GOES TO THE STRETCHES on every day, not only a low one: a youth or pain-day plan (jumps out) used to
//     run minutes short of the length its chip showed (a youth "10 min" ran 6).
//
// Pure: no DOM, no fetch, no clock. Runs on the client (Today) and in tests.
import type { MovementPattern } from '@/public/_prisma/client';
import { WAKE_UP } from '@/lib/drills/drills';
import type { CoachPrompt, Drill, DrillPhase } from '@/lib/drills/chart';
import {
  pacerAt, pacerClockSec, pausePacerClock, resumePacerClock, startPacerClock, type PacerClock,
} from '@/lib/breath/pacer';
import { isHardStop, isStopOutcome, type PainDecision } from '@/lib/health/painRule';
import { PATTERN_INFO, isPattern } from './catalogue';
import {
  CHECK_ZONE, GENERAL_PRIMER_ID, GENERAL_ROCK_HOLDS, HOLD_SEC, PRIMERS, ROCK_HOLDS, ROCK_HOLD_ROUNDS, ROCK_SEC, WARMUP_ZONES, ZONE_WORDS,
  isWarmupZone, type Primer, type PrimerDose, type RockHoldStep, type WarmupZone,
} from './warmupContent';

// ── the knobs (FEL's choices, each named so a review reads them in one place) ────────────────────────────────────────

export type WarmupMinutes = 6 | 10 | 14 | 18;
export const WARMUP_MINUTES: readonly WarmupMinutes[] = [6, 10, 14, 18];
/** The usual warm-up: the whole Wake-Up, extended (see the P6 fixes above). Was 10, which dropped Release the Locks. */
export const DEFAULT_WARMUP_MINUTES: WarmupMinutes = 14;
/** A low readiness day's length: the default plus the readiness read's extra minutes (lib/health/readiness.ts
 *  READINESS_EXTRA_WARMUP_MINUTES.low — warmup.test.ts holds the two together; this file does not import that one). */
export const LOW_DAY_WARMUP_MINUTES: WarmupMinutes = 18;

const ALL_SIX = ['release-the-locks', 'pressurize', 'wake-the-tripod', 'open-the-joints', 'build-the-rhythm', 'prime-the-launch'] as const;
/**
 * Which Wake-Up phases each length keeps, by the drill's own phase ids. The order here is irrelevant: the generator
 * walks WAKE_UP.phases and keeps the listed ones, so the Playbook's order is the only order there is. FEL's choice:
 *   · 18, 14, 10 — all six, the owner's full ten minutes. FEL's stretches and primer go in the minutes left over: none
 *     at 10 (the Wake-Up fills it), two stretches and the primer at 14, three stretches at 18.
 *   · 6 — FEL's quick version, the one length the Wake-Up cannot fit in: breath, feet and joints, then a stretch and
 *     today's primer. The athlete has to pick it, and it names every phase it leaves out.
 */
export const WAKE_UP_BY_MINUTES: Record<WarmupMinutes, readonly string[]> = {
  18: ALL_SIX,
  14: ALL_SIX,
  10: ALL_SIX,
  6: ['pressurize', 'wake-the-tripod', 'open-the-joints'],
};
/** Rock-and-hold steps per length — at most; one that does not fit after the Wake-Up is left out for time. */
export const ROCK_HOLDS_BY_MINUTES: Record<WarmupMinutes, number> = { 18: 3, 14: 2, 10: 1, 6: 1 };

/** The Wake-Up's launch phase: the one a low day shortens. */
export const LAUNCH_PHASE_ID = 'prime-the-launch';
/**
 * A low day's launch (s): the first of the phase's three rounds (wakeUpRound(3) in drills.ts: stance at 3 s, the
 * stomp's two-second hold done by ~13.4 s) and a breath after it. The other two rounds' targets start at 43 s and 83 s.
 */
export const LOW_DAY_LAUNCH_SEC = 20;

/** Rule (b)'s switch for the Wake-Up's own jumping phases (see the header's assumption). */
export const WAKE_UP_IMPACT_GATED = true;

/**
 * MIRROR-COACH P8 FIX (2026-09-30): the Wake-Up's jumping phases follow P8's protocol gate for everyone (see the header's
 * THE JUMP GATE — an owner-decision conflict, resolved on the careful side). false = the Wake-Up keeps its pogos and
 * launch whatever the gate says; FEL's own impact primer follows the gate either way.
 */
export const WARMUP_FOLLOWS_JUMP_GATE = true;

/** P8's protocol gate as the warm-up takes it (the server's verdict: lib/coach/warmupServer.ts). */
export interface JumpGate {
  /** A reason other than the youth rule keeps jumps and drops out today (a coach's assignment cannot lift these). */
  closed: boolean;
  /** The gate's one line for the athlete (protocolGate.ts athleteWhy), '' when open. */
  why: string;
  /** Where the line points (the health answers, the Quick Screen), or null. */
  href: string | null;
}
/** The line when the server gave no verdict (an older answer): the careful reading, said plainly. */
export const JUMP_GATE_DEFAULT_WHY = "Jumps and landings wait for FEL's jump checks.";
/** The warm-up's note when the jump gate holds its jumps back. */
export const jumpGateNote = (why: string): string => `This warm-up leaves out its jumps and landings. ${why || JUMP_GATE_DEFAULT_WHY}`;

/** A drill phase leaves the floor and lands: any jump or landing target. */
export const phaseImpact = (p: Pick<DrillPhase, 'targets'>): boolean => p.targets.some((t) => t.move === 'jump' || t.move === 'land');

// ── inputs ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Today's readiness read, as the warm-up takes it — lib/health/readiness.ts ReadinessLevel's values (warmup.test.ts
 *  holds the two together). Only 'low' changes anything; 'skip' and null (not asked yet) are the usual warm-up. */
export type WarmupReadiness = 'ok' | 'low' | 'skip';

/** What the athlete's Movement Screen says about where to aim, beyond the area itself (for the honest line). */
export type ScreenState = 'none' | 'ungraded' | 'clear' | 'flagged';

export interface WarmupInput {
  /** Today's main pattern: the key set's ProgramExercise.pattern (sessionWarmupInputs). null = untagged. */
  pattern: MovementPattern | null;
  /** The weakest Movement Screen area (weakestZone). null = no graded screen, or nothing flagged. */
  weakestZone: WarmupZone | null;
  minutes: WarmupMinutes;
  /** lib/mirror/youth.ts isMinorForMirror(User.dobYear): under 18, or no birth year on file. */
  isYouth: boolean;
  /** Today's pain decision (painDecisionToday). null = no recent check-in. */
  painDecision: PainDecision | null;
  readiness: WarmupReadiness | null;
  /** A coach put jump work (a Jump & Land or plyometric catalogue row) in today's Prime section: impact is theirs to
   *  assign, and they did. It keeps the Wake-Up's own jumping phases for a youth athlete — never FEL's impact primer. */
  coachAssignedImpact?: boolean;
  /** The coach wrote today's Prime section: it is today's primer, so the generator adds none of its own. */
  coachPrime?: boolean;
  /** Why there is no area (for the honest line); defaults from weakestZone. */
  screen?: ScreenState;
  /** Where `pattern` came from; 'untagged_key_set' says so in the plan. */
  patternFrom?: PatternSource;
  /** The server context could not be read (FALLBACK_WARMUP_CONTEXT): youth rules, and the plan says why honestly. */
  contextUnavailable?: boolean;
  /** MIRROR-COACH P8 FIX: P8's protocol gate for this athlete today (WarmupContext.jumpGate). Absent = open (a test's
   *  input, a harness); the server always sends it, and readWarmupContext reads a missing one as closed. */
  jumpGate?: JumpGate | null;
}

// ── output ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type WarmupStepKind = 'wake_up' | 'rock_hold' | 'primer';

export interface WarmupStep {
  kind: WarmupStepKind;
  id: string;
  name: string;
  seconds: number;
  /** The one cue (the Wake-Up phase's own cue, word for word). */
  cue: string;
  /** The dose in words ("2 × 5", "20 s of rocks, 10 s held, each side"). */
  dose: string | null;
  /** Timed lines inside the step (the Wake-Up phase's own, or the rounds of a stretch / sets of a primer). */
  lines: { t: number; text: string }[];
  impact: boolean;
  /** The low-day launch: one round of three. */
  shortened?: true;
  /** More rounds than the usual two: spare time in the length (a low day's, or the minutes a gate freed). */
  extraRounds?: true;
  /** Why this stretch or primer was picked. */
  aim?: 'zone' | 'pattern' | 'general';
  /** 'playbook ch5' for the Wake-Up, else the content row's source. */
  source: string;
  /** Wake-Up steps: the drill phase as it runs (a DrillRunner can take it — wakeUpDrillFor). */
  phase?: DrillPhase;
  /** Wake-Up steps with a breathing pacer (Pressurize the System). */
  pacer?: DrillPhase['pacer'];
}

export type HeldReason = 'time' | 'youth_impact' | 'pain' | 'coach_prime' | 'unavailable' | 'jump_gate';

export interface WarmupNote { id: NoteId; text: string }
export type NoteId =
  | 'zone' | 'screen_clear' | 'screen_none' | 'untagged' | 'no_key_set' | 'youth_impact' | 'coach_impact' | 'pain'
  | 'pain_hard' | 'low_day' | 'coach_prime' | 'context_unavailable' | 'jump_gate';

export interface WarmupPlan {
  minutes: WarmupMinutes;
  /** What the steps add up to (s); never more than minutes × 60. */
  totalSec: number;
  pattern: MovementPattern | null;
  zone: WarmupZone | null;
  steps: WarmupStep[];
  /** What was left out, and why, so the card can say it. */
  heldBack: { id: string; name: string; why: HeldReason }[];
  notes: WarmupNote[];
  /** Which primer the plan carries: the pattern's, the general one, or none. */
  primer: 'pattern' | 'general' | 'none';
}

// ── copy (FEL's words; warmup.test.ts lints every line) ──────────────────────────────────────────────────────────────

export const WARMUP_TITLE = 'Warm-up';
/** Under the card's title. */
export const WARMUP_MEANING = 'Built for today: the Pre-Game Wake-Up, a rock-and-hold stretch, and a primer for the main work. It builds capacity for the session ahead. Nothing here is scored.';
/** Where the Wake-Up's steps come from. */
export const WAKE_UP_SOURCE_LINE = "The Wake-Up steps are the Neuro-Mechanic Playbook's pre-game protocol (ch. 5), in its order.";

/** What the stretch follows when no screen area picked it. */
const stretchFollows = (pattern: boolean) => (pattern ? "follows today's main pattern" : 'is the general one');
export const screenClearNote = (pattern: boolean): string =>
  `Your last Movement Screen flagged nothing it read, so the stretch ${stretchFollows(pattern)}.`;
export const screenNoneNote = (pattern: boolean): string =>
  `There's no graded Movement Screen on file yet, so the stretch ${stretchFollows(pattern)}. Run the screen in the Mirror and the warm-up will aim at what the camera sees.`;
/** An untagged day, by where the (missing) pattern would have come from. */
export const untaggedNote = (from: PatternSource, other: boolean): string =>
  other ? "Today's key set is tagged Other, so the warm-up isn't matched to a pattern today."
    : from === 'untagged_key_set' ? "Today's key set isn't tagged with a movement pattern, so the warm-up isn't matched to a pattern today."
      : "Today's exercises aren't tagged with a movement pattern, so the warm-up isn't matched to a pattern today.";

export const NOTE_COPY = {
  no_key_set: "No key set is marked today, so the warm-up follows the first main exercise's pattern.",
  youth_impact: 'Jumps and landings are left out: under 18, or with no birth year on your account, they wait until your coach adds them to your session.',
  coach_impact: "Your coach put jumping in today's Prime section, so the Wake-Up keeps its jumps.",
  pain: "A recent pain check-in hasn't settled, so this warm-up leaves out the primer and the jumping. Keep it easy and do what that check-in said.",
  pain_hard: 'A recent pain check-in asked you to stop an exercise, so this warm-up leaves out the primer and the jumping. Do what that check-in said before you train that exercise again.',
  coach_prime: "Your coach wrote today's Prime section, so the warm-up adds no primer of its own.",
  context_unavailable: "We couldn't load your details just now, so this warm-up takes the careful version: no jumps or landings, and a stretch that isn't aimed at your Movement Screen. Reload to try again.",
} as const;

/** "The stretch aims at your feet and ankles, …" — a camera estimate, said as one. */
export const zoneNote = (zone: WarmupZone): string =>
  `The stretch aims at ${ZONE_WORDS[zone]}, the area your last Movement Screen flagged most. That is a camera estimate of where to start, nothing more.`;

/** The low-day line, saying exactly what changed. */
export function lowDayNote(launch: boolean, primer: boolean, stretches = false): string {
  const parts = [
    ...(stretches ? ['the stretches get extra rounds'] : []),
    ...(launch ? ['the launch is one round instead of three'] : []),
    ...(primer ? ['the primer is one set'] : []),
  ];
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return what
    ? `You said today is a low day, so ${what}. An easier session is a good call today.`
    : 'You said today is a low day. An easier session is a good call today.';
}

const HELD_WORDS: Record<HeldReason, string> = {
  time: 'left out to fit the time',
  youth_impact: 'jumps and landings wait for your coach',
  pain: 'left out after your pain check-in',
  coach_prime: "your coach's Prime section covers it",
  unavailable: 'left out until your details load',
  jump_gate: "jumps and landings wait for FEL's jump checks",
};
/** One line per reason for what the plan left out ("Release the Locks: left out to fit the time"). */
export function heldBackLines(plan: Pick<WarmupPlan, 'heldBack'>): string[] {
  const by = new Map<HeldReason, string[]>();
  for (const h of plan.heldBack) (by.get(h.why) ?? by.set(h.why, []).get(h.why)!).push(h.name);
  return [...by].map(([why, names]) => `${names.join(', ')}: ${HELD_WORDS[why]}.`);
}

// ── picking ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The patterns that take the general stretch and primer: nothing specific to prime. */
const GENERAL_PATTERNS: readonly MovementPattern[] = ['other'];

/**
 * The rock-and-hold steps for today: the first that fits the area AND the pattern, else the first that fits the area,
 * else the first that fits the pattern; a second (14 minutes) that fits the pattern and aims somewhere else, so the
 * two cover more than one spot. No area and no pattern: the general pair (hips, upper back). A third (18 minutes) is
 * whatever is left, a new area first.
 */
export function pickRockHolds(pattern: MovementPattern | null, zone: WarmupZone | null, n: number): { step: RockHoldStep; aim: 'zone' | 'pattern' | 'general' }[] {
  const fitsP = (r: RockHoldStep) => !!pattern && !GENERAL_PATTERNS.includes(pattern) && r.patterns.includes(pattern);
  const fitsZ = (r: RockHoldStep) => !!zone && r.zones.includes(zone);
  const general = GENERAL_ROCK_HOLDS.map((id) => ROCK_HOLDS.find((r) => r.id === id)!);
  const out: { step: RockHoldStep; aim: 'zone' | 'pattern' | 'general' }[] = [];
  const add = (r: RockHoldStep | undefined, aim: 'zone' | 'pattern' | 'general') => { if (r && out.length < n && !out.some((o) => o.step.id === r.id)) out.push({ step: r, aim }); };
  const taken = (r: RockHoldStep) => out.some((o) => o.step.id === r.id);
  // a new area: shares no zone with any stretch already picked (read at each pick, so the second spreads from the first)
  const spreads = (r: RockHoldStep) => !out.some((o) => r.zones.some((z) => o.step.zones.includes(z)));
  add(ROCK_HOLDS.find((r) => fitsZ(r) && fitsP(r)) ?? ROCK_HOLDS.find(fitsZ), 'zone');
  add(ROCK_HOLDS.find((r) => fitsP(r) && !taken(r) && spreads(r)), 'pattern');
  add(ROCK_HOLDS.find((r) => fitsP(r) && !taken(r) && spreads(r)), 'pattern');
  add(ROCK_HOLDS.find((r) => fitsP(r) && !taken(r)), 'pattern');
  for (const g of general) add(g, 'general');
  // a third (18 minutes) when the area, the pattern and the general pair are all spent: the next stretch not yet in,
  // spreading to a new area where one is left (MIRROR-COACH P6: a breath day with a knee-window flag found only two)
  add(ROCK_HOLDS.find((r) => !taken(r) && spreads(r)) ?? ROCK_HOLDS.find((r) => !taken(r)), 'general');
  add(ROCK_HOLDS.find((r) => !taken(r)), 'general');
  return out;
}

/**
 * Today's primer: the pattern's impact primer when impact is allowed, else its non-impact one; the general primer for
 * an untagged key set and for breath / mobility / other days. `skippedImpact` names an impact primer the gate held back.
 */
export function pickPrimer(pattern: MovementPattern | null, impactAllowed: boolean): { primer: Primer; aim: 'pattern' | 'general'; skippedImpact: Primer | null } {
  const general = PRIMERS.find((p) => p.id === GENERAL_PRIMER_ID)!;
  const own = pattern ? PRIMERS.filter((p) => p.patterns !== 'general' && p.patterns.includes(pattern)) : [];
  if (!own.length) return { primer: general, aim: 'general', skippedImpact: null };
  const impact = own.find((p) => p.impact) ?? null;
  const calm = own.find((p) => !p.impact) ?? general;
  if (impact && impactAllowed) return { primer: impact, aim: 'pattern', skippedImpact: null };
  return { primer: calm, aim: calm === general ? 'general' : 'pattern', skippedImpact: impact };
}

// ── building the steps ───────────────────────────────────────────────────────────────────────────────────────────────

/** A phase cut to its first `sec` seconds: targets, prompts and lines after it dropped, a closing line at the end. A
 *  derived copy — WAKE_UP itself (lib/drills, movement play's) is never edited. */
export function shortenPhase(p: DrillPhase, sec: number): DrillPhase {
  const prompts = p.prompts.filter((q) => q.t < sec);
  const done: { t: number; id: CoachPrompt } = { t: Math.max(0, sec - 3), id: 'coach.drill.done' };
  return {
    ...p,
    durationSec: sec,
    targets: p.targets.filter((t) => t.t < sec),
    prompts: prompts.some((q) => q.id === 'coach.drill.done') ? prompts : [...prompts, done].sort((a, b) => a.t - b.t),
    ...(p.lines ? { lines: p.lines.filter((l) => l.t < sec) } : {}),
  };
}

function wakeUpStep(phase: DrillPhase, shortened: boolean): WarmupStep {
  return {
    kind: 'wake_up', id: phase.id, name: phase.name, seconds: phase.durationSec, cue: phase.cue,
    dose: shortened ? 'One round of three' : null,
    lines: [...(phase.lines ?? [])],
    impact: phaseImpact(phase),
    ...(shortened ? { shortened: true as const } : {}),
    source: 'playbook ch5', phase,
    ...(phase.pacer ? { pacer: phase.pacer } : {}),
  };
}

/** The rounds of a stretch as timed lines: rock, then hold — sides alternating for a one-sided position. */
export function rockHoldLines(r: Pick<RockHoldStep, 'sides'>, rounds: number = ROCK_HOLD_ROUNDS): { t: number; text: string }[] {
  const round = ROCK_SEC + HOLD_SEC;
  const lead = (k: number) => (r.sides === 'each' ? `${k % 2 === 0 ? 'Left' : 'Right'} side: rock` : k === 0 ? 'Rock' : 'Again: rock');
  return Array.from({ length: rounds }, (_, k) => k).flatMap((k) => [
    { t: k * round, text: `${lead(k)} in small, easy moves.` }, { t: k * round + ROCK_SEC, text: 'Hold still. One long breath out.' },
  ]);
}

/** A low day's stretch may run up to this many rounds (three a side). Ours. */
export const MAX_LOW_DAY_ROUNDS = 3 * ROCK_HOLD_ROUNDS;

const TIMES = ['', 'once', 'twice', 'three times', 'four times', 'five times', 'six times'];
function rockHoldStep(r: RockHoldStep, aim: 'zone' | 'pattern' | 'general', rounds: number = ROCK_HOLD_ROUNDS): WarmupStep {
  const extra = rounds > ROCK_HOLD_ROUNDS;
  const times = r.sides === 'each' ? (rounds === ROCK_HOLD_ROUNDS ? 'each side' : `${TIMES[rounds / 2]} each side`) : TIMES[rounds];
  return {
    kind: 'rock_hold', id: r.id, name: r.name, seconds: rounds * (ROCK_SEC + HOLD_SEC), cue: r.cue,
    dose: `${ROCK_SEC} s of rocks, ${HOLD_SEC} s held, ${times}. ${r.setup}`,
    lines: rockHoldLines(r, rounds), impact: false, aim, source: r.source,
    ...(extra ? { extraRounds: true as const } : {}),
  };
}

const doseWords = (d: PrimerDose): string => (d.sets === 1 ? `1 set of ${d.reps}` : `${d.sets} × ${d.reps}`);

/** The sets of a primer as timed lines, evenly over its seconds. */
export function primerLines(d: PrimerDose): { t: number; text: string }[] {
  const each = d.seconds / d.sets;
  return Array.from({ length: d.sets }, (_, k) => ({ t: Math.round(k * each), text: d.sets === 1 ? `One set: ${d.reps}.` : `Set ${k + 1} of ${d.sets}: ${d.reps}.${k > 0 ? '' : ' Then a breath.'}` }));
}

function primerStep(p: Primer, aim: 'pattern' | 'general', low: boolean): WarmupStep {
  const d = low ? p.lowDay : p.dose;
  return {
    kind: 'primer', id: p.id, name: p.name, seconds: d.seconds, cue: p.cue, dose: doseWords(d),
    lines: primerLines(d), impact: p.impact, aim, source: p.source,
  };
}

// ── the generator ────────────────────────────────────────────────────────────────────────────────────────────────────

const sum = (steps: readonly WarmupStep[]) => steps.reduce((s, x) => s + x.seconds, 0);

export function generateWarmup(input: WarmupInput): WarmupPlan {
  const minutes: WarmupMinutes = WARMUP_MINUTES.includes(input.minutes) ? input.minutes : DEFAULT_WARMUP_MINUTES;
  const budget = minutes * 60;
  const pattern = isPattern(input.pattern) ? input.pattern : null;
  const zone = isWarmupZone(input.weakestZone) ? input.weakestZone : null;
  const pain = input.painDecision ?? null;
  const painStop = pain !== null && isStopOutcome(pain);
  const youthHold = !!input.isYouth && !input.coachAssignedImpact;
  // MIRROR-COACH P8 FIX: P8's protocol gate (the header's THE JUMP GATE)
  const gateClosed = !!input.jumpGate?.closed;
  const impactOff = youthHold || painStop || (WARMUP_FOLLOWS_JUMP_GATE && gateClosed);
  const low = input.readiness === 'low';
  const unavailable = !!input.contextUnavailable;
  const gatedWhy: HeldReason = painStop ? 'pain' : unavailable ? 'unavailable' : youthHold ? 'youth_impact' : 'jump_gate';

  const wake: WarmupStep[] = [];
  const heldBack: WarmupPlan['heldBack'] = [];
  let launchShort = false;
  const keep = WAKE_UP_BY_MINUTES[minutes];
  for (const phase of WAKE_UP.phases) {                 // the drill's own order, never re-sorted
    if (!keep.includes(phase.id)) { heldBack.push({ id: phase.id, name: phase.name, why: 'time' }); continue; }
    if (WAKE_UP_IMPACT_GATED && impactOff && phaseImpact(phase)) {
      heldBack.push({ id: phase.id, name: phase.name, why: gatedWhy });
      continue;
    }
    if (low && phase.id === LAUNCH_PHASE_ID && phase.durationSec > LOW_DAY_LAUNCH_SEC) {
      wake.push(wakeUpStep(shortenPhase(phase, LOW_DAY_LAUNCH_SEC), true));
      launchShort = true;
      continue;
    }
    wake.push(wakeUpStep(phase, false));
  }

  const stretches = pickRockHolds(pattern, zone, ROCK_HOLDS_BY_MINUTES[minutes]).map((x) => rockHoldStep(x.step, x.aim));

  let primer: WarmupStep | null = null;
  let primerKind: WarmupPlan['primer'] = 'none';
  let primerShort = false;
  if (input.coachPrime) {
    heldBack.push({ id: 'primer', name: 'Primer', why: 'coach_prime' });
  } else if (painStop) {
    const p = pickPrimer(pattern, false);
    heldBack.push({ id: p.primer.id, name: p.primer.name, why: 'pain' });
  } else {
    // FEL never chooses an impact primer for an under-18 (rule (b)): a coach's jump work keeps the Wake-Up's own jumping
    // phases, not a jump FEL picked. Only an athlete the youth gate is holding is told the jump waits for their coach.
    // MIRROR-COACH P8 FIX: nor for an adult whose jump gate is shut (rule (b) covers a jump FEL picks, whatever the switch)
    const p = pickPrimer(pattern, !input.isYouth && !gateClosed);
    if (p.skippedImpact && youthHold) heldBack.push({ id: p.skippedImpact.id, name: p.skippedImpact.name, why: unavailable ? 'unavailable' : 'youth_impact' });
    // (a youth athlete's FEL primer is the calm one whatever the gate says, so only an adult's is held for it)
    else if (p.skippedImpact && gateClosed && !input.isYouth) heldBack.push({ id: p.skippedImpact.id, name: p.skippedImpact.name, why: 'jump_gate' });
    primer = primerStep(p.primer, p.aim, low);
    primerKind = p.aim;
    primerShort = low;
  }

  // Fit the length: FEL's additions leave before any Wake-Up phase does (decisions #7 + #14 — the Wake-Up is the spine).
  // The extra stretches go first, then the primer shrinks, then it goes, then the last stretch (at 10 minutes the
  // Wake-Up fills the length, so an adult's 10 is the Wake-Up as written), and only then Wake-Up phases from the END
  // (the launch before the calm phases) — which by construction never happens (warmup.test.ts runs every combination;
  // it would only if WAKE_UP's durations changed under us). Each is named as left out for time.
  let steps = [...wake, ...stretches, ...(primer ? [primer] : [])];
  while (sum(steps) > budget && steps.length) {
    const extra = steps.filter((s) => s.kind === 'rock_hold');
    const pr = steps.find((s) => s.kind === 'primer');
    let drop: WarmupStep | undefined;
    if (extra.length > 1) drop = extra[extra.length - 1];
    else if (pr && !primerShort) {
      const p = PRIMERS.find((x) => x.id === pr.id)!;
      steps = steps.map((s) => (s === pr ? primerStep(p, pr.aim === 'general' ? 'general' : 'pattern', true) : s));
      primerShort = true;
      continue;
    } else drop = pr ?? extra[0] ?? [...steps].reverse().find((s) => s.kind === 'wake_up') ?? steps[steps.length - 1];
    steps = steps.filter((s) => s !== drop);
    if (drop) {
      heldBack.push({ id: drop.id, name: drop.name, why: 'time' });
      if (drop.kind === 'primer') primerKind = 'none';
    }
  }

  // Spare time goes to extra rock-and-hold rounds — a pair at a time (one more a side), the stretches in turn, up to
  // MAX_LOW_DAY_ROUNDS each, while the length has room. It only spends spare time; it never pushes out a step. On a low
  // day that is the readiness read's longer, gentler ramp (the time the shorter launch and primer free, and the longer
  // suggested length). MIRROR-COACH P6 FIX: it used to run on a low day only, so a plan whose jumps were gated out (a
  // youth athlete, a pain step-down) ran minutes short of the length its chip showed — a youth "10 min" ran 6.
  let stretchExtra = false;
  {
    const pair = 2 * (ROCK_SEC + HOLD_SEC);
    for (let grew = true; grew;) {
      grew = false;
      for (const st of steps.filter((x) => x.kind === 'rock_hold')) {
        const rounds = st.seconds / (ROCK_SEC + HOLD_SEC);
        if (rounds + 2 > MAX_LOW_DAY_ROUNDS || sum(steps) + pair > budget) continue;
        const longer = rockHoldStep(ROCK_HOLDS.find((x) => x.id === st.id)!, st.aim === 'zone' || st.aim === 'pattern' ? st.aim : 'general', rounds + 2);
        steps = steps.map((x) => (x === st ? longer : x));
        stretchExtra = grew = true;
      }
    }
  }

  const notes: WarmupNote[] = [];
  const screen: ScreenState = input.screen ?? (zone ? 'flagged' : 'none');
  const matched = !!pattern && pattern !== 'other';
  const hasStretch = steps.some((s) => s.kind === 'rock_hold');
  const hasPrimer = steps.some((s) => s.kind === 'primer');
  // The stretch's lines only where there is a stretch (an adult's 10 minutes is the Wake-Up alone), and never the
  // "no screen on file" line when the truth is that the context did not load (context_unavailable says that instead).
  if (unavailable) notes.push({ id: 'context_unavailable', text: NOTE_COPY.context_unavailable });
  else if (hasStretch && zone) notes.push({ id: 'zone', text: zoneNote(zone) });
  else if (hasStretch) notes.push(screen === 'clear' ? { id: 'screen_clear', text: screenClearNote(matched) } : { id: 'screen_none', text: screenNoneNote(matched) });
  if (hasStretch || hasPrimer) {
    if (!matched) notes.push({ id: 'untagged', text: untaggedNote(input.patternFrom ?? null, pattern === 'other') });
    else if (input.patternFrom === 'key_section') notes.push({ id: 'no_key_set', text: NOTE_COPY.no_key_set });
  }
  if (painStop) notes.push(isHardStop(pain!) ? { id: 'pain_hard', text: NOTE_COPY.pain_hard } : { id: 'pain', text: NOTE_COPY.pain });
  if (youthHold && !unavailable && heldBack.some((h) => h.why === 'youth_impact')) notes.push({ id: 'youth_impact', text: NOTE_COPY.youth_impact });
  if (heldBack.some((h) => h.why === 'jump_gate')) notes.push({ id: 'jump_gate', text: jumpGateNote(input.jumpGate?.why ?? '') });
  if (input.isYouth && input.coachAssignedImpact && !painStop && steps.some((s) => s.kind === 'wake_up' && s.impact)) notes.push({ id: 'coach_impact', text: NOTE_COPY.coach_impact });
  if (input.coachPrime) notes.push({ id: 'coach_prime', text: NOTE_COPY.coach_prime });
  if (low) notes.push({ id: 'low_day', text: lowDayNote(launchShort && steps.some((s) => s.shortened), primerShort && steps.some((s) => s.kind === 'primer'), stretchExtra) });

  return { minutes, totalSec: sum(steps), pattern, zone, steps, heldBack, notes, primer: primerKind };
}

// ── today's inputs, from the session / the screen / the pain check-ins ───────────────────────────────────────────────

export type PatternSource = 'key_set' | 'untagged_key_set' | 'key_section' | null;

/** One of today's exercises, as the warm-up reads it (a TodayExercise fits). */
export interface SessionItemLike {
  order: number;
  section?: string | null;
  isKeySet?: boolean | null;
  /** jumpLand: the catalogue row is jump work (lib/coach/today.ts TodayCoaching.jumpLand). */
  coaching?: { pattern?: { id: MovementPattern } | null; jumpLand?: boolean | null } | null;
}

export interface SessionWarmupInputs {
  pattern: MovementPattern | null;
  patternFrom: PatternSource;
  /** The coach wrote Prep items: theirs always win, and Today offers no generated warm-up. */
  coachPrep: boolean;
  coachPrime: boolean;
  /** Jump work in the coach's own Prime section: a catalogue row tagged Jump & Land or plyometric (jumpLand) — NOT the
   *  pattern. 'locomotion' covers a walk, a sprint and a march as well as hops (FEL's own off-day Easy Walk is tagged
   *  locomotion), and none of those is a coach assigning jumps. */
  coachAssignedImpact: boolean;
}

/**
 * Today's main pattern and what the coach already wrote. The main pattern is the KEY SET's (P2's ProgramExercise.pattern
 * on the session's key set). A key set with no pattern tag is said to be untagged — not quietly swapped for another
 * exercise's pattern. With no key set marked at all, the first tagged exercise in the Key section stands in, and the
 * plan says so.
 */
export function sessionWarmupInputs(items: readonly SessionItemLike[]): SessionWarmupInputs {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const pat = (i: SessionItemLike) => (isPattern(i.coaching?.pattern?.id) ? i.coaching!.pattern!.id : null);
  const keySets = sorted.filter((i) => i.isKeySet);
  let pattern: MovementPattern | null = null;
  let patternFrom: PatternSource = null;
  if (keySets.length) {
    const tagged = keySets.find((i) => pat(i));
    pattern = tagged ? pat(tagged) : null;
    patternFrom = tagged ? 'key_set' : 'untagged_key_set';
  } else {
    const main = sorted.find((i) => (i.section ?? 'key') === 'key' && pat(i));
    pattern = main ? pat(main) : null;
    patternFrom = main ? 'key_section' : null;
  }
  const prime = sorted.filter((i) => i.section === 'prime');
  return {
    pattern, patternFrom,
    coachPrep: sorted.some((i) => i.section === 'prep'),
    coachPrime: prime.length > 0,
    coachAssignedImpact: prime.some((i) => i.coaching?.jumpLand === true),
  };
}

/** A camera outcome of a graded screen, as the warm-up reads it (lib/mirror/screenCorrectives.ts CheckOutcome fits). */
export interface OutcomeLike { checkId: string; status: string; borderline?: boolean }

/**
 * The weakest area on a graded screen: the area with the most flags (a borderline flag from an older row counts half),
 * ties broken from the ground up (WARMUP_ZONES). null when nothing flagged. `checks` names the flagged checks behind it.
 */
export function weakestZone(outcomes: readonly OutcomeLike[]): { zone: WarmupZone; checks: string[] } | null {
  const score = new Map<WarmupZone, number>();
  const checks = new Map<WarmupZone, string[]>();
  for (const o of outcomes) {
    if (o.status !== 'flag') continue;
    const z = CHECK_ZONE[o.checkId];
    if (!z) continue;
    score.set(z, (score.get(z) ?? 0) + (o.borderline ? 1 : 2));
    const c = checks.get(z) ?? checks.set(z, []).get(z)!;
    if (!c.includes(o.checkId)) c.push(o.checkId);
  }
  let best: WarmupZone | null = null;
  for (const z of WARMUP_ZONES) if ((score.get(z) ?? 0) > (best ? score.get(best)! : 0)) best = z;
  return best ? { zone: best, checks: checks.get(best)! } : null;
}

/** How far back a pain check-in still shapes the warm-up (days). assumption: a week — long enough that a step-down
 *  nobody followed up on keeps the primer off, short enough that an old reading does not rule forever. A newer
 *  check-in for the same exercise and area (the next-morning follow-up) always replaces an older one. */
export const PAIN_LOOKBACK_DAYS = 7;

const PAIN_RANK: Record<PainDecision, number> = {
  continue: 0, easier_variation: 1, step_down_flag_coach: 2, stop_see_clinician: 3, stop_tell_adult: 3,
};

/**
 * Today's pain decision for the warm-up: per exercise and body area, the NEWEST check-in within PAIN_LOOKBACK_DAYS
 * (so a settled next-morning follow-up replaces yesterday's step-down), and across those, the most careful. Decisions
 * come from lib/health/painRule.ts decide() as stored on the row — never re-decided here. null = no recent check-in.
 */
export function painDecisionToday(
  rows: readonly { exerciseName: string; bodyArea: string; decision: string; createdAt: Date | string }[], now: Date = new Date(),
): PainDecision | null {
  const since = now.getTime() - PAIN_LOOKBACK_DAYS * 86_400_000;
  const newest = new Map<string, { at: number; decision: PainDecision }>();
  for (const r of rows) {
    if (!(r.decision in PAIN_RANK)) continue;
    const at = new Date(r.createdAt).getTime();
    if (!Number.isFinite(at) || at < since || at > now.getTime() + 60_000) continue;
    const key = `${r.exerciseName}\u0000${r.bodyArea}`;
    const cur = newest.get(key);
    if (!cur || at > cur.at) newest.set(key, { at, decision: r.decision as PainDecision });
  }
  let worst: PainDecision | null = null;
  for (const { decision } of newest.values()) if (worst === null || PAIN_RANK[decision] > PAIN_RANK[worst]) worst = decision;
  return worst;
}

/** A low day starts with more time to ease in: 18 minutes (the default's fourteen plus the readiness read's four —
 *  lib/health/readiness.ts READINESS_EXTRA_WARMUP_MINUTES, held together by warmup.test.ts); otherwise the default. */
export const suggestedMinutes = (readiness: WarmupReadiness | null | undefined): WarmupMinutes => (readiness === 'low' ? LOW_DAY_WARMUP_MINUTES : DEFAULT_WARMUP_MINUTES);

/** The pattern's label for the card ("for today's squat"). */
export const patternWords = (p: MovementPattern | null): string | null => (p && p !== 'other' ? PATTERN_INFO[p].label.toLowerCase() : null);

/** GET /api/coach/me/warmup's answer (lib/coach/warmupServer.ts loadWarmupContext): what only the server knows. */
export interface WarmupContext {
  isYouth: boolean;
  painDecision: PainDecision | null;
  zone: { id: WarmupZone; words: string; checks: string[] } | null;
  screen: ScreenState;
  /** When the screen the area came from was run (ISO), else null. */
  screenAt: string | null;
  /** A standing intake red flag: no warm-up is offered (Today shows its hard-stop card instead). */
  hardStopped: boolean;
  /** Set only on FALLBACK_WARMUP_CONTEXT: nothing was read, so the plan says so instead of "under 18". */
  unavailable?: true;
  /** MIRROR-COACH P8 FIX (2026-09-30): P8's protocol gate for this athlete today, its non-youth reasons only (the
   *  header's THE JUMP GATE). */
  jumpGate: JumpGate;
}

/**
 * The context when it could not be read (offline, a 500, a harness with no route): the careful defaults — youth rules
 * (no jumps), no area, no pain reading — and the plan says the details did not load (NOTE_COPY.context_unavailable),
 * rather than telling an adult with a birth year on file that they are "under 18, or with no birth year".
 */
export const FALLBACK_WARMUP_CONTEXT: WarmupContext = {
  isYouth: true, painDecision: null, zone: null, screen: 'none', screenAt: null, hardStopped: false, unavailable: true,
  jumpGate: { closed: true, why: '', href: null },
};

// ── running it on Today (the guided run) and the camera hand-off ─────────────────────────────────────────────────────

/** When step `index` starts (s from the warm-up's start). */
export function stepStartSec(plan: Pick<WarmupPlan, 'steps'>, index: number): number {
  let s = 0;
  for (let i = 0; i < Math.min(index, plan.steps.length); i++) s += plan.steps[i].seconds;
  return s;
}

export interface RunnerPoint {
  index: number;
  step: WarmupStep | null;
  stepSec: number;
  remainingSec: number;
  /** The step's current timed line, else its cue. */
  line: string | null;
  /** Pressurize's pacer: which part of the breath, and seconds left in it. */
  breath: { phase: 'in' | 'hold' | 'out'; left: number } | null;
  done: boolean;
}

/** Where a guided run is `sec` seconds in: which step, how far into it, what to read now. Pure — the card's clock
 *  calls it every frame. */
export function runnerAt(plan: Pick<WarmupPlan, 'steps' | 'totalSec'>, sec: number): RunnerPoint {
  const t = Math.max(0, sec);
  let start = 0;
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i];
    if (t < start + s.seconds) {
      const into = t - start;
      const line = [...s.lines].reverse().find((l) => l.t <= into)?.text ?? s.cue;
      return { index: i, step: s, stepSec: into, remainingSec: s.seconds - into, line, breath: breathAt(s.pacer, into), done: false };
    }
    start += s.seconds;
  }
  return { index: plan.steps.length, step: null, stepSec: 0, remainingSec: 0, line: null, breath: null, done: true };
}

/**
 * The pacer at `sec` into its phase: in, hold, out, with seconds left in that part. null outside its rounds.
 *
 * MIRROR-COACH P7 (2026-09-29): this is the ONE pacer now (lib/breath/pacer.ts pacerAt) — it used to be its own copy of
 * the in / hold / out arithmetic, beside the cool-down's (cooldown.ts coolBreathAt) and the Mirror's CSS loop. A drill
 * pacer has no pause (restSec 0), exactly as before; lib/breath/pacer.test.ts runs this function's old body, verbatim,
 * against the shared one at every quarter second of WAKE_UP's Pressurize and finds no difference.
 */
export function breathAt(pacer: DrillPhase['pacer'] | undefined, sec: number): RunnerPoint['breath'] {
  if (!pacer) return null;
  const p = pacerAt({ ...pacer, restSec: 0 }, sec);
  return p && p.phase !== 'rest' ? { phase: p.phase, left: p.left } : null;
}

/**
 * The camera-run Wake-Up's page. null today: no page mounts lib/drills DrillRunner (the header's grep), and the drills
 * are movement play's to mount (their P9 /play/drills). Until then Today runs the warm-up as a guided, camera-free run.
 * When a drills page lands it takes the plan's Wake-Up as a Drill (wakeUpDrillFor) and this is set to its address.
 */
export const WAKE_UP_CAMERA_HREF: string | null = null;

/**
 * The plan's Wake-Up as a Drill a DrillRunner can play: WAKE_UP with only the phases the plan kept, in WAKE_UP's order,
 * with a low day's shortened launch. Built from the drill's own data; lib/drills is not edited. null when the plan kept
 * no Wake-Up phase.
 */
export function wakeUpDrillFor(plan: Pick<WarmupPlan, 'steps' | 'minutes'>): Drill | null {
  const phases = plan.steps.filter((s) => s.kind === 'wake_up' && s.phase).map((s) => s.phase!);
  if (!phases.length) return null;
  const full = phases.length === WAKE_UP.phases.length && phases.every((p, i) => p === WAKE_UP.phases[i]);
  return full ? WAKE_UP : { ...WAKE_UP, blurb: `${WAKE_UP.name}: ${phases.map((p) => p.name).join(', ')}.`, phases };
}

/** The server's answer read defensively: anything but an explicit `isYouth: false` is youth rules, an unknown area or
 *  decision is none, and something that is not an object at all is the careful fallback. */
export function readWarmupContext(json: unknown): WarmupContext {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return FALLBACK_WARMUP_CONTEXT;
  const o = json as Record<string, unknown>;
  const z = o.zone && typeof o.zone === 'object' ? o.zone as { id?: unknown; checks?: unknown } : null;
  const zone = z && isWarmupZone(z.id)
    ? { id: z.id, words: ZONE_WORDS[z.id], checks: Array.isArray(z.checks) ? z.checks.filter((c): c is string => typeof c === 'string') : [] }
    : null;
  const screens: readonly ScreenState[] = ['none', 'ungraded', 'clear', 'flagged'];
  const screen = screens.includes(o.screen as ScreenState) ? o.screen as ScreenState : zone ? 'flagged' : 'none';
  // MIRROR-COACH P8 FIX: the jump gate is open only when the server says so in so many words
  const g = o.jumpGate && typeof o.jumpGate === 'object' ? o.jumpGate as { closed?: unknown; why?: unknown; href?: unknown } : null;
  return {
    isYouth: o.isYouth !== false,
    painDecision: typeof o.painDecision === 'string' && o.painDecision in PAIN_RANK ? o.painDecision as PainDecision : null,
    zone, screen: zone ? 'flagged' : screen === 'flagged' ? 'none' : screen,
    screenAt: typeof o.screenAt === 'string' ? o.screenAt : null,
    hardStopped: o.hardStopped === true,
    jumpGate: {
      closed: g?.closed !== false,
      why: typeof g?.why === 'string' ? g.why : '',
      href: typeof g?.href === 'string' && g.href.startsWith('/') ? g.href : null,
    },
  };
}

// ── the guided run's clock (the card calls these; pure so the pause / skip arithmetic is tested, not eyeballed) ──────

/**
 * A guided run: `baseSec` into the warm-up at wall time `from` (ms, performance.now), paused at `pausedAt`.
 * MIRROR-COACH P7 (2026-09-29): the pacer's pausable clock (lib/breath/pacer.ts PacerClock) — the same shape and the
 * same arithmetic this file wrote first, moved there so a standalone pacer pauses and resumes exactly as a run does.
 */
export type GuidedRun = PacerClock;

export const startGuided = (now: number): GuidedRun => startPacerClock(now);
/** Seconds into the warm-up at `now` (a paused run reads where it was paused). */
export const guidedElapsed = (r: GuidedRun, now: number): number => pacerClockSec(r, now);
export const pauseGuided = (r: GuidedRun, now: number): GuidedRun => pausePacerClock(r, now);
export const resumeGuided = (r: GuidedRun, now: number): GuidedRun => resumePacerClock(r, now);
/** On to the start of the next step (a paused run stays paused there). Past the last step: the end. */
export function nextGuided(plan: Pick<WarmupPlan, 'steps' | 'totalSec'>, r: GuidedRun, now: number): GuidedRun {
  const at = runnerAt(plan, guidedElapsed(r, now));
  const to = at.done ? plan.totalSec : stepStartSec(plan, at.index + 1);
  return { from: now, baseSec: to, pausedAt: r.pausedAt !== null ? now : null };
}
