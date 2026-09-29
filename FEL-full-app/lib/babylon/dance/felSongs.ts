// felSongs — MUSIC-SUITE P7 (2026-09-29): the typed, validated index of the six FEL house songs the dance room plays.
//
// The six songs (public/audio/songs/<id>/{map.json,preview.mp3,stems/*.mp3}, made and validated OUTSIDE the repo:
// see scripts/music/songs/README.md and SONGS-REPORT.md) are FIXED, shipped content -- not something a player
// uploads -- so their gameplay-relevant fields are extracted ONCE from each song's map.json into felSongsData.json
// (a ~11 KB hand-generated snapshot, not the ~570 KB of all six maps combined: the per-note onsets, the chord
// progression, the mix/encoding numbers and the full provenance block are read straight off the shipped map.json by
// a real chart author (phase 9) or by lib/babylon/music/provenance.test.ts, never off this slim index) and imported
// here as ordinary JSON -- synchronous, no fetch -- so DANCE_TRACKS (danceTracks.ts) and every test that touches it
// can stay a plain module-load-time constant, the way they always have (flipPack.ts's index, by contrast, is loaded
// with `fetch` at runtime -- that pack can change without a rebuild; these six songs cannot).
//
// felSongs.test.ts is the guard against drift: it re-reads every real public/audio/songs/<id>/map.json off disk with
// node's `fs` and checks this file's data against it field by field, so a re-render that changes a song's
// key/bpm/sections without updating felSongsData.json fails loudly here instead of silently mismatching the audio.
//
// Regenerate felSongsData.json after any re-render (scripts/music/songs/README.md, "After a re-render"):
//   python3 -c "
//   import json, os
//   SONGS_DIR = 'public/audio/songs'; ORDER = ['warmup','cypher','goldenhour','battle','canals','evolution']
//   out = []
//   for sid in ORDER:
//       m = json.load(open(os.path.join(SONGS_DIR, sid, 'map.json')))
//       sections = [{'name': s['name'], 'startBar': s['startBar'], 'bars': s['bars'], 'energy': s['energy'],
//                    'stems': s['stems'], **({'label': s['label']} if 'label' in s else {})} for s in m['sections']]
//       out.append({'id': m['id'], 'title': m['title'], 'style': m['style'], 'bpm': m['bpm'], 'key': m['key'],
//                   'timeSig': m['timeSig'], 'bars': m['bars'], 'durationSec': m['durationSec'], 'swing': m['swing'],
//                   'sections': sections, 'breakBars': m['breakBars'], 'difficulty': m['difficulty'],
//                   'targetTapsPerMin': m['targetTapsPerMin'], 'hookStem': m['hookStem'], 'preview': m['preview']})
//   json.dump(out, open('lib/babylon/dance/felSongsData.json', 'w'), indent=1)
//   "

import raw from './felSongsData.json';

/** The eight audio stems every song ships (CONTRACT.md §2); 'bed' has no move family -- it is always on. */
export const FEL_STEMS = ['bed', 'drums', 'bass', 'keys', 'perc', 'horns', 'lead', 'fx'] as const;
export type FelStem = typeof FEL_STEMS[number];
const FEL_STEM_SET: ReadonlySet<string> = new Set(FEL_STEMS);
export const isFelStem = (s: string): s is FelStem => FEL_STEM_SET.has(s);

export type SectionName = 'intro' | 'verse' | 'build' | 'hook' | 'break' | 'bridge' | 'outro';

export interface FelSongSection {
  name: SectionName;
  startBar: number;
  bars: number;
  /** 1 (sparsest) .. 5 (densest) -- the song's own energy arc (map.json). */
  energy: number;
  /** Which of FEL_STEMS play in this section ('bed' is in every one). */
  stems: FelStem[];
  label?: string;
}

export type SongDifficulty = 1 | 2 | 3 | 4 | 5 | 6;

export interface FelSong {
  id: string;
  title: string;
  style: string;
  bpm: number;
  key: string;
  timeSig: string;
  bars: number;
  durationSec: number;
  swing: number;
  sections: FelSongSection[];
  /** 1-based bars where a freeze belongs (the band stops, the horns hit). */
  breakBars: number[];
  /** 1 (easiest) .. 6 (hardest), unique across the six songs. */
  difficulty: SongDifficulty;
  /** The chart density phase 9 aims for; danceTracks.stepsForSong uses it loosely (this generator is deliberately
   *  simple -- phase 9 authors the real charts). */
  targetTapsPerMin: number;
  hookStem: FelStem;
  preview: { file: string; startBar: number; bars: number };
}

/** Where a song's audio lives, server-relative (matches KitPulse.KIT_URLS / flipPack's FLIP_PACK_URL convention). */
export const songAudioUrl = (id: string, file: string): string => `/audio/songs/${id}/${file}`;
export const songStemUrl = (id: string, stem: FelStem): string => songAudioUrl(id, `stems/${stem}.mp3`);
export const songPreviewUrl = (id: string): string => songAudioUrl(id, 'preview.mp3');

// ── validation ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Checks the fields a broken snapshot (or a hand-edited map.json) would get wrong: identity, ranges, section
 * coverage (every bar exactly once, from bar 1), only real stems named anywhere, every section naming bed, at
 * least one break bar, and a preview that sits inside the song. Pure, so felSongs.test.ts can run it against both
 * the shipped snapshot AND (read separately, off disk with fs) the real map.json files, and so a broken song never
 * needs a live AudioContext or a browser to be caught.
 */
