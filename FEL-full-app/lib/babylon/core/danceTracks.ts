// danceTracks — the charts of The Cypher (A+ mission #1, Phase 3; MUSIC-SUITE P7, 2026-09-29).
//
// One routine at fixed constants was the Phase 0 gap: the spec wants tracks at different difficulties, a cue lane
// the couch can read, a body that answers the judgement, and a graded results card. Everything here is pure (no
// Babylon, no audio) so it is testable and so DanceMode stays the only place that touches the scene.
//
// MUSIC-SUITE P7 (2026-09-29): the three procedurally-random charts are now the SIX FEL house songs
// (lib/babylon/dance/felSongs.ts): warmup and battle keep their ids and BPMs (88 / 112 — the songs were composed to
// match), cypher too (96), and goldenhour / canals / evolution are new. Each track's steps are no longer a random
// walk through DANCE_LIBRARY at a flat density (generateRoutine) — stepsForSong below reads the song's OWN section
// map (energy, which stems play, the break bars) and authors press steps from it: denser in the hooks and builds,
// sparser in the intros and breaks, and a freeze step (the one clip that earns HORNS) lands on every break bar whose
// section actually plays horns. generateRoutine and DANCE_LIBRARY are UNCHANGED (DanceCore.ts is held by movement
// play, and DanceCore.equivalence.test.ts pins generateRoutine's old/new-core equivalence byte for byte) — this is a
// second, independent generator, not a replacement, and every field cueLane/HudCue read from a step (move, limb,
// zone, windowScale, lateGrace, hold) is untouched: a song step is a plain press step, exactly like the old ones
// (CONTRACT (b): "the new songs carry press steps only for now" — phase 9 authors real charts, with body targets,
// from the same section data).
//
// Seeds are fixed per track ON PURPOSE, for the exported/legacy path (stepsForSong needs no seed argument — it is
// deterministic from the song's OWN id via a local PRNG, so a retry or a share still hands back the same chart).

import type { DanceClip, DanceStep, Judgement } from './DanceCore';
import type { CueZone, Limb, MoveKind } from './bodyTargets';
import { readExportedTrack } from '../music/DanceExport';
import { DANCE_LIBRARY, isBodyStep, stepLimb } from './DanceCore';
import { CATEGORY_STEM } from '../audio/StemBand';
import { FEL_SONGS, sectionAtBar, type FelSong, type FelSongSection, type FelStem } from '../dance/felSongs';
// PIPELINES (2026-10-06): approved community songs and routines, and the player's equipped routine (dance/communityDance.ts).
import { communityCreditLine, communityDanceTracks, communityStepsFor } from '../dance/communityDance';

export interface DanceTrack {
  id: string;
  name: string;
  bpm: number;
  bars: number;
  /**
   * DanceTrack's OWN difficulty scale is, and stays, 1..3 — it is a frozen shape: a test fixture that pins
   * old/new DanceCore equivalence (tests/fixtures/dance-pre-p9/danceTracks.base.ts, "never edit it") declares its
   * own DanceTrack with `difficulty: 1 | 2 | 3` and takes a live DanceExport.readExportedTrack().track into an
   * array of them, so widening this field would fail that frozen file's own type-check, not just this one's. A
   * song's REAL 1..6 difficulty (unique per song, SONGS-REPORT.md's own scale) lives on `song.difficulty` instead —
   * pickBanner reads it there when `song` is present, and legacyDifficultyBand (below) is only how a shipped track
   * still answers this field for generateRoutine's legacy callers (now unreachable for a shipped track, since
   * stepsFor answers every one of them from stepsForSong; scripts/music/baseline-sim.ts and DanceMode.ts still pass
   * `track.difficulty` straight into generateRoutine's own 1..3 parameter, so this has to stay a real 1|2|3, not a
   * clamped 1..6).
   */
  difficulty: 1 | 2 | 3;
  /** Only meaningful for the exported track today (routineFromGroove) — kept for every track because the
   *  pre-P7 tests (DanceCore.equivalence.test.ts, danceTracks.test.ts, DanceCore.lateTap.test.ts,
   *  danceRoomFlow.test.ts, scripts/music/baseline-sim.ts) all call generateRoutine({ bars, difficulty, seed }) off
   *  a track's own fields directly. Shipped tracks carry the song's own render seed (SONGS-REPORT.md's provenance
   *  table) for continuity, though stepsForSong never reads it. */
  seed: number;
  /** One line on the pick screen. */
  blurb: string;
  /** MUSIC-SUITE P7: the FEL song this track plays. Absent only for the player's own exported track
   *  (music/DanceExport.ts) — that track carries its own steps and has no map.json. */
  song?: FelSong;
}

