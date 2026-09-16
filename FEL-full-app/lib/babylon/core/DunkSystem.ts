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
    // was `dunk_360_fake_eastbay`, which aliases to the EASTBAY's own clip — the hardest trick in the list
  // played the body of a different trick. It has its own now (anim/authored/dunkTricks.buildBetweenLegs).
  { id: 'betweenlegs', label: 'BETWEEN THE LEGS', dir: 'down', btn: 'B', clip: 'dunk_between_legs', difficulty: 3.8, windowCost: 0.46 },
  // DUNK-CONTROL-JUICE (2026-09-08): the named air dunks — same grammar (hold a direction, tap a button), authored bodies
  { id: 'scorpion', label: 'SCORPION', dir: 'right', btn: 'Y', clip: 'dunk_scorpion', difficulty: 3.2, windowCost: 0.36 },
  // a behind-the-back self-oop AND a 360: the hardest thing in the list, and the audit's reason for the bump
  { id: 'lostfound', label: 'LOST & FOUND', dir: 'left', btn: 'B', clip: 'dunk_lost_found', difficulty: 4.0, windowCost: 0.46 },
  { id: 'hideseek', label: 'HIDE & SEEK', dir: 'left', btn: 'A', clip: 'dunk_hide_seek', difficulty: 3.0, windowCost: 0.38 },
  // 2026-09-14: four of the twelve direction+button slots were unused, and two iconic bodies were missing.
  // A CARRY (one hand the whole way) and a VERTICAL (the ball travels, the body barely does) -- deliberately
  // different in kind from the transfers above, so the vocabulary grows in shape and not just in count.
  { id: 'cradle', label: 'ROCK THE CRADLE', dir: 'right', btn: 'A', clip: 'dunk_cradle', difficulty: 2.6, windowCost: 0.32 },
  { id: 'clutch', label: 'DOUBLE CLUTCH', dir: 'down', btn: 'A', clip: 'dunk_double_clutch', difficulty: 3.0, windowCost: 0.36 },
];

/** Trick id by its clip (the replay re-fires clips; the posture layer wants the trick). */
export const DUNK_TRICK_ID_BY_CLIP: Record<string, string> = Object.fromEntries(DUNK_TRICKS.map((t) => [t.clip, t.id]));