export function validateFelSong(s: FelSong): string[] {
  const problems: string[] = [];
  const fail = (why: string): void => { problems.push(why); };
  if (!/^[a-z]+$/.test(s.id)) fail(`id "${s.id}" is not [a-z]+`);
  if (!(s.bpm > 0)) fail('bpm must be positive');
  if (!(s.bars > 0) || !Number.isInteger(s.bars)) fail('bars must be a positive integer');
  if (![1, 2, 3, 4, 5, 6].includes(s.difficulty)) fail(`difficulty ${s.difficulty} is not 1..6`);
  if (!(s.durationSec > 0)) fail('durationSec must be positive');
  if (Math.abs(s.durationSec - (s.bars * 240) / s.bpm) > 1e-3) fail('durationSec does not match bars * 240 / bpm (CONTRACT.md §5)');
  if (!(s.swing >= 0.5 && s.swing <= 0.75)) fail(`swing ${s.swing} is outside [0.5, 0.75]`);
  if (!isFelStem(s.hookStem)) fail(`hookStem "${s.hookStem}" is not a real stem`);
  if (s.sections.length === 0) fail('no sections');
  let bar = 1;
  for (const sec of s.sections) {
    if (sec.startBar !== bar) fail(`section "${sec.name}" starts at bar ${sec.startBar}, expected ${bar}`);
    if (!(sec.bars > 0)) fail(`section "${sec.name}" has ${sec.bars} bars`);
    if (!(sec.energy >= 1 && sec.energy <= 5)) fail(`section "${sec.name}" energy ${sec.energy} is outside 1..5`);
    if (!sec.stems.includes('bed')) fail(`section "${sec.name}" does not list bed`);
    for (const stem of sec.stems) if (!isFelStem(stem)) fail(`section "${sec.name}" names unknown stem "${stem}"`);
    bar += sec.bars;
  }
  if (bar - 1 !== s.bars) fail(`sections cover ${bar - 1} bars, song is ${s.bars}`);
  for (const b of s.breakBars) if (!(b >= 1 && b <= s.bars)) fail(`breakBars has ${b}, outside 1..${s.bars}`);
  if (s.breakBars.length === 0) fail('breakBars is empty (no freeze ever belongs anywhere)');
  const pv = s.preview;
  if (!pv || !(pv.startBar >= 1) || pv.startBar + pv.bars - 1 > s.bars) fail('preview range falls outside the song');
  return problems;
}

const DATA = raw as unknown as FelSong[];
const problems = DATA.flatMap((s) => validateFelSong(s).map((problem) => `${s.id}: ${problem}`));
if (problems.length) {
  // A broken snapshot must never ship silently: DANCE_TRACKS, the pick screen and SongStemBand all trust this index
  // without re-validating it themselves, so this throws at import time rather than at some later, harder-to-trace call.
  throw new Error(`felSongs: ${problems.length} problem(s) in felSongsData.json: ${problems.join('; ')}`);
}
{
  const ids = DATA.map((s) => s.id);
  if (new Set(ids).size !== ids.length) throw new Error(`felSongs: duplicate id in felSongsData.json (${ids.join(', ')})`);
  const diffs = DATA.map((s) => s.difficulty);
  if (new Set(diffs).size !== diffs.length) throw new Error(`felSongs: difficulty must be unique across the six songs (${diffs.join(', ')})`);
}

/** Easy -> hard: SONGS-REPORT.md's own order, which also matches ascending bpm and difficulty. */
export const FEL_SONGS: readonly FelSong[] = DATA;
export const FEL_SONG_IDS: readonly string[] = DATA.map((s) => s.id);

const BY_ID = new Map(FEL_SONGS.map((s) => [s.id, s]));
export const songFor = (id: string | null | undefined): FelSong | undefined => (id ? BY_ID.get(id) : undefined);
export const isFelSongId = (id: string): boolean => BY_ID.has(id);

/** The section a bar (1-based) falls in; a bar past the end (a rounding slip on the very last beat) gets the last
 *  section rather than throwing. */
export function sectionAtBar(song: FelSong, bar: number): FelSongSection {
  for (const s of song.sections) if (bar >= s.startBar && bar < s.startBar + s.bars) return s;
  return song.sections[song.sections.length - 1];
}

/** Seconds per bar at this song's tempo (4/4 only -- every shipped song is; CONTRACT.md §5's durationSec formula). */
export const secPerBar = (song: FelSong): number => 240 / song.bpm;

/** The 1-based bar `atSec` seconds after the song's own t = 0 falls in (clamped to the song's own length). */
export function barAtSec(song: FelSong, atSec: number): number {
  const bar = 1 + Math.floor(Math.max(0, atSec) / secPerBar(song));
  return Math.min(song.bars, Math.max(1, bar));
}

/** [startSec, endSec) of a section, on the song's own t = 0 clock (sample 0 of every stem). */
export function sectionTimeRange(song: FelSong, section: FelSongSection): { startSec: number; endSec: number } {
  const spb = secPerBar(song);
  return { startSec: (section.startBar - 1) * spb, endSec: (section.startBar - 1 + section.bars) * spb };
}

/** The song's last section, and its [startSec, endSec) -- what the results screen's outro plays (DanceMode.ts). */
export function outroRange(song: FelSong): { section: FelSongSection; startSec: number; endSec: number } {
  const section = song.sections[song.sections.length - 1];
  return { section, ...sectionTimeRange(song, section) };
}
