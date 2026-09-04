// Game diagnostics that leave the browser (Ship Pass 2, Phase 5).
//
// The game already SAYS what goes wrong — FEL-FRAME (hero lost), FEL-IDENT (a
// material that never compiles), MISSING CLIP, FEL-CAM (camera boxed in), an
// fps floor breach, a lost WebGL context — but only into the console, where no
// player and no owner ever reads it. reportDiag() rides the existing analytics
// pipe (batched, sendBeacon on unload, /api/analytics → AnalyticsEvent rows,
// 204 always) as one event name, `game_diag`, so the owner can read them back
// grouped by kind and mode. Per-kind rate limit: once per 10 s per page; the
// console line stays as it was.
import { track } from '@/lib/analytics';

export type DiagKind = 'frame' | 'ident' | 'clip' | 'cam' | 'fps' | 'context' | 'load';

const WINDOW_MS = 10_000;
const last = new Map<DiagKind, number>();
let modeId = '';

/** The harness names the mode once per run; events carry it. */
export function setDiagMode(id: string): void { modeId = id; }

/** Report one diagnostic. Returns true if it was sent (not rate-limited). */
export function reportDiag(kind: DiagKind, detail: string, now: number = Date.now()): boolean {
  const prev = last.get(kind) ?? -Infinity;
  if (now - prev < WINDOW_MS) return false;
  last.set(kind, now);
  try {
    track('game_diag', { kind, mode: modeId, detail: detail.slice(0, 240) });
  } catch { /* diagnostics never break the game */ }
  return true;
}

/** Tests only. */
export function _resetDiag(): void { last.clear(); modeId = ''; }
