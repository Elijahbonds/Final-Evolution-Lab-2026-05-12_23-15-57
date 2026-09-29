// MUSIC-SUITE P7 (2026-09-29), room-mix-ux: volumes.ts is the whole "persisted per player on the device" and
// "each bus scales only its own source" contract in pure, node-testable form (no AudioContext, no window beyond a
// guarded localStorage — installed here the same way kitGrandfather.test.ts installs one for a different module).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_VOLUMES, VOLUME_KEY, busGain, busGains, clampVolume, loadVolumes, saveVolume, type VolumeSettings,
} from './volumes';

type Mem = Map<string, string>;
const storeOf = (mem: Mem) => ({
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
});

describe('DEFAULT_VOLUMES', () => {
  it('is 1.0 on every bus — the "today\'s balance is unchanged" default', () => {
    expect(DEFAULT_VOLUMES).toEqual({ music: 1, sfx: 1, voice: 1 });
  });
});

describe('clampVolume', () => {
  it('keeps an in-range number as-is', () => {
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(0.42)).toBe(0.42);
    expect(clampVolume(1)).toBe(1);
  });
  it('clamps below 0 and above 1', () => {
    expect(clampVolume(-3)).toBe(0);
    expect(clampVolume(1.7)).toBe(1);
  });
  it('a non-number (NaN, a string, undefined, null) falls back to the default (1), never NaN or a throw', () => {
    expect(clampVolume(Number.NaN)).toBe(1);
    expect(clampVolume('0.5')).toBe(1);
    expect(clampVolume(undefined)).toBe(1);
    expect(clampVolume(null)).toBe(1);
  });
});

describe('loadVolumes — defaults with no storage, or a device that never saved one', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('no localStorage at all (server, or a test that never installs one): the defaults, no throw', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadVolumes()).toEqual(DEFAULT_VOLUMES);
  });
  it('localStorage present but empty (first run): the defaults', () => {
    vi.stubGlobal('localStorage', storeOf(new Map()));
    expect(loadVolumes()).toEqual(DEFAULT_VOLUMES);
  });
  it('corrupt JSON under the key: the defaults, not a thrown SyntaxError', () => {
    vi.stubGlobal('localStorage', storeOf(new Map([[VOLUME_KEY, '{not json']])));
    expect(loadVolumes()).toEqual(DEFAULT_VOLUMES);
  });
  it('a saved value that is not an object (a stray string or number) at the key: the defaults', () => {
    vi.stubGlobal('localStorage', storeOf(new Map([[VOLUME_KEY, '"loud"']])));
    expect(loadVolumes()).toEqual(DEFAULT_VOLUMES);
  });
  it('a saved object clamps every field independently, filling in whichever bus was never saved', () => {
    vi.stubGlobal('localStorage', storeOf(new Map([[VOLUME_KEY, JSON.stringify({ sfx: 0.3 })]])));
    expect(loadVolumes()).toEqual({ music: 1, sfx: 0.3, voice: 1 });
  });
  it('an out-of-range saved value is clamped on the way back out, not trusted as-is', () => {
    vi.stubGlobal('localStorage', storeOf(new Map([[VOLUME_KEY, JSON.stringify({ music: 4, sfx: -1, voice: 0.6 })]])));
    expect(loadVolumes()).toEqual({ music: 1, sfx: 0, voice: 0.6 });
  });
});

describe('saveVolume — persistence, and one bus never touches another', () => {
  let mem: Mem;
  beforeEach(() => { mem = new Map(); vi.stubGlobal('localStorage', storeOf(mem)); });
  afterEach(() => vi.unstubAllGlobals());

  it('setting one bus persists it and leaves the other two at their defaults', () => {
    const after = saveVolume('sfx', 0.25);
    expect(after).toEqual({ music: 1, sfx: 0.25, voice: 1 });
    // read back through a fresh load — proves it is the STORE that changed, not just the return value
    expect(loadVolumes()).toEqual({ music: 1, sfx: 0.25, voice: 1 });
  });
  it('setting a second bus keeps the first bus\'s saved level (merges, never overwrites the whole object)', () => {
    saveVolume('music', 0.6);
    const after = saveVolume('voice', 0.1);
    expect(after).toEqual({ music: 0.6, sfx: 1, voice: 0.1 });
  });
  it('a value outside 0..1 is clamped before it is saved', () => {
    expect(saveVolume('music', 9)).toEqual({ music: 1, sfx: 1, voice: 1 });
    expect(saveVolume('music', -9)).toEqual({ music: 0, sfx: 1, voice: 1 });
  });
  it('a private window (setItem throws) still returns the clamped value for this session — it just does not survive a reload', () => {
    vi.stubGlobal('localStorage', {
      getItem: storeOf(mem).getItem,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: storeOf(mem).removeItem,
    });
    expect(() => saveVolume('sfx', 0.4)).not.toThrow();
    expect(saveVolume('sfx', 0.4)).toEqual({ music: 1, sfx: 0.4, voice: 1 });
  });
});

describe('busGain — the entire "each bus scales only its own source" claim', () => {
  it('a volume of 1 (the default) leaves the base exactly as it was — the no-op every existing player gets', () => {
    expect(busGain(1.35, 1)).toBe(1.35);
    expect(busGain(1 / 0.55, 1)).toBeCloseTo(1 / 0.55, 10);
  });
  it('a volume of 0 is exactly silent, whatever the base', () => {
    expect(busGain(1.35, 0)).toBe(0);
  });
  it('scales linearly by the base, so two different bases at the same volume keep their own relative loudness', () => {
    expect(busGain(2, 0.5)).toBe(1);
    expect(busGain(4, 0.5)).toBe(2);
  });
  it('an out-of-range or non-number volume is clamped inside the same call (a caller need not pre-clamp)', () => {
    expect(busGain(1, 5)).toBe(1);
    expect(busGain(1, Number.NaN)).toBe(1);
  });
});

describe('busGains — one settings object, three independent outputs', () => {
  const bases = { music: 1 / 0.55, sfx: 1, voice: 1.35 };
  it('every bus reads its own base × its own volume', () => {
    const v: VolumeSettings = { music: 1, sfx: 0.5, voice: 0.2 };
    const out = busGains(bases, v);
    expect(out.music).toBeCloseTo(bases.music, 10);
    expect(out.sfx).toBeCloseTo(0.5, 10);
    expect(out.voice).toBeCloseTo(1.35 * 0.2, 10);
  });
  it('changing ONE bus\'s volume changes only that bus\'s output — the other two are bit-for-bit the same', () => {
    const before = busGains(bases, DEFAULT_VOLUMES);
    const after = busGains(bases, { ...DEFAULT_VOLUMES, sfx: 0.1 });
    expect(after.sfx).not.toBe(before.sfx);
    expect(after.music).toBe(before.music);
    expect(after.voice).toBe(before.voice);
  });
});
