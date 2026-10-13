import { describe, expect, it } from 'vitest';
import { STRIDE_M, SURFACE_LOOK, contactForce, squashOf, strides, surfaceOf } from './surfaces';

describe('court surfaces', () => {
  it('volleyball reads its place: sand, night sand, the gym; tennis its court', () => {
    expect(surfaceOf('volleyball', undefined)).toBe('sand'); expect(surfaceOf('volleyball', 'home')).toBe('sand');
    expect(surfaceOf('volleyball', 'night-beach')).toBe('night-sand'); expect(surfaceOf('volleyball', 'gym')).toBe('gym');
    expect(surfaceOf('tennis', 'home')).toBe('hard'); expect(surfaceOf('tennis', 'clay')).toBe('clay'); expect(surfaceOf('tennis', 'grass')).toBe('grass');
  });
  it('a varnished floor does not dust, does not take prints and does not ring', () => {
    expect(SURFACE_LOOK.gym).toEqual({ dust: null, dustScale: 0, footprints: false, ballMark: null, ring: null });
    expect(SURFACE_LOOK.hard.dust).toBeNull();
  });
  it('clay and sand dust; only the sand rings; clay and sand take prints', () => {
    expect(SURFACE_LOOK.clay.dust).toBeTruthy(); expect(SURFACE_LOOK.sand.dust).toBeTruthy();
    expect(SURFACE_LOOK.sand.ring).toBeTruthy(); expect(SURFACE_LOOK.clay.ring).toBeNull();
    expect(SURFACE_LOOK.clay.footprints && SURFACE_LOOK.sand.footprints).toBe(true);
  });
  it('a stride lays a print every STRIDE_M of travel and never a burst of them', () => {
    let acc = 0, n = 0;
    for (let i = 0; i < 100; i++) { const s = strides(acc, 0.1); acc = s.acc; n += s.prints; }
    expect(n).toBe(Math.floor(10 / STRIDE_M));
    expect(strides(0, 50).prints).toBeLessThanOrEqual(3);
    expect(strides(0.5, -0.5).prints).toBe(1);   // direction does not matter
  });
  it('force: a perfect spike is the hardest, a miss is none, a set is soft', () => {
    expect(contactForce('perfect', 'spike')).toBe(1);
    expect(contactForce('miss', 'spike')).toBe(0);
    expect(contactForce('good', 'set')).toBeLessThan(contactForce('good', 'spike'));
    expect(contactForce('late', 'swing')).toBeGreaterThan(0);
  });
  it('squash: harder is flatter and a touch longer, never inside out', () => {
    expect(squashOf(1).flat).toBeLessThan(squashOf(0).flat);
    expect(squashOf(1).sec).toBeGreaterThan(squashOf(0).sec);
    expect(squashOf(5).flat).toBeGreaterThan(0.5); expect(squashOf(-3).flat).toBe(1);
  });
});
