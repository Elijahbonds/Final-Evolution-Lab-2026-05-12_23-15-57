// lib/coach/cooldown.ts — MIRROR-COACH P6 (2026-09-29): Today's automatic cool-down.
//
// WHAT WAS MISSING. The crossref (crossref-wf_dfad67b3-209.json, matrix row "Recovery sessions, cool-down, off days")
// found that no session ends with a cool-down: "nowhere does a session end by offering the 4-6 recovery breath or a
// flush. It exists only as text (ch9)". Measured again today on this branch: P2 gave SessionExercise a `cooldown`
// section (prisma/schema.prisma SessionSection), but a section only exists when a coach fills it, and none of the
// fixtures, the Mirror's one-tap prescriptions (lib/coach/mirrorToProgram.ts, always Prep) or the builder's add row
// defaults write one — so a coached session's last card was its last working set, and Today went straight to Save/Done.
//
// WHAT THIS IS. generateCooldown() — today's session in, a 3–5 minute cool-down out, when the coach wrote no Cool-down
// section (a coach's own cool-down always wins; needsAutoCooldown):
//   1. THE BREATH FIRST: the owner's recovery breath from the Neuro-Mechanic Playbook ch9 ("The 4-6 Recovery Breath":
//      on your back, in through the nose for 4, out through pursed lips for 6, a short pause), ten breaths — the
//      Playbook's own minimum. First, because the owner's trainer's note puts it first ("lie down for 3 minutes and
//      breathe. Not stretch."), and because an athlete who stops after one step has still done the part the owner
//      calls non-negotiable. The breath starts the moment the last set ends, inside the Playbook's "within 5 minutes".
//      assumption: the owner's ch9 breath, not the Mirror's 4-2-6 pacer (lib/mirror/squatStage.ts BREATH_CYCLES, a
//      breathe-first pacer for BEFORE the squats). The brief allowed the Mirror's; the owner wrote this one for exactly
//      this moment. The Playbook's pause is "1–2 seconds"; FEL takes 2, which makes a 12-second breath — the same cycle
//      length as the Mirror's pacer. Phase 7 builds the one full pacer; CoolBreath is shaped so it can take this over
//      (in / hold / out / rest; this breath's hold is 0). MIRROR-COACH P7 (2026-09-29): it has — coolBreathAt is the
//      one pacer (lib/breath/pacer.ts), the numbers are the post-session preset's (lib/breath/presets.ts), and the
//      card draws the breath with the shared ring (components/breath/Pacer.tsx).
//   2. THEN THE SESSION'S PATTERNS' STRETCHES as rock-and-hold (lib/coach/warmupContent.ts ROCK_HOLDS — FEL's step:
//      small easy rocks into a position, then a still hold with one long breath out, FEL's 20 s + 10 s). One per
//      distinct pattern the session TRAINED (the key set's first, then the working sections' in running order), up to
//      three, spread across different areas of the body; an untagged session gets the general pair (hips, upper back)
//      and says so. So: one pattern → 3 minutes, two → 4, three or more → 5, untagged → 4.
//   3. A "done" tap, which the card sends to POST /api/coach/me/cooldown (lib/coach/cooldownServer.ts) — it stamps
//      ClientSession.cooldownDoneAt so P9's PRQ recovery can count completed cool-downs. Nothing here scores, pays,
//      ranks or streaks on it (owner decision #12).
//
// NEVER on an off day (a `recovery` session — lib/coach/offDay.ts): the off day's own Cool-down section already is
// the breath and the stretches.
//
// YOUTH (owner decision #6). Nothing here leaves the floor, pins, loads or asks for a max effort: every rock-and-hold
// is youthSafe by type, and cooldown.test.ts sweeps every pattern combination for impact, pins and max-effort words.
//
// HONESTY (lib/share/screen.ts; the P6 contract). A cool-down builds capacity for the next session; the copy never says
// it lowers the chance of anything or names a condition. The one safety line is an instruction ("If a stretch hurts,
// skip it"), which the screen allows on purpose. cooldown.test.ts lints every line a plan can show.
//
// Pure: no DOM, no fetch, no clock (every time-aware function takes `now`). Runs on the client (Today) and in tests.
import type { MovementPattern } from '@/public/_prisma/client';
import { isPattern } from './catalogue';
import { WORKING_SECTIONS } from './coverage';
import { rockHoldLines, guidedElapsed, type GuidedRun } from './warmup';
import { pacerAt, type PacerPhase, type PacerSpec } from '@/lib/breath/pacer';
import { POST_SESSION_BREATH } from '@/lib/breath/presets';
import { GENERAL_ROCK_HOLDS, HOLD_SEC, ROCK_HOLDS, ROCK_HOLD_ROUNDS, ROCK_SEC, type RockHoldStep } from './warmupContent';

