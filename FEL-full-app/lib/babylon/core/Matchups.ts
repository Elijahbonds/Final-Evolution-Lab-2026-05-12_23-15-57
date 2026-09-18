// Matchups — defensive switching for 3v3 (lock D deferred item, 2026-09-03).
// DefenderBrain already matches up (markIndex) and rotates the low man to a
// drive; what it lacked is a SWITCH: after the help commits and the ball is
// kicked out, the helper's man is open and nobody's assignment changes. This
// pure assigner re-marks defenders when one is badly beaten and a teammate is
// clearly closer to the open attacker — with hysteresis so marks never flicker.

export interface XZ { x: number; z: number }
const d = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z);

/** A defender this far from its mark is "beaten". */
export const BEATEN_M = 3.2;
/** A teammate must be this much closer to take the mark (hysteresis). */
export const SWITCH_MARGIN_M = 1.5;

/**
 * Return new marks (attacker index per defender) or the same array when no
 * switch is warranted. `marks[i]` is defender i's attacker. Never leaves an
 * attacker unmarked: a switch is always a SWAP between two defenders.
 */
export function scramSwitch(marks: number[], defenders: XZ[], attackers: XZ[]): number[] {
  const out = [...marks];
  for (let i = 0; i < defenders.length; i++) {
    const mine = attackers[out[i]]; if (!mine) continue;
    const gap = d(defenders[i], mine);
    if (gap < BEATEN_M) continue;                       // not beaten: hold
    // the teammate clearly closer to my man than I am
    let best = -1, bestGap = gap - SWITCH_MARGIN_M;
    for (let j = 0; j < defenders.length; j++) {
      if (j === i) continue;
      const g = d(defenders[j], mine);
      if (g < bestGap) { bestGap = g; best = j; }
    }
    if (best < 0) continue;
    // swap: they take my man, I take theirs (the X-out)
    const t = out[i]; out[i] = out[best]; out[best] = t;
  }
  return out.every((m, i) => m === marks[i]) ? marks : out;
}
