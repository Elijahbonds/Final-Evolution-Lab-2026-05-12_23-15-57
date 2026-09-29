import { describe, expect, it } from 'vitest';
import { FEL_SOURCES, PAD_COUNT, PAD_KEYS, energyEnvelope, gridSlices, isAllowedSource, onsetSlices, padForKey, padFromAction, padsFromSlices, quantizeTap, rateForPitch, sliceSamples } from './Flip';

function burstSignal(sr: number, hits: number[], seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(sr * seconds));
  for (const t of hits) { const s = Math.floor(t * sr); for (let i = 0; i < Math.floor(sr * 0.03); i++) out[s + i] = 0.8 * Math.exp(-i / (sr * 0.01)) * Math.sin(i * 0.3); }
  return out;
}

describe('sources are the rule', () => {
  it('only FEL, own and public-domain sources are allowed; the shipped library is FEL-owned with a note', () => {
    expect(isAllowedSource('fel')).toBe(true); expect(isAllowedSource('third-party')).toBe(false); expect(isAllowedSource('spotify')).toBe(false);
    // MUSIC-SUITE P5 (2026-09-25): the shelf is FEL's Flip pack now (22 sources: 3 themes, 10 loops, 3 vox sheets, 6 kits
    // with the 808 kit among them) — flipPack.test.ts pins it to public/audio/flip/pack.json item for item
    expect(FEL_SOURCES.length).toBe(22);
    for (const s of FEL_SOURCES) { expect(s.kind).toBe('fel'); expect(s.note.length).toBeGreaterThan(10); expect(s.url).toMatch(/^\/audio\/flip\/(audio\/[a-z0-9_]+\.mp3|banks\/bank_[a-z0-9_]+)$/); expect(s.group).toBeTruthy(); }
  });
});

describe('slicing', () => {
  it('grid slices cover the whole buffer with no gaps, capped at 16', () => {
    const g = gridSlices(1000, 4);
    expect(g).toEqual([{ start: 0, end: 250 }, { start: 250, end: 500 }, { start: 500, end: 750 }, { start: 750, end: 1000 }]);
    expect(gridSlices(100, 99).length).toBe(PAD_COUNT); expect(gridSlices(0, 4)).toEqual([]);
  });
  it('finds the onsets of four hits and slices between them', () => {
    const sr = 8000; const sig = burstSignal(sr, [0.1, 0.4, 0.7, 1.0], 1.3);
    const s = onsetSlices(sig, sr);
    expect(s.length).toBe(4);
    expect(s.map((x) => Math.round(x.start / sr * 10) / 10)).toEqual([0.1, 0.4, 0.7, 1.0]);
    expect(s[3].end).toBe(sig.length);
  });
  it('respects the minimum gap and falls back to a grid on a steady tone', () => {
    const sr = 8000; const sig = burstSignal(sr, [0.1, 0.12, 0.14, 0.5], 0.8);
    expect(onsetSlices(sig, sr).length).toBe(2);                    // 0.12 and 0.14 are inside the 80 ms gap
    const tone = new Float32Array(sr).map((_: number, i: number) => 0.5 * Math.sin(i * 0.05));
    expect(onsetSlices(tone, sr).length).toBe(8);                   // grid fallback
  });
  it('energy envelope is per window', () => {
    expect(energyEnvelope(new Float32Array([0, 0, 1, 1]), 2)).toEqual(new Float32Array([0, 1]));
  });
  // MUSIC-SUITE P5 (2026-09-25), flippack CONTRACT 12.1: the finder never marks window 0, so a file that starts ON its
  // transient put pad 1 at 10 ms and cut the downbeat's attack off (the old line was a no-op). A first onset within two
  // windows of the head is the head now; leading silence longer than that is still skipped (the 0.1 s case above).
  it('a file that starts on its transient: pad 1 starts at sample 0, not 10 ms in', () => {
    const sr = 8000; const sig = burstSignal(sr, [0, 0.4, 0.7], 1.0);
    const s = onsetSlices(sig, sr);
    expect(s[0].start).toBe(0);
    expect(s.map((x) => Math.round(x.start / sr * 10) / 10)).toEqual([0, 0.4, 0.7]);
  });
});

describe('pads', () => {
  it('sixteen pads, slices left to right, empty ones null; keys map 1234/qwer/asdf/zxcv', () => {
    const pads = padsFromSlices(gridSlices(160, 3));
    expect(pads.length).toBe(PAD_COUNT); expect(pads[2].slice).toEqual({ start: 106, end: 160 }); expect(pads[3].slice).toBeNull();
    expect(PAD_KEYS.length).toBe(16); expect(padForKey('Q')).toBe(4); expect(padForKey('v')).toBe(15); expect(padForKey('p')).toBe(-1);
    expect(padFromAction('pad_0')).toBe(0); expect(padFromAction('pad_15')).toBe(15); expect(padFromAction('pad_16')).toBe(-1); expect(padFromAction('shoot')).toBe(-1);
  });
  it('pitch rates and slice samples (reversed) and tap quantization', () => {
    expect(rateForPitch(12)).toBeCloseTo(2); expect(rateForPitch(-12)).toBeCloseTo(0.5); expect(rateForPitch(40)).toBeCloseTo(2);
    expect(Array.from(sliceSamples(new Float32Array([1, 2, 3, 4]), { start: 1, end: 3 }, true))).toEqual([3, 2]);
    expect(quantizeTap(5.4, 16)).toBe(5); expect(quantizeTap(15.6, 16)).toBe(0); expect(quantizeTap(-1, 16)).toBe(0);
  });
});
