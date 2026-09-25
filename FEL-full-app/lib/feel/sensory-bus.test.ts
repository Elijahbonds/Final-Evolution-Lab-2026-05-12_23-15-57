// HOTFIX (2026-09-24): the SensoryBus's sound path, exercised with a fake Web Audio + fetch.
//
// The bus told nobody when a file it was given did not load (six presets pointed at MP3s that were never in the
// repo, and the game was silent with no trace), and it opened an AudioContext for every core even when it had no
// sound to load. These pin the behaviour: no map, no context; a file that loads plays by name at the event's
// volume; a 404 is counted and warned, never decoded, never played, never thrown into gameplay; a name the map does
// not hold is counted and warned once (but a map-less bus stays quiet); a bus disposed mid-load reports nothing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SensoryBus } from './sensory-bus';

class FakeGain {
  gain = { value: 1 };
  connect<T>(n: T): T { return n; }
}

class FakeSource {
  buffer: unknown = null;
  started = 0;
  connect<T>(n: T): T { return n; }
  start(): void { this.started++; FakeAudioContext.started.push(this); }
}

class FakeAudioContext {
  static made = 0;
  static decoded = 0;
  static started: FakeSource[] = [];
  static gains: FakeGain[] = [];
  state = 'running';
  destination = {};
  constructor() { FakeAudioContext.made++; }
  async decodeAudioData(raw: ArrayBuffer): Promise<{ bytes: number }> {
    FakeAudioContext.decoded++;
    return { bytes: raw.byteLength };
  }
  createBufferSource(): FakeSource { return new FakeSource(); }
  createGain(): FakeGain { const g = new FakeGain(); FakeAudioContext.gains.push(g); return g; }
  resume(): Promise<void> { return Promise.resolve(); }
  close(): Promise<void> { return Promise.resolve(); }
}

/** fetch that serves `ok` URLs as 8 bytes of "audio" and 404s everything else. */
function fakeFetch(ok: string[]) {
  return vi.fn(async (url: string) => {
    const hit = ok.includes(url);
    return {
      ok: hit,
      status: hit ? 200 : 404,
      arrayBuffer: async () => new ArrayBuffer(hit ? 8 : 512),   // a 404 body is an HTML page, not audio
    };
  });
}

