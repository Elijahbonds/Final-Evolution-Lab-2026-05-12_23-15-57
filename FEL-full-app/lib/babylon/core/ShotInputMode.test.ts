// HOOPS-10PHASE-2 phase 2 (2026-10-03): the open control-mode question (hold-release vs tap-timing) behind one
// setting, same shape as tvMode's readDisplaySetting — a pure default, overridden only by a browser-persisted
// choice, and never touching localStorage outside a browser. Node test environment (vitest.config.ts) has no
// `window`, same as tvMode.test.ts; the persisted-round-trip case stubs a minimal `window.localStorage` the same
// way FakeStorage (lib/babylon/music/fakeWebAudio.ts) stands in for the real thing elsewhere in this repo.
import { describe, expect, it, afterEach } from 'vitest';
import { FakeStorage } from '../music/fakeWebAudio';
import { DEFAULT_SHOT_INPUT, readShotInputMode, setShotInputMode } from './ShotInputMode';

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('ShotInputMode — the setting both 3PT controls share', () => {
  it('defaults to hold-release (the FE PM\'s stated default until Elijah picks) outside a browser', () => {
    expect(typeof window).toBe('undefined');   // Node test environment: no window at all — the SSR case, for real
    expect(DEFAULT_SHOT_INPUT).toBe('hold-release');
    expect(readShotInputMode()).toBe('hold-release');
  });

  it('setShotInputMode is a no-op outside a browser (never throws reaching for window.localStorage)', () => {
    expect(() => setShotInputMode('tap-timing')).not.toThrow();
    expect(readShotInputMode()).toBe('hold-release');   // nothing persisted — there was nowhere to persist it
  });

  it('a persisted choice overrides the default and round-trips', () => {
    (globalThis as { window?: unknown }).window = { localStorage: new FakeStorage() };
    setShotInputMode('tap-timing');
    expect(readShotInputMode()).toBe('tap-timing');
    setShotInputMode('hold-release');
    expect(readShotInputMode()).toBe('hold-release');
  });

  it('garbage in storage is ignored — the default wins, not a crash', () => {
    const storage = new FakeStorage();
    storage.setItem('fel.hoops.shotInput', 'sideways');
    (globalThis as { window?: unknown }).window = { localStorage: storage };
    expect(readShotInputMode()).toBe('hold-release');
  });

  it('a storage that throws (private browsing quota) still returns the default, not a crash', () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: { getItem: () => { throw new DOMException('blocked'); }, setItem: () => { throw new DOMException('blocked'); } },
    };
    expect(() => readShotInputMode()).not.toThrow();
    expect(readShotInputMode()).toBe('hold-release');
    expect(() => setShotInputMode('tap-timing')).not.toThrow();
  });
});
