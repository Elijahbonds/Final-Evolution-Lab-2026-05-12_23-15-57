// MUSIC-SUITE P2 (2026-09-25): "SWING THAT SWINGS". One pure step-time function (stepTime.ts gridStepTime) now places
// every step the Academy plays or exports — live scheduling, renderMixdown, renderStems, renderSong, renderSongStems —
// and the legacy /create maker's live loop and stems. P1 measured the bug this closes (outbox musicsuite/BASELINE.md 2c):
// at 15 % swing the live loop ran at 88.7 BPM for 92 and was 391 ms behind the export by bar 4; the legacy loop ran at
// 73.6 BPM at its slider's top; renderStems had no swing at all.
//
// The golden tests run the REAL engines on fakeWebAudio.ts (a clock you set, a 25 ms interval you fire, buffer sources
// that log their start times); the stem tests also record the node graph each source is wired through, so "the stems
// sum to the mix" is checked as "every stem hit is a mix hit, at the same time, through the same chain".
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  installFakeWebAudio, FakeAudioBuffer, FakeNode, FakeBaseAudioContext, FakeOfflineAudioContext, FakeScheduledSource,
  type FakeAudioContext, type FakeWebAudio,
} from './fakeWebAudio';
import {
  SWING_DEPTH, clampSwing, gridStepTime, renderGrid, retempoGrid, songStepTime, stepDurSec, swingDelaySec,
} from './stepTime';
import { AudioEngine, type TrackState } from './AudioEngine';
import { SAFETY_GAIN } from './mixGraph';
import { AudioEngine as LegacyAudioEngine } from '@/lib/modes/music/audio-engine';
import { expandChainSwing, type SwungSection } from './SongPanel';
import { expandChain, MAX_SONG_BARS, type SongChain } from './Song';

const BPM = 92;
const STEPS = 16;
const TICK = 0.025;          // AudioEngine.ts LOOKAHEAD_MS
const LEAD = 0.05;           // the first step sounds 50 ms after start()
const BASE = 60 / BPM / 4;   // one 16th at 92 BPM
const BARS = 8;

describe('the pure step time', () => {
  it('a 16th is a quarter of a beat', () => {
    expect(stepDurSec(92)).toBeCloseTo(60 / 92 / 4, 12);
    expect(stepDurSec(120)).toBeCloseTo(0.125, 12);
  });

  it('only the odd 16ths swing, by swing × SWING_DEPTH of a step, and never past the clamp', () => {
    expect(SWING_DEPTH).toBe(0.5);   // the renders' depth since M28 (P1 pinned it); see stepTime.ts DEPTH
    for (const swing of [0, 0.15, 0.4, 1]) {
      for (let s = 0; s < STEPS; s++) {
        expect(swingDelaySec(s, swing, BASE)).toBeCloseTo(s % 2 === 1 ? swing * SWING_DEPTH * BASE : 0, 12);
      }
    }
    expect(clampSwing(-1)).toBe(0);
    expect(clampSwing(3)).toBe(1);
    expect(clampSwing(Number.NaN)).toBe(0);
    expect(swingDelaySec(1, Number.POSITIVE_INFINITY, BASE)).toBe(0);
  });

  it('bar lines never move: bar b, step 0 is b × 16 steps at every swing', () => {
    for (const swing of [0, 0.15, 0.4, 1]) {
      for (let b = 0; b <= 64; b++) expect(songStepTime(b, 0, STEPS, BPM, swing)).toBeCloseTo(b * STEPS * BASE, 9);
    }
  });

  it('the render grid and the song grid are one function', () => {
    for (let i = 0; i < 64; i++) {
      expect(gridStepTime(renderGrid(BPM), i, i % STEPS, 0.3)).toBe(songStepTime(Math.floor(i / STEPS), i % STEPS, STEPS, BPM, 0.3));
    }
  });

  it('a tempo change bends the grid from the next step on without a jump', () => {
    const g0 = { originSec: 1, originIndex: 0, bpm: 92 };
    expect(retempoGrid(g0, 10, 92)).toBe(g0);                                   // same tempo: same grid
    const g1 = retempoGrid(g0, 10, 120);
    expect(gridStepTime(g1, 10, 10, 0)).toBeCloseTo(gridStepTime(g0, 10, 10, 0), 12);   // step 10 stays put
    expect(gridStepTime(g1, 11, 11, 0) - gridStepTime(g1, 10, 10, 0)).toBeCloseTo(stepDurSec(120), 12);
  });
});

