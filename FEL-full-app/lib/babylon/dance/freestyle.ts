// freestyle — MUSIC-SUITE P9 (2026-09-29): the dance room's freestyle bars, call bars and free-dance toggle, as pure
// decisions (DanceMode.ts only wires them to the scene, the HUD and Stoop). Owner decision #3: "freestyle bars where
// the buttons pick the move, scored on timing + variety, alternating with called bars + a no-score free-dance toggle".
//
// What the room could not do before this file (measured on DanceMode.ts at 2e24c6d9):
//   * ONE BUTTON MEANT ONE THING. danceTap (audio/SongClock.ts) turns A, B, the R trigger and SPACE into "a tap" and
//     drops which one it was; X and Y did nothing in the room at all. A freestyle bar needs the button (it picks the
//     move) and a press hold needs its RELEASE (the chart's freeze holds end on letting go) — neither was read.
//   * NOTHING KNEW WHERE A BAR BEGAN. The only bar-shaped thing was the count-in; Stoop's dance.freestyle and
//     dance.callbar lines (P8, script/stoop.ts) shipped rendered and unwired for exactly that reason.
// danceTap is used UNCHANGED underneath (the edge latch, SPACE-on-the-way-down, SPACE's made-up key-up A ignored): a
// called bar taps on exactly the inputs it always did.
//
// MUSIC-SUITE P9 FIX PASS (2026-09-29): X AND Y PRESS EVERYWHERE, like A and B. They used to press only where a freestyle
// slot was the nearest step (acceptsPress) and were dropped in silence on every called step — but the phone dance pad
// (registry.ts dance_pad), and now the touch rig, name the four buttons after the pad's moves (ARM WAVE, SPIN) in the
// colours the cue lane gives those same moves, and the called charts ask for Arm Wave and Spin by name (warmup's first
// four cues are ARM WAVE, SPIN, ARM WAVE, SPIN). A player pressing the button named on the step got no press and the step
// expired a MISS. Measured with the shipped charts, DanceMode's own gate and DancePerformance, for a player with perfect
// timing pressing the button named by the running move: accuracy warmup 84.6 %, cypher 83.1 %, goldenhour 78.7 %, battle
// 92.1 %, canals 86.4 %, evolution 84.2 % — and pressing A everywhere scored 100 %. In the Arena, accuracy IS the score.
// It also left a hole in the "a wild tap now COSTS" rule (the MECHANICS PASS): mashing X/Y through a freestyle bar took
// every slot with no wild-tap cost and no spam cap, where the same mashing on A/B paid both. A called step takes any press
// (DanceCore stepAccepts); what the button changes is only the move a freestyle slot dances (padMove). acceptsPress is gone.

import type { FelInput } from '../core/InputBus';
import { danceTap, type TriggerLatch } from '../audio/SongClock';
import { FREESTYLE_PAD, type BarKind, type PadButton } from './chart';

/** The physical input behind a press (a press hold ends on the SAME key's release). */
export type PressKey = PadButton | 'R2' | 'SPACE';

export interface PressEdge {
  /** An input went down: a press, from this key (null: not a press). */
  down: PressKey | null;
  /** An input came up: the release of this key (null: not a release). */
  up: PressKey | null;
  /** The R-trigger latch after this event (danceTap's own). */
  latch: TriggerLatch;
}

/**
 * One input event in, its press and release edges out. Presses are danceTap's taps (A, B, an R pull, SPACE going
 * down), named, plus X and Y (MUSIC-SUITE P9 FIX PASS: presses everywhere, like A and B). Releases: a face button's pressed:false,
 * the R latch returning to 'up' after a pull, and SPACE coming up (its latch leaving 'space' / 'spaceDepth', or the A
 * the bus makes up on SPACE's key-up — whichever arrives first; a second release of the same key finds no hold and
 * costs nothing).
 */
export function pressEdge(latch: TriggerLatch, e: FelInput): PressEdge {
  const t = danceTap(latch, e);
  let down: PressKey | null = null;
  let up: PressKey | null = null;
  if (e.t === 'trigger' && e.side === 'R') {
    if (t.tap) down = t.latch === 'space' ? 'SPACE' : 'R2';
    else if (t.latch === 'up' && latch === 'pulled') up = 'R2';
    else if (t.latch === 'up' && (latch === 'space' || latch === 'spaceDepth')) up = 'SPACE';
  } else if (e.t === 'button') {
    if (e.src === 'space') up = 'SPACE';
    else if (e.btn === 'A' || e.btn === 'B' || e.btn === 'X' || e.btn === 'Y') {
      if (e.pressed) down = e.btn;
      else up = e.btn;
    }
  }
  return { down, up, latch: t.latch };
}

