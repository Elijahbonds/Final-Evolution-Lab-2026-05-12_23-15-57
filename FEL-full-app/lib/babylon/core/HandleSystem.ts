// THE HANDLE — what your hands can do, and how that is earned (2026-09-12).
//
// Owner's brief, verbatim:
//   "should feel like street vol 2 or 3" / "x 2k"
//   "if you have max ball ahndle you should feel like allen iverson x steezo"
//   "ankle breakers"
//   "spin move gathers"
//
// Decoded into mechanics, because "feels like Street" is not implementable and these three things are:
//
//   STREET VOL 2/3 = moves CHAIN. A move does not return to idle before the next one starts, and a
//     chain reads bigger than its parts. That is the single most distinctive thing about those games.
//   x 2K          = the chain is not free. A window you can miss, a repeat you cannot spam, and
//     momentum you actually spend.
//   IVERSON x STEEZO at MAX = the handle GATES the vocabulary. At baseline you get a crossover. At the
//     top you get the double, the shammgod, the snatch-back, a long chain window, and a tight low
//     dribble. The move set IS the upgrade.
//
// Why that last point matters beyond feel: the subscription keeps earned attributes
// (lib/progression/upgradeGate.ts). If the handle gates MOVES, then the thing a subscriber keeps is a
// move they can see and feel rather than a number on a sheet. That is the most legible possible answer
// to "why subscribe", so the gate is deliberately wired to the same attributes the gate protects.
//
// PRQ HAS NO "BALL HANDLE" ATTRIBUTE. It is a physical scan: strength, speed, endurance, agility, power,
// flexibility, recovery, mental. So handle is DERIVED (handleFrom below) from agility, flexibility and
// mental — the three that actually govern hands, hips and reading a defender. Inventing a cosmetic
// "handle" stat would have broken the link to the scan, and the link is the point.
//
// Pure: no Babylon, no scene. Every rule here is provable without a game running.

import { Vector3 } from '@babylonjs/core';   // `offTheHeadLoose` returns a direction; nothing else here touches Babylon

/** The vocabulary. Ordered roughly by what a handle has to be to own it. */
export type HandleMove =
  | 'crossover'
  | 'hesi'
  | 'in_and_out'
  | 'yoyo'
  | 'between_legs'
  | 'behind_back'
  | 'spin'
  | 'slip_slide'
  | 'double_cross'
  | 'snatch_back'
  | 'shammgod'
  | 'off_the_head'
  // THE 2K17 STICK VOCABULARY (owner, 2026-09-17): momentum moves keep (and add) pace, the pause freezes it, the roll spins out of a behind-the-back
  | 'momentum_cross'
  | 'momentum_btb'
  | 'steezo_roll';

/**
 * The handle a move needs before you have it at all.
 *
 * Baseline PRQ is 50, so a fresh scan owns the crossover and the hesi and nothing else. The top of the
 * list is deliberately out of reach without real upgrades — that is what makes reaching it feel like
 * anything.
 */
export const MOVE_HANDLE: Readonly<Record<HandleMove, number>> = {
  crossover: 0,
  hesi: 0,
  in_and_out: 40,     // fake the cross and keep the hand — the first thing past the basics
  yoyo: 52,           // the ball on a string, sizing him up: only with space and a handle
  between_legs: 45,
  behind_back: 58,
  spin: 64,
  slip_slide: 68,     // off the hesi, past his hip once he has committed
  double_cross: 72,
  snatch_back: 80,
  shammgod: 88,
  // OFF THE HEAD. The And1 move: the ball goes off HIM and you pick it up behind him. The most
  // disrespectful thing in the vocabulary, so it is the last thing you earn — and mechanically it is the
  // odd one out, because the ball leaves your hands and touches another player to get where it is going.
  off_the_head: 92,
  momentum_cross: 30,   // the 2K17 momentum crossover: a wide cut that keeps the run — the first stick move you earn
  momentum_btb: 50,     // momentum behind the back: the ball wrapped at pace without the slow-down
  steezo_roll: 74,      // the roll: behind the back rolled straight into the spin
};

