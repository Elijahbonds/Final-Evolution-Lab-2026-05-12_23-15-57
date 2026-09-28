// MUSIC-SUITE P4 (2026-09-25): the one mixing desk (mixGraph.ts) — the live graph and every offline render are built by
// the same builder and every hit is wired the same way, so what you hear is what you export. Built on fakeWebAudio.ts,
// which now remembers each node's kind and outputs, so a hit can be walked from its source to the speakers.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FakeAudioBuffer, FakeBaseAudioContext, FakeNode, FakeOfflineAudioContext, installFakeWebAudio,
  type FakeAudioContext, type FakeStart, type FakeWebAudio,
} from './fakeWebAudio';
import {
  CEILING, CEILING_DBFS, COMPRESSOR_DELAY_S, DEFAULT_CHANNEL, LIMITER, MASTER_GAIN, RAMP_TC, SAFETY_DB, SAFETY_GAIN, SAFETY_MARGIN_DB, TAKES_CHANNEL,
  anySolo, buildMixGraph, ceilingCurve, channelMix, clickBuffer, compressorDelayAt, gateGains, gateOpen, graphLatencySec, limiterMakeupDb, peakRms, roomImpulse,
  scopeSolo, toDb, type MixerState,
} from './mixGraph';
import { AudioEngine, type TrackState } from './AudioEngine';

const BPM = 120, STEPS = 16, TICK = 0.025, LEAD = 0.05, BASE = 60 / BPM / 4;
let fake: FakeWebAudio;
beforeEach(() => { fake = installFakeWebAudio(); });
afterEach(() => fake.uninstall());

const buf = (sec = 0.1): AudioBuffer => new FakeAudioBuffer(1, Math.round(44100 * sec), 44100) as unknown as AudioBuffer;
const row = (sampleId: string, hits: number[], extra: Partial<TrackState> = {}): TrackState => ({
  sampleId, pattern: Array.from({ length: STEPS }, (_, i) => hits.includes(i)), volume: 0.8, muted: false, pan: 0, ...extra,
});

/** How a node reads in a chain: its kind and the settings that shape the sound. */
function describeNode(n: object): string {
  const o = n as Record<string, unknown> & { kind?: string };
  const v = (k: string): number => (o[k] as { value: number }).value;
  switch (o.kind) {
    case 'gain': return `gain(${+v('gain').toFixed(6)})`;
    case 'panner': return `pan(${v('pan')})`;
    case 'compressor': return `comp(${v('threshold')}/${v('knee')}/${v('ratio')}/${v('attack')})`;
    case 'biquad': return `${String(o.type)}(${v('frequency')})`;
    case 'delay': return `delay(${v('delayTime')})`;
    case 'convolver': return `room(${(o.buffer as FakeAudioBuffer | null)?.length ?? 0})`;
    case 'shaper': return 'ceiling';
    case 'destination': return 'out';
    default: return String(o.kind);
  }
}
/** Every path from a node to the speakers (or to a tap that goes nowhere: a meter), each as one string; loops cut. */
function paths(from: object, seen: Set<object> = new Set()): string[] {
  const here = describeNode(from);
  const outs = (from as FakeNode).outputs ?? [];
  if (!outs.length || seen.has(from)) return [here + (seen.has(from) ? ' ↺' : '')];
  const next = new Set(seen).add(from);
  return outs.flatMap((o) => paths(o, next).map((p) => `${here} → ${p}`));
}
/** A start's full wiring (its source's paths, sorted), with its time. */
const wiring = (s: FakeStart, t0 = 0): string => `${(s.at - t0).toFixed(6)} rate ${s.rate} | ${paths(s.src!).sort().join(' || ')}`;

