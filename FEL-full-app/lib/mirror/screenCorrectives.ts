// screenCorrectives — what each camera check of the Movement Screen asks the athlete to do, written ONCE for the three
// readers that say it: the athlete's own "what to work on" after a screen (components/mirror/screen-next-steps.tsx), the
// coach's panel for that athlete's screen (components/coach/screen-prescriptions.tsx, through lib/coach/mirrorToProgram)
// and the draft the coach can add to the athlete's program. MIRROR-COACH P3, 2026-09-26.
//
// WHAT WAS WRONG. Until today a screen's result reached nobody as work. The station card (lib/mirror/stationCard.ts,
// this phase) shows one FIX line under a flag; the coach's draft (lib/coach/mirrorToProgram.ts) matched a catalogue
// exercise by NAME off its own word list and said "failed on the left side"; and the written corrective blocks the
// Mirror already carries (lib/mirror/program.ts: five zones × release / activate / pattern) were mounted nowhere (the
// crossref's coverage matrix: "Not mounted: 15 program blocks"). Three places, three vocabularies, and no rule for the
// two outcomes that are not a flag.
//
// THE MAPPING, per camera slot (one per check; the single-leg stance has two, one per leg):
//   · FLAG      → the check's FIX line (screen.ts fixLine) + ONE corrective block from lib/mirror/program.ts (below),
//                 with the value the camera read, labelled estimated.
//   · PASS      → nothing prescribed. The value is still shown, because "what the camera saw" is the point.
//   · UNREADABLE, or no reading at all → RETEST, never clear and never a pass (the phase-3 contract). It says why it
//                 was not read and the one thing to do about it (stationGraders.ts RETEST_HINT).
//
// WHICH BLOCK, and why — FEL's judgement, read off each check's own FIX line against the block's own movements:
//   shoulderLevel → rib_thoracic · release  "Open the ribcage": the FIX is "breathing work first, then easy rotation
//                                            drills to both sides", and the block is a mid-back roll, the side-lying
//                                            open book (rotation to both sides) and 360° breathing.
//   headFloat     → rib_thoracic · activate "Ask the mid-back to hold": the FIX is thoracic extension; wall slides,
//                                            the prone Y-raise and a half-kneeling overhead reach are extension work.
//   hipLevel      → lumbo_pelvic · activate "Ask the pelvis to stay level": the FIX is single-leg hip work; the block is
//                                            a dead bug, a bridge hold and a side plank with a reach.
//   singleLeg     → lumbo_pelvic · activate the same block — the FIX is stance holds and step-downs, which the block's
//                                            side plank and bridge hold build toward. Shown once when both flag.
//   kneeWindow    → posterior_chain · activate "Ask the hips to lead the hinge": the FIX is hip work and slow squats
//                                            watching the knee; hips leading is the block's whole point.
//   heelLine      → NO BLOCK. Nothing in program.ts works the foot (its zones are ribs, pelvis, upper traps, lats and
//                                            the back of the leg), and the one block that touches the foot —
//                                            posterior_chain · release — opens with "Pin the hamstring". Owner decision
//                                            #6: no pin-and-stretch under 18, and nothing here knows the athlete's
//                                            age; phase 9 mounts the pins behind the youth gate. The FIX line (foot
//                                            tripod work, slow calf raises) is the work, and the coach's draft finds a
//                                            tripod-layer exercise for it.
// No mapped block contains a pin (screenCorrectives.test.ts holds that). And since the P3 review (2026-09-26) no block is
// shown to a youth athlete at all — PLAN item 9's "off for minors" (see YouthGate below).
//
// HONESTY (lib/share/screen.ts rules; the P3 contract): every value is ESTIMATED and says so; a flag is "flagged for a
// closer look", never a verdict; nothing names a condition, a cause or a risk; and every surface that shows this says
// CAMERA_NOT_DIAGNOSIS. The test runs every line through screenText.
//
// Pure: no DOM, no fetch. Runs in the browser (the Mirror) and on the server (the coach's route).
import type { ZoneId } from '../babylon/nexus/neuro-mirror';
import { playbookBlock, type BlockKind, type PlaybookBlock } from './program';
import { cameraSlots, fixLine, sideWords, type CheckResult, type ScreenId } from './screen';
import { RETEST_HINT, formatGradeValue, isGraderId, retestHintFor, type GraderId, type UnreadableReason } from './stationGraders';