/**
 * THE BODY FOR EACH MOVE (2026-09-16).
 *
 * This table did not exist, and its absence is why the vocabulary was invisible: the animation tree has ONE
 * crossover state, hardwired to `bball_crossover_left`, so every move in the list above resolved its odds, took
 * its chain, flashed its banner — and played a left crossover. A right-handed crossover played the left clip too.
 * Twelve moves, three clips, and no way for the player to tell any of them apart by looking.
 *
 * `dir` is the side the ball ENDS on, which is the only thing a defender can read. The moves with no `_left` /
 * `_right` pair are the ones with no side to them: a snatch back goes backwards, a yoyo goes nowhere, and a spin
 * and an off-the-head are rendered by the modes themselves (a spin turns the whole body; off the head throws the
 * ball at somebody).
 */
export const MOVE_CLIP: Readonly<Record<HandleMove, ((dir: 'left' | 'right') => string) | null>> = {
  crossover: (d) => `bball_crossover_${d}`,
  hesi: () => 'bball_hesi',
  in_and_out: (d) => `bball_in_and_out_${d}`,
  yoyo: () => 'bball_yoyo',
  between_legs: (d) => `bball_between_legs_${d}`,
  behind_back: (d) => `bball_behind_back_${d}`,
  spin: null,             // the mode turns the body; there is no hand shape that says "spin" on its own
  slip_slide: (d) => `bball_in_and_out_${d}`,   // the slip IS an in-and-out you took past his hip — same hands, mode moves the feet
  double_cross: (d) => `bball_double_cross_${d}`,
  snatch_back: () => 'bball_snatch_back',
  shammgod: (d) => `bball_shammgod_${d}`,
  off_the_head: null,     // the ball leaves your hands; the mode owns that one entirely
  momentum_cross: (d) => `bball_crossover_${d}`,     // the capture's cross, played FAST and wide by the movement
  momentum_btb: (d) => `bball_behind_back_${d}`,
  steezo_roll: (d) => `bball_behind_back_${d}`,      // the wrap; the mode's spin follows
};

/** The clip for a move, or null when the mode renders it another way. */
export function moveClip(move: HandleMove, dir: 'left' | 'right'): string | null {
  const f = MOVE_CLIP[move];
  return f ? f(dir) : null;
}

/**
 * HOW AN ANKLE BREAK LOOKS FROM THE OTHER SIDE.
 *
 * The defender's answer to the whole vocabulary above was `karate_hit_react`, and a floored one was
 * `karate_knockdown` — a man being PUNCHED, twice. Nobody punched him: he went for a ball that was not there, and
 * there are exactly two ways that ends.
 */
export const ANKLE_STUMBLE_CLIP = 'bball_ankle_stumble';
export const ANKLE_SLIP_CLIP = 'bball_ankle_slip';
/** Seconds the slip leaves him on the floor before he can get up — it is the longest punishment in the mode. */
export const ANKLE_SLIP_DOWN_SEC = 1.4;

/** Is this move in my hands? */
export function hasMove(move: HandleMove, handle: number): boolean {
  return handle >= MOVE_HANDLE[move];
}

/** Everything I can currently do, in vocabulary order — for a HUD, a tutorial, or a move wheel. */
export function movesFor(handle: number): HandleMove[] {
  return (Object.keys(MOVE_HANDLE) as HandleMove[]).filter((m) => hasMove(m, handle));
}

/**
 * Handle out of a PRQ scan.
 *
 * Agility is the hands and the feet, flexibility is the hips and the low dribble, mental is reading the
 * body in front of you and knowing what to chain. Weighted toward agility because that is what a
 * handle mostly is.
 */
export function handleFrom(prq: { agility?: number; flexibility?: number; mental?: number }): number {
  const a = prq.agility ?? 50, f = prq.flexibility ?? 50, m = prq.mental ?? 50;
  return Math.max(0, Math.min(100, a * 0.55 + f * 0.25 + m * 0.20));
}

/** Baseline scan: what a brand-new player's hands are. */
export const BASELINE_HANDLE = 50;

