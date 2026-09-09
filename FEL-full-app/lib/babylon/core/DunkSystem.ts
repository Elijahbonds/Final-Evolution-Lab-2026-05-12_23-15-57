// DunkSystem — Mode 1 Phase 6: the freestyle in-air dunk core.
//
// NBA Live 07/08's dunk contest was great because of THREE things this
// module implements as pure, testable logic:
//   1. TRICK-INPUT COMBOS — THPS2-style: hold a d-pad direction, tap a face
//      button, thrown DURING the flight window, each mapping to a distinct
//      dunk animation and difficulty. Chain two before the slam window and
//      it's a combo dunk (windmill → 360) worth more than its parts.
//   2. THE IN-AIR WINDOW — airtime is a budget set by approach speed and
//      launch quality; every trick spends window (showboating shrinks your
//      finish timing). Ambition is risk.
//   3. THE FINISH — the SLAM timing window closes the flight: accuracy vs
//      remaining window decides flush / clank / blown.
//
// Animation names are resolver-backed registry clips — distinct animation
// per trick today via the authored/aliased dunk suite.

import type { FelInput } from '../core/InputBus';
import { EASTBAY_TIMING as T } from '../anim/authored/timing';

// ── Trick definitions ──────────────────────────────────────────────────────
// THPS2 / NBA Live 08 style: hold a d-pad DIRECTION, tap a FACE BUTTON — the
// combo fires immediately, no stick-swipe timing to fumble. This is the same
// grammar the board sports already use for grabs/flips (a direction plus a
// button), so the whole game now speaks one physical-input language, and it
// works identically on touch, keyboard, and a real pad (the old version only
// worked on a physical right stick — unreachable on touch or keyboard).
export interface DunkTrick {
  id: string;
  label: string;
  dir: 'up' | 'down' | 'left' | 'right';
  btn: 'A' | 'B' | 'Y';       // X is reserved (inert) on the touch deck for tricks
  clip: string;              // resolver-backed dunk animation
  difficulty: number;        // added to the attempt's difficulty
  windowCost: number;        // fraction of remaining air window consumed
}

export const DUNK_TRICKS: DunkTrick[] = [
  { id: 'windmill', label: 'WINDMILL', dir: 'up', btn: 'A', clip: 'dunk_off_board_windmill', difficulty: 2.4, windowCost: 0.30 },
  { id: 'spin360', label: '360', dir: 'right', btn: 'B', clip: 'dunk_360_scoop', difficulty: 2.8, windowCost: 0.34 },
  { id: 'eastbay', label: 'EASTBAY', dir: 'down', btn: 'Y', clip: 'dunk_360_eastbay', difficulty: 3.4, windowCost: 0.40 },
  { id: 'tomahawk', label: 'TOMAHAWK', dir: 'up', btn: 'Y', clip: 'dunk_finish_tomahawk', difficulty: 2.0, windowCost: 0.24 },
  { id: 'betweenlegs', label: 'BETWEEN THE LEGS', dir: 'down', btn: 'B', clip: 'dunk_360_fake_eastbay', difficulty: 3.8, windowCost: 0.46 },
  // DUNK-CONTROL-JUICE (2026-09-08): the named air dunks — same grammar (hold a direction, tap a button), authored bodies
  { id: 'scorpion', label: 'SCORPION', dir: 'right', btn: 'Y', clip: 'dunk_scorpion', difficulty: 3.2, windowCost: 0.36 },
  { id: 'lostfound', label: 'LOST & FOUND', dir: 'left', btn: 'B', clip: 'dunk_lost_found', difficulty: 3.6, windowCost: 0.42 },
  { id: 'hideseek', label: 'HIDE & SEEK', dir: 'left', btn: 'A', clip: 'dunk_hide_seek', difficulty: 3.0, windowCost: 0.38 },
];

/** Trick id by its clip (the replay re-fires clips; the posture layer wants the trick). */
export const DUNK_TRICK_ID_BY_CLIP: Record<string, string> = Object.fromEntries(DUNK_TRICKS.map((t) => [t.clip, t.id]));