// ── the breath ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** A breathing pacer: in, an optional hold, out, an optional pause before the next breath (s), for `rounds` breaths. */
export interface CoolBreath { inSec: number; holdSec: number; outSec: number; restSec: number; rounds: number }

/**
 * The owner's recovery breath (Neuro-Mechanic Playbook ch9, "The 4-6 Recovery Breath"): in 4, out 6, a short pause
 * (the Playbook's 1–2 s, taken at 2), ten breaths — the Playbook's "10 rounds minimum".
 *
 * MIRROR-COACH P7 (2026-09-29): read from the post-session preset (lib/breath/presets.ts POST_SESSION_BREATH), which
 * IS this breath — one post-session breath in the app, not a copy here and a preset there. The numbers are unchanged
 * (cooldown.test.ts still holds them: 4 / 0 / 6 / 2 × 10, 120 s).
 */
const POST = POST_SESSION_BREATH.spec;
export const RECOVERY_BREATH: CoolBreath = { inSec: POST.inSec, holdSec: POST.holdSec, outSec: POST.outSec, restSec: POST.restSec ?? 0, rounds: POST.rounds };
export const breathCycleSec = (b: CoolBreath): number => b.inSec + b.holdSec + b.outSec + b.restSec;
export const breathTotalSec = (b: CoolBreath): number => breathCycleSec(b) * b.rounds;
/** A cool-down breath as the one pacer's spec, starting at the breath step's own 0 (the card draws it with it). */
export const coolBreathPacer = (b: CoolBreath): PacerSpec => ({ from: 0, ...b });

export type BreathPhase = PacerPhase;

/**
 * Where a breath is `sec` seconds in: the part (in / hold / out / rest), whole seconds left in it, and which breath
 * (1-based). null before it starts or after the last breath.
 *
 * MIRROR-COACH P7 (2026-09-29): the one pacer (lib/breath/pacer.ts pacerAt) — this was its own copy of the arithmetic.
 * lib/breath/pacer.test.ts runs the old body, verbatim, against it over the whole recovery breath and the Mirror's
 * 4-2-6 at every quarter second: no difference.
 */
export function coolBreathAt(b: CoolBreath, sec: number): { phase: BreathPhase; left: number; round: number } | null {
  const p = pacerAt(coolBreathPacer(b), sec);
  return p ? { phase: p.phase, left: p.left, round: p.round } : null;
}

// ── copy (FEL's words; cooldown.test.ts lints every line) ───────────────────────────────────────────────────────────

export const COOLDOWN_TITLE = 'Cool-down';
/**
 * Under the card's title. It does NOT say "nothing here is scored" (the warm-up card does): owner decision #12 has P9
 * feed PRQ recovery from completed cool-downs, so that line would turn false the day P9 lands. It says what it is.
 */
export const cooldownMeaning = (minutes: number): string =>
  `${minutes} easy minutes to bring it back down: a long-exhale breath, then slow stretches for what you trained today. It builds capacity for your next session.`;
