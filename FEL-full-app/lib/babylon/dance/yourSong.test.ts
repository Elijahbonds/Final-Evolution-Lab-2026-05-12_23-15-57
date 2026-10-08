// yourSong.test.ts — MUSIC-SUITE P7 ("your beat", 2026-09-29).
//
// Three layers, tested at the level each one earns:
//   1. THE FILL RULE (partOf / partsPresent / missingParts / applyFill) is pure — no audio at all — so it is tested
//      directly, on plain TrackState data, the same way DanceExport.test.ts tests grooveOf.
//   2. THE OFFLINE RENDER (renderYourSongParts) needs Web Audio, so it runs on fakeWebAudio.ts — the same
//      schedule-only stand-in AudioEngine.p4.test.ts uses. It cannot prove two renders sound alike (fakeWebAudio
//      renders silence; a real sample-for-sample compare needs a headless browser, out of a vitest node run's
//      reach) — what it CAN prove, and does, is that the render schedules exactly the hits a bar's own pattern says
//      it should, at the right time, rate and channel, which is the same guarantee AudioEngine.p4.test.ts's own
//      "live and rendered" tests give the Academy's other renders.
//   3. THE LIVE BAND (YourSongBand) is tested on fakeWebAudio too, for its join/drop progression and its scheduling
//      (a part's buffer starts once, at the right audio time and buffer offset; a pause stops it; a resume replaces
//      it from the right offset).

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { FakeAudioBuffer, FakeBaseAudioContext, FakeOfflineAudioContext, installFakeWebAudio, type FakeWebAudio, type FakeAudioParam } from '../music/fakeWebAudio';
import type { TrackState } from '../music/AudioEngine';
import { songStepTime } from '../music/stepTime';
import { DEFAULT_KEY, defaultRowNote, type SongKey } from '../music/scales';
import type { ExportedTake, YourSongExport } from '../music/DanceExport';
import {
  applyFill, CLICK_FADE_SEC, FEL_FILL_VOLUME, FILLABLE_PARTS, missingParts, partOf, PART_ORDER, partsPresent, renderYourSongParts,
  YourSongBand, YOUR_SONG_DROP_STREAK, YOUR_SONG_JOIN_STREAK, type PartStem, type SongPartId, type YourSongRenderDeps,
} from './yourSong';

const STEPS = 16;
const row = (sampleId: string, hits: number[], extra: Partial<TrackState> = {}): TrackState => ({
  sampleId, pattern: Array.from({ length: STEPS }, (_, i) => hits.includes(i)), volume: 0.8, muted: false, pan: 0, ...extra,
});

// ── 1. WHICH PART A ROW IS ──────────────────────────────────────────────────────────────────────────────────────────

describe('a grid row knows which of the six song parts it is', () => {
  it('kick/snare/hat/open/clap/bass/lead map onto their part; anything else (a Flip row, a mystery id) does not', () => {
    expect(partOf('kick')).toBe('kick');
    expect(partOf('snare')).toBe('snare');
    expect(partOf('hat')).toBe('hats');
    expect(partOf('open')).toBe('hats');
    expect(partOf('clap')).toBe('perc');
    expect(partOf('bass')).toBe('bass');
    expect(partOf('lead')).toBe('lead');
    expect(partOf('flip_0')).toBeNull();
    expect(partOf('keys')).toBeNull();
    expect(partOf('')).toBeNull();
  });

  it('every fillable part appears once in PART_ORDER, foundation-first, takes last', () => {
    expect(PART_ORDER).toEqual([...FILLABLE_PARTS, 'takes']);
    expect(new Set(PART_ORDER).size).toBe(PART_ORDER.length);
  });
});

// ── which parts a song actually plays ──────────────────────────────────────────────────────────────────────────────