// ── Runway tricks (DUNK-CONTROL-JUICE, 2026-09-08) ─────────────────────────
// Thrown DURING THE HOLD-RUN (the stick steers, so no direction is held): a bare face button while RUN is down. The
// self-lob and the kick-up put the ball in the air ahead of the dunker (a catch in the hang finishes them), the
// cartwheel tosses the lob itself and rolls under it, the double-up is the two-foot hop gather into the takeoff.
// None of them spend the air budget — they are judged as difficulty on top of the flight's own tricks.
export interface RunwayTrick {
  id: 'selflob' | 'kickup' | 'cartwheel' | 'doubleup' | 'offglass' | 'bounce';
  label: string;
  btn: 'A' | 'B' | 'X' | 'Y';
  /** DUNK-GLASS-BOUNCE: a d-pad direction HELD with the button picks a variant (up + Y = off the glass, down + Y = the
   *  bounce lob); a bare button is the plain trick. The stick still steers. */
  dir?: 'up' | 'down' | 'left' | 'right';
  clip: string;
  /** Clip seconds. */
  sec: number;
  difficulty: number;
  /** The ball leaves the body on this clip second (a toss / a kick); undefined = the ball stays in hand. */
  releaseAt?: number;
  /** The run keeps going under the beat at this fraction of the hold-run speed. */
  runScale: number;
}
export const RUNWAY_TRICKS: RunwayTrick[] = [
  { id: 'selflob', label: 'SELF-LOB', btn: 'Y', clip: 'dunk_self_lob', sec: 0.5, difficulty: 1.6, releaseAt: 0.3, runScale: 0.85 },
  { id: 'kickup', label: 'KICK-UP', btn: 'B', clip: 'dunk_kick_up', sec: 0.55, difficulty: 2.2, releaseAt: 0.32, runScale: 0.55 },
  { id: 'cartwheel', label: 'CARTWHEEL', btn: 'X', clip: 'dunk_cartwheel', sec: 0.8, difficulty: 2.8, releaseAt: 0.05, runScale: 0.7 },
  { id: 'doubleup', label: 'DOUBLE-UP', btn: 'A', clip: 'dunk_double_up', sec: 0.5, difficulty: 1.5, runScale: 0.6 },
  // DUNK-GLASS-BOUNCE (2026-09-08): the same two-hand toss thrown AT THE GLASS (the ball comes back off the board to the
  // hand), and a two-hand throw DOWN into the floor that bounces up to the hand once or twice (WDA "Bounce Ball")
  { id: 'offglass', label: 'OFF-GLASS LOB', btn: 'Y', dir: 'up', clip: 'dunk_self_lob', sec: 0.5, difficulty: 2.4, releaseAt: 0.3, runScale: 0.85 },
  { id: 'bounce', label: 'BOUNCE LOB', btn: 'Y', dir: 'down', clip: 'dunk_bounce_throw', sec: 0.5, difficulty: 2.4, releaseAt: 0.3, runScale: 0.85 },
];
/** The runway trick on a button — a held d-pad direction picks that button's variant, a bare press the plain trick. */
export function runwayTrickFor(btn: string, dir: 'up' | 'down' | 'left' | 'right' | null = null): RunwayTrick | null {
  return (dir ? RUNWAY_TRICKS.find((t) => t.btn === btn && t.dir === dir) : null) ?? RUNWAY_TRICKS.find((t) => t.btn === btn && !t.dir) ?? null;
}
export function runwayTrickById(id: RunwayTrick['id']): RunwayTrick { return RUNWAY_TRICKS.find((t) => t.id === id)!; }
/** The double-up is only a double-up inside the last stretch before the takeoff line (metres) at a real run (m/s). */
export const DOUBLE_UP_WINDOW_M = 1.8, DOUBLE_UP_MIN_SPEED = 4;
/** A dunk that catches its own toss (or a passer's) is judged on top of the flight. */
export const CATCH_DIFFICULTY = 1.2;

