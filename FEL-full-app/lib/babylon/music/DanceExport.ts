// DanceExport — YOUR SONG BECOMES THE CHART (2026-09-13).
//
// Mission: Music Mode — Grid tier + Dance Rhythm export.
//
// The Cypher's three charts are GENERATED from a fixed seed per track (danceTracks.ts), which is right for
// shipped content: a retry has to hand the player the same chart. But it means the dance floor can only ever
// dance to what we shipped, while the Music Academy next door lets a player build a groove from scratch and
// then has nowhere to put it. This is the bridge: a song composed in the Academy becomes a playable Dance
// track, and the chart comes from the song's OWN drums rather than from a die roll.
//
// Why that is the interesting part. A seeded routine is a plausible arrangement of moves over a grid; a chart
// derived from the pattern is a routine that HITS WHAT YOU WROTE. Put a kick on the 1 and the 3 and the
// dancer's weight lands on the 1 and the 3. That is the difference between dancing with the music and
// dancing near it, and it is the whole reason to export rather than to re-roll.
//
// LICENSING (mission constraint, verbatim: "no commercial music, no licensed stems, no recognizable
// melodies"). Nothing here reads, bundles or fetches audio. It reads a pattern of BOOLEANS the player put
// there themselves and emits step timings. There is no sample, no melody and no third-party content in this
// module by construction.
//
// TIMING (mission constraint: "All timing runs off AudioContext.currentTime, never setTimeout/setInterval
// and never the render loop"). This module contains no clock at all — it converts a pattern into BEAT
// NUMBERS, and beats are turned into seconds by whoever plays them (AudioEngine already schedules against
// ctx.currentTime with a lookahead). A pure function cannot drift.
//
// Pure: no Babylon, no audio nodes, no DOM.

import type { DanceStep, DanceClip } from '../core/DanceCore';
import { DANCE_LIBRARY } from '../core/DanceCore';
import type { DanceTrack } from '../core/danceTracks';
import type { TrackState } from './AudioEngine';
import type { Section, SongChain } from './Song';
import { expandChain } from './Song';

/**
 * Which drum a track is, inferred from its sample id.
 *
 * The Academy's kits name their samples (kick / snare / hat / clap / …), and the ROLE is what the chart
 * needs: a kick is where the weight drops, a snare is the answer, a hat is ornament. Anything unrecognised
 * is ornament, which is the safe default — a chart built on a mystery sample would put the dancer's weight
 * on a sound nobody can hear as a downbeat.
 */
export type DrumRole = 'kick' | 'snare' | 'hat' | 'other';

export function roleOf(sampleId: string): DrumRole {
  const s = sampleId.toLowerCase();
  if (/kick|bd|808|boom|sub/.test(s)) return 'kick';
  if (/snare|sd|clap|rim|snap/.test(s)) return 'snare';
  if (/hat|hh|shaker|tick|ride|perc/.test(s)) return 'hat';
  return 'other';
}

/** Where the weight can land, in beats from the start of the song, with what kind of hit made it. */
export interface GrooveHit {
  beat: number;
  role: DrumRole;
  /** How many tracks fired on this step — a kick AND a clap together is a bigger moment than either alone. */
  weight: number;
}

/**
 * The song's groove, as a list of hits in beats.
 *
 * `steps` is the sequencer's resolution (16 steps to a bar in the Academy), so a step is a sixteenth note
 * and four steps are a beat. Muted tracks are skipped, because a muted track is one the player decided not
 * to hear and a chart that dances to it is dancing to something invisible.
 */
export function grooveOf(bars: TrackState[][], steps: number): GrooveHit[] {
  const perBeat = steps / 4;
  const hits: GrooveHit[] = [];
  bars.forEach((tracks, barIndex) => {
    const byStep = new Map<number, { role: DrumRole; weight: number }>();
    for (const t of tracks) {
      if (t.muted || t.volume <= 0) continue;
      const role = roleOf(t.sampleId);
      t.pattern.forEach((on, step) => {
        if (!on || step >= steps) return;
        const prev = byStep.get(step);
        // a kick outranks a snare outranks a hat when several land together: the chart follows the BODY
        const rank = (r: DrumRole): number => (r === 'kick' ? 3 : r === 'snare' ? 2 : r === 'hat' ? 1 : 0);
        if (!prev) byStep.set(step, { role, weight: 1 });
        else byStep.set(step, { role: rank(role) > rank(prev.role) ? role : prev.role, weight: prev.weight + 1 });
      });
    }
    for (const [step, v] of byStep) {
      hits.push({ beat: barIndex * 4 + step / perBeat, role: v.role, weight: v.weight });
    }
  });
  return hits.sort((a, b) => a.beat - b.beat);
}