// ── the real engines on the fake clock ───────────────────────────────────────────────────────────────────────────

let fake: FakeWebAudio;
beforeEach(() => { fake = installFakeWebAudio(); });
afterEach(() => fake.uninstall());

const allOn = (id: string, extra: Partial<TrackState> = {}): TrackState =>
  ({ sampleId: id, pattern: new Array<boolean>(STEPS).fill(true), volume: 0.8, muted: false, pan: 0, ...extra });
const buf = (): AudioBuffer => new FakeAudioBuffer(1, 4410, 44100) as unknown as AudioBuffer;

function academy(swing: number, tracks: TrackState[] = [allOn('kick')], bpm = BPM): AudioEngine {
  const eng = new AudioEngine({ bpm, steps: STEPS, tracks, swing });
  for (const t of tracks) eng.loadBuffer(t.sampleId, t.sampleId, buf(), 'kick');
  return eng;
}
async function legacy(swing: number, tracks: TrackState[] = [allOn('kick')]): Promise<LegacyAudioEngine> {
  const eng = new LegacyAudioEngine({ bpm: BPM, steps: STEPS, tracks, swing });
  for (const t of tracks) await eng.loadSample(t.sampleId, t.sampleId, 'data:application/octet-stream;base64,AAAA', 'kick');
  return eng;
}

type Live = { context: AudioContext; start(): void; stop(): void };
/**
 * The live loop's first `n` step starts, relative to the first step. `gaps` gives the scheduler's interval each firing
 * (a browser timer is never exactly 25 ms): the grid must not care.
 */
function live(eng: Live, n: number, gaps: (k: number) => number = () => TICK, phase = 0): number[] {
  const ctx = eng.context as unknown as FakeAudioContext;
  ctx.currentTime = 0;
  eng.start();
  let t = phase;
  for (let k = 1; ctx.starts.length < n && k < 1e6; k++) { t += gaps(k); ctx.currentTime = t; fake.tick(); }
  eng.stop();
  return ctx.starts.slice(0, n).map((s) => s.at - LEAD);
}
async function rendered(render: () => Promise<unknown>): Promise<number[]> {
  const before = FakeOfflineAudioContext.created.length;
  await render();
  return FakeOfflineAudioContext.created.slice(before).flatMap((c) => c.starts.map((s) => s.at)).sort((a, b) => a - b);
}
/** Effective tempo of a live loop from its downbeats: 8 bars of 4 beats over the time from bar 1 to bar 9. */
const effectiveBpm = (l: number[]): number => (BARS * 4 * 60) / (l[BARS * STEPS] - l[0]);