// ── Cue table (DUNK-BIOMECH, 2026-09-08) ───────────────────────────────────
// Every air trick has a NAMED fire beat. A press before its beat ARMS it (it fires on the beat); a press after its last
// beat is refused with a banner (never a silent nothing, never a mid-flight pop that leaves the torso spun the wrong way
// at the slam). The beats are clip seconds of the flight (EASTBAY_TIMING is the flight's clock in every dunk mode):
//   rise     — the feet have left the floor (0.3): the whole-body tricks start here so they ride the whole flight
//   hang     — the top of the flight (0.7): the shapes (scorpion, tomahawk) read best at the apex
//   preSlam  — the carry-up to the iron (1.0): the last moment a trick can still resolve before the flush
// Facing rule: `spinThrough` tricks turn the body a whole number of turns (the mode drives the turn as a yaw layer on the
// hips — never authored into the clip, so a clip crossfade can never cut it half-way) and are back rim-facing by
// SPIN_RESOLVE_T; `faceRim` tricks keep the chest on the iron throughout (their clips key no hip turn past ±45°).
export type CueBeat = 'rise' | 'hang' | 'preSlam';
export const CUE_BEAT_T: Record<CueBeat, number> = { rise: T.rise, hang: 0.7, preSlam: T.carryUp };   // hang = just under the apex (k = 0.5 at 0.75): a 360 called there is a 0.3 s whip, still resolved by the carry-up
export const CUE_BEAT_LABEL: Record<CueBeat, string> = { rise: 'THE RISE', hang: 'THE HANG', preSlam: 'PRE-SLAM' };
/** Clip second by which a spin is back rim-facing: the carry-up, where the wrist reach for the iron begins. */
export const SPIN_RESOLVE_T = T.carryUp;
export interface DunkCue {
  fire: CueBeat;                          // fires here (an earlier press waits for it)
  last: CueBeat;                          // refused after this beat
  facing: 'spinThrough' | 'faceRim';
  turns?: number;                         // spinThrough: whole turns of the body (+ = the clip's own yaw sense)
}
export const DUNK_CUES: Record<string, DunkCue> = {
  windmill:    { fire: 'rise', last: 'preSlam', facing: 'faceRim' },
  spin360:     { fire: 'rise', last: 'hang',    facing: 'spinThrough', turns: 1 },   // the turn needs the flight: rise → carry-up
  eastbay:     { fire: 'rise', last: 'hang',    facing: 'faceRim' },                 // a 1.5 s body: it has to start early
  tomahawk:    { fire: 'hang', last: 'preSlam', facing: 'faceRim' },
  betweenlegs: { fire: 'rise', last: 'hang',    facing: 'faceRim' },
  scorpion:    { fire: 'hang', last: 'preSlam', facing: 'faceRim' },
  lostfound:   { fire: 'rise', last: 'hang',    facing: 'faceRim' },                 // the behind-the-back hand-off is at 0.32 of its 0.8
  hideseek:    { fire: 'rise', last: 'preSlam', facing: 'faceRim' },
};
export type CueVerdict = 'early' | 'fire' | 'late';
export const cueOf = (trick: DunkTrick): DunkCue => DUNK_CUES[trick.id] ?? { fire: 'rise', last: 'preSlam', facing: 'faceRim' };
export const cueFireAt = (trick: DunkTrick): number => CUE_BEAT_T[cueOf(trick).fire];
export const cueLastAt = (trick: DunkTrick): number => CUE_BEAT_T[cueOf(trick).last];
/** Where a press at clip second `t` lands against the trick's window. */
export function cueVerdict(trick: DunkTrick, t: number): CueVerdict {
  return t < cueFireAt(trick) ? 'early' : t <= cueLastAt(trick) ? 'fire' : 'late';
}

/** The contact latch's unwind rate (rad/s): a spin the flight ended early (the prop, a lost lob) eases to the nearest
 *  whole turn in ~a quarter second, never a snap and never a back-to-rim freeze. */
export const SPIN_SETTLE_RATE = 14;
/** DUNK-BODY-MID: the fraction of a turn's window the turn itself takes — the remainder is the body held square to the
 *  iron before the carry-up's reach. 0.8 keeps the peak rate of even a hang-called 360 (0.30 s of flight) inside 40°/frame. */
export const SPIN_LAND_FRAC = 0.8;
const TAU = Math.PI * 2;
/** The momentum-led turn: a whole number of turns of the hips from clip `from`, resolved (rim-facing again) by clip
 *  `until` whatever the flight has left — fired at the rise it is an easy turn, fired at the hang a quick one. Smoothstep:
 *  a wind-up, the turn, the catch. Pure: the mode reads `yaw` and writes it onto the hips after the clips evaluate. */
