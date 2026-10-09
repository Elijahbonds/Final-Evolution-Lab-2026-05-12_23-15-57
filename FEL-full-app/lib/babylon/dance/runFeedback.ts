// runFeedback — IMPROVE (2026-10-06): what the Cypher tells the player about a run, pure so node can test it.
//
// DanceMode owns the scene and the clock; this owns the words and the small decisions behind them:
//   #1  every non-PERFECT hit says which side of the beat it landed on (EARLY / LATE), not just a MISS;
//   #2  one tracked banner-clear time, so an older judgement's clear can never wipe a newer banner;
//   #3  the run's average timing offset, with a recalibrate prompt when it leans one way;
//   #6  a full combo (no MISS at all) is its own callout;
//   #9  the weakest section of the song, by misses, so a run hands back one concrete thing to practise.
// No Babylon, no audio, no DOM.

import type { Judgement } from '../core/DanceCore';
import type { FelSong } from './felSongs';

// ── #1 EARLY / LATE on every non-PERFECT judgement ───────────────────────────────────────────────────────────────

/** ' — EARLY' / ' — LATE' for a GREAT, GOOD or MISS that carries its signed delta (− = early). A PERFECT is on the
 *  beat by definition, and a judgement with no delta (a step that expired untouched) has no side to name. */
export function judgementTag(label: Judgement, deltaMs?: number): string {
  if (label === 'PERFECT' || typeof deltaMs !== 'number' || !Number.isFinite(deltaMs)) return '';
  return deltaMs < 0 ? ' — EARLY' : ' — LATE';
}

/** The judgement banner: an instrument joining wins (it is rarer), else the label with its side and the combo. */
export function judgementBanner(label: Judgement, combo: number, deltaMs: number | undefined, joinBanner: string | null): string {
  if (joinBanner) return joinBanner;
  const tag = judgementTag(label, deltaMs);
  return combo >= 4 ? `${label}${tag}  ×${combo}` : `${label}${tag}`;
}

// ── #2 one banner, one clear time ────────────────────────────────────────────────────────────────────────────────

/**
 * The banner's single clear time. DanceMode used to start a fresh setTimeout per judgement (380 ms) and per GO (500 ms),
 * so on a dense section the 380 ms timer of an OLDER hit fired after a NEWER banner went up and wiped it — a 1 s
 * "X JOINS THE MIX" included. Now every banner sets the one clear time (the newest wins) and the room polls it.
 */
export class BannerClock {
  private until = 0;
  /** A banner went up at `nowMs` and should clear `holdMs` later (replaces any earlier clear). */
  show(nowMs: number, holdMs: number): void { this.until = nowMs + Math.max(1, holdMs); }
  /** Something else owns the banner now (the results, a count back in): never clear it on the old schedule. */
  cancel(): void { this.until = 0; }
  get pending(): boolean { return this.until > 0; }
  /** True exactly once: on the first poll at or after the clear time. */
  due(nowMs: number): boolean {
    if (this.until > 0 && nowMs >= this.until) { this.until = 0; return true; }
    return false;
  }
}

// ── #3 the run's average timing offset ───────────────────────────────────────────────────────────────────────────

/** Fewer judged hits than this and an average says nothing about the player's setup. */
export const OFFSET_MIN_HITS = 8;
/** NEW TUNED NUMBER: an average this far off (ms) is a setup lean, not noise — half the PERFECT window (±40 ms). */
export const OFFSET_LEAN_MS = 20;

export interface OffsetSummary { avgMs: number | null; lean: 'early' | 'late' | null; line: string }

/** The results line for the run's mean signed offset (− = early). Only hits that carry a delta count (no wild taps). */
export function offsetSummary(sumMs: number, hits: number): OffsetSummary {
  if (!(hits >= OFFSET_MIN_HITS) || !Number.isFinite(sumMs)) return { avgMs: null, lean: null, line: '' };
  const avgMs = Math.round(sumMs / hits);
  const signed = `${avgMs > 0 ? '+' : ''}${avgMs} ms`;
  if (Math.abs(avgMs) < OFFSET_LEAN_MS) return { avgMs, lean: null, line: `AVG ${signed} · IN THE POCKET` };
  const lean = avgMs < 0 ? 'early' : 'late';
  return { avgMs, lean, line: `AVG ${signed} ${lean.toUpperCase()} — RECALIBRATE: /play/calibrate` };
}

// ── #6 full combo ────────────────────────────────────────────────────────────────────────────────────────────────

/** A full combo: at least one step judged and not one MISS (an expired step and a wild tap are both MISSes). */
export function isFullCombo(counts: Record<Judgement, number>): boolean {
  const hits = counts.PERFECT + counts.GREAT + counts.GOOD;
  return hits > 0 && counts.MISS === 0;
}

// ── #9 the weakest section ───────────────────────────────────────────────────────────────────────────────────────

/** A song-less chart (a player's own export) is grouped in phrases of this many bars instead of named sections. */
export const PHRASE_BARS = 8;

/** Which section a step at `beat` (4/4, from the chart's beat 0) belongs to, and what to call it: a song's own section
 *  name with its occurrence number when the name repeats ("HOOK 2"), else the 8-bar phrase ("BARS 9–16"). */
export function sectionOf(song: FelSong | undefined, beat: number): { key: number; label: string } {
  const bar = Math.floor(Math.max(0, beat) / 4) + 1;
  if (song && song.sections.length) {
    let idx = song.sections.findIndex((s) => bar >= s.startBar && bar < s.startBar + s.bars);
    if (idx < 0) idx = song.sections.length - 1;
    const name = song.sections[idx].name;
    const same = song.sections.filter((s) => s.name === name).length;
    const nth = song.sections.slice(0, idx + 1).filter((s) => s.name === name).length;
    return { key: idx, label: same > 1 ? `${name.toUpperCase()} ${nth}` : name.toUpperCase() };
  }
  const phrase = Math.floor((bar - 1) / PHRASE_BARS);
  return { key: phrase, label: `BARS ${phrase * PHRASE_BARS + 1}–${(phrase + 1) * PHRASE_BARS}` };
}

/** Misses per section over one run; weakest() is the section with the most (the earliest on a tie), or null. */
export class SectionTally {
  private misses = new Map<number, { label: string; n: number }>();
  constructor(private song: FelSong | undefined) {}
  /** One judged step. Only a MISS counts; a wild tap has no step and never reaches here. */
  note(beat: number, label: Judgement): void {
    if (label !== 'MISS') return;
    const s = sectionOf(this.song, beat);
    const row = this.misses.get(s.key);
    if (row) row.n++; else this.misses.set(s.key, { label: s.label, n: 1 });
  }
  weakest(): { label: string; misses: number } | null {
    let best: { key: number; label: string; n: number } | null = null;
    for (const [key, row] of this.misses) {
      if (!best || row.n > best.n || (row.n === best.n && key < best.key)) best = { key, ...row };
    }
    return best ? { label: best.label, misses: best.n } : null;
  }
  /** The results line: "PRACTISE HOOK 2 · 4 MISSES", or '' for a run with no misses. */
  line(): string {
    const w = this.weakest();
    return w ? `PRACTISE ${w.label} · ${w.misses} MISS${w.misses === 1 ? '' : 'ES'}` : '';
  }
}