beforeEach(() => {
  FakeAudioContext.made = 0;
  FakeAudioContext.decoded = 0;
  FakeAudioContext.started = [];
  FakeAudioContext.gains = [];
  vi.stubGlobal('window', { AudioContext: FakeAudioContext });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SensoryBus sound', () => {
  it('a bus with no sfx map opens no AudioContext (every feel core builds one like this)', async () => {
    vi.stubGlobal('fetch', fakeFetch([]));
    const bus = new SensoryBus();
    await bus.ready;
    const withCamera = new SensoryBus({ camera: { applyCameraShake: () => {} } });
    await withCamera.ready;
    expect(FakeAudioContext.made).toBe(0);
    // and the event still lands everywhere it can
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withCamera.emit({ sfx: 'anything', shake: 0.2 });
    expect(withCamera.stats).toMatchObject({ emitted: 1, shakes: 1, sfxPlayed: 0, sfxMissing: 0, sfxUnknown: 0 });
    expect(warn).not.toHaveBeenCalled();   // sound is OFF on a map-less bus, not broken: nothing to report
  });

  it('a mapped file that loads plays by NAME, once, at the event volume', async () => {
    const fetch = fakeFetch(['/audio/kits/808/kick.wav']);
    vi.stubGlobal('fetch', fetch);
    const bus = new SensoryBus({ sfx: { kick: '/audio/kits/808/kick.wav' } });
    await bus.ready;
    expect(FakeAudioContext.made).toBe(1);
    expect(fetch).toHaveBeenCalledWith('/audio/kits/808/kick.wav');

    bus.emit({ sfx: 'kick', volume: 0.4 });
    expect(FakeAudioContext.started).toHaveLength(1);
    expect(FakeAudioContext.started[0].buffer).toEqual({ bytes: 8 });
    expect(FakeAudioContext.gains.at(-1)!.gain.value).toBe(0.4);
    expect(bus.stats).toMatchObject({ emitted: 1, sfxPlayed: 1, sfxMissing: 0 });

    // an event naming the URL instead of the map key is not a sound the bus holds, and now it says so
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bus.emit({ sfx: '/audio/kits/808/kick.wav' });
    expect(bus.stats).toMatchObject({ sfxPlayed: 1, sfxUnknown: 1, sfxMissing: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a name the map does not hold is counted every time and named once (the silent-typo case)', async () => {
    vi.stubGlobal('fetch', fakeFetch(['/audio/kits/808/kick.wav']));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = new SensoryBus({ sfx: { kick: '/audio/kits/808/kick.wav' } });
    await bus.ready;
    // sprint-constants names 'impact' / 'crowd': the day a host maps only 'kick', those events must not vanish unseen
    bus.emit({ sfx: 'impact' });
    bus.emit({ sfx: 'impact' });
    bus.emit({ sfx: 'crowd', shake: 0.1 });
    bus.emit({ sfx: 'kick' });
    expect(bus.stats).toMatchObject({ emitted: 4, sfxUnknown: 3, sfxPlayed: 1, sfxMissing: 0 });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain('"impact"');
    expect(String(warn.mock.calls[1][0])).toContain('"crowd"');
  });

  it('a mapped name whose file failed is counted once as missing, not again as unknown per event', async () => {
    vi.stubGlobal('fetch', fakeFetch([]));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = new SensoryBus({ sfx: { punch: '/audio/sfx_punch_impact.mp3' } });
    await bus.ready;
    bus.emit({ sfx: 'punch' });
    bus.emit({ sfx: 'punch' });
    expect(bus.stats).toMatchObject({ sfxMissing: 1, sfxUnknown: 0, sfxPlayed: 0 });
  });

  it('dispose() while a file is still fetching reports nothing: no false "did not load", no stored buffer', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const fetch = vi.fn(async (_url: string) => {
      await gate;
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
    });
    vi.stubGlobal('fetch', fetch);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = new SensoryBus({ sfx: { kick: '/audio/kits/808/kick.wav' } });
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);   // the load really is in flight
    bus.dispose();                            // the quick unmount
    release();
    await bus.ready;
    expect(bus.stats).toMatchObject({ sfxMissing: 0, sfxUnknown: 0 });
    expect(FakeAudioContext.decoded).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    bus.emit({ sfx: 'kick' });                // a known name on a disposed bus: silent, and not a typo
    expect(bus.stats).toMatchObject({ sfxPlayed: 0, sfxUnknown: 0 });
  });

  // A guard more than a discriminator: the old bus also stayed silent here (its context was already null), but a late
  // decode must never turn into a sound or a report on a bus that has gone.
  it('dispose() while a file is decoding: nothing plays and nothing is reported', async () => {
    vi.stubGlobal('fetch', fakeFetch(['/audio/kits/808/kick.wav']));
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const decode = FakeAudioContext.prototype.decodeAudioData;
    let decoding = false;
    vi.spyOn(FakeAudioContext.prototype, 'decodeAudioData').mockImplementation(async function (this: FakeAudioContext, raw: ArrayBuffer) {
      decoding = true;
      await gate;
      return decode.call(this, raw);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = new SensoryBus({ sfx: { kick: '/audio/kits/808/kick.wav' } });
    for (let i = 0; i < 50 && !decoding; i++) await Promise.resolve();
    expect(decoding).toBe(true);              // the decode really is in flight
    bus.dispose();
    release();
    await bus.ready;
    expect(warn).not.toHaveBeenCalled();
    expect(bus.stats.sfxMissing).toBe(0);
    bus.emit({ sfx: 'kick' });
    expect(FakeAudioContext.started).toHaveLength(0);
  });

  it('a null map from a JS caller is no map: `ready` resolves, no context opens', async () => {
    vi.stubGlobal('fetch', fakeFetch([]));
    const bus = new SensoryBus({ sfx: null as unknown as Record<string, string> });
    await expect(bus.ready).resolves.toBeUndefined();
    expect(FakeAudioContext.made).toBe(0);
    expect(() => bus.emit({ sfx: 'kick' })).not.toThrow();
    expect(bus.stats.sfxUnknown).toBe(0);
  });

  it('a file that 404s is counted and named, never decoded, never played, never thrown', async () => {
    vi.stubGlobal('fetch', fakeFetch([]));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = new SensoryBus({ sfx: { punch: '/audio/sfx_punch_impact.mp3' } });
    await bus.ready;
    expect(bus.stats.sfxMissing).toBe(1);
    expect(FakeAudioContext.decoded).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('/audio/sfx_punch_impact.mp3');

    let shook = 0;
    bus.camera = { applyCameraShake: (i) => { shook = i; } };
    expect(() => bus.emit({ sfx: 'punch', volume: 1, shake: 0.3 })).not.toThrow();
    expect(FakeAudioContext.started).toHaveLength(0);
    expect(shook).toBe(0.3);
    expect(bus.stats).toMatchObject({ emitted: 1, sfxPlayed: 0, shakes: 1 });
  });

  it('one bad file does not take the good ones down with it', async () => {
    vi.stubGlobal('fetch', fakeFetch(['/audio/kits/808/clap.wav']));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = new SensoryBus({ sfx: { clap: '/audio/kits/808/clap.wav', gone: '/audio/sfx_score.mp3' } });
    await bus.ready;
    bus.emit({ sfx: 'gone' });
    bus.emit({ sfx: 'clap' });
    expect(bus.stats).toMatchObject({ sfxMissing: 1, sfxPlayed: 1 });
  });

  it('server-side (no window) it never touches fetch', async () => {
    vi.unstubAllGlobals();
    const fetch = fakeFetch([]);
    vi.stubGlobal('fetch', fetch);
    const bus = new SensoryBus({ sfx: { kick: '/audio/kits/808/kick.wav' } });
    await bus.ready;
    expect(fetch).not.toHaveBeenCalled();
    expect(() => bus.emit({ sfx: 'kick', rumbleMs: 80 })).not.toThrow();
  });
});
