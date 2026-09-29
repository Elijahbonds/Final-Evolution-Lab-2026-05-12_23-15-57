// MUSIC-SUITE P7 (2026-09-29): felSongs' own tests, plus the drift guard against the real shipped map.json files.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  FEL_SONGS, FEL_STEMS, FEL_SONG_IDS, songFor, isFelSongId, isFelStem, validateFelSong,
  sectionAtBar, secPerBar, barAtSec, sectionTimeRange, outroRange, songAudioUrl, songStemUrl, songPreviewUrl,
  type FelSong,
} from './felSongs';

const APP = path.resolve(__dirname, '../../..');
const SONGS_DIR = path.join(APP, 'public/audio/songs');

describe('FEL_SONGS: the shipped index', () => {
  it('ships exactly the six songs, easy to hard, matching ascending bpm and difficulty', () => {
    expect(FEL_SONG_IDS).toEqual(['warmup', 'cypher', 'goldenhour', 'battle', 'canals', 'evolution']);
    expect(FEL_SONGS).toHaveLength(6);
    for (let i = 1; i < FEL_SONGS.length; i++) {
      expect(FEL_SONGS[i].bpm).toBeGreaterThan(FEL_SONGS[i - 1].bpm);
      expect(FEL_SONGS[i].difficulty).toBeGreaterThan(FEL_SONGS[i - 1].difficulty);
    }
    expect(new Set(FEL_SONGS.map((s) => s.difficulty))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(new Set(FEL_SONGS.map((s) => s.key)).size).toBe(6);
    expect(new Set(FEL_SONGS.map((s) => s.title)).size).toBe(6);
    expect(new Set(FEL_SONGS.map((s) => s.style)).size).toBe(6);
  });

  it('every song validates clean (validateFelSong finds nothing)', () => {
    for (const s of FEL_SONGS) expect(validateFelSong(s), s.id).toEqual([]);
  });

  it('validateFelSong actually catches breakage (it is not a no-op)', () => {
    const good = FEL_SONGS[0];
    const has = (problems: string[], re: RegExp): boolean => problems.some((p) => re.test(p));
    expect(has(validateFelSong({ ...good, sections: [...good.sections], bars: good.bars + 1 }), /sections cover/)).toBe(true);
    expect(has(validateFelSong({ ...good, breakBars: [] }), /breakBars is empty/)).toBe(true);
    expect(has(validateFelSong({ ...good, hookStem: 'nope' as FelSong['hookStem'] }), /not a real stem/)).toBe(true);
    expect(has(validateFelSong({ ...good, difficulty: 9 as FelSong['difficulty'] }), /not 1\.\.6/)).toBe(true);
    expect(has(validateFelSong({ ...good, sections: good.sections.map((s) => ({ ...s, stems: s.stems.filter((x) => x !== 'bed') })) }), /does not list bed/)).toBe(true);
  });

  it('songFor / isFelSongId, and a stray id answers nothing', () => {
    expect(songFor('cypher')?.title).toBe(FEL_SONGS.find((s) => s.id === 'cypher')!.title);
    expect(songFor('not-a-song')).toBeUndefined();
    expect(songFor(null)).toBeUndefined();
    expect(songFor(undefined)).toBeUndefined();
    expect(isFelSongId('evolution')).toBe(true);
    expect(isFelSongId('not-a-song')).toBe(false);
  });

  it('FEL_STEMS has bed plus the seven earned families, and isFelStem agrees', () => {
    expect(FEL_STEMS).toHaveLength(8);
    expect(FEL_STEMS).toContain('bed');
    for (const s of FEL_STEMS) expect(isFelStem(s)).toBe(true);
    expect(isFelStem('vocals')).toBe(false);
  });

  it('URL helpers point at public/audio/songs, matching the KitPulse / flipPack convention', () => {
    expect(songAudioUrl('cypher', 'map.json')).toBe('/audio/songs/cypher/map.json');
    expect(songStemUrl('cypher', 'bass')).toBe('/audio/songs/cypher/stems/bass.mp3');
    expect(songPreviewUrl('cypher')).toBe('/audio/songs/cypher/preview.mp3');
  });
});

describe('bar/section time helpers', () => {
  const song = FEL_SONGS.find((s) => s.id === 'warmup')!;   // 88 bpm, 36 bars, sections incl. break 21-22

  it('secPerBar / barAtSec agree with the song clock (240 / bpm per bar)', () => {
    const spb = secPerBar(song);
    expect(spb).toBeCloseTo(240 / 88, 9);
    expect(barAtSec(song, 0)).toBe(1);
    expect(barAtSec(song, spb - 0.001)).toBe(1);
    expect(barAtSec(song, spb + 0.001)).toBe(2);
    expect(barAtSec(song, -5)).toBe(1);               // never below bar 1
    expect(barAtSec(song, 1e6)).toBe(song.bars);       // never past the last bar
  });

  it('sectionAtBar finds the break, and falls back to the last section past the end', () => {
    expect(sectionAtBar(song, 21).name).toBe('break');
    expect(sectionAtBar(song, 1).name).toBe('intro');
    expect(sectionAtBar(song, 9999).name).toBe(song.sections[song.sections.length - 1].name);
  });

  it('sectionTimeRange / outroRange give a [start, end) that matches startBar/bars', () => {
    const hook = song.sections.find((s) => s.name === 'hook')!;
    const r = sectionTimeRange(song, hook);
    expect(r.startSec).toBeCloseTo((hook.startBar - 1) * secPerBar(song), 9);
    expect(r.endSec - r.startSec).toBeCloseTo(hook.bars * secPerBar(song), 9);

    const outro = outroRange(song);
    expect(outro.section).toBe(song.sections[song.sections.length - 1]);
    expect(outro.endSec).toBeCloseTo(song.durationSec, 6);   // the last section always runs to the song's own end
  });
});

// ── drift guard: the slim index must still say exactly what the real shipped files say ─────────────────────────
describe('felSongsData.json matches the real public/audio/songs/<id>/map.json files', () => {
  const ids = fs.existsSync(SONGS_DIR)
    ? fs.readdirSync(SONGS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  it('found the six song folders on disk (or this whole describe block is testing nothing)', () => {
    expect(ids.sort()).toEqual([...FEL_SONG_IDS].sort());
  });

  it.each(ids)('%s: the slim index is faithful to its map.json', (id) => {
    const real = JSON.parse(fs.readFileSync(path.join(SONGS_DIR, id, 'map.json'), 'utf8'));
    const mine = songFor(id);
    expect(mine, `felSongsData.json has no entry for ${id}`).toBeDefined();
    expect(mine!.title).toBe(real.title);
    expect(mine!.style).toBe(real.style);
    expect(mine!.bpm).toBe(real.bpm);
    expect(mine!.key).toBe(real.key);
    expect(mine!.timeSig).toBe(real.timeSig);
    expect(mine!.bars).toBe(real.bars);
    expect(mine!.durationSec).toBeCloseTo(real.durationSec, 6);
    expect(mine!.swing).toBeCloseTo(real.swing, 9);
    expect(mine!.breakBars).toEqual(real.breakBars);
    expect(mine!.difficulty).toBe(real.difficulty);
    expect(mine!.targetTapsPerMin).toBe(real.targetTapsPerMin);
    expect(mine!.hookStem).toBe(real.hookStem);
    expect(mine!.preview).toEqual(real.preview);
    expect(mine!.sections.map((s) => ({ name: s.name, startBar: s.startBar, bars: s.bars, energy: s.energy, stems: [...s.stems].sort() })))
      .toEqual(real.sections.map((s: { name: string; startBar: number; bars: number; energy: number; stems: string[] }) =>
        ({ name: s.name, startBar: s.startBar, bars: s.bars, energy: s.energy, stems: [...s.stems].sort() })));
  });

  it.each(ids)('%s: every stem file and the preview named by the map actually exist on disk', (id) => {
    const real = JSON.parse(fs.readFileSync(path.join(SONGS_DIR, id, 'map.json'), 'utf8'));
    for (const stem of FEL_STEMS) expect(fs.existsSync(path.join(SONGS_DIR, id, 'stems', `${stem}.mp3`)), stem).toBe(true);
    expect(fs.existsSync(path.join(SONGS_DIR, id, real.preview.file))).toBe(true);
    void real;
  });
});