/**
 * How long after one move the next can still chain off it.
 *
 * This is the Street dial. A low handle gets a window so short that moves are effectively separate
 * presses; a max handle gets long enough to actually string three together, which is what turns a
 * sequence into a highlight instead of three inputs.
 */
export function chainWindowSec(handle: number): number {
  const t = Math.max(0, Math.min(1, handle / 100));
  // 0.18 s at nothing, 0.70 s at max. The top figure is MEASURED, not chosen: the dribble controller
  // only commits a crossover about every 0.6 s (it wants a committed direction, deliberately — a
  // crossover is a skilled cut, not a stick wiggle). At a 0.52 s window a maxed handle therefore topped
  // out at a two-move chain in every probe run, which made depth 3 — and with it the whole hard ankle
  // break and the 'highlight' tier — unreachable content. The window has to clear the real move cadence
  // or the top of the upgrade tree is decoration.
  return 0.18 + t * 0.52;
}

/**
 * How tight and low the dribble rides: 0 is loose and high, 1 is on the floor and under the knees.
 *
 * The Iverson/Steezo read is mostly silhouette — the ball living low and close. This is what a mode
 * feeds its dribble amplitude so a max handle LOOKS different before it does anything different.
 */
export function tightness(handle: number): number {
  const t = Math.max(0, Math.min(1, handle / 100));
  return 0.25 + t * 0.7;
}

export interface ChainState {
  /** The move that just happened, or null if we are not in a chain. */
  last: HandleMove | null;
  /** Seconds since it happened. */
  since: number;
  /** How many moves have strung together, including the first. */
  length: number;
}

export const CHAIN_IDLE: ChainState = { last: null, since: Infinity, length: 0 };

/**
 * How many moves a single chain can run to before it is spent.
 *
 * Measured without one: a maxed handle reached an EIGHTEEN-move chain, because each move landed inside
 * the window and extended it again forever. That is a treadmill, not a highlight — and it made the
 * hard ankle break continuous rather than special. A chain now tops out and you have to start another,
 * which is what a combo is in the games this is drawn from.
 */
export const MAX_CHAIN = 4;

/**
 * Can `next` chain off what just happened?
 *
 * Three rules, and each one is a 2K-side brake on the Street-side freedom:
 *   - you must own the move;
 *   - you must be inside the window;
 *   - you cannot repeat the same move back-to-back, because a spammed crossover is not a combo.
 */
/** The moves that may repeat back-to-back: the 2K17 momentum spam — a cross into a cross into a cross, each one carrying pace. */
/** The moves only the RIGHT STICK produces (StickHandle.stickMoveFor) — moveFromContext never names them. */
export const STICK_ONLY: ReadonlySet<HandleMove> = new Set<HandleMove>(['momentum_cross', 'momentum_btb', 'steezo_roll']);
export const MOMENTUM_REPEATABLE: ReadonlySet<HandleMove> = new Set<HandleMove>(['momentum_cross']);
export function canChain(next: HandleMove, state: ChainState, handle: number): boolean {
  if (!hasMove(next, handle)) return false;
  if (state.last === null) return true;                 // opening a chain is always allowed
  if (state.last === next && !MOMENTUM_REPEATABLE.has(next)) return false;   // no double-tapping one move into a "combo" — except the MOMENTUM SPAM (2K17): the cross chains into itself
  return state.since <= chainWindowSec(handle);
}

/** Advance the chain. A move outside the window STARTS a new chain rather than extending the old one. */
export function pushChain(next: HandleMove, state: ChainState, handle: number): ChainState {
  const continues = state.last !== null && (state.last !== next || MOMENTUM_REPEATABLE.has(next)) && state.since <= chainWindowSec(handle)
    && state.length < MAX_CHAIN;
  return { last: next, since: 0, length: continues ? state.length + 1 : 1 };
}

/** Is this chain spent? A mode can use it to cue the finish rather than letting it run on. */
export function chainSpent(state: ChainState): boolean {
  return state.length >= MAX_CHAIN;
}

/** Tick the chain's clock. Past the window the chain is over. */
export function tickChain(state: ChainState, dt: number, handle: number): ChainState {
  const since = state.since + dt;
  if (state.last !== null && since > chainWindowSec(handle)) return { ...CHAIN_IDLE };
  return { ...state, since };
}

