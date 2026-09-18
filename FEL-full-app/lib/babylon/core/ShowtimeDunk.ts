// ShowtimeDunk — the dunk contest's vocabulary in the GAME (owner, 2026-09-17): "use some of those same animations from
// the dunk mode in the 3v3 and 1v1 modes if they are wide open and holding R2 and holding the right stick back,
// triggering a dunk meter you have to time. Add a cinematic camera if this happens. Trigger it on contact dunks too."
//
// The trigger is a COMMITMENT the way the dunk contest's is: R2 held (the turbo — the drive is already a dunk drive) and
// the right stick pulled BACK and held (not the flick that throws a trick mid-flight), on an open lane; or any contact
// dunk. The flight stretches to SHOWTIME_FLIGHT_MS with a slow hang, a side camera frames it, and the flush is TIMED:
// SQUARE inside the green (the flush moment, DRIVE_DUNK.resolveK) is the make; early rims it off the front, late off the
// back, no press at all is a shrug — it goes in more often than not, without the pop.
//
// Pure: the modes own the flight, the camera and the bodies; this is the table, the pick and the judgement.
import { DRIVE_DUNK } from './Biomech';
import type { HoopsDunk } from './HoopsDunks';
import {
  SCORPION_SEC, LOST_FOUND_SEC, HIDE_SEEK_SEC, SPIN_SEC, BETWEEN_LEGS_SEC, BEHIND_BACK_SEC, DOUBLE_EASTBAY_SEC, WINDMILL_360_SEC, CLUTCH_SEC,
} from '../anim/authored/dunkTricks';

/** The right stick pulled back this far (gamepad +y = back) and HELD arms showtime. */
export const SHOWTIME_STICK_BACK = 0.6;
/** The showtime flight — the drive dunk's 550 ms stretched so the trick reads and the flush can be timed. */
export const SHOWTIME_FLIGHT_MS = 1000;
/** The hang: between these flight fractions the clock runs at HANG_SCALE (the top of the arc, where the trick lives). */
export const SHOWTIME_HANG_FROM = 0.26, SHOWTIME_HANG_TO = 0.48, SHOWTIME_HANG_SCALE = 0.55;
/** The flush moment on the flight clock — the green's centre — and how far either side still counts. */
export const SHOWTIME_FLUSH_K = DRIVE_DUNK.resolveK;
export const SHOWTIME_PERFECT_K = 0.035, SHOWTIME_GOOD_K = 0.09;
/** No press by here is a shrug: the dunk goes up untimed. */
export const SHOWTIME_DEADLINE_K = 0.72;

export type ShowtimeJudge = 'perfect' | 'good' | 'early' | 'late' | 'none';
export const SHOWTIME_PCT: Record<ShowtimeJudge, number> = { perfect: 1, good: 0.92, early: 0.42, late: 0.5, none: 0.7 };

export function judgeShowtime(k: number): ShowtimeJudge {
  const d = k - SHOWTIME_FLUSH_K;
  if (Math.abs(d) <= SHOWTIME_PERFECT_K) return 'perfect';
  if (Math.abs(d) <= SHOWTIME_GOOD_K) return 'good';
  return d < 0 ? 'early' : 'late';
}
/** The HUD's meter fill for a flight fraction: full at the deadline, so the green sits where the flush is. */
export function showtimeMeterT(k: number): number { return Math.max(0, Math.min(1, k / SHOWTIME_DEADLINE_K)); }

/** The dunk contest's aerials that fit a game flight: one body, one ball, no props, no runway piece. */
export const SHOWTIME_DUNKS: readonly HoopsDunk[] = [
  { clip: 'dunk_360_spin', label: '360', sec: SPIN_SEC, flashy: true },
  { clip: 'dunk_finish_windmill', label: 'WINDMILL', sec: 0.85, flashy: true },
  { clip: 'dunk_360_windmill', label: '360 WINDMILL', sec: WINDMILL_360_SEC, flashy: true },
  { clip: 'dunk_360_eastbay', label: 'EASTBAY', sec: 0.95, flashy: true },
  { clip: 'dunk_double_eastbay', label: 'DOUBLE EASTBAY', sec: DOUBLE_EASTBAY_SEC, flashy: true },
  { clip: 'dunk_between_legs', label: 'BETWEEN THE LEGS', sec: BETWEEN_LEGS_SEC, flashy: true },
  { clip: 'dunk_scorpion', label: 'SCORPION', sec: SCORPION_SEC, flashy: true },
  { clip: 'dunk_lost_found', label: 'LOST & FOUND', sec: LOST_FOUND_SEC, flashy: true },
  { clip: 'dunk_hide_seek', label: 'HIDE & SEEK', sec: HIDE_SEEK_SEC, flashy: true },
  { clip: 'dunk_behind_back', label: 'BEHIND THE BACK', sec: BEHIND_BACK_SEC, flashy: true },
  { clip: 'dunk_double_clutch', label: 'DOUBLE CLUTCH', sec: CLUTCH_SEC, flashy: true },
];
/** Over a body, the dunks that keep the ball high and the flight direct — a transfer under the leg over a man is a turnover. */
const CONTACT_SET = new Set(['dunk_360_spin', 'dunk_finish_windmill', 'dunk_360_eastbay', 'dunk_double_clutch', 'dunk_360_windmill']);
/** The hardest three want the game going your way. */
const HARD_SET = new Set(['dunk_double_eastbay', 'dunk_lost_found', 'dunk_scorpion']);
export const SHOWTIME_HARD_MOMENTUM = 0.6;

export function pickShowtime(read: { roll?: () => number; contact: boolean; momentum01: number }): HoopsDunk {
  const roll = read.roll ?? Math.random;
  const pool = SHOWTIME_DUNKS.filter((d) => (read.contact ? CONTACT_SET.has(d.clip) : true) && (HARD_SET.has(d.clip) ? read.momentum01 >= SHOWTIME_HARD_MOMENTUM : true));
  return pool[Math.min(pool.length - 1, Math.floor(roll() * pool.length))];
}
/** Does this drive ask for showtime? R2 is already in `kind` (a dunk drive needs the turbo); the stick BACK is the ask. */
export function showtimeAsked(kind: 'dunk' | 'poster' | 'standing', stickY: number): boolean {
  return kind === 'poster' || stickY >= SHOWTIME_STICK_BACK;
}
/** The victim rides the flight (owner: "the defender get animated with the offensive player and gets dunked on"): from the
 *  bump to the release he is bowled back along his fall line, `share` of the fall by the release, with a small lift. */
export function posterRide(bumpK: number, releaseK: number, k: number): { s: number; lift: number } {
  const u = Math.max(0, Math.min(1, (k - bumpK) / Math.max(1e-3, releaseK - bumpK)));
  const s = u * u * (3 - 2 * u);
  return { s, lift: Math.sin(u * Math.PI) * 0.16 };
}
export const POSTER_RIDE_SHARE = 0.55;
