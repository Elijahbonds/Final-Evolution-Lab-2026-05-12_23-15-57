// MUSIC-SUITE P1 (2026-09-25): the Academy engine's timing, pinned on the REAL AudioEngine — fakeWebAudio.ts stands in
// for the browser (a clock you set, a 25 ms interval you fire, buffer sources that log their start times), so what
// runs here is the shipped scheduler and the shipped offline render. scripts/music/baseline-sim.ts measured the
// baseline (outbox musicsuite/p1/sim-baseline.json).
//
// Two tests are `it.fails`: they state what phase 2 ("On the beat, and honest") must make true, and they pass today
// BECAUSE the engine still fails them — live swing stretches the bar (AudioEngine.ts:131-136) while the render swings
// on a fixed grid (:214-215, :278), and a PERFORM note opens only once drainPlayhead releases it, up to 25 ms after it
// sounds (:154-160), so a tap dead on the note finds nothing open. When P2 lands, vitest reports those two as passing
// unexpectedly: flip them to plain `it` in that commit. The others hold before and after P2.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeWebAudio, FakeAudioBuffer, FakeOfflineAudioContext, type FakeAudioContext, type FakeWebAudio } from './fakeWebAudio';
import { AudioEngine, type TrackState } from './AudioEngine';
import { PerformSet } from './performSet';

const BPM = 92;
const STEPS = 16;
const TICK = 0.025;          // AudioEngine.ts:23 LOOKAHEAD_MS
const LEAD = 0.05;           // AudioEngine.ts:103 the first step sounds 50 ms after start()
const BASE = 60 / BPM / 4;   // one 16th

let fake: FakeWebAudio;
beforeEach(() => { fake = installFakeWebAudio(); });
afterEach(() => fake.uninstall());

function engine(swing: number): AudioEngine {
  const kick: TrackState = { sampleId: 'kick', pattern: new Array<boolean>(STEPS).fill(true), volume: 0.8, muted: false, pan: 0 };
  const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [kick], swing });
  eng.loadBuffer('kick', 'Kick', new FakeAudioBuffer(1, 4410, 44100) as unknown as AudioBuffer, 'kick');
  return eng;
}
const clock = (eng: AudioEngine): FakeAudioContext => eng.context as unknown as FakeAudioContext;

/** The live loop's first `n` step times (from step 0), by firing the scheduler's interval with the clock stepped 25 ms. */
function live(eng: AudioEngine, n: number): number[] {
  const ctx = clock(eng);
  ctx.currentTime = 0;
  eng.start();
  for (let k = 1; ctx.starts.length < n; k++) { ctx.currentTime = k * TICK; fake.tick(); }
  eng.stop();
  return ctx.starts.slice(0, n).map((s) => s.at - LEAD);
}

async function rendered(eng: AudioEngine, bars: number): Promise<number[]> {
  const before = FakeOfflineAudioContext.created.length;
  await eng.renderMixdown(bars);
  return FakeOfflineAudioContext.created[before].starts.map((s) => s.at).sort((a, b) => a - b);
}

describe('the Academy engine on a fake clock', () => {
  it('renders a bar as exactly 16 steps at any swing, with only the off-beat 16ths delayed', async () => {
    for (const swing of [0, 0.15, 0.4]) {
      const r = await rendered(engine(swing), 2);
      expect(r).toHaveLength(32);
      expect(r[16]).toBeCloseTo(16 * BASE, 9);                   // bar 2's downbeat sits on the grid
      expect(r[2]).toBeCloseTo(2 * BASE, 9);                     // an on-beat 16th sits on the grid
      expect(r[1] - BASE).toBeCloseTo(BASE * swing * 0.5, 9);    // an off-beat 16th is late by base × swing / 2
    }
  });

  it('plays exactly what it renders at swing 0', async () => {
    const eng = engine(0);
    const l = live(eng, 32);
    const r = await rendered(eng, 2);
    l.forEach((t, i) => expect(t).toBeCloseTo(r[i], 9));
  });

  // baseline 2026-09-25: at 15 % the live bar is 3.75 % long (88.7 BPM for 92) and step 62 is 379 ms late by bar 4
  it.fails('P2: the live loop swings where the render does (15 %, 4 bars)', async () => {
    const eng = engine(0.15);
    const l = live(eng, 64);
    const r = await rendered(eng, 4);
    l.forEach((t, i) => expect(Math.abs(t - r[i])).toBeLessThan(0.001));
  });
});

describe('PERFORM on the live engine', () => {
  // baseline 2026-09-25: 25 of 25 timer phases judged a dead-on tap on an isolated note EARLY
  it.fails('P2: a tap dead on an audible note, with nothing else open, is PERFECT', () => {
    const eng = engine(0);
    const ctx = clock(eng);
    const set = new PerformSet({ arena: false });
    eng.onStepAudible = (s, t) => { set.note(s, t, ctx.currentTime); };   // StudioMode.tsx:208-216
    ctx.currentTime = 0;
    eng.start();
    const t16 = LEAD + 16 * BASE;                                         // bar 2's downbeat
    const phase = 0.013;                                                  // the timer and the audio clock are not aligned
    for (let k = 1; phase + k * TICK < t16; k++) {
      ctx.currentTime = phase + k * TICK;
      fake.tick();
      set.tap(ctx.currentTime);                                           // hit each note as it opens: nothing is left open
    }
    ctx.currentTime = t16;
    expect(set.tap(t16)).toBe('PERFECT');
    eng.stop();
  });
});