/** Said wherever a screen's mapping is shown — to the athlete and to the coach. */
export const CAMERA_NOT_DIAGNOSIS = 'This is what the camera saw, not a diagnosis.';
/** A camera slot with no reading at all (the screen ended early, or a pre-P3 client posted nothing for it). */
export const NOT_MEASURED_NOTE = 'Not read: no reading came back for this check.';
/** What a retest asks for when there is no reason to go on. */
export const RETEST_DEFAULT_HINT = 'Run this station again next time.';

/** The camera checks, short, the way a list of results names them. */
export const SHORT_LABEL: Record<GraderId, string> = {
  heelLine: 'Heel line', kneeWindow: 'Knee window', hipLevel: 'Hip level',
  shoulderLevel: 'Shoulder height', headFloat: 'Head float', singleLeg: 'Single-leg stance',
};

/**
 * The block each check's flag maps to — see the header for why each one; null = no block fits (heelLine). `title`, where
 * set, is what the SCREEN calls the block (MIRROR-COACH P3 review, 2026-09-26): the playbook's "Ask the pelvis to stay
 * level" sat right under a single-leg flag whose pelvis wording P3 had removed as unmeasurable, and under a hip-level read
 * of joint centres. The movements are the playbook's, unchanged; the Mirror's zone program keeps its own title.
 */
export const CORRECTIVE_BLOCK: Record<GraderId, { zone: ZoneId; kind: BlockKind; title?: string } | null> = {
  shoulderLevel: { zone: 'rib_thoracic', kind: 'release' },
  headFloat: { zone: 'rib_thoracic', kind: 'activate' },
  // one title for the two, so "Same block as above" names the block it follows
  hipLevel: { zone: 'lumbo_pelvic', kind: 'activate', title: 'Trunk and hip hold' },
  singleLeg: { zone: 'lumbo_pelvic', kind: 'activate', title: 'Trunk and hip hold' },
  kneeWindow: { zone: 'posterior_chain', kind: 'activate' },
  heelLine: null,
};

/** The corrective block for a check, or null (heelLine, or an id that is not a camera check). */
export function correctiveBlockFor(checkId: string): PlaybookBlock | null {
  if (!isGraderId(checkId)) return null;
  const b = CORRECTIVE_BLOCK[checkId];
  if (!b) return null;
  const block = playbookBlock(b.zone, b.kind);
  return b.title ? { ...block, title: b.title } : block;
}

export type OutcomeStatus = 'flag' | 'pass' | 'retest';

/** One camera slot of one screen, read for what to do about it. */
export interface CheckOutcome {
  checkId: GraderId;
  /** singleLeg: the leg it tested (always). Every other check: the side of a one-sided flag, else absent. */
  side?: 'left' | 'right';
  label: string;
  status: OutcomeStatus;
  /** A pre-P3 row's 'borderline' grade (the graders have no such grade): shown as a flag, ranked after the fails. */
  borderline?: boolean;
  /** What the camera read, in words with its unit, labelled estimated; null when nothing was read. */
  value: string | null;
  /** Retest only: why it was not read. */
  note: string | null;
  /** Retest only: the one thing to do about it. */
  hint: string | null;
  /** Flag only: the check's FIX line. */
  fix: string | null;
  /** Flag only: the corrective block (null for heelLine). */
  block: PlaybookBlock | null;
}