export class DunkSpin {
  private turns = 0; private from = 0; private until = 0; private yawNow = 0; private settling = false;
  get yaw(): number { return this.yawNow; }
  /** A turn is in progress or still settling. */
  get active(): boolean { return this.turns !== 0 || this.settling; }
  get record(): { turns: number; from: number; until: number } { return { turns: this.turns, from: this.from, until: this.until }; }
  start(turns: number, from: number, until: number): void {
    this.turns = turns; this.from = from; this.until = Math.max(from + 0.05, until); this.settling = false;
  }
  static yawAt(rec: { turns: number; from: number; until: number }, t: number): number {
    if (!rec.turns) return 0;
    // DUNK-BODY-MID (2026-09-09): the turn LANDS, then the body holds square. The smoothstep ran the full width of the
    // window, so the last tenth of the turn ate its last third — the chest was still coming home while the reach for the
    // iron had already started, and a 360 called at the hang measured 50° off the rim a quarter-second before the jam
    // (the SLAM buffer resolves the flight at the window's opening edge now, which is where that tail became visible).
    // The turn is finished inside SPIN_LAND_FRAC of its window and the rest is a settled, rim-facing beat before the
    // carry-up. Same wind-up, same eased catch, just not spread over the reach.
    const u = Math.min(1, Math.max(0, (t - rec.from) / ((rec.until - rec.from) * SPIN_LAND_FRAC)));
    const k = u * u * (3 - 2 * u);
    return k >= 1 ? 0 : rec.turns * TAU * k;   // a completed turn IS rim-facing: 0, not 2π (nothing to unwind)
  }
  /** Drive from the flight's clip time. */
  update(t: number): number {
    if (this.settling) return this.yawNow;
    this.yawNow = DunkSpin.yawAt(this.record, t);
    if (this.turns && t >= this.until) this.turns = 0;
    return this.yawNow;
  }
  /** The contact latch: from wherever the turn is, ease to the nearest whole turn (rim-facing) at `rate` rad/s. */
  settle(dt: number, rate = SPIN_SETTLE_RATE): number {
    if (this.turns) { this.turns = 0; this.settling = true; }
    if (!this.settling) return this.yawNow;
    const target = Math.round(this.yawNow / TAU) * TAU;
    const d = target - this.yawNow;
    const step = rate * dt;
    if (Math.abs(d) <= step) { this.yawNow = 0; this.settling = false; }
    else this.yawNow += Math.sign(d) * step;
    return this.yawNow;
  }
  reset(): void { this.turns = 0; this.from = 0; this.until = 0; this.yawNow = 0; this.settling = false; }
}

/** DUNK-BODY-MID (2026-09-09): the air a flight needs to hold TWO tricks, decided ONCE at the takeoff from the run-up
 *  (`airTotal`) and never re-litigated mid-flight.
 *
 *  Before this the second trick needed 42 % of the ORIGINAL budget while the first one had already spent 34 % of what
 *  was left, so the owner's own dunk — 360 into a WINDMILL over the car — was refused by a hundredth: measured on the
 *  baseline at c4b86f9, `refused windmill @0.49: air` at 0.41 remaining against a 0.42 bar, off a full-speed run with
 *  a full charge. A combo you are allowed to start and never allowed to finish is not a risk ladder; it is a dropped
 *  input wearing a banner. The run-up buys HOW MANY tricks fit, the cue table decides WHEN each may fire, and the
 *  refusal — when there is one — is knowable before the first trick is ever thrown. */
export const COMBO_AIR_SEC = 1.32;

/** Combo bonus multiplier for chaining a second trick before the slam. */
export const COMBO_CHAIN_BONUS = 1.35;
/** Extra difficulty nod for a combo the judges haven't seen this contest. */
export const FRESH_COMBO_NOD = 0.5;

// ── Trick input recognizer ──────────────────────────────────────────────────
type Dir = 'up' | 'down' | 'left' | 'right';

