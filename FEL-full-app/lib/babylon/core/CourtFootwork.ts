// CourtFootwork — GETTING TO THE BALL (2026-09-13).
//
// NetSportMode's own header records the hole this fills, in its own words:
//
//     "Aces also has Zone Speed and a trick-shot dash; both exist to help you REACH a ball, and this mode has
//      no player positioning to reach with, so they are recorded as out of scope rather than faked."
//
// That is the honest note of a real gap. Tennis with no feet is a timing minigame: the ball always arrives
// exactly where you are standing, every rally is decided by one button press per exchange, and the opponent's
// placement — which RallyCore.planShot computes carefully, with depth and angle and a short ball when you
// mistime — lands on nothing, because you are always in the right place anyway.
//
// So this is the missing half of the rally: WHERE YOU ARE. The opponent's shot now has somewhere to go that
// you are not, and the point becomes a negotiation about court position rather than a reaction test.
//
// Three things make that a sport rather than a chore, and all three are in here:
//
//   THE SPLIT STEP. A tennis player hops just before the opponent strikes and lands as they hit, so the
//     landing loads both legs and the first step can go either way. Time it well and your first step is
//     genuinely faster. This is the highest-skill, lowest-visibility mechanic in tennis, and it is the one
//     thing that makes footwork feel like technique rather than holding a stick.
//   THE STRETCH. A ball you only just reach can still be played, but not well — the shot goes back short
//     and the opponent gets an attackable ball. That is the whole reason to move your feet EARLY.
//   RECOVERY. After you hit, you move back — not to the middle of the court, but to the bisector of the
//     angles the opponent can now hit into. Recovering to the middle after a wide shot is the most common
//     mistake a club player makes, and modelling the bisector is what makes hitting a sharp angle pay.
//
// Pure: no Babylon. Everything here is provable without a scene.

/** How a body moves on a court, in metres and seconds. */
export interface FootworkModel {
  /** Top lateral speed, m/s. */
  topSpeed: number;
  /** How hard it gets there, m/s². */
  accel: number;
  /** How hard it stops. Higher than accel: stopping is easier than starting. */
  decel: number;
  /** Half the court's width — the player is clamped a little past it. */
  halfWidth: number;
  /** How far past the sideline a player may chase a wide ball. */
  overrun: number;
}

/**
 * Tennis.
 *
 * topSpeed 6.0 m/s is a real number for a pro moving laterally, and it is the number the rest has to be
 * sized against: the court is 11 m wide (TENNIS.halfWidth 5.5), a full-width sprint is therefore ~1.8 s at
 * top speed, and TENNIS.baseFlightTime is 1.05 s. So a ball hit corner to corner CANNOT be reached from a
 * standing start on the far side — which is exactly right, and is what makes court position matter. From a
 * good recovery position near the middle the same ball is ~0.9 s away: reachable, but only just, and only
 * if you moved on the strike rather than after it.
 */
export const TENNIS_FOOTWORK: FootworkModel = {
  topSpeed: 6.0, accel: 21, decel: 28, halfWidth: 5.5, overrun: 1.6,
};

/** Volleyball: a smaller court and a shorter run, so a lower top speed reads as more urgent, not slower. */
export const VOLLEY_FOOTWORK: FootworkModel = {
  topSpeed: 5.2, accel: 24, decel: 30, halfWidth: 4.5, overrun: 1.0,
};

export interface FootworkState {
  /** Lateral position on the baseline, metres from the centre mark. */
  x: number;
  /** Lateral velocity, m/s. */
  vx: number;
  /** Seconds since the split step was taken; Infinity if it has not been. */
  sinceSplit: number;
  /** Seconds since the opponent struck the ball; Infinity between points. */
  sinceOppStrike: number;
}

export const FOOTWORK_IDLE: FootworkState = { x: 0, vx: 0, sinceSplit: Infinity, sinceOppStrike: Infinity };

// ── The split step ─────────────────────────────────────────────────────────
/**
 * How long before the opponent's strike the hop has to leave the ground.
 *
 * You land AS they hit, so the step is taken slightly before. The window is generous on the early side and
 * tight on the late side, because hopping early only costs you a little (you land and wait) while hopping
 * late costs you everything (you are in the air, unloaded, when you needed to push).
 */
export const SPLIT_EARLY_SEC = 0.42;
export const SPLIT_LATE_SEC = 0.08;
/** The first-step boost a well-timed split step buys, as a multiplier on acceleration. */
export const SPLIT_BOOST = 1.45;
/** How long the boost lasts after the landing — one push, not a permanent buff. */
export const SPLIT_BOOST_SEC = 0.55;

/**
 * Was this split step timed against the opponent's strike?
 *
 * `lead` is how long BEFORE the strike the hop was taken. Negative means it was taken after, which is not a
 * split step, it is a stumble.
 */
export function splitTimed(lead: number): boolean {
  return lead <= SPLIT_EARLY_SEC && lead >= -SPLIT_LATE_SEC;
}

/** Is the boost live right now? */
export function splitBoostActive(s: FootworkState): boolean {
  return s.sinceSplit >= 0 && s.sinceSplit <= SPLIT_BOOST_SEC;
}

// ── Moving ─────────────────────────────────────────────────────────────────
/**
 * One frame of footwork.
 *
 * `intent` is the stick, −1..1. Releasing the stick DECELERATES rather than stopping dead — a body has
 * momentum, and a player who can stop instantly never gets wrong-footed, which removes the point of hitting
 * behind them.
 */
