// formSummary — the form read's shape on the wire, and the server's bound on it (movement play, phase 10, 2026-09-24).
//
// After each attempt the body reader grades the movement in the book's language (The Art of Dunking: penultimate, arm
// swing timing, knee drive, jump height, landing), a shot in the shooter's (release vs the top, set point, elbow,
// follow-through), a strike and a board landing in theirs. The client sends the session's reads as `form` on
// POST /api/sessions, and the server keeps them: every attempt's raw numbers to history (WorkoutScan), and a dunk
// session's best measured jump to PRQ power as a CAMERA ESTIMATE (the owner, 2026-09-24: "feeds PRQ power as a camera
// estimate, never the verified shield"; "every form read is saved to history"). From a shared camera (Dunk Duel) only
// the signed-in player's attempts are theirs to keep.
//
// ABSENCE IS NOT ZERO. A read the camera could not make is null ("unread"), never 0: a 0 cm jump or a 0 ms follow-
// through is a claim the body never made. The bound below turns anything it cannot trust into null too, rather than
// clamping it into a number (the /api/mirror/dunks rule: "a 300 cm vertical is a broken measurement").
//
// The numbers are computed on the player's device, so the server cannot verify them; it can only refuse the ones no
// body produces. That is why the PRQ row is marked as an estimate and nothing that grants the shield reads it.
//
// Pure: no Prisma, no DOM. The write itself is lib/move/formWrite.ts.

import type { DunkFamily } from '@/lib/irl/dunkTracker';
import { PRQ_CAMERA_SOURCE, type PrqAttr } from '@/lib/prq';
import { axisValue, measurementFor } from '@/lib/profile/scanToSnapshot';
import type { CreatePrqEntryInput } from '@/lib/prq-entries';

export const FORM_SUMMARY_VERSION = 1;

// ── the physics bounds ───────────────────────────────────────────────────────────────────────────────────────────

/** Standard gravity (m/s²), the g every jump reader in the app times flight with (IRLCore G, BodyReader). */
export const G_MPS2 = 9.81;
/** The lowest pose rate the space check lets a body player play at (map:space-drills-ui §3, "Pose rate ≥ 24 Hz"). */
export const MIN_POSE_HZ = 24;
/**
 * How far a flight time may sit from the one the claimed height implies (ms). Take-off and landing are each uncertain
 * by up to one frame (map:irl-form §2, frame quantisation), so two frames at the slowest pose rate we play at.
 */
export const FLIGHT_SLACK_MS = 2 * (1000 / MIN_POSE_HZ);
/**
 * The highest jump the server believes (cm). The best standing verticals ever recorded at the NFL Combine are about
 * 46 in (117 cm); 120 leaves a little room over that, and anything higher is a broken read (map:space-drills-ui §4:
 * "vertical ≤ ~120 cm").
 */
export const MAX_VERTICAL_CM = 120;
/** The shortest flight any jump reader in the app calls a jump (IRLCore MIN_FLIGHT 0.18 s, dunkTracker MIN_FLIGHT_MS). */
export const MIN_FLIGHT_MS = 180;

/** h = g·t²/8 (map:irl-form §2): the height a flight of t implies, in cm. */
export function heightCmForFlight(flightMs: number): number {
  const t = flightMs / 1000;
  return (G_MPS2 * t * t / 8) * 100;
}
/** The inverse: the flight (ms) a jump of h cm takes. */
export function flightMsForHeight(heightCm: number): number {
  return Math.sqrt((8 * (heightCm / 100)) / G_MPS2) * 1000;
}

/** The lowest height that is still a jump: what the shortest flight reads as (~4 cm). */
export const MIN_JUMP_CM = heightCmForFlight(MIN_FLIGHT_MS);
/** The longest flight the server believes: the highest jump's flight plus the timing slack (~1070 ms). */
export const MAX_FLIGHT_MS = flightMsForHeight(MAX_VERTICAL_CM) + FLIGHT_SLACK_MS;

/** A deep squat drops the hips about half the leg (~50 cm on a 1.95 m player); 70 leaves room, more is a broken read. */
export const MAX_HIP_DROP_CM = 70;
/** A knee, wrist or elbow sits no farther from its reference line than a limb segment (~50 cm thigh on a 1.95 m player). */
export const MAX_LIMB_OFFSET_CM = 70;
/**
 * A timing more than this from its anchor (take-off, the top of the jump) belongs to another movement: the longest
 * flight is ~1 s (MAX_FLIGHT_MS), and an arm swing or a release sits inside the jump around it.
 */
