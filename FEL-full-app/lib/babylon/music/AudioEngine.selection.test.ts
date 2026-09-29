// MUSIC-SUITE P3 (2026-09-25), "Keep my work" — WHAT YOU HEAR IS WHAT YOU SEE, on the REAL AudioEngine (fakeWebAudio.ts is
// the browser: a clock you set, a scheduler interval you fire, buffer sources that log when they would sound).
//
// P1 (outbox musicsuite/BASELINE.md 2b): the engine held 10 tracks while the grid drew 6 rows; flip_0 played 8 times in
// 2 bars and was never drawn; CELL's lead played on the 4-row grid. The room now hands the engine the drawn-rows rule
// (MusicTiers.shownRowIds → AudioEngine.setAudible) and every path that starts a sound reads it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeWebAudio, FakeAudioBuffer, FakeOfflineAudioContext, type FakeAudioContext, type FakeWebAudio } from './fakeWebAudio';
import { AudioEngine, type TrackState } from './AudioEngine';
import { TIERS, shownRowIds } from './MusicTiers';

const BPM = 120;
const STEPS = 16;
const TICK = 0.025;
const LEAD = 0.05;
const BASE = 60 / BPM / 4;

let fake: FakeWebAudio;
beforeEach(() => { fake = installFakeWebAudio(); });
afterEach(() => fake.uninstall());

const row = (sampleId: string, hits: number[]): TrackState => ({
  sampleId, pattern: Array.from({ length: STEPS }, (_, i) => hits.includes(i)), volume: 0.8, muted: false, pan: 0,
});
/** One hit per row, each on its own step, so a start's time says which row sounded. */
const GRID = [row('kick', [0]), row('snare', [4]), row('lead', [3]), row('fx', [7]), row('flip_0', [5]), row('flip_3', [9])];
const STEP_OF: Record<string, number> = { kick: 0, snare: 4, lead: 3, fx: 7, flip_0: 5, flip_3: 9 };

function engine(tracks = GRID): AudioEngine {
  const eng = new AudioEngine({ bpm: BPM, steps: STEPS, tracks, swing: 0 });
  for (const t of tracks) eng.loadBuffer(t.sampleId, t.sampleId, new FakeAudioBuffer(1, 441, 44100) as unknown as AudioBuffer, 'perc');
  return eng;
}
const clock = (eng: AudioEngine): FakeAudioContext => eng.context as unknown as FakeAudioContext;

/** The steps that sounded over `bars` live bars. */
function liveSteps(eng: AudioEngine, bars = 1): number[] {
  const ctx = clock(eng);
  ctx.currentTime = 0;
  eng.start();
  const end = LEAD + bars * STEPS * BASE;
  for (let k = 1; k * TICK < end + 0.2; k++) { ctx.currentTime = k * TICK; fake.tick(); }
  eng.stop();
  return ctx.starts.filter((s) => s.at < end - 1e-9).map((s) => Math.round((s.at - LEAD) / BASE) % STEPS).sort((a, b) => a - b);
}
const stepsFor = (ids: string[]): number[] => ids.map((id) => STEP_OF[id]).sort((a, b) => a - b);

describe('the engine sounds exactly the rows the grid draws', () => {
  it('no selection (a caller that never selects) = every row, as before', () => {
    expect(liveSteps(engine())).toEqual(stepsFor(['kick', 'snare', 'lead', 'fx', 'flip_0', 'flip_3']));
  });

  it('THE GRID: kick + snare and the Flip rows sound; lead and fx (not drawn at 4 rows) do not', () => {
    const eng = engine();
    eng.setAudible(shownRowIds(TIERS.grid));
    expect(liveSteps(eng)).toEqual(stepsFor(['kick', 'snare', 'flip_0', 'flip_3']));
  });

  it('THE STUDIO draws all eight kit rows, and they all sound', () => {
    const eng = engine();
    eng.setAudible(shownRowIds(TIERS.studio));
    expect(liveSteps(eng)).toEqual(stepsFor(['kick', 'snare', 'lead', 'fx', 'flip_0', 'flip_3']));
  });

  it('a muted row stays silent inside the selection', () => {
    const eng = engine([row('kick', [0]), { ...row('snare', [4]), muted: true }]);
    eng.setAudible(shownRowIds(TIERS.grid));
    expect(liveSteps(eng)).toEqual([0]);
  });

  it('a section swapped in on the bar line is filtered in the same instant (song mode)', () => {
    const eng = engine();
    eng.setAudible(shownRowIds(TIERS.grid));
    const section = [row('lead', [1, 2]), row('kick', [8])];
    eng.onBar = (b) => { if (b === 1) eng.setState({ bpm: BPM, steps: STEPS, tracks: section, swing: 0 }); };
    const s = liveSteps(eng, 2);
    expect(s.filter((x) => x === 1 || x === 2)).toEqual([]);   // lead is not drawn at the grid: never heard
    expect(s.filter((x) => x === 8)).toEqual([8]);
  });

  it('PERFORM is offered nothing when the only hits are on rows nobody can see', () => {
    const eng = engine([row('lead', [0, 4, 8])]);
    eng.setAudible(shownRowIds(TIERS.grid));
    const live: boolean[] = [];
    eng.onStepScheduled = (_s, _t, sound) => { live.push(sound.gridLive || sound.hits > 0); };
    liveSteps(eng);
    expect(live.length).toBeGreaterThan(0);
    expect(live.every((v) => !v)).toBe(true);
  });
});