/** The one safety line: an instruction, not a claim. */
export const EASY_RANGE_LINE = 'Stay in easy range. If a stretch hurts, skip it.';
/** Where the breath comes from. */
export const BREATH_SOURCE_LINE = "The breath is the Neuro-Mechanic Playbook's recovery breath (ch. 9).";
export const UNTAGGED_NOTE = "Today's exercises aren't tagged with a movement pattern, so the stretches are the general ones.";
/** What the card says once the athlete taps done. */
export const COOLDOWN_DONE_LINE = "Cool-down done. It's logged with today's session.";
/** The breath step, in the owner's Playbook words where they are his (the name, the position, the counts). */
export const RECOVERY_BREATH_STEP = {
  id: 'recovery-breath',
  // the post-session preset's name (lib/breath/presets.ts) — the owner's, from the Playbook
  name: POST_SESSION_BREATH.name,
  cue: 'On your back, one hand on your belly, one on your lower ribs. In through the nose for 4, out slow through pursed lips for 6, then a short pause.',
  source: 'playbook ch9 (Protocol 1, The 4-6 Recovery Breath)',
} as const;
/** The breath's timed lines (FEL's). */
export const BREATH_LINES: readonly { t: number; text: string }[] = [
  { t: 0, text: 'Lie down and settle. Hands on your belly and lower ribs.' },
  { t: 60, text: 'Five more. Let your shoulders go heavy.' },
];

// ── inputs ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** One of today's exercises, as the cool-down reads it (a TodayExercise fits; so does the warm-up's SessionItemLike). */
export interface CooldownItemLike {
  order: number;
  section?: string | null;
  isKeySet?: boolean | null;
  coaching?: { pattern?: { id: MovementPattern } | null } | null;
}

/** Session kinds (prisma/schema.prisma SessionKind), as a plain string union so this file needs no client value. */
export type SessionKindLike = 'training' | 'recovery';

/**
 * Today adds its cool-down only when the session has something in it, the coach wrote NO Cool-down section (theirs
 * always wins), and it is not an off day (the off day's own Cool-down section is the breath and the stretches).
 */
export function needsAutoCooldown(items: readonly Pick<CooldownItemLike, 'section'>[], kind?: SessionKindLike | string | null): boolean {
  if (kind === 'recovery') return false;
  return items.length > 0 && !items.some((i) => i.section === 'cooldown');
}

/**
 * The generated warm-up (lib/coach/warmup.ts, Today's Prep card) is for training days only: an off day is 15–20 easy
 * minutes, and the Wake-Up's launch and a primer have no place on it. Kept here beside needsAutoCooldown so Today reads
 * both of its "does the app add something" decisions from one file.
 */
export const showsGeneratedWarmup = (kind?: SessionKindLike | string | null): boolean => kind !== 'recovery';

/**
 * What Today's warm-up IS for a session, for the readiness card to say something true about it (MIRROR-COACH P6 FIX,
 * 2026-09-29, code review): 'none' on an off day or an empty session (no warm-up is added), 'coach' when the coach
 * wrote a Prep section (it runs as written — components/coach/warmup-prep.tsx renders nothing), else 'generated'
 * (FEL's warm-up card runs). The same three tests Today and WarmupPrep already apply, in one place.
 */
export function todayWarmupKind(items: readonly Pick<CooldownItemLike, 'section'>[], kind?: SessionKindLike | string | null): 'generated' | 'coach' | 'none' {
  if (!showsGeneratedWarmup(kind) || !items.length) return 'none';
  return items.some((i) => i.section === 'prep') ? 'coach' : 'generated';
}

const RANK: Record<string, number> = { prep: 0, prime: 1, key: 2, assist: 3, finish: 4, cooldown: 5 };
const patOf = (i: CooldownItemLike): MovementPattern | null => (isPattern(i.coaching?.pattern?.id) ? i.coaching!.pattern!.id : null);

/**
 * The patterns the session TRAINED, most important first: the key set's, then the working sections' (Key, Assist,
 * Finish — lib/coach/coverage.ts WORKING_SECTIONS) in running order. A session whose working sections carry no tag
 * falls back to any tagged item (a mobility-only day tags its Prep). `other` is a coach's explicit "none of these" and
 * picks nothing. `untagged` = nothing in the session has a pattern the stretches can follow.
 */
