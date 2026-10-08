// IMPROVE (2026-10-06, Big Air items 4 / 5 / 6 / 10 / 11 / 12 / 13): the play layer's rules, pure so they are pinned on their
// own — what the coach says on the first attempt, the one-line hint, the spin dial's clean window, the speed bar, the
// stomp's timing call, the apex hang beat, the judge's read and the attempt score sheet. No Babylon, no DOM.
import type { TrickGrade } from '../../feel';
import type { AirAttempt } from '../../feel/cores/air-session-core';
import type { LandingZone } from '../../feel/cores/air-hill';

/** The one-line control card (item 6). Y names a Y trick and X an X trick, as the board family maps them (item 5). */
export const AIR_HINT = '◀ ▶ STRIDE · HOLD RB BOOST · AIR: ◀ ▶ SIDE · A SPIN, A PLANT · X GRAB · Y BIG SPIN (stick picks) · B STOMP';

/**
 * The first attempt's coach (item 6): one short prompt for what to press NOW, by phase — null after the first attempt (the
 * hint stays). `spinning` / `taps` are the air's spin state; `stompNow` = the touchdown is inside the stomp window.
 */
export function coachLine(attemptIdx: number, phase: string, spin: { spinning: boolean; taps: number }, stompNow: boolean): string | null {
  if (attemptIdx > 0) return null;
  if (phase === 'Run') return '◀ ▶ STRIDE — CARRY SPEED INTO THE GREEN';
  if (phase !== 'Air') return null;
  if (stompNow) return 'B — STOMP IT';
  if (spin.spinning) return 'A — PLANT ON A HALF TURN';
  if (spin.taps === 0) return 'A — SPIN';
  return 'B — STOMP AS YOU LAND';
}

/** The spin dial (item 4): is `turns` inside the clean window (± `tol` of a half turn)? */
export function inCleanWindow(turns: number, tol: number): boolean {
  const a = Math.abs(turns);
  return Math.abs(a - Math.round(a * 2) / 2) <= tol + 1e-9;
}

/** The speed bar (item 8): a speed as 0..1 along a bar that ends at `max`. */
export const barK = (speed: number, max: number): number => Math.max(0, Math.min(1, speed / max));

/** The stomp cue (item 11): the touchdown is `secLeft` away — 'now' inside the stick window, 'wait' before it. */
export function stompState(secLeft: number | null, windowMs: number): 'wait' | 'now' | null {
  if (secLeft === null) return null;
  return secLeft * 1000 <= windowMs ? 'now' : 'wait';
}

/**
 * The stomp's timing call (item 11), read at the landing: B pressed `pressedLeftSec` before the touchdown (null = never).
 * Stuck needs nothing said; a press outside the window says how early; no press says so.
 */
export function stompCall(stuck: boolean, pressedLeftSec: number | null, windowMs: number): string | null {
  if (stuck) return null;
  if (pressedLeftSec === null) return 'NO STOMP';
  const ms = Math.round(pressedLeftSec * 1000);
  return ms > windowMs ? `STOMP EARLY · ${ms - windowMs} MS` : null;
}
/** A B pressed this soon AFTER the touchdown is called LATE rather than refused (seconds). */
export const LATE_STOMP_SEC = 0.4;

/** The hill's word on a landing that did not set down on the landing slope (items 2 / 8). */
export function zoneCall(zone: LandingZone | null | undefined): string | null {
  return zone === 'knuckle' ? 'CASED THE KNUCKLE — MORE SPEED' : zone === 'flat' ? 'OVERSHOT TO THE FLAT — LESS SPEED' : null;
}

/**
 * The apex hang (item 12): ONE short slow-mo per attempt, at the top of an air with a big spin running. Fires on the frame
 * the rise turns into the fall, while the spin runs and the air can still finish ≥ `HANG.minTurns`.
 */
export const HANG = { scale: 0.45, sec: 0.3, minTurns: 1.5 } as const;
export function apexHang(prevVy: number, vy: number, spinning: boolean, reachableTurns: number, firedThisAir: boolean): boolean {
  return !firedThisAir && spinning && prevVy > 0 && vy <= 0 && reachableTurns >= HANG.minTurns;
}

/**
 * The judge's 0–10 read of a landing (phase 9's weights) — and (item 10) the rotation's part is paid at the repeat's share,
 * so the same spin again reads lower: the landing is half (stuck 5 / clean 4.2 / sketchy 1.5), the rotation up to 2.5, the
 * named line up to 2.5; a crash is 0.
 */
export function judgeRead(grade: TrickGrade, rotations: number, lineDifficulty: number, repeatShare = 1): number {
  if (grade === 'crash') return 0;
  const land = grade === 'stuck' ? 5 : grade === 'clean' ? 4.2 : 1.5;
  return Math.min(10, land + Math.min(2.5, Math.abs(rotations) * 1.25) * repeatShare + Math.min(2.5, lineDifficulty));
}

/** The repeat's share of `decay` (the core's repeatDecay; none = full). */
export const repeatShare = (repeat: number | undefined, decay: readonly number[] | undefined): number =>
  decay?.length ? decay[Math.min(repeat ?? 0, decay.length - 1)] : 1;

/**
 * The attempt score sheet (item 13), one HUD string: `GRADE|DIR TURNS|+PTS|NOTE` per attempt, `;` between them. NOTE is the
 * hill's word (KNUCKLE / FLAT) or the repeat (×2 = the second time this rotation landed), else empty.
 */
export function sheetLine(attempts: readonly AirAttempt[]): string {
  return attempts.map((a) => {
    const half = Math.round(Math.abs(a.rotations) * 2) / 2;
    const rot = half === 0 ? 'STRAIGHT' : `${a.rotations < 0 ? 'BS' : 'FS'} ${half * 360}`;
    const note = a.zone === 'knuckle' ? 'KNUCKLE' : a.zone === 'flat' ? 'FLAT' : (a.repeat ?? 0) > 0 && a.grade !== 'crash' ? `×${(a.repeat ?? 0) + 1}` : '';
    return `${a.grade.toUpperCase()}|${rot}|+${a.pts}|${note}`;
  }).join(';');
}