/**
 * How busy the groove is, 0..1 — hits per beat, normalised against a dense sixteenth-note pattern.
 *
 * This is what sets the exported track's DIFFICULTY, and deriving it beats asking: a player who writes four
 * kicks and nothing else has written an easy track whatever they would have picked from a menu, and one who
 * fills every sixteenth has written a hard one.
 */
export function density(hits: GrooveHit[], totalBeats: number): number {
  if (totalBeats <= 0) return 0;
  return Math.max(0, Math.min(1, hits.length / totalBeats / 4));
}

export function difficultyFor(d: number): 1 | 2 | 3 {
  return d >= 0.55 ? 3 : d >= 0.28 ? 2 : 1;
}

/**
 * Turn a groove into a routine.
 *
 * The rule that makes this a chart rather than a list: steps are laid down SEQUENTIALLY and each consumes
 * its own clip length, exactly as generateRoutine does — a routine may never ask the dancer to start a
 * windmill halfway through a six-step. So the groove proposes moments and this accepts the ones the body is
 * free for, preferring the heaviest hit available in each window.
 *
 * Move choice follows the hit's role, which is the part that makes the export feel authored:
 *   · a KICK is where weight drops — footwork, power, freezes;
 *   · a SNARE is the answer — top rock, bounces, transitions;
 *   · a HAT is ornament — waves and short moves only.
 */
export function routineFromGroove(hits: GrooveHit[], totalBeats: number, difficulty: 1 | 2 | 3, seed = 1): DanceStep[] {
  const pool = DANCE_LIBRARY.filter((c) => c.difficulty <= difficulty);
  if (!pool.length || totalBeats <= 0) return [];
  const forRole = (role: DrumRole): DanceClip[] => {
    const want = role === 'kick' ? ['footwork', 'power', 'freeze', 'bounce']
      : role === 'snare' ? ['toprock', 'bounce', 'transition']
      : ['wave', 'transition', 'bounce'];
    const picked = pool.filter((c) => want.includes(c.category));
    return picked.length ? picked : pool;
  };
  // deterministic: the same song must export the same chart every time, or "play my song" is a different
  // routine each press — the same reason generateRoutine is seeded
  let a = seed >>> 0;
  const rnd = (): number => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const steps: DanceStep[] = [];
  let free = 0;                                   // the first beat the body is available
  for (const hit of hits) {
    if (hit.beat < free) continue;                // still mid-move: this hit passes by, as it must
    const remaining = totalBeats - hit.beat;
    if (remaining <= 0) break;
    const fits = forRole(hit.role).filter((c) => c.beats <= remaining);
    if (!fits.length) continue;
    const clip = fits[Math.floor(rnd() * fits.length)];
    steps.push({ clipId: clip.id, beat: hit.beat, holdBeats: clip.beats, mirrored: rnd() < 0.35 });
    free = hit.beat + clip.beats;
  }
  return steps;
}

export interface ExportedTrack {
  track: DanceTrack;
  steps: DanceStep[];
  /** What the chart was built from, for the card that explains the export. MUSIC-SUITE P4: + the song's key ('Am'). */
  summary: { hits: number; density: number; bars: number; beats: number; key?: string };
}

/** A song id that is stable for the same song, so re-exporting overwrites rather than piling up. */
export function exportedTrackId(songId: string): string {
  return `song_${songId.replace(/[^a-z0-9_]/gi, '').slice(0, 24).toLowerCase() || 'untitled'}`;
}