/** A song's real 1..6 difficulty, banded down to DanceTrack's frozen 1..3 scale (1↔2→1, 3↔4→2, 5↔6→3). Only feeds
 *  the legacy field above; every real difficulty display (pickBanner) reads `song.difficulty` directly instead. */
function legacyDifficultyBand(songDifficulty: number): 1 | 2 | 3 {
  return Math.min(3, Math.max(1, Math.ceil(songDifficulty / 2))) as 1 | 2 | 3;
}

const SONG_BLURB: Record<string, string> = {
  warmup: 'Lo-fi and lazy · one easy freeze',
  cypher: 'Slap bass leads the pocket',
  goldenhour: 'Sunset groove · a whistle hook',
  battle: 'Breakbeat battle · windmills welcome',
  canals: 'Night house · four on the floor',
  evolution: 'Fast electro-funk · four freezes',
};

/** The render seed SONGS-REPORT.md's provenance table lists for each song (build_song_provenance.py does not need
 *  it — it hashes files, not seeds — this is only for generateRoutine's legacy callers, above). */
const SONG_SEED: Record<string, number> = {
  warmup: 0x5150, cypher: 0xc1fe, goldenhour: 0x5e75, battle: 0xba77, canals: 0xca7a, evolution: 0xef01,
};

/** MUSIC-SUITE P7: one track per shipped FEL song, easy to hard (FEL_SONGS' own order). */
export const DANCE_TRACKS: readonly DanceTrack[] = FEL_SONGS.map((song) => ({
  id: song.id,
  name: song.title.toUpperCase(),
  bpm: song.bpm,
  bars: song.bars,
  difficulty: legacyDifficultyBand(song.difficulty),
  seed: SONG_SEED[song.id] ?? 1,
  blurb: SONG_BLURB[song.id] ?? song.style,
  song,
}));

export const DEFAULT_TRACK_ID = 'cypher';

/**
 * The three shipped charts PLUS the player's exported song, if they have made one.
 *
 * Music Mode's Dance Rhythm export (music/DanceExport.ts) writes one slot; it appears at the end of the
 * pick screen so "dance to the thing I just made" is one left-press away from the default. DANCE_TRACKS
 * stays a shipped constant — a player's song is not shipped content and must not be mistaken for it.
 */
export function allTracks(): readonly DanceTrack[] {
  const mine = readExportedTrack();
  const community = communityDanceTracks();   // PIPELINES: after the shipped songs, before your export
  return mine ? [...DANCE_TRACKS, ...community, mine.track] : community.length ? [...DANCE_TRACKS, ...community] : DANCE_TRACKS;
}

export function trackById(id: string | null | undefined): DanceTrack {
  const all = allTracks();
  return all.find((t) => t.id === id) ?? all.find((t) => t.id === DEFAULT_TRACK_ID)!;
}

/** Left/right on the pick screen; wraps. */
export function cycleTrack(id: string, dir: 1 | -1): DanceTrack {
  const all = allTracks();
  const i = Math.max(0, all.findIndex((t) => t.id === id));
  const n = all.length;
  return all[(i + dir + n) % n];
}

/**
 * The steps for a track.
 *
 * The player's exported track carries its OWN steps, because those steps are the point — they are the song's own
 * drums, and re-generating them from a seed would throw away the thing the export exists to preserve. Every shipped
 * track is one of the six FEL songs (MUSIC-SUITE P7): its steps come from stepsForSong, generated from the song's
 * own section map, not from a seed (stepsForSong is itself deterministic — same song in, same steps out — so this
 * still answers a retry or a share with the same chart, just without needing an RNG seed argument to do it).
 */
export function stepsFor(t: DanceTrack): DanceStep[] | null {
  const mine = readExportedTrack();
  if (mine && mine.track.id === t.id) return mine.steps;
  const community = communityStepsFor(t);   // PIPELINES: a community song's own chart, a routine looped over its song
  if (community) return community;
  return t.song ? stepsForSong(t.song) : null;
}

