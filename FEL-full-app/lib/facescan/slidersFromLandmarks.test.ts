import { describe, expect, it } from 'vitest';
import { slidersFromLandmarks, type LM } from './slidersFromLandmarks';

/** Build a 478-point set where only the indices we read are meaningful. */
function face(o: { faceLen: number; cheekW: number; jawW: number; templeW?: number; browLift?: number; mouthOpen?: number }): LM[] {
  const lm: LM[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
  const iod = 100;
  lm[33] = { x: 0, y: 0 }; lm[263] = { x: iod, y: 0 };                    // eyes
  lm[10] = { x: 50, y: -60 }; lm[152] = { x: 50, y: -60 + o.faceLen * iod }; // forehead→chin
  lm[234] = { x: 50 - o.cheekW * iod / 2, y: 20 }; lm[454] = { x: 50 + o.cheekW * iod / 2, y: 20 };
  lm[172] = { x: 50 - o.jawW * iod / 2, y: 80 }; lm[397] = { x: 50 + o.jawW * iod / 2, y: 80 };
  const tw = (o.templeW ?? o.cheekW * 0.92) * iod;
  lm[127] = { x: 50 - tw / 2, y: -30 }; lm[356] = { x: 50 + tw / 2, y: -30 };
  const bl = (o.browLift ?? 0.12) * iod;
  lm[159] = { x: 20, y: 0 }; lm[105] = { x: 20, y: -bl }; lm[386] = { x: 80, y: 0 }; lm[334] = { x: 80, y: -bl };
  const mo = (o.mouthOpen ?? 0) * iod;
  lm[13] = { x: 50, y: 60 }; lm[14] = { x: 50, y: 60 + mo };
  return lm;
}

describe('slidersFromLandmarks', () => {
  it('a neutral, average face sculpts nothing', () => {
    expect(slidersFromLandmarks(face({ faceLen: 1.7, cheekW: 1.45, jawW: 1.1 }))).toEqual({});
  });
  it('a long face raises faceLong and nothing round', () => {
    const s = slidersFromLandmarks(face({ faceLen: 2.0, cheekW: 1.45, jawW: 1.1 }));
    expect(s.faceLong).toBeGreaterThan(0.7);
    expect(s.faceRound).toBeUndefined();
  });
  it('a wide jaw reads as square', () => {
    expect(slidersFromLandmarks(face({ faceLen: 1.7, cheekW: 1.5, jawW: 1.38 })).faceSquare).toBeGreaterThan(0.8);
  });
  it('wide cheeks over a narrow jaw read as heart', () => {
    expect(slidersFromLandmarks(face({ faceLen: 1.7, cheekW: 1.6, jawW: 1.05 })).faceHeart).toBeGreaterThan(0.8);
  });
  it('cheekbones wider than jaw and temples read as diamond, and a heart face does not', () => {
    expect(slidersFromLandmarks(face({ faceLen: 1.7, cheekW: 1.55, jawW: 1.1, templeW: 1.2 })).faceDiamond).toBeGreaterThan(0.3);
    expect(slidersFromLandmarks(face({ faceLen: 1.7, cheekW: 1.6, jawW: 1.05 })).faceDiamond).toBeUndefined();
  });
  it('raised brows and an open mouth map to their morphs', () => {
    const s = slidersFromLandmarks(face({ faceLen: 1.7, cheekW: 1.45, jawW: 1.1, browLift: 0.24, mouthOpen: 0.22 }));
    expect(s.browRaise).toBe(1);
    expect(s.jawOpen).toBe(1);
  });
  it('is scale invariant', () => {
    const a = slidersFromLandmarks(face({ faceLen: 1.9, cheekW: 1.55, jawW: 1.3 }));
    const scaled = face({ faceLen: 1.9, cheekW: 1.55, jawW: 1.3 }).map((p) => ({ x: p.x * 3.7, y: p.y * 3.7 }));
    expect(slidersFromLandmarks(scaled)).toEqual(a);
  });
  it('rejects a short or degenerate landmark set', () => {
    expect(slidersFromLandmarks([])).toEqual({});
    expect(slidersFromLandmarks(Array.from({ length: 478 }, () => ({ x: 1, y: 1 })))).toEqual({});
  });
});