export function sessionPatterns(items: readonly CooldownItemLike[]): { patterns: MovementPattern[]; untagged: boolean } {
  const ordered = [...items].sort((a, b) => (RANK[a.section ?? 'key'] ?? 2) - (RANK[b.section ?? 'key'] ?? 2) || a.order - b.order);
  const working = (i: CooldownItemLike) => (WORKING_SECTIONS as readonly string[]).includes(i.section ?? 'key');
  const pick = (from: readonly CooldownItemLike[]) => {
    const out: MovementPattern[] = [];
    for (const i of [...from.filter((x) => x.isKeySet), ...from.filter((x) => !x.isKeySet)]) {
      const p = patOf(i);
      if (p && p !== 'other' && !out.includes(p)) out.push(p);
    }
    return out;
  };
  const main = pick(ordered.filter(working));
  const patterns = main.length ? main : pick(ordered);
  return { patterns, untagged: patterns.length === 0 };
}

// ── picking the stretches ────────────────────────────────────────────────────────────────────────────────────────────

/** Stretches in a cool-down: one per trained pattern, at least one, at most three (FEL's choice: 3–5 minutes). */
export const COOLDOWN_STRETCHES = { min: 1, max: 3 } as const;

export interface PickedStretch { step: RockHoldStep; aim: 'pattern' | 'general'; pattern: MovementPattern | null }

/**
 * One rock-and-hold per pattern, in the patterns' order: the first that fits the pattern AND works an area none of the
 * others does (so three patterns stretch three places), else the first that fits and is not taken. A pattern with
 * nothing new left adds nothing. No pattern at all: the general pair (hips, upper back — warmupContent's
 * GENERAL_ROCK_HOLDS).
 */
export function pickCooldownStretches(patterns: readonly MovementPattern[]): PickedStretch[] {
  const general = GENERAL_ROCK_HOLDS.map((id) => ROCK_HOLDS.find((r) => r.id === id)!);
  if (!patterns.length) return general.map((step) => ({ step, aim: 'general', pattern: null }));
  const out: PickedStretch[] = [];
  const taken = (r: RockHoldStep) => out.some((o) => o.step.id === r.id);
  const spreads = (r: RockHoldStep) => !out.some((o) => r.zones.some((z) => o.step.zones.includes(z)));
  for (const p of patterns) {
    if (out.length >= COOLDOWN_STRETCHES.max) break;
    const fits = ROCK_HOLDS.filter((r) => r.patterns.includes(p) && !taken(r));
    const hit = fits.find(spreads) ?? fits[0];
    if (hit) out.push({ step: hit, aim: 'pattern', pattern: p });
  }
  if (!out.length) return general.map((step) => ({ step, aim: 'general', pattern: null }));
  return out;
}

// ── the plan ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type CooldownStepKind = 'breath' | 'rock_hold';

export interface CooldownStep {
  kind: CooldownStepKind;
  id: string;
  name: string;
  seconds: number;
  cue: string;
  /** The dose in words. */
  dose: string;
  /** Timed lines inside the step. */
  lines: { t: number; text: string }[];
  /** The breath step's pacer. */
  breath?: CoolBreath;
  /** Why a stretch is here: a pattern the session trained, or the general pair. */
  aim?: 'pattern' | 'general';
  pattern?: MovementPattern | null;
  source: string;
  /** Always false: nothing in a cool-down leaves the floor (the youth gate's field, held by the tests). */
  impact: false;
}

export interface CooldownNote { id: 'untagged' | 'easy_range'; text: string }

export interface CooldownPlan {
  /** Whole minutes, for the title (the steps add up to exactly this × 60). */
  minutes: number;
  totalSec: number;
  patterns: MovementPattern[];
  steps: CooldownStep[];
  notes: CooldownNote[];
}

const TIMES = ['', 'once', 'twice'];