describe('every render hears the same rows', () => {
  const rendered = async (fn: (e: AudioEngine) => Promise<unknown>, eng: AudioEngine): Promise<number[][]> => {
    const before = FakeOfflineAudioContext.created.length;
    await fn(eng);
    return FakeOfflineAudioContext.created.slice(before).map((c) => c.starts.map((s) => Math.round(s.at / BASE) % STEPS).sort((a, b) => a - b));
  };

  it('the mixdown (PUBLISH) leaves out the rows the grid does not draw', async () => {
    const eng = engine();
    eng.setAudible(shownRowIds(TIERS.grid));
    const [mix] = await rendered((e) => e.renderMixdown(1), eng);
    expect(mix).toEqual(stepsFor(['kick', 'snare', 'flip_0', 'flip_3']));
  });

  it('renderMixdown(bars, tracks) renders the list it is given (the working grid while song mode plays a section)', async () => {
    const eng = engine();
    eng.setAudible(shownRowIds(TIERS.grid));
    eng.setState({ bpm: BPM, steps: STEPS, tracks: [row('kick', [0])], swing: 0 });   // what is playing
    const [mix] = await rendered((e) => e.renderMixdown(1, [row('snare', [4]), row('lead', [3])]), eng);
    expect(mix).toEqual([4]);
  });

  it('stems: one per HEARD row — no stem for a row the player never saw', async () => {
    const eng = engine();
    eng.setAudible(shownRowIds(TIERS.grid));
    const stems = await eng.renderStems(1);
    expect(stems).toHaveLength(4);
    const song = await eng.renderSongStems([GRID], [], 3);
    expect(song).toHaveLength(4);
    expect(song.map((s) => s.name).sort()).toEqual(['flip_0', 'flip_3', 'kick', 'snare']);
  });

  it('the song render too', async () => {
    const eng = engine();
    eng.setAudible(shownRowIds(TIERS.chain));
    const [song] = await rendered((e) => e.renderSong([GRID], [], 3), eng);
    expect(song).toEqual(stepsFor(['kick', 'snare', 'flip_0', 'flip_3']));
  });

  it('the selection is readable (the dev probe reports it) and clearable', () => {
    const eng = engine();
    expect(eng.audibleIds).toBeNull();
    eng.setAudible(['kick']);
    expect([...eng.audibleIds!]).toEqual(['kick']);
    expect(eng.hears({ sampleId: 'snare', muted: false })).toBe(false);
    eng.setAudible(null);
    expect(eng.hears({ sampleId: 'snare', muted: false })).toBe(true);
  });
});

// MUSIC-SUITE P3 FIX PASS (2026-09-25): PUBLISH in song mode. renderMixdown placed the working grid with the PLAYING
// state's swing — the section's (SongPanel.playSection sets it) — while the record said the project's. Measured by the
// review on this engine: a hat on step 1 at 120 BPM, 0.1250 s with song mode off, 0.1500 s under a 40 % section.
describe('a publish renders at the swing it is given, not the playing section\'s', () => {
  const hatStep1 = [row('hat', [1])];
  const firstStart = async (eng: AudioEngine, fn: () => Promise<unknown>): Promise<number> => {
    const before = FakeOfflineAudioContext.created.length;
    await fn();
    return FakeOfflineAudioContext.created[before].starts[0].at;
  };

  it('with a 0.4-swing section in the engine\'s state, renderMixdown(1, grid, 0) puts step 1 at 1 × BASE', async () => {
    const eng = engine(hatStep1);
    eng.setState({ bpm: BPM, steps: STEPS, tracks: [row('kick', [0])], swing: 0.4 });   // song mode playing a section
    expect(await firstStart(eng, () => eng.renderMixdown(1, hatStep1, 0))).toBeCloseTo(1 * BASE, 6);
    // the old call (no swing given) is the section's — which is exactly what PUBLISH must not use
    expect(await firstStart(eng, () => eng.renderMixdown(1, hatStep1))).toBeGreaterThan(1 * BASE + 0.01);
  });
});