// ── MUSIC-SUITE P7: press steps authored from a song's own section map ──────────────────────────────────────────
//
// generateRoutine (DanceCore.ts) picks a flat mix of clips at a flat density for the whole chart; it has no idea a
// song has an intro, a hook or a break. This generator reads the song's OWN arrangement (map.json → felSongs.ts:
// each section's energy 1..5 and which of the seven earned stems it plays) and places ONE dance move per stem the
// section actually plays, at a rate that rises and falls with that section's energy — so a hit during the sparse
// intro earns the one or two instruments the intro actually has, and a hit during a hook earns all seven, exactly
// as densely as the hook plays them. A freeze (the one clip that earns HORNS) is placed on every one of the song's
// own breakBars whose section lists horns — the game's freeze beat IS the song's freeze beat, not a coincidence.
//
// Deliberately simple and documented, not "the real chart": phase 9 authors real charts (with body targets, off the
// same section data) — this only has to be honest about the song's shape and never place two steps on top of each
// other, which the beats-remaining check below guarantees the same way generateRoutine's own loop does.

/** DANCE_LIBRARY's category (StemBand.CATEGORY_STEM, inverted and lower-cased) each earned FEL stem answers to. A
 *  song step in `stem` turns on the instrument a hit on THIS family earns (DanceMode.ts onJudged → StemBand.judge). */
const STEM_TO_FAMILY: Partial<Record<FelStem, DanceClip['category']>> = Object.fromEntries(
  (Object.entries(CATEGORY_STEM) as [DanceClip['category'], string][]).map(([category, stem]) => [stem.toLowerCase(), category]),
);

/** Clips in DANCE_LIBRARY for one family, sorted by id (deterministic pick order). */
function clipsFor(category: DanceClip['category']): DanceClip[] {
  return DANCE_LIBRARY.filter((c) => c.category === category).sort((a, b) => a.id.localeCompare(b.id));
}
const FREEZE_CLIP = clipsFor('freeze')[0];
/** The shortest clip in the library (2 beats — wave/freeze/transition): the while-loop below stops once less than
 *  this remains in a section, so it never asks for a fraction of a step. */
const MIN_CLIP_BEATS = Math.min(...DANCE_LIBRARY.map((c) => c.beats));

/**
 * The minimum beats between two step STARTS, by the section's own energy (1..5). This is a FLOOR, not a fixed rest:
 * an 8-beat clip (footwork/power) always takes its own 8 beats whatever the floor says, so density in a section that
 * leans on the big moves still comes from the CLIPS, not a number here — but a short clip (2–4 beats) in a sparse
 * section (energy 1) is followed by real space, while the same short clip in a hook (energy 5) is followed by almost
 * none. Tying density to "beats between step starts" rather than "rest after this clip's own length" keeps a run of
 * short wave/transition steps in a quiet intro from ever reading as busy as a run of long moves in a hook.
 */
const STEP_GAP_BEATS_BY_ENERGY: Record<number, number> = { 1: 8, 2: 5, 3: 3, 4: 2, 5: 1.2 };

/** A tiny deterministic PRNG — the same algorithm DanceCore.ts's (private) mulberry32 uses, kept as its own copy
 *  here on purpose: this generator answers to the SONG's id, never to a chart seed, and DanceCore's own copy is
 *  pinned byte-for-byte by DanceCore.equivalence.test.ts. */
