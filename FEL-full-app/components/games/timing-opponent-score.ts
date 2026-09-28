// QA A1-05: the opponent's real score for a timing-sport run (timing-babylon.tsx's result sink).
//
// makeTimingHost posted `opponentScore: 0` for every mode but penalty, even though NetSportMode (lib/babylon/modes/
// NetSportMode.ts) already computes the real games/points the rival won and sends it as `stats.theirs` — tennis and
// volleyball both do, since they share that core. A 4-0 tennis win legitimately has `theirs: 0`; the bug was posting
// 0 for every OTHER result too, including volleyball's `stats.theirs: 2` while `opponentScore: 0` went to the server.
// Lifted out of the host, same as timing-won.ts, so the mapping is one pure read that can be tested outcome by outcome.

/** The opponent's score to post for `modeKey`, given this run's `stats`. */
export function opponentScoreFor(modeKey: string, stats: Readonly<Record<string, unknown>> | null | undefined): number {
  const st = stats ?? {};
  const n = (k: string, d = 0) => Number(st[k] ?? d);
  if (modeKey === 'penalty') return n('themGoals');
  if (modeKey === 'tennis' || modeKey === 'volleyball') return n('theirs');
  return 0;
}
