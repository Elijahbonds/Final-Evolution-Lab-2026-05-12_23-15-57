// bodyFight — the body's fight read turned into the combat modes' verbs, on the body's own clock (movement play P7,
// 2026-09-25). Pure: no Babylon, no DOM.
//
//   fightReader event (t = the motion's ONSET, capture clock) ──BodyFightDriver──▶ an intent (a move and its onset on the
//   page clock) ──▶ the mode: the book (StringBook.pressMove), the strike (StrikeController.request's elapsedMs, VS / Mixed's
//   hit beat), the guard, the slip.
//
// OFFENCE. A body strike is told ~100–250 ms after it began (the camera, the model, the reader), so it is committed where
// the body began it: its age is elapsedOf() — every term a difference on ONE clock (the page since the packet arrived, the
// capture → arrival lag, the reader's own delay), so it holds for camera frames and a probe's fed frames alike — and its
// hit beat is hitDelayMs(): the clip's own contact frame, and never under BODY_WINDUP_FLOOR_MS (the rival's one read per
// wind-up needs a frame of 'startup'). Strings run onset to onset, so a constant latency cancels out of the window.
// DEFENCE. A guard raised 50 ms before the rival's fist lands is told after the hit resolved; backdating a stamp cannot fix
// the past. So a hit on a body-driven fighter WAITS (DeferredHits) until the body's frames cover the impact instant, at most
// DEFER_CAP_MS, and is then resolved against the body's state AT IMPACT (DefenseLedger): a guard held blocks, a raise inside
// BODY_PARRY_WINDOW_MS parries, a push inside BODY_GUARD_IMPACT_MS guard-impacts, a slip's i-frames over the impact whiff it.
// The body's windows are wider than the pad's (a body instant jitters ~1 frame); a pad fighter keeps the old ones and is
// never deferred.
import type { FightEvent, Hand } from '@/lib/pose/fightReader';
import { BODY_MOVE_OF, MOVES, STRIKE_TIMING, type BodyStrike, type HordeMove, type MoveId, type StrikeBtn } from '../core/HordeDynamics';
import type { DefenseAction } from '../core/DefenseSystem';

/** A body strike's wind-up never runs shorter than this (ms) from when the game has it. */
export const BODY_WINDUP_FLOOR_MS = 50;
/** The body's parry window (ms): the pad's 160 widened for a body instant's ~1 frame of jitter (PLAN-P7 §3.3). */
export const BODY_PARRY_WINDOW_MS = 200;
/** The body's guard-impact window (ms): the pad's 90 is under 3 frames at 30 fps. */
export const BODY_GUARD_IMPACT_MS = 160;
/** The Hundred's perfect read for a body dodge (s): the pad's 0.12 widened. */
export const BODY_HORDE_PERFECT_SEC = 0.18;
/** A hit on a body-driven fighter waits at most this long (ms) for the body's frames to cover its impact. */
export const DEFER_CAP_MS = 250;
/** Onsets up to this long (ms) — or CONFIRM_FRAMES camera frames, the longer — before the newest frame's capture are
 *  taken as told, unless the fight read says a motion that began earlier is still being judged (its decidedUntil: a head
 *  off its line, a guard half formed). The margin is the time a motion takes to SHOW: the nose ~4 cm off its rest line
 *  ~40–60 ms after a slip's onset. (The review, 2026-09-26: CONFIRM_MS alone was shorter than the reader's own delay —
 *  onset to the frame that tells it, p90: slip 189 ms at 30 fps and 322 at 15, duck 156 / 269, a raise 167 at 30 — and a
 *  hit resolved before a slip begun 20–120 ms ahead of it was told.) */
export const CONFIRM_MS = 100;
export const CONFIRM_FRAMES = 2;
/** Auto-spacing (a body player has no stick): a strike thrown with the rival within its range + BODY_LUNGE_PAD_M closes
 *  up to BODY_LUNGE_M; a step in / out moves STEP_SPACE_M over STEP_SPACE_SEC; a step across, SIDE_STEP_M. [est.] */
