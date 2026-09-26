// MUSIC-SUITE P1 (2026-09-25): the Academy engine's timing, pinned on the REAL AudioEngine — fakeWebAudio.ts stands in
// for the browser (a clock you set, a 25 ms interval you fire, buffer sources that log their start times), so what
// runs here is the shipped scheduler and the shipped offline render. scripts/music/baseline-sim.ts measured the
// baseline (outbox musicsuite/p1/sim-baseline.json).
//
// Two tests were `it.fails`: they stated what phase 2 ("On the beat, and honest") must make true, and passed at P1
// BECAUSE the engine still failed them — live swing stretched the bar (AudioEngine.ts:131-136) while the render swung
// on a fixed grid (:214-215, :278), and a PERFORM note opened only once drainPlayhead released it, up to 25 ms after it
// sounded (:154-160), so a tap dead on the note found nothing open. The others hold before and after P2.
//
// MUSIC-SUITE P2 (2026-09-25): both are plain `it` now. Live scheduling and every render place steps with
// stepTime.ts gridStepTime (the fuller golden test, 8 bars at 0 / 15 / 40 %, lives in stepTime.test.ts), and PERFORM is
// offered each note when it is SCHEDULED (AudioEngine.onStepScheduled), which is how StudioMode wires it now — the
// PERFORM test below wires the engine the same way (it wired onStepAudible, StudioMode's old hook, at P1).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeWebAudio, FakeAudioBuffer, FakeOfflineAudioContext, type FakeAudioContext, type FakeWebAudio } from './fakeWebAudio';
import { AudioEngine, type TrackState } from './AudioEngine';
import { PerformSet, performNoteAt } from './performSet';

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
  it('P2: the live loop swings where the render does (15 %, 4 bars)', async () => {
    const eng = engine(0.15);
    const l = live(eng, 64);
    const r = await rendered(eng, 4);
    l.forEach((t, i) => expect(Math.abs(t - r[i])).toBeLessThan(0.001));
  });
});

describe('PERFORM on the live engine', () => {
  // baseline 2026-09-25: 25 of 25 timer phases judged a dead-on tap on an isolated note EARLY
  it('P2: a tap dead on an audible note, with nothing else open, is PERFECT', () => {
    const eng = engine(0);
    const ctx = clock(eng);
    const set = new PerformSet({ arena: false });
    const offered: number[] = [];
    eng.onStepScheduled = (s, t) => { set.note(s, t, ctx.currentTime); offered.push(t); };   // StudioMode's hook since P2
    ctx.currentTime = 0;
    eng.start();
    const t16 = LEAD + 16 * BASE;                                         // bar 2's downbeat
    const phase = 0.013;                                                  // the timer and the audio clock are not aligned
    let hit = 0;
    for (let k = 1; phase + k * TICK < t16; k++) {
      ctx.currentTime = phase + k * TICK;
      fake.tick();
      // hit each earlier note once it has sounded: nothing but bar 2's downbeat is left open (P2: notes are offered up
      // to 100 ms early, so tapping on every tick — the P1 version of this loop — would take bar 2's downbeat early)
      while (hit < offered.length && offered[hit] < t16 - 1e-9 && offered[hit] <= ctx.currentTime) { set.tap(ctx.currentTime); hit++; }
    }
    expect(hit).toBe(16);
    ctx.currentTime = t16;
    expect(set.tap(t16)).toBe('PERFECT');
    eng.stop();
  });
});

// MUSIC-SUITE P2 FIX PASS (2026-09-25): THE LIVE SCHEDULER NEVER STARTS A STEP IN THE PAST. scheduler() scheduled every
// step from the cursor to now + 0.1 s, and src.start(pastTime) plays at once: after a main-thread stall (or a throttled
// background timer) every missed step sounded in one burst, and PERFORM was handed notes already late that expired as
// MISSes nobody could hit. The Cypher's schedulers had plan16ths for this; the Academy and the legacy maker did not.
describe('a stall: missed steps are passed over, not burst', () => {
  it('the Academy engine starts nothing in the past, still moves the playhead, and tells PERFORM they were rests', () => {
    const eng = engine(0);
    const ctx = clock(eng);
    const seen: { t: number; hits: number; skipped: boolean }[] = [];
    eng.onStepScheduled = (_s, t, sound) => { seen.push({ t, hits: sound.hits, skipped: !!sound.skipped }); };
    const heads: number[] = [];
    eng.onStep = (s) => heads.push(s);
    ctx.currentTime = 0;
    eng.start();
    for (let k = 1; k <= 8; k++) { ctx.currentTime = k * TICK; fake.tick(); }
    const before = ctx.starts.length, seenBefore = seen.length;
    ctx.currentTime += 0.5;                                               // the main thread stalls half a second
    fake.tick();
    const late = seen.slice(seenBefore).filter((x) => x.t < ctx.currentTime - 0.01);
    expect(late.length).toBeGreaterThanOrEqual(2);                        // ~3 steps at 92 BPM went by in the stall
    expect(late.every((x) => x.skipped && x.hits === 0)).toBe(true);
    expect(ctx.starts.slice(before).every((st) => st.at >= ctx.currentTime - 0.01)).toBe(true);   // no burst
    expect(eng.skippedSteps).toBe(late.length);
    expect(heads.length).toBe(seen.filter((x) => x.t <= ctx.currentTime).length);   // the playhead caught up over them
    // and PERFORM offers them as rests: the grid is all kicks, yet nothing late becomes a note that expires unhit
    expect(late.every((x) => !performNoteAt({ hits: x.hits, gridLive: true }))).toBe(true);
    eng.stop();
  });

  it('the legacy /create maker does the same', async () => {
    const { AudioEngine: Legacy } = await import('@/lib/modes/music/audio-engine');
    const kick = { sampleId: 'kick', pattern: new Array<boolean>(STEPS).fill(true), volume: 0.8, muted: false, pan: 0 };
    const eng = new Legacy({ bpm: BPM, steps: STEPS, tracks: [kick], swing: 0 });
    await eng.loadSample('kick', 'Kick', 'data:,', 'kick').catch(() => undefined);
    const ctx = eng.context as unknown as FakeAudioContext;
    ctx.currentTime = 0;
    eng.start();
    for (let k = 1; k <= 8; k++) { ctx.currentTime = k * TICK; fake.tick(); }
    const before = ctx.starts.length;
    ctx.currentTime += 0.5;
    fake.tick();
    expect(ctx.starts.slice(before).every((st) => st.at >= ctx.currentTime - 0.01)).toBe(true);
    expect(eng.skippedSteps).toBeGreaterThanOrEqual(2);
    eng.stop();
  });
});
