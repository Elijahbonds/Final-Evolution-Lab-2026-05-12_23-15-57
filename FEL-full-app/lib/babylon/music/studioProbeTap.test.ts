// MUSIC-SUITE P10 (2026-09-29): the /dev/music probe hook reads what the REAL AudioEngine started (studioProbeTap), not a
// copy of half its skips. Driven on the real engine over lib/babylon/music/fakeWebAudio.ts (a clock you set, sources
// that log their start): the rows the hook reports must be exactly the sources the engine started, with the desk's
// mute and solo, and the note each pitched row played.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeAudioBuffer, installFakeWebAudio, type FakeAudioContext, type FakeWebAudio } from './fakeWebAudio';
import { AudioEngine, type StepSound, type TrackState } from './AudioEngine';
import { tapSchedule, type ScheduledTap } from './studioProbeTap';

const BPM = 120, STEPS = 16, TICK = 0.025, BASE = 60 / BPM / 4, BAR = STEPS * BASE;
let fake: FakeWebAudio;
beforeEach(() => { fake = installFakeWebAudio(); });
afterEach(() => fake.uninstall());

const buf = (): AudioBuffer => new FakeAudioBuffer(1, 4410, 44100) as unknown as AudioBuffer;
const row = (sampleId: string, hits: number[], extra: Partial<TrackState> = {}): TrackState => ({
  sampleId, pattern: Array.from({ length: STEPS }, (_, i) => hits.includes(i)), volume: 0.8, muted: false, pan: 0, ...extra,
});
type Guts = { scheduleStep(step: number, time: number): void; state: { tracks: TrackState[] } };

/** The engine with its scheduleStep tapped the way app/dev/music/loader.tsx taps it; returns every tap. */
function tapped(eng: AudioEngine): { taps: ScheduledTap[]; room: [number, StepSound][] } {
  const taps: ScheduledTap[] = [];
  const room: [number, StepSound][] = [];
  eng.onStepScheduled = (s, _t, sound) => { room.push([s, sound]); };   // the room's own callback
  const g = eng as unknown as Guts;
  const orig = g.scheduleStep.bind(eng);
  g.scheduleStep = (step, time) => { taps.push(tapSchedule(eng, g.state.tracks, step, time, () => orig(step, time))); };
  return { taps, room };
}
function play(eng: AudioEngine, until: number): void {
  const ctx = eng.context as unknown as FakeAudioContext;
  ctx.currentTime = 0;
  eng.start();
  for (let k = 1; k * TICK <= until; k++) { ctx.currentTime = k * TICK; fake.tick(); }
  eng.stop();
}
/** What the pre-P10 hook counted (loader.tsx:118 then): muted flag, a hit, a buffer, the selection — no desk. */
function oldCount(tracks: readonly TrackState[], step: number, loaded: Set<string>, selection: Set<string> | null): string[] {
  return tracks.filter((t) => !t.muted && t.pattern[step] && loaded.has(t.sampleId) && (!selection || selection.has(t.sampleId))).map((t) => t.sampleId);
}

describe('the probe tap reads the engine, not a copy of it', () => {
  it('a row MUTED ON THE DESK is never counted (the old hook counted it); every counted row is a source the engine started', () => {
    const tracks = [row('kick', [0, 8]), row('snare', [4, 12]), row('hat', [0, 2, 4, 6, 8, 10, 12, 14])];
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks });
    for (const t of tracks) eng.loadBuffer(t.sampleId, t.sampleId, buf(), 'drums');
    eng.setMixer({ master: 1, channels: { snare: { mute: true } } });
    const { taps, room } = tapped(eng);
    play(eng, BAR + 0.1);
    const counted = taps.flatMap((t) => t.rows);
    expect(counted).not.toContain('snare');
    expect(counted.filter((r) => r === 'kick').length).toBeGreaterThanOrEqual(2);
    // the old rule would have counted the snare on steps 4 and 12
    expect(taps.some((t) => oldCount(tracks, t.step, new Set(['kick', 'snare', 'hat']), null).includes('snare'))).toBe(true);
    // one counted row per source the engine started (the fake logs each start)
    const started = (eng.context as unknown as FakeAudioContext).starts.length;
    expect(counted.length).toBe(started);
    // the room's own onStepScheduled still saw every step, with the same report
    expect(room.map(([s]) => s)).toEqual(taps.map((t) => t.step));
    expect(room.map(([, sound]) => [...(sound.rows ?? [])])).toEqual(taps.map((t) => t.rows));
    expect(eng.onStepScheduled).not.toBeNull();   // put back after every call
    eng.dispose();
  });

  it('SOLO: only the soloed row is counted', () => {
    const tracks = [row('kick', [0, 4, 8, 12]), row('snare', [4, 12])];
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks });
    for (const t of tracks) eng.loadBuffer(t.sampleId, t.sampleId, buf(), 'drums');
    eng.setMixer({ master: 1, channels: { snare: { solo: true } } });
    const { taps } = tapped(eng);
    play(eng, BAR + 0.1);
    expect([...new Set(taps.flatMap((t) => t.rows))]).toEqual(['snare']);
    eng.dispose();
  });

  it('a pitched row reports the note each step played; a drum reports null', () => {
    const notes = [33, 33, 33, 33, 36, 36, 36, 36, 40, 40, 40, 40, 45, 45, 45, 45];
    const tracks = [row('bass', [0, 4, 8, 12], { notes }), row('kick', [0])];
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks });
    eng.loadBuffer('bass', 'Bass', buf(), 'bass', 33);
    eng.loadBuffer('kick', 'Kick', buf(), 'kick');
    const { taps } = tapped(eng);
    play(eng, BAR - BASE / 2);
    const bass = taps.filter((t) => t.rows.includes('bass')).map((t) => [t.step, t.notes.bass]);
    expect(bass).toEqual([[0, 33], [4, 36], [8, 40], [12, 45]]);
    expect(taps.find((t) => t.rows.includes('kick'))!.notes.kick).toBeNull();
    eng.dispose();
  });

  it('a stalled step (already past when scheduled) starts nothing and is reported skipped', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [row('kick', [0, 1, 2, 3])] });
    eng.loadBuffer('kick', 'Kick', buf(), 'kick');
    const { taps } = tapped(eng);
    const ctx = eng.context as unknown as FakeAudioContext;
    ctx.currentTime = 0;
    eng.start();
    ctx.currentTime = 0.4;           // the main thread stalled 400 ms: steps 0.. are behind the clock
    fake.tick();
    eng.stop();
    const first = taps[0];
    expect(first.skipped).toBe(true);
    expect(first.rows).toEqual([]);
    eng.dispose();
  });

  it('loader.tsx uses the tap and the engine\'s own hears() — the copied skips are gone', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../app/dev/music/loader.tsx'), 'utf8');
    expect(src).toContain('tapSchedule(this, this.state.tracks, step, time, () => origStep.call(this, step, time))');
    expect(src).toContain('heard: live!.hears(t)');
    expect(src).not.toContain('the same skips scheduleStep makes');
  });
});