export const BODY_LUNGE_M = 0.6;
export const BODY_LUNGE_PAD_M = 0.8;
export const STEP_SPACE_M = 0.5;
export const STEP_SPACE_SEC = 0.25;
export const SIDE_STEP_M = 0.45;
/** The body's slip i-frames (ms): EvadeMoves.SLIP_IFRAMES_SEC. */
export const BODY_SLIP_IFRAMES_MS = 200;

/** The frame a body event came with (ModeHarness's BodyView, the fields this needs). `read.fight` is the fight read's own
 *  state (BodyRead.fight): null while the fight read has nothing (no calibrated body, or just reset). */
export interface BodyViewLike { read: { t: number; fight?: { guard: boolean; decidedUntil?: number } | null }; arrivedAt: number; lagMs: number }

/** How long ago (ms) an event of capture time `evT` began, on the page clock `now`: the page since its packet arrived, plus
 *  the capture → arrival lag, plus the reader's own delay (the frame that told it − its onset). Never negative. */
export function elapsedOf(evT: number, view: BodyViewLike, now: number): number {
  return Math.max(0, (now - view.arrivedAt) + view.lagMs + (view.read.t - evT));
}

/** A move's contact frame (ms from its start at speed): the horde's hitAt over the clip rate. */
export function contactMsOf(m: HordeMove): number { return (STRIKE_TIMING[m.weight].hitAt / m.speed) * 1000; }
/** A move's cancel point (ms from its start). */
export function cancelMsOf(m: HordeMove): number { return (STRIKE_TIMING[m.weight].cancelAt / m.speed) * 1000; }
/** A body strike's hit beat (ms from now): what is left of its startup, but never under its contact frame or the floor. */
export function hitDelayMs(startupMs: number, contactMs: number, elapsedMs: number): number {
  return Math.max(BODY_WINDUP_FLOOR_MS, contactMs, startupMs - elapsedMs);
}
/** A body strike's cancel point (page ms): its hit beat + a frame, or its onset + its cancel point, the later. */
export function bodyCancelAt(hitAtPage: number, onsetPage: number, m: HordeMove): number {
  return Math.max(hitAtPage + 16, onsetPage + cancelMsOf(m));
}

export type BodyFightIntent =
  | { kind: 'strike'; body: BodyStrike; move: MoveId; token: StrikeBtn; hand: Hand; onsetPage: number; elapsedMs: number }
  | { kind: 'guard'; up: boolean; raise: boolean; push: boolean; onsetPage: number }
  | { kind: 'evade'; form: 'slip' | 'duck'; side: Hand | null; onsetPage: number; elapsedMs: number }
  | { kind: 'step'; dir: 'in' | 'out' | 'left' | 'right'; onsetPage: number };

/**
 * Body event → intent. Strikes and kicks are their literal book moves; a spin kick and a jump kick exist only with the
 * READY screen's opt-in (`kicksOptIn`): without it a jump kick is dropped and a spin kick is read by its path. A turn is
 * the reader's (it marks the next kick a spin), never an intent.
 */
export class BodyFightDriver {
  constructor(private readonly opts: { kicksOptIn?: () => boolean } = {}) {}

  intent(ev: FightEvent, view: BodyViewLike, now: number): BodyFightIntent | null {
    const elapsedMs = elapsedOf(ev.t, view, now), onsetPage = now - elapsedMs;
    const optIn = this.opts.kicksOptIn?.() ?? false;
    switch (ev.kind) {
      case 'blow': {
        const b = BODY_MOVE_OF[ev.name];
        return { kind: 'strike', body: ev.name, move: b.move, token: b.token, hand: ev.hand, onsetPage, elapsedMs };
      }
      case 'legKick': {
        if (ev.airborne && !optIn) return null;
        const body: BodyStrike = ev.airborne ? 'jump' : ev.spin && optIn ? 'spin' : ev.form;
        const b = BODY_MOVE_OF[body];
        return { kind: 'strike', body, move: b.move, token: b.token, hand: ev.foot, onsetPage, elapsedMs };
      }
      case 'guard': return { kind: 'guard', up: ev.up, raise: ev.raise, push: ev.push, onsetPage };
      case 'evade': return { kind: 'evade', form: ev.form, side: ev.side, onsetPage, elapsedMs };
      case 'fightStep': return { kind: 'step', dir: ev.dir, onsetPage };
      case 'turn': return null;
    }
  }
}

