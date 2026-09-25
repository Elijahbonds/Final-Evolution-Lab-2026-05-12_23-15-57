// bodyProfiles — what the body presses, mode by mode (movement play P3, 2026-09-24).
//
// The P1 mapper (lib/input/poseControl.ts) was one table for every game: a hip rise was A, a dip was R2, the hips'
// height was the L stick's y. So a dunk launched on the rise and slammed TOO EARLY, a 3v3 jump was a pass, a jab was a
// KICK, and standing still held every stick at full back (BASELINE.md). The seam replaces the table with ONE ROW PER
// MODE, keyed by the def.modeId the harness knows (the registry key rides along for MODE_VERBS and the drift test):
//
//   bindings   the moves the floor (lib/input/bodyFloor.ts) turns into ordinary FelInput for that mode — nine modes in
//              P3, each with a reason in the plan's table. [] = SESSION-ONLY: the camera starts and pauses the game
//              (both hands up = START, stepping out = pause) and presses nothing. A binding exists only where the
//              move means the verb in that mode AND the mode reads that button that way in every phase the floor
//              can reach (the dunk's A is the slam at the apex, so the dunk binds nothing until P5 grades it there).
//   verb       what the card says the move does: the MODE_VERBS label of the slot that emits that button or trigger
//              (POP, TUCK, JAB …), or a FREE_VERB for a stick / d-pad the touch deck never labels. Never a letter.
//   later      the plan phase that gives the mode its real body play (P5 dunk, P6 hoops, P7 combat, P8 boards and
//              racing, P9 dance, L = no phase yet, null = never: the body does not answer a quiz).
//
// A mode that owns its floor later (P5+) passes `body.profile`, or `body.claims` to take a move for its own onBody:
// resolveBodyProfile drops every binding whose move is claimed, so a move is never pressed twice.
// Pure data: no DOM, no Babylon.
import type { BodyEventKind } from '@/lib/pose/BodyReader';
import type { CardLine } from '@/lib/babylon/core/sessionStore';

export type FaceButton = 'A' | 'B' | 'X' | 'Y';                      // P3 binds only A and B
export const FREE_VERBS = ['STEER', 'RUN', 'STRIDE'] as const;       // controls the touch deck doesn't label
export type FreeVerb = (typeof FREE_VERBS)[number];
export type BodyBinding =
  | { from: 'lean'; to: 'Lx'; verb: FreeVerb }
  | { from: 'cadence'; to: 'Ly'; verb: FreeVerb }                    // forward = −y
  | { from: 'squat'; to: 'RT' | 'LT'; verb: string }                 // = MODE_VERBS label of the slot emitting that trigger
  | { from: 'takeoff' | 'punch' | 'kick'; to: FaceButton; verb: string }   // = MODE_VERBS label of that slot
  | { from: 'step'; to: 'dpadByFoot'; verb: FreeVerb };               // foot L → ◀, R → ▶ (pulses)

export interface BodyProfile {
  key: string;                    // registry key (MODES, MODE_VERBS)
  modeId: string;                 // def.modeId, what the harness knows
  family: 'dunk' | 'hoops' | 'combat' | 'boards' | 'racing' | 'later' | 'rhythm' | 'quiz';
  bindings: readonly BodyBinding[];   // [] = session verbs only
  overheadIsPlay: boolean;        // reserved for owner call 3(b); P5+ claims set it
  motion: 'merge';                // P4/P8 widen to 'merge' | 'body'
  later: 'P5' | 'P6' | 'P7' | 'P8' | 'P9' | 'L' | null;
}

/**
 * What a mode may claim for itself (ModeHarness's ModeBodySpec, P5+): a body event kind (handed to its onBody) or a
 * channel it reads off ctx.body(). MOVEMENT PLAY P3: declared here, beside the profiles they subtract from, so this
 * step stays off ModeHarness (the harness re-exports them when it learns the body, step 3).
 */
export type BodyChannelName = 'lean' | 'squat' | 'cadence' | 'overhead';
export type BodyClaim = BodyEventKind | BodyChannelName;
/** A mode's own say in its body play (ModeDefinition.body, step 3). */
export interface ModeBodySpec {
  /** Replaces the table row (P5+, when a mode owns its floor). */
  profile?: BodyProfile;
  /** The floor drops every binding whose `from` is claimed; onBody receives the claimed EVENT kinds. 'overhead' ⇒ overheadIsPlay. */
  claims?: readonly BodyClaim[];
  overheadIsPlay?: boolean;
}

export const MOVE_LABEL: Record<BodyBinding['from'], string> =
  { lean: 'Lean', cadence: 'Run in place', squat: 'Crouch', takeoff: 'Jump', punch: 'Punch', kick: 'Kick', step: 'Run in place' };