describe('mute / solo (pure: the gates and the engine\'s hears() read this one rule)', () => {
  const mix = (channels: MixerState['channels']): MixerState => ({ master: 1, channels });
  it('nothing set: every channel is open; mute closes one', () => {
    expect(gateOpen(mix({}), 'kick')).toBe(true);
    expect(gateOpen(null, 'kick')).toBe(true);
    expect(gateOpen(mix({ kick: { mute: true } }), 'kick')).toBe(false);
    expect(gateOpen(mix({ kick: { mute: true } }), 'snare')).toBe(true);
  });
  it('a solo closes every channel that is not soloed; two solos both sound; the takes strip obeys it too', () => {
    const m = mix({ snare: { solo: true }, bass: { solo: true } });
    expect(anySolo(m)).toBe(true);
    expect(gateGains(m, ['kick', 'snare', 'bass', 'lead', TAKES_CHANNEL])).toEqual({ kick: 0, snare: 1, bass: 1, lead: 0, takes: 0 });
  });
  it('mute wins over solo, and a muted solo still silences the rest (the desk rule)', () => {
    const m = mix({ snare: { solo: true, mute: true } });
    expect(gateOpen(m, 'snare')).toBe(false);
    expect(gateOpen(m, 'kick')).toBe(false);
  });
  it('a strip\'s settings come back clamped, with the defaults filled in', () => {
    expect(channelMix(mix({}), 'kick')).toEqual(DEFAULT_CHANNEL);
    expect(channelMix(mix({ kick: { gain: 9, pan: -4, sendA: 2, sendB: -1 } }), 'kick')).toEqual({ gain: 1.5, pan: -1, mute: false, solo: false, sendA: 1, sendB: 0 });
  });
});

describe('the master: a real limiter, a safety gain, a ceiling', () => {
  it('the limiter is the contract\'s brickwall: DynamicsCompressor −1.5 dBFS, knee 0, ratio 20, attack 1 ms', () => {
    const ctx = new FakeBaseAudioContext();
    const g = buildMixGraph(ctx as unknown as BaseAudioContext);
    const l = g.limiter as unknown as Record<string, { value: number }>;
    expect([l.threshold.value, l.knee.value, l.ratio.value, l.attack.value]).toEqual([LIMITER.threshold, 0, 20, 0.001]);
    expect(LIMITER.threshold).toBe(-1.5);
  });
  it('the safety gain takes back the compressor\'s own makeup (+0.855 dB) and a margin, so a quiet beat is unchanged', () => {
    expect(limiterMakeupDb()).toBeCloseTo(0.855, 9);          // (1 / curve(0 dBFS))^0.6: curve = −1.5 + 1.5/20 = −1.425 dB
    expect(SAFETY_DB).toBeCloseTo(-0.855 - SAFETY_MARGIN_DB, 9);
    expect(20 * Math.log10(SAFETY_GAIN)).toBeCloseTo(SAFETY_DB, 9);
  });
  it('the ceiling clips at −0.3 dBFS and is the identity below it (so nothing a render writes can pass −0.3 dBFS)', () => {
    const c = ceilingCurve();
    expect(Math.max(...c.map(Math.abs))).toBeCloseTo(CEILING, 7);
    expect(20 * Math.log10(Math.max(...c.map(Math.abs)))).toBeLessThanOrEqual(CEILING_DBFS + 1e-6);
    const n = c.length;
    for (const x of [-0.9, -0.5, -0.1, 0, 0.25, 0.5, 0.96]) {
      const pos = ((x + 1) / 2) * (n - 1), i = Math.floor(pos), f = pos - i;
      expect(c[i] + (c[i + 1] - c[i]) * f).toBeCloseTo(x, 6);  // linear interpolation between exact points = x
    }
  });
  it('the room is seeded: the live room and a render\'s room are the same impulse, sample for sample', () => {
    const a = new FakeBaseAudioContext(), b = new FakeOfflineAudioContext(2, 100, 44100);
    const ra = roomImpulse(a as unknown as BaseAudioContext), rb = roomImpulse(b as unknown as BaseAudioContext);
    expect(ra).not.toBe(rb);
    for (const ch of [0, 1]) expect(Array.from(ra.getChannelData(ch).slice(0, 4096))).toEqual(Array.from(rb.getChannelData(ch).slice(0, 4096)));
    expect(roomImpulse(a as unknown as BaseAudioContext)).toBe(ra);   // made once per context
  });
  it('meters: peak and RMS; silence reads −120 dB', () => {
    expect(peakRms([0, 0.5, -1, 0.5])).toEqual({ peak: 1, rms: Math.sqrt(1.5 / 4) });
    expect(toDb(1)).toBe(0);
    expect(toDb(0)).toBe(-120);
    const g = buildMixGraph(new FakeBaseAudioContext() as unknown as BaseAudioContext);
    g.channel('kick'); g.channel('bass');
    const m = g.meters();
    expect(Object.keys(m.channels).sort()).toEqual(['bass', 'kick']);
    expect(m.master.l).toEqual({ peak: 0, rms: 0 });
  });
});