/** A deterministic seed from the song's own id — the export must not move between presses. */
export function seedFrom(songId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < songId.length; i++) { h ^= songId.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * THE EXPORT. A composed song in, a playable Dance track out.
 *
 * Deliberately returns the chart as DATA rather than registering it anywhere: the dance floor takes a
 * DanceTrack and a step list, and a pure function that hands both back can be tested, shared and re-exported
 * without a store, a scene or an audio context in the room.
 */
export function exportSongToDance(
  song: { id: string; name: string; bpm: number; steps: number; chain: SongChain; sections: Section[]; key?: string },
): ExportedTrack | null {
  const bars = expandChain(song.chain, song.sections);
  if (!bars.length) return null;                  // an empty arrangement is not a track
  const totalBeats = bars.length * 4;
  const hits = grooveOf(bars, song.steps);
  if (!hits.length) return null;                  // silence is not a chart
  const d = density(hits, totalBeats);
  const difficulty = difficultyFor(d);
  const seed = seedFrom(song.id);
  const steps = routineFromGroove(hits, totalBeats, difficulty, seed);
  if (!steps.length) return null;
  return {
    track: {
      id: exportedTrackId(song.id),
      name: (song.name || 'MY TRACK').toUpperCase().slice(0, 24),
      bpm: song.bpm,
      bars: bars.length,
      difficulty,
      seed,
      // MUSIC-SUITE P4 (2026-09-25), grid-ui: the song's key rides on the card ('Your song · A minor · 64 hits') — the project
      // has one now (StudioProject.key), and the dance floor's pick card is where the player sees it. MUSIC-SUITE P4 FIX
      // PASS: in words (scales.ts keyCardText) — the Cypher's chip upper-cases the blurb, and 'Am' read 'AM'
      blurb: `Your song · ${song.key ? `${song.key} · ` : ''}${hits.length} hits · ${'●'.repeat(difficulty)}${'○'.repeat(3 - difficulty)}`,
    },
    steps,
    summary: { hits: hits.length, density: +d.toFixed(3), bars: bars.length, beats: totalBeats, ...(song.key ? { key: song.key } : {}) },
  };
}

// ── MUSIC-SUITE P3 (2026-09-25), "Keep my work": THE TIER GATE ───────────────────────────────────────────────────────
//
// The ladder opens the dance export AT THE GRID (MusicTiers TIERS.grid.danceExport, "one bar of drums is already a
// chart"), but the only SEND TO THE DANCE FLOOR button lived in SongPanel, which mounts at the CHAIN, and it exported the
// CHAIN — disabled while the chain was empty. So the grid tier never had it. Now the song the dance floor gets is decided
// here, from the tier's own flags: with the arrangement open and a chain built, the chain; otherwise the grid itself,
// looped. Either way only the rows the room draws and plays go in (`heard`: MusicTiers.shownRowIds) — a chart that
// dances to a hidden row dances to something nobody can hear, the rule grooveOf already applies to a muted row.

/** How long the grid alone plays on the dance floor (assumption: 8 bars — the PERFORM win's minimum, near the Cypher's
 *  shipped 13–17-bar songs; one bar would be a 2.5-second dance). */
export const GRID_DANCE_BARS = 8;
export const GRID_SECTION_ID = 'grid';

/** The song the dance floor gets at this tier, or null when the tier has no dance export. */
export function danceSongAtTier(input: {
  danceExport: boolean; arrangement: boolean; chain: SongChain; sections: Section[]; grid: TrackState[]; heard: (t: TrackState) => boolean;
}): { chain: SongChain; sections: Section[]; from: 'chain' | 'grid' } | null {
  if (!input.danceExport) return null;
  const only = (ts: TrackState[]): TrackState[] => ts.filter(input.heard);
  if (input.arrangement && input.chain.length) {
    return { chain: input.chain, sections: input.sections.map((s) => ({ ...s, tracks: only(s.tracks) })), from: 'chain' };
  }
  return {
    chain: [{ sectionId: GRID_SECTION_ID, bars: GRID_DANCE_BARS }],
    sections: [{ id: GRID_SECTION_ID, name: 'grid', tracks: only(input.grid) }],
    from: 'grid',
  };
}

// ── Handing it to the dance floor ──────────────────────────────────────────
//
// The export is stored rather than registered: DANCE_TRACKS is a shipped constant and a player's song is
// not shipped content. One slot, overwritten by the next export, because a library of half-finished grooves
// on the pick screen is clutter and the player already has their songs in the Academy.

export const EXPORTED_TRACK_KEY = 'fel-dance-exported';

/**
 * Keep the export for the Cypher. MUSIC-SUITE P3 FIX PASS (2026-09-25): true when it was kept. It swallowed every failure
 * and the room always said "sent to the dance floor" — with localStorage full (the pre-P3 library still in it, the
 * walk-out's 1.5 M-character copy) or in private mode the Cypher found nothing. The room says the failure now.
 */
export function saveExportedTrack(out: ExportedTrack): boolean {
  try {
    if (typeof window === 'undefined') return false;
    window.localStorage.setItem(EXPORTED_TRACK_KEY, JSON.stringify(out));
    return true;
  } catch { return false; /* private mode or full: not kept — the caller says so */ }
}

/** The player's exported chart, or null. Never throws — a corrupt value is the same as no export. */
export function readExportedTrack(): ExportedTrack | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(EXPORTED_TRACK_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ExportedTrack;
    if (!v?.track?.id || !Array.isArray(v.steps) || !v.steps.length) return null;
    // a stored chart is data the player put there, but it is still parsed input: check the shape rather
    // than trusting it, or one bad write breaks the pick screen for good
    if (typeof v.track.bpm !== 'number' || typeof v.track.bars !== 'number') return null;
    return v;
  } catch { return null; }
}

export function clearExportedTrack(): void {
  try { window.localStorage.removeItem(EXPORTED_TRACK_KEY); } catch { /* nothing to clear */ }
}
