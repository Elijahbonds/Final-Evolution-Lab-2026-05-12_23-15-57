import { describe, expect, it } from 'vitest';
import { AdditiveQuat, AdditiveScalar } from './AdditiveTrack';

describe('AdditiveScalar', () => {
  it('does not compound when the animation leaves the value alone', () => {
    const t = new AdditiveScalar(); let value = 0.5;
    for (let f = 0; f < 200; f++) {
      const base = t.baseFor(value);           // animation did not write: value == lastWritten after frame 0
      value = base + 0.01;                      // our delta
      t.wrote(value);
    }
    expect(value).toBeCloseTo(0.51, 6);         // one delta on top of the base, not 200
  });
  it('follows a fresh animated value as the new base', () => {
    const t = new AdditiveScalar();
    let v = t.baseFor(1.0) + 0.1; t.wrote(v);
    // animation writes 2.0 this frame
    const base = t.baseFor(2.0);
    expect(base).toBe(2.0);
  });
});

describe('AdditiveQuat', () => {
  it('reuses the base while untouched and adopts a fresh write', () => {
    const t = new AdditiveQuat();
    let b = t.baseFor(0, 0, 0, 1); t.wrote(0.1, 0, 0, 0.995);
    b = t.baseFor(0.1, 0, 0, 0.995);          // untouched by animation
    expect(b).toEqual([0, 0, 0, 1]);
    b = t.baseFor(0, 0.7, 0, 0.7);            // animation wrote
    expect(b).toEqual([0, 0.7, 0, 0.7]);
  });
});