type Row = Omit<BodyProfile, 'motion'>;
const row = (r: Row): BodyProfile => ({ ...r, motion: 'merge' });
const none = (key: string, modeId: string, family: BodyProfile['family'], later: BodyProfile['later'], overheadIsPlay: boolean): BodyProfile =>
  row({ key, modeId, family, bindings: [], overheadIsPlay, later });

const ROWS: readonly BodyProfile[] = [
  // ── dunk (P5). Every dunk verb is timed against the apex: an RT or an A from the body recreates the baseline (a launch
  //    on the rise, a TOO EARLY slam), and a body d-pad is the prop picker to the `!== 'key'` readers (DunkMode
  //    :1273-1274, DunkDuel's chair :647).
  none('dunk', 'dunk', 'dunk', 'P5', true),
  none('dunkduel', 'dunkduel', 'dunk', 'P5', true),
  // ── hoops (P6). The 3PT release is told ~330 ms late against a timed bar; in 1v1 / 3v3 a dip would be the turbo and a
  //    jump a pass or a block. P6 merges a BodyControlSource into the hoops ControlSource instead.
  none('threepoint', 'threepoint', 'hoops', 'P6', true),
  none('onevone', 'onevone', 'hoops', 'P6', true),
  none('threevthree', 'threevthree', 'hoops', 'P6', true),
  // ── combat (P7). The Hundred's shop reads A as BUY (KarateEndlessMode :1583) and Duel's weapon pick A / B as FISTS /
  //    BLADE (:430-434): session-only. VS and Showdown gate input to `fighting` (:683, :431); Mixed's loadout only
  //    STARTS the round on A / B / Y with the current pick (:751-754), and its resting-stick STAFF pick (:743) cannot
  //    fire (the floor never writes y). R1 and SELECT are never bound.
  none('karate', 'karate', 'combat', 'P7', false),
  row({ key: 'karate_vs', modeId: 'karate-vs', family: 'combat', later: 'P7', overheadIsPlay: false, bindings: [
    { from: 'punch', to: 'A', verb: 'JAB' }, { from: 'kick', to: 'B', verb: 'KICK' },
  ] }),
  row({ key: 'mixedcombat', modeId: 'mixedcombat', family: 'combat', later: 'P7', overheadIsPlay: false, bindings: [
    { from: 'punch', to: 'A', verb: 'STRIKE' }, { from: 'kick', to: 'B', verb: 'KICK' },
  ] }),
  row({ key: 'showdown', modeId: 'showdown', family: 'combat', later: 'P7', overheadIsPlay: false, bindings: [
    { from: 'punch', to: 'A', verb: 'JAB' }, { from: 'kick', to: 'B', verb: 'KICK' },
  ] }),
  none('duel', 'duel', 'combat', 'P7', false),
  // ── boards (P8). The floor holds the gather's peak squat on RT until the hop's A has gone, so SkateRun's
  //    max(pump, pumpReleased) at A (:133) and the snowboard's jump(0.5 + tuck·0.5) (:258-262) read the dip's depth.
  //    y is never written: the skater coasts instead of braking forever, the surfer stops climbing the face.
  row({ key: 'skateboard', modeId: 'skateboard', family: 'boards', later: 'P8', overheadIsPlay: false, bindings: [
    { from: 'lean', to: 'Lx', verb: 'STEER' }, { from: 'squat', to: 'RT', verb: 'PUMP' }, { from: 'takeoff', to: 'A', verb: 'POP' },
  ] }),
  row({ key: 'snowboard_slalom', modeId: 'snowboard', family: 'boards', later: 'P8', overheadIsPlay: false, bindings: [
    { from: 'lean', to: 'Lx', verb: 'STEER' }, { from: 'squat', to: 'RT', verb: 'TUCK' }, { from: 'takeoff', to: 'A', verb: 'JUMP' },
  ] }),
  // no crouch: RT is the surf's CARVE (trim and pump come in P8)
  row({ key: 'surf', modeId: 'surf', family: 'boards', later: 'P8', overheadIsPlay: false, bindings: [
    { from: 'lean', to: 'Lx', verb: 'STEER' }, { from: 'takeoff', to: 'A', verb: 'AIR' },
  ] }),
  // SPIN (A) is unbound. MOVEMENT PLAY P3 (2026-09-24, the step-2 review): the floor suppresses steps only while the
  // BODY is in the air (channels.inJump), not through the game's own 'Air' phase — and there AirSessionMode :306 turns
  // every stride's d-pad into setSpinDir, so a player still running in place while the skier flies flips the spin's
  // direction every step (it matters in hybrid play, a pad pressing SPIN). Outside 'Run' each step is a WAIT FOR THE
  // RUN-UP refusal, so a jog before the run-up or after the landing repeats it. Both are costs of the P3 row (the floor
  // cannot see the game's phase; P7's reserved accepts() and P8's BodyDrive can): the step-3 live probe watches the
  // refusal count, and the card copy owns up to it if it stays.
  row({ key: 'bigair', modeId: 'bigair', family: 'boards', later: 'P8', overheadIsPlay: false, bindings: [
    { from: 'step', to: 'dpadByFoot', verb: 'STRIDE' },
  ] }),
  // ── racing (P8). Sprint refuses buttons and none are bound (a jog before the gun is a real false start). Free Run: no
  //    lean steer (running in place drifts 0.58 sw), flips stay pad-only — and if the step-3 live probe shows
  //    misfires, this row becomes session-only (owner call 5's cut line). MOVEMENT PLAY P3 (2026-09-24, the step-2
  //    review): Free Run has a 'pick' phase of its own, where A / B / X / Y begin the course on the tier shown
  //    (FreeRunMode :613-619) and ◀ ▶ change it — the row binds no d-pad, so the body cannot pick a tier, and a hop
  //    there starts the run on the current one (as the pick's own 6 s timeout would). Mixed Combat's loadout has the
  //    same shape (R14). The step-3 live probe covers it before the cut line is decided.
  row({ key: 'sprint', modeId: 'sprint', family: 'racing', later: 'P8', overheadIsPlay: false, bindings: [
    { from: 'step', to: 'dpadByFoot', verb: 'STRIDE' },
  ] }),
  row({ key: 'freerun', modeId: 'freerun', family: 'racing', later: 'P8', overheadIsPlay: true, bindings: [
    { from: 'cadence', to: 'Ly', verb: 'RUN' }, { from: 'takeoff', to: 'A', verb: 'JUMP' },
  ] }),
  // a hop would fire an item and a dip would be the throttle: the wheel and the wings are P8 detectors
  none('velocitykart', 'velocitykart', 'racing', 'P8', false),
  none('aeroaces', 'aeroaces', 'racing', 'P8', true),
  // ── no plan phase yet (L)
  none('football', 'football', 'later', 'L', false),
  none('tennis', 'tennis', 'later', 'L', false),
  none('golf', 'golf', 'later', 'L', false),
  none('derby', 'baseball', 'later', 'L', false),
  none('penalty', 'soccer', 'later', 'L', false),
  none('carnival', 'carnival', 'later', 'L', false),
  none('volleyball', 'volleyball', 'later', 'L', true),
  // ── rhythm (P9) and the quizzes (never: the body does not answer a quiz)
  none('dance', 'dance', 'rhythm', 'P9', true),
  none('who_scene_it', 'who_scene_it', 'quiz', null, false),
  none('brainbrawl', 'brainbrawl', 'quiz', null, false),
];

