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
  btn: 'A' | 'B' | 'X' | 'Y';   // X was reserved and inert; the chain pieces (2026-09-16) are what finally use it
  clip: string;              // resolver-backed dunk animation
  difficulty: number;        // added to the attempt's difficulty
  windowCost: number;        // fraction of remaining air window consumed
}

export const DUNK_TRICKS: DunkTrick[] = [
  { id: 'windmill', label: 'WINDMILL', dir: 'up', btn: 'A', clip: 'dunk_windmill_air', difficulty: 2.4, windowCost: 0.30 },   // DUNK MOTION phase 6: its own capture, the circle at real speed
  { id: 'spin360', label: '360', dir: 'right', btn: 'B', clip: 'dunk_360_scoop', difficulty: 2.8, windowCost: 0.34 },
  { id: 'eastbay', label: 'EASTBAY', dir: 'down', btn: 'Y', clip: 'dunk_360_eastbay', difficulty: 3.4, windowCost: 0.40 },
  { id: 'tomahawk', label: 'TOMAHAWK', dir: 'up', btn: 'Y', clip: 'dunk_tomahawk_air', difficulty: 2.0, windowCost: 0.24 },   // DUNK MOTION phase 6: the wind-up at real speed
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
  // THE CHAIN PIECES (owner, 2026-09-16: "add combinations of dunks you can chain together"). The combos he named —
  // behind-the-back between-the-legs, 360 double eastbay, (fake) behind-the-back scorpion, 360 eastbay scorpion — all
  // need parts the vocabulary did not have. X was never read in the air, so four slots were sitting unused: the plain
  // BEHIND THE BACK (ours only had it welded to a 360, inside LOST & FOUND), the FAKE of it, and the DOUBLE EASTBAY —
  // two passes through the legs in one jump, the Team Flight Brothers staple.
  { id: 'behindback', label: 'BEHIND THE BACK', dir: 'left', btn: 'Y', clip: 'dunk_behind_back', difficulty: 3.0, windowCost: 0.34 },
  { id: 'fakeback', label: 'FAKE BEHIND THE BACK', dir: 'left', btn: 'X', clip: 'dunk_fake_back', difficulty: 2.6, windowCost: 0.30 },
  { id: 'doubleeastbay', label: 'DOUBLE EASTBAY', dir: 'down', btn: 'X', clip: 'dunk_double_eastbay', difficulty: 4.4, windowCost: 0.50 },
  // MORE OF THE VOCABULARY (owner, 2026-09-16: "360 fake eastbay … whirlwind dunk … tap dunk", then "whirlwind is a 360
  // tap dunk, add 360 windmills too"). I had the whirlwind wrong first time — I built it as a 360 windmill on the press
  // reports of Aaron Gordon's. The owner's is the right one, and it is a CHAIN (spin360 + tap, see SIGNATURE_DUNKS), so
  // the body I had written is what it always actually was: a 360 WINDMILL, which is worth its own press.
  // The FAKE EASTBAY is the between-the-legs that never goes through (there was a dead `dunk_360_fake_eastbay` alias in
  // the clip table for a dunk that had never been authored). THE TAP is the one dunk in the list with no grip in it.
  { id: 'windmill360', label: '360 WINDMILL', dir: 'up', btn: 'X', clip: 'dunk_360_windmill', difficulty: 3.6, windowCost: 0.42 },
  { id: 'fakeeastbay', label: 'FAKE EASTBAY', dir: 'right', btn: 'X', clip: 'dunk_fake_eastbay', difficulty: 3.0, windowCost: 0.34 },
  { id: 'tap', label: 'THE TAP', dir: 'up', btn: 'B', clip: 'dunk_tap', difficulty: 2.8, windowCost: 0.26 },
];

/**
 * THE 720 (owner, 2026-09-24: "720"). Two whole turns before the slam — Taurian "Air Up There" Fontenette threw the first one on an
 * AND1 fast break in 2006. The sixteen direction + button slots are all taken, and a 720 is not a different dunk from the 360, it is
 * MORE of it: so it is the 360's press thrown AGAIN while the first turn is still going (or twice before the rise). The turn carries
 * straight on into a second revolution (DunkSpin.extend: the same speed, no restart), and the flight holds one trick, not two.
 */