/** The book's move for an intent (the uppercut link promotion is the book's, pressMove). */
export const moveOf = (i: Extract<BodyFightIntent, { kind: 'strike' }>): HordeMove => MOVES[i.move];

/**
 * The body's defensive state over the last second, on the page clock: guard intervals, the instants the guard was RAISED
 * (with its push), evade windows, and how far the told frames reach. `at(impact)` is the state a hit resolves against.
 */
export class DefenseLedger {
  private guards: { from: number; to: number }[] = [];
  private raises: { t: number; push: boolean }[] = [];
  private evades: { from: number; to: number; onset: number }[] = [];
  private known = -Infinity;
  private open: number | null = null;
  private lastReadT: number | null = null;
  private stepBuf: number[] = [];

  /** A guard intent. (An up on a guard frame() already took up keeps the earlier instant: the frame's state can arrive
   *  with the very packet that tells the up, before the mode hands the up over.) */
  guard(i: Extract<BodyFightIntent, { kind: 'guard' }>): void {
    if (i.up) {
      this.open = this.open === null ? i.onsetPage : Math.min(this.open, i.onsetPage);
      if (i.raise) this.raises.push({ t: i.onsetPage, push: i.push });
    } else if (this.open !== null) {
      this.guards.push({ from: this.open, to: Math.max(this.open, i.onsetPage) });
      this.open = null;
    }
  }
  /** A slip or a duck: i-frames from its onset. */
  evade(i: Extract<BodyFightIntent, { kind: 'evade' }>, iframesMs = BODY_SLIP_IFRAMES_MS): void {
    this.evades.push({ from: i.onsetPage, to: i.onsetPage + iframesMs, onset: i.onsetPage });
  }
  /**
   * A packet arrived. What is told reaches to its capture (page clock) less the margin (CONFIRM_MS or CONFIRM_FRAMES
   * frames), and never past the fight read's decided horizon (read.fight.decidedUntil); a frame without the fight's state
   * (the body not seen) moves nothing — a hit then waits for the frames, or DEFER_CAP_MS. The guard follows the reader's
   * state: an open guard it no longer holds (the body lost, a new one calibrating: it says no 'down' for a guard it never
   * saw) closes at this frame — 'down', so the mode lets its own block go; a guard it holds that is not open here (held
   * through a round's start, or its up refused in a menu) opens at this frame, no raise — 'up', so the mode may take its
   * block up again. Records a pending hit may still need (from `keepFrom`, its impact) are kept however long the game was
   * paused (the review, 2026-09-26: a pause over 1.5 s pruned the guard a deferred hit met, and it landed clean).
   */
  frame(view: BodyViewLike, now: number, keepFrom = Infinity): 'up' | 'down' | null {
    const cap = view.arrivedAt - view.lagMs, g = view.read.fight;
    if (this.lastReadT !== null && view.read.t > this.lastReadT && view.read.t - this.lastReadT < 200) {
      this.stepBuf.push(view.read.t - this.lastReadT); if (this.stepBuf.length > 9) this.stepBuf.shift();
    }
    if (this.lastReadT === null || view.read.t > this.lastReadT) this.lastReadT = view.read.t;
    const step = this.stepBuf.length ? [...this.stepBuf].sort((a, b) => a - b)[this.stepBuf.length >> 1] : 1000 / 30;
    // (a frame with no fight state — the body not seen: a dropout, a stall — tells nothing about the time before it: the
    // reader may still tell a slip begun there once it sees the body again, so the horizon does not move on it)
    if (g !== undefined) {
      let told = cap - Math.max(CONFIRM_MS, CONFIRM_FRAMES * step);
      if (g && g.decidedUntil !== undefined && Number.isFinite(g.decidedUntil)) told = Math.min(told, cap - (view.read.t - g.decidedUntil));
      this.known = Math.max(this.known, told);
    }
    let out: 'up' | 'down' | null = null;
    if (this.open !== null && g !== undefined && (g === null || !g.guard)) {
      this.guards.push({ from: this.open, to: Math.max(this.open, cap) });
      this.open = null; out = 'down';
    } else if (this.open === null && g?.guard) {
      this.open = cap; out = 'up';
    }
    const keep = Math.min(now, keepFrom) - 1500;
    this.guards = this.guards.filter((x) => x.to >= keep);
    this.raises = this.raises.filter((r) => r.t >= keep);
    this.evades = this.evades.filter((e) => e.to >= keep);
    return out;
  }
  /** The body's frames cover `impactPage`, or the hit has waited DEFER_CAP_MS. */
  ready(impactPage: number, now: number): boolean { return this.known >= impactPage || now - impactPage >= DEFER_CAP_MS; }
  /** The page instant up to which the body's onsets are told. */
  get knownUntil(): number { return this.known; }
  /** The guard is up now (an open interval). */
  get guardUp(): boolean { return this.open !== null; }