export const MAX_TIMING_MS = 1000;
/** BodyReader looks for the penultimate among the steps this long before take-off (PENULT_WINDOW_MS, lib/pose/BodyReader.ts). */
export const MAX_STEP_CONTACT_MS = 1500;
/** Side-to-side drift: the ~2 m of floor the space check asks for, centred (PLAN-MOVEMENT-PLAY.md, "Space"). */
export const MAX_DRIFT_CM = 100;
/** A follow-through, a guard return or a held tuck that lasts past 3 s is the player standing still, not a read. */
export const MAX_HOLD_MS = 3000;
/** Measured elite punches peak around 10 m/s; twice that is past any human hand. */
export const MAX_HAND_SPEED_MPS = 20;

// ── the reads ────────────────────────────────────────────────────────────────────────────────────────────────────

interface ReadSpec { min: number; max: number }

/**
 * Every read, with the range a body can produce. Signed timings are "− = before the anchor". Names carry their unit.
 * Sources: the book's reads (map:irl-form §5, map:dunk-input §7), the shot (map:hoops-shooting-input §6), combat
 * (map:combat-input §8), boards (map:boards-racing-input §2).
 */
export const READ_SPECS = {
  // the jump, timed off the flight (h = g·t²/8)
  heightCm: { min: MIN_JUMP_CM, max: MAX_VERTICAL_CM },
  flightMs: { min: MIN_FLIGHT_MS, max: MAX_FLIGHT_MS },
  // the approach, read in place (Ch 7): the hip drop and contact of the step before the plant
  penultimateDropCm: { min: 0, max: MAX_HIP_DROP_CM },
  penultimateContactMs: { min: 0, max: MAX_STEP_CONTACT_MS },
  // arm swing timing is TWO reads (map:hoops-shooting-input §6, map:dunk-input §7): the wrists' low point relative to
  // the penultimate contact (Ch 7: "arms drive down as the penultimate foot strikes"; rising arms there waste it), and
  // their peak upward speed relative to take-off (Ch 1: they whip up into the take-off)
  armLowVsPenultMs: { min: -MAX_TIMING_MS, max: MAX_TIMING_MS },
  armSwingMs: { min: -MAX_TIMING_MS, max: MAX_TIMING_MS },
  // the free knee above the hip line at toe-off (Ch 7: "the free leg is not a passenger")
  kneeDriveCm: { min: -MAX_LIMB_OFFSET_CM, max: MAX_LIMB_OFFSET_CM },
  // the landing (Ch 9): 1 = no hip sway (dunkTracker landingStability), the knees' absorb, lateral drift
  landingStability: { min: 0, max: 1 },
  absorbCm: { min: 0, max: MAX_HIP_DROP_CM },
  landingDriftCm: { min: -MAX_DRIFT_CM, max: MAX_DRIFT_CM },
  // the shot: release − the top of the jump, the wrist above the nose at the set point, the elbow out from under
  // the ball, the gooseneck held, the dip
  releaseVsApexMs: { min: -MAX_TIMING_MS, max: MAX_TIMING_MS },
  setPointCm: { min: -MAX_LIMB_OFFSET_CM, max: MAX_LIMB_OFFSET_CM },
  elbowOutCm: { min: 0, max: MAX_LIMB_OFFSET_CM },
  followThroughMs: { min: 0, max: MAX_HOLD_MS },
  dipCm: { min: 0, max: MAX_HIP_DROP_CM },
  // a strike: back to the guard, hips ahead of the wrist (+ = hips first), the hips' turn, the elbow's peak angle,
  // the hand's peak speed, a kick's chamber (knee vs hip)
  guardReturnMs: { min: 0, max: MAX_HOLD_MS },
  hipLeadMs: { min: -MAX_TIMING_MS, max: MAX_TIMING_MS },
  hipTurnDeg: { min: 0, max: 180 },
  extensionDeg: { min: 0, max: 180 },
  handSpeedMps: { min: 0, max: MAX_HAND_SPEED_MPS },
  chamberCm: { min: -MAX_LIMB_OFFSET_CM, max: MAX_LIMB_OFFSET_CM },
  // a board: the crouch (countermovement / tuck depth) and how long the tuck was held
  crouchCm: { min: 0, max: MAX_HIP_DROP_CM },
  tuckHeldMs: { min: 0, max: MAX_HOLD_MS },
} as const satisfies Record<string, ReadSpec>;

