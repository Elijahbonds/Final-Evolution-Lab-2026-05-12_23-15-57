// VOICEOVER (2026-10-06): the wiring half of the voice mix: the output preset reaches its nodes, the music, the effects and the
// crowd duck under a voice, and a volume drag mid-duck lands on the new level. (The maths is in voice/mix.test.ts.)
// Same fakes and fresh-singleton pattern as SoundKit.busRouting.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, installFakeWebAudio, type FakeAudioParam, type FakeWebAudio } from '../music/fakeWebAudio';
import { OUTPUT_KEY, OUTPUT_PRESETS, glueTrimDb } from './voice/outputPreset';
import { dbToGain } from './voice/loudness';
import { duckFactor } from './voice/ducking';

let fake: FakeWebAudio;
beforeEach(() => {
  vi.resetModules();
  fake = installFakeWebAudio();
  (globalThis as unknown as { window: { AudioContext?: unknown } }).window.AudioContext = FakeAudioContext;
});
afterEach(() => { fake.uninstall(); });

const param = (p: unknown) => p as unknown as FakeAudioParam;
type Graph = NonNullable<ReturnType<typeof import('./SoundKit')['SoundKit']['graph']>>;
/** The voice chain's trim node: voiceIn → hp → presence → trim. */
function trimOf(g: Graph): { gain: FakeAudioParam } {
  let n = g.voiceIn as unknown as { outputs: unknown[] };
  for (let i = 0; i < 3; i++) n = n.outputs[0] as typeof n;
  return n as unknown as { gain: FakeAudioParam };
}

describe('SoundKit: output presets', () => {
  it('a saved pick is applied when the graph is built; the voice chain ends on the voice bus', async () => {
    fake.storage.setItem(OUTPUT_KEY, JSON.stringify({ preset: 'phone' }));
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();
    const g = SoundKit.graph()!;
    expect(SoundKit.outputPreset).toBe('phone');
    expect(SoundKit.outputPresetPicked).toBe(true);
    const trim = trimOf(g);
    expect(trim.gain.value).toBeCloseTo(dbToGain(OUTPUT_PRESETS.phone.voiceTrimDb), 9);
    expect((trim as unknown as { outputs: unknown[] }).outputs[0]).toBe(g.voice);
  });

  it('switching preset moves the live nodes and persists; null goes back to detecting', async () => {
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();
    const g = SoundKit.graph()!;
    SoundKit.setOutputPreset('headphones');
    expect(trimOf(g).gain.value).toBeCloseTo(dbToGain(OUTPUT_PRESETS.headphones.voiceTrimDb), 9);
    expect(JSON.parse(fake.storage.getItem(OUTPUT_KEY)!)).toEqual({ preset: 'headphones' });
    SoundKit.setOutputPreset(null);
    expect(SoundKit.outputPresetPicked).toBe(false);
    expect(SoundKit.outputPreset).toBe('tv');   // no window hints in node: the detector's default
  });

  it('the glue trim takes the compressor\'s automatic makeup back out', async () => {
    fake.storage.setItem(OUTPUT_KEY, JSON.stringify({ preset: 'tv' }));
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();
    const out = SoundKit.graph()!.out as unknown as { inputs?: unknown };
    expect(out).toBeTruthy();
    expect(glueTrimDb(OUTPUT_PRESETS.tv)).toBeLessThan(0);   // makeup (+~6 dB) out, +2 dB in
  });
});

describe('SoundKit: ducking under a voice', () => {
  it('music, sfx and the crowd each get a duck to the preset depth, then back to their resting level', async () => {
    fake.storage.setItem(OUTPUT_KEY, JSON.stringify({ preset: 'tv' }));
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();
    const g = SoundKit.graph()!;
    SoundKit.duckForVoice(1, 3, 'venice');
    const targets = (p: unknown) => param(p).history.filter((h) => h.method === 'setTargetAtTime').slice(-2).map((h) => [h.time, h.value]);
    const P = OUTPUT_PRESETS.tv;
    expect(targets(g.music.gain)[0][1]).toBeCloseTo((1 / 0.55) * duckFactor(P.duck.music), 9);
    expect(targets(g.music.gain)[1]).toEqual([3, expect.closeTo(1 / 0.55, 9)]);
    expect(targets(g.sfx.gain)[0][1]).toBeCloseTo(duckFactor(P.duck.sfx), 9);
    expect(targets(g.crowdDuck.gain)[0][1]).toBeCloseTo(duckFactor(P.duck.crowd), 9);
  });

  it('the rhythm room\'s song dips only to the cap', async () => {
    fake.storage.setItem(OUTPUT_KEY, JSON.stringify({ preset: 'phone' }));
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();
    const g = SoundKit.graph()!;
    SoundKit.duckForVoice(1, 3, 'cypher');
    const h = param(g.music.gain).history.filter((x) => x.method === 'setTargetAtTime');
    expect(h[h.length - 2].value).toBeCloseTo((1 / 0.55) * duckFactor(3), 9);
  });

  it('a volume drag mid-duck: the release lands on the NEW level (never glides back to the old one)', async () => {
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();
    const g = SoundKit.graph()!;
    SoundKit.duckForVoice(0, 5, 'venice');
    SoundKit.setVolume('sfx', 0.5);
    const h = param(g.sfx.gain).history;
    const lastCancel = h.map((x) => x.method).lastIndexOf('cancelScheduledValues');
    const after = h.slice(lastCancel + 1);
    expect(after.map((x) => x.method)).toEqual(['setTargetAtTime', 'setTargetAtTime']);
    expect(after[1]).toMatchObject({ time: 5, value: 0.5 });
    expect(after[0].value).toBeLessThan(0.5);   // still ducked until then
  });

  it('back-to-back voices extend one duck; a voice cut early releases it there', async () => {
    const { SoundKit } = await import('./SoundKit');
    SoundKit.unlock();
    const g = SoundKit.graph()!;
    SoundKit.duckForVoice(0, 2, 'venice');
    SoundKit.duckForVoice(2.1, 4, 'venice');
    let h = param(g.crowdDuck.gain).history.filter((x) => x.method === 'setTargetAtTime');
    expect(h[h.length - 1]).toMatchObject({ time: 4, value: 1 });
    SoundKit.releaseDuck(1);
    h = param(g.crowdDuck.gain).history.filter((x) => x.method === 'setTargetAtTime');
    expect(h[h.length - 1]).toMatchObject({ value: 1 });
    expect(h[h.length - 1].time).toBeLessThan(4);
  });
});
