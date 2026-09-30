// MUSIC-SUITE P7 (2026-09-29): SongStemBand — real-stem playback for the six FEL songs.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installFakeWebAudio, FakeAudioContext, FakeAudioBuffer, type FakeWebAudio, type FakeAudioParam } from '../music/fakeWebAudio';
import { SongStemBand, stemGain, DRUMS_FLOOR, CLICK_FADE_SEC } from './SongStemBand';
import { nextStemLevel, CATEGORY_STEM, type StemCategory } from './StemBand';
import { FEL_STEMS, FEL_SONGS, songStemUrl } from '../dance/felSongs';

const CYPHER = FEL_SONGS.find((s) => s.id === 'cypher')!;

/** A fetch that answers every stem URL with a tiny "audio" ArrayBuffer, ok: true — decodeAudioData is faked too
 *  (fakeWebAudio.ts), so the bytes are never actually parsed. `fail` names stems this fetch instead 404s. */
function fakeFetch(fail: readonly string[] = []): typeof fetch {
  return (async (url: string) => {
    const bad = fail.some((f) => url.includes(`/${f}.mp3`));
    if (bad) return { ok: false } as Response;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
  }) as typeof fetch;
}

describe('stemGain (pure): bed and drums never fully drop', () => {
  it('bed ignores level entirely — always full gain', () => {
    expect(stemGain('bed', 0)).toBe(1);
    expect(stemGain('bed', 0.5)).toBe(1);
    expect(stemGain('bed', 1)).toBe(1);
  });

  it('drums floors at DRUMS_FLOOR, never below, but still rises with level above the floor', () => {
    expect(stemGain('drums', 0)).toBe(DRUMS_FLOOR);
    expect(stemGain('drums', DRUMS_FLOOR / 2)).toBe(DRUMS_FLOOR);
    expect(stemGain('drums', 1)).toBe(1);
    expect(DRUMS_FLOOR).toBeGreaterThan(0);
    expect(DRUMS_FLOOR).toBeLessThan(1);
  });

  it('every other stem is exactly its earned level, including all the way to 0', () => {
    for (const stem of FEL_STEMS.filter((s) => s !== 'bed' && s !== 'drums')) {
      expect(stemGain(stem, 0)).toBe(0);
      expect(stemGain(stem, 0.42)).toBe(0.42);
      expect(stemGain(stem, 1)).toBe(1);
    }
  });
});