describe('sounds can be forgotten (a project opened; a chop that failed to load)', () => {
  it('unloadSample and dropSamples remove sounds; a row with no sound starts nothing', () => {
    const eng = engine([row('kick', [0]), row('flip_0', [5]), row('flip_3', [9])]);
    eng.unloadSample('flip_3');
    expect(eng.hasSample('flip_3')).toBe(false);
    expect(eng.dropSamples((id) => id.startsWith('flip_'))).toEqual(['flip_0']);
    expect(liveSteps(eng)).toEqual([0]);
  });
});

// MUSIC-SUITE P5 FIX PASS (2026-09-25): song mode swaps a section's own Flip chops into the ENGINE under the working rows'
// ids, and every render read the engine's sounds — PUBLISH rendered the grid with the last-swapped section's chop, and
// RENDER SONG / STEMS gave every bar that one section's. A render now takes its Flip sounds explicitly (RenderSounds).
describe('a render plays the sounds it is given, not whatever song mode swapped in last', () => {
  const buf = (n: number): AudioBuffer => new FakeAudioBuffer(1, n, 44100) as unknown as AudioBuffer;
  const played = (c: FakeOfflineAudioContext): unknown[] => c.starts.map((s) => s.buffer);
  const swapped = buf(111), gridChop = buf(222), verseChop = buf(333), hookChop = buf(444);

  it('PUBLISH: the working grid\'s chop, although the engine holds a section\'s under the same id', async () => {
    const eng = engine([row('kick', [0]), row('flip_0', [5])]);
    eng.loadBuffer('flip_0', 'FLIP 1', swapped, 'melody');   // what swapSectionChops left in the engine
    const before = FakeOfflineAudioContext.created.length;
    await eng.renderMixdown(1, [row('kick', [0]), row('flip_0', [5])], 0, new Map([['flip_0', gridChop]]));
    const bufs = played(FakeOfflineAudioContext.created[before]);
    expect(bufs).toContain(gridChop);
    expect(bufs).not.toContain(swapped);
    expect(bufs).toHaveLength(2);                              // the kick still plays the engine's sound
  });

  it('a row given as null is silent in that render (its chop is not on this device) — never the engine\'s', async () => {
    const eng = engine([row('flip_0', [5])]);
    const before = FakeOfflineAudioContext.created.length;
    await eng.renderMixdown(1, [row('flip_0', [5])], 0, new Map([['flip_0', null]]));
    expect(FakeOfflineAudioContext.created[before].starts).toHaveLength(0);
  });

  it('RENDER SONG: each bar plays its own section\'s chop; STEMS too (one stem for the row, both chops in it)', async () => {
    const eng = engine([row('flip_0', [5])]);
    eng.loadBuffer('flip_0', 'FLIP 1', swapped, 'melody');
    const bars = [[row('flip_0', [5])], [row('flip_0', [5])]];
    const sounds = [new Map([['flip_0', verseChop]]), new Map([['flip_0', hookChop]])];
    const before = FakeOfflineAudioContext.created.length;
    await eng.renderSong(bars, [], 4, [0, 0], sounds);
    expect(played(FakeOfflineAudioContext.created[before])).toEqual([verseChop, hookChop]);
    const mid = FakeOfflineAudioContext.created.length;
    const stems = await eng.renderSongStems(bars, [], 4, [0, 0], sounds);
    expect(stems.map((s) => s.name)).toEqual(['FLIP 1']);
    expect(played(FakeOfflineAudioContext.created[mid])).toEqual([verseChop, hookChop]);
  });

  it('with no sounds given, a render is what it was (the engine\'s)', async () => {
    const eng = engine([row('flip_0', [5])]);
    eng.loadBuffer('flip_0', 'FLIP 1', swapped, 'melody');
    const before = FakeOfflineAudioContext.created.length;
    await eng.renderMixdown(1, [row('flip_0', [5])], 0);
    expect(played(FakeOfflineAudioContext.created[before])).toEqual([swapped]);
  });
});