function stretchStep(p: PickedStretch): CooldownStep {
  const r = p.step;
  const times = r.sides === 'each' ? 'each side' : TIMES[ROCK_HOLD_ROUNDS] ?? `${ROCK_HOLD_ROUNDS} times`;
  return {
    kind: 'rock_hold', id: r.id, name: r.name, seconds: ROCK_HOLD_ROUNDS * (ROCK_SEC + HOLD_SEC), cue: r.cue,
    dose: `${ROCK_SEC} s of rocks, ${HOLD_SEC} s held, ${times}. ${r.setup}`,
    lines: rockHoldLines(r, ROCK_HOLD_ROUNDS), aim: p.aim, pattern: p.pattern, source: r.source, impact: false,
  };
}

function breathStep(b: CoolBreath = RECOVERY_BREATH): CooldownStep {
  return {
    kind: 'breath', id: RECOVERY_BREATH_STEP.id, name: RECOVERY_BREATH_STEP.name, seconds: breathTotalSec(b), cue: RECOVERY_BREATH_STEP.cue,
    dose: `${b.rounds} slow breaths`, lines: BREATH_LINES.filter((l) => l.t < breathTotalSec(b)).map((l) => ({ ...l })), breath: b,
    source: RECOVERY_BREATH_STEP.source, impact: false,
  };
}

/** Today's cool-down for a session (call needsAutoCooldown first — this builds one whatever the session holds). */
export function generateCooldown(items: readonly CooldownItemLike[]): CooldownPlan {
  const { patterns, untagged } = sessionPatterns(items);
  const steps = [breathStep(), ...pickCooldownStretches(patterns).map(stretchStep)];
  const totalSec = steps.reduce((s, x) => s + x.seconds, 0);
  const notes: CooldownNote[] = [];
  if (untagged) notes.push({ id: 'untagged', text: UNTAGGED_NOTE });
  notes.push({ id: 'easy_range', text: EASY_RANGE_LINE });
  return { minutes: Math.round(totalSec / 60), totalSec, patterns, steps, notes };
}

// ── running it (the card's clock; pure so the arithmetic is tested, not eyeballed) ──────────────────────────────────

export interface CooldownPoint {
  index: number;
  step: CooldownStep | null;
  stepSec: number;
  remainingSec: number;
  /** The step's current timed line, else its cue. */
  line: string | null;
  breath: { phase: BreathPhase; left: number; round: number } | null;
  done: boolean;
}

/** When step `index` starts (s from the cool-down's start). */
export function cooldownStepStart(plan: Pick<CooldownPlan, 'steps'>, index: number): number {
  let s = 0;
  for (let i = 0; i < Math.min(index, plan.steps.length); i++) s += plan.steps[i].seconds;
  return s;
}

/** Where a run is `sec` seconds in: which step, how far into it, what to read now, the breath's part. */
export function cooldownAt(plan: Pick<CooldownPlan, 'steps'>, sec: number): CooldownPoint {
  const t = Math.max(0, sec);
  let start = 0;
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i];
    if (t < start + s.seconds) {
      const into = t - start;
      const line = [...s.lines].reverse().find((l) => l.t <= into)?.text ?? s.cue;
      return { index: i, step: s, stepSec: into, remainingSec: s.seconds - into, line, breath: s.breath ? coolBreathAt(s.breath, into) : null, done: false };
    }
    start += s.seconds;
  }
  return { index: plan.steps.length, step: null, stepSec: 0, remainingSec: 0, line: null, breath: null, done: true };
}

/** On to the start of the next step (a paused run stays paused there). Past the last step: the end. The rest of the
 *  clock (start / pause / resume / elapsed) is the warm-up's (lib/coach/warmup.ts GuidedRun), shared as it is. */
export function nextCooldownStep(plan: Pick<CooldownPlan, 'steps' | 'totalSec'>, r: GuidedRun, now: number): GuidedRun {
  const at = cooldownAt(plan, guidedElapsed(r, now));
  const to = at.done ? plan.totalSec : cooldownStepStart(plan, at.index + 1);
  return { from: now, baseSec: to, pausedAt: r.pausedAt !== null ? now : null };
}