// ── Runway tricks (DUNK-CONTROL-JUICE, 2026-09-08) ─────────────────────────
// Thrown DURING THE HOLD-RUN (the stick steers, so no direction is held): a bare face button while RUN is down. The
// self-lob and the kick-up put the ball in the air ahead of the dunker (a catch in the hang finishes them), the
// cartwheel tosses the lob itself and rolls under it, the double-up is the two-foot hop gather into the takeoff.
// None of them spend the air budget — they are judged as difficulty on top of the flight's own tricks.
export interface RunwayTrick {
  id: 'selflob' | 'kickup' | 'cartwheel' | 'doubleup' | 'offglass' | 'bounce' | 'backflip';
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
  /** Short name for the runway teaching line. Undefined = a PROP throws this one, so there is nothing to teach. */
  teach?: string;
}
export const RUNWAY_TRICKS: RunwayTrick[] = [
  { id: 'selflob', label: 'SELF-LOB', btn: 'Y', clip: 'dunk_self_lob', sec: 0.5, difficulty: 1.6, releaseAt: 0.3, runScale: 0.85, teach: 'LOB' },
  { id: 'kickup', label: 'KICK-UP', btn: 'B', clip: 'dunk_kick_up', sec: 0.55, difficulty: 2.2, releaseAt: 0.32, runScale: 0.55, teach: 'KICK-UP' },
  { id: 'cartwheel', label: 'BACK HANDSPRING', btn: 'X', clip: 'dunk_back_handspring', sec: 0.8, difficulty: 2.8, releaseAt: 0.05, runScale: 0.7, teach: 'HANDSPRING' },
  { id: 'doubleup', label: 'DOUBLE-UP', btn: 'A', clip: 'dunk_double_up', sec: 0.5, difficulty: 1.5, runScale: 0.6, teach: 'DOUBLE-UP' },
  // DUNK-GLASS-BOUNCE (2026-09-08): the same two-hand toss thrown AT THE GLASS (the ball comes back off the board to the
  // hand), and a two-hand throw DOWN into the floor that bounces up to the hand once or twice (WDA "Bounce Ball")
  // THE BACKFLIP (owner, 2026-09-16). B is the kick-up; B with UP held is the flip — the ball goes up ahead of you, you
  // turn over under it, land running and take it to the rim. Hardest thing on the runway, and it costs the most speed.
  { id: 'backflip', label: 'BACKFLIP', btn: 'B', dir: 'up', clip: 'dunk_backflip', sec: 0.9, difficulty: 3.4, releaseAt: 0.06, runScale: 0.45, teach: 'FLIP' },
  { id: 'offglass', label: 'OFF-GLASS LOB', btn: 'Y', dir: 'up', clip: 'dunk_self_lob', sec: 0.5, difficulty: 2.4, releaseAt: 0.3, runScale: 0.85 },
  { id: 'bounce', label: 'BOUNCE LOB', btn: 'Y', dir: 'down', clip: 'dunk_bounce_throw', sec: 0.5, difficulty: 2.4, releaseAt: 0.3, runScale: 0.85 },
];
/** The runway trick on a button — a held d-pad direction picks that button's variant, a bare press the plain trick. */
export function runwayTrickFor(btn: string, dir: 'up' | 'down' | 'left' | 'right' | null = null): RunwayTrick | null {
  return (dir ? RUNWAY_TRICKS.find((t) => t.btn === btn && t.dir === dir) : null) ?? RUNWAY_TRICKS.find((t) => t.btn === btn && !t.dir) ?? null;
}
export function runwayTrickById(id: RunwayTrick['id']): RunwayTrick { return RUNWAY_TRICKS.find((t) => t.id === id)!; }
// THE DOUBLE-UP WINDOW IS FORGIVING (owner, 2026-09-16: "the double-up window made forgiving").
//
// A is the jump. A on the run inside this window is the two-foot GATHER into the jump instead — which means a press one
// stride too early does not read as a double-up, it TAKES OFF, and the player never learns the move exists. At 1.8 m
// and 4 m/s the window was ~0.26 s wide at a full run: an expert input for a move nothing teaches. 3.2 m at 3 m/s is
// about half a second, still unmistakably "as you gather", and the runway now says DOUBLE-UP out loud while you are in
// it (runwayTeachLine).
export const DOUBLE_UP_WINDOW_M = 3.2, DOUBLE_UP_MIN_SPEED = 3;
/** Is a double-up on, here, at this speed? */
export function doubleUpFits(distToLine: number, speed: number): boolean {
  return distToLine <= DOUBLE_UP_WINDOW_M && speed >= DOUBLE_UP_MIN_SPEED;
}

/**
 * THE RUNWAY TEACHES ITS OWN MOVES (owner, 2026-09-16: "teach them on the runway").
 *
 * Every runway trick is a bare face button thrown while RUN is held, which is not a thing a player discovers — and the
 * pass added three more of them (the back handspring, the backflip, the kick-up). So the hold-run hint IS the move list,
 * built from RUNWAY_TRICKS itself: add a trick with a `teach` name and the runway starts teaching it, with no second
 * place to update and forget. The prop-thrown variants (off-glass, bounce) carry no `teach` — the prop throws those.
 *
 * The double-up is the one that changes: it is only a double-up in the window, so it is only offered in the window, and
 * when you are in it, it is the whole line.
 */