/** The move a freestyle press picks: the pad's clip for a face button; R2, SPACE and a phone's one TAP (an A) pick A's. */
export function padMove(key: PressKey): string {
  return key === 'R2' || key === 'SPACE' ? FREESTYLE_PAD.A : FREESTYLE_PAD[key];
}

/** The words for "the pad picks": the four pad moves by name (the phone's dance_pad and the touch rig label their buttons
 *  with these names; the keyboard's A/B/X/Y keys are J/K/L/I — InputBus — so a letter list read wrong on two of four
 *  inputs). MUSIC-SUITE P9 FIX PASS: DanceMode's FREE_NEXT_STEP was 'YOUR MOVE · A B X Y'. */
export function padMovesLine(names: Readonly<Record<PadButton, string>>): string {
  return `YOUR MOVE · ${(['A', 'B', 'X', 'Y'] as const).map((k) => names[k].toUpperCase()).join(' / ')}`;
}

/**
 * MUSIC-SUITE P9 FIX PASS (2026-09-29): HOW LONG A FREESTYLE PICK IS SEEN. Every freestyle hit danced its pick from the
 * clip's first frame over a 0.12 s fade (DanceMode danceMove), and battle, goldenhour, canals and evolution put a slot on
 * every beat (evolution's last hook every half beat: 238 ms at 126 BPM, the fade half the slot) — Top Rock and Two Step
 * are 4-beat clips, so a pick showed a beat of itself or less and no move was ever finished; the one way to see a move
 * complete was to repeat it (the animator keeps a running loop), which is exactly what VARIETY_PENALTY charges for. The
 * best-scoring freestyle was the twitchiest to watch. A pick now changes the dancer's move at most once every
 * FREESTYLE_MIN_SHOW_BEATS; a pick made sooner WAITS, and the newest waiting pick is danced when the time is up. The
 * judgement, the banner, the instrument and the variety are the pick's the instant it is pressed — only the body waits.
 * NEW TUNED NUMBER (the owner's eye is the judge): two beats shows a whole Arm Wave or Spin and half a Top Rock.
 */
export const FREESTYLE_MIN_SHOW_BEATS = 2;

/**
 * What a freestyle pick does to the dancer: 'same' — it is the move already dancing (the loop carries on); 'now' — change
 * to it (the last change was not a freestyle pick, or was at least FREESTYLE_MIN_SHOW_BEATS ago); 'later' — wait (DanceMode
 * dances the newest waiting pick once the time is up). `lastPickBeat` = the song beat of the last change a PICK made,
 * null when the running move came from the chart. Pure.
 */
export function freestylePickSwitch(o: { pick: string; dancing: string | null; lastPickBeat: number | null; nowBeat: number }): 'same' | 'now' | 'later' {
  if (o.pick === o.dancing) return 'same';
  if (o.lastPickBeat === null || !Number.isFinite(o.lastPickBeat)) return 'now';
  return o.nowBeat - o.lastPickBeat >= FREESTYLE_MIN_SHOW_BEATS - 1e-9 ? 'now' : 'later';
}

/**
 * MUSIC-SUITE P9 FIX PASS (2026-09-29): THE HOLD, ON THE BOTTOM LINE. A charted press hold was cued 'HOLD BABY FREEZE' with
 * no length (the lane's HudCue.pressHoldSec is published but no host draws it), and once its head was hit the step left
 * DancePerformance.upcoming at once — the bottom line named the NEXT move with its countdown in the middle of a 2–3 beat
 * freeze, nothing said to keep holding, and a player who tapped the head and let go took HOLD DROPPED (a MISS tail, the
 * combo gone; in the Arena, accuracy). The line now says how long before the head (upcomingHoldLine: '… · 3 BEATS') and
 * counts the hold down while it is held (holdingLine), and the next move is not named until the hold ends. Pure.
 */
export function upcomingHoldLine(moveName: string, holdBeats: number): string {
  const b = Math.round(holdBeats * 100) / 100;
  return `HOLD ${moveName.toUpperCase()} · ${b} BEAT${b === 1 ? '' : 'S'}`;
}
export function holdingLine(moveName: string, leftSec: number): string {
  return `KEEP HOLDING ${moveName.toUpperCase()} · ${Math.max(0, leftSec).toFixed(1)}s`;
}

