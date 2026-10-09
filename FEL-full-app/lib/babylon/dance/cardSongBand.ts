// cardSongBand — PIPELINES (owner, 2026-10-06): the Cypher's band for a COMMUNITY song, an approved music card with a
// Dance chart (lib/pipelines/community.ts danceSongOf).
//
// A FEL song ships eight stems, so SongStemBand turns each move family's own instrument up or down. A creator's card is
// ONE mixed file, so there is nothing to split: here the whole mix is the band, and how well you dance decides how
// clearly you hear it. A clean run keeps it open and full; a miss MUFFLES it (a low-pass closes and the level dips) and
// hits open it back up. The per-family levels still move exactly as StemBand's do (nextStemLevel, unchanged), so the
// instrument chips, the results screen's MIX % and every `band?.…` call in DanceMode read this class like the others.
//
// SAME PUBLIC SHAPE as SongStemBand: load, judge, level, mixLevel, setClock, start, update, rewind, cancelFrom,
// playOutro, dispose, skipped. One AudioBufferSource from the card's PUBLIC mix URL (CORS on the public bucket, owner's
// bucket setup), through the card's loudness gain, the muffle filter and a level gain, into the room's own node on
// SoundKit's music bus.

import { nextStemLevel, CATEGORY_STEM, type StemCategory } from '../audio/StemBand';
import type { Judgement } from '../core/DanceCore';
import { dbToGain } from '@/lib/soundtrack/gain';

export interface CardSong { url: string; gainDb: number; bpm: number }

/** How open the mix starts, 0..1: a player who has not danced yet hears the song, slightly held back. */
export const HEAT_START = 0.7;
/** TUNED (new): what one judgement does to the heat. A miss costs about two clean hits. */
export const HEAT_STEP: Readonly<Record<Judgement, number>> = { PERFECT: 0.12, GREAT: 0.09, GOOD: 0.04, MISS: -0.22 };
/** Low-pass cutoff at heat 0 and at heat 1 (Hz). Closed sounds "through a wall"; open is past hearing. */
export const CUTOFF_CLOSED_HZ = 650;
export const CUTOFF_OPEN_HZ = 18_000;
/** The level never drops below this share: a dancer who misses everything still needs a pocket to dance to. */
export const LEVEL_FLOOR = 0.55;
const SMOOTH_SEC = 0.08;
const CLICK_FADE_SEC = 0.015;

const EARNED = Object.keys(CATEGORY_STEM) as StemCategory[];

export const cutoffFor = (heat: number): number => {
  const h = Math.max(0, Math.min(1, heat));
  return CUTOFF_CLOSED_HZ * Math.pow(CUTOFF_OPEN_HZ / CUTOFF_CLOSED_HZ, h * h);
};
export const levelFor = (heat: number): number => LEVEL_FLOOR + (1 - LEVEL_FLOOR) * Math.max(0, Math.min(1, heat));
export const nextHeat = (heat: number, j: Judgement): number => Math.max(0, Math.min(1, heat + HEAT_STEP[j]));

export class CardSongBand {
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private trim: GainNode;
  private filter: BiquadFilterNode;
  private level_: GainNode;
  private levels = new Map<StemCategory, number>();
  private heat = HEAT_START;
  private startedAt = 0;
  private started = false;
  private dead = false;
  private toAudio: (songSec: number) => number = (s) => s;
  readonly skipped = 0;

  constructor(private ctx: AudioContext, dest: AudioNode, readonly song: CardSong) {
    this.trim = ctx.createGain();
    this.trim.gain.value = dbToGain(song.gainDb);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = cutoffFor(this.heat);
    this.level_ = ctx.createGain();
    this.level_.gain.value = 0;
    this.trim.connect(this.filter);
    this.filter.connect(this.level_);
    this.level_.connect(dest);
  }

  /** Fetch + decode the mix. Resolves 1 when it loaded, 0 otherwise; never throws (the run plays on the count-in clicks). */
  async load(fetchImpl: typeof fetch = fetch): Promise<number> {
    try {
      const res = await fetchImpl(this.song.url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) return 0;
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      if (!this.dead) this.buffer = buf;
      return this.buffer ? 1 : 0;
    } catch { return 0; }
  }

  get loaded(): boolean { return !!this.buffer; }

