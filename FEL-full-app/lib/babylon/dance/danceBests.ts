// danceBests — IMPROVE (2026-10-06, #4): a personal best per track (and level) on THIS device, shown on the pick
// screen so every song has a target to replay against. Nothing was stored before.
//
// Device-local on purpose: this is a replay target, not a record anyone is paid on. The Arena's own score stays the
// server's (lib/sessions/*); nothing here is ever sent. The merge and the line are pure; read/write wrap localStorage
// and degrade to "no best" when storage is blocked (private window, previews).

import type { Grade } from '../core/danceTracks';
import type { DanceLevel } from './chartPlay';

export interface DanceBest { score: number; grade: Grade; maxCombo: number; fullCombo: boolean }
export interface DanceRun { score: number; grade: Grade; maxCombo: number; fullCombo: boolean }

export const DANCE_BESTS_KEY = 'fel:dance:bests:v1';
const GRADE_RANK: Record<Grade, number> = { S: 4, A: 3, B: 2, C: 1, D: 0 };
const isGrade = (g: unknown): g is Grade => typeof g === 'string' && g in GRADE_RANK;

/** NORMAL keeps the bare track id (the chart as shipped); another level is its own chart, so its own best. */
export const bestKey = (trackId: string, level: DanceLevel): string => (level === 'normal' ? trackId : `${trackId}@${level}`);

/** Each field is its own best: the top score, the top grade, the longest combo, and whether any run was a full combo. */
export function mergeBest(prev: DanceBest | null, run: DanceRun): { best: DanceBest; improved: boolean } {
  if (!prev) return { best: { ...run }, improved: true };
  const best: DanceBest = {
    score: Math.max(prev.score, run.score),
    grade: GRADE_RANK[run.grade] > GRADE_RANK[prev.grade] ? run.grade : prev.grade,
    maxCombo: Math.max(prev.maxCombo, run.maxCombo),
    fullCombo: prev.fullCombo || run.fullCombo,
  };
  const improved = best.score !== prev.score || best.grade !== prev.grade || best.maxCombo !== prev.maxCombo || best.fullCombo !== prev.fullCombo;
  return { best, improved };
}

/** The pick-screen line: "BEST 12,340 · A · ×48 · FC", or '' with no best yet. */
export function bestLine(b: DanceBest | null): string {
  if (!b) return '';
  return `BEST ${Math.round(b.score).toLocaleString('en-US')} · ${b.grade} · ×${b.maxCombo}${b.fullCombo ? ' · FC' : ''}`;
}

/** Only well-formed rows survive a read (a hand-edited or older blob never throws the pick screen down). */
export function parseBests(raw: string | null): Record<string, DanceBest> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, DanceBest> = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const [k, v] of Object.entries(obj)) {
      const r = v as Partial<DanceBest> | null;
      if (!r || typeof r.score !== 'number' || !Number.isFinite(r.score) || !isGrade(r.grade)) continue;
      out[k] = { score: r.score, grade: r.grade, maxCombo: Number.isFinite(r.maxCombo) ? Number(r.maxCombo) : 0, fullCombo: r.fullCombo === true };
    }
    return out;
  } catch { return {}; }
}

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function readBest(trackId: string, level: DanceLevel): DanceBest | null {
  const s = storage();
  if (!s) return null;
  try { return parseBests(s.getItem(DANCE_BESTS_KEY))[bestKey(trackId, level)] ?? null; } catch { return null; }
}

/** Merge a finished run in; returns whether it set a new best (any field). */
export function recordBest(trackId: string, level: DanceLevel, run: DanceRun): boolean {
  const s = storage();
  if (!s) return false;
  try {
    const all = parseBests(s.getItem(DANCE_BESTS_KEY));
    const key = bestKey(trackId, level);
    const { best, improved } = mergeBest(all[key] ?? null, run);
    if (improved) { all[key] = best; s.setItem(DANCE_BESTS_KEY, JSON.stringify(all)); }
    return improved;
  } catch { return false; }
}
