// End-card refusals (2026-09-26): what the server said no to, told on the results card instead of swallowed.
//
// GameShell's handleEnd posts the run twice more after the session: the Arena score (?arena=) and the Story node
// (?story=). Both servers can refuse — the Arena a score above its mode's limit or a dunk card that does not add up
// (422, lib/arena-score-integrity.ts), or a duel that is closed or has no opponent yet (409); the Story route a run in
// the wrong mode, a loss on a node that has to be won, or a score under the target (422, judgeStorySession's verdict:
// error, required, achieved — and a win boss's orScore + score), or a run that already completed another node (409).
// The shell read `r.ok ? r.json() : null` for both, so a refusal said nothing: the arena panel vanished, the story panel
// never showed, and the player could not tell a refused score from a slow server. These read the refusal's body into
// one line in plain words; anything that is not a 422 or a 409 (offline, 500, signed out) stays silent as before.

import { storyModeLabel } from '@/lib/story-yardstick';

export interface Refusal {
  /** The server's own error: the Arena's code (SCORE_ABOVE_CEILING…), the Story route's words ('Score below target'…). */
  error: string;
  /** What the card says. */
  line: string;
}

const REFUSED = new Set([409, 422]);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The Arena did not accept this score (app/api/arena/submit-score: `{ error: code, detail }`). */
export function arenaRefusal(status: number, body: unknown): Refusal | null {
  if (!REFUSED.has(status)) return null;
  const b = obj(body);
  return { error: str(b.error) ?? 'REFUSED', line: str(b.detail) ?? 'The Arena did not accept this score.' };
}

/** The Story node did not complete (app/api/story/complete: the verdict, or `{ error }`). */
export function storyRefusal(status: number, body: unknown): Refusal | null {
  if (!REFUSED.has(status)) return null;
  const b = obj(body);
  const error = str(b.error) ?? 'Not complete';
  const required = b.required, achieved = b.achieved;
  let line: string;
  if (error === 'Score below target' && num(required) !== null && num(achieved) !== null) {
    line = `Score below target: you needed ${required}, you got ${achieved}.`;
  } else if (error === 'Not a win' && num(b.orScore) !== null && num(b.score) !== null) {
    line = `Not a win: win it, or score ${b.orScore} (you got ${b.score}).`;
  } else if (error === 'Not a win') {
    line = 'Not a win: this node has to be won.';
  } else if (error === 'Session mode does not match node' && str(required)) {
    const played = str(achieved);
    line = `Wrong mode: this node needs ${storyModeLabel(required as string)}${played ? `, not ${storyModeLabel(played)}` : ''}.`;
  } else if (error === 'Session already used') {
    line = 'This run already completed another node.';
  } else {
    line = /[.!?]$/.test(error) ? error : `${error}.`;
  }
  return { error, line };
}

/** Inside the TRIUMPH ARENA panel, in place of the duel's verdict. */
export function ArenaRefusedLine({ refusal }: { refusal: Refusal }) {
  return <p data-arena="refused" data-arena-error={refusal.error} className="mt-1 text-sm text-[#FFB020]">Score not accepted — {refusal.line}</p>;
}

/** Where STORY NODE COMPLETE would have been. */
export function StoryRefusedPanel({ refusal }: { refusal: Refusal }) {
  return (
    <div data-story="refused" data-story-error={refusal.error} className="mt-3 rounded-lg border border-[#FFB020]/30 bg-[#FFB020]/10 p-3 text-center">
      <p className="text-xs font-bold text-[#FFB020]">STORY NODE NOT COMPLETE</p>
      <p className="mt-1 text-sm text-white/80">{refusal.line}</p>
    </div>
  );
}