describe('partsPresent / missingParts', () => {
  it('a part with a real hit is present; a muted or silent-volume row is not (the same test grooveOf applies)', () => {
    const bars: TrackState[][] = [[row('kick', [0, 8]), row('snare', [], { muted: false }), row('bass', [4], { muted: true }), row('lead', [0], { volume: 0 })]];
    const present = partsPresent(bars);
    expect(present.has('kick')).toBe(true);
    expect(present.has('snare')).toBe(false);   // no hits in its pattern at all
    expect(present.has('bass')).toBe(false);    // muted
    expect(present.has('lead')).toBe(false);    // volume 0
    expect([...missingParts(present)].sort()).toEqual(['bass', 'hats', 'lead', 'perc', 'snare'].sort());
  });

  it('present across ANY bar, not just the first (a section that only hits its snare in bar 2 still has one)', () => {
    const bars: TrackState[][] = [[row('kick', [0])], [row('kick', []), row('snare', [4])]];
    expect(partsPresent(bars).has('snare')).toBe(true);
  });

  it('an empty song is missing all six', () => {
    expect(missingParts(new Set())).toEqual([...FILLABLE_PARTS]);
  });
});

// ── 2. THE FILL RULE ────────────────────────────────────────────────────────────────────────────────────────────────

describe('THE FILL RULE — deterministic, named, and never touches a part your song already plays', () => {
  it('a song with every part keeps its own rows untouched (no FEL row added)', () => {
    const bars: TrackState[][] = [[row('kick', [0]), row('snare', [4]), row('hat', [0, 2]), row('clap', [4]), row('bass', [0]), row('lead', [0])]];
    const { bars: out, filled } = applyFill(bars, STEPS, DEFAULT_KEY);
    expect(filled.size).toBe(0);
    expect(out[0]).toHaveLength(6);              // nothing appended
    expect(out[0]).toEqual(bars[0]);
  });

  it('a silent song (no rows at all) gets all six FEL parts, at FEL_FILL_VOLUME or below', () => {
    const { bars: out, filled } = applyFill([[]], STEPS, DEFAULT_KEY);
    expect([...filled].sort()).toEqual([...FILLABLE_PARTS].sort());
    expect(out[0]).toHaveLength(6);
    for (const t of out[0]) expect(t.volume).toBeLessThanOrEqual(FEL_FILL_VOLUME);
  });

  it('FEL\'s kick is a straight four-on-the-floor', () => {
    const { bars: out } = applyFill([[]], STEPS, DEFAULT_KEY);
    const kick = out[0].find((t) => t.sampleId === 'kick')!;
    expect(kick.pattern).toEqual([true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false]);
  });

  it("FEL's snare/perc are the house backbeat: snare on 2-and-4, perc answers off the beat", () => {
    const { bars: out } = applyFill([[]], STEPS, DEFAULT_KEY);
    const snare = out[0].find((t) => t.sampleId === 'snare')!;
    const perc = out[0].find((t) => t.sampleId === 'clap')!;
    expect(snare.pattern.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([4, 12]);
    expect(perc.pattern.some(Boolean)).toBe(true);
    // perc never lands on the same step as the (filled) kick or snare — it is an ANSWER, not a doubling
    const kick = out[0].find((t) => t.sampleId === 'kick')!;
    perc.pattern.forEach((v, i) => { if (v) { expect(kick.pattern[i]).toBe(false); expect(snare.pattern[i]).toBe(false); } });
  });

  it("FEL's hats are straight 8ths", () => {
    const { bars: out } = applyFill([[]], STEPS, DEFAULT_KEY);
    const hats = out[0].find((t) => t.sampleId === 'hat')!;
    expect(hats.pattern.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
  });

  it("THE NAMED RULE: a missing BASS follows YOUR OWN kick pattern (real, not FEL's), at the song's root note", () => {
    const key: SongKey = { root: 2, scale: 'dorian' };   // D dorian — a root that is NOT the default (A minor)
    const bars: TrackState[][] = [[row('kick', [0, 6, 10])]];   // an odd, syncopated kick — the bass must copy it exactly
    const { bars: out, filled } = applyFill(bars, STEPS, key);
    expect(filled.has('bass')).toBe(true);
    const bass = out[0].find((t) => t.sampleId === 'bass')!;
    expect(bass.pattern).toEqual([true, false, false, false, false, false, true, false, false, false, true, false, false, false, false, false]);
    expect(bass.notes).toEqual(Array.from({ length: STEPS }, () => defaultRowNote(key, 'bass')));
  });

  it('a missing bass follows a FEL-filled kick too, when your song has no kick either (four-on-the-floor)', () => {
    const { bars: out } = applyFill([[]], STEPS, DEFAULT_KEY);
    const kick = out[0].find((t) => t.sampleId === 'kick')!;
    const bass = out[0].find((t) => t.sampleId === 'bass')!;
    expect(bass.pattern).toEqual(kick.pattern);
  });

  it("THE NAMED RULE: a missing LEAD pads the song's root on the first beat of every bar — a chord without a chord nobody wrote", () => {
    const key: SongKey = { root: 7, scale: 'major' };
    const bars: TrackState[][] = [[row('kick', [0])], [row('kick', [0])]];
    const { bars: out } = applyFill(bars, STEPS, key);
    for (const bar of out) {
      const lead = bar.find((t) => t.sampleId === 'lead')!;
      expect(lead.pattern.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([0]);
      expect(lead.notes![0]).toBe(defaultRowNote(key, 'lead'));
    }
  });

  it('DETERMINISTIC: the exact same song fills the exact same way every time (no PRNG anywhere in the rule)', () => {
    const bars: TrackState[][] = [[row('kick', [0, 8]), row('hat', [2, 6, 10, 14])]];
    const a = applyFill(bars, STEPS, DEFAULT_KEY);
    const b = applyFill(bars, STEPS, DEFAULT_KEY);
    expect(a.bars).toEqual(b.bars);
    expect([...a.filled]).toEqual([...b.filled]);
  });

  it('a song that plays only ONE part still gets the other five filled, and only those five', () => {
    const { filled } = applyFill([[row('hat', [0, 4, 8, 12])]], STEPS, DEFAULT_KEY);
    expect([...filled].sort()).toEqual(['bass', 'kick', 'lead', 'perc', 'snare'].sort());
  });
});

// ── 3. THE OFFLINE RENDER ───────────────────────────────────────────────────────────────────────────────────────────

const RENDER_RATE = 48000;   // deliberately not SynthKit's fixed 44100, so this suite's own render contexts are
                              // never confused with the ones SynthKit.synthesizeKit makes internally
let fake: FakeWebAudio;
beforeEach(() => { fake = installFakeWebAudio(); });
afterEach(() => fake.uninstall());

const noTakes: YourSongRenderDeps = {
  readTake: async () => null,
  decode: async () => new FakeAudioBuffer(1, 100, RENDER_RATE) as unknown as AudioBuffer,
  sampleRate: RENDER_RATE,
};
const song = (bars: TrackState[][], opts: Partial<YourSongExport> = {}): YourSongExport => ({
  bpm: 120, steps: STEPS, swing: 0, kit: 'street', key: DEFAULT_KEY, bars, takes: [], ...opts,
});

/** This suite's own render contexts, picked out of everything fakeWebAudio saw (SynthKit's are always at 44100). */
const mine = (before: number): FakeOfflineAudioContext[] => FakeOfflineAudioContext.created.slice(before).filter((c) => c.sampleRate === RENDER_RATE);

describe('renderYourSongParts — one OfflineAudioContext per part, through mixGraph.buildMixGraph', () => {
  it('a part with no hits at all (post-fill) is never rendered; every part that has one is, labelled `fel` correctly', async () => {
    const s = song([[row('kick', [0, 8])]]);   // kick real; snare/hats/perc/bass/lead all FEL-filled
    const { stems, filled } = await renderYourSongParts(s, noTakes);
    expect(stems.map((st) => st.part).sort()).toEqual([...FILLABLE_PARTS].sort());   // all six always render (fill guarantees a hit)
    for (const st of stems) expect(st.fel).toBe(st.part !== 'kick');
    expect([...filled].sort()).not.toContain('kick');
  });

  it("a part's render schedules exactly its own bar's hits, at the render's own rate, on its own channel — nothing from another part", async () => {
    // kit 'neon' (not the default 'street'): its bass root does not land on DEFAULT_KEY's note, so the FEL-filled
    // bass — which copies this kick's exact pattern (the named fill rule) — plays at a rate other than 1, and
    // cannot be confused with kick's own (drums always play at rate 1) in the assertion below.
    const s = song([[row('kick', [0, 8])], [row('kick', [4])]], { kit: 'neon' });
    const before = FakeOfflineAudioContext.created.length;
    const { stems } = await renderYourSongParts(s, noTakes);
    const kickStem = stems.find((st) => st.part === 'kick')!;
    const ctxs = mine(before);
    // songStepTime is the EXACT formula AudioEngine's own live loop and every other render place a step at
    // (stepTime.ts) — bar 0 steps 0 and 8, then bar 1 step 4, all at swing 0
    const want = [songStepTime(0, 0, STEPS, s.bpm, 0), songStepTime(0, 8, STEPS, s.bpm, 0), songStepTime(1, 4, STEPS, s.bpm, 0)].sort((a, b) => a - b);
    const kickCtx = ctxs.find((c) => c.starts.length === want.length && c.starts.every((st) => st.rate === 1));
    expect(kickCtx).toBeDefined();
    expect(kickCtx!.starts.map((st) => st.at).sort((a, b) => a - b)).toEqual(want);
    const barLen = songStepTime(1, 0, STEPS, s.bpm, 0);
    expect(kickStem.buffer.length / kickStem.buffer.sampleRate).toBeGreaterThanOrEqual(barLen * 2);   // covers the whole song
  });

  it('a bass row (real or filled) plays its note by RATE off the kit voice\'s own root — same contract as AudioEngine.playHit', async () => {
    const key: SongKey = { root: 4, scale: 'minor' };
    const s = song([[row('kick', [0])]], { key });   // bass missing: FEL fills it, following the kick, at the root
    const before = FakeOfflineAudioContext.created.length;
    const { stems } = await renderYourSongParts(s, noTakes);
    expect(stems.find((st) => st.part === 'bass')).toBeDefined();
    const ctxs = mine(before);
    const bassCtx = ctxs.find((c) => c.starts.length === 1 && c.starts[0].rate !== undefined && c.starts[0].rate !== 1);
    expect(bassCtx).toBeDefined();   // a note off the kit's own root plays at a rate other than 1 (unless the root IS the note)
  });

  it('no takes, and no readTake success: no `takes` stem — the band is only the six kit parts', async () => {
    const s = song([[row('kick', [0])]], { takes: [{ id: 't', atBar: 0, bars: 1, loopBars: 1, trimStart: 0, trimEnd: 0, gain: 1, muted: false, pickedAt: 1, audioKey: 'gone' }] });
    const deps: YourSongRenderDeps = { ...noTakes, readTake: async () => null };   // the bytes are gone (another device, or swept)
    const { stems } = await renderYourSongParts(s, deps);
    expect(stems.some((st) => st.part === 'takes')).toBe(false);
  });

  it('a resolvable take becomes its own `takes` stem, fetched by reference and decoded — never fel', async () => {
    const takeRef: ExportedTake = { id: 't1', atBar: 0, bars: 1, loopBars: 1, trimStart: 0, trimEnd: 0, gain: 1, muted: false, pickedAt: 1, audioKey: 'aud_take1' };
    const s = song([[row('kick', [0])]], { takes: [takeRef] });
    const seen: string[] = [];
    const deps: YourSongRenderDeps = {
      readTake: async (key) => { seen.push(key); return new Blob([new ArrayBuffer(8)]); },
      decode: async () => new FakeAudioBuffer(1, Math.round(RENDER_RATE * 2), RENDER_RATE) as unknown as AudioBuffer,
      sampleRate: RENDER_RATE,
    };
    const { stems } = await renderYourSongParts(s, deps);
    expect(seen).toEqual(['aud_take1']);
    const take = stems.find((st) => st.part === 'takes');
    expect(take).toBeDefined();
    expect(take!.fel).toBe(false);
  });

  it('a MUTED take never reaches the render, even when it is the one best-of-N picked', async () => {
    // its own slot (atBar 2), picked (the highest pickedAt there) — and still muted
    const muted: ExportedTake = { id: 'm', atBar: 2, bars: 1, loopBars: 1, trimStart: 0, trimEnd: 0, gain: 1, muted: true, pickedAt: 99, audioKey: 'aud_m' };
    const notPicked: ExportedTake = { id: 'np', atBar: 0, bars: 1, loopBars: 1, trimStart: 0, trimEnd: 0, gain: 1, muted: false, pickedAt: 0, audioKey: 'aud_np' };
    const picked: ExportedTake = { id: 'p', atBar: 0, bars: 1, loopBars: 1, trimStart: 0, trimEnd: 0, gain: 1, muted: false, pickedAt: 9, audioKey: 'aud_p' };   // same slot as notPicked: this one wins the group
    const s = song([[row('kick', [0])]], { takes: [muted, notPicked, picked] });
    const seen: string[] = [];
    const deps: YourSongRenderDeps = {
      readTake: async (key) => { seen.push(key); return new Blob([new ArrayBuffer(8)]); },
      decode: async () => new FakeAudioBuffer(1, Math.round(RENDER_RATE * 2), RENDER_RATE) as unknown as AudioBuffer,
      sampleRate: RENDER_RATE,
    };
    await renderYourSongParts(s, deps);
    expect(seen).toEqual(['aud_p']);   // neither the muted pick nor the un-picked kept take was ever fetched
  });
});

// ── 4. THE LIVE BAND ────────────────────────────────────────────────────────────────────────────────────────────────
//
// FakeBaseAudioContext (fakeWebAudio.ts) is built directly, the same way performBand.audio.test.ts does — no need for
// installFakeWebAudio's global swap here, since YourSongBand is handed its context, never makes its own.

const stem = (part: SongPartId, fel: boolean, sec = 4): PartStem => ({ part, buffer: new FakeAudioBuffer(1, Math.round(44100 * sec), 44100) as unknown as AudioBuffer, fel });
/** A resolved (already-settled) stems promise — the common case in tests, where the render is not the thing under test. */
const ready = (stems: PartStem[]): Promise<{ stems: PartStem[]; filled: ReadonlySet<SongPartId> }> => Promise.resolve({ stems, filled: new Set(stems.filter((s) => s.fel).map((s) => s.part)) });
/** Let a settled promise's `.then` run (YourSongBand builds its nodes there). */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const newBand = (stems: PartStem[], ctx = new FakeBaseAudioContext()): { band: YourSongBand; ctx: FakeBaseAudioContext } => {
  const out = ctx.createGain();
  return { band: new YourSongBand(ctx as unknown as BaseAudioContext, out as unknown as AudioNode, ready(stems)), ctx };
};

describe("YourSongBand — FEL's parts play from the first beat; yours are earned like PERFORM's band", () => {
  it('before the render resolves, nothing is in yet — not even a FEL part (there is nothing to play it with)', () => {
    const ctx = new FakeBaseAudioContext();
    const out = ctx.createGain();
    const band = new YourSongBand(ctx as unknown as BaseAudioContext, out as unknown as AudioNode, new Promise(() => { /* never resolves in this test */ }));
    expect(band.has('kick')).toBe(false);
    expect(band.parts()).toEqual([]);
  });

  it("a FEL-filled part is 'in' immediately; one of your own parts is not, until it is earned", async () => {
    const { band } = newBand([stem('kick', true), stem('snare', false)]);
    await settle();
    expect(band.parts()).toEqual(['kick', 'snare']);
    expect(band.has('kick')).toBe(true);
    expect(band.isFel('kick')).toBe(true);
    expect(band.has('snare')).toBe(false);
    expect(band.level('kick')).toBe(1);
    expect(band.level('snare')).toBe(0);
  });

  it('the first clean hit brings your first real part in AT ONCE (PerformBand\'s own "first" rule)', async () => {
    const { band } = newBand([stem('kick', true), stem('snare', false), stem('bass', false)]);
    await settle();
    expect(band.hit()).toBe('snare');           // PART_ORDER's first non-fel part
    expect(band.has('snare')).toBe(true);
    expect(band.has('bass')).toBe(false);        // the second real part is not free
  });

  it(`every ${YOUR_SONG_JOIN_STREAK} hits after that brings in the NEXT real part`, async () => {
    const { band } = newBand([stem('kick', true), stem('snare', false), stem('bass', false)]);
    await settle();
    band.hit();                                  // snare joins at once
    for (let i = 1; i < YOUR_SONG_JOIN_STREAK; i++) expect(band.hit()).toBeNull();
    expect(band.hit()).toBe('bass');
    expect(band.has('bass')).toBe(true);
  });

  it(`${YOUR_SONG_DROP_STREAK} misses in a row drop the NEWEST joined part; FEL's own parts are never dropped`, async () => {
    const { band } = newBand([stem('kick', true), stem('snare', false), stem('bass', false)]);
    await settle();
    band.hit(); for (let i = 1; i < YOUR_SONG_JOIN_STREAK; i++) band.hit(); band.hit();   // snare then bass join
    expect(band.has('bass')).toBe(true);
    for (let i = 0; i < YOUR_SONG_DROP_STREAK - 1; i++) expect(band.miss()).toBeNull();
    expect(band.miss()).toBe('bass');            // last in, first out
    expect(band.has('bass')).toBe(false);
    expect(band.has('snare')).toBe(true);        // the older one stays
    expect(band.has('kick')).toBe(true);         // FEL's foundation is never touched by a miss
  });

  it('a song with every part real: the first part in PART_ORDER is still the free "first" one', async () => {
    const { band } = newBand([stem('kick', false), stem('snare', false)]);
    await settle();
    expect(band.has('kick')).toBe(false);        // nothing is FEL's, and nothing has joined yet
    expect(band.hit()).toBe('kick');
    expect(band.has('kick')).toBe(true);
  });

  it('a song with nothing of your own (every part FEL-filled): nothing to earn, hit()/miss() are no-ops', async () => {
    const { band } = newBand([stem('kick', true), stem('snare', true)]);
    await settle();
    expect(band.hit()).toBeNull();
    expect(band.miss()).toBeNull();
    expect(band.mixLevel()).toBe(1);             // both parts play; there is simply nothing left to join
  });

  it('mixLevel is the fraction of the band currently sounding (FEL parts count as always in)', async () => {
    const { band } = newBand([stem('kick', true), stem('snare', false), stem('bass', false), stem('lead', false)]);
    await settle();
    expect(band.mixLevel()).toBeCloseTo(1 / 4);
    band.hit();
    expect(band.mixLevel()).toBeCloseTo(2 / 4);
  });

  it('start() schedules every part\'s buffer ONCE, at the song\'s beat 0, offset 0', async () => {
    const { band, ctx } = newBand([stem('kick', true, 8), stem('snare', false, 8)]);
    await settle();
    ctx.currentTime = 1;
    band.start(2);                                // beat 0 is 2 song-seconds from now (a count-in)
    band.update(0);                                // the room drives update() every frame from the moment start() is called
    expect(ctx.starts).toHaveLength(2);
    for (const s of ctx.starts) { expect(s.at).toBe(2); expect(s.offset ?? 0).toBe(0); }
  });

  it('cancelFrom (a PAUSE) stops what is sounding; rewind + the next update() resumes it from the right buffer offset', async () => {
    const { band, ctx } = newBand([stem('kick', true, 8)]);
    await settle();
    ctx.currentTime = 0;
    band.start(0);
    band.update(0);
    expect(ctx.starts).toHaveLength(1);
    ctx.currentTime = 3;
    const n = band.cancelFrom(3);
    expect(n).toBe(1);
    expect(ctx.stops).toHaveLength(1);
    band.rewind(2.5);                              // the count-back plays from one bar before the pause point
    band.update(2.5);
    expect(ctx.starts).toHaveLength(2);
    expect(ctx.starts[1]).toMatchObject({ at: 3, offset: 2.5 });   // 2.5 s into the buffer, starting right now
  });

  // MUSIC-SUITE P7 FIX (2026-09-29): "YourSongBand has the identical no-fade stop/restart click bug" (review
  // finding) — cancelFrom used to call src.stop(audioSec) with no gain fade, and scheduleFrom started a fresh
  // source at whatever gain the node was already holding from before the pause. See CLICK_FADE_SEC's own
  // comment on yourSong.ts. The pre-existing test above only ever checked stop()/start() call counts and
  // offsets, never gain continuity — the gap this closes.
  describe('click avoidance: a pause fades out before it stops, a resume fades in from 0', () => {
    it('cancelFrom ramps a sounding part to silence and stops it only once the fade has finished', async () => {
      const { band, ctx } = newBand([stem('kick', true, 8)]);
      await settle();
      ctx.currentTime = 0;
      band.start(0);
      band.update(0);
      const kickGain = (ctx.starts[0].src!.outputs[0] as unknown as { gain: FakeAudioParam }).gain;
      // update()'s own continuous glide (every frame, toward target()) has had a chance to reach 1 (FEL's own
      // part plays from the first beat) — confirm it actually got there before the pause, so the fade-to-0 below
      // is a real drop, not a no-op on an already-silent node.
      expect(kickGain.value).toBeCloseTo(1, 6);

      ctx.currentTime = 3;
      const n = band.cancelFrom(3);
      expect(n).toBe(1);
      expect(kickGain.value).toBe(0);                              // ramped all the way to silence
      expect(ctx.stops[0].at).toBeCloseTo(3 + CLICK_FADE_SEC, 9);   // stopped at the END of the fade, not at 3
    });

    it('a fresh source on rewind fades its gain in from 0 rather than resuming at the pre-pause value', async () => {
      const { band, ctx } = newBand([stem('kick', true, 8)]);
      await settle();
      ctx.currentTime = 0;
      band.start(0);
      band.update(0);
      const kickGain = (ctx.starts[0].src!.outputs[0] as unknown as { gain: FakeAudioParam }).gain;
      expect(kickGain.value).toBeCloseTo(1, 6);

      ctx.currentTime = 3;
      band.cancelFrom(3);
      expect(kickGain.value).toBe(0);

      const before = kickGain.history.length;
      band.rewind(2.5);
      band.update(2.5);   // schedules the fresh source AND runs the per-frame glide toward target() in one call
      const added = kickGain.history.slice(before);
      // the fresh source's own start is zeroed at the exact moment it begins (scheduleFrom), and only THEN does
      // update()'s existing glide (setTargetAtTime toward 1) pick it back up — not a resume at whatever gain the
      // node happened to be holding (which, here, would have already read as 0 either way; the sequence is what
      // proves this went through scheduleFrom's own zero, not just "it was already 0 from the pause").
      const zeroAt = added.findIndex((c) => c.method === 'setValueAtTime' && c.value === 0);
      expect(zeroAt).toBeGreaterThanOrEqual(0);
      const glideUp = added[zeroAt + 1];
      expect(glideUp?.method).toBe('setTargetAtTime');
      expect(glideUp?.value).toBe(1);
    });
  });

  it('a part with nothing left to play from a very late rewind is simply not restarted', async () => {
    const { band, ctx } = newBand([stem('kick', true, 1)]);   // a 1 s buffer
    await settle();
    ctx.currentTime = 0;
    band.start(0);
    band.update(0);
    ctx.currentTime = 5;
    band.rewind(2);                                 // 2 s into a 1 s buffer: nothing left
    band.update(2);
    expect(ctx.starts).toHaveLength(1);              // only the original start — no second one was scheduled
  });

  it('setClock maps song time to audio time before scheduling', async () => {
    const { band, ctx } = newBand([stem('kick', true, 8)]);
    await settle();
    band.setClock((songSec) => songSec + 10);        // a constant offset, like SongClock.audio after a pause
    ctx.currentTime = 0;
    band.start(1);
    band.update(0);
    expect(ctx.starts[0].at).toBe(11);
  });

  it('dispose() stops every part and forgets it — a late-resolving render after dispose does nothing', async () => {
    let resolveIt!: (v: { stems: PartStem[]; filled: ReadonlySet<SongPartId> }) => void;
    const ctx = new FakeBaseAudioContext();
    const out = ctx.createGain();
    const band = new YourSongBand(ctx as unknown as BaseAudioContext, out as unknown as AudioNode, new Promise((r) => { resolveIt = r; }));
    band.dispose();
    resolveIt({ stems: [stem('kick', true)], filled: new Set(['kick' as SongPartId]) });
    await settle();
    expect(band.parts()).toEqual([]);                // the late stems were never adopted
  });
});
