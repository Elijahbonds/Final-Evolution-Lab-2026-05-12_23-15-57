/**
 * lib/session-evidence.ts — did this run actually get PLAYED?
 *
 * FEATURES-UX-SHOP (2026-09-08): a mode left idle ends on its own clock (3PT at 60 s, the rival's points, a bail) and
 * called onEnd with score 0 — and /api/sessions still granted 10 XP, 1 profile shard, streak credits and season XP,
 * while the shell's mode_session_completed earn minted the 40-coin floor ("Session completed"). Measured on the
 * playtest wallet: 9 zero-score / zero-tally sessions → +90 XP, +9 shards, +10 credits; 7 of them → +280 coins.
 * Browsing is not playing. A run earns only when there is evidence of play: points, a win, any fun-loop tally, a
 * combo, or the shell having seen input during the run. Pure — unit-tested in session-evidence.test.ts.
 */

export interface SessionEvidence {
  score?: number;
  won?: boolean;
  hits?: number;
  misses?: number;
  dodges?: number;
  combos?: number;
  maxCombo?: number;
  /** The shell saw a key / pointer / pad press while the run was live. Absent for legacy clients. */
  played?: boolean;
}

const pos = (v: unknown): boolean => Number.isFinite(Number(v)) && Number(v) > 0;

export function sessionHasPlay(e: SessionEvidence): boolean {
  if (e.played === true) return true;
  if (e.won === true) return true;
  return pos(e.score) || pos(e.hits) || pos(e.misses) || pos(e.dodges) || pos(e.combos) || pos(e.maxCombo);
}