describe('ONE builder: live play and the render wire every hit the same way (PHASE-4 ENGINE CONTRACT (1))', () => {
  const mixer: MixerState = {
    master: 0.9,
    channels: { kick: { gain: 1.2, pan: -0.3, sendA: 0.25 }, bass: { sendB: 0.4 }, hat: { gain: 0.5, pan: 0.6, sendA: 0.1, sendB: 0.2 } },
  };
  const tracks = (): TrackState[] => [
    row('kick', [0, 4, 8, 12]),
    row('hat', [2, 6, 10, 14], { volume: 0.5, pan: 0.2, vels: Array.from({ length: STEPS }, (_, i) => (i % 4 === 2 ? 0.6 : 1)) }),
    row('bass', [0, 3, 8, 11], { notes: Array.from({ length: STEPS }, (_, i) => (i < 8 ? 33 : 40)) }),
  ];

  for (const polished of [false, true]) {
    it(`the same hits, at the same times and rates, through the same chains (MASTER ${polished ? 'ON' : 'OFF'})`, async () => {
      const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: tracks(), swing: 0.2 });
      for (const id of ['kick', 'hat']) eng.loadBuffer(id, id, buf(), 'perc');
      eng.loadBuffer('bass', 'Bass', buf(0.4), 'bass', 33);
      eng.setMixer(mixer);
      eng.masterPolish(polished);
      // live: one bar
      const ctx = eng.context as unknown as FakeAudioContext;
      ctx.currentTime = 0;
      eng.start();
      for (let k = 1; k * TICK < LEAD + STEPS * BASE + 0.2; k++) { ctx.currentTime = k * TICK; fake.tick(); }
      eng.stop();
      const live = ctx.starts.filter((s) => s.at < LEAD + STEPS * BASE - 1e-9).map((s) => wiring(s, LEAD)).sort();
      // the render of the same bar
      const before = FakeOfflineAudioContext.created.length;
      await eng.renderMixdown(1);
      const off = FakeOfflineAudioContext.created[before];
      const rendered = off.starts.map((s) => wiring(s)).sort();
      expect(live).toHaveLength(12);
      expect(rendered).toEqual(live);
      // …and the chain is the contract's: hit gain → fader → pan → gate → bus / room / slap / meter → master (P4 FIX PASS: no
      // per-hit panner on a row with no pan of its own — the strip's panner pans the mono hit, equal-power)
      const kick = rendered.find((w) => w.startsWith('0.000000') && w.includes('gain(0.8) → gain(1.2) → pan(-0.3) → gain(1)'))!;
      expect(kick).toBeTruthy();
      const master = `comp(-1.5/0/20/0.001) → gain(${+SAFETY_GAIN.toFixed(6)}) → ceiling`;
      const bus = `gain(${+(MASTER_GAIN * 0.9).toFixed(6)}) → ${polished ? 'comp(-18/24/3/0.01) → lowshelf(120) → highshelf(8000) → ' : ''}${master}`;
      expect(kick).toContain(`gain(1) → ${bus} → out`);                          // dry
      expect(kick).toContain(`gain(0.25) → gain(1) → room(${Math.floor(44100 * 1.1)}) → gain(0.8) → ${bus} → out`);   // send A
      expect(kick).toContain('gain(1) → analyser');                                // the strip's meter tap
      expect(kick).toContain(`${master} → splitter → analyser`);                    // the master meter
      // a note: the bass plays E (40) from its A (33) buffer at 2^(7/12); the drums play at rate 1
      expect(rendered.filter((w) => w.includes(` rate ${Math.pow(2, 7 / 12)} `))).toHaveLength(2);
      expect(rendered.filter((w) => w.includes(' rate 1 '))).toHaveLength(10);
      // velocity: a 0.6 hat hit is 0.5 × 0.6
      expect(rendered.filter((w) => w.includes('gain(0.3) → pan(0.2)'))).toHaveLength(4);
      eng.dispose();
    });
  }

  it('the takes strip and the metronome: a take crosses the desk; a click goes through the limiter (P4 FIX PASS), never the bus', () => {
    const ctx = new FakeBaseAudioContext();
    const g = buildMixGraph(ctx as unknown as BaseAudioContext, { mixer: { master: 1, channels: { takes: { sendA: 0.3 } } } });
    const src = ctx.createBufferSource();
    src.connect(g.channel(TAKES_CHANNEL).input as unknown as FakeNode);
    const p = paths(src);
    expect(p.some((x) => x.includes('gain(0.3) → gain(1) → room'))).toBe(true);
    expect(p.every((x) => x.endsWith('out') || x.endsWith('analyser') || x.endsWith('↺'))).toBe(true);   // speakers, a meter, or the slap's loop
    expect(p.filter((x) => x.endsWith('out')).every((x) => x.includes('comp(-1.5/0/20/0.001)'))).toBe(true);
    const click = ctx.createBufferSource();
    click.buffer = clickBuffer(ctx as unknown as BaseAudioContext, 'accent');
    click.connect(g.click as unknown as FakeNode);
    expect(paths(click).find((x) => x.endsWith('out'))).toBe(`buffer → gain(1) → delay(0) → comp(-1.5/0/20/0.001) → gain(${+SAFETY_GAIN.toFixed(6)}) → ceiling → out`);
  });

  it('nothing reaches the speakers except through the ceiling (every path of every strip, send and click)', () => {
    const ctx = new FakeBaseAudioContext();
    const g = buildMixGraph(ctx as unknown as BaseAudioContext, { polish: true });
    for (const id of ['kick', 'bass', 'flip_3', TAKES_CHANNEL]) {
      for (const p of paths(g.channel(id).input)) if (p.endsWith('out')) expect(p).toMatch(/→ ceiling → out$/);
    }
    for (const p of paths(g.click)) if (p.endsWith('out')) expect(p).toMatch(/ceiling → out$/);
  });

  it('MASTER toggles in place: the bus feeds the polish chain or the limiter, never both', () => {
    const ctx = new FakeBaseAudioContext();
    const g = buildMixGraph(ctx as unknown as BaseAudioContext);
    const outs = (): string[] => (g.bus as unknown as FakeNode).outputs.map(describeNode);
    expect(outs()).toEqual(['comp(-1.5/0/20/0.001)']);
    g.setPolish(true);
    expect(outs()).toEqual(['comp(-18/24/3/0.01)']);
    g.setPolish(false);
    expect(outs()).toEqual(['comp(-1.5/0/20/0.001)']);
  });
});

