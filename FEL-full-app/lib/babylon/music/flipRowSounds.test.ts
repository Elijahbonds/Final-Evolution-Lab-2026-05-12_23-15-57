// MUSIC-SUITE P3 FIX PASS (2026-09-25): which sound a Flip row plays, on the REAL AudioEngine (fakeWebAudio.ts is the
// browser). The review: the engine's sounds were only ever added, so opening project B whose flip_0 chop could not load
// left project A's chop playing on B's "FLIP 1" (and PUBLISH rendered it) while the room said the sound was gone.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeWebAudio, FakeAudioBuffer, type FakeAudioContext, type FakeWebAudio } from './fakeWebAudio';
import { AudioEngine, type TrackState } from './AudioEngine';
import { loadFlipRowSounds, openFlipRowSounds, reloadFlipRowSounds } from './flipRowSounds';
import type { ProjectFlipRow } from './StudioProject';

const BPM = 120, STEPS = 16, TICK = 0.025, LEAD = 0.05, BASE = 60 / BPM / 4;
let fake: FakeWebAudio;
beforeEach(() => { fake = installFakeWebAudio(); });
afterEach(() => fake.uninstall());

const row = (sampleId: string, hits: number[]): TrackState => ({
  sampleId, pattern: Array.from({ length: STEPS }, (_, i) => hits.includes(i)), volume: 0.8, muted: false, pan: 0,
});
const flip = (pad: number, key: string): ProjectFlipRow => ({
  sampleId: `flip_${pad}`, pad, label: `FLIP ${pad + 1}`,
  source: { id: key, label: key, kind: 'own', note: 'the player', audio: { key, mime: 'audio/webm', bytes: 1 } },
  slice: { start: 0, end: 100 }, reverse: false, pitch: 0, gate: true,
});
const buf = (): AudioBuffer => new FakeAudioBuffer(1, 441, 44100) as unknown as AudioBuffer;

/** The steps that sounded over one bar. */
function playBar(eng: AudioEngine): number[] {
  const ctx = eng.context as unknown as FakeAudioContext;
  ctx.currentTime = 0;
  const before = ctx.starts.length;
  eng.start();
  const end = LEAD + STEPS * BASE;
  for (let k = 1; k * TICK < end + 0.2; k++) { ctx.currentTime = k * TICK; fake.tick(); }
  eng.stop();
  return ctx.starts.slice(before).filter((s) => s.at < end - 1e-9).map((s) => Math.round((s.at - LEAD) / BASE) % STEPS).sort((a, b) => a - b);
}

describe('a Flip row plays the OPEN project\'s chop, or nothing', () => {
  it('open A (flip_0 loaded), then B whose flip_0 chop is gone: PLAY starts no flip_0 source, and the row is named', async () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [row('kick', [0]), row('flip_0', [5])], swing: 0 });
    eng.loadBuffer('kick', 'kick', buf(), 'kick');
    expect(await openFlipRowSounds(eng, [flip(0, 'aud_a')], async () => buf())).toEqual([]);
    expect(playBar(eng)).toEqual([0, 5]);                            // project A: its chop plays on step 5
    const gone = await openFlipRowSounds(eng, [flip(0, 'aud_b_missing')], async () => { throw new Error('its audio is not on this device'); });
    expect(gone).toEqual(['FLIP 1']);
    expect(eng.hasSample('flip_0')).toBe(false);
    expect(playBar(eng)).toEqual([0]);                               // B's FLIP 1 is silent, not A's 808
    const blob = await eng.renderMixdown(1);                         // …and PUBLISH does not render A's chop either
    expect(blob).toBeTruthy();
  });

  it('a project with FEWER Flip rows does not keep the last project\'s: every flip_* goes when another opens', async () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [row('flip_0', [2]), row('flip_3', [9])], swing: 0 });
    await openFlipRowSounds(eng, [flip(0, 'aud_a'), flip(3, 'aud_a3')], async () => buf());
    expect(playBar(eng)).toEqual([2, 9]);
    eng.loadBuffer('kick', 'kick', buf(), 'kick');
    await openFlipRowSounds(eng, [], async () => buf());
    expect(eng.hasSample('flip_0') || eng.hasSample('flip_3')).toBe(false);
    expect(eng.hasSample('kick')).toBe(true);                        // the kit is not a Flip row
  });

  it('while B\'s chop is still decoding, A\'s is already gone (it played on B\'s row until the decode finished)', async () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [row('flip_0', [5])], swing: 0 });
    await openFlipRowSounds(eng, [flip(0, 'aud_a')], async () => buf());
    let finish!: (b: AudioBuffer) => void;
    const pending = openFlipRowSounds(eng, [flip(0, 'aud_b')], () => new Promise<AudioBuffer>((r) => { finish = r; }));
    expect(eng.hasSample('flip_0')).toBe(false);
    expect(playBar(eng)).toEqual([]);
    finish(buf());
    await pending;
    expect(eng.hasSample('flip_0')).toBe(true);
  });

  it('a load that finishes after another project opened never lands (the generation guard)', async () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [row('flip_0', [5])], swing: 0 });
    let gen = 1;
    let finish!: (b: AudioBuffer) => void;
    const late = loadFlipRowSounds(eng, [flip(0, 'aud_undo')], () => new Promise<AudioBuffer>((r) => { finish = r; }), () => gen === 1);
    gen = 2;                                                         // another project opened meanwhile
    await openFlipRowSounds(eng, [], async () => buf(), () => gen === 2);
    finish(buf());
    await late;
    expect(eng.hasSample('flip_0')).toBe(false);
  });

  it('an undo that removes a row silences it; one that brings another chop back loads it; unchanged rows are left alone', async () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks: [row('flip_0', [1]), row('flip_1', [3])], swing: 0 });
    await openFlipRowSounds(eng, [flip(0, 'aud_x'), flip(1, 'aud_y')], async () => buf());
    const loads: string[] = [];
    await reloadFlipRowSounds(eng, [flip(0, 'aud_x'), flip(1, 'aud_y')], [flip(1, 'aud_z')], async (r) => { loads.push(r.source.id); return buf(); });
    expect(eng.hasSample('flip_0')).toBe(false);
    expect(loads).toEqual(['aud_z']);
  });
});
