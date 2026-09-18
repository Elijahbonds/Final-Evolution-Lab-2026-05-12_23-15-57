// shootoutHud — the pure readability layer of the 3PT Shootout (A+ mission #4; owner benchmark: Wii Sports Resort
// 3-point contest readability + NBA 2K three-point contest structure). The structure already lived in ThreePointMode;
// this file holds the numbers the couch-size HUD is drawn from, so they are tested and shared by the mode and the host.

/** Release-bar sweet centre and bands — ONE source for the mode's grading and the host's drawn band. */
export const SHOT_TARGET = 0.72;          // TUNE(elijah)
export const PERFECT_BAND = 0.06;         // TUNE(elijah)
export const GOOD_BAND = 0.16;            // TUNE(elijah)

export const RACKS = 5;
export const BALLS_PER_RACK = 5;

export type MeterGrade = 'perfect' | 'good' | 'miss';

/** Where a release at bar position `t` lands. The mode makes a GOOD with a coin flip; the grade is the band itself. */
export function meterGrade(t: number, target = SHOT_TARGET, perfect = PERFECT_BAND, good = GOOD_BAND): MeterGrade {
  const err = Math.abs(t - target);
  return err < perfect ? 'perfect' : err < good ? 'good' : 'miss';
}

export type PipState = 'taken' | 'next' | 'ahead';
export interface RackPip { state: PipState; money: boolean }

/** Five racks × five balls as pips: the balls already shot, the one loaded now, the ones ahead; the last ball of every
 *  rack is the money ball. `rack` / `ballIdx` are the mode's zero-based counters. */
export function rackPips(rack: number, ballIdx: number, racks = RACKS, balls = BALLS_PER_RACK): RackPip[][] {
  const out: RackPip[][] = [];
  for (let r = 0; r < racks; r++) {
    const row: RackPip[] = [];
    for (let b = 0; b < balls; b++) {
      const state: PipState = r < rack || (r === rack && b < ballIdx) ? 'taken' : r === rack && b === ballIdx ? 'next' : 'ahead';
      row.push({ state, money: b === balls - 1 });
    }
    out.push(row);
  }
  return out;
}

export type Heat = 'cold' | 'warm' | 'fire';

/** The 2K tell: three straight is warm, four straight is ON FIRE (the mode already pulses the camera at four). */
export const FIRE_STREAK = 4;
export function heatLevel(streak: number): Heat {
  return streak >= FIRE_STREAK ? 'fire' : streak >= 2 ? 'warm' : 'cold';
}

/** Points still on the rack (money = 2), for the "what is left" read. */
export function pointsLeft(rack: number, ballIdx: number, racks = RACKS, balls = BALLS_PER_RACK): number {
  let left = 0;
  for (let r = rack; r < racks; r++) {
    const from = r === rack ? ballIdx : 0;
    for (let b = from; b < balls; b++) left += b === balls - 1 ? 2 : 1;
  }
  return left;
}