export type ChainTier = 'single' | 'combo' | 'highlight';

/** What the crowd should be told. Three strung together is a highlight; one is just a move. */
export function chainTier(length: number): ChainTier {
  if (length >= 3) return 'highlight';
  if (length === 2) return 'combo';
  return 'single';
}

export interface AnkleBreakRead {
  /** How many moves deep the chain is. */
  chainLength: number;
  handle: number;
  /** The defender was CLOSING rather than sitting back — a moving body is the one you can break. */
  defenderClosing: boolean;
  /** The defender is SET and low. Hard to break, and correctly so. */
  defenderSet: boolean;
  /** WHICH move — a shammgod is not a crossover. Optional so old callers keep the plain-move odds. */
  move?: HandleMove;
}

/**
 * The odds a defender's ankles go.
 *
 * A set defender is nearly unbreakable and a closing one is vulnerable — which is the read the player is
 * making. Chain depth is the biggest term because that is the skill expression: a single crossover
 * should rarely break anyone, and a three-move chain at a high handle should look inevitable.
 */
export function ankleBreakOdds(read: AnkleBreakRead): number {
  if (read.defenderSet) return 0.04;                    // you can break a set man, but barely
  const depth = Math.min(3, Math.max(1, read.chainLength));
  const base = 0.10 + (depth - 1) * 0.22;               // 0.10 / 0.32 / 0.54
  const skill = (Math.max(0, read.handle - BASELINE_HANDLE) / 50) * 0.22;
  const closing = read.defenderClosing ? 0.14 : 0;
  return Math.max(0, Math.min(0.92, (base + skill + closing) * moveDanger(read.move)));
}

/**
 * How dangerous THIS move is, relative to a plain crossover.
 *
 * Until now the odds took no move at all: a yo-yo and a shammgod at the same chain depth broke ankles
 * identically, so beyond the gate the whole vocabulary was cosmetic. Earning handle 88 bought a move that
 * did exactly what the free one did.
 *
 * DERIVED FROM THE PRICE rather than a second table, deliberately. `MOVE_HANDLE` already encodes how hard a
 * move is to own; a separate danger table would be a second opinion about the same question and the two
 * would drift the first time somebody retuned one of them. A move's danger and its cost are now the same
 * number seen twice.
 */
export const MOVE_DANGER_SPAN = 0.6;
export function moveDanger(move: HandleMove | undefined): number {
  if (!move) return 1;                                  // an unnamed move is a plain one
  return 1 + (MOVE_HANDLE[move] / 100) * MOVE_DANGER_SPAN;
}

/**
 * Did the ankles actually GO, or was it only a stumble?
 *
 * The owner asked for "ankle breakers", and a stumble is not one. A deep chain at a real handle puts the
 * defender ON THE FLOOR — the same floored state a poster dunk already uses, so he has to get up. A
 * shallow break is still just a stagger, which keeps the floor moment rare enough to mean something.
 */
export function isHardBreak(chainLength: number, handle: number): boolean {
  return chainLength >= 3 && handle >= MOVE_HANDLE.double_cross;
}

/**
 * Does this move's exit flow straight into a shot GATHER?
 *
 * Owner: "spin move gathers". The spin used to dead-end — it finished, a cooldown armed, and the player
 * had to start a fresh shot input, which is the opposite of chaining. A move that carries you INTO the
 * shot is the whole reason to use it.
 */
export function gathersIntoShot(move: HandleMove): boolean {
  return move === 'spin' || move === 'snatch_back' || move === 'shammgod' || move === 'hesi'
    || move === 'slip_slide' || move === 'off_the_head';
}

