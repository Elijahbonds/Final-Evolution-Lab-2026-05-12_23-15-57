// TennisPlay — the tennis-only rules NetSportMode plays on top of RallyCore (IMPROVE 2026-10-06).
//
// The tennis half of what VolleyPlay is for volleyball, and Babylon-free for the same reason: every rule here is
// arithmetic the tests execute rather than read. The serve itself (the toss, its height, how a press on it is graded)
// is VolleyPlay's — one toss for both sports; this owns who serves a tennis game, what playing the shown answer buys,
// when a too-early swing costs the ball, what holding a Zone Shot costs, how the opponent picks its shot, and what the
// landing ring plots.

import { SWING_BANDS, type SwingQuality, type TennisShot } from './RallyCore';
import { answerFor } from './tennisHud';

// ── the serve ───────────────────────────────────────────────────────────────

/**
 * Tennis serves by the GAME: the same player serves every point of a game, and the serve changes ends when the game
 * is won. (Volleyball's server is the rally's winner — VolleyPlay.nextServer.) The player used to serve every point.
 */
export function serverAfter(server: 0 | 1, result: 'point' | 'game' | 'match'): 0 | 1 {
  return result === 'game' ? (1 - server) as 0 | 1 : server;
}

// ── the answer ──────────────────────────────────────────────────────────────

/**
 * Mario Tennis logic is that every shot has an answer (tennisHud.ANSWER), and the HUD shows it on every incoming ball —
 * but playing it did nothing, so the read was decoration. Playing the shown answer now costs the opponent this much
 * of their read: they start for the ball later. TUNED (2026-10-06): 0 → 0.15 s. Their read is 0.30 s on a late ball,
 * 0.45 on a good one, 0.65 on a perfect one, and they cover ~4 m/s, so 0.15 s is ~0.6 m of court they do not get to.
 */
export const ANSWER_READ_SEC = 0.15;
/** Did the player answer the incoming shot with the shot the HUD showed? A serve (no kind) has no answer. */
export function answeredWith(incoming: TennisShot | undefined, played: TennisShot): boolean {
  return !!incoming && answerFor(incoming) === played;
}

// ── the too-early swing ─────────────────────────────────────────────────────

/**
 * A press outside the 0.34 s band was refused and cost nothing, so mashing from early always landed an 'early' return.
 * TUNED (2026-10-06): a press up to EARLY_LOCK_SEC before contact (but outside the band) now LOCKS the player out of
 * that ball. Further out than that it is refused without a lock — a press a whole second early is not a timing attempt,
 * and one stray tap after the opponent's strike should not cost the point. Mashing at 4 presses a second or faster
 * always lands a press in the 0.26 s lock zone.
 */
export const EARLY_LOCK_SEC = 0.6;
export type EarlyPress = 'swing' | 'lock' | 'wait';
/** `dt` is swing time − ideal contact (negative = early). 'swing' is any press inside the band, or after contact. */
export function earlyPress(dt: number): EarlyPress {
  if (dt >= -SWING_BANDS.ok) return 'swing';
  return dt >= -EARLY_LOCK_SEC ? 'lock' : 'wait';
}

// ── the Zone Shot ───────────────────────────────────────────────────────────

/**
 * What holding a Zone Shot costs. Only a ±90 ms perfect saved a racket, and three lost rackets end the match mid-set.
 * TUNED (2026-10-06): a GOOD hold now costs the point but keeps the racket; early / late still break one. Both sides
 * play the same economy (a gauge only one side can spend is a handicap, not a mechanic).
 */
export type ZoneHold = 'held' | 'point' | 'racket';
export function zoneHold(q: SwingQuality): ZoneHold {
  return q === 'perfect' ? 'held' : q === 'good' ? 'point' : 'racket';
}

// ── the opponent's shot ─────────────────────────────────────────────────────

/** The fixed mix the opponent played (50 / 25 / 15 / 10): the neutral read below starts from it. */
export const AI_SHOT_BASE: Readonly<Record<TennisShot, number>> = { drive: 0.5, slice: 0.25, lob: 0.15, drop: 0.1 };

export interface AiShotRead {
  /** The player's feet, world x / z, and the court they stand on. */
  playerX: number; playerZ: number; halfWidth: number; halfLength: number;
  /** The opponent took this ball at a stretch (or worse) — a defensive ball, not an attacking one. */
  stretched: boolean;
}

/**
 * The opponent's shot, weighted by where the PLAYER is — a fixed mix is easy to predict.
 *   · near the net → the lob goes over them; back at the baseline → the drop dies in front of them
 *   · pulled wide → the drive goes into the open court (the aim already plays it; this commits the pace)
 *   · and the opponent at full stretch plays the defensive ball: a lob or a slice to buy time, not a drive
 * Weights, not a decision: every shot stays possible, so the tell on the incoming ball is still a read.
 */
export function aiShotWeights(r: AiShotRead): Record<TennisShot, number> {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const deep = clamp01(Math.abs(r.playerZ) / Math.max(0.01, r.halfLength));        // 1 = on the baseline, 0 = at the net
  const wide = clamp01((Math.abs(r.playerX) / Math.max(0.01, r.halfWidth) - 0.3) / 0.5);
  const w = { ...AI_SHOT_BASE };
  w.lob += 0.35 * (1 - deep);
  w.drop += 0.15 * deep * (1 - wide);
  w.drive += 0.3 * wide;
  w.drop -= 0.05 * wide;
  if (r.stretched) { w.lob += 0.2; w.slice += 0.1; w.drive -= 0.25; }
  for (const k of Object.keys(w) as TennisShot[]) w[k] = Math.max(0.03, w[k]);
  return w;
}

/** Pick from weights with one roll (deterministic for a given `roll` in [0, 1)). */
export function pickShot(w: Readonly<Record<TennisShot, number>>, roll: number): TennisShot {
  const order: TennisShot[] = ['drive', 'slice', 'lob', 'drop'];
  const total = order.reduce((s, k) => s + w[k], 0);
  let at = roll * total;
  for (const k of order) { if (at < w[k]) return k; at -= w[k]; }
  return 'drop';
}

// ── the landing ring ────────────────────────────────────────────────────────

/**
 * What the landing ring plots: the swing the player would make NOW. It plotted a perfect swing at any moment, which
 * is not the shot you are holding. Before the band the ring sits at the band's early edge (the earliest swing that
 * still plays), inside it the ring slides with the timing — early pulls it across, late pushes it out, the Wii read —
 * and it is never a miss (a ring that vanishes says nothing).
 */
export function ringDt(dtSec: number): number {
  return Math.max(-SWING_BANDS.ok, Math.min(SWING_BANDS.ok, dtSec));
}
const SHOT_IDX: Record<TennisShot, number> = { drive: 0, slice: 1, lob: 2, drop: 3 };
const Q_IDX: Record<SwingQuality, number> = { perfect: 0, good: 1, early: 2, late: 3, miss: 4 };
/** The ring is re-planned only when what it plots changes — the shot kind, the timing grade, the aim to 1/20 — so the
 *  key is a number (a string key would itself be a per-frame allocation). */
export function ringKey(shot: TennisShot, quality: SwingQuality, aim: number): number {
  return SHOT_IDX[shot] * 1000 + Q_IDX[quality] * 100 + (Math.round(Math.max(-1, Math.min(1, aim)) * 20) + 20);
}