describe('GOLDEN: the live Academy loop plays exactly what it exports (8 bars, 92 BPM)', () => {
  for (const swing of [0, 0.15, 0.4]) {
    it(`swing ${swing}: every live step within 1 ms of renderMixdown, and the loop runs at 92 BPM`, async () => {
      const eng = academy(swing);
      const l = live(eng, BARS * STEPS + 1);                                   // + bar 9's downbeat, for the tempo
      const r = await rendered(() => eng.renderMixdown(BARS));
      expect(r).toHaveLength(BARS * STEPS);
      const worst = Math.max(...r.map((t, i) => Math.abs(l[i] - t)));
      expect(worst).toBeLessThan(0.001);
      expect(effectiveBpm(l)).toBeCloseTo(BPM, 6);
      // and the swing is the right way round: the OFF-beat 16th is late, the on-beat one is on the grid
      expect(l[1] - BASE).toBeCloseTo(swing * SWING_DEPTH * BASE, 9);
      expect(l[2]).toBeCloseTo(2 * BASE, 9);
    });
  }

  it('a jittery timer (5–60 ms firings, any phase) changes nothing: the grid is the clock, not the timer', async () => {
    const eng = academy(0.3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const l = live(eng, BARS * STEPS, () => 0.005 + rnd() * 0.055, 0.0137);
    const r = await rendered(() => eng.renderMixdown(BARS));
    r.forEach((t, i) => expect(Math.abs(l[i] - t)).toBeLessThan(1e-9));
  });

  it('renderStems, renderSong and renderSongStems place the same steps at the same times', async () => {
    const eng = academy(0.4);
    const mix = await rendered(() => eng.renderMixdown(BARS));
    expect(await rendered(() => eng.renderStems(BARS))).toEqual(mix);
    const bars = Array.from({ length: BARS }, () => [allOn('kick')]);
    const len = BARS * STEPS * BASE + 1;
    expect(await rendered(() => eng.renderSong(bars, [], len))).toEqual(mix);
    expect(await rendered(() => eng.renderSongStems(bars, [], len))).toEqual(mix);
  });

  it('a tempo change mid-loop bends the tempo from the next step; bars already counted keep their length', () => {
    const eng = academy(0.15);
    const ctx = eng.context as unknown as FakeAudioContext;
    ctx.currentTime = 0;
    eng.start();
    for (let k = 1; ctx.starts.length < STEPS; k++) { ctx.currentTime = k * TICK; fake.tick(); }
    eng.setBpm(120);                                                           // the slider moves during bar 2
    for (let k = Math.ceil(ctx.currentTime / TICK) + 1; ctx.starts.length < 5 * STEPS + 1; k++) { ctx.currentTime = k * TICK; fake.tick(); }
    eng.stop();
    const s = ctx.starts.map((x) => x.at - LEAD);
    const d120 = stepDurSec(120);
    // the last three bars are whole 120 BPM bars, bar line to bar line (no stretch, no swing creep)
    for (const b of [2, 3, 4]) expect(s[(b + 1) * STEPS] - s[b * STEPS]).toBeCloseTo(STEPS * d120, 9);
    // and nothing ever ran backwards or doubled
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
  });
});

describe('GOLDEN: the legacy /create maker (lib/modes/music/audio-engine.ts)', () => {
  for (const swing of [0, 0.15, 0.4, 1]) {
    it(`swing ${swing}: its live loop runs at 92 BPM and its stems are swung exactly like it`, async () => {
      const eng = await legacy(swing);
      const l = live(eng, BARS * STEPS + 1);
      const stems = await rendered(() => eng.renderStems(BARS));
      expect(stems).toHaveLength(BARS * STEPS);
      stems.forEach((t, i) => expect(Math.abs(l[i] - t)).toBeLessThan(0.001));
      expect(effectiveBpm(l)).toBeCloseTo(BPM, 6);
      eng.dispose();
    });
  }
});

// ── the graph: stems go through the mix's own bus ────────────────────────────────────────────────────────────────

/**
 * Run `fn` and return, per audio context it touched, every buffer source it started: "<start time> <chain>", where the
 * chain is the nodes the source is wired through to the destination (gain(v) → pan(v) → gain(0.8) → comp → … → out).
 * MUSIC-SUITE P4: a node's FIRST connection is its signal path — the desk (mixGraph.ts) connects a strip's gate to the bus
 * before its sends and meter, and the ceiling to the speakers before its meter tap — so the chain follows that one.
 */
async function wired(fn: () => Promise<unknown> | void): Promise<{ ctx: FakeBaseAudioContext; hits: string[] }[]> {
  const edges = new Map<object, object>();
  const started: { src: FakeScheduledSource; ctx: FakeBaseAudioContext; at: number }[] = [];
  const owner = new Map<FakeScheduledSource, FakeBaseAudioContext>();
  const origConnect = FakeNode.prototype.connect;
  const origCreate = FakeBaseAudioContext.prototype.createBufferSource;
  const origStart = FakeScheduledSource.prototype.start;
  FakeNode.prototype.connect = function <T>(this: FakeNode, dest: T): T { if (!edges.has(this)) edges.set(this, dest as object); return dest; };
  FakeBaseAudioContext.prototype.createBufferSource = function (this: FakeBaseAudioContext) {
    const src = origCreate.call(this); owner.set(src, this); return src;
  };
  FakeScheduledSource.prototype.start = function (this: FakeScheduledSource, at = 0) {
    const ctx = owner.get(this); if (ctx) started.push({ src: this, ctx, at });
    return origStart.call(this, at);
  };
  try { await fn(); } finally {
    FakeNode.prototype.connect = origConnect;
    FakeBaseAudioContext.prototype.createBufferSource = origCreate;
    FakeScheduledSource.prototype.start = origStart;
  }
  const name = (n: object, ctx: FakeBaseAudioContext): string => {
    if (n === ctx.destination) return 'out';
    const o = n as Record<string, unknown>;
    if ('threshold' in o) return 'comp';
    if ('Q' in o) return String(o.type);
    if ('pan' in o) return `pan(${(o.pan as { value: number }).value})`;
    if ('gain' in o) return `gain(${(o.gain as { value: number }).value})`;
    return typeof o.kind === 'string' ? o.kind : '?';   // MUSIC-SUITE P4: the ceiling's wave shaper reads 'shaper'
  };
  const byCtx = new Map<FakeBaseAudioContext, string[]>();
  for (const { src, ctx, at } of started) {
    const chain: string[] = [];
    for (let n = edges.get(src), guard = 0; n && guard < 20; n = edges.get(n), guard++) {
      chain.push(name(n, ctx));
      if (n === ctx.destination) break;
    }
    const list = byCtx.get(ctx) ?? [];
    byCtx.set(ctx, list);
    list.push(`${at.toFixed(9)} ${chain.join(' → ')}`);
  }
  return [...byCtx.entries()].map(([ctx, hits]) => ({ ctx, hits }));
}
const sortAll = (rows: { hits: string[] }[]): string[] => rows.flatMap((r) => r.hits).sort();

describe('the stems sum to the mix: same hits, same chain, same bus', () => {
  const tracks = (): TrackState[] => [
    { sampleId: 'kick', pattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0].map(Boolean), volume: 0.9, muted: false, pan: -0.25 },
    { sampleId: 'hat', pattern: [0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1].map(Boolean), volume: 0.5, muted: false, pan: 0.5 },
    { sampleId: 'fx', pattern: new Array<boolean>(STEPS).fill(true), volume: 1, muted: true, pan: 0 },   // muted: in neither
  ];

  // MUSIC-SUITE P4: every hit now crosses its row's strip (fader 1 → pan 0 → gate 1 at the desk's defaults) and the master
  // ends in the limiter, the safety gain and the ceiling — in the stems and in the mix alike (mixGraph.ts, the one builder)
  const strip = 'gain(1) → pan(0) → gain(1)';
  for (const polished of [false, true]) {
    const master = `comp → gain(${SAFETY_GAIN}) → shaper → out`;
    const bus = `${strip} → ${polished ? `gain(0.8) → comp → lowshelf → highshelf → ${master}` : `gain(0.8) → ${master}`}`;

    it(`renderStems ≡ renderMixdown, MASTER ${polished ? 'ON' : 'OFF'}`, async () => {
      const eng = academy(0.2, tracks());
      eng.masterPolish(polished);
      const mix = await wired(() => eng.renderMixdown(2));
      const stems = await wired(() => eng.renderStems(2));
      expect(mix).toHaveLength(1);
      expect(stems).toHaveLength(2);                                            // kick, hat (fx is muted)
      expect(sortAll(mix)).toHaveLength(2 * 16);                                // 4 kicks + 12 hats a bar
      expect(sortAll(stems)).toEqual(sortAll(mix));
      for (const h of sortAll(stems)) expect(h.endsWith(`→ ${bus}`), h).toBe(true);
      expect(sortAll(stems).filter((h) => h.includes('gain(0.9) → pan(-0.25)'))).toHaveLength(8);   // kick: its own volume + pan
    });

    it(`renderSongStems ≡ renderSong (takes included), MASTER ${polished ? 'ON' : 'OFF'}`, async () => {
      const eng = academy(0.2, tracks());
      eng.masterPolish(polished);
      const bars = [tracks(), tracks().map((t) => ({ ...t, pan: 0 }))];
      const take = { id: '1', buffer: buf(), atBar: 1, gain: 0.7 };
      const len = 2 * STEPS * BASE + 1;
      const song = await wired(() => eng.renderSong(bars, [take], len, [0.2, 0.35]));
      const stems = await wired(() => eng.renderSongStems(bars, [take], len, [0.2, 0.35]));
      expect(stems).toHaveLength(3);                                            // kick, hat, take 1
      expect(sortAll(stems)).toEqual(sortAll(song));
      const takeHit = sortAll(stems).find((h) => h.includes('gain(0.7)'))!;
      expect(takeHit).toBe(`${(STEPS * BASE).toFixed(9)} gain(0.7) → ${bus}`);   // on bar 2's line, through the bus
      // bar 2's off-beat 16th sits at its own section's swing (0.35), bar 1's at 0.2
      expect(sortAll(song).some((h) => h.startsWith(`${(BASE + 0.2 * SWING_DEPTH * BASE).toFixed(9)} `))).toBe(true);
      expect(sortAll(song).some((h) => h.startsWith(`${(17 * BASE + 0.35 * SWING_DEPTH * BASE).toFixed(9)} `))).toBe(true);
    });
  }

  it('the legacy stems are what its live loop plays: gain(volume) → pan → gain(0.8), at the same times', async () => {
    let eng: LegacyAudioEngine | null = null;
    // built inside the recording, so the master's own connect (constructor) is seen too
    const played = await wired(async () => { eng = await legacy(0.5, tracks()); live(eng, 2 * 16); });   // 2 bars of 16 hits
    if (!eng) throw new Error('no engine');
    const e = eng as LegacyAudioEngine;
    const liveCtx = e.context as unknown as FakeAudioContext;
    const firstBar = sortAll(played.filter((r) => r.ctx === liveCtx))
      .map((h) => { const [t, ...rest] = h.split(' '); return `${(Number(t) - LEAD).toFixed(9)} ${rest.join(' ')}`; })
      .filter((h) => Number(h.split(' ')[0]) < STEPS * BASE - 1e-6)
      .sort();
    const stems = sortAll(await wired(() => e.renderStems(1)));
    expect(stems).toHaveLength(16);
    expect(stems).toEqual(firstBar);
    for (const h of stems) expect(h.endsWith('→ gain(0.8) → out'), h).toBe(true);
    e.dispose();
  });
});