describe('the mixer on the live engine: mute / solo stop the sound at once', () => {
  function engine(): { eng: AudioEngine; ctx: FakeAudioContext } {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [row('kick', [0, 4, 8, 12]), row('snare', [4, 12]), row('hat', [2, 6, 10, 14])], swing: 0 });
    for (const id of ['kick', 'snare', 'hat']) eng.loadBuffer(id, id, buf(), 'perc');
    return { eng, ctx: eng.context as unknown as FakeAudioContext };
  }
  const bar = (eng: AudioEngine, ctx: FakeAudioContext): number[] => {
    const before = ctx.starts.length;
    ctx.currentTime = 0;
    eng.start();
    for (let k = 1; k * TICK < LEAD + STEPS * BASE + 0.2; k++) { ctx.currentTime = k * TICK; fake.tick(); }
    eng.stop();
    return ctx.starts.slice(before).filter((s) => s.at < LEAD + STEPS * BASE - 1e-9).map((s) => Math.round((s.at - LEAD) / BASE)).sort((a, b) => a - b);
  };

  it('a muted row starts no sources (live and in the render), a soloed row is the only one', async () => {
    const { eng, ctx } = engine();
    expect(bar(eng, ctx)).toEqual([0, 2, 4, 4, 6, 8, 10, 12, 12, 14]);
    eng.setMixer({ master: 1, channels: { hat: { mute: true } } });
    expect(bar(eng, ctx)).toEqual([0, 4, 4, 8, 12, 12]);
    eng.setMixer({ master: 1, channels: { snare: { solo: true } } });
    expect(bar(eng, ctx)).toEqual([4, 12]);
    const before = FakeOfflineAudioContext.created.length;
    await eng.renderMixdown(1);
    expect(FakeOfflineAudioContext.created[before].starts.map((s) => Math.round(s.at / BASE))).toEqual([4, 12]);
    expect(await eng.renderStems(1)).toHaveLength(1);                               // only the soloed row has a stem
  });

  it('a hit already scheduled (up to 100 ms ahead) goes silent the moment its row is muted: its gate closes', () => {
    const { eng, ctx } = engine();
    ctx.currentTime = 0;
    eng.start();
    ctx.currentTime = TICK; fake.tick();                                             // step 0's kick is scheduled
    const gate = eng.mixGraph.channel('kick').gate as unknown as { gain: { value: number } };
    expect(gate.gain.value).toBe(1);
    eng.setMixer({ master: 1, channels: { kick: { mute: true } } });
    expect(gate.gain.value).toBe(0);
    eng.setMixer({ master: 1, channels: {} });
    expect(gate.gain.value).toBe(1);
    eng.stop();
  });
});