function songRng(id: string): () => number {
  let a = 0;
  for (let i = 0; i < id.length; i++) a = (Math.imul(a, 31) + id.charCodeAt(i)) >>> 0;
  if (a === 0) a = 0x9e3779b9;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The families a section actually earns (bed excluded — it has no move), in DANCE_LIBRARY's category order so two
 *  songs with the same stem list place moves in the same relative order (readable, comparable difficulty curve). */
function playableFamilies(section: FelSongSection): DanceClip['category'][] {
  const order: DanceClip['category'][] = ['toprock', 'bounce', 'footwork', 'wave', 'power', 'transition'];
  const have = new Set(section.stems.map((s) => STEM_TO_FAMILY[s]).filter((c): c is DanceClip['category'] => !!c));
  return order.filter((c) => have.has(c));
}

/** One freeze step per breakBar inside `section`, at that bar's own downbeat — only when the section's own stem
 *  list plays horns (a break the song wrote as bed-only earns nothing off a freeze that never sounds). */
function freezeStepsIn(song: FelSong, section: FelSongSection, rnd: () => number): DanceStep[] {
  if (!section.stems.includes('horns') || !FREEZE_CLIP) return [];
  const startBeat = (section.startBar - 1) * 4;
  const endBeat = startBeat + section.bars * 4;
  const out: DanceStep[] = [];
  for (const bar of song.breakBars) {
    const at = (bar - 1) * 4;
    if (at < startBeat || at + FREEZE_CLIP.beats > endBeat) continue;
    out.push({ clipId: FREEZE_CLIP.id, beat: at, holdBeats: FREEZE_CLIP.beats, mirrored: rnd() < 0.35 });
  }
  return out;
}

/**
 * Press steps for one FEL song, generated from its own section map. Deterministic: the same song always yields the
 * same steps (no external seed — see songRng above). Never places two steps on beats that overlap.
 */
export function stepsForSong(song: FelSong): DanceStep[] {
  const rnd = songRng(song.id);
  const steps: DanceStep[] = [];
  let familyTurn = 0;
  for (const section of song.sections) {
    const startBeat = (section.startBar - 1) * 4;
    const endBeat = startBeat + section.bars * 4;
    steps.push(...freezeStepsIn(song, section, rnd));

    const families = playableFamilies(section);
    if (families.length === 0) continue;   // a bed-only section (none shipped today, but never a crash)
    const gap = STEP_GAP_BEATS_BY_ENERGY[section.energy] ?? 3;
    // start each section on its own downbeat; freeze steps above may already occupy bar 0 of a break, so the
    // cursor only ever moves forward from what freezeStepsIn placed in THIS section
    let cursor = startBeat;
    const alreadyHere = steps.filter((s) => s.beat >= startBeat && s.beat < endBeat);
    for (const s of alreadyHere) cursor = Math.max(cursor, s.beat + Math.max(s.holdBeats, gap));

    while (endBeat - cursor >= MIN_CLIP_BEATS) {
      const family = families[familyTurn % families.length];
      familyTurn++;
      const options = clipsFor(family).filter((c) => c.beats <= endBeat - cursor);
      if (options.length === 0) break;   // nothing in this family fits what's left — leave the tail as a rest
      const clip = options[Math.floor(rnd() * options.length)];
      steps.push({ clipId: clip.id, beat: cursor, holdBeats: clip.beats, mirrored: rnd() < 0.35 });
      cursor += Math.max(clip.beats, gap);   // a long clip takes its own length; a short one leaves real space
    }
  }
  return steps.sort((a, b) => a.beat - b.beat);
}

/** The stems currently earnable at `bar` (1-based) — a section's own stem list, minus bed. Exported for the pick
 *  screen / tests; DanceMode reads the stem BAND state itself and never needs this at runtime. */
export function earnableStemsAtBar(song: FelSong, bar: number): FelStem[] {
  return sectionAtBar(song, bar).stems.filter((s) => s !== 'bed');
}

/** `?track=battle` deep link (probes, shares). null when absent or unknown —
 *  the mode then shows the pick screen instead of silently defaulting. */
export function trackFromQuery(search: string | null | undefined): DanceTrack | null {
  if (!search) return null;
  const m = /(?:^|[?&])track=([a-z_]+)/i.exec(search);
  if (!m) return null;
  return DANCE_TRACKS.find((t) => t.id === m[1].toLowerCase()) ?? null;
}

/** The pick-screen line: name · tempo · difficulty pips. A shipped FEL song shows ITS OWN 1..6 difficulty
 *  (song.difficulty — unique per song, SONGS-REPORT.md's own scale), not DanceTrack.difficulty's banded 1..3
 *  (legacyDifficultyBand exists only to keep generateRoutine's legacy callers type-checking, not to be shown). The
 *  player's own exported track has no song, so it keeps the original three-pip display. */
export function pickBanner(t: DanceTrack): string {
  const shown = t.song?.difficulty ?? t.difficulty;
  const scale = t.song ? 6 : 3;
  return `♪ ${t.name}  ·  ${t.bpm} BPM  ·  ${'●'.repeat(shown)}${'○'.repeat(Math.max(0, scale - shown))}${communityCreditLine(t.id)}`;
}

/** Seconds the pick screen waits for input before starting the default —
 *  a controller-less viewer (or a capture harness) still gets a routine. */
export const PICK_TIMEOUT_SEC = 6;

// ── grade ─────────────────────────────────────────────────────────────

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

/** Letter grade on weighted accuracy. Thresholds MATCH DanceCore's star
 *  bands (5★ = S … 2★ = C) so the banner and the card never disagree. */
export function gradeFor(accuracy: number): Grade {
  if (accuracy >= 0.95) return 'S';
  if (accuracy >= 0.85) return 'A';
  if (accuracy >= 0.7) return 'B';
  if (accuracy >= 0.5) return 'C';
  return 'D';
}

// ── the body answers the judgement ────────────────────────────────────

/** Playback speed multiplier for the step's clip once it is judged: a clean
 *  hit dances it full-out, a GOOD drags, a MISS is a stumble (speed 0 =
 *  "replace the move", the mode plays the react clip). */
export function bodySpeedFor(label: Judgement): number {
  switch (label) {
    case 'PERFECT': return 1;
    case 'GREAT': return 0.95;
    case 'GOOD': return 0.85;
    default: return 0;
  }
}

// ── the cue lane ──────────────────────────────────────────────────────

export const FAMILY_GLYPH: Record<DanceClip['category'], string> = {
  toprock: 'TR', bounce: 'BN', footwork: 'FW', wave: 'WV', freeze: 'FZ', power: 'PW', transition: 'SP',
};

/** Couch-legible family colours (each family = one instrument in the band). */
export const FAMILY_COLOR: Record<DanceClip['category'], string> = {
  toprock: '#F4C542', bounce: '#4FD1E8', footwork: '#7CE577', wave: '#C58BFF', freeze: '#FF8A5B', power: '#FF5E7A', transition: '#E8E8E8',
};

/** One marker on the lane. `in` is seconds until the hit (negative = just passed). */
export interface HudCue {
  in: number;
  name: string;
  family: string;
  glyph: string;
  color: string;
  mirrored: boolean;
  /** What answers it: 'tap' for a press (every dance step), else the body move (bodyTargets.ts). */
  move: MoveKind;
  /** The limb a body target is for (a zone carries its own). */
  limb?: Limb;
  /** Where the target is drawn over the mirrored self-view, and which limb must reach it. */
  zone?: CueZone;
  /** A target to hold after it is hit: how long (s), for the lane's tail. */
  holdSec?: number;
}

// Body targets (movement play, phase 9): one glyph and colour per move, the same couch-legible idea as the families.
export const MOVE_GLYPH: Record<MoveKind, string> = {
  tap: '●', touch: 'TCH', jump: 'JMP', land: 'LND', squat: 'SQT', step: 'STP', penultimate: 'PEN', knee: 'KNE',
  punch: 'PCH', kick: 'KCK', hold: 'HLD',
};
export const MOVE_NAME: Record<MoveKind, string> = {
  tap: 'TAP', touch: 'TOUCH', jump: 'JUMP', land: 'LAND', squat: 'SQUAT', step: 'STEP', penultimate: 'PENULTIMATE',
  knee: 'KNEE UP', punch: 'PUNCH', kick: 'KICK', hold: 'HOLD',
};
export const MOVE_COLOR: Record<MoveKind, string> = {
  tap: '#E8E8E8', touch: '#4FD1E8', jump: '#F4C542', land: '#7CE577', squat: '#C58BFF', step: '#E8E8E8',
  penultimate: '#FF8A5B', knee: '#FF8A5B', punch: '#FF5E7A', kick: '#FF5E7A', hold: '#7CE577',
};

/** How far ahead the lane shows — about a bar at 96 BPM, readable from a couch. */
export const CUE_LOOKAHEAD_SEC = 2.4;
/** A marker lingers this long past its beat so the hit reads, then leaves. */
export const CUE_LINGER_SEC = 0.2;

/** Build the lane from the performance's upcoming steps (audio-clock times). */
export function cueLane(
  upcoming: readonly { time: number; step: DanceStep }[],
  now: number,
  lookahead: number = CUE_LOOKAHEAD_SEC,
): HudCue[] {
  const out: HudCue[] = [];
  for (const u of upcoming) {
    const dt = u.time - now;
    if (dt < -CUE_LINGER_SEC || dt > lookahead) continue;
    if (isBodyStep(u.step)) {
      const move = u.step.move!;
      const limb = stepLimb(u.step);
      out.push({
        in: Math.round(dt * 1000) / 1000,
        name: u.step.label ?? MOVE_NAME[move],
        family: move,
        glyph: MOVE_GLYPH[move],
        color: MOVE_COLOR[move],
        mirrored: u.step.mirrored,
        move,
        ...(limb ? { limb } : {}),
        ...(u.step.zone ? { zone: { ...u.step.zone } } : {}),
        ...(u.step.holdSec ? { holdSec: u.step.holdSec } : {}),
      });
      continue;
    }
    const clip = DANCE_LIBRARY.find((c) => c.id === u.step.clipId);
    const family = clip?.category ?? 'transition';
    out.push({
      in: Math.round(dt * 1000) / 1000,
      name: clip?.name ?? 'MOVE',
      family,
      glyph: FAMILY_GLYPH[family],
      color: FAMILY_COLOR[family],
      mirrored: u.step.mirrored,
      move: 'tap',
    });
  }
  return out.sort((a, b) => a.in - b.in);
}
