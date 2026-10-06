// communityDance — PIPELINES (owner, 2026-10-06): approved Creator Cards on the Dance floor's pick screen.
//
//   COMMUNITY SONGS: an approved music card that carries a Dance chart (lib/pipelines/community.ts danceSongOf) is a
//     track: its own mix (CardSongBand), its own chart, "by <creator>" on the pick banner.
//   COMMUNITY ROUTINES: an approved dance card is a track too: perf.setRoutine gets the card's own sequence, looped bar
//     by bar across the FEL house song closest to the routine's tempo (SongStemBand plays it as for any house track).
//   MY ROUTINE: the routine the player equipped from My Creations (lib/modes/dance/active-routine.ts) — their own card,
//     approved or private — appears as MY ROUTINE, on this device only.
//
// The lists come from /api/v1/pipelines/community (fetched once, at the first allTracks() call, which DanceMode makes at
// construction; the pick screen's left/right reads the list live, so a song that arrives a moment later is there on the
// next press). Before they arrive, or with no network, the pick screen is exactly the shipped one. danceTracks.ts reads
// this file through three one-line hooks (allTracks, stepsFor, pickBanner); DanceMode through `communityDanceSong`.

import type { DanceTrack } from '../core/danceTracks';
import type { DanceStep } from '../core/DanceCore';
import { DANCE_LIBRARY } from '../core/DanceCore';
import { FEL_SONGS, type FelSong } from './felSongs';
import { fetchCommunity } from '@/lib/pipelines/client';
import type { DanceSongEntry, RoutineEntry } from '@/lib/pipelines/community';
import { reportCommunityPlay } from '@/lib/pipelines/plays';
import { DEFAULT_CELEBRATION, getEquippedRoutine, type EquippedRoutine } from '@/lib/modes/dance/active-routine';

export const SONG_PREFIX = 'card:';
export const ROUTINE_PREFIX = 'routine:';
export const MY_ROUTINE_ID = 'routine:mine';
/** A routine is looped up to this many steps over its song (DanceCore's chart sizes stay in range). */
export const ROUTINE_LOOP_MAX_STEPS = 256;
const NAME_MAX = 22;

let songs: DanceSongEntry[] = [];
let routines: RoutineEntry[] = [];
let primed = false;

const KNOWN_CLIPS = new Set(DANCE_LIBRARY.map((c) => c.id));
/** Only clips the Cypher can dance: a chart step naming anything else is dropped, never played as a stand-in. */
export const knownSteps = (steps: readonly DanceStep[]): DanceStep[] => steps.filter((s) => KNOWN_CLIPS.has(s.clipId));

/** Start fetching the community lists, once per page life, in a browser only. */
export function primeCommunityDance(): void {
  if (primed || typeof window === 'undefined') return;
  primed = true;
  void fetchCommunity('dance-songs').then((e) => { songs = e.filter((s) => knownSteps(s.chart).length >= 4); });
  void fetchCommunity('routines').then((e) => { routines = e.filter((r) => knownSteps(r.steps).length > 0); });
}

/** Tests: set the lists directly (and stop the fetch). */
export function setCommunityDance(s: DanceSongEntry[], r: RoutineEntry[]): void { songs = s; routines = r; primed = true; }

const legacyBand = (d: number): 1 | 2 | 3 => (d <= 2 ? 1 : d <= 4 ? 2 : 3);

/** The FEL house song nearest a tempo (ties: the easier one). */
export function closestSong(bpm: number): FelSong {
  return [...FEL_SONGS].sort((a, b) => Math.abs(a.bpm - bpm) - Math.abs(b.bpm - bpm) || a.difficulty - b.difficulty)[0];
}

/** Steps per beat, banded to DanceTrack's 1..3: what the pick screen's pips show for a community song. */
export function densityBand(chart: readonly DanceStep[], bars: number): 1 | 2 | 3 {
  const perBeat = chart.length / Math.max(1, bars * 4);
  return perBeat < 0.3 ? 1 : perBeat < 0.6 ? 2 : 3;
}