/** The stage camera's "wide on streaks" framing during a freestyle bar (stageCamera streakCap is 24): a freestyle bar
 *  is the dancer's showcase, so the SAME streak/wide behaviour P8 built frames it — no new camera. NEW TUNED NUMBER. */
export const FREESTYLE_CAMERA_STREAK = 18;

/** The kind of the bar a song time falls in (`bars` 0-based from beat 0; past either end reads 'call'). */
export function barKindAt(kinds: readonly BarKind[] | null, barIndex: number): BarKind {
  return kinds?.[barIndex] ?? 'call';
}

export interface BarCue {
  /** Stoop's line to queue on entering this bar (one bar AHEAD of the switch it announces), or null. */
  stoop: 'dance.freestyle' | 'dance.callbar' | null;
  /** The banner to raise on entering this bar (AT the switch), or null. */
  banner: string | null;
}

export const FREESTYLE_BANNER = 'FREESTYLE · YOUR MOVES';
export const CALLBAR_BANNER = 'CALL BAR · MATCH IT';

/**
 * What entering bar `i` (0-based) announces. Stoop is queued a bar ahead so his line (P8: 1.8–3.6 s rendered) can
 * land before the switch — through the same SpeechQueue and judge-window guard P8 built, so it is only SAID when a gap
 * between presses is long enough (a dense bar drops it after the queue's 4 s wait: P8's rule, "never over a scored
 * window", unchanged). The banner is raised on the switch itself, where the eye needs it.
 */
export function barCue(kinds: readonly BarKind[] | null, i: number): BarCue {
  if (!kinds || i < 0 || i >= kinds.length) return { stoop: null, banner: null };
  const here = kinds[i], next = kinds[i + 1], prev = i > 0 ? kinds[i - 1] : 'call';
  const stoop = next === 'free' && here === 'call' ? 'dance.freestyle' as const
    : next === 'call' && here === 'free' ? 'dance.callbar' as const
      : null;
  const banner = here === 'free' && prev !== 'free' ? FREESTYLE_BANNER
    : here === 'call' && prev === 'free' ? CALLBAR_BANNER
      : null;
  return { stoop, banner };
}

/**
 * How many of a chart's Stoop cues (barCue.stoop) could actually be SAID under P8's guard with a line `lineSec` long:
 * the cue is queued at its bar's start, and the queue speaks only when no press step starts within `lineSec` of now,
 * waiting at most `maxWaitSec`. `stepTimes` are the presses' times in seconds from beat 0 (sorted). Pure — the phase
 * report measures every shipped chart with it rather than guessing how often Stoop gets a word in.
 */
export function stoopCueRoom(
  kinds: readonly BarKind[], stepTimes: readonly number[], secPerBar: number, lineSec: number, maxWaitSec = 4, padSec = 0.12,
): { cues: number; fits: number } {
  let cues = 0, fits = 0;
  for (let i = 0; i < kinds.length; i++) {
    if (!barCue(kinds, i).stoop) continue;
    cues++;
    const t0 = i * secPerBar;
    // scan the judge windows ([t − pad, t + pad], hostVoice's pad) from the queue moment: the line is said at the first
    // moment `c` outside a window whose next window starts no sooner than `c + lineSec`, if that comes within maxWait
    let c = t0, said = false;
    for (const t of stepTimes) {
      const from = t - padSec, to = t + padSec;
      if (to <= c) continue;
      if (from >= c + lineSec) { said = true; break; }
      c = Math.max(c, to);
      if (c > t0 + maxWaitSec) break;
    }
    if (!said && c <= t0 + maxWaitSec && !stepTimes.some((t) => t + padSec > c)) said = true;   // no window left at all
    if (said) fits++;
  }
  return { cues, fits };
}

/** `?free=1` (or `?dance=free`) opens the pick screen with free dance on — the read side for a shared link or a probe,
 *  the same query convention as `?track=` and P8's `?camera=`. */
export function freeDanceFromQuery(search: string | null | undefined): boolean {
  if (!search) return false;
  return /(?:^|[?&])(?:free=1|dance=free)(?:&|$)/i.test(search);
}

/** How many judge(…, 'PERFECT') calls take a band stem from silent to full (StemBand.nextStemLevel adds
 *  STEM_HIT_GAIN = 0.34 per clean hit): free dance plays the whole band from the first beat ("the band plays
 *  everything"), through the bands' own public judge, never their internals. */
export const FULL_BAND_HITS = 3;
