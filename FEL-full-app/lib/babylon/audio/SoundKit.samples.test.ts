// hoops-sound (phase 11a): SoundKit's sample player on the fake Web Audio graph (the fresh-singleton pattern of
// SoundKit.busRouting.test.ts). The promises: a cue with nothing loaded plays its synth (before the bank loads, after a failed fetch,
// with the bank released, with the knob off); a loaded cue plays ONE recording through the bus its synth used (SFX, or the crowd duck for
// the crowd), panned when asked; the mute silences recordings like synths; the knob off fetches nothing; the crowd bed becomes the
// recording once loaded, at the momentum level it was playing at.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakeAudioBuffer, installFakeWebAudio, type FakeNode, type FakeWebAudio } from '../music/fakeWebAudio';

let fake: FakeWebAudio;
let fetched: string[];
let failing: Set<string>;
const decoded = new WeakSet<object>();

beforeEach(() => {
  vi.resetModules();
  fake = installFakeWebAudio();
  (globalThis as unknown as { window: { AudioContext?: unknown } }).window.AudioContext = FakeAudioContext;
  fetched = []; failing = new Set();
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);
    return failing.has(url) ? { ok: false, status: 404 } : { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
  });
  // every buffer the bank decodes is marked, so a test can tell a recording from a synth's noise buffer (createBuffer)
  vi.spyOn(FakeAudioContext.prototype, 'decodeAudioData').mockImplementation(async function (this: FakeAudioContext, bytes: ArrayBuffer) {
    const url = new TextDecoder().decode(bytes);   // the fetch stub's bytes are the url
    const b = new FakeAudioBuffer(1, Math.round(this.sampleRate * (url.includes('crowd_bed') ? 14 : 0.3)), this.sampleRate);
    decoded.add(b);
    return b;
  });
});
afterEach(() => { fake.uninstall(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function kit() {
  const { SoundKit } = await import('./SoundKit');
  const feel = await import('../../feel-panel/feel');
  SoundKit.unlock();
  const g = SoundKit.graph()!;
  const ctx = g.ctx as unknown as FakeAudioContext;
  /** What one play() started: the sources, and which of them are recordings. */
  const one = (fn: () => void) => {
    const n0 = ctx.starts.length; fn();
    const s = ctx.starts.slice(n0);
    return { all: s, samples: s.filter((x) => x.buffer && decoded.has(x.buffer as object)), synth: s.filter((x) => !(x.buffer && decoded.has(x.buffer as object))) };
  };
  return { SoundKit, feel, g, ctx, one };
}
/** Follow a node's first outputs to the first node that is one of `targets`. */
function reaches(n: FakeNode, targets: object[]): object | null {
  let cur: object | undefined = n;
  for (let i = 0; i < 6 && cur; i++) { if (targets.includes(cur)) return cur; cur = (cur as FakeNode).outputs?.[0]; }
  return null;
}

describe('SoundKit sample player', () => {
  it('before any bank, and before the bank has loaded, every cue is its synth (nothing goes silent)', async () => {
    const { SoundKit, one } = await kit();
    expect(one(() => SoundKit.play('swish')).synth.length).toBeGreaterThan(0);
    expect(one(() => SoundKit.play('bounce')).synth.length).toBeGreaterThan(0);   // the new cues have a synth too
    expect(one(() => SoundKit.play('catch')).synth.length).toBeGreaterThan(0);
    const loading = SoundKit.useSampleBank('hoops');
    const r = one(() => SoundKit.play('swish'));
    expect(r.samples).toHaveLength(0); expect(r.synth.length).toBeGreaterThan(0);
    await loading;
  });

  it('once loaded: one recording per hit, on the SFX bus (the crowd cheer on the crowd duck), panned when asked', async () => {
    const { SoundKit, g, one } = await kit();
    await SoundKit.useSampleBank('hoops');
    expect(SoundKit.sampleState()).toMatchObject({ bank: 'hoops', state: 'ready', loaded: 24, failed: 0 });
    for (const name of ['swish', 'rattle', 'squeak', 'bounce', 'catch'] as const) {
      const r = one(() => SoundKit.play(name, { volume: 0.5 }));
      expect(r.all).toHaveLength(1); expect(r.samples).toHaveLength(1);
      expect(reaches(r.samples[0].src as unknown as FakeNode, [g.sfx, g.crowdDuck])).toBe(g.sfx);
    }
    const cheer = one(() => SoundKit.play('crowdCheer'));
    expect(cheer.samples).toHaveLength(1);
    expect(reaches(cheer.samples[0].src as unknown as FakeNode, [g.sfx, g.crowdDuck])).toBe(g.crowdDuck);
    const panned = one(() => SoundKit.play('bounce', { pan: -0.4 }));
    const gain = (panned.samples[0].src as unknown as FakeNode).outputs[0] as FakeNode;
    expect((gain.outputs[0] as FakeNode).kind).toBe('panner');
    // the cues the set has no recording for stay synth
    for (const name of ['crowdGroan', 'whistle', 'thud', 'impact', 'whoosh', 'uiTick'] as const) expect(one(() => SoundKit.play(name)).samples).toHaveLength(0);
  });

  it('the rate and level follow the call (pitch and volume) inside the jitter', async () => {
    const { SoundKit, one } = await kit();
    await SoundKit.useSampleBank('hoops');
    const r = one(() => SoundKit.play('squeak', { volume: 0.8, pitch: 1.1 }));
    expect(r.samples[0].rate).toBeGreaterThan(1.1 * 0.93); expect(r.samples[0].rate).toBeLessThan(1.1 * 1.07);
    const gain = (r.samples[0].src as unknown as FakeNode).outputs[0] as FakeNode & { gain: { value: number } };
    expect(gain.gain.value).toBeGreaterThan(0.8 * 0.081 * 0.79); expect(gain.gain.value).toBeLessThan(0.8 * 0.081 * 1.26);
  });

  it('a cue whose files all failed falls back to its synth; the others still play recordings', async () => {
    const { SoundKit, one } = await kit();
    for (let i = 1; i <= 4; i++) failing.add(`/audio/hoops/net_${i}.mp3`);
    await SoundKit.useSampleBank('hoops');
    expect(SoundKit.sampleState().failed).toBe(4);
    expect(one(() => SoundKit.play('swish')).samples).toHaveLength(0);
    expect(one(() => SoundKit.play('swish')).synth.length).toBeGreaterThan(0);
    expect(one(() => SoundKit.play('rattle')).samples).toHaveLength(1);
  });

  it('the mute silences the recordings like the synths', async () => {
    const { SoundKit, one } = await kit();
    await SoundKit.useSampleBank('hoops');
    SoundKit.setEnabled(false, true);
    expect(one(() => SoundKit.play('bounce')).all).toHaveLength(0);
  });

  it('released (the next mode) every cue is its synth again; asked again it plays the recordings it kept, fetching nothing new', async () => {
    const { SoundKit, one } = await kit();
    await SoundKit.useSampleBank('hoops');
    const n = fetched.length;
    await SoundKit.useSampleBank(null);
    expect(one(() => SoundKit.play('swish')).samples).toHaveLength(0);
    await SoundKit.useSampleBank('hoops');
    expect(fetched.length).toBe(n);
    expect(one(() => SoundKit.play('swish')).samples).toHaveLength(1);
  });

  it('hoops.sampleSfxOn 0: nothing is fetched and every cue, the bed included, is exactly the synth', async () => {
    const { SoundKit, feel, one } = await kit();
    feel.setFeelUser(true); feel.setFeelSession(null); feel.setFeelOverride('hoops.sampleSfxOn', 0);
    await SoundKit.useSampleBank('hoops');
    expect(fetched).toEqual([]);
    expect(one(() => SoundKit.play('swish')).samples).toHaveLength(0);
    SoundKit.startAmbient('stadium');
    expect(SoundKit.sampleState().bed).toBe('synth');
  });

  it('a mode-load cap: the dribble of six bodies never stacks more than its voice cap', async () => {
    const { SoundKit, one } = await kit();
    await SoundKit.useSampleBank('hoops');
    let n = 0; for (let i = 0; i < 20; i++) n += one(() => SoundKit.play('bounce')).samples.length;
    expect(n).toBe(6);   // HOOPS_SAMPLES.bounce.maxVoices; the fake never ends a source, so the cap holds them
  });
});

describe('the crowd bed', () => {
  it('a stadium bed started before the bank loaded crossfades to the recorded loop, at the momentum level it had', async () => {
    const { SoundKit } = await kit();
    SoundKit.startAmbient('stadium');
    expect(SoundKit.sampleState().bed).toBe('synth');
    SoundKit.setAmbientLevel(1);                       // the swell at its top: 0.35 + 2.2 = 2.55 × the base
    await SoundKit.useSampleBank('hoops');
    expect(SoundKit.sampleState().bed).toBe('sample');
    const g = SoundKit.graph()!;
    const ctx = g.ctx as unknown as FakeAudioContext;
    const bed = ctx.starts.find((s) => s.buffer && decoded.has(s.buffer as object) && (s.buffer as FakeAudioBuffer).duration > 10)!;
    expect(bed).toBeTruthy();
    const src = bed.src as unknown as FakeNode & { loop: boolean; loopStart: number; loopEnd: number };
    expect(src.loop).toBe(true);
    expect(src.loopEnd - src.loopStart).toBeCloseTo(14, 6);
    const level = ((src.outputs[0] as FakeNode).outputs[0] as FakeNode & { gain: { value: number } }).gain.value;
    expect(level).toBeCloseTo(0.063 * 2.55, 6);
    expect(reaches(src, [g.crowdDuck])).toBe(g.crowdDuck);
  });
  it('a stadium bed started after the bank loaded is the recording from the start; other beds stay synth', async () => {
    const { SoundKit } = await kit();
    await SoundKit.useSampleBank('hoops');
    SoundKit.startAmbient('stadium');
    expect(SoundKit.sampleState().bed).toBe('sample');
    SoundKit.startAmbient('wind');
    expect(SoundKit.sampleState().bed).toBe('synth');
  });
});