// ── MUSIC-SUITE P4 FIX PASS (2026-09-25) ────────────────────────────────────────────────────────────────────────────
/** How many DynamicsCompressors (each a fixed 6 ms look-ahead) and how much DelayNode time lie on a path to the speakers. */
function delayOf(path: string): { comps: number; delay: number } {
  const comps = (path.match(/comp\(/g) ?? []).length;
  const delay = [...path.matchAll(/delay\(([\d.e-]+)\)/g)].reduce((t, m) => t + Number(m[1]), 0);
  return { comps, delay };
}
/** A path's total delay to the speakers (s): its compressors' look-ahead + its delay nodes (the slap's loop excluded). */
const latencyOf = (path: string): number => { const d = delayOf(path); return d.comps * COMPRESSOR_DELAY_S + d.delay; };

describe('P4 FIX PASS: the clicks land WITH the music (the limiter\'s 6 ms look-ahead is on both paths)', () => {
  for (const polished of [false, true]) {
    it(`a hit's dry path and a click's path cross the same delay to the speakers (MASTER ${polished ? 'ON: 12' : 'OFF: 6'} ms)`, () => {
      const ctx = new FakeBaseAudioContext();
      const g = buildMixGraph(ctx as unknown as BaseAudioContext, { polish: polished });
      const dry = paths(g.channel('kick').input).filter((p) => p.endsWith('out') && !p.includes('room') && !p.includes('delay('));
      expect(dry).toHaveLength(1);
      const click = paths(g.click).filter((p) => p.endsWith('out'));
      expect(click).toHaveLength(1);
      expect(latencyOf(dry[0])).toBeCloseTo(graphLatencySec(polished), 12);
      expect(latencyOf(click[0])).toBeCloseTo(graphLatencySec(polished), 4);    // it was 0: 6 / 12 ms ahead of every beat (± a frame)
      expect(g.latencySec).toBeCloseTo(graphLatencySec(polished), 12);
    });
  }
  it('MASTER toggled live: the click\'s delay follows (0 → 6 ms → 0), and the engine says the desk\'s latency', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [], swing: 0 });
    const align = eng.mixGraph.clickAlign as unknown as { delayTime: { value: number } };
    expect(align.delayTime.value).toBe(0);
    expect(eng.graphLatencySec).toBeCloseTo(0.006, 12);
    eng.masterPolish(true);
    expect(align.delayTime.value).toBeCloseTo(compressorDelayAt(44100), 12);          // 264 frames: the kernel's own count
    expect(align.delayTime.value * 44100).toBe(264);
    expect(eng.graphLatencySec).toBeCloseTo(0.012, 12);
    eng.masterPolish(false);
    expect(align.delayTime.value).toBe(0);
    eng.dispose();
  });
  it('a click is summed in FRONT of the limiter (a hot beat + a click is limited, not hard-clipped at the ceiling)', () => {
    const ctx = new FakeBaseAudioContext();
    const g = buildMixGraph(ctx as unknown as BaseAudioContext);
    const intoLimiter = (from: object): boolean => paths(from).some((p) => p.includes('comp(-1.5/0/20/0.001) →'));
    expect(intoLimiter(g.click)).toBe(true);
    expect((g.click as unknown as FakeNode).outputs.map(describeNode)).toEqual(['delay(0)']);   // never straight to the ceiling
    expect(compressorDelayAt(48000) * 48000).toBe(288);
    expect(compressorDelayAt(NaN)).toBe(COMPRESSOR_DELAY_S);
  });
});

