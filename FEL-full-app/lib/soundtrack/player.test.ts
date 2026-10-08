// CREATOR SOUNDTRACK piece G: the player, driven with fake decks, a fake clock and no Web Audio (the element-volume path).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundtrackPlayer, type AudioLike, type PlayerEnv } from './player';
import { houseTracks } from './house';
import { dbToGain, stageGain } from './gain';

class FakeAudio implements AudioLike {
  src = ''; currentTime = 0; duration = NaN; paused = true; volume = 1; crossOrigin: string | null = null; preload = 'auto';
  plays = 0;
  /** A track that will not load (a bucket without CORS, a 404): play() fails and 'playing' never fires. */
  static broken = false;
  private fns = new Map<string, (() => void)[]>();
  play() {
    this.plays++;
    if (FakeAudio.broken) return Promise.reject(new Error('NotSupportedError'));
    this.paused = false; this.fire('playing'); return Promise.resolve();
  }
  pause() { if (!this.paused) { this.paused = true; this.fire('pause'); } }
  addEventListener(t: string, fn: () => void) { this.fns.set(t, [...(this.fns.get(t) ?? []), fn]); }
  fire(t: string) { for (const f of this.fns.get(t) ?? []) f(); }
}

let clock = 0;
let decks: FakeAudio[] = [];
let reported: [string, number][] = [];
let saved: { enabled: boolean; level: number } | null = null;
const flush = () => new Promise((r) => setTimeout(r, 0));

function makePlayer(over: Partial<PlayerEnv> = {}) {
  return new SoundtrackPlayer({
    createAudio: () => { const a = new FakeAudio(); decks.push(a); return a; },
    graph: async () => null,
    now: () => clock,
    reportPlay: (id, s) => reported.push([id, s]),
    savePrefs: (p) => { saved = p; },
    rng: () => 0.42,
    ...over,
  });
}
const playing = () => decks.find((d) => !d.paused);

beforeEach(() => { FakeAudio.broken = false; clock = 0; decks = []; reported = []; saved = null; vi.useRealTimers(); });

