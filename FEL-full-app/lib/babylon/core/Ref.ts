// THE REF — one place that knows the rules, reading from a handbook (2026-09-12).
//
// Owner's ask: "put a ref that enforces rules via a handbook".
//
// Rule calls were scattered as inline literals across the hoops modes. 1v1 decided a charge in the
// middle of its contact loop; 3v3 decided a board in its own; out of bounds was invented twice on the
// same afternoon with two different consequences. That is exactly why the modes disagreed about what a
// board even MEANS — there was no such thing as "the rule", only each mode's local opinion of it.
//
// So the rules are DATA (the HANDBOOK below) and the Ref is the only thing that reads them. A mode
// reports what physically happened — "the ball left the floor", "a body ran through a set defender",
// "he was hit in the air on a finish" — and gets back a Call: what the ref says, who gets the ball,
// whether play stops, how many shots. The mode's job is to report facts and carry out the call; it no
// longer decides what the rules are.
//
// Pure: no Babylon, no scene, no clock. Every rule in here is provable without a game running, which is
// the point of writing them down.

/** Every rule the ref can call. Adding one means adding a HANDBOOK entry — there is nowhere else. */
export type RuleId =
  | 'out_of_bounds'
  | 'charge'
  | 'blocking_foul'
  | 'shooting_foul'
  | 'and_one'
  | 'loose_ball_foul'
  | 'reach_in'
  | 'three_seconds'
  | 'goaltending'
  | 'make_it_take_it'
  | 'backcourt';

/** Who comes out of the call with the ball. */
export type Award =
  /** The team that was on offence keeps it. */
  | 'offense'
  /** The team that was defending gets it. */
  | 'defense'
  /** The team the foul was committed AGAINST. */
  | 'fouled'
  /** The team that did NOT shoot. */
  | 'non_shooter'
  /** Nobody: the ball stays live. */
  | 'live';

export interface RuleEntry {
  id: RuleId;
  /** What the ref says — the banner. One voice, so the calls read consistently across modes. */
  call: string;
  award: Award;
  /** Does play stop for the call? A live-ball rule (goaltending) does not stop it the same way. */
  deadBall: boolean;
  /** Free throws the call is worth. An and-one is one shot on top of a made basket. */
  shots: number;
  whistle: boolean;
  /** Plain-language rule, so the handbook is readable as a rulebook and not only as config. */
  says: string;
}

/**
 * THE HANDBOOK.
 *
 * Ordered roughly as a rulebook would be: ball in play, contact, restrictions, flow. Every entry is a
 * rule a mode can actually report today — a handbook full of rules nobody emits is decoration, so new
 * entries arrive with their detector.
 */
export const HANDBOOK: readonly RuleEntry[] = [
  {
    id: 'out_of_bounds',
    call: 'OUT OF BOUNDS',
    award: 'non_shooter',
    deadBall: true,
    shots: 0,
    whistle: true,
    says: 'A ball that leaves the floor is dead. It goes to the team that did not put it out — on a '
      + 'missed shot nobody has touched since, that is the defence.',
  },
  {
    id: 'charge',
    call: 'CHARGE',
    award: 'defense',
    deadBall: true,
    shots: 0,
    whistle: true,
    says: 'A handler who runs at foul speed into a defender who is already SET has fouled. A defender '
      + 'still moving when the bodies meet has not earned the call — he is just beaten.',
  },
  {
    id: 'blocking_foul',
    call: 'BLOCKING FOUL',
    award: 'offense',
    deadBall: true,
    shots: 0,
    whistle: true,
    says: 'A defender who is still moving into the handler when they collide has fouled, not the '
      + 'handler. The mirror of the charge, and the reason the charge needs a SET body.',
  },
  {
    id: 'shooting_foul',
    call: 'FOUL ON THE SHOT',
    award: 'fouled',
    deadBall: true,
    shots: 2,
    whistle: true,
    says: 'Contact on a shooter in the air. The attempt still plays out: if it misses, the ball comes '
      + 'back to the shooter.',
  },
  {
    id: 'and_one',
    call: 'AND ONE!',
    award: 'fouled',
    deadBall: true,
    shots: 1,
    whistle: true,
    says: 'Fouled in the air and the shot went in anyway. The basket counts and the shooter gets one.',
  },
  {
    id: 'loose_ball_foul',
    call: 'LOOSE BALL FOUL',
    award: 'fouled',
    deadBall: true,
    shots: 0,
    whistle: true,
    says: 'Contact while nobody has the ball — on a rebound or a scramble. Neither team was on offence, '
      + 'so it goes to whoever was fouled.',
  },
  {
    id: 'reach_in',
    call: 'REACH-IN',
    award: 'offense',
    deadBall: true,
    shots: 0,
    whistle: true,
    says: 'A defender who reaches through the handler rather than at the ball. The handler keeps it.',
  },
  {
    id: 'three_seconds',
    call: 'THREE SECONDS',
    award: 'defense',
    deadBall: true,
    shots: 0,
    whistle: true,
    says: 'An offensive body may not camp in the paint. Stand in there long enough and the ball goes '
      + 'the other way.',
  },
  {
    id: 'goaltending',
    call: 'GOALTENDING — BASKET COUNTS',
    award: 'non_shooter',
    deadBall: true,
    shots: 0,
    whistle: true,
    says: 'A ball touched on its way DOWN toward the rim counts as if it went in. Blocking a shot is '
      + 'legal on the way up, not on the way down.',
  },
  {
    id: 'make_it_take_it',
    call: 'MAKE IT, TAKE IT',
    award: 'offense',
    deadBall: false,
    shots: 0,
    whistle: false,
    says: 'Street rules: score and you keep the ball. Not a violation — a flow rule, which is why it '
      + 'carries no whistle.',
  },
  {
    id: 'backcourt',
    call: 'TAKE IT BACK',
    award: 'offense',
    deadBall: false,
    shots: 0,
    whistle: false,
    says: 'A change of possession in a half-court game must be taken back past the line before a shot '
      + 'counts. A flow rule, not a foul.',
  },
];