export interface MoveRead {
  /** 0..1 of top speed. */
  speed01: number;
  /** Moving AWAY from the rim — a retreat dribble. */
  retreating: boolean;
  /** A defender is right on me. */
  pressured: boolean;
  /** The move that just happened, so a chain can escalate instead of repeating. */
  last: HandleMove | null;
  /**
   * How deep the chain already is.
   *
   * Added because the top of the vocabulary was unreachable without it: `shammgod` sat in the table priced
   * at 88, referenced by `gathersIntoShot`, and NOTHING could ever produce it — it was not a candidate and
   * no mode called it directly. A player who earned an 88 handle had paid for a move that could not fire.
   * It is a finisher, so what it needed was a read that only exists deep in a chain.
   */
  chainLength?: number;
  /** Practically chest to chest — the only range at which the ball can go off HIM. */
  inHisChest?: boolean;
}

/**
 * WHICH move a reversal becomes.
 *
 * The reason this exists rather than more buttons: the handle vocabulary had eight moves and only two
 * input bindings, so a maxed handle could never chain past a single move — and past experience in this
 * tree is that new dribble bindings collide with the spin / hook / hop inputs already on the stick.
 *
 * So one flick reads differently by SITUATION, which is also how the Street games actually feel: the
 * same input is a different move depending on what your body is doing. A low handle always gets the
 * plain crossover, because reading the situation IS the skill being gated.
 */
export function moveFromContext(read: MoveRead, handle: number): HandleMove {
  const candidates: HandleMove[] = [];
  const deep = (read.chainLength ?? 0) >= 2;

  // OFF THE HESI. A hesitation is a question, and these are the answers — he has just shifted his weight
  // to the stop, so the move that beats him is the one that goes PAST him rather than around him. Making
  // `hesi` a real link is the difference between a pull-back that leads somewhere and a dead end.
  if (read.last === 'hesi') {
    if (read.pressured) candidates.push('slip_slide');   // he bit the stop: slide past his hip
    candidates.push('in_and_out');                       // he did not: show it and keep it
  }
  // OFF THE HEAD — only when you are practically in his chest and already showing out. It is not a way
  // past a defender, it is a way past THAT defender, right there, and the read says so: chest to chest.
  if (read.pressured && read.inHisChest && deep) candidates.push('off_the_head');
  // THE FINISHER. Only deep in a chain, at speed — push it out like you have lost it, snatch it back.
  // This is the read `shammgod` never had, which is why the top of the vocabulary was dead.
  if (deep && read.speed01 > 0.5) candidates.push('shammgod');
  // standing still and pressured: the ball goes through the legs, the safest place for it
  if (read.speed01 < 0.3 && read.pressured) candidates.push('between_legs');
  // space and no hurry: the ball on a string, up and down, daring him to reach
  if (read.speed01 < 0.35 && !read.pressured) candidates.push('yoyo');
  // backing out: behind the back protects it from the trailing hand
  if (read.retreating) candidates.push('behind_back');
  // already mid-chain and moving: escalate to the double
  if (read.last !== null && read.speed01 > 0.45) candidates.push('double_cross');
  // full speed into a body: snatch it back and make him commit
  if (read.speed01 > 0.7 && read.pressured) candidates.push('snatch_back');
  // moving with a body on you but not yet flat out: fake the cross, keep the hand
  if (read.pressured && read.speed01 >= 0.3) candidates.push('in_and_out');
  candidates.push('crossover');                      // the floor: always available, always legal

  // the best move I actually own that is not the one I just did
  for (const m of candidates) if (hasMove(m, handle) && m !== read.last) return m;
  // everything I own is the move I just did; return it and let canChain refuse the repeat
  return 'crossover';
}

// ── THE WHOLE MOVE, DECIDED IN ONE PLACE (2026-09-13) ────────────────────────────────────────────────────
//
// The pieces above — canChain, pushChain, chainTier, ankleBreakOdds, isHardBreak — were assembled into a
// 60-line `doMove` inside 1v1 and nowhere else. 3v3 had the ball-handling module imported and never grew the
// vocabulary: its crossover only switched hands, so a chain could not exist there, the ankles could never
// break, and the moves the owner commissioned lived in exactly one of the two modes that should have them.
//
// Copying those 60 lines into 3v3 is what put 3v3 behind in the first place. So the DECISION is here, pure
// and tested, and each mode renders the outcome its own way (its own clips, its own banners, its own
// defender). A tuning change now lands in both games at once, which is the entire point.

