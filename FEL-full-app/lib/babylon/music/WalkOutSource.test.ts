// PIPELINES (owner, 2026-10-06): the Dunk walk-out on the music bus, from your own song or a credited soundtrack track.
import { describe, expect, it } from 'vitest';
import { WALKOUT_GAIN_DB, WalkOutPlayer, walkOutSourceLine } from './WalkOutSource';
import type { SoundtrackTrack } from '@/lib/soundtrack/types';

const hype = (id: string, featured = false): SoundtrackTrack => ({
  id, source: 'card', title: `T ${id}`, creator: { name: 'ADA', href: '/card/ada' }, url: `https://x/${id}.mp3`, mime: 'audio/mpeg',
  durationSec: 60, gainDb: 0, bpm: 100, loop: null, moods: ['hype'], plays: 0, featured, coverUrl: null,
});
const cue = { songId: 's1', title: 'Mine', bpm: 100, src: 'data:audio/wav;base64,AAAA', loopSec: 8 };
const flush = () => new Promise((r) => setTimeout(r, 0));

function bus(ok = true) {
  const calls: { url: string; opts: { gainDb?: number; loop?: boolean; who?: string } }[] = [];
  let stops = 0;
  const playOnBus = async (url: string, opts: { gainDb?: number; loop?: boolean; who?: string }) => {
    calls.push({ url, opts });
    return ok ? { stop: () => { stops++; }, element: {} as HTMLAudioElement } : null;
  };
  return { calls, playOnBus, stops: () => stops };
}

describe('WalkOutPlayer', () => {
  it('your own song plays on the MUSIC bus, looped, at −7 dB, claiming focus as the walk-out (never new Audio)', async () => {
    const b = bus();
    const w = new WalkOutPlayer({ playOnBus: b.playOnBus, fetchCatalogue: async () => [hype('a')] });
    let started = 0;
    await w.prepare(cue);
    w.start(cue, () => { started++; });
    await flush();
    expect(b.calls).toEqual([{ url: cue.src, opts: { gainDb: WALKOUT_GAIN_DB, loop: true, who: 'walkout' } }]);
    expect(started).toBe(1);
    w.start(cue); await flush();
    expect(b.calls).toHaveLength(1);   // already playing: no second copy
    w.stop();
    expect(b.stops()).toBe(1);
  });
  it('no song of your own: a featured hype track from the catalogue, credited on the HUD', async () => {
    const b = bus();
    const w = new WalkOutPlayer({ playOnBus: b.playOnBus, fetchCatalogue: async () => [hype('a'), hype('b', true)] });
    const lines: string[] = [];
    await w.prepare(null, (l) => lines.push(l));
    expect(lines).toEqual(['WALK-OUT · T b · ADA']);
    w.start(null); await flush();
    expect(b.calls[0].url).toBe('https://x/b.mp3');
  });
  it('nothing to play (no song, no hype track), or the bus refused: silence, no play counted', async () => {
    const b = bus(false);
    const w = new WalkOutPlayer({ playOnBus: b.playOnBus, fetchCatalogue: async () => [] });
    await w.prepare(null);
    let started = 0;
    w.start(null, () => { started++; }); await flush();
    expect(b.calls).toEqual([]);
    w.start(cue, () => { started++; }); await flush();
    expect(started).toBe(0);
    expect(w.playing).toBe(false);
  });
  it('stopped while starting: the clip that arrives is stopped at once', async () => {
    const b = bus();
    const w = new WalkOutPlayer({ playOnBus: b.playOnBus });
    w.start(cue); w.stop(); await flush();
    expect(b.stops()).toBe(1);
    expect(w.playing).toBe(false);
  });
  it('the credit line', () => { expect(walkOutSourceLine(null)).toBe(''); });
});