describe('P4 FIX PASS: one pan law — a kit row pans like a take (mono into the strip\'s panner)', () => {
  it('a grid hit on a row with no pan of its own meets ONE panner (the strip\'s), as a take does', async () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [row('kick', [0])], swing: 0 });
    eng.loadBuffer('kick', 'Kick', buf(), 'kick');
    eng.setMixer({ master: 1, channels: { kick: { pan: -1 }, takes: { pan: -1 } } });
    eng.setTakes([{ id: 't', buffer: buf(1), startBar: 0, loopBars: 1, gain: 1, trimStart: 0, trimEnd: 0, muted: false }]);
    const before = FakeOfflineAudioContext.created.length;
    await eng.renderMixdown(1);
    const hit = FakeOfflineAudioContext.created[before].starts[0];
    const dry = paths(hit.src!).find((p) => p.endsWith('out') && !p.includes('room') && !p.includes('delay('))!;
    expect((dry.match(/pan\(/g) ?? []).length).toBe(1);                        // it met two: an up-mix, then a balance (+3 dB at ±1)
    expect(dry).toMatch(/^buffer → gain\(0\.8\) → gain\(1\) → pan\(-1\)/);
    // the take: the same one panner
    const ctx = eng.context as unknown as FakeAudioContext;
    ctx.currentTime = 0; eng.start();
    for (let k = 1; k * TICK < 0.2; k++) { ctx.currentTime = k * TICK; fake.tick(); }
    const take = ctx.starts.find((x) => x.duration !== undefined)!;
    const tdry = paths(take.src!).find((p) => p.endsWith('out') && !p.includes('room') && !p.includes('delay('))!;
    expect((tdry.match(/pan\(/g) ?? []).length).toBe(1);
    eng.dispose();
  });
  it('a legacy row that carries its own pan (no UI writes one) keeps its per-hit panner, as before', async () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [row('hat', [0], { pan: 0.4 })], swing: 0 });
    eng.loadBuffer('hat', 'Hat', buf(), 'hat');
    const before = FakeOfflineAudioContext.created.length;
    await eng.renderMixdown(1);
    expect(paths(FakeOfflineAudioContext.created[before].starts[0].src!)[0]).toMatch(/^buffer → gain\(0\.8\) → pan\(0\.4\) → gain\(1\)/);
    eng.dispose();
  });
});

describe('P4 FIX PASS: a solo nobody can see silences nothing (scopeSolo)', () => {
  it('a solo on a strip that cannot sound (TAKES with no take, a row not drawn) is dropped; mute and live solos stay', () => {
    const m: MixerState = { master: 1, channels: { takes: { solo: true }, flip_9: { solo: true, mute: true }, snare: { mute: true } } };
    const live = scopeSolo(m, ['kick', 'snare', 'bass']);
    expect(anySolo(live)).toBe(false);
    expect(gateOpen(live, 'kick')).toBe(true);                                  // it was closed: the whole grid silent
    expect(gateOpen(live, 'snare')).toBe(false);                                // a mute is kept
    expect(live.channels.flip_9).toEqual({ solo: false, mute: true });
    const withTakes = scopeSolo(m, ['kick', 'snare', TAKES_CHANNEL]);
    expect(gateOpen(withTakes, 'kick')).toBe(false);                            // takes exist: their solo counts
    expect(gateOpen(withTakes, TAKES_CHANNEL)).toBe(true);
    const clean: MixerState = { master: 1, channels: { kick: { solo: true } } };
    expect(scopeSolo(clean, ['kick'])).toBe(clean);                             // nothing dropped: the same object
  });
});

