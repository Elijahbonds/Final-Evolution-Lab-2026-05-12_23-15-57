// VOICEOVER (2026-10-06): the mix maths: the loudness table, the ducking envelope, the output presets.
import { describe, expect, it } from 'vitest';
import { MAX_CLIP_TRIM_DB, ROUTE_LEVEL_DB, ROUTE_TRIM_DB, TARGET_LUFS, clipTrimDb, dbToGain, gainToDb, lineGain } from './loudness';
import { LOOKAHEAD, duckEvents, duckFactor, envelopeAt, mergeSpans, tauFor } from './ducking';
import {
  OUTPUT_PRESETS, OUTPUT_PRESET_IDS, RHYTHM_MUSIC_DUCK_MAX_DB, compressorCurveDb, detectOutputPreset, glueTrimDb, makeupDb, musicDuckDb,
} from './outputPreset';

describe('loudness: the gain table', () => {
  it('a dry voice (a player, the Coach, Okta) lands within 3 dB of the court MC after its trim, and still under him', () => {
    const mc = ROUTE_LEVEL_DB.mc + ROUTE_TRIM_DB.mc;
    for (const r of ['player', 'coach'] as const) {
      const lvl = ROUTE_LEVEL_DB[r] + ROUTE_TRIM_DB[r];
      expect(mc - lvl).toBeGreaterThan(0);
      expect(mc - lvl).toBeLessThanOrEqual(3);
    }
    expect(ROUTE_LEVEL_DB.mc - ROUTE_LEVEL_DB.player).toBeGreaterThan(7);   // the measured gap the trim closes
  });
  it('the crowd stays under everyone (it is the bed, not a voice to follow)', () => {
    expect(ROUTE_LEVEL_DB.crowd + ROUTE_TRIM_DB.crowd).toBeLessThan(ROUTE_LEVEL_DB.player + ROUTE_TRIM_DB.player - 6);
  });
  it('a measured clip is trimmed back to the target, clamped; an unmeasured one is left alone', () => {
    expect(clipTrimDb({ lufs: TARGET_LUFS + 2 })).toBeCloseTo(-2, 9);
    expect(clipTrimDb({ lufs: TARGET_LUFS - 30 })).toBe(MAX_CLIP_TRIM_DB);
    expect(clipTrimDb({ lufs: TARGET_LUFS + 30 })).toBe(-MAX_CLIP_TRIM_DB);
    expect(clipTrimDb({})).toBe(0);
    expect(clipTrimDb({ lufs: NaN })).toBe(0);
    expect(clipTrimDb(null)).toBe(0);
  });
  it('lineGain multiplies the route, the clip and the cue', () => {
    expect(gainToDb(lineGain('player', 'hooper_a', { lufs: TARGET_LUFS + 1 }, 0.9))).toBeCloseTo(6 - 1 + gainToDb(0.9), 6);
    expect(lineGain('mc', 'velvet', undefined)).toBeCloseTo(1, 9);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
  });
});

describe('ducking: the envelope', () => {
  const spec = { depthDb: 8, attack: 0.08, release: 0.45 };
  it('starts a beat early, is ~95% down after the attack, holds, and is ~95% back after the release', () => {
    const ev = duckEvents(1, 3, 1, spec);
    expect(ev[0].at).toBeCloseTo(1 - LOOKAHEAD, 9);
    const floor = duckFactor(8);
    expect(floor).toBeCloseTo(0.398, 3);
    const at = (t: number) => envelopeAt(t, 1, ev);
    expect(at(0.5)).toBe(1);
    const downBy = (v: number) => (1 - v) / (1 - floor);
    expect(downBy(at(ev[0].at + spec.attack))).toBeGreaterThan(0.94);
    expect(at(2.9)).toBeCloseTo(floor, 3);
    const upBy = (v: number) => (v - floor) / (1 - floor);
    expect(upBy(at(3 + spec.release))).toBeGreaterThan(0.94);
    expect(upBy(at(3 + spec.release / 3))).toBeLessThan(0.7);   // it glides back, it does not jump
  });
  it('time constants are a third of the stated time (setTargetAtTime reaches 95% in 3 tau)', () => {
    expect(tauFor(0.3)).toBeCloseTo(0.1, 9);
    expect(1 - Math.exp(-3)).toBeGreaterThan(0.95);
  });
  it('no span, or no depth, is no duck', () => {
    expect(duckEvents(2, 2, 1, spec)).toEqual([]);
    expect(duckEvents(1, 2, 1, { ...spec, depthDb: 0 })).toEqual([]);
  });
  it('the duck scales whatever the target rests at (a bus at 40% volume ducks from 40%)', () => {
    const ev = duckEvents(0, 2, 0.4, spec);
    expect(ev[0].target).toBeCloseTo(0.4 * duckFactor(8), 9);
    expect(ev[1].target).toBe(0.4);
  });
  it('back-to-back voices hold one duck instead of bobbing between them', () => {
    expect(mergeSpans([[3, 4], [0, 1], [1.2, 2]], 0.45)).toEqual([[0, 2], [3, 4]]);
    expect(mergeSpans([[0, 1], [2, 3]], 0.45)).toEqual([[0, 1], [2, 3]]);
  });
});