/** A camera grade as any reader holds it: the runner's StationGrade, or a stored row's server-regraded check. */
export interface GradeLike {
  checkId: string;
  status?: string;
  value?: number | null;
  side?: 'left' | 'right';
  bySide?: { left: number; right: number };
  touchDowns?: number;
  stanceSec?: number;
  note?: string;
  reason?: string;
  /** The frames the grade was read over (0 = the runner ended the station before any: retestHintFor). */
  frames?: number;
}

const LEGS = ['left', 'right'] as const;
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** The screen's camera slots in protocol order: [checkId, leg] (leg only for the two-slot single-leg stance). */
function slotsOf(screen: ScreenId): { checkId: GraderId; leg?: 'left' | 'right' }[] {
  return [...cameraSlots(screen)].flatMap(([id, n]) => {
    if (!isGraderId(id)) return [];
    return n > 1 ? LEGS.slice(0, n).map((leg) => ({ checkId: id, leg })) : [{ checkId: id }];
  });
}

/**
 * A flag's FIX line, with the one thing the line leaves to the reader said for this read: the hip-level FIX works "the
 * low side", and the grader names the HIGHER hip as the flag's side (stationGraders.ts decideGrade), so a reader who took
 * "Hip level, right side" for the side to work would work the wrong one. Found in this lane's proof, 2026-09-26.
 */
export function fixFor(checkId: GraderId, side?: 'left' | 'right'): string | null {
  const fix = fixLine(checkId);
  if (!fix) return null;
  if (checkId === 'hipLevel' && side) return `${fix} Here the low side is the ${side === 'left' ? 'right' : 'left'}.`;
  return fix;
}

function flagOutcome(checkId: GraderId, side: 'left' | 'right' | undefined, value: string | null, borderline = false): CheckOutcome {
  return {
    checkId, ...(side ? { side } : {}), label: SHORT_LABEL[checkId], status: 'flag', ...(borderline ? { borderline: true } : {}),
    value, note: null, hint: null, fix: fixFor(checkId, side), block: correctiveBlockFor(checkId),
  };
}
function passOutcome(checkId: GraderId, side: 'left' | 'right' | undefined, value: string | null): CheckOutcome {
  return { checkId, ...(side ? { side } : {}), label: SHORT_LABEL[checkId], status: 'pass', value, note: null, hint: null, fix: null, block: null };
}
function retestOutcome(checkId: GraderId, leg: 'left' | 'right' | undefined, note: string | null, reason?: string, frames?: number): CheckOutcome {
  const hint = reason && reason in RETEST_HINT
    ? retestHintFor({ reason: reason as UnreadableReason, side: leg, checkId, ...(finite(frames) ? { frames } : {}) })
    : RETEST_DEFAULT_HINT;
  return {
    checkId, ...(leg ? { side: leg } : {}), label: SHORT_LABEL[checkId], status: 'retest', value: null,
    note: note || NOT_MEASURED_NOTE, hint, fix: null, block: null,
  };
}

/**
 * Every camera slot of a screen from its GRADES (the runner's, or a stored row's server-regraded `camera`). The WORST
 * grade per slot is the one read — flag over pass over anything else, the first on a tie — as the server keeps the worst
 * claim per slot (lib/mirror/screenClaims.ts, since the P3 review); a slot with no grade is a retest. Grades for checks
 * the screen does not have are ignored.
 */
