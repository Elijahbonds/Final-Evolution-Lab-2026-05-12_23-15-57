// CompetitionBridge — Mode 3 Phase 19: server-authoritative progression
// and competition for board sports.
//
//   submitRunScore() — posts a completed run/heat score to the server's
//     competition pipeline. The client sends the score IT EARNED and the
//     server validates/settles it (see app/api/competition/submit-score);
//     no coin grant happens client-side. Offline/dev degrades to a logged
//     no-op so solo practice never lies about rewards.
//   board customization rides the existing avatar slot/tint system
//     (buildRig's boardColor + CharacterLibrary tint); nothing here
//     duplicates it.

export interface RunResult {
  mode: 'skateboard' | 'snowboard_slalom' | 'surf';
  score: number;
  bestCombo?: number;
  goalsDone?: number;
  waveCount?: number;
}

export interface SubmitOutcome { ok: boolean; reason?: string }

/** Server-authoritative score submission. The server owns validation and
 *  any reward settlement; the client NEVER computes a reward. */
export async function submitRunScore(matchId: string, result: RunResult): Promise<SubmitOutcome> {
  try {
    const res = await fetch('/api/competition/submit-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId, score: result.score, meta: result }),
    });
    if (!res.ok) return { ok: false, reason: `server refused (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'offline — score not submitted' };
  }
}
