// penaltyHud — the pure readability layer of the penalty shootout (A+ mission #8; owner benchmark: FIFA penalty
// shootout feel + Wii-style readability). The shootout's rules live in the mode and KeeperCore; this is the kicks board —
// both sides' kicks as pips, the FIFA read — kept pure so it is tested and drawn by the shared timing host.

export type KickResult = 'goal' | 'miss';

/** One side's kicks as pips: ● goal, ○ miss, · still to take (regulation), then sudden-death kicks after a bar. */
export function kickPips(results: readonly KickResult[], regulation = 5): string {
  const reg: string[] = results.slice(0, regulation).map((r) => (r === 'goal' ? '●' : '○'));
  while (reg.length < regulation) reg.push('·');
  const sd = results.slice(regulation).map((r) => (r === 'goal' ? '●' : '○'));
  return sd.length ? `${reg.join(' ')} | ${sd.join(' ')}` : reg.join(' ');
}

/** Board rows (HudScoreCard shape): name · goals · pips. */
export function kicksBoard(
  mine: readonly KickResult[], theirs: readonly KickResult[], regulation = 5, names: readonly [string, string] = ['YOU', 'THEM'],
): { name: string; score: number | string; line: string }[] {
  const goals = (r: readonly KickResult[]) => r.filter((x) => x === 'goal').length;
  return [
    { name: names[0], score: goals(mine), line: kickPips(mine, regulation) },
    { name: names[1], score: goals(theirs), line: kickPips(theirs, regulation) },
  ];
}