describe('output presets', () => {
  it('detects a TV or console from its user agent, a touch phone/tablet by pointer and size, everything else as TV', () => {
    expect(detectOutputPreset({ ua: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)' })).toBe('tv');
    expect(detectOutputPreset({ ua: 'Mozilla/5.0 (Linux; Android 9; AFTMM) Silk' })).toBe('tv');
    // a TV browser that reports a touch-like pointer at a small CSS screen size is still a TV (the user agent wins)
    expect(detectOutputPreset({ ua: 'Mozilla/5.0 (Web0S; Linux/SmartTV)', coarsePointer: true, touchPoints: 1, screenW: 960, screenH: 540 })).toBe('tv');
    expect(detectOutputPreset({ ua: 'iPhone', coarsePointer: true, touchPoints: 5, screenW: 390, screenH: 844 })).toBe('phone');
    expect(detectOutputPreset({ ua: 'iPad', coarsePointer: true, touchPoints: 5, screenW: 1024, screenH: 1366 })).toBe('phone');
    expect(detectOutputPreset({ ua: 'Mac', coarsePointer: false, touchPoints: 0, screenW: 1512, screenH: 982 })).toBe('tv');
    expect(detectOutputPreset({ ua: 'Windows touch laptop', coarsePointer: false, touchPoints: 10, screenW: 1920, screenH: 1080 })).toBe('tv');
    expect(detectOutputPreset({})).toBe('tv');
  });
  it('never guesses headphones (a web page cannot tell)', () => {
    for (const ua of ['iPhone', 'Mac', 'Tizen', '']) for (const coarse of [true, false]) {
      expect(detectOutputPreset({ ua, coarsePointer: coarse, touchPoints: coarse ? 5 : 0, screenW: 400, screenH: 800 })).not.toBe('headphones');
    }
  });
  it('the voice always sits over the bed, most on a phone and a TV, least on headphones', () => {
    const P = OUTPUT_PRESETS;
    for (const id of OUTPUT_PRESET_IDS) { expect(P[id].voiceTrimDb).toBeGreaterThanOrEqual(0); expect(P[id].duck.music).toBeGreaterThan(P[id].duck.sfx); }
    expect(P.phone.duck.music).toBeGreaterThan(P.headphones.duck.music);
    expect(P.tv.duck.crowd).toBeGreaterThan(P.headphones.duck.crowd);
    expect(P.tv.duck.crowd).toBe(8);   // today's crowd duck (0.4) is the TV preset's
  });
  it('the rhythm room\'s song never dips more than the cap', () => {
    expect(musicDuckDb(OUTPUT_PRESETS.phone, 'cypher')).toBe(RHYTHM_MUSIC_DUCK_MAX_DB);
    expect(musicDuckDb(OUTPUT_PRESETS.phone, 'venice')).toBe(OUTPUT_PRESETS.phone.duck.music);
    expect(musicDuckDb(OUTPUT_PRESETS.headphones, null)).toBe(5);
  });
  it('the compressor curve: straight below the threshold, 1/ratio above the knee, continuous through it', () => {
    const c = { threshold: -20, knee: 10, ratio: 2 };
    expect(compressorCurveDb(-30, c)).toBe(-30);
    expect(compressorCurveDb(-20, c)).toBe(-20);
    const end = compressorCurveDb(-10, c);
    expect(compressorCurveDb(-10 + 1e-6, c)).toBeCloseTo(end, 4);
    expect(compressorCurveDb(0, c) - compressorCurveDb(-10, c)).toBeCloseTo(5, 6);
    // the limiter today (-3 dB, knee 0, 20:1) adds +1.71 dB of makeup: the number the route simulation used
    expect(makeupDb({ threshold: -3, knee: 0, ratio: 20 })).toBeCloseTo(1.71, 2);
  });
  it('the glue\'s automatic makeup is taken back out: each preset changes the level only by its own loudnessDb', () => {
    for (const id of OUTPUT_PRESET_IDS) {
      const s = OUTPUT_PRESETS[id];
      expect(glueTrimDb(s) + makeupDb(s.glue)).toBeCloseTo(s.loudnessDb, 9);
      expect(makeupDb(s.glue)).toBeGreaterThan(0);
    }
  });
});
