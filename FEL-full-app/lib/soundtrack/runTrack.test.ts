// PIPELINES (owner, 2026-10-06, plan K4): the dock's pick plays under board runs (the in-game bed), and only there.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RUN_TRACK_KEY, bedPool, readRunTrack, setRunTrack } from './runTrack';
import { SoundtrackPlayer, type AudioLike } from './player';
import { houseTracks } from './house';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m }; };

describe('the stored pick', () => {
  it('stores a catalogue id, clears with null, and ignores junk', () => {
    const s = mem();
    setRunTrack('card:abc_1', s);
    expect(readRunTrack(s)).toBe('card:abc_1');
    setRunTrack(null, s);
    expect(readRunTrack(s)).toBe(null);
    s.setItem(RUN_TRACK_KEY, 'javascript:alert(1)');
    expect(readRunTrack(s)).toBe(null);
  });
  it('bedPool: the pinned track alone while it is in the catalogue, else the fallback', () => {
    const t = houseTracks();
    expect(bedPool(t, t[2].id, [t[0]])).toEqual([t[2]]);
    expect(bedPool(t, 'card:gone', [t[0]])).toEqual([t[0]]);
    expect(bedPool(t, null, [t[0]])).toEqual([t[0]]);
  });
});

class FakeAudio implements AudioLike {
  src = ''; currentTime = 0; duration = NaN; paused = true; volume = 1; crossOrigin: string | null = null; preload = 'auto';
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() { /* */ }
}

describe('the player under a game', () => {
  let decks: FakeAudio[] = [];
  beforeEach(() => { decks = []; vi.useFakeTimers(); });
  const make = (pin: string | null) => new SoundtrackPlayer({
    createAudio: () => { const a = new FakeAudio(); decks.push(a); return a; }, graph: async () => null, now: () => 0, rng: () => 0.42,
    runTrack: () => pin,
  });
  const current = (p: SoundtrackPlayer) => p.snapshot().track?.id;

  it('plays the pinned track in the bed, and the menus keep shuffling their own pool', async () => {
    const tracks = houseTracks();
    const pin = tracks[tracks.length - 1].id;
    const p = make(pin);
    p.setCatalogue(tracks); p.setPathname('/'); p.unlock();
    await vi.runAllTimersAsync();
    const menuTrack = current(p);
    const menuIds = new Set<string | undefined>([menuTrack]);
    for (let i = 0; i < 4; i++) { p.skip(); await vi.runAllTimersAsync(); menuIds.add(current(p)); }
    expect(menuIds.size).toBeGreaterThan(1);   // the menus never lock onto the pin
    p.requestStage('bed');
    await vi.runAllTimersAsync();
    expect(current(p)).toBe(pin);
    p.requestStage(null);
    await vi.runAllTimersAsync();
    expect(p.snapshot().stage).toBe('menu');
    expect(menuTrack).toBeDefined();
  });
  it('with no pin (or a pin that left the catalogue) the bed shuffles as before', async () => {
    const p = make('card:gone');
    p.setCatalogue(houseTracks()); p.setPathname('/'); p.unlock();
    await vi.runAllTimersAsync();
    p.requestStage('bed');
    await vi.runAllTimersAsync();
    expect(current(p)).toMatch(/^house:/);
  });
});