describe('SoundtrackPlayer', () => {
  it('stays silent until the first tap, then plays a menu track at the medium level', async () => {
    const p = makePlayer();
    p.setCatalogue(houseTracks());
    p.setPathname('/');
    await flush();
    expect(p.snapshot().silent).toBe('waiting-for-tap');
    expect(decks.every((d) => d.plays === 0)).toBe(true);
    p.unlock();
    await flush(); await flush();
    const d = playing()!;
    expect(d).toBeDefined();
    expect(d.crossOrigin).toBe('anonymous');
    expect(d.preload).toBe('none');
    expect(p.snapshot()).toMatchObject({ stage: 'menu', playing: true, level: 0.5 });
    expect(d.volume).toBeCloseTo(dbToGain(-2) * stageGain('menu', 0.5));
  });

  it('never plays on the Quick Screen, and goes quiet when a room claims focus or the tab hides', async () => {
    vi.useFakeTimers();
    const p = makePlayer();
    p.setCatalogue(houseTracks());
    p.setPathname('/screen');
    p.unlock();
    await vi.runAllTimersAsync();
    expect(decks.every((d) => d.plays === 0)).toBe(true);
    expect(p.snapshot().silent).toBe('quick-screen');

    p.setPathname('/');
    await vi.runAllTimersAsync();
    expect(playing()).toBeDefined();
    p.setFocusHeld(true);
    await vi.runAllTimersAsync();
    expect(playing()).toBeUndefined();
    expect(p.snapshot().silent).toBe('focus');
    p.setFocusHeld(false);
    await vi.runAllTimersAsync();
    expect(playing()).toBeDefined();
    p.setHidden(true);
    await vi.runAllTimersAsync();
    expect(playing()).toBeUndefined();
  });

  it('the bed is 14 dB under the menu; the level is saved', async () => {
    const p = makePlayer();
    p.setCatalogue(houseTracks());
    p.unlock();
    await flush(); await flush();
    p.setPathname('/play/dunk');
    await flush(); await flush();
    expect(p.snapshot().stage).toBe('bed');
    const d = decks.find((x) => x.src === p.snapshot().track!.url)!;   // the bed may have crossfaded to a bed-mood track
    expect(d.volume).toBeCloseTo(dbToGain(-2) * stageGain('bed', 0.5));
    p.setLevel(1);
    expect(saved).toEqual({ enabled: true, level: 1 });
    expect(d.volume).toBeCloseTo(dbToGain(-2) * stageGain('bed', 1));
  });

  it('turning it off stops it and is remembered', async () => {
    vi.useFakeTimers();
    const p = makePlayer();
    p.setCatalogue(houseTracks()); p.unlock();
    await vi.runAllTimersAsync();
    p.setEnabled(false);
    await vi.runAllTimersAsync();
    expect(playing()).toBeUndefined();
    expect(saved).toEqual({ enabled: false, level: 0.5 });
    expect(makePlayer({ loadPrefs: () => ({ enabled: false, level: 0.2 }) }).snapshot()).toMatchObject({ enabled: false, level: 0.2 });
  });

  it('crossfades to a different track near the end, and skip moves on', async () => {
    const p = makePlayer();
    p.setCatalogue(houseTracks()); p.unlock();
    await flush(); await flush();
    const first = p.snapshot().track!.id;
    const d = playing()!;
    d.duration = 40; d.currentTime = 38.5;
    clock += 250; d.fire('timeupdate');
    await flush(); await flush();
    const second = p.snapshot().track!.id;
    expect(second).not.toBe(first);
    p.skip();
    await flush(); await flush();
    expect(p.snapshot().track!.id).not.toBe(second);
  });

  it('reports a play once after 30 s heard, not while hidden', async () => {
    const p = makePlayer();
    p.setCatalogue(houseTracks()); p.unlock();
    await flush(); await flush();
    const d = playing()!;
    d.duration = 400;
    for (let i = 0; i < 29; i++) { clock += 1000; d.currentTime = i; d.fire('timeupdate'); }
    expect(reported).toEqual([]);
    clock += 1000; d.fire('timeupdate');
    expect(reported).toHaveLength(1);
    expect(reported[0][0]).toBe(p.snapshot().track!.id);
    for (let i = 0; i < 40; i++) { clock += 1000; d.fire('timeupdate'); }
    expect(reported).toHaveLength(1);
  });

  it('three load errors in a row stop it trying', async () => {
    const p = makePlayer();
    FakeAudio.broken = true;
    p.setCatalogue(houseTracks()); p.unlock();
    for (let i = 0; i < 10; i++) await flush();
    expect(p.snapshot().silent).toBe('no-tracks');
    expect(decks.reduce((n, d) => n + d.plays, 0)).toBe(3);
  });

  it('routes through Web Audio when SoundKit\'s graph exists: deck → stage → music bus', async () => {
    const connects: string[] = [];
    const param = () => ({ value: 0, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(), setValueCurveAtTime: vi.fn(), setValueAtTime: vi.fn() });
    let n = 0;
    const node = (name: string) => ({ name, gain: param(), connect(o: { name: string }) { connects.push(`${name}->${o.name}`); return o; } });
    const music = node('music');
    const ctx = { currentTime: 0, createGain: () => node(n++ === 0 ? 'stage' : `deck${n - 1}`), createMediaElementSource: () => node('src') };
    const p = makePlayer({ graph: async () => ({ ctx: ctx as unknown as AudioContext, music: music as unknown as AudioNode }) });
    p.setCatalogue(houseTracks()); p.unlock();
    await flush(); await flush();
    expect(connects).toEqual(['stage->music', 'src->deck1', 'deck1->stage', 'src->deck2', 'deck2->stage']);
    expect(decks.every((d) => d.volume === 1)).toBe(true);   // levels live on the nodes, not the elements
  });
});