export const SPIN_720: DunkTrick = { id: 'spin720', label: '720', dir: 'right', btn: 'B', clip: 'dunk_720_spin', difficulty: 4.6, windowCost: 0.5 };
/** The 360 can become a 720 until this far through its turn (the second revolution needs the rest of the window). */
export const SPIN_720_UPGRADE_BY = 0.55;

/** Trick id by its clip (the replay re-fires clips; the posture layer wants the trick). */
export const DUNK_TRICK_ID_BY_CLIP: Record<string, string> = Object.fromEntries([...DUNK_TRICKS, SPIN_720].map((t) => [t.clip, t.id]));

// ── Runway tricks (DUNK-CONTROL-JUICE, 2026-09-08) ─────────────────────────
// Thrown DURING THE HOLD-RUN (the stick steers, so no direction is held): a bare face button while RUN is down. The
// self-lob and the kick-up put the ball in the air ahead of the dunker (a catch in the hang finishes them), the
// cartwheel tosses the lob itself and rolls under it, the double-up is the two-foot hop gather into the takeoff.
// None of them spend the air budget — they are judged as difficulty on top of the flight's own tricks.
export interface RunwayTrick {
  id: 'selflob' | 'kickup' | 'handspring' | 'cartwheel' | 'offglass' | 'bounce' | 'backflip';
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
  // DUNK MOTION phase 10b (owner, 2026-09-24: "make my kick up more accurate"): his own, from his "2 new dunks" video — bent over the
  // dribble, the ball flicked up off the foot from the floor, into the take-off and caught in the air. The ball is ON the foot at the
  // contact (it used to free-fall to the floor while the foot kicked the air at waist height)
  { id: 'kickup', label: 'KICK-UP', btn: 'B', clip: 'dunk_kick_up', sec: 0.5, difficulty: 2.2, releaseAt: 0.24, runScale: 0.6, teach: 'KICK-UP' },
  { id: 'handspring', label: 'BACK HANDSPRING', btn: 'X', clip: 'dunk_back_handspring', sec: 0.8, difficulty: 2.8, releaseAt: 0.05, runScale: 0.7, teach: 'HANDSPRING' },
  // JUS FLY'S CARTWHEEL (owner, 2026-09-24: "add the jusflys cartwheel dunk"). Justin "Jus Fly" Darlington throws the ball down, goes
  // over in a real cartwheel — side-on, hand, hand, foot, foot — and grabs the ball on its way up off the bounce, then takes it under the
  // legs and slams it with the right hand (THE CARTWHEEL EASTBAY below). X is the gymnastics button; DOWN is the ball into the floor.
  { id: 'cartwheel', label: 'CARTWHEEL', btn: 'X', dir: 'down', clip: 'dunk_cartwheel', sec: 1.0, difficulty: 3.0, releaseAt: 0.1, runScale: 0.35, teach: 'CARTWHEEL' },
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
// (DUNK MOTION phase 10, owner decision 2026-09-23: that two-foot hop was a misreading of "double-up" — the owner's word is the DUBBLE UP,
// over a helper holding the ball on his head (DunkObstacles). The hop is gone; A on the run is the take-off.)

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
/** DUNK MOTION phase 8 (owner decision, 2026-09-23: "triangle commits"). On the RUN a bare Y is the attempt: the runner bends
 *  into the J from wherever they are (the run is otherwise straight where the stick points). The self-lob is Y STANDING;
 *  Y + up / down still throws the glass and bounce lobs on the run. */
export const RUN_COMMIT_TEACH = 'GO UP';
/** Runway tricks thrown from standing, not on the run. */
export const STANDING_ONLY = new Set(['selflob']);
export function runwayTeachLine(s: { distToLine: number; speed: number; ballThrown: boolean; committed?: boolean; dubble?: boolean }): string {
  if (s.ballThrown) return 'CATCH IT — take it to the rim';
  if (s.dubble) return 'DUBBLE UP — A to go up over him · the ball comes off his head in the air';   // DUNK MOTION phase 10
  const moves = RUNWAY_TRICKS.filter((t) => t.teach && !STANDING_ONLY.has(t.id))
    .map((t) => `${t.btn}${t.dir ? `+${t.dir.toUpperCase()}` : ''} ${t.teach}`);
  if (!s.committed) moves.unshift(`Y ${RUN_COMMIT_TEACH}`);
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
  // DUNK MOTION phase 4 (2026-09-23): the windmill's circle happens at the TOP of the jump and comes straight over into the
  // flush (Wilkins). Fired at the rise, its 0.6 s capture was over by the hang and the flight waited 0.4 s for the slam.
  windmill:    { fire: 'rise', last: 'hang', facing: 'faceRim' },   // phase 6: the circle at real speed (0.85 s) needs the flight from the rise; paced to the slam
  spin360:     { fire: 'rise', last: 'hang',    facing: 'spinThrough', turns: 1 },   // the turn needs the flight: rise → carry-up
  spin720:     { fire: 'rise', last: 'hang',    facing: 'spinThrough', turns: 2 },   // phase 10b: the 360 thrown again — two turns in the same window
  eastbay:     { fire: 'rise', last: 'hang',    facing: 'faceRim' },                 // a 1.5 s body: it has to start early
  tomahawk:    { fire: 'hang', last: 'preSlam', facing: 'faceRim' },
  betweenlegs: { fire: 'rise', last: 'hang',    facing: 'faceRim' },
  scorpion:    { fire: 'hang', last: 'preSlam', facing: 'faceRim' },
  // LOST & FOUND is a 360 (audit, 2026-09-16): Kilganon throws it behind his own back and turns a full revolution under
  // it. The turn is the layer's, never the clip's — see anim/authored/dunkTricks.buildLostFound.
  lostfound:   { fire: 'rise', last: 'hang',    facing: 'spinThrough', turns: 1 },   // the behind-the-back hand-off is at 0.32 of its 0.8
  hideseek:    { fire: 'rise', last: 'preSlam', facing: 'faceRim' },
  cradle:      { fire: 'rise', last: 'hang',    facing: 'faceRim' },                 // DUNK MOTION phase 6: Jordan's rock — down to the hip, back, and one big arc over; it needs the flight
  clutch:      { fire: 'hang', last: 'preSlam', facing: 'faceRim' },                 // the clutch reads at the APEX, not on the way up
  behindback:  { fire: 'rise', last: 'hang',    facing: 'faceRim' },                 // the ball has to go round the back and come back out before the carry-up
  fakeback:    { fire: 'rise', last: 'preSlam', facing: 'faceRim' },                 // a fake is fast: it can be thrown late and still read
  doubleeastbay: { fire: 'rise', last: 'hang',  facing: 'faceRim' },                 // two passes need the whole flight
  windmill360: { fire: 'rise', last: 'hang',    facing: 'spinThrough', turns: 1 },   // a windmill turned all the way round — the layer owns the turn, the arm owns the circle
  fakeeastbay: { fire: 'rise', last: 'preSlam', facing: 'faceRim' },                 // a fake is quick, so it can be thrown late
  tap:         { fire: 'hang', last: 'preSlam', facing: 'faceRim' },                 // the tap happens AT the rim or not at all
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
/** A turn's plan: `turns` whole turns in all (the target is turns·2π), leaving yaw `y0` at rate `v0` (rad per clip second) at
 *  `from` — 0 and 0 for a turn from standing — and landed inside SPIN_LAND_FRAC of the window to `until`. `prev` is the plan it grew
 *  out of (the 360 a 720 extended), `start` where the whole turn began. */
export interface SpinRecord { turns: number; from: number; until: number; y0?: number; v0?: number; prev?: SpinRecord; start?: number }
export class DunkSpin {
  private turns = 0; private from = 0; private until = 0; private yawNow = 0; private settling = false;
  private y0 = 0; private v0 = 0; private prev: SpinRecord | undefined; private start0: number | undefined;
  get yaw(): number { return this.yawNow; }
  /** A turn is in progress or still settling. */
  get active(): boolean { return this.turns !== 0 || this.settling; }
  get record(): SpinRecord {
    const r: SpinRecord = { turns: this.turns, from: this.from, until: this.until };
    if (this.y0 || this.v0) { r.y0 = this.y0; r.v0 = this.v0; }
    if (this.prev) { r.prev = this.prev; r.start = this.start0; }
    return r;
  }
  start(turns: number, from: number, until: number): void {
    this.turns = turns; this.from = from; this.until = Math.max(from + 0.05, until); this.settling = false;
    this.y0 = 0; this.v0 = 0; this.prev = undefined; this.start0 = undefined;
  }
  /**
   * DUNK MOTION phase 10b (the 720): add `extra` whole turns to the turn in flight, from clip `t`, landed by `until`. The new plan
   * leaves from exactly where the body is and exactly as fast as it is turning (a cubic Hermite from the current yaw and rate to the
   * new whole turn), so the second revolution is the first one carrying on — never a restart. False if nothing is turning.
   */
  extend(extra: number, t: number, until: number): boolean {
    if (!this.turns || this.settling || !extra) return false;
    const rec = this.record, h = 1 / 240;
    const y = DunkSpin.yawAt(rec, t);
    const v = (DunkSpin.yawAt(rec, t + h) - DunkSpin.yawAt(rec, Math.max(rec.from, t - h))) / (t + h - Math.max(rec.from, t - h));
    this.prev = rec; this.start0 = rec.start ?? rec.from;
    this.turns += extra; this.from = t; this.until = Math.max(t + 0.05, until); this.y0 = y; this.v0 = v;
    return true;
  }
  static yawAt(rec: SpinRecord, t: number): number {
    if (!rec.turns) return 0;
    if (rec.prev && t < rec.from) return DunkSpin.yawAt(rec.prev, t);
    // DUNK-BODY-MID (2026-09-09): the turn LANDS, then the body holds square. The smoothstep ran the full width of the
    // window, so the last tenth of the turn ate its last third — the chest was still coming home while the reach for the
    // iron had already started, and a 360 called at the hang measured 50° off the rim a quarter-second before the jam
    // (the SLAM buffer resolves the flight at the window's opening edge now, which is where that tail became visible).
    // The turn is finished inside SPIN_LAND_FRAC of its window and the rest is a settled, rim-facing beat before the
    // carry-up. Same wind-up, same eased catch, just not spread over the reach.
    // (phase 10b: written as the cubic Hermite from (y0, v0) to the whole turn at rest — with y0 = v0 = 0 it IS that smoothstep.)
    const d = (rec.until - rec.from) * SPIN_LAND_FRAC;
    const u = Math.min(1, Math.max(0, (t - rec.from) / d));
    const u2 = u * u, u3 = u2 * u, k = 3 * u2 - 2 * u3;
    if (u >= 1 || k >= 1) return 0;   // a completed turn IS rim-facing: 0, not 2π (nothing to unwind)
    return (2 * u3 - 3 * u2 + 1) * (rec.y0 ?? 0) + (u3 - 2 * u2 + u) * d * (rec.v0 ?? 0) + k * rec.turns * TAU;
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
  reset(): void { this.turns = 0; this.from = 0; this.until = 0; this.yawNow = 0; this.settling = false; this.y0 = 0; this.v0 = 0; this.prev = undefined; this.start0 = undefined; }
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
/**
 * THREE IN ONE FLIGHT (owner, 2026-09-16: "360 eastbay scorpion").
 *
 * A third trick is not a third of the same thing — it is the top of the mode, and it should cost the run-up everything.
 * THE RUN-UP OWNS HOW MANY FIT — that is this mode's own rule, and the triple obeys it rather than inventing a second
 * one. The budget is `0.85 + approachSpeed01 * 0.55 + styleTier * 0.05` (1.8 max), and 1.55 is exactly a FULL-SPEED
 * attack: attack the rim properly and you have three, amble in and you do not. Calling a style above POWER buys a
 * little slack on the speed, which is the right shape — it should reward the call, not require it.
 *
 * I set this at 1.72 first (SIGNATURE *and* near-perfect speed) and then 1.66, and measured both in the lab as a flat
 * "TWO TRICKS A FLIGHT" on a full-speed signature run: a chain the owner had asked for that nothing could throw. The
 * window still pays for it — three tricks take roughly half the slam window between them — and the cue table still has
 * to let all three fire, which at a real cadence is the hard part.
 *
 * And NOT 1.55, which is what a full-speed POWER attack "equals": `0.85 + 1 * 0.55 + 3 * 0.05` evaluates to
 * 1.5499999999999998, so the bar it was supposed to sit exactly on refused it every time. A threshold placed on the
 * exact value of a float sum is a coin toss decided by the last bit; 1.50 leaves it room (~92 % speed at POWER, less
 * with a style called).
 */
export const TRIPLE_AIR_SEC = 1.50;

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
  // DUNK MOTION phase 10b (owner, 2026-09-24). Jus Fly's, from the Nike dunk contest: the cartwheel, the grab off the bounce, under the
  // legs, the right hand. And the 720 — two whole turns before the slam — first thrown by Taurian "Air Up There" Fontenette (AND1, 2006).
  { id: 'cartwheel_eastbay', runway: 'cartwheel', air: ['eastbay'], name: 'THE CARTWHEEL EASTBAY', by: 'Jus Fly', nod: 1.6 },
  { id: '720', air: ['spin720'], name: 'THE 720', by: 'Taurian Fontenette', nod: 1.4 },
  // THE CHAINS (owner, 2026-09-16). Named combinations, in the order they have to be thrown — a signature is a
  // sequence, not a set, so throwing the same two the other way round is a combo but not THIS combo.
  { id: 'btb_btl', air: ['behindback', 'betweenlegs'], name: 'BEHIND THE BACK BETWEEN THE LEGS', by: 'Team Flight Brothers', nod: 1.4 },
  { id: 'btb_scorpion', air: ['behindback', 'scorpion'], name: 'BEHIND THE BACK SCORPION', by: 'Jordan Kilganon', nod: 1.6 },
  { id: 'fake_btb_scorpion', air: ['fakeback', 'scorpion'], name: 'FAKE BEHIND THE BACK SCORPION', by: 'Jordan Kilganon', nod: 1.5 },
  { id: '360_double_eastbay', air: ['spin360', 'doubleeastbay'], name: '360 DOUBLE EASTBAY', by: 'Guy Dupuy', nod: 1.8 },
  // the three-piece: the whole air budget, and the top of the mode
  { id: '360_eastbay_scorpion', air: ['spin360', 'eastbay', 'scorpion'], name: '360 EASTBAY SCORPION', by: 'Team Flight Brothers', nod: 2.2 },
  // MORE CHAINS (owner, 2026-09-16). `by` is a CREDIT, so it only ever names a person or crew when the dunk is
  // genuinely theirs; a combination this contest made up says so instead of borrowing somebody's name for it.
  { id: '360_fake_eastbay', air: ['spin360', 'fakeeastbay'], name: '360 FAKE EASTBAY', by: 'FLIGHT NIGHT', nod: 1.5 },
  { id: 'btb_double_eastbay', air: ['behindback', 'doubleeastbay'], name: 'BEHIND THE BACK DOUBLE EASTBAY', by: 'FLIGHT NIGHT', nod: 1.9 },
  { id: 'fake_btb_btl', air: ['fakeback', 'betweenlegs'], name: 'FAKE BEHIND THE BACK BETWEEN THE LEGS', by: 'FLIGHT NIGHT', nod: 1.5 },
  // THE WHIRLWIND is a 360 TAP (owner, 2026-09-16) — a full turn and then no grip at all, which is why it is a chain
  // and not a body: the turn is the 360's, the tap is the tap's, and doing both in one flight is the whole dunk.
  { id: 'whirlwind', air: ['spin360', 'tap'], name: 'THE WHIRLWIND', by: 'FLIGHT NIGHT', nod: 1.7 },
  // THE 360 EASTBAY (owner, 2026-09-19: "360 eastbays"). The three-piece 360 EASTBAY SCORPION was in this table from
  // the start, which means the game recognised the hard version of a dunk whose plain version it had never heard of:
  // turn a full revolution and pass the ball under the leg, the Jordan-in-Barcelona of this vocabulary. Both pieces
  // fire at the rise and are done by the hang, and they cost 0.34 + 0.40 of the air, so it fits a good flight and not
  // a lazy one — which is the gate the owner asked for ("free to all"), enforced by the air budget rather than a lock.
  { id: '360_eastbay', air: ['spin360', 'eastbay'], name: '360 EASTBAY', by: 'Team Flight Brothers', nod: 2.0 },
  { id: 'windmill360_scorpion', air: ['windmill360', 'scorpion'], name: '360 WINDMILL SCORPION', by: 'FLIGHT NIGHT', nod: 1.9 },
  { id: 'windmill360_btl', air: ['windmill360', 'betweenlegs'], name: '360 WINDMILL BETWEEN THE LEGS', by: 'FLIGHT NIGHT', nod: 1.9 },
  { id: 'lob_tap', runway: 'selflob', air: ['tap'], name: 'THE TAP DUNK', by: 'FLIGHT NIGHT', nod: 1.3 },
  { id: 'kickup_tap', runway: 'kickup', air: ['tap'], name: 'THE KICK-UP TAP', by: 'FLIGHT NIGHT', nod: 1.5 },
  // three-pieces: a full-speed attack and nothing left over
  { id: 'btb_eastbay_scorpion', air: ['behindback', 'eastbay', 'scorpion'], name: 'BEHIND THE BACK EASTBAY SCORPION', by: 'FLIGHT NIGHT', nod: 2.3 },
  { id: '360_btl_tap', air: ['spin360', 'betweenlegs', 'tap'], name: '360 BETWEEN THE LEGS TAP', by: 'FLIGHT NIGHT', nod: 2.4 },
  { id: 'btb_windmill360', air: ['behindback', 'windmill360'], name: 'BEHIND THE BACK 360 WINDMILL', by: 'FLIGHT NIGHT', nod: 2.0 },
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
    return this.peek(e);
  }

  /**
   * The trick a button press WOULD throw with the direction held now — no state change (the cue arms it for its beat).
   *
   * THE TABLE IS THE AUTHORITY. This used to carry its own list of buttons — `A || B || Y`, written out twice — beside
   * the lookup that already knew which buttons exist. So when the chain pieces arrived on X (2026-09-16) the table said
   * `left + X = FAKE BEHIND THE BACK` and the recognizer silently disagreed: the press went to the showboat tap and the
   * trick could not be thrown at all. Measured in the lab, the chain just... didn't happen, with no refusal and no log.
   * A filter that duplicates a table is a filter that will drift from it.
   */
  peek(e: FelInput): DunkTrick | null {
    if (e.t !== 'button' || !e.pressed || !this.heldDir) return null;
    const dir = this.heldDir;
    return DUNK_TRICKS.find((t) => t.dir === dir && t.btn === e.btn) ?? null;
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
  get trickCapacity(): number { return this.airTotal >= TRIPLE_AIR_SEC ? 3 : this.airTotal >= COMBO_AIR_SEC ? 2 : 1; }
  /** What this flight bought, for a refusal that can say what would have bought more. */
  get capacity(): number { return this.trickCapacity; }
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
      if (this.tricks.length >= 2) this.refusal = 'limit';                  // DUNK-BIOMECH: one past what this flight bought is refused OUT LOUD
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
  /** DUNK MOTION phase 10b: a trick grows into its bigger self mid-flight (the 360 thrown again is the 720) — the same slot in the
   *  flight, so it never counts as a second trick, and the bigger one's window tax in place of the smaller one's. */
  upgrade(fromId: string, to: DunkTrick): boolean {
    const i = this.tricks.map((t) => t.id).lastIndexOf(fromId);
    if (i < 0) return false;
    const was = this.tricks[i];
    this.tricks[i] = to;
    this.airLeft *= (1 - to.windowCost) / Math.max(1e-6, 1 - was.windowCost);
    this.slamWindow *= (1 - to.windowCost * 0.5) / Math.max(1e-6, 1 - was.windowCost * 0.5);
    return true;
  }
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

// ── What the contact and the landing LOOK like (visuals pass P5, 2026-09-16) ───────────────────────────────────────
//
// Both effects already existed and both were in the wrong place. The NET SPLASH fired during the judges' scoring step,
// seconds after the ball was through and with the camera on the player — a net effect nobody ever saw at the rim. And
// the LANDING DUST fired at a flat scale 1 for every landing, though `EffectsKit.burst` takes a scale precisely so
// that a drop off a 1.9 m jump and a hop off a 1.05 m one are the same puff at two sizes. Firing the identical effect
// for every intensity is what makes particle work read as canned.

/** A landing is as hard as the fall that made it: v = sqrt(2gh) off the jump's own apex. */
export const DUST_MIN = 0.55, DUST_MAX = 1.7;
export function landingDustScale(apexM: number): number {
  const v = Math.sqrt(2 * 9.81 * Math.max(0, apexM));
  return Math.max(DUST_MIN, Math.min(DUST_MAX, DUST_MIN + (v - 4.2) * 0.42));
}

/** How far under the ring the net splash sits — the ball is through the net here, not on the iron. */
export const NET_SPLASH_DROP = 0.34;
/** A jam put through clean moves more net than one that scrapes in on the buzzer. */
export function netSplashScale(execution01: number): number {
  return 0.7 + Math.max(0, Math.min(1, execution01)) * 0.8;
}