describe('sections keep their own swing (SongPanel)', () => {
  it('the song render gets each bar at its section\'s swing, laid out like expandChain', () => {
    const sec = (id: string, swing?: number): SwungSection => ({ id, name: id, tracks: [allOn('kick')], swing });
    const sections = [sec('a', 0), sec('b', 0.4), sec('old')];                 // 'old': saved before P2, no swing
    const chain: SongChain = [{ sectionId: 'a', bars: 2 }, { sectionId: 'gone', bars: 3 }, { sectionId: 'b', bars: 1 }, { sectionId: 'old', bars: 2 }];
    const sw = expandChainSwing(chain, sections, 0.15);
    expect(sw).toEqual([0, 0, 0.4, 0.15, 0.15]);
    expect(sw).toHaveLength(expandChain(chain, sections).length);
    const long: SongChain = Array.from({ length: 16 }, () => ({ sectionId: 'b', bars: 8 }));
    expect(expandChainSwing(long, sections, 0)).toHaveLength(MAX_SONG_BARS);
  });

  it('SongPanel no longer forces 0.15 on a section swap', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'SongPanel.tsx'), 'utf8');
    expect(src).not.toMatch(/setState\(\{[^}]*swing: 0\.15/);
    expect(src).toContain('const sw = sec.swing ?? swingRef.current;');
    expect(src).toContain('engine.renderSong(bars, shots, len, barSwing, sounds)');   // MUSIC-SUITE P5 FIX PASS: + each bar's Flip sounds
  });
});