export type ReadKey = keyof typeof READ_SPECS;

export const FORM_ATTEMPT_KINDS = ['jump', 'shot', 'strike', 'board'] as const;
/**
 * jump = any jump that is not a shot or a board pop (a dunk, a pogo, a hop); shot = a jumper, layup or set shot;
 * strike = a punch or kick (or a round's read of them); board = a board or run landing. Only a 'jump' in a dunk session
 * feeds PRQ power (POWER_SESSION_MODES): a jumper, an ollie or a drill's pogo is not a max effort, and a vertical
 * test's scale ("standing vertical", scanToSnapshot) assumes one.
 */
export type FormAttemptKind = typeof FORM_ATTEMPT_KINDS[number];

/** The book's four reads (penultimate, arm swing timing, knee drive, jump height): a dunk's, and a layup's too. */
const BOOK_READS = ['heightCm', 'flightMs', 'penultimateDropCm', 'penultimateContactMs', 'armLowVsPenultMs', 'armSwingMs', 'kneeDriveCm'] as const;

/** Which reads each kind carries. Every one is present on a bounded attempt: a number, or null (unread). */
export const KIND_READS = {
  jump: [...BOOK_READS, 'landingStability', 'absorbCm'],
  // a shot is a jumper, a set shot or a LAYUP, and "layups and dunks use the book's four reads" (map:hoops-shooting-
  // input §6): a jumper leaves the approach reads unread
  shot: [...BOOK_READS, 'releaseVsApexMs', 'setPointCm', 'elbowOutCm', 'followThroughMs', 'dipCm', 'landingDriftCm', 'landingStability'],
  strike: ['guardReturnMs', 'hipLeadMs', 'hipTurnDeg', 'extensionDeg', 'handSpeedMps', 'chamberCm'],
  board: ['heightCm', 'flightMs', 'crouchCm', 'tuckHeldMs', 'absorbCm', 'landingStability'],
} as const satisfies Record<FormAttemptKind, readonly ReadKey[]>;

export type ReadsOf<K extends FormAttemptKind> = { [R in (typeof KIND_READS)[K][number]]: number | null };
export type Takeoff = 'one' | 'two';

interface AttemptOf<K extends FormAttemptKind> {
  kind: K;
  /** The game's name for it ('WINDMILL', 'JUMPER', 'CROSS', 'OLLIE'), or null. */
  label: string | null;
  /**
   * Whose body it was, in a mode that hands the camera over (SHARED_CAMERA_MODES: Dunk Duel's P1 / P2); null in a
   * one-body mode. The server keeps only the signed-in player's (ACCOUNT_PLAYER) attempts from a shared camera.
   */
  player: 1 | 2 | null;
  /** Did the game count it (the dunk made, the shot in)? null when the game had no outcome for it. */
  made: boolean | null;
  /** One-foot or two-foot take-off; null when unread or the kind does not leave the floor. */
  takeoff: Takeoff | null;
  reads: ReadsOf<K>;
}

export type FormAttempt = { [K in FormAttemptKind]: AttemptOf<K> }[FormAttemptKind];

export interface FormSummary {
  v: typeof FORM_SUMMARY_VERSION;
  /** The mode that produced it. On the server this is the session's mode: the record's key is the session's. */
  mode: string;
  /** Attempts the reader saw this session; can exceed attempts.length when the list was capped. */
  attemptCount: number;
  attempts: FormAttempt[];
}

// ── the bound ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Attempts kept per session. A 3PT run is 25 balls (RACKS 5 × BALLS_PER_RACK 5, ThreePointMode.ts:81-82) and a
 * playoff re-shoots a rack; 40 keeps a run and three playoff racks, and bounds a broken client to 40 history rows.
 */