  at(impactPage: number): { guardHeld: boolean; raiseAt: number | null; push: boolean; evadeOnset: number | null } {
    const held = (this.open !== null && this.open <= impactPage) || this.guards.some((g) => g.from <= impactPage && g.to > impactPage);
    const raise = this.raises.filter((r) => r.t <= impactPage).pop() ?? null;
    const ev = this.evades.find((e) => e.from <= impactPage && e.to >= impactPage) ?? null;
    return { guardHeld: held, raiseAt: raise?.t ?? null, push: raise?.push ?? false, evadeOnset: ev?.onset ?? null };
  }

  reset(): void { this.guards = []; this.raises = []; this.evades = []; this.known = -Infinity; this.open = null; this.lastReadT = null; this.stepBuf = []; }
}

/** What a hit on a body fighter resolves to at its impact (before range and stagger, the mode's own). */
export type BodyDefense = 'evaded' | 'guardImpact' | 'parried' | 'blocked' | 'none';
export function bodyDefenseAt(ledger: DefenseLedger, impactPage: number): { d: BodyDefense; evadeOnset: number | null } {
  const s = ledger.at(impactPage);
  if (s.evadeOnset !== null) return { d: 'evaded', evadeOnset: s.evadeOnset };
  const since = s.raiseAt === null ? Infinity : impactPage - s.raiseAt;
  if (s.push && since <= BODY_GUARD_IMPACT_MS) return { d: 'guardImpact', evadeOnset: null };
  if (since <= BODY_PARRY_WINDOW_MS) return { d: 'parried', evadeOnset: null };
  if (s.guardHeld) return { d: 'blocked', evadeOnset: null };
  return { d: 'none', evadeOnset: null };
}

/** A body defence as the DefenseController's action (Showdown, Duel): a slip's i-frames stay 'evaded'. */
export function defenseActionOf(d: BodyDefense): DefenseAction | 'evaded' {
  return d === 'evaded' ? 'evaded' : d === 'guardImpact' ? 'guardImpacted' : d === 'parried' ? 'parried' : d === 'blocked' ? 'blocked' : 'none';
}
const DEFENSE_RANK: readonly (DefenseAction | 'evaded')[] = ['none', 'substituted', 'blocked', 'parried', 'guardImpacted', 'evaded'];
/** The stronger of two answers to one hit — the body's and the pad's, when both hold something (the review, 2026-09-26). */
export function strongerDefense(a: DefenseAction | 'evaded', b: DefenseAction | 'evaded'): DefenseAction | 'evaded' {
  return DEFENSE_RANK.indexOf(b) > DEFENSE_RANK.indexOf(a) ? b : a;
}

/** Hits on a body fighter waiting for the body's frames: each runs once ready (or at the cap), in impact order. */
export class DeferredHits {
  private q: { impact: number; run: (impactPage: number) => void }[] = [];
  push(impactPage: number, run: (impactPage: number) => void): void { this.q.push({ impact: impactPage, run }); }
  flush(ledger: DefenseLedger, now: number): number {
    let n = 0;
    while (this.q.length && ledger.ready(this.q[0].impact, now)) { const h = this.q.shift()!; h.run(h.impact); n++; }
    return n;
  }
  get pending(): number { return this.q.length; }
  /** The earliest impact still waiting (page ms), or Infinity: what the ledger must keep (DefenseLedger.frame's keepFrom). */
  get oldest(): number { return this.q.reduce((a, h) => Math.min(a, h.impact), Infinity); }
  clear(): void { this.q = []; }
}