  judge(cat: StemCategory | undefined, judgement: Judgement): void {
    if (cat) this.levels.set(cat, nextStemLevel(this.levels.get(cat) ?? 0, judgement));
    this.heat = nextHeat(this.heat, judgement);
    this.applyHeat(this.ctx.currentTime);
  }

  level(cat: StemCategory): number { return this.levels.get(cat) ?? 0; }

  /** Same reading as StemBand/SongStemBand: the average earned level over the seven move families. */
  mixLevel(): number {
    let sum = 0;
    for (const cat of EARNED) sum += this.level(cat);
    return sum / EARNED.length;
  }

  /** The muffle state, 0 (closed) .. 1 (open). Read-only, for tests and the dev probe. */
  get openness(): number { return this.heat; }

  setClock(toAudio: (songSec: number) => number): void { this.toAudio = toAudio; }

  start(nowSec: number): void {
    this.startedAt = nowSec;
    this.started = true;
    this.arm(nowSec, 0);
  }

  /** A mix still decoding when start() ran joins here, at the point the song has reached. */
  update(nowSec: number): void {
    if (this.dead || !this.started || this.source || !this.buffer) return;
    this.arm(nowSec, nowSec - this.startedAt);
  }

  rewind(songSec: number): void {
    if (!this.started) return;
    this.arm(songSec, songSec - this.startedAt);
  }

  cancelFrom(audioSec: number): number {
    if (!this.source) return 0;
    const at = Math.max(this.ctx.currentTime, audioSec);
    try {
      this.level_.gain.cancelScheduledValues(at);
      this.level_.gain.setValueAtTime(this.level_.gain.value, at);
      this.level_.gain.linearRampToValueAtTime(0, at + CLICK_FADE_SEC);
      this.source.stop(at + CLICK_FADE_SEC);
    } catch { /* already stopped */ }
    this.source = null;
    return 1;
  }

  /** The results screen hears the song finish, fully open, fading out (SongStemBand.playOutro's contract). */
  playOutro(fromSongSec: number, durationSec: number, fadeSec = 1.2): void {
    if (this.dead || !this.buffer) return;
    this.cancelFrom(this.ctx.currentTime);
    this.heat = 1;
    const when = this.ctx.currentTime + 0.05;
    this.filter.frequency.setValueAtTime(CUTOFF_OPEN_HZ, when);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.trim);
    const offset = Math.min(Math.max(0, fromSongSec), Math.max(0, this.buffer.duration - 0.05));
    const playFor = Math.min(durationSec, this.buffer.duration - offset);
    const fadeStart = when + Math.max(0, playFor - fadeSec);
    this.level_.gain.cancelScheduledValues(when);
    this.level_.gain.setValueAtTime(1, when);
    this.level_.gain.setValueAtTime(1, fadeStart);
    this.level_.gain.linearRampToValueAtTime(0, fadeStart + fadeSec);
    src.start(when, offset, playFor > 0 ? playFor : undefined);
    this.source = src;
  }

  dispose(): void {
    this.dead = true;
    this.cancelFrom(this.ctx.currentTime);
    try { this.level_.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); } catch { /* closing */ }
  }

  private arm(atSongSec: number, offsetSec: number): void {
    if (this.dead) return;
    if (this.source) { try { this.source.stop(0); } catch { /* stopped */ } try { this.source.disconnect(); } catch { /* gone */ } this.source = null; }
    if (!this.buffer) return;
    const when = Math.max(this.ctx.currentTime, this.toAudio(atSongSec));
    const offset = Math.min(Math.max(0, offsetSec), Math.max(0, this.buffer.duration - 1e-3));
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.trim);
    src.start(when, offset);
    this.source = src;
    this.level_.gain.cancelScheduledValues(when);
    this.level_.gain.setValueAtTime(0, when);
    this.level_.gain.linearRampToValueAtTime(levelFor(this.heat), when + CLICK_FADE_SEC);
    this.filter.frequency.setValueAtTime(cutoffFor(this.heat), when);
  }

  private applyHeat(at: number): void {
    this.filter.frequency.setTargetAtTime(cutoffFor(this.heat), at, SMOOTH_SEC);
    if (this.source) this.level_.gain.setTargetAtTime(levelFor(this.heat), at, SMOOTH_SEC);
  }
}
