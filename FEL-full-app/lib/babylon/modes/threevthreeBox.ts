// threevthreeBox — the 3v3 box score at the buzzer (IMPROVE 2026-10-06, owner-picked item #9 of the threevthree section of
// docs/IMPROVEMENTS-2026-10-05.md): what ThreeVThreeMode counts and puts in ctx.end's stats, and the line lib/proofLine prints on
// the end card. No imports on purpose: the shell's proof line reads it, and must not pull the basketball core in for it.

export interface BoxScore { fgm: number; fga: number; threes: number; steals: number; blocks: number; overdrives: number }
export const emptyBox = (): BoxScore => ({ fgm: 0, fga: 0, threes: 0, steals: 0, blocks: 0, overdrives: 0 });
/** The end card's line: FG 7/12 · 3PT 2 · AST 3 · STL 2 · BLK 1 · OVERDRIVE 1 (a zero count is left out; the FG never is). */
export function boxLine(b: Partial<BoxScore> & { assists?: number }): string {
  const parts = [`FG ${b.fgm ?? 0}/${b.fga ?? 0}`];
  if (b.threes) parts.push(`3PT ${b.threes}`);
  if (b.assists) parts.push(`AST ${b.assists}`);
  if (b.steals) parts.push(`STL ${b.steals}`);
  if (b.blocks) parts.push(`BLK ${b.blocks}`);
  if (b.overdrives) parts.push(`OVERDRIVE ${b.overdrives}`);
  return parts.join(' · ');
}