/**
 * The pad's block, kept apart from the body's (the review, 2026-09-26). Once the body drives, a rival's hit is deferred and
 * resolved against the ledger — and the pad's X, held the whole time, was not in it: a body step with a pad in hand let a
 * hit land through a held block. Now the deferred hit meets both: the pad's block held AT the impact, or its press inside
 * the parry window before it. A body guard coming down lets the mode's block go only when the pad is not holding one.
 */
export class PadBlock {
  private pressAt = -Infinity;
  private releaseAt = -Infinity;
  private down = false;
  press(now: number): void { this.down = true; this.pressAt = now; }
  release(now: number): void { if (this.down) { this.down = false; this.releaseAt = now; } }
  get held(): boolean { return this.down; }
  /** Held at `t`: pressed at or before it and not let go until after it. */
  heldAt(t: number): boolean { return this.pressAt <= t && (this.down || this.releaseAt > t); }
  /** The press at or before `t` inside `windowMs` of it (a parry's), or null. */
  pressWithin(t: number, windowMs: number): number | null { return this.pressAt <= t && t - this.pressAt <= windowMs ? this.pressAt : null; }
  reset(): void { this.pressAt = -Infinity; this.releaseAt = -Infinity; this.down = false; }
}

/** Who is playing: the body while its frames are tracking and the latest input the game had was the body's (P3 Z5). */
export class BodyDriveTracker {
  private bodyAt = -Infinity;
  private padAt = -Infinity;
  body(now: number): void { this.bodyAt = now; }
  pad(now: number): void { this.padAt = now; }
  driven(tracking: boolean): boolean { return tracking && this.bodyAt >= this.padAt && Number.isFinite(this.bodyAt); }
  reset(): void { this.bodyAt = -Infinity; this.padAt = -Infinity; }
}

/** Auto-spacing for a body strike: how far to close (m) on a rival `dist` away for a move of `range`. */
export function bodyLunge(dist: number, range: number): number {
  if (dist > range + BODY_LUNGE_PAD_M) return 0;
  return Math.max(0, Math.min(BODY_LUNGE_M, dist - range * 0.8));
}
/** Auto-spacing for a step: (along the line to the rival m, across m; + = toward the rival / the player's own left). */
export function stepSpace(dir: Extract<BodyFightIntent, { kind: 'step' }>['dir']): { along: number; across: number } {
  return dir === 'in' ? { along: STEP_SPACE_M, across: 0 } : dir === 'out' ? { along: -STEP_SPACE_M, across: 0 }
    : { along: 0, across: dir === 'left' ? SIDE_STEP_M : -SIDE_STEP_M };
}

/** A weapon's swing plane for a body blow (Duel's blade / staff): straight → its first move (a poke / slash), hook → its
 *  second (a sweep / cross cut), uppercut → its third (the overhead / riser). A kick has no weapon move. */
export function planeMove(ids: readonly string[], body: BodyStrike): string | null {
  const k = body === 'jab' || body === 'cross' ? 0 : body === 'hook' ? 1 : body === 'uppercut' ? 2 : -1;
  return k >= 0 ? ids[k] ?? null : null;
}

/** The combat card (ModeBodySpec.lines): what the body does in a fight. */
export const FIGHT_CARD_LINES = [
  { move: 'Punch', verb: 'JAB · CROSS · HOOK · UPPERCUT' },
  { move: 'Kick', verb: 'KICK · ROUNDHOUSE' },
  { move: 'Guard up', verb: 'BLOCK (late = PARRY)' },
  { move: 'Slip / duck', verb: 'DODGE' },
  { move: 'Step', verb: 'STEP' },
] as const;
/** What a combat mode claims for its onBody: the fight read's event kinds, and P2's `punch` / `kick` — claimed so the floor
 *  drops its P3 JAB / KICK presses (a punch is never pressed twice); onBody refuses those two (returns false). */
export const FIGHT_CLAIMS = ['blow', 'legKick', 'guard', 'evade', 'fightStep', 'turn', 'punch', 'kick'] as const;