/** Everything the decision needs to know about the man being broken. */
export interface DefenderRead {
  /** There is a live defender at all — not stunned, not already on the floor. */
  present: boolean;
  /** He is moving at you. Easier to break. */
  closing: boolean;
  /** He is planted. Harder. */
  set: boolean;
  /** Close enough that the move happens TO him. */
  within: boolean;
}

export type BreakResult = 'none' | 'shook' | 'hard';

export interface MoveOutcome {
  /** False when the move is not in your hands yet — the gate IS the upgrade. */
  owned: boolean;
  /** The chain after this move. Always returned, including when the chain restarted. */
  chain: ChainState;
  tier: ChainTier;
  /** The move was outside the window or a repeat, so it began a fresh chain instead of extending one. */
  restarted: boolean;
  /** What happened to the defender. */
  broke: BreakResult;
  /** The odds that were rolled against, for the log. 0 when nothing was rolled. */
  odds: number;
}

/** Inside this a move is happening TO the defender; outside it you are shaking nobody. */
export const SHAKE_RANGE = 2.6;

/**
 * One move, start to finish.
 *
 * `roll` is injected so the ankle-break dice are testable — the odds curve is the interesting part and it
 * should not need a running game to prove.
 */
export function resolveHandleMove(
  move: HandleMove,
  chain: ChainState,
  handle: number,
  def: DefenderRead,
  roll: () => number = Math.random,
): MoveOutcome {
  if (!hasMove(move, handle)) {
    return { owned: false, chain, tier: chainTier(chain.length), restarted: false, broke: 'none', odds: 0 };
  }
  if (!canChain(move, chain, handle)) {
    // out of the window, or a repeat: this is a new chain rather than a refusal, so the input is never eaten
    const fresh = pushChain(move, { ...CHAIN_IDLE }, handle);
    return { owned: true, chain: fresh, tier: chainTier(fresh.length), restarted: true, broke: 'none', odds: 0 };
  }

  const next = pushChain(move, chain, handle);
  const tier = chainTier(next.length);
  const base = { owned: true as const, chain: next, tier, restarted: false };

  // already cooked, or nowhere near him: the chain still counts, the ankles do not
  if (!def.present || !def.within) return { ...base, broke: 'none', odds: 0 };

  const odds = ankleBreakOdds({
    chainLength: next.length, handle, defenderClosing: def.closing, defenderSet: def.set, move,
  });
  if (roll() >= odds) return { ...base, broke: 'none', odds };
  return { ...base, broke: isHardBreak(next.length, handle) ? 'hard' : 'shook', odds };
}

/**
 * OFF THE HEAD — the one move where the ball leaves your hands (owner, 2026-09-13).
 *
 * Every other move in this file is a decision about a chain and a defender's ankles; the ball never stops
 * being yours. This one throws it off HIM and picks it up behind him, which makes it the only move with a
 * real failure mode: if he is not where you thought, the ball is gone.
 *
 * So it is priced as the highest move in the vocabulary AND it is the only one that can turn the ball over.
 * A move that is pure upside at the top of a progression is not a flex, it is a dominant strategy.
 */
export const OFF_THE_HEAD_RANGE = 1.15;
/** How often it comes off clean at a full handle. Below that it degrades — see `offTheHeadOdds`. */
export const OFF_THE_HEAD_BASE = 0.62;
/** He has to be roughly facing you: the ball goes off the front of him, not the back of his head. */
export const OFF_THE_HEAD_FACING_MIN = 0.15;

export interface OffTheHeadRead {
  handle: number;
  /** Planar metres to him. */
  dist: number;
  /** cos of his facing to me — he is looking at me. */
  facingCos: number;
  /** A moving target is a miss waiting to happen. */
  defenderSpeed: number;
}

/** Odds it comes off clean. Zero when the geometry is not there at all. */
export function offTheHeadOdds(read: OffTheHeadRead): number {
  if (read.dist > OFF_THE_HEAD_RANGE) return 0;
  if (read.facingCos < OFF_THE_HEAD_FACING_MIN) return 0;
  const skill = Math.max(0, Math.min(1, (read.handle - MOVE_HANDLE.off_the_head) / (100 - MOVE_HANDLE.off_the_head)));
  const moving = Math.max(0, Math.min(0.35, read.defenderSpeed * 0.12));
  return Math.max(0, Math.min(0.95, OFF_THE_HEAD_BASE + skill * 0.25 - moving));
}

