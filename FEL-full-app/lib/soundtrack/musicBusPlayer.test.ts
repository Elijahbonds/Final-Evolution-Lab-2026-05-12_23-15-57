// CREATOR SOUNDTRACK phase 4 hook: a clip on the music bus holds music focus while it plays, and gives it back.
import { describe, expect, it } from 'vitest';
import { playOnMusicBus } from './musicBusPlayer';
import { musicFocus } from './focus';

function fakes(playFails = false) {
  const connects: string[] = [];
  const handlers = new Map<string, () => void>();
  const el = {
    crossOrigin: null as string | null, loop: false, src: '', paused: true,
    play: async () => { if (playFails) throw new Error('blocked'); el.paused = false; },
    pause: () => { el.paused = true; },
    addEventListener: (t: string, fn: () => void) => handlers.set(t, fn),
  };
  const node = (name: string) => ({ name, gain: { value: 1 }, connect(o: { name: string }) { connects.push(`${name}->${o.name}`); return o; }, disconnect() { connects.push(`${name} x`); } });
  const ctx = { createGain: () => node('gain'), createMediaElementSource: () => node('src') };
  return { el, handlers, connects, deps: { graph: async () => ({ ctx: ctx as never, music: node('music') as never }), createAudio: () => el as never } };
}

describe('playOnMusicBus', () => {
  it('routes element → gain → music bus at the asked level, holds focus until it ends', async () => {
    const f = fakes();
    const clip = await playOnMusicBus('https://x/walk.mp3', { gainDb: -6, who: 'walkout' }, f.deps);
    expect(clip).not.toBeNull();
    expect(f.connects).toEqual(['src->gain', 'gain->music']);
    expect(f.el.crossOrigin).toBe('anonymous');
    expect(musicFocus.holders).toEqual(['walkout']);
    f.handlers.get('ended')!();
    expect(musicFocus.count).toBe(0);
    clip!.stop();   // a second stop is harmless
    expect(musicFocus.count).toBe(0);
  });
  it('no Web Audio, or a refused play: null, and no focus left held', async () => {
    expect(await playOnMusicBus('u', {}, { graph: async () => null })).toBeNull();
    const f = fakes(true);
    expect(await playOnMusicBus('u', {}, f.deps)).toBeNull();
    expect(musicFocus.count).toBe(0);
  });
});