export class GestureRecognizer {
  private heldDir: Dir | null = null;
  private spent = false;                    // the direction held right now already threw its trick this flight

  /** DUNK-BODY-MID: ONE DIRECTION, ONE TRICK. A direction that has already thrown is STALE until it is let go and
   *  pressed again — so the A that follows a windmill is the SLAM, not a second windmill. (The eye's dump at 99109f7:
   *  UP was still down from the windmill when the slam press arrived, the recognizer read it as another windmill, and
   *  the dunk resolved as a miss named after the trick that had actually landed.) A fresh press re-arms it. */
  get dirSpent(): boolean { return this.spent && this.heldDir !== null; }
  spend(): void { this.spent = true; }

  /** Feed raw input: d-pad presses set/clear the held direction; a face
   *  button tap while a direction is held looks up that combo's trick. A
   *  bare button press (no direction held) matches nothing here — DunkMode
   *  treats that as the separate STYLE TAP showboat, not a named trick. */
  feed(e: FelInput): DunkTrick | null {
    if (e.t === 'dpad') {
      if (e.pressed) { this.heldDir = e.dir; this.spent = false; }
      else if (this.heldDir === e.dir) { this.heldDir = null; this.spent = false; }
      return null;
    }
    if (e.t === 'button' && e.pressed && this.heldDir && (e.btn === 'A' || e.btn === 'B' || e.btn === 'Y')) {
      const dir = this.heldDir;
      return DUNK_TRICKS.find((t) => t.dir === dir && t.btn === e.btn) ?? null;
    }
    return null;
  }

  /** The trick a button press WOULD throw with the direction held now — no state change (the cue arms it for its beat). */
  peek(e: FelInput): DunkTrick | null {
    if (e.t === 'button' && e.pressed && this.heldDir && (e.btn === 'A' || e.btn === 'B' || e.btn === 'Y')) {
      const dir = this.heldDir;
      return DUNK_TRICKS.find((t) => t.dir === dir && t.btn === e.btn) ?? null;
    }
    return null;
  }

  reset(): void { this.heldDir = null; this.spent = false; }
}

// ── Dunk flight state machine ──────────────────────────────────────────────
export type DunkFlightPhase = 'idle' | 'airborne' | 'slamWindow' | 'finished';
export type DunkOutcome = 'flush' | 'clank' | 'blown';

export interface DunkAttempt {
  tricks: DunkTrick[];
  difficulty: number;
  isCombo: boolean;
}

export class DunkFlight {
  phase: DunkFlightPhase = 'idle';
  readonly recognizer = new GestureRecognizer();
  private tricks: DunkTrick[] = [];
  private airTotal = 0;
  private airLeft = 0;
  private baseDifficulty = 0;
  private slamWindow = 0.32;             // seconds of finish timing at full window

  /** Launch: approach speed (0..1) and style tier buy airtime. */
  launch(approachSpeed01: number, styleTier: number, approachDifficulty = 0): void {
    this.phase = 'airborne';
    this.tricks = [];
    this.rejectedForAir = false;
    // Free approach (2026-09-03): the angle and the takeoff foot are judged too.
    this.baseDifficulty = styleTier + approachDifficulty;
    this.airTotal = 0.85 + approachSpeed01 * 0.55 + styleTier * 0.05; // 0.85–1.8s
    this.airLeft = this.airTotal;
    this.recognizer.reset();
  }

  /** Set (once, consumable) when a recognized trick was refused because the
   *  air budget couldn't pay for it. Modes surface this — a silent refusal
   *  reads as a dropped input. */
  rejectedForAir = false;
  /** Why the last take() refused: the air budget, or the two-tricks-a-flight limit. */
  refusal: 'air' | 'limit' | null = null;