/** It missed: the ball is loose, and it is loose BEHIND him, which is the worst place for you. */
export function offTheHeadLoose(passer: Vector3, defender: Vector3): Vector3 {
  const past = new Vector3(defender.x - passer.x, 0, defender.z - passer.z);
  const d = past.length();
  if (d < 1e-4) return new Vector3(0, 0, 1);
  return past.scale(1 / d);
}

// ── A MOVE THAT IS NAMED FOR A MOVEMENT SHOULD MOVE YOU (2026-09-13) ─────────────────────────────────────
//
// Every handle move produced exactly the same body: a chain link, a whoosh, and a roll against the
// defender's ankles. Nothing displaced you. `slip_slide` is literally named for going past his hip and it
// left you standing where you were; `behind_back` is a move you make while going somewhere; `snatch_back`
// is the ball AND the body coming back.
//
// So each move now carries a one-shot impulse in the BODY's frame. One shot, never a per-frame multiplier —
// scaling velocity every frame compounds into a teleport, which is why the jab burst is written the way it
// is and why this is written the same way.
//
// THE FAKES DELIBERATELY MOVE YOU NOTHING. A yo-yo, an in-and-out and a hesi work precisely because your
// body did not go anywhere: that is what makes them lies. Giving them an impulse would make every move in
// the vocabulary the same kind of move again, in the other direction.

export interface MoveImpulse {
  /** Metres per second along the shooter's facing. Negative retreats. */
  forward: number;
  /** Metres per second across it. Sign is applied by the caller from the move's side. */
  lateral: number;
}

const NO_IMPULSE: MoveImpulse = { forward: 0, lateral: 0 };

/**
 * How the body moves on this move.
 *
 * Returns zero for the fakes — see the header. The caller multiplies `lateral` by the direction it wants
 * the move to go (the side away from the defender), because which way is a mode's read, not this table's.
 */
export function moveImpulse(move: HandleMove): MoveImpulse {
  switch (move) {
    // evasions: the body goes somewhere
    case 'slip_slide': return { forward: 1.4, lateral: 3.2 };   // past his hip, mostly sideways
    case 'behind_back': return { forward: 0.6, lateral: 2.2 };
    case 'double_cross': return { forward: 0.8, lateral: 2.4 };
    case 'crossover': return { forward: 0.4, lateral: 1.6 };
    case 'between_legs': return { forward: 0.5, lateral: 1.2 };
    case 'shammgod': return { forward: 3.4, lateral: 0.8 };     // push it out and GO
    case 'snatch_back': return { forward: -2.6, lateral: 0.6 }; // ball and body both come back
    // fakes: you did not go anywhere, which is the entire point
    case 'hesi': case 'yoyo': case 'in_and_out': return NO_IMPULSE;
    // these resolve on their own paths (the spin machinery, the ball off his head)
    case 'spin': case 'off_the_head': return NO_IMPULSE;
    default: return NO_IMPULSE;
  }
}

/** Does this move displace the body at all? A fake does not. */
export function movesTheBody(move: HandleMove): boolean {
  const i = moveImpulse(move);
  return i.forward !== 0 || i.lateral !== 0;
}

/** MOVE PACE (owner, 2026-09-17: "make the crossover and hesi look faster with the turbo"). The clip's playback rate for a
 *  handle move: on the turbo the cross / hesi / in-and-out snap (1.35×, a shorter fade); off it they play at the capture's
 *  own pace. Pure — the modes hand it to the tree's beat and to the tree's crossover state. */
export const MOVE_RATE_TURBO = 1.35, MOVE_RATE_BASE = 1.0;
export function moveRate(turbo: boolean): number { return turbo ? MOVE_RATE_TURBO : MOVE_RATE_BASE; }
export function moveFadeSec(turbo: boolean): number { return turbo ? 0.045 : 0.07; }
