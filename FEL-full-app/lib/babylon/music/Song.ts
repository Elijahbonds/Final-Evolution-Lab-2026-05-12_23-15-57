// Song — arrangement for the Music Academy (SPEC-PASSION-PIPELINES lane 2 M2/M3/M4). Pure and tested.
//
// A SECTION is a snapshot of the groovebox (every track's 16-step pattern) with a name — intro, verse, hook, bridge, outro.
// A CHAIN is the song: an ordered list of (section, bars). Playback walks the chain a bar at a time and the engine swaps
// patterns at each bar line. A TAKE is a recorded one-shot (a vocal) that starts at a given bar and plays through.
import type { TrackState } from './AudioEngine';

export const SECTION_NAMES = ['intro', 'verse', 'hook', 'bridge', 'outro'] as const;
export type SectionName = (typeof SECTION_NAMES)[number] | string;
export interface Section { id: string; name: SectionName; tracks: TrackState[] }
export interface ChainEntry { sectionId: string; bars: number }
export type SongChain = ChainEntry[];
export const MAX_SONG_BARS = 64;
export const MAX_CHAIN_ENTRIES = 16;

/** Deep-copy a pattern set so a saved section never drifts with the live grid. */
export function snapshotTracks(tracks: TrackState[]): TrackState[] {
  return tracks.map((t) => ({ ...t, pattern: [...t.pattern] }));
}

export function songBars(chain: SongChain): number {
  return chain.reduce((n, e) => n + Math.max(0, Math.floor(e.bars)), 0);
}

/** Bars are 1–8 each, at most 16 entries, unknown sections dropped. */
export function normalizeChain(chain: unknown, sections: Section[]): SongChain {
  if (!Array.isArray(chain)) return [];
  const ids = new Set(sections.map((s) => s.id));
  return chain
    .filter((e): e is ChainEntry => !!e && typeof e === 'object' && ids.has(String((e as ChainEntry).sectionId)))
    .map((e) => ({ sectionId: e.sectionId, bars: Math.max(1, Math.min(8, Math.floor(Number(e.bars) || 1))) }))
    .slice(0, MAX_CHAIN_ENTRIES);
}

/** Which section plays at song bar `bar` (0-based), wrapping around the chain when looping. */
export function sectionAtBar(chain: SongChain, bar: number): { sectionId: string; index: number; barInSection: number } | null {
  const total = songBars(chain);
  if (total <= 0) return null;
  let b = ((bar % total) + total) % total;
  for (let i = 0; i < chain.length; i++) {
    const n = Math.max(0, Math.floor(chain[i].bars));
    if (b < n) return { sectionId: chain[i].sectionId, index: i, barInSection: b };
    b -= n;
  }
  return null;
}

/** The song laid out bar by bar: each bar's track patterns (capped at MAX_SONG_BARS). */
export function expandChain(chain: SongChain, sections: Section[]): TrackState[][] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const out: TrackState[][] = [];
  for (const e of chain) {
    const s = byId.get(e.sectionId); if (!s) continue;
    for (let i = 0; i < Math.max(0, Math.floor(e.bars)) && out.length < MAX_SONG_BARS; i++) out.push(s.tracks);
  }
  return out;
}

export interface Take { id: string; atBar: number; gain: number; durationSec: number }
/** Seconds into the song where a bar begins. */
export function barStartSec(bar: number, bpm: number, steps: number): number { return bar * steps * (60 / bpm) / 4; }
/** Takes that start inside the song's span, with their start times. */
export function scheduleTakes(takes: Take[], bars: number, bpm: number, steps: number): { take: Take; atSec: number }[] {
  return takes.filter((t) => t.atBar >= 0 && t.atBar < bars).map((t) => ({ take: t, atSec: barStartSec(t.atBar, bpm, steps) }));
}

/** Total render length: the song plus the longest tail (a take that runs past the last bar) plus a second of air. */
export function renderLengthSec(bars: number, bpm: number, steps: number, takes: Take[]): number {
  const song = barStartSec(bars, bpm, steps);
  const tail = takes.reduce((m, t) => Math.max(m, barStartSec(t.atBar, bpm, steps) + t.durationSec), 0);
  return Math.max(song, tail) + 1.0;
}

export function newSectionId(name: string): string { return `${name}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`; }