const BY_ID = new Map<RuleId, RuleEntry>(HANDBOOK.map((r) => [r.id, r]));

/** Look a rule up. Throws rather than returning undefined: an unknown rule is a programming error. */
export function rule(id: RuleId): RuleEntry {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`[REF] no handbook entry for "${id}"`);
  return r;
}

/** The two sides, named the way the modes already name them. */
export type Side = 'me' | 'foe';

export interface CallContext {
  /** Who was on offence when it happened. */
  offense: Side;
  /** Who took the shot, when the rule involves one. */
  shooter?: Side;
  /** Who the contact was committed against. */
  fouled?: Side;
  /** Extra detail for the banner — "ON THE FINISH", "IN THE LANE". */
  detail?: string;
}

export interface Call {
  id: RuleId;
  /** The banner, ready to show. */
  banner: string;
  /** Who gets the ball. Null when the ball stays live. */
  ball: Side | null;
  deadBall: boolean;
  shots: number;
  whistle: boolean;
}

const other = (s: Side): Side => (s === 'me' ? 'foe' : 'me');

/**
 * THE CALL — the one function that turns a rule plus a situation into a decision.
 *
 * Everything a mode used to decide inline happens here, which means the same situation cannot produce
 * two different outcomes in two modes any more.
 */
export function judge(id: RuleId, ctx: CallContext): Call {
  const r = rule(id);
  let ball: Side | null;
  switch (r.award) {
    case 'offense': ball = ctx.offense; break;
    case 'defense': ball = other(ctx.offense); break;
    // the team that did not shoot; with no shooter named, the shot was the offence's
    case 'non_shooter': ball = other(ctx.shooter ?? ctx.offense); break;
    // whoever was fouled; with nobody named, assume the offence was (the common case)
    case 'fouled': ball = ctx.fouled ?? ctx.offense; break;
    case 'live': default: ball = null; break;
  }
  return {
    id: r.id,
    banner: ctx.detail ? `${r.call} — ${ctx.detail}` : r.call,
    ball,
    deadBall: r.deadBall,
    shots: r.shots,
    whistle: r.whistle,
  };
}

/**
 * Whose foul is the collision?
 *
 * The charge and the blocking foul are the same physical event read two ways, and the difference is
 * whether the defender was SET. The modes DO read both cases, but from separate conditions in separate
 * branches with separate thresholds — which is how two readings of one collision drift apart. One
 * function, one threshold, two answers.
 */
export function contactFoul(attackerSpeed: number, defenderSpeed: number, foulSpeed: number, setSpeed = 1.0): RuleId | null {
  if (attackerSpeed < foulSpeed) return null;         // nobody was moving fast enough for a call
  return defenderSpeed < setSpeed ? 'charge' : 'blocking_foul';
}

/** A shooter met in the air: the basket decides whether it is an and-one or a trip to the line. */
export function shotFoul(made: boolean): RuleId {
  return made ? 'and_one' : 'shooting_foul';
}

/**
 * A block on the way DOWN is goaltending.
 *
 * `ballVelY` is the ball's vertical speed when it was touched; above the ring and falling means the
 * shot was on its way in. Without this rule a defender could swat a ball out of the cylinder for free,
 * which is the cheapest possible defence and the reason the rule exists in the first place.
 */
export function isGoaltending(ballVelY: number, ballY: number, rimY: number): boolean {
  return ballVelY < -0.2 && ballY > rimY;
}

/** Seconds an offensive body may stand in the paint before the ref calls it. */
export const THREE_SECOND_LIMIT = 3;

/**
 * The paint clock.
 *
 * Returns the new accumulated time. Leaving the paint resets it — the count is for CAMPING, so a body
 * that cuts through and out has not violated anything.
 */
export function paintClock(held: number, inPaint: boolean, dt: number): number {
  return inPaint ? held + dt : 0;
}