/** A routine, repeated bar-aligned from beat 0 across `totalBeats`, at most ROUTINE_LOOP_MAX_STEPS steps. */
export function loopRoutine(steps: readonly DanceStep[], totalBeats: number): DanceStep[] {
  const clean = knownSteps(steps).slice().sort((a, b) => a.beat - b.beat);
  if (!clean.length) return [];
  const first = clean[0].beat;
  const span = Math.max(4, Math.ceil(Math.max(...clean.map((s) => s.beat - first + s.holdBeats)) / 4) * 4);
  const out: DanceStep[] = [];
  for (let base = 0; base < totalBeats && out.length < ROUTINE_LOOP_MAX_STEPS; base += span) {
    for (const s of clean) {
      const beat = base + (s.beat - first);
      if (beat >= totalBeats || out.length >= ROUTINE_LOOP_MAX_STEPS) break;
      out.push({ ...s, beat });
    }
  }
  return out;
}

const upper = (s: string) => s.toUpperCase().slice(0, NAME_MAX);

function songTrack(e: DanceSongEntry): DanceTrack {
  return {
    id: e.id, name: upper(e.title), bpm: e.bpm, bars: e.bars, difficulty: densityBand(e.chart, e.bars), seed: 1,
    blurb: `Community song by ${e.creator.name}`,
  };
}

function routineTrack(id: string, title: string, bpm: number, blurbBy: string): DanceTrack {
  const song = closestSong(bpm);
  return { id, name: upper(title), bpm: song.bpm, bars: song.bars, difficulty: legacyBand(song.difficulty), seed: 1, blurb: `${blurbBy} · over ${song.title}`, song };
}

const isDefault = (r: EquippedRoutine): boolean => JSON.stringify(r.steps) === JSON.stringify(DEFAULT_CELEBRATION.steps);
function myRoutine(): EquippedRoutine | null {
  const r = getEquippedRoutine();
  return r && !isDefault(r) && knownSteps(r.steps).length ? r : null;
}

/** The community tracks, after the shipped ones and before the player's export (danceTracks.allTracks). */
export function communityDanceTracks(): DanceTrack[] {
  primeCommunityDance();
  const mine = myRoutine();
  return [
    ...songs.map(songTrack),
    ...routines.map((r) => routineTrack(`${ROUTINE_PREFIX}${r.cardId}`, r.title, r.bpm, `Community routine by ${r.creator.name}`)),
    ...(mine ? [routineTrack(MY_ROUTINE_ID, 'My routine', mine.bpm, 'Your equipped routine')] : []),
  ];
}

const songOf = (id: string) => (id.startsWith(SONG_PREFIX) ? songs.find((s) => s.id === id) ?? null : null);
const routineOf = (id: string) => (id.startsWith(ROUTINE_PREFIX) && id !== MY_ROUTINE_ID ? routines.find((r) => `${ROUTINE_PREFIX}${r.cardId}` === id) ?? null : null);

/** The steps for a community track (danceTracks.stepsFor), or null when the id is not one. */
export function communityStepsFor(t: Pick<DanceTrack, 'id' | 'bars'>): DanceStep[] | null {
  const s = songOf(t.id);
  if (s) return knownSteps(s.chart);
  const r = routineOf(t.id);
  if (r) return loopRoutine(r.steps, t.bars * 4);
  if (t.id === MY_ROUTINE_ID) { const m = myRoutine(); return m ? loopRoutine(m.steps, t.bars * 4) : null; }
  return null;
}

/** The pick banner's credit: " · by <creator>" for a community track, else ''. */
export function communityCreditLine(id: string): string {
  const by = songOf(id)?.creator.name ?? routineOf(id)?.creator.name;
  return by ? `  ·  by ${by}` : id === MY_ROUTINE_ID ? '  ·  your routine' : '';
}

/** The card song DanceMode builds a CardSongBand for, or null (a house song, a routine, an export). */
export function communityDanceSong(id: string): DanceSongEntry | null { return songOf(id); }

/** Lock-in on a community routine counts one play for its card (a song's plays are the soundtrack's). */
export function noteCommunityLockIn(id: string): void {
  const r = routineOf(id);
  if (r) reportCommunityPlay(r.cardId);
}