export function stepFootwork(s: FootworkState, intent: number, dt: number, m: FootworkModel): FootworkState {
  const want = Math.max(-1, Math.min(1, intent)) * m.topSpeed;
  const boost = splitBoostActive(s) ? SPLIT_BOOST : 1;
  // accelerating toward the intent, or decelerating toward rest — two different rates, and turning ROUND
  // counts as accelerating (the sign flip is why a wrong-footed player is slow: they must kill vx first)
  const rate = (want === 0 || Math.sign(want) !== Math.sign(s.vx || want)) ? m.decel : m.accel * boost;
  const dv = want - s.vx;
  const step = Math.sign(dv) * Math.min(Math.abs(dv), rate * dt);
  const vx = s.vx + step;
  const limit = m.halfWidth + m.overrun;
  let x = s.x + vx * dt;
  let clamped = vx;
  if (x > limit) { x = limit; clamped = Math.min(0, vx); }
  if (x < -limit) { x = -limit; clamped = Math.max(0, vx); }
  return {
    x, vx: clamped,
    sinceSplit: s.sinceSplit + dt,
    sinceOppStrike: s.sinceOppStrike + dt,
  };
}

// ── The stretch ────────────────────────────────────────────────────────────
/** Inside this, the ball is in your strike zone and costs nothing. */
export const COMFORT_M = 0.85;
/** Past this you cannot touch it at all, however well you timed the swing. */
export const MAX_REACH_M = 2.4;

/** How far the ball is from the body when it arrives. */
export function reachOf(playerX: number, ballX: number): number {
  return Math.abs(ballX - playerX);
}

/** Can this ball be played at all? */
export function canReach(reach: number): boolean {
  return reach <= MAX_REACH_M;
}

/**
 * What the stretch costs, 0..1 — 1 is a clean strike from the middle of the stance, 0 is unreachable.
 *
 * Linear between COMFORT_M and MAX_REACH_M rather than a cliff, so the player can FEEL themselves getting
 * late. A cliff would read as the ball randomly going dead.
 */
export function reachQuality(reach: number): number {
  if (reach <= COMFORT_M) return 1;
  if (reach >= MAX_REACH_M) return 0;
  return 1 - (reach - COMFORT_M) / (MAX_REACH_M - COMFORT_M);
}

/**
 * Degrade a swing grade by how stretched the player was.
 *
 * A PERFECT swing at full stretch is not a perfect shot — you got your racket on it, which is not the same
 * as hitting it. This is what stops footwork being cosmetic: the timing game and the position game multiply
 * rather than sitting side by side.
 */
export type SwingGrade = 'perfect' | 'good' | 'early' | 'late' | 'miss';
export function gradeAfterStretch(grade: SwingGrade, reach: number): SwingGrade {
  if (grade === 'miss') return 'miss';
  const q = reachQuality(reach);
  if (q <= 0) return 'miss';               // never got there
  if (q >= 0.99) return grade;             // in the stance: the timing stands
  const order: SwingGrade[] = ['perfect', 'good', 'late', 'miss'];
  const drop = q < 0.4 ? 2 : 1;            // a real stretch costs two steps, a lean costs one
  const i = order.indexOf(grade === 'early' ? 'late' : grade);
  return order[Math.min(order.length - 1, (i < 0 ? 1 : i) + drop)];
}

// ── Recovery ───────────────────────────────────────────────────────────────
/**
 * Where you should stand next, given where your own shot landed.
 *
 * The bisector: from where the ball is on the opponent's side, they can hit to either of your corners, and
 * the point equidistant from both is the middle of THAT angle — not the middle of the court. Hit a sharp
 * cross-court and the correct recovery is shaded that way; stand in the middle instead and the down-the-line
 * reply is a winner.
 *
 * `ballX` is where your shot landed on their side, `halfWidth` your court's half-width. The result is the
 * lateral position to recover to, and it always shades TOWARD the side you hit to, which is the non-obvious
 * part club players get wrong.
 */
export function recoveryX(ballX: number, halfWidth: number): number {
  // their two extreme replies land at ±halfWidth on your side; the angle bisector from their position is
  // approximated by shading a fraction of the way toward their side of the court
  const shade = Math.max(-1, Math.min(1, ballX / Math.max(0.001, halfWidth)));
  return shade * halfWidth * RECOVERY_SHADE;
}
/** How far toward the ball's side the recovery point shades. Measured against the geometry above. */
export const RECOVERY_SHADE = 0.28;

/**
 * How far out of position a player is, 0..1 — 0 is perfectly recovered, 1 is stranded in a corner.
 *
 * A mode can pay a small bonus for hitting into the space this describes, which is how "opening up the
 * court" becomes something the scoring notices rather than only something the geometry implies.
 */
export function outOfPosition(playerX: number, idealX: number, halfWidth: number): number {
  return Math.max(0, Math.min(1, Math.abs(playerX - idealX) / Math.max(0.001, halfWidth * 2)));
}

/**
 * Where the opponent should aim to hurt you most: into the space you have left.
 *
 * Used by the AI so a rally punishes bad recovery. It aims into the open side, but not all the way to the
 * line — a shot to the very line is a low-percentage shot, and an AI that always hits it is not playing
 * tennis, it is cheating.
 */
export const AI_LINE_SAFETY = 0.82;
export function aiTargetX(playerX: number, halfWidth: number, aggression = 1): number {
  const openSide = playerX >= 0 ? -1 : 1;                     // away from where they are
  const commitment = Math.max(0, Math.min(1, aggression)) * Math.min(1, Math.abs(playerX) / halfWidth + 0.35);
  return openSide * halfWidth * AI_LINE_SAFETY * commitment;
}
