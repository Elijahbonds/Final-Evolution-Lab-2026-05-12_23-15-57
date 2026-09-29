// MUSIC-SUITE P6 (2026-09-25): the band builds on the P4 desk, and the engine names the rows it starts. Built on
// fakeWebAudio.ts (node): the band is a level under each strip's gate (mixGraph setBand — a glide, no click, no new node),
// and StepSound.rows is what PERFORM puts in lanes (StudioMode's onStepScheduled → performLanesOf).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeAudioBuffer, FakeBaseAudioContext, installFakeWebAudio, type FakeAudioContext, type FakeWebAudio } from './fakeWebAudio';
import { RAMP_TC, bandGate, buildMixGraph } from './mixGraph';
import { AudioEngine, type StepSound, type TrackState } from './AudioEngine';
import { PerformBand, performLaneOf, performLanesOf } from './performSet';

const BPM = 120, STEPS = 16, TICK = 0.025, LEAD = 0.05, BASE = 60 / BPM / 4;
let fake: FakeWebAudio;
beforeEach(() => { fake = installFakeWebAudio(); });
afterEach(() => fake.uninstall());
const buf = (sec = 0.1): AudioBuffer => new FakeAudioBuffer(1, Math.round(44100 * sec), 44100) as unknown as AudioBuffer;
const row = (sampleId: string, hits: number[]): TrackState => ({
  sampleId, pattern: Array.from({ length: STEPS }, (_, i) => hits.includes(i)), volume: 0.8, muted: false, pan: 0,
});
const gateOf = (g: ReturnType<typeof buildMixGraph>, id: string): number => (g.channel(id).gate.gain as unknown as { value: number }).value;

describe('the band on the desk (mixGraph setBand)', () => {
  it('bandGate: the desk closes a gate whatever the band says; otherwise the band\'s level (1 when it names nothing)', () => {
    expect(bandGate({ channels: {} }, null, 'kick')).toBe(1);
    expect(bandGate({ channels: {} }, { kick: 0 }, 'kick')).toBe(0);
    expect(bandGate({ channels: {} }, { kick: 0 }, 'snare')).toBe(1);
    expect(bandGate({ channels: { kick: { mute: true } } } as never, { kick: 1 }, 'kick')).toBe(0);
    expect(bandGate({ channels: { snare: { solo: true } } } as never, { kick: 1 }, 'kick')).toBe(0);   // soloed out
    expect(bandGate({ channels: {} }, { kick: 7 }, 'kick')).toBe(1);                                   // clamped
    expect(bandGate({ channels: {} }, { kick: Number.NaN }, 'kick')).toBe(1);
  });

  it('live: a part in / out is a GLIDE on its gate (setTargetAtTime, RAMP_TC — no click); nothing else moves', () => {
    const ctx = new FakeBaseAudioContext();
    const g = buildMixGraph(ctx as unknown as BaseAudioContext, {}, { live: true });
    const kick = g.channel('kick'), hat = g.channel('hat');
    const calls: [string, number, number][] = [];
    for (const [name, s] of [['kick', kick], ['hat', hat]] as const) {
      const p = s.gate.gain as unknown as { setTargetAtTime: (v: number, t: number, c: number) => unknown };
      const orig = p.setTargetAtTime.bind(p);
      p.setTargetAtTime = (v: number, t: number, c: number) => { calls.push([name, v, c]); return orig(v, t, c); };
    }
    ctx.currentTime = 2;
    g.setBand({ kick: 1, hat: 0 });
    expect(calls).toEqual([['hat', 0, RAMP_TC]]);                                  // the kick was already at 1: nothing sent
    expect(gateOf(g, 'hat')).toBe(0);
    g.setBand({ kick: 1, hat: 1 });
    expect(calls.at(-1)).toEqual(['hat', 1, RAMP_TC]);
    g.setBand(null);
    expect([gateOf(g, 'kick'), gateOf(g, 'hat')]).toEqual([1, 1]);
    expect(g.band).toBeNull();
  });

  it('a strip first built while a band is set starts at the band\'s level; a muted strip stays shut when the band lets it in', () => {
    const ctx = new FakeBaseAudioContext();
    const g = buildMixGraph(ctx as unknown as BaseAudioContext, {}, { live: true });
    g.setBand({ lead: 0 });
    expect(gateOf(g, 'lead')).toBe(0);                                             // built now: set at once, at 0
    g.setMixer({ master: 1, channels: { snare: { mute: true } } });
    g.setBand({ snare: 1, lead: 1 });
    expect([gateOf(g, 'snare'), gateOf(g, 'lead')]).toEqual([0, 1]);
    expect(g.band).toEqual({ snare: 1, lead: 1 });
  });

  it('the band adds no node: a strip is still fader → pan → gate (the chain every render builds is unchanged)', () => {
    const ctx = new FakeBaseAudioContext();
    const live = buildMixGraph(ctx as unknown as BaseAudioContext, {}, { live: true });
    live.setBand({ kick: 0 });
    const s = live.channel('kick');
    expect(s.input).toBe(s.fader);
    const outs = (n: unknown): unknown[] => (n as { outputs?: unknown[] }).outputs ?? [];
    expect(outs(s.fader)).toEqual([s.pan]);
    expect(outs(s.pan)).toEqual([s.gate]);
  });
});