export function outcomesFromGrades(screen: ScreenId, grades: readonly GradeLike[]): CheckOutcome[] {
  const rank = (x: GradeLike) => (x.status === 'flag' ? 2 : x.status === 'pass' ? 1 : 0);
  return slotsOf(screen).map(({ checkId, leg }) => {
    const g = grades.filter((x) => x && x.checkId === checkId && (!leg || x.side === leg))
      .reduce<GradeLike | undefined>((best, x) => (!best || rank(x) > rank(best) ? x : best), undefined);
    if (!g) return retestOutcome(checkId, leg, null);
    const readable = (g.status === 'pass' || g.status === 'flag') && finite(g.value);
    if (!readable) return retestOutcome(checkId, leg, typeof g.note === 'string' ? g.note : null, g.reason, g.frames);
    // a stored row is JSON: only numbers reach the formatter (a malformed per-side read is dropped, not printed)
    const bySide = g.bySide && finite(g.bySide.left) && finite(g.bySide.right) ? { left: g.bySide.left, right: g.bySide.right } : undefined;
    const value = formatGradeValue({
      checkId, value: g.value as number, bySide,
      touchDowns: finite(g.touchDowns) ? g.touchDowns : undefined, stanceSec: finite(g.stanceSec) ? g.stanceSec : undefined,
    });
    const side = leg ?? (g.side === 'left' || g.side === 'right' ? g.side : undefined);
    return g.status === 'flag' ? flagOutcome(checkId, side, value) : passOutcome(checkId, leg, value);
  });
}

/**
 * Every camera slot from a row's RESULTS alone — a row stored before 2026-09-26 carries no `camera` evidence, only
 * {checkId, grade, side, detail}. fail → flag, borderline → flag (marked), stable → pass, no result → retest.
 */
export function outcomesFromResults(screen: ScreenId, results: readonly CheckResult[]): CheckOutcome[] {
  return slotsOf(screen).map(({ checkId, leg }) => {
    const sided = results.find((x) => x.checkId === checkId && (!leg || x.side === leg));
    // an old single-leg result that names no leg fills the first leg's slot, shown with no leg (it did not say which)
    const r = sided ?? (leg === 'left' ? results.find((x) => x.checkId === checkId && !x.side) : undefined);
    if (!r) return retestOutcome(checkId, leg, null);
    const value = r.detail ?? null;
    const side = sided ? (leg ?? r.side) : undefined;
    if (r.grade === 'stable') return passOutcome(checkId, sided ? leg : undefined, value);
    return flagOutcome(checkId, side, value, r.grade === 'borderline');
  });
}

/**
 * "Hip level, right hip higher" / "Single-leg stance, left leg" / "Knee window". What a side MEANS for each check is said
 * in the title (2026-09-26, this lane's proof): the level checks flag the side that reads HIGHER, the knee and heel
 * checks the knee or heel that read off, the single-leg stance the leg stood on — screen.ts sideWords, which the
 * screen's headline says too since the P3 review.
 */
export function outcomeTitle(o: Pick<CheckOutcome, 'checkId' | 'label' | 'side'>): string {
  return o.side ? `${o.label}, ${sideWords(o.checkId, o.side)}` : o.label;
}

// ── the athlete's own view ─────────────────────────────────────────────────────────────────────────────────────────

export interface AthleteWorkItem {
  title: string;
  /** "The camera saw …" */
  saw: string;
  /** The FIX line. */
  todo: string;
  block: PlaybookBlock | null;
  /** True when an earlier item already showed this block (hip level and the single-leg stance share one). */
  blockShownAbove: boolean;
}

export interface AthletePlan {
  headline: string;
  work: AthleteWorkItem[];
  retest: { title: string; why: string }[];
  /** Checks the camera read with nothing to work on. */
  nothing: string[];
  /** Always CAMERA_NOT_DIAGNOSIS. */
  note: string;
  /** Said when the written blocks were left off for a youth athlete (YOUTH_BLOCKS_OFF), else absent. */
  blocksNote?: string;
}

// ── youth: the written blocks are off (PLAN item 9, owner decisions #6 and #20) ────────────────────────────────────
//
// MIRROR-COACH P3 review (2026-09-26). PLAN item 9 mounts the written correctives "minus the abdominal/psoas pins; off
// for minors", and P3 mounted them early — to every athlete after a screen and in the coach's draft, with no age gate,
// before phase 5's youth and guardian gate exists. The mapped blocks hold no pin (decision #6 held), but "off for
// minors" is the whole mount. So: under youth rules — under 18 by birth year, or NO birth year on file (decision #20:
// blank = youth rules until answered; lib/coach/taxonomy.ts youthRules) — the blocks are not shown, to the athlete or
// in the coach's draft, and the line says why. The FIX line stays: it is the screen's own suggestion (screen.ts FIX),
// shown on every screen since before P3. Phase 5's intake asks the birth year; an adult then sees the blocks.

