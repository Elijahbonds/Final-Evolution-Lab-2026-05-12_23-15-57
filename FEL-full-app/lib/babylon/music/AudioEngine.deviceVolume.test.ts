// MUSIC-SUITE P7 FIX (2026-09-29): "The Academy's MUSIC/SFX/VOICE sliders have zero live effect in the room they are
// shown in" (review finding, confirmed against the code — AudioEngine.ts built its own AudioContext/MixGraph and
// lib/audio/ui/VolumeMixer.tsx only ever moved SoundKit's own bus gains, so nothing this engine played was reachable
// from the sliders StudioMode.tsx mounts right next to the beat). See AudioEngine.ts's own `deviceVol` field comment
// for the fix and why it polls rather than pushes.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeWebAudio, FakeAudioBuffer, FakeOfflineAudioContext, type FakeAudioContext, type FakeWebAudio } from './fakeWebAudio';
import { AudioEngine, type TrackState } from './AudioEngine';
import { buildMixGraph } from './mixGraph';
import { VOLUME_KEY } from '@/lib/audio/volumes';

const BPM = 120, STEPS = 16, TICK = 0.025;
let fake: FakeWebAudio;
beforeEach(() => { fake = installFakeWebAudio(); });
afterEach(() => fake.uninstall());

const clock = (eng: AudioEngine): FakeAudioContext => eng.context as unknown as FakeAudioContext;
const buf = (): AudioBuffer => new FakeAudioBuffer(1, 4410, 44100) as unknown as AudioBuffer;
const row = (sampleId: string, hits: number[]): TrackState =>
  ({ sampleId, pattern: Array.from({ length: STEPS }, (_, i) => hits.includes(i)), volume: 0.8, muted: false, pan: 0 });
/** Advance the fake clock by one scheduler tick (LOOKAHEAD_MS in AudioEngine.ts) and fire it. */
function tick(eng: AudioEngine, n = 1): void {
  const ctx = clock(eng);
  for (let i = 0; i < n; i++) { ctx.currentTime += TICK; fake.tick(); }
}

describe('AudioEngine device volume: the Academy\'s own output now answers the on-device MUSIC slider', () => {
  it('at the default (nothing saved yet) the engine plays at its untouched level — busGain(1, 1) is a no-op', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [] });
    expect(eng.deviceVolume()).toBe(1);
  });

  it('a level saved BEFORE the engine is built is applied immediately, at construction — not only after a drag', () => {
    fake.storage.setItem(VOLUME_KEY, JSON.stringify({ music: 0.3 }));
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [] });
    expect(eng.deviceVolume()).toBeCloseTo(0.3, 10);
  });

  it('splices a device-volume stage between the ceiling and the speakers, without disturbing the meter tap', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [] });
    const ctx = clock(eng);
    const ceiling = eng.mixGraph.ceiling as unknown as { outputs: readonly object[] };
    // the ceiling no longer reaches the speakers directly...
    expect(ceiling.outputs).not.toContain(ctx.destination);
    // ...but it still reaches them, through exactly one new node (this.deviceVol)
    const via = ceiling.outputs.find((o) => (o as { outputs?: readonly object[] }).outputs?.includes(ctx.destination));
    expect(via).toBeTruthy();
    // the meter splitter (mixGraph.ts's own `ceiling.connect(split)`) is untouched — disconnect(dest) took back
    // only the one edge to ctx.destination, never the ceiling's other output
    expect(ceiling.outputs.length).toBeGreaterThanOrEqual(2);
  });

  it('a slider move (another write to the same on-device settings) is picked up on the next scheduler tick, not before', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [row('kick', [0])] });
    eng.loadBuffer('kick', 'Kick', buf(), 'kick');
    expect(eng.deviceVolume()).toBe(1);

    eng.start();                                          // begin() starts the LOOKAHEAD_MS scheduler timer
    fake.storage.setItem(VOLUME_KEY, JSON.stringify({ music: 0.4 }));   // the Academy's own VolumeMixer, mid-play
    expect(eng.deviceVolume()).toBe(1);                   // not yet — nothing has ticked since the write

    tick(eng);                                            // the next 25 ms scheduler tick polls and applies it
    expect(eng.deviceVolume()).toBeCloseTo(0.4, 10);

    eng.stop();
  });

  it('an offline render\'s own graph never gets this stage — an export stays exactly the mix, whatever the device is set to', () => {
    fake.storage.setItem(VOLUME_KEY, JSON.stringify({ music: 0.1 }));   // even a near-silent device setting...
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [] });
    expect(eng.deviceVolume()).toBeCloseTo(0.1, 10);       // ...does reach the LIVE engine...

    const offline = new FakeOfflineAudioContext(2, 4410, 44100);
    const offlineGraph = buildMixGraph(offline as unknown as BaseAudioContext, {});
    const offlineCeiling = offlineGraph.ceiling as unknown as { outputs: readonly object[] };
    // ...but never an offline render's own graph: its ceiling still goes straight to ITS destination, untouched.
    expect(offlineCeiling.outputs).toContain((offline as unknown as { destination: object }).destination);
  });
});