describe('the engine names the rows it starts (StepSound.rows), and PERFORM lanes them', () => {
  function engine(): { eng: AudioEngine; ctx: FakeAudioContext; seen: { step: number; sound: StepSound }[] } {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [row('kick', [0, 8]), row('snare', [4, 12]), row('hat', [0, 2, 4, 6, 8, 10, 12, 14]), row('lead', [7])], swing: 0 });
    for (const id of ['kick', 'snare', 'hat', 'lead']) eng.loadBuffer(id, id, buf(), 'perc');
    const seen: { step: number; sound: StepSound }[] = [];
    eng.onStepScheduled = (step, _t, sound) => { seen.push({ step, sound }); };
    return { eng, ctx: eng.context as unknown as FakeAudioContext, seen };
  }
  const playBar = (eng: AudioEngine, ctx: FakeAudioContext): void => {
    ctx.currentTime = 0;
    eng.start();
    for (let k = 1; k * TICK < LEAD + STEPS * BASE; k++) { ctx.currentTime = k * TICK; fake.tick(); }
    eng.stop();
  };

  it('each step says which rows started a sound on it; the lanes follow (a melody row is the Flip lane)', () => {
    const { eng, ctx, seen } = engine();
    playBar(eng, ctx);
    const at = (s: number) => seen.find((x) => x.step === s)!.sound;
    expect(at(0).rows).toEqual(['kick', 'hat']);
    expect(at(4).rows).toEqual(['snare', 'hat']);
    expect(at(7).rows).toEqual(['lead']);
    expect(at(1).rows).toEqual([]);
    expect(performLanesOf(at(0).rows!)).toEqual([0, 2]);
    expect(performLanesOf(at(7).rows!)).toEqual([3]);
    for (const x of seen) expect(x.sound.rows!.length, `step ${x.step}`).toBe(x.sound.hits);
  });

  it('a row the DESK mutes starts nothing and has no notes; a part the BAND has out still starts (silent) and keeps its lane', () => {
    const { eng, ctx, seen } = engine();
    eng.setMixer({ master: 1, channels: { hat: { mute: true } } });
    const band = new PerformBand();                                                // the kick only
    eng.mixGraph.setBand(Object.fromEntries(['kick', 'snare', 'hat', 'lead'].map((id) => [id, band.levels()[performLaneOf(id)]])));
    playBar(eng, ctx);
    const at = (s: number) => seen.find((x) => x.step === s)!.sound;
    expect(at(0).rows).toEqual(['kick']);                                          // the muted hat is not there
    expect(at(4).rows).toEqual(['snare']);                                         // the snare is out of the band: still there
    expect((eng.mixGraph.channel('snare').gate.gain as unknown as { value: number }).value).toBe(0);
    expect((eng.mixGraph.channel('kick').gate.gain as unknown as { value: number }).value).toBe(1);
  });

  it('a step passed over in a stall names no rows (PERFORM offers a rest)', () => {
    const { eng, ctx, seen } = engine();
    ctx.currentTime = 0;
    eng.start();
    ctx.currentTime = 1.0; fake.tick();                                            // a 1 s stall: every step before is gone
    eng.stop();
    const skipped = seen.filter((x) => x.sound.skipped);
    expect(skipped.length).toBeGreaterThan(0);
    for (const x of skipped) expect(x.sound.rows).toEqual([]);
  });
});