export const MAX_FORM_ATTEMPTS = 40;
/** A count past this is a broken client, not a sitting: 1000 attempts is ~17 minutes at one a second without a break. */
export const MAX_COUNTED_ATTEMPTS = 1000;
/**
 * A label is a move's name. The longest in the game is a named chain, 'FAKE BEHIND THE BACK BETWEEN THE LEGS' (37,
 * DunkSystem.ts NAMED dunks); 48 leaves room for one more word and still refuses a sentence.
 */
export const MAX_LABEL_CHARS = 48;
const LABEL_OK = /^[A-Za-z0-9][A-Za-z0-9 '&+\-]*$/;
/**
 * Modes where two people share one camera: Dunk Duel is pass-and-play, "Player 1 dunks, hands the device over, Player 2
 * answers" (DunkDuelMode.ts header; the plan: "one body at a time. Dunk Duel hands the camera over"). Only one of those
 * bodies is the signed-in player's, so an attempt there must say whose it was.
 */
export const SHARED_CAMERA_MODES: readonly string[] = ['dunkduel'];
/** The signed-in player in a shared-camera mode: P1, who starts the duel on their own device. */
export const ACCOUNT_PLAYER = 1;

export interface BoundResult {
  /** null when nothing usable arrived (no form, or no attempt survived). */
  form: FormSummary | null;
  /** What was refused and why, for the log: a broken form never costs the session. */
  issues: string[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function boundRead(key: ReadKey, raw: unknown, issues: string[], at: string): number | null {
  if (raw === null || raw === undefined) return null;
  const v = typeof raw === 'number' ? raw : NaN;
  const { min, max } = READ_SPECS[key];
  if (!Number.isFinite(v) || v < min || v > max) {
    issues.push(`${at}.${key}: out of range`);
    return null;
  }
  return round2(v);
}

function boundLabel(raw: unknown, issues: string[], at: string): string | null {
  if (raw === null || raw === undefined) return null;
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s.length > 0 && s.length <= MAX_LABEL_CHARS && LABEL_OK.test(s)) return s;
  issues.push(`${at}.label: not a move's name`);
  return null;
}

/** The two reads that are one measurement: a height is only a jump beside the flight that produced it. */
const JUMP_PAIR = ['heightCm', 'flightMs'] as const;

/**
 * Is a (height, flight) pair one jump? The flight the height implies must sit within FLIGHT_SLACK_MS of the flight
 * sent. BodyReader's 'land' event derives the height from the flight (g·t²/8), so an honest pair passes exactly;
 * a hip-rise height beside a flight time, or a doctored height, does not.
 */
export function jumpConsistent(heightCm: number, flightMs: number): boolean {
  return Math.abs(flightMsForHeight(heightCm) - flightMs) <= FLIGHT_SLACK_MS;
}

function boundAttempt(raw: unknown, i: number, issues: string[], sharedCamera: boolean): FormAttempt | null {
  const at = `attempts[${i}]`;
  if (!raw || typeof raw !== 'object') { issues.push(`${at}: not an object`); return null; }
  const a = raw as Record<string, unknown>;
  const kind = a.kind as FormAttemptKind;
  if (!FORM_ATTEMPT_KINDS.includes(kind)) { issues.push(`${at}: unknown kind`); return null; }

  // From a shared camera only the signed-in player's body is theirs: another person's jump is neither their history
  // nor their PRQ, and an untagged attempt cannot be told apart, so it is dropped too.
  const player = a.player === 1 || a.player === 2 ? a.player : null;
  if (sharedCamera && player !== ACCOUNT_PLAYER) {
    issues.push(`${at}: ${player === null ? 'no player on a shared camera' : `player ${player} is not the signed-in player`}`);
    return null;
  }

  const src = (a.reads && typeof a.reads === 'object' ? a.reads : {}) as Record<string, unknown>;
  const reads: Record<string, number | null> = {};
  for (const key of KIND_READS[kind]) reads[key] = boundRead(key, src[key], issues, at);
  for (const key of Object.keys(src)) {
    if (!(KIND_READS[kind] as readonly string[]).includes(key)) issues.push(`${at}.${key}: not a ${kind} read`);
  }

  if ('heightCm' in reads) {
    const sent = (k: typeof JUMP_PAIR[number]) => src[k] !== null && src[k] !== undefined;
    // half of a broken pair is not a measurement: a height sent beside an impossible flight (or the reverse) goes
    // unread with it, rather than surviving as a lone number the pair already disproved
    const broken = JUMP_PAIR.some((k) => sent(k) && reads[k] === null);
    // a height and a flight that disagree are not one jump: both become unread
    const disagree = !broken && reads.heightCm !== null && reads.flightMs !== null && !jumpConsistent(reads.heightCm, reads.flightMs);
    if (broken || disagree) {
      if (disagree) issues.push(`${at}: height and flight disagree`);
      reads.heightCm = null;
      reads.flightMs = null;
    }
  }

  const leaves = kind !== 'strike';
  const takeoff = leaves && (a.takeoff === 'one' || a.takeoff === 'two') ? a.takeoff : null;
  return {
    kind,
    label: boundLabel(a.label, issues, at),
    player: sharedCamera ? player : null,
    made: typeof a.made === 'boolean' ? a.made : null,
    takeoff,
    reads,
  } as FormAttempt;
}

/**
 * The server's bound on a client's `form`. Every read is a finite number inside what a body produces, or null; a
 * height must agree with its flight (g·t²/8), and half of a broken pair goes with it; attempts are capped at
 * MAX_FORM_ATTEMPTS; the mode is the session's; another version is refused; on a shared camera only the signed-in
 * player's attempts are kept.
 */
export function boundFormSummary(raw: unknown, opts: { mode: string }): BoundResult {
  const issues: string[] = [];
  if (raw === undefined || raw === null) return { form: null, issues };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { form: null, issues: ['form: not an object'] };
  const f = raw as Record<string, unknown>;
  // another version's numbers may mean other units: read as this one's, a height in metres would be a 0.6 cm jump
  if (f.v !== undefined && f.v !== FORM_SUMMARY_VERSION) return { form: null, issues: [`form.v: ${String(f.v)} is not ${FORM_SUMMARY_VERSION}`] };
  const list = Array.isArray(f.attempts) ? f.attempts : [];
  if (!Array.isArray(f.attempts)) issues.push('form.attempts: not a list');
  if (list.length > MAX_FORM_ATTEMPTS) issues.push(`form.attempts: ${list.length} capped to ${MAX_FORM_ATTEMPTS}`);

  const sharedCamera = SHARED_CAMERA_MODES.includes(opts.mode);
  const attempts: FormAttempt[] = [];
  list.slice(0, MAX_FORM_ATTEMPTS).forEach((r, i) => {
    const a = boundAttempt(r, i, issues, sharedCamera);
    if (a) attempts.push(a);
  });
  if (!attempts.length) return { form: null, issues };

  const stated = typeof f.attemptCount === 'number' && Number.isFinite(f.attemptCount) ? Math.floor(f.attemptCount) : 0;
  // a shared camera's stated count covers both bodies and cannot be split: the player's count is what was kept
  const attemptCount = sharedCamera
    ? attempts.length
    : Math.min(MAX_COUNTED_ATTEMPTS, Math.max(stated, list.length, attempts.length));
  return { form: { v: FORM_SUMMARY_VERSION, mode: opts.mode, attemptCount, attempts }, issues };
}

/** Did the reader read anything? One non-null read on one attempt is the body having played (phase 3: body input counts). */
export function formHasReads(form: FormSummary | null): boolean {
  return !!form?.attempts.some((a) => Object.values(a.reads).some((v) => v !== null));
}

// ── PRQ power, from the best measured jump ───────────────────────────────────────────────────────────────────────

/** The MEASUREMENTS key whose range maps a jump onto power (scanToSnapshot: 12–40 in, "standing vertical"). */
export const POWER_MEASUREMENT_KEY = 'verticalJump';
/** The PRQ attribute a measured jump is written to. */
export const CAMERA_POWER_ATTR: PrqAttr = 'power';
export const CM_PER_IN = 2.54;
/** Only a jump meant to be maximal feeds power (see FormAttemptKind). */
export const POWER_JUMP_KINDS: readonly FormAttemptKind[] = ['jump'];
/** Shell mode ids of the dunk contests (app/play/dunk and dunkduel loaders' GameShell `mode`). */
export const DUNK_SESSION_MODES: readonly string[] = ['dunkContest', 'dunkduel'];
/**
 * The sessions whose 'jump' is the player's own max take-off: the dunk contests, where "the real take-off, on one foot
 * or two, sets the height" (the plan, phase 5). The kind alone cannot say it, because every jump is a 'jump': the
 * drills' pogos (lib/drills/drills.ts, ~11 cm contacts), a hoops contest or block, a warm-up hop. Scored on the
 * "standing vertical" scale those would drag power toward 0 for moving well, so they go to history only.
 */
export const POWER_SESSION_MODES: readonly string[] = DUNK_SESSION_MODES;

export interface MeasuredJump {
  attempt: number;
  /** The height PRQ is credited with: the lower of the height sent and the one its flight implies (g·t²/8). */
  heightCm: number;
  flightMs: number;
}

/**
 * The session's best measured jump: a 'jump' attempt, in a POWER_SESSION_MODES session, with BOTH a height and a
 * flight (after the bound, a pair that agrees). A height alone cannot be cross-checked, so it goes to history but never
 * to PRQ. The flight is the measurement: inside FLIGHT_SLACK_MS a height could still claim 46 % more than its flight
 * at 0.4 s (36 % at 0.5 s), so PRQ takes the lower of the two (an honest pair, height = g·t²/8 of the flight, is unchanged).
 */
export function bestMeasuredJump(form: FormSummary | null): MeasuredJump | null {
  if (!form || !POWER_SESSION_MODES.includes(form.mode)) return null;
  let best: MeasuredJump | null = null;
  for (const [i, a] of form.attempts.entries()) {
    if (!POWER_JUMP_KINDS.includes(a.kind) || !('heightCm' in a.reads)) continue;
    const { heightCm, flightMs } = a.reads;
    if (heightCm === null || flightMs === null) continue;
    const credited = round2(Math.min(heightCm, heightCmForFlight(flightMs)));
    if (!best || credited > best.heightCm) best = { attempt: i + 1, heightCm: credited, flightMs };
  }
  return best;
}

/**
 * A jump onto the power axis through the EXISTING mapping (scanToSnapshot MEASUREMENTS.verticalJump), so a camera
 * jump and a typed-in vertical read the same: power = clamp(round((in − 12) / (40 − 12) × 100), 0, 100), in = cm / 2.54.
 * Stored as unit 'score' because computeTraceablePrq averages the latest values across units (map:irl-form §4).
 */
export function powerFromJumpCm(heightCm: number): number | null {
  const m = measurementFor(POWER_MEASUREMENT_KEY);
  return m ? axisValue(m, heightCm / CM_PER_IN) : null;
}

// ── the rows the session writes ──────────────────────────────────────────────────────────────────────────────────

/** WorkoutScan.kind per attempt kind. The column is a free string (schema.prisma WorkoutScan.kind): no migration. */
export const FORM_SCAN_KINDS = { jump: 'jump', shot: 'shot_form', strike: 'strike_form', board: 'board_form' } as const satisfies Record<FormAttemptKind, string>;
/** The Mirror's dunk history kind (app/api/mirror/dunks). A body dunk with a measured jump joins that ladder. */
export const DUNK_SCAN_KIND = 'dunk';
/** The Mirror's families (app/api/mirror/dunks FAMILIES); anything else is stored as 'ATTEMPT', as that route does. */
const MIRROR_FAMILIES: readonly DunkFamily[] = ['BETWEEN-THE-LEGS', 'WINDMILL', '360', 'TOMAHAWK', 'ONE-HAND JAM', 'TWO-HAND JAM', 'ATTEMPT'];
/**
 * Families the GAME finishes for a body player, so the body never did them: "a spin starts with a real quarter-turn and
 * the game finishes it" (the plan, Safety; "What the game still infers"). The ladder's 360 rung asks for "a full turn
 * and still finding the rim" (dunkProgress FAMILY_ASK), so a game-finished one joins the history as an ATTEMPT (its
 * height still counts; the game's name stays in `label`) and does not climb the rung.
 */
export const GAME_FINISHED_FAMILIES: readonly DunkFamily[] = ['360'];

export function familyOf(label: string | null): DunkFamily {
  const up = (label ?? '').toUpperCase();
  const f = MIRROR_FAMILIES.find((m) => m === up || m.replace(/-/g, ' ') === up) ?? 'ATTEMPT';
  return GAME_FINISHED_FAMILIES.includes(f) ? 'ATTEMPT' : f;
}

/**
 * Which WorkoutScan kind an attempt is stored as. A dunk-contest jump with a measured height AND flight joins the
 * Mirror's 'dunk' history, whose reader turns a missing height into 0 ("Number(m.verticalCm) || 0"); so an unread
 * one goes to 'jump' instead, where nothing reads an absence as a number.
 */
export function scanKindFor(a: FormAttempt, sessionMode: string): string {
  if (a.kind === 'jump' && DUNK_SESSION_MODES.includes(sessionMode) && a.reads.heightCm !== null && a.reads.flightMs !== null) {
    return DUNK_SCAN_KIND;
  }
  return FORM_SCAN_KINDS[a.kind];
}

export interface FormScanRow { userId: string; kind: string; metrics: Record<string, unknown> }

export interface FormWritePlan {
  scans: FormScanRow[];
  /** ONE power entry per session at most, from the best measured jump; null when no jump was measured. */
  power: CreatePrqEntryInput | null;
  best: MeasuredJump | null;
}

/** What the session writes for a bounded form: one history row per attempt, and at most one camera power entry. */
export function planFormWrite(form: FormSummary, ctx: { userId: string; sessionId: string; measuredAt: Date }): FormWritePlan {
  const scans = form.attempts.map((a, i): FormScanRow => {
    const kind = scanKindFor(a, form.mode);
    const metrics: Record<string, unknown> = {
      v: form.v,
      source: PRQ_CAMERA_SOURCE,
      mode: form.mode,
      sessionId: ctx.sessionId,
      attempt: i + 1,
      attemptCount: form.attemptCount,
      kind: a.kind,
      label: a.label,
      player: a.player,
      made: a.made,
      takeoff: a.takeoff,
      reads: { ...a.reads },
    };
    // the Mirror's dunk history reads these names (app/api/mirror/dunks GET)
    if (kind === DUNK_SCAN_KIND && a.kind === 'jump') {
      metrics.verticalCm = a.reads.heightCm;
      metrics.flightTimeMs = a.reads.flightMs === null ? null : Math.round(a.reads.flightMs);
      metrics.family = familyOf(a.label);
    }
    return { userId: ctx.userId, kind, metrics };
  });

  const best = bestMeasuredJump(form);
  const value = best ? powerFromJumpCm(best.heightCm) : null;
  const power: CreatePrqEntryInput | null = best && value !== null
    ? { userId: ctx.userId, attribute: CAMERA_POWER_ATTR, value, unit: 'score', source: PRQ_CAMERA_SOURCE, measuredAt: ctx.measuredAt, sessionId: ctx.sessionId }
    : null;
  return { scans, power, best };
}

// ── one power reading ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The attributes a session's GAME-derived PrqEntries (source 'drillResult') are written for, given what the camera
 * said about power.
 *
 * REVIEW (2026-09-24, D2): ONE POWER READING. A drillResult row carries PlayerProfile's counter (power is seeded 40-70
 * and moves by prqDelta); a camera row maps a jump onto the standing-vertical axis (a 50 cm jump reads 27). Two
 * scales, and every latest-wins reader (the PRQ vector, the coach's prqSnapshots, the camp delta) takes whichever row
 * is newest. Written side by side, one dunk session made two snapshots 1 ms apart and an 11-point composite drop,
 * which fired the coach's "readiness down"; the next hoops or soccer session flipped power back to the counter. So:
 *   · a session that measured a jump writes no drillResult power: the camera row is its one power reading;
 *   · once a camera power reading is on file, later game sessions write no drillResult power either, so a run in any
 *     mode that trains power leaves the measured number standing (the plan, phase 10: "PRQ moves only from measured
 *     jumps").
 * PlayerProfile.power still moves with play (prqBefore / prqAfter read it): it is the game's number, not a PRQ row.
 * Every other attribute is untouched.
 */
export function gameRowAttrs(modeAttrs: readonly string[], camera: { measuredNow: boolean; onFile: boolean }): string[] {
  return camera.measuredNow || camera.onFile ? modeAttrs.filter((a) => a !== CAMERA_POWER_ATTR) : [...modeAttrs];
}