describe('P4 FIX PASS: the live desk glides a move; a render\'s desk is set', () => {
  it('live: a fader / gate / master change is a setTargetAtTime on the live clock (no zipper, no click); a new strip is set at once', () => {
    const ctx = new FakeBaseAudioContext();
    const g = buildMixGraph(ctx as unknown as BaseAudioContext, {}, { live: true });
    const s = g.channel('kick');
    const calls: [string, number][] = [];
    const spy = (name: string, p: { setTargetAtTime: (v: number, t: number, c: number) => unknown }) => {
      const orig = p.setTargetAtTime.bind(p);
      p.setTargetAtTime = (v: number, t: number, c: number) => { calls.push([name, v]); expect(c).toBe(RAMP_TC); return orig(v, t, c); };
    };
    spy('fader', s.fader.gain as never); spy('gate', s.gate.gain as never); spy('bus', g.bus.gain as never);
    ctx.currentTime = 3;
    g.setMixer({ master: 0.5, channels: { kick: { gain: 0.4, mute: true } } });
    expect(calls).toEqual(expect.arrayContaining([['fader', 0.4], ['gate', 0], ['bus', MASTER_GAIN * 0.5]]));
    const n = calls.length;
    g.setMixer({ master: 0.5, channels: { kick: { gain: 0.4, mute: true } } });  // the same desk again: nothing new scheduled
    expect(calls).toHaveLength(n);
    const later = g.channel('snare');                                          // built after: set, not glided
    expect((later.gate.gain as unknown as { value: number }).value).toBe(1);
  });
  it('a render\'s desk (no `live`) sets values: nothing to glide on a static render', () => {
    const ctx = new FakeBaseAudioContext();
    const g = buildMixGraph(ctx as unknown as BaseAudioContext);
    const s = g.channel('kick');
    let glided = 0;
    (s.fader.gain as unknown as { setTargetAtTime: () => void }).setTargetAtTime = () => { glided++; };
    g.setMixer({ master: 1, channels: { kick: { gain: 0.3 } } });
    expect(glided).toBe(0);
    expect((s.fader.gain as unknown as { value: number }).value).toBe(0.3);
  });
});

describe('P4 FIX PASS: renders at the live context\'s rate (the room is the same impulse, live and rendered)', () => {
  it('on a 48 kHz device every render is 48 kHz and builds the same room as the live desk', async () => {
    fake.uninstall();
    fake = installFakeWebAudio({ sampleRate: 48000 });
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [row('kick', [0])], swing: 0 });
    eng.loadBuffer('kick', 'Kick', buf(), 'kick');
    expect(eng.context.sampleRate).toBe(48000);
    expect(eng.renderRate).toBe(48000);
    const before = FakeOfflineAudioContext.created.length;
    await eng.renderMixdown(1);
    await eng.renderStems(1);
    await eng.renderSong([[row('kick', [0])]], [], 3);
    const made = FakeOfflineAudioContext.created.slice(before);
    expect(made.map((c) => c.sampleRate)).toEqual([48000, 48000, 48000]);      // they were all 44 100
    const liveRoom = roomImpulse(eng.context as unknown as BaseAudioContext), renderRoom = roomImpulse(made[0] as unknown as BaseAudioContext);
    expect(renderRoom.length).toBe(liveRoom.length);
    expect(Array.from(renderRoom.getChannelData(0).slice(0, 2048))).toEqual(Array.from(liveRoom.getChannelData(0).slice(0, 2048)));
    eng.dispose();
  });
});

describe('P4 FIX PASS: the song stems leave out a take stem the desk silences', () => {
  it('TAKES muted (or soloed out): no silent "take N" file', async () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [row('kick', [0])], swing: 0 });
    eng.loadBuffer('kick', 'Kick', buf(), 'kick');
    const shots = [{ id: '1', buffer: buf(1), atBar: 0, gain: 1 }];
    expect((await eng.renderSongStems([[row('kick', [0])]], shots, 3)).map((x) => x.name)).toEqual(['Kick', 'take 1']);
    eng.setMixer({ master: 1, channels: { kick: { solo: true } } });
    expect((await eng.renderSongStems([[row('kick', [0])]], shots, 3)).map((x) => x.name)).toEqual(['Kick']);
    eng.setMixer({ master: 1, channels: { takes: { mute: true } } });
    expect((await eng.renderSongStems([[row('kick', [0])]], shots, 3)).map((x) => x.name)).toEqual(['Kick']);
    eng.dispose();
  });
});