export function runwayTeachLine(s: { distToLine: number; speed: number; ballThrown: boolean }): string {
  if (s.ballThrown) return 'CATCH IT — take it to the rim';
  if (doubleUpFits(s.distToLine, s.speed)) return 'DOUBLE-UP — tap A · or release to jump';
  const moves = RUNWAY_TRICKS.filter((t) => t.teach && t.id !== 'doubleup')
    .map((t) => `${t.btn}${t.dir === 'up' ? '+UP' : ''} ${t.teach}`);
  return `${moves.join(' · ')} — then release to jump`;
}
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
  // LOST & FOUND is a 360 (audit, 2026-09-16): Kilganon throws it behind his own back and turns a full revolution under
  // it. The turn is the layer's, never the clip's — see anim/authored/dunkTricks.buildLostFound.
  lostfound:   { fire: 'rise', last: 'hang',    facing: 'spinThrough', turns: 1 },   // the behind-the-back hand-off is at 0.32 of its 0.8
  hideseek:    { fire: 'rise', last: 'preSlam', facing: 'faceRim' },
  cradle:      { fire: 'rise', last: 'hang',    facing: 'faceRim' },                 // the circle needs most of the flight
  clutch:      { fire: 'hang', last: 'preSlam', facing: 'faceRim' },                 // the clutch reads at the APEX, not on the way up
};
// ── THE TIMING READOUT (2026-09-14) ──────────────────────────────────────────────────────────────────────
//
// From the review: the game computes exactly what a player needs to improve and then does not tell them.
// A made dunk logged `buffered press @0.99 fired at the window (117 ms early, execution 0.29)` to
// console.info — the player saw a number between 30 and 50 and no idea which of difficulty, execution or
// style they had just lost.
//
// The execution CURVE is not the problem and is not touched here: it is deliberate, and the source already
// records why a flat floor for buffered presses was tried and rejected (it put a cliff on the window's
// opening edge where pressing one frame earlier scored better). What was missing is the sentence.
//
// Pure so the phrasing lives in one place — a mode that wrote its own would drift from the number.

/** How far off the perfect beat still reads as "on time" rather than early or late. */
export const SLAM_ONTIME_MS = 45;

export interface SlamReadout {
  /** Signed milliseconds from the perfect beat: negative early, positive late. */
  offsetMs: number;
  /** 0..1, the execution the judges will actually score. */
  execution01: number;
  /** Where the finger was: on the cue (before the window opened), inside it, or late. */
  zone: 'cue' | 'early' | 'ontime' | 'late';
  /** The one line the bezel prints. */
  label: string;
}

/**
 * What the player's finger did, in words.
 *
 * `at` and `center` are clip seconds — the same units the window is defined in — because the mode already
 * has both and converting to wall-clock here would make the number disagree with the scoring.
 */
export function slamReadout(at: number, center: number, execution01: number, half = 0): SlamReadout {
  const offsetMs = Math.round((at - center) * 1000);
  const exec = Math.max(0, Math.min(1, Number.isFinite(execution01) ? execution01 : 0));
  const pct = Math.round(exec * 100);
  // A press the BUFFER caught is not the same mistake as a press inside the window, and the player cannot learn from
  // "540 ms EARLY" alone — that press was made when the game said SLAM. Naming the cue names the lesson: you were
  // answering the read, and the beat is later than the read.
  const zone: SlamReadout['zone'] = Math.abs(offsetMs) <= SLAM_ONTIME_MS ? 'ontime'   // the band comes first: 20 ms late is ON TIME, not late
    : offsetMs > 0 ? 'late'
    : half > 0 && -offsetMs / 1000 > half ? 'cue' : 'early';
  const when = zone === 'ontime' ? 'ON TIME'
    : zone === 'cue' ? `ON THE CUE — ${Math.abs(offsetMs)} ms BEFORE THE BEAT`
    : `${Math.abs(offsetMs)} ms ${offsetMs < 0 ? 'EARLY' : 'LATE'}`;
  return { offsetMs, execution01: exec, zone, label: `${when} · EXECUTION ${pct}%` };
}