// ── the done tap: which coached session it belongs to ───────────────────────────────────────────────────────────────

/**
 * How long after a session's Done the cool-down's done tap still belongs to it. The Playbook says to start the breath
 * within five minutes of the last set; FEL allows two hours for the tap, so an athlete who cools down, packs up and
 * taps on the way out still lands on the session they just finished. assumption: two hours.
 */
export const COOLDOWN_TAP_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface CooldownTargetRow { id: string; completedAt: Date | string | null; cooldownDoneAt?: Date | string | null; createdAt: Date | string }
export type CooldownTarget =
  | { action: 'mark'; id: string }
  | { action: 'already'; id: string; at: Date }
  | { action: 'create' }
  /** Nothing open, and the session was completed longer ago than the window: a late tap on a finished card. Refused. */
  | { action: 'late' };

const ms = (v: Date | string | null | undefined): number => (v == null ? NaN : v instanceof Date ? v.getTime() : Date.parse(v));

/**
 * The client's rows for ONE (program, session): the open one if there is one (the athlete cooled down before pressing
 * Done); else the newest one completed within COOLDOWN_TAP_WINDOW_MS (they pressed Done first, then cooled down); else
 * none — a new open row is made for the tap, which Done later completes. A row already stamped keeps its first time
 * (a second tap changes nothing), so the count P9 reads is one per session however often the button is pressed.
 *
 * MIRROR-COACH P6 FIX (2026-09-29, code review): nothing open and a completion OLDER than the window is 'late', not
 * 'create'. Today never shows a completed session again (lib/coach/loop.ts nextSession skips it), so the only tap that
 * reaches here is the finished card left open past the window — and 'create' opened a second, never-to-be-completed row
 * on an already-completed session, stamped as a cool-down. Refused now (409 cooldown_window_passed). A completion
 * stamped in the future (a skewed clock) is neither just finished nor long ago, and still makes a new row.
 */
export function cooldownTarget(rows: readonly CooldownTargetRow[], now: Date): CooldownTarget {
  const newest = [...rows].sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  const open = newest.find((r) => r.completedAt == null);
  const recent = newest
    .filter((r) => r.completedAt != null && now.getTime() - ms(r.completedAt) <= COOLDOWN_TAP_WINDOW_MS && ms(r.completedAt) <= now.getTime() + 60_000)
    .sort((a, b) => ms(b.completedAt) - ms(a.completedAt))[0];
  const hit = open ?? recent;
  if (!hit) {
    const longAgo = newest.some((r) => r.completedAt != null && now.getTime() - ms(r.completedAt) > COOLDOWN_TAP_WINDOW_MS);
    return longAgo ? { action: 'late' } : { action: 'create' };
  }
  const at = ms(hit.cooldownDoneAt);
  return Number.isFinite(at) ? { action: 'already', id: hit.id, at: new Date(at) } : { action: 'mark', id: hit.id };
}

/** What the cool-down route answers, by error, for the card. */
export const COOLDOWN_ERROR_COPY: Record<string, string> = {
  forbidden: 'This is not your program.',
  program_inactive: 'This program is paused, so nothing was saved.',
  session_not_found: 'That session is not in your program any more. Reload.',
  recovery_session: "An off day's cool-down is part of the session itself. Log it there.",
  coach_cooldown: 'Your coach wrote this cool-down. Log it on its own card.',
  empty_session: 'This session has nothing in it yet.',
  health_hard_stopped: 'Training is paused until you clear it from the Mirror.',
  cooldown_window_passed: "It's been a while since this session's Done, so this cool-down wasn't added to it.",
  unauthorized: 'Sign in again.',
  invalid_json: 'Something went wrong sending that. Try again.',
};
export const cooldownErrorText = (code: string | null | undefined): string => (code && COOLDOWN_ERROR_COPY[code]) || 'That did not save. Try again.';