/** Why an athlete is under youth rules: a birth year under 18, or none on file. null = an adult. */
export type YouthGate = 'minor' | 'unknownAge' | null;

/** The gate for a birth year (the same rule as lib/coach/taxonomy.ts youthRules, kept here so lib/mirror stays free of
 *  lib/coach; screenCorrectives.test.ts holds the two together). */
export function youthGateFor(dobYear: number | null | undefined, now: Date = new Date()): YouthGate {
  if (typeof dobYear !== 'number' || !Number.isFinite(dobYear) || dobYear < 1900) return 'unknownAge';
  return now.getFullYear() - dobYear > 18 ? null : 'minor';
}

export const YOUTH_BLOCKS_OFF: Record<Exclude<YouthGate, null>, string> = {
  minor: 'Corrective blocks are off under 18 for now. The fix above is the work — do it with your coach or a parent.',
  unknownAge: 'Corrective blocks are off until your birth year is on your account (they are for adults for now). The fix above is the work.',
};

/** The outcomes with their written blocks taken off (a youth athlete, above). */
export function withoutBlocks(outcomes: readonly CheckOutcome[]): CheckOutcome[] {
  return outcomes.map((o) => (o.block ? { ...o, block: null } : o));
}

/** The plan in plain words for the athlete who just ran the screen: flags first, then what to run again. */
export function athletePlan(rawOutcomes: readonly CheckOutcome[], opts: { youth?: YouthGate } = {}): AthletePlan {
  const blocked = !!opts.youth && rawOutcomes.some((o) => o.status === 'flag' && o.block);
  const outcomes = opts.youth ? withoutBlocks(rawOutcomes) : rawOutcomes;
  const shown = new Set<string>();
  const work: AthleteWorkItem[] = outcomes.filter((o) => o.status === 'flag').map((o) => {
    const key = o.block ? `${o.block.zone}|${o.block.kind}` : '';
    const blockShownAbove = !!key && shown.has(key);
    if (key) shown.add(key);
    return {
      title: outcomeTitle(o),
      saw: o.value ? `The camera saw ${o.value}.` : 'The camera flagged this one for a closer look.',
      todo: o.fix ?? 'Ask your coach what to work on for this one.',
      block: o.block,
      blockShownAbove,
    };
  });
  const retest = outcomes.filter((o) => o.status === 'retest').map((o) => ({ title: outcomeTitle(o), why: `${o.note ?? NOT_MEASURED_NOTE} ${o.hint ?? RETEST_DEFAULT_HINT}` }));
  // a check whose every slot passed is named once; a slot that passed beside one that did not is named with its side
  // ("Single-leg stance" read beside a flagged right leg as if the whole check were fine — this lane's proof)
  const nothing = [...new Set(outcomes.filter((o) => o.status === 'pass').map((o) =>
    outcomes.every((x) => x.checkId !== o.checkId || x.status === 'pass') ? o.label : outcomeTitle(o)))];
  const headline = work.length
    ? `${work.length} thing${work.length === 1 ? '' : 's'} to work on, from what the camera saw.`
    : retest.length === outcomes.length
      ? 'The camera could not read enough of this screen to say what to work on. Run it again.'
      : retest.length
        ? 'Nothing flagged in what the camera read. Some checks were not read, so run those again before you call it done.'
        : 'Nothing flagged in any check the camera read.';
  return { headline, work, retest, nothing, note: CAMERA_NOT_DIAGNOSIS, ...(blocked && opts.youth ? { blocksNote: YOUTH_BLOCKS_OFF[opts.youth] } : {}) };
}
