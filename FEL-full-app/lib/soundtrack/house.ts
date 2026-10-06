// lib/soundtrack/house.ts — CREATOR SOUNDTRACK piece F: the house playlist, FEL's own six songs.
//
// v1 plays each song's shipped 16-bar preview.mp3 (30–44 s, 0.4–0.5 MB, mastered at −14 LUFS). The owner chose full mixes
// (2026-10-06, "render full mixes (~10 MB)"); they could not be rendered in this container (no numpy, no soundfile:
// scripts/soundtrack/render_house_mix.py says how to on the owner's Mac). When a song's mix.mp3 lands in
// public/audio/songs/<id>/, add its id to HOUSE_MIXES and the catalogue serves the full song instead; house.test.ts checks
// every listed id has its file.

import { FEL_SONGS, songAudioUrl, songPreviewUrl, secPerBar, type FelSong } from '@/lib/babylon/dance/felSongs';
import type { Mood } from '@/lib/creator/creative-card-review';
import { trackKey, type SoundtrackTrack } from './types';

/** Songs whose full mix.mp3 has been rendered and committed. Empty until the owner renders them. */
export const HOUSE_MIXES: readonly string[] = [];

/** The house previews and mixes are mastered at −14 LUFS; the soundtrack's reference is −16. */
export const HOUSE_GAIN_DB = -2;

const HOUSE_MOODS: Readonly<Record<string, Mood[]>> = {
  warmup: ['menu', 'chill', 'bed'],
  cypher: ['menu', 'bed'],
  goldenhour: ['menu', 'chill', 'bed'],
  battle: ['hype', 'bed'],
  canals: ['menu', 'bed'],
  evolution: ['hype', 'menu'],
};

export const HOUSE_CREDIT = { name: 'FEL House', href: null } as const;

export function houseTrack(song: FelSong): SoundtrackTrack {
  const full = HOUSE_MIXES.includes(song.id);
  return {
    id: trackKey.house(song.id),
    source: 'house',
    title: song.title,
    creator: { ...HOUSE_CREDIT },
    url: full ? songAudioUrl(song.id, 'mix.mp3') : songPreviewUrl(song.id),
    mime: 'audio/mpeg',
    durationSec: Math.round((full ? song.durationSec : song.preview.bars * secPerBar(song)) * 10) / 10,
    gainDb: HOUSE_GAIN_DB,
    bpm: song.bpm,
    loop: null,
    moods: HOUSE_MOODS[song.id] ?? ['menu'],
    plays: 0,
    featured: false,
    coverUrl: null,
  };
}

export const houseTracks = (): SoundtrackTrack[] => FEL_SONGS.map(houseTrack);
