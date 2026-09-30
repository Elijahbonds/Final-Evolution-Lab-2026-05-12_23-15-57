// MUSIC-SUITE P10 (2026-09-29): PERFORM's lanes draw only rows the engine would start (P6's open item: "a Flip row whose
// chop failed to load still draws notes the judge never offers"). Checked on the real AudioEngine over fakeWebAudio: what
// the lanes DRAW for a bar equals what the judge is OFFERED (the lanes of StepSound.rows, through the same 8th cap).
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeAudioBuffer, installFakeWebAudio, type FakeAudioContext, type FakeWebAudio } from './fakeWebAudio';
import { AudioEngine, type TrackState } from './AudioEngine';
import { performBarCells, performCapLanes, performDrawnRows, performLanesOf, type PerformLane } from './performSet';

const BPM = 120, STEPS = 16, TICK = 0.025, BAR = STEPS * (60 / BPM / 4);
let fake: FakeWebAudio;
beforeEach(() => { fake = installFakeWebAudio(); });
afterEach(() => fake.uninstall());
const row = (id: string, hits: number[]): TrackState => ({ sampleId: id, pattern: Array.from({ length: STEPS }, (_, i) => hits.includes(i)), volume: 0.8, muted: false, pan: 0 });
const buf = (): AudioBuffer => new FakeAudioBuffer(1, 441, 44100) as unknown as AudioBuffer;

/** What the judge is offered over one bar: each step's started rows → lanes, through the 8th cap (PerformSet.step's rule). */
function offeredCells(eng: AudioEngine): boolean[][] {
  const cells = [0, 1, 2, 3].map(() => new Array<boolean>(STEPS).fill(false));
  let prev: { stepInBar: number; lanes: readonly PerformLane[] } | null = null;
  eng.onStepScheduled = (s, _t, sound) => {
    const lanes = performCapLanes(s, performLanesOf(sound.rows ?? []), prev);
    for (const l of lanes) cells[l][s] = true;
    prev = { stepInBar: s, lanes };
  };
  const ctx = eng.context as unknown as FakeAudioContext;
  ctx.currentTime = 0; eng.start();
  for (let k = 1; k * TICK <= BAR; k++) { ctx.currentTime = k * TICK; fake.tick(); }
  eng.stop();
  return cells;
}

describe('performDrawnRows: the lanes draw what the engine starts', () => {
  const tracks = [row('kick', [0, 8]), row('snare', [4, 12]), row('flip_0', [2, 6, 10, 14])];

  it('a Flip row with no sound (its chop failed to load): the judge is offered none of its notes, and now the lanes draw none', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks });
    eng.loadBuffer('kick', 'Kick', buf(), 'kick');
    eng.loadBuffer('snare', 'Snare', buf(), 'snare');
    // flip_0: never loaded (a failed chop leaves its row silent — StudioMode swapFailed → unloadSample)
    const offered = offeredCells(eng);
    expect(offered[3].some(Boolean)).toBe(false);
    const before = performBarCells((s) => tracks.filter((t) => t.pattern[s]).map((t) => t.sampleId));
    expect(before[3].filter(Boolean).length).toBe(4);                   // the old picture: 4 notes nobody could score
    const drawn = performDrawnRows(tracks, () => true, (id) => eng.hasSample(id));
    const now = performBarCells((s) => drawn.filter((t) => t.pattern[s]).map((t) => t.sampleId));
    expect(now).toEqual(offered);
    eng.dispose();
  });

  it('loaded, it is drawn and offered alike; a row the desk mutes is neither', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks });
    for (const t of tracks) eng.loadBuffer(t.sampleId, t.sampleId, buf(), 'drums');
    eng.setMixer({ master: 1, channels: { snare: { mute: true } } });
    const offered = offeredCells(eng);
    const gate = (id: string) => id !== 'snare';
    const drawn = performDrawnRows(tracks, gate, (id) => eng.hasSample(id));
    expect(performBarCells((s) => drawn.filter((t) => t.pattern[s]).map((t) => t.sampleId))).toEqual(offered);
    expect(offered[3].filter(Boolean).length).toBe(4);
    eng.dispose();
  });

  it('StudioMode draws its free-play lanes through it, with the engine\'s own hasSample', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'StudioMode.tsx'), 'utf8');
    expect(src).toContain('const sounding = performDrawnRows(drawn, (id) => gateOpen(deskHeard, id), (id) => !eng || eng.hasSample(id));');
  });
});
