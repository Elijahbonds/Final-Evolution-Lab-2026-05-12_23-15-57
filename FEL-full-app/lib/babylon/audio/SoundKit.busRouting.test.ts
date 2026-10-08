// lib/babylon/audio/SoundKit.busRouting.test.ts — MUSIC-SUITE P7 (2026-09-29), room-mix-ux: "three buses on the one
// graph: music = song stems, sfx = hit sounds and UI, voice = the host/Okta lines... each scale only their sources."
//
// SoundKit is a browser-only singleton reading `window.AudioContext` (unlike mixGraph.ts's pure `buildMixGraph(ctx,
// …)`, which takes its context as an argument and is tested directly on fakeWebAudio.ts's fakes). This file installs
// the same fakes AudioEngine.baseline.test.ts and mixGraph.test.ts already use, plus the one extra line SoundKit
// needs: its `ensure()` reads `window.AudioContext`, not the bare global installFakeWebAudio patches for code that
// does `new AudioContext()` directly. `vi.resetModules()` + a dynamic import per test gives every test a FRESH
// SoundKitImpl (it is a real singleton, `export const SoundKit = new SoundKitImpl()`, and its AudioContext is built
// once and cached — sharing one instance across tests would leak a volume change or a built graph from one test into
// the next).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakeNode, installFakeWebAudio, type FakeWebAudio } from '../music/fakeWebAudio';
import { DEFAULT_VOLUMES, VOLUME_KEY } from '@/lib/audio/volumes';

let fake: FakeWebAudio;

beforeEach(() => {
  vi.resetModules();
  fake = installFakeWebAudio();
  (globalThis as unknown as { window: { AudioContext?: unknown } }).window.AudioContext = FakeAudioContext;
});
afterEach(() => { fake.uninstall(); });

/** A bus's fake node, cast for the .outputs / .gain.value fields the real GainNode type does not carry. */
type FakeGain = FakeNode & { gain: { value: number } };
const asFake = (n: { outputs?: unknown; gain?: unknown }): FakeGain => n as unknown as FakeGain;

describe('SoundKit — one graph: music, sfx and voice are three real, separate buses', () => {
  it('each bus is its own gain node, and all three converge on the SAME downstream chain', async () => {
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();   // forces ensure() — the graph is built lazily, on first gesture/use
    const g = SoundKit.graph();
    expect(g).toBeTruthy();
    const music = asFake(g!.music), sfx = asFake(g!.sfx), voice = asFake(g!.voice);
    expect(music.outputs).toHaveLength(1);
    expect(sfx.outputs).toHaveLength(1);
    expect(voice.outputs).toHaveLength(1);
    // three DIFFERENT gain nodes...
    expect(sfx).not.toBe(music);
    expect(voice).not.toBe(music);
    // ...feeding the exact same next node (master) — the "one graph" the contract names
    expect(sfx.outputs[0]).toBe(music.outputs[0]);
    expect(voice.outputs[0]).toBe(music.outputs[0]);
  });

  it('at the default volume (1.0, what every existing player has today) every bus reads its own pre-P7 tuned gain', async () => {
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();
    const g = SoundKit.graph()!;
    expect(SoundKit.getVolumes()).toEqual(DEFAULT_VOLUMES);
    expect(asFake(g.voice).gain.value).toBeCloseTo(1.35, 10);        // voiceBus's P2 number, unchanged
    expect(asFake(g.music).gain.value).toBeCloseTo(1 / 0.55, 10);    // musicBus's P2 number, unchanged
    expect(asFake(g.sfx).gain.value).toBeCloseTo(1, 10);             // sfxBus is new; its base is unity
  });

  it('a saved level from a previous session is applied when the graph is first built, not just after a slider moves', async () => {
    fake.storage.setItem(VOLUME_KEY, JSON.stringify({ sfx: 0.2 }));
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();
    const g = SoundKit.graph()!;
    expect(asFake(g.sfx).gain.value).toBeCloseTo(0.2, 10);
    expect(asFake(g.music).gain.value).toBeCloseTo(1 / 0.55, 10);   // untouched — the save only named sfx
  });

  it('setVolume moves only the named bus live — the other two are bit-for-bit untouched', async () => {
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();
    const g = SoundKit.graph()!;
    const before = { music: asFake(g.music).gain.value, voice: asFake(g.voice).gain.value };

    SoundKit.setVolume('sfx', 0.25);

    expect(asFake(g.sfx).gain.value).toBeCloseTo(0.25, 10);
    expect(asFake(g.music).gain.value).toBe(before.music);
    expect(asFake(g.voice).gain.value).toBe(before.voice);
    expect(SoundKit.getVolumes()).toEqual({ ...DEFAULT_VOLUMES, sfx: 0.25 });
  });

  it('setVolume persists (a fresh SoundKit reads the saved level back) without moving the other two buses', async () => {
    const first = await import('./SoundKit');
    first.SoundKit.setVolume('voice', 0.4);   // no context yet — this must still save

    vi.resetModules();
    const second = await import('./SoundKit');
    expect(second.SoundKit.getVolumes()).toEqual({ ...DEFAULT_VOLUMES, voice: 0.4 });
    second.SoundKit.unlock();
    const g = second.SoundKit.graph()!;
    expect(asFake(g.voice).gain.value).toBeCloseTo(1.35 * 0.4, 10);
    expect(asFake(g.music).gain.value).toBeCloseTo(1 / 0.55, 10);
    expect(asFake(g.sfx).gain.value).toBeCloseTo(1, 10);
  });

  it('a hit sound (SFX: "hit sounds and UI") reaches the sfx bus, not straight to master', async () => {
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();
    const g = SoundKit.graph()!;
    const seen: unknown[] = [];
    const origConnect = FakeNode.prototype.connect;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (FakeNode.prototype as any).connect = function connect(this: FakeNode, dest: unknown) { seen.push(dest); return origConnect.call(this, dest); };
    try {
      SoundKit.play('uiTick');
    } finally {
      FakeNode.prototype.connect = origConnect;
    }
    expect(seen).toContain(g.sfx);
  });

  it('music (the Cypher\'s band/kit bus) and sfx (SoundKit.play) never touch the same gain node', async () => {
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();
    const g = SoundKit.graph()!;
    expect(g.music).not.toBe(g.sfx);
    expect(g.voice).not.toBe(g.sfx);
    expect(g.voice).not.toBe(g.music);
  });
});