/** Every mode's row, by def.modeId (four differ from their registry key: karate-vs, snowboard, baseball, soccer). */
export const BODY_PROFILES: Readonly<Record<string /* modeId */, BodyProfile>> = Object.freeze(
  Object.fromEntries(ROWS.map((p) => [p.modeId, p])),
);

/** A mode no row names (a new one, a test's): session-only, no plan phase yet. */
export function sessionOnly(modeId: string): BodyProfile {
  return row({ key: modeId, modeId, family: 'later', bindings: [], overheadIsPlay: false, later: 'L' });
}

/** def.body?.profile ?? BODY_PROFILES[def.modeId] ?? sessionOnly(def.modeId), then minus claimed `from`s. */
export function resolveBodyProfile(def: { modeId: string; body?: ModeBodySpec }): BodyProfile {
  const base = def.body?.profile ?? BODY_PROFILES[def.modeId] ?? sessionOnly(def.modeId);
  const claims = def.body?.claims;
  if (!claims?.length) return base;
  const claimed = new Set<string>(claims);
  return { ...base, bindings: base.bindings.filter((b) => !claimed.has(b.from)) };
}

/** The card's move → verb lines: MOVE_LABEL[from] + verb, in binding order. */
export function cardLines(p: BodyProfile): CardLine[] {
  return p.bindings.map((b) => ({ move: MOVE_LABEL[b.from], verb: b.verb }));
}

/**
 * The rest of the card (plan §2.2), for BodyControl to read: a bound mode shows its lines and then the two session
 * lines; a session-only mode, the one sentence; no mode, the other.
 */
export const SESSION_LINES: readonly CardLine[] = [
  { move: 'Raise both hands and hold', verb: 'Start / Resume' },
  { move: 'Step out of frame', verb: 'Pause' },
];
export const SESSION_ONLY_COPY = "This game doesn't read your moves yet. The camera can start and pause it; play with your controller or touch.";
export const NO_MODE_COPY = 'Open a game to see its moves.';
