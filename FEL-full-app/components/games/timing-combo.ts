// The best combo a timing-sport run posts to its session row. One pure read for the /play timing host (timing-babylon.tsx).
//
// MUSIC-SUITE P6 (2026-09-25), from P2's report ("Dance maxCombo on the session row", musicsuite/p2/REPORT.md:212-214):
// the host posted `maxCombo: n('hits')` for every mode, so the Cypher's session row (GameSession.maxCombo, and the mastery
// signal that reads it: lib/mastery/mastery-service.ts:37) carried the run's CLEAN-HIT COUNT, not its best streak. A dance
// of 40 clean hits broken by one miss in the middle posted 40, never the 20 it chained. DanceMode has always sent the real
// figure (DanceMode.ts:334, stats.maxCombo = DanceCore's best streak, :466/:480/:546), and the host ignored it.
// Now a mode that sends its own best combo is taken at its word (dance: the only timing mode that does); the other five
// (tennis, volleyball, golf, derby, penalty) send none and post their clean hits exactly as before.

/** The run's stats → the maxCombo its session row gets. */
export function timingMaxCombo(stats: Readonly<Record<string, unknown>> | null | undefined): number {
  const st = stats ?? {};
  const own = st.maxCombo;
  if (typeof own === 'number' && Number.isFinite(own)) return Math.max(0, Math.floor(own));
  return Number(st.hits ?? 0);
}