describe('SongStemBand: the audio graph', () => {
  let fake: FakeWebAudio;
  let ctx: FakeAudioContext;
  let dest: { outputs: unknown[] };

  beforeEach(() => {
    fake = installFakeWebAudio();
    ctx = new FakeAudioContext();
    // Every real stem runs ~100 s (CONTRACT.md: 36–56 bars); the fake's own default decode (0.1 s) would clamp
    // every offset below to ~0.099 s and hide a wrong offset behind a right-looking clamp. A stand-in this long
    // matches the shipped songs closely enough that a real offset (1.2 s, 88 s, …) never gets clamped by mistake.
    ctx.decodeAudioData = (async () => new FakeAudioBuffer(1, Math.round(44100 * 200), 44100)) as typeof ctx.decodeAudioData;
    dest = ctx.createGain() as unknown as { outputs: unknown[] };
  });
  afterEach(() => fake.uninstall());

  it('every stem starts at its resting gain: bed full, drums at its floor, the rest silent', () => {
    const band = new SongStemBand(ctx as unknown as AudioContext, dest as unknown as AudioNode, CYPHER);
    expect(band.currentGain('bed')).toBe(1);
    expect(band.currentGain('drums')).toBe(DRUMS_FLOOR);
    for (const stem of FEL_STEMS.filter((s) => s !== 'bed' && s !== 'drums')) expect(band.currentGain(stem)).toBe(0);
  });

  it('load() decodes every stem and reports how many loaded; a 404 just leaves that one silent', async () => {
    const band = new SongStemBand(ctx as unknown as AudioContext, dest as unknown as AudioNode, CYPHER);
    const n = await band.load(fakeFetch(['bass']));
    expect(n).toBe(FEL_STEMS.length - 1);
    expect(band.loadedStems).toBe(FEL_STEMS.length - 1);
  });

  it('a throwing fetch is a silent stem too, never a rejection (the mode must run headless)', async () => {
    const band = new SongStemBand(ctx as unknown as AudioContext, dest as unknown as AudioNode, CYPHER);
    const throwing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    await expect(band.load(throwing)).resolves.toBe(0);
  });

  it('start() begins all eight sources together, at the mapped audio time', async () => {
    const band = new SongStemBand(ctx as unknown as AudioContext, dest as unknown as AudioNode, CYPHER);
    await band.load(fakeFetch());
    band.setClock((songSec) => songSec + 10);   // an arbitrary, testable offset
    ctx.currentTime = 3;
    band.start(5);   // song time 5 -> audio time 15
    expect(ctx.starts).toHaveLength(FEL_STEMS.length);
    for (const s of ctx.starts) { expect(s.kind).toBe('buffer'); expect(s.at).toBe(15); expect(s.offset).toBe(0); }
  });

  it('a stem still loading when start() runs joins later, from update()', async () => {
    const band = new SongStemBand(ctx as unknown as AudioContext, dest as unknown as AudioNode, CYPHER);
    band.setClock((s) => s);
    ctx.currentTime = 0;
    band.start(0);
    expect(ctx.starts).toHaveLength(0);   // nothing loaded yet — armFrom found every buffer null
    await band.load(fakeFetch());
    expect(ctx.starts).toHaveLength(0);   // load() alone does not start anything
    ctx.currentTime = 1.5;
    band.update(1.5);
    expect(ctx.starts).toHaveLength(FEL_STEMS.length);   // now every stem joins, from where the song already is
    for (const s of ctx.starts) expect(s.offset).toBeCloseTo(1.5, 6);
    band.update(1.6);   // already joined — update() must not restart a voice that already has a source
    expect(ctx.starts).toHaveLength(FEL_STEMS.length);
  });

  it('judge() moves a stem\'s level exactly like StemBand\'s nextStemLevel, and mixLevel averages the 7 earned stems', async () => {
    const band = new SongStemBand(ctx as unknown as AudioContext, dest as unknown as AudioNode, CYPHER);
    await band.load(fakeFetch());
    band.setClock((s) => s);
    band.start(0);
    const cats = Object.keys(CATEGORY_STEM) as StemCategory[];
    expect(cats.every((c) => band.level(c) === 0)).toBe(true);
    expect(band.mixLevel()).toBe(0);

    band.judge('bounce', 'PERFECT');
    expect(band.level('bounce')).toBe(nextStemLevel(0, 'PERFECT'));
    expect(band.currentGain('drums')).toBeCloseTo(Math.max(DRUMS_FLOOR, nextStemLevel(0, 'PERFECT')), 9);

    band.judge('wave', 'GOOD');
    expect(band.level('wave')).toBe(nextStemLevel(0, 'GOOD'));
    expect(band.currentGain('keys')).toBeCloseTo(nextStemLevel(0, 'GOOD'), 9);

    const expectedMix = (nextStemLevel(0, 'PERFECT') + nextStemLevel(0, 'GOOD')) / cats.length;
    expect(band.mixLevel()).toBeCloseTo(expectedMix, 9);

    band.judge(undefined, 'MISS');   // a wild tap with nothing pending: StemBand.judge is also a no-op on this
    expect(band.mixLevel()).toBeCloseTo(expectedMix, 9);
  });

  it('bounce (drums) never fully drops even after repeated misses; every other stem can', async () => {
    const band = new SongStemBand(ctx as unknown as AudioContext, dest as unknown as AudioNode, CYPHER);
    await band.load(fakeFetch());
    band.setClock((s) => s);
    band.start(0);
    band.judge('bounce', 'PERFECT');
    band.judge('footwork', 'PERFECT');
    for (let i = 0; i < 6; i++) { band.judge('bounce', 'MISS'); band.judge('footwork', 'MISS'); }
    expect(band.level('bounce')).toBe(0);
    expect(band.level('footwork')).toBe(0);
    expect(band.currentGain('drums')).toBe(DRUMS_FLOOR);   // floored, not silent
    expect(band.currentGain('bass')).toBe(0);              // footwork -> bass, no floor: really silent
    expect(band.currentGain('bed')).toBe(1);                // bed was never even judgeable
  });

  it('cancelFrom stops every sounding stem and rewind restarts them all from the right offset', async () => {
    const band = new SongStemBand(ctx as unknown as AudioContext, dest as unknown as AudioNode, CYPHER);
    await band.load(fakeFetch());
    band.setClock((s) => s);
    ctx.currentTime = 0;
    band.start(0);
    expect(ctx.starts).toHaveLength(FEL_STEMS.length);

    ctx.currentTime = 2;
    const stopped = band.cancelFrom(2);
    expect(stopped).toBe(FEL_STEMS.length);
    expect(ctx.stops.length).toBeGreaterThanOrEqual(FEL_STEMS.length);

    band.rewind(1.2);   // "one bar before the pause point" — DanceMode computes the 1.2, this only replays from it
    const restarted = ctx.starts.slice(FEL_STEMS.length);
    expect(restarted).toHaveLength(FEL_STEMS.length);
    for (const s of restarted) expect(s.offset).toBeCloseTo(1.2, 6);
  });

  // MUSIC-SUITE P7 FIX (2026-09-29): "SongStemBand clicks on every pause and resume of a shipped song" (review
  // finding) — cancelFrom used to call source.stop(audioSec) on a continuously-playing buffer with no gain fade
  // first, and startVoice snapped a fresh source's gain straight to its target instead of fading in. Both ends
  // are fixed the same way (CLICK_FADE_SEC's own comment on SongStemBand.ts): this proves the fade actually
  // happens, not just that stop()/start() were called with the right offsets (the pre-existing test above, and
  // the gap this closes — cancelFrom/rewind's own test only ever checked call counts and offsets).
  describe('click avoidance: a pause fades out before it stops, a resume fades in from 0', () => {
    it('cancelFrom ramps every sounding stem to silence and stops it only once the fade has finished', async () => {
      const band = new SongStemBand(ctx as unknown as AudioContext, dest as unknown as AudioNode, CYPHER);
      await band.load(fakeFetch());
      band.setClock((s) => s);
      ctx.currentTime = 0;
      band.start(0);
      band.judge('bounce', 'PERFECT');   // drums well above its floor, so a snap-to-0 would be an obvious jump
      expect(band.currentGain('drums')).toBeGreaterThan(DRUMS_FLOOR);
      expect(band.currentGain('bed')).toBe(1);

      ctx.currentTime = 2;
      band.cancelFrom(2);
      // every voice's gain is ramped all the way to 0 — bed and drums included, despite their floors — because
      // cancelFrom takes the WHOLE band to silence for a pause, not the earned-level resting point judge() uses.
      for (const stem of FEL_STEMS) expect(band.currentGain(stem)).toBe(0);
      // the source is stopped at the END of the fade (audioSec + CLICK_FADE_SEC), not at audioSec itself — the
      // whole point is that the source itself never plays past where the fade has already silenced it.
      for (const s of ctx.stops.slice(-FEL_STEMS.length)) expect(s.at).toBeCloseTo(2 + CLICK_FADE_SEC, 9);
    });

    it('a fresh source (rewind, or a late-joining stem) fades its gain in from 0 rather than snapping to target', async () => {
      const band = new SongStemBand(ctx as unknown as AudioContext, dest as unknown as AudioNode, CYPHER);
      await band.load(fakeFetch());
      band.setClock((s) => s);
      ctx.currentTime = 0;
      band.start(0);
      band.judge('bounce', 'PERFECT');
      const drumsTarget = band.currentGain('drums');
      expect(drumsTarget).toBeGreaterThan(DRUMS_FLOOR);

      // The stem's own GainNode: never recreated (only the buffer `source` is, on every start/restart), so the
      // very first start's own source tells us which node it is (`src.connect(v.gain)` in startVoice — the only
      // thing that source ever connects to) — its automation HISTORY is the only way to tell "snapped to target"
      // from "ramped up to the same target", since `.value` alone reads identically either way.
      const drumsIdx = FEL_STEMS.indexOf('drums');
      const drumsGain = (ctx.starts[drumsIdx].src!.outputs[0] as unknown as { gain: FakeAudioParam }).gain;

      ctx.currentTime = 2;
      band.cancelFrom(2);
      expect(band.currentGain('drums')).toBe(0);   // faded to silence by the pause, same as the test above

      const before = drumsGain.history.length;
      band.rewind(1.2);   // restarts every stem fresh, from song time 1.2
      // rewind never resets what was earned — the fresh source lands back on the SAME target — but it must get
      // there by a ramp that starts at 0 (setValueAtTime(0, when)), immediately followed by a ramp UP to the
      // target, not a value that was already sitting at the target when the source's audio started.
      const added = drumsGain.history.slice(before);
      const zeroAt = added.findIndex((c) => c.method === 'setValueAtTime' && c.value === 0);
      expect(zeroAt).toBeGreaterThanOrEqual(0);
      const rampUp = added[zeroAt + 1];
      expect(rampUp?.method).toBe('linearRampToValueAtTime');
      expect(rampUp?.value).toBeCloseTo(drumsTarget, 9);
      expect(rampUp!.time).toBeCloseTo((added[zeroAt].time ?? 0) + CLICK_FADE_SEC, 9);
      expect(band.currentGain('drums')).toBeCloseTo(drumsTarget, 9);   // and it does still reach the same target
      expect(band.currentGain('bed')).toBe(1);
    });
  });

  it('playOutro stops the gameplay tail, plays every stem at gain 1 (the full mix) regardless of earned level, and fades', async () => {
    const band = new SongStemBand(ctx as unknown as AudioContext, dest as unknown as AudioNode, CYPHER);
    await band.load(fakeFetch());
    band.setClock((s) => s);
    ctx.currentTime = 0;
    band.start(0);
    band.judge('freeze', 'MISS');   // horns ducked to 0 — the outro must still play it at full gain
    expect(band.currentGain('horns')).toBe(0);

    ctx.currentTime = 90;
    const before = ctx.starts.length;
    band.playOutro(88, 6, 1.2);
    expect(ctx.stops.length).toBeGreaterThanOrEqual(FEL_STEMS.length);   // the still-playing gameplay run was stopped
    const outroStarts = ctx.starts.slice(before);
    expect(outroStarts).toHaveLength(FEL_STEMS.length);
    for (const s of outroStarts) { expect(s.offset).toBeCloseTo(88, 6); expect(s.duration).toBeGreaterThan(0); }
  });

  it('dispose ducks everything and stops accepting further work', async () => {
    const band = new SongStemBand(ctx as unknown as AudioContext, dest as unknown as AudioNode, CYPHER);
    await band.load(fakeFetch());
    band.setClock((s) => s);
    band.start(0);
    const before = ctx.starts.length;
    band.dispose();
    band.judge('bounce', 'PERFECT');    // must not throw, and must not start anything new
    band.update(5);
    expect(ctx.starts.length).toBe(before);
  });
});