// ── THE EXECUTION CURVE (dunk 10-phase pass P2, 2026-09-16) ────────────────────────────────────────────
//
// The flight INVITES a press from the top of the arc — the SLAM read lifts there, the buffer holds the press and fires
// it on the frame the window opens, and the dunk goes down. The execution curve did not agree with that invitation: it
// fell to zero a fixed 0.22 s before the window, while the buffer reaches back as far as the apex (0.43 s on the
// measured flight). So the game said SLAM, took the press, flushed the dunk — and scored the player 0 %.
//
// Measured on rc22 with scripts/probes/_dunk-lab.mts: pressing on the game's own prompt scored EXECUTION 0 % and a
// 37 card; pressing near the window scored 68 % and a 42. A prompt that costs you everything for obeying it is not a
// difficulty curve, it is a trap.
//
// One continuous curve, monotone from the earliest accepted press to the latest, with no cliff at the window's edge
// (the old two-branch attempt put one there — pressing a frame EARLIER scored better, which is worse than the trap):
//
//   at the centre of the window ............ 1.00   the perfect beat
//   at the window's opening edge ........... EDGE   still a good dunk
//   at the earliest the buffer reaches ..... CUE    made, and paid like a flinch
//   later than the window's close .......... 0      (the window is over; this is a miss, scored elsewhere)
//
// `reachSec` is how far in front of the window's EDGE a press is still taken — the mode's own buffer, so the curve and
// the acceptance can never drift apart again.
export const SLAM_EDGE_EXEC = 0.72;
export const SLAM_CUE_EXEC = 0.25;
export function slamExecution(at: number, center: number, half: number, reachSec: number): number {
  const h = Math.max(1e-4, half);
  const d = at - center;
  if (d >= 0) return Math.max(0, 1 - d / h);                                  // late of the beat: across the window's own half
  const early = -d;
  if (early <= h) return 1 - (1 - SLAM_EDGE_EXEC) * (early / h);              // inside the window, before the beat
  const reach = Math.max(1e-4, reachSec);
  const intoBuffer = Math.min(1, (early - h) / reach);                        // in the buffer the cue invited
  return Math.max(0, SLAM_EDGE_EXEC - (SLAM_EDGE_EXEC - SLAM_CUE_EXEC) * intoBuffer);
}

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

// ── NAMED DUNKS (2026-09-16) ──────────────────────────────────────────────────────────────────────────
//
// Some combinations are not a combo, they are a DUNK, with a name and somebody's name on it. The vocabulary already
// carries other people's — SCORPION, LOST & FOUND and HIDE & SEEK are Jordan Kilganon's, the EASTBAY is the East Bay
// Funk Dunk — and the first one in here is the owner's own: the KICK-UP EASTBAY, kicking the ball up to yourself off
// your own foot on the runway and taking it between the legs in the air.
//
// A signature is recognised from what was actually thrown (the runway trick and the air tricks, in order), pays a
// small nod on top of its parts, and is announced by its name instead of the generic "X → Y DUNK!". Adding one is a
// row in this table — deliberately, because the owner invents these faster than a code path can be designed for each.
export interface SignatureDunk {
  id: string;
  /** The runway trick it opens with, if any. */
  runway?: RunwayTrick['id'];
  /** The air tricks, in the order they must be thrown. */
  air: readonly string[];
  name: string;
  /** Whose dunk it is. Printed with the name — credit is the point. */
  by: string;
  /** Difficulty nod on top of the parts, for doing the whole thing. */
  nod: number;
}
export const SIGNATURE_DUNKS: readonly SignatureDunk[] = [
  { id: 'kickup_eastbay', runway: 'kickup', air: ['eastbay'], name: 'THE KICK-UP EASTBAY', by: 'Elijah Bonds', nod: 1.2 },
] as const;

/** The signature this attempt threw, if it threw one. Order matters: a signature is a sequence, not a set. */
export function signatureFor(runway: readonly string[], air: readonly string[]): SignatureDunk | null {
  for (const sig of SIGNATURE_DUNKS) {
    if (sig.runway && !runway.includes(sig.runway)) continue;
    if (sig.air.length !== air.length) continue;
    if (sig.air.some((id, i) => air[i] !== id)) continue;
    return sig;
  }
  return null;
}

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
