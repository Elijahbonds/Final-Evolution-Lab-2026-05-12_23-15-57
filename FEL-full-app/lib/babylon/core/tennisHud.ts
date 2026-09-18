// tennisHud — the pure readability + feel layer of Tennis (A+ mission #6; owner benchmark: Mario Tennis feel + Wii Sports
// readability). RallyCore owns the rally arithmetic; NetSportMode owns the scene. These are the numbers and words the
// couch-size scoreboard and the shot TELL are drawn from, and the rally pace curve, kept pure so they are tested.

import type { TennisShot } from './RallyCore';

/** Mario Tennis logic: every shot has an answer. A lob sits up — drive it; a drop dies short — drop or slice back; a
 *  slice skids low — drive through it; a drive comes flat and fast — take the pace off with a slice or lift a lob. */
export const ANSWER: Record<TennisShot, TennisShot> = { lob: 'drive', drop: 'drop', slice: 'drive', drive: 'slice' };
export function answerFor(incoming: TennisShot): TennisShot { return ANSWER[incoming]; }

/** The face that plays each shot, for the tell chip. */
export const SHOT_FACE: Record<TennisShot, 'A' | 'B' | 'X' | 'Y'> = { drive: 'A', slice: 'B', drop: 'X', lob: 'Y' };

/** One word for what is coming, couch-size. */
export function tellFor(incoming: TennisShot): string {
  switch (incoming) {
    case 'lob': return 'LOB — it sits up';
    case 'drop': return 'DROP — it dies short';
    case 'slice': return 'SLICE — it skids low';
    default: return 'DRIVE — flat and fast';
  }
}

/** Rally speed-up: the ball flies a little faster the longer the exchange, capped so timing stays fair. `touches` is
 *  the rally's touch count so far; returns a duration multiplier (< 1 = faster). */
export const PACE_PER_TOUCH = 0.03;
export const PACE_FLOOR = 0.72;
export function rallyPace(touches: number): number {
  return Math.max(PACE_FLOOR, 1 - Math.max(0, touches) * PACE_PER_TOUCH);
}

/** Scoreboard rows (HudScoreCard shape): games and the current call, both sides. */
export function tennisBoard(games: readonly [number, number], call: string, streak: number, names: readonly [string, string] = ['YOU', 'THEM']): { name: string; score: number | string; line: string }[] {
  return [
    { name: names[0], score: games[0], line: `${call}${streak >= 2 ? ` · ${streak} STRAIGHT` : ''}` },
    { name: names[1], score: games[1], line: '' },
  ];
}