  /** Mid-air: feed input; each recognized trick spends window (the finish
   *  timing tightens with every one). How MANY fit was decided at the takeoff
   *  by the run-up — `trickCapacity` — so the run-up genuinely decides what
   *  exists in the air, and the cue table decides when each may fire. */
  feedInput(e: FelInput): DunkTrick | null {
    this.rejectedForAir = false;
    const trick = this.recognizer.feed(e);
    if (!trick) return null;
    return this.take(trick);
  }
  /** The trick a button press would throw now (the direction held), without spending anything. */
  peek(e: FelInput): DunkTrick | null { return this.recognizer.peek(e); }
  /** How many tricks THIS flight can hold: the run-up bought it at the takeoff (COMBO_AIR_SEC), and it does not move
   *  while the player is in the air. A walk-up gets one, a real run-up gets two. */
  get trickCapacity(): number { return this.airTotal >= COMBO_AIR_SEC ? 2 : 1; }
  /** Whether a trick could be taken on this frame — the mode asks BEFORE it turns a press into a refusal banner. */
  canTake(): boolean {
    if (this.phase !== 'airborne' && this.phase !== 'slamWindow') return false;
    return this.tricks.length < this.trickCapacity;
  }
  /** Spend the air for a trick already recognised (a cue armed before its beat fires through here). */
  take(trick: DunkTrick): DunkTrick | null {
    this.rejectedForAir = false; this.refusal = null;
    if (this.phase !== 'airborne' && this.phase !== 'slamWindow') return null;
    // DUNK-BODY-MID (2026-09-09): the AIR is read ONCE, at the takeoff (trickCapacity), never against a remainder the
    // earlier tricks have already spent. Two gates used to sit between a legal press and its trick: a 30 %/42 % share of
    // the ORIGINAL budget, and a blanket refusal the moment the flight entered its own `slamWindow` phase (airLeft ≤ 28 %
    // of the total, which on the minimum 0.85 s budget arrives ~0.6 s into a 1.25 s flight). Both fired inside cue
    // windows the table had already declared open — measured at 99109f7, `refused windmill @0.93: air`, and on the
    // baseline's own combo scenario `refused windmill @0.49: air` at 0.41 against a 0.42 bar. The cue table owns WHEN a
    // trick may fire; the run-up owns HOW MANY fit; nothing owns "not this one, not now, no reason you could have known".
    if (this.tricks.length >= this.trickCapacity) {
      if (this.tricks.length >= 2) this.refusal = 'limit';                  // DUNK-BIOMECH: a third trick is refused OUT LOUD
      else { this.rejectedForAir = true; this.refusal = 'air'; }            // a walk-up never had the air for a second one
      return null;
    }
    this.tricks.push(trick);
    this.airLeft *= 1 - trick.windowCost;    // showboating costs air
    this.slamWindow *= 1 - trick.windowCost * 0.5;
    return trick;
  }

  update(dt: number): void {
    if (this.phase !== 'airborne') return;
    this.airLeft -= dt;
    if (this.airLeft <= this.airTotal * 0.28) this.phase = 'slamWindow';
  }

  /** The attempt summary for scoring/animation. */
  get attempt(): DunkAttempt {
    const isCombo = this.tricks.length >= 2;
    const raw = this.baseDifficulty + this.tricks.reduce((s, t) => s + t.difficulty, 0);
    return {
      tricks: [...this.tricks],
      difficulty: isCombo ? raw * COMBO_CHAIN_BONUS : raw,
      isCombo,
    };
  }

  get currentTrick(): DunkTrick | null { return this.tricks[this.tricks.length - 1] ?? null; }
  get inSlamWindow(): boolean { return this.phase === 'slamWindow'; }
  get airRemaining01(): number { return this.airTotal > 0 ? Math.max(0, this.airLeft / this.airTotal) : 0; }
  /** Product of each trick's window tax — modes multiply their slam window
   *  by this (showboating tightens the finish, like Live's risk ladder). */
  get slamWindowScale(): number {
    return this.tricks.reduce((s, t) => s * (1 - t.windowCost * 0.5), 1);
  }

  /** Finish with a timing accuracy (0..1 — 1 = dead-center slam press). */
  finish(accuracy01: number): DunkOutcome {
    this.phase = 'finished';
    const need = 1 - Math.min(0.9, this.slamWindow);   // harder windows demand accuracy
    if (accuracy01 >= Math.max(0.55, need)) return 'flush';
    if (accuracy01 >= 0.3) return 'clank';
    return 'blown';
  }

  reset(): void {
    this.phase = 'idle';
    this.tricks = [];
    this.rejectedForAir = false;
    this.recognizer.reset();
  }
}
