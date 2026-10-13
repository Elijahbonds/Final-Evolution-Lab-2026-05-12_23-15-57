// The Cypher's LED wall (vis-party, 2026-10-13): what each cell shows is a pure function of the song's beat/bar position, so the
// wall is on the song's clock; reduced flashing holds a pattern for a whole bar; the mesh carries the name the foundation's glow
// include list matches.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import {
  LED_COLS, LED_ROWS, ledCardText, ledCell, ledColors, ledFrameKey, ledKindAt, mountLedWall, hash01, type LedKind, type LedState,
} from './ledWall';

const painted: string[] = [];
const transforms: number[][] = [];
const ctx2d = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 100 });
    if (k === 'fillText') return (t: string) => { painted.push(t); };
    if (k === 'setTransform') return (...a: number[]) => { transforms.push(a); };
    return () => {};
  },
  set: () => true,
});
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class { width = 1; height = 1; getContext() { return ctx2d; } };

const st = (beatIndex: number, beatPhase: number, barIndex = Math.floor(beatIndex / 4), calm = false, cheer = 0): LedState => ({ beatIndex, beatPhase, barIndex, cheer, calm });
const frame = (kind: LedKind, s: LedState): number[] => {
  const out: number[] = [];
  for (let r = 0; r < LED_ROWS; r++) for (let c = 0; c < LED_COLS; c++) out.push(ledCell(kind, c, r, s));
  return out;
};

describe('the LED wall: patterns', () => {
  it('runs a phrase — the count-in is the name card, then the bars cycle through every pattern', () => {
    expect(ledKindAt(-1)).toBe('name');
    expect(ledKindAt(-4)).toBe('name');
    const kinds = new Set<LedKind>();
    for (let b = 0; b < 12; b++) kinds.add(ledKindAt(b));
    expect([...kinds].sort()).toEqual(['chevron', 'eq', 'name', 'rings']);
  });
  it('every cell is lit between 0 and 1, whatever the pattern and the beat', () => {
    for (const kind of ['name', 'eq', 'chevron', 'rings'] as LedKind[]) for (let b = 0; b < 9; b++) for (const p of [0, 0.3, 0.99]) {
      for (const v of frame(kind, st(b, p))) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });
  it('the moving patterns actually move: a new beat is a different picture', () => {
    for (const kind of ['eq', 'chevron', 'rings'] as LedKind[]) {
      expect(frame(kind, st(4, 0.5))).not.toEqual(frame(kind, st(5, 0.5)));
    }
  });
  it('the same song position is the same picture (a paused song freezes the wall; a rewind returns to what it showed)', () => {
    const a = frame('eq', st(7, 0.4)); frame('eq', st(30, 0.1));
    expect(frame('eq', st(7, 0.4))).toEqual(a);
  });
  it('reduced flashing holds the pattern for the whole bar: no cell changes between beats of one bar', () => {
    for (const kind of ['eq', 'chevron', 'rings'] as LedKind[]) {
      const first = frame(kind, st(8, 0, 2, true));
      for (const [beat, p] of [[8, 0.5], [9, 0], [10, 0.7], [11, 0.99]] as const) expect(frame(kind, st(beat, p, 2, true))).toEqual(first);
      expect(frame(kind, st(12, 0, 3, true))).not.toEqual(first);   // …and moves on at the next bar
    }
  });
  it('the equaliser has a bright cap and is brighter at the bottom of a bar than nothing', () => {
    const f = frame('eq', st(3, 0.9));
    expect(Math.max(...f)).toBe(1);
    expect(f.filter((v) => v > 0).length).toBeGreaterThan(LED_COLS);   // more than one lit cell per column
  });
  it('the hash is deterministic and in range (the same wall on every machine)', () => {
    expect(hash01(3, 4)).toBe(hash01(3, 4));
    for (let i = 0; i < 200; i++) { const h = hash01(i * 1.7, i); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1); }
  });
});

describe('the LED wall: colours, text, repaint key', () => {
  it('each bar has two hex colours and they cycle', () => {
    for (let b = -2; b < 9; b++) for (const c of ledColors(b)) expect(c).toMatch(/^#[0-9A-F]{6}$/i);
    expect(ledColors(0)).toEqual(ledColors(4));
    expect(ledColors(0)).not.toEqual(ledColors(1));
  });
  it('the name card cycles the room, the player and the song — and skips the player when the device has none', () => {
    expect(ledCardText(0, 'WINDWARD CIRCLE', 'ELI')).toBe('THE CYPHER');
    expect(ledCardText(6, 'WINDWARD CIRCLE', 'ELI')).toBe('ELI');
    expect(ledCardText(12, 'WINDWARD CIRCLE', 'ELI')).toBe('WINDWARD CIRCLE');
    expect(ledCardText(6, 'WINDWARD CIRCLE', '')).toBe('WINDWARD CIRCLE');
    expect(ledCardText(-1, 'X', 'Y')).toBe('THE CYPHER');
  });
  it('repaints only when the picture changes: quarter-beats live, whole bars calm, a static card barely at all', () => {
    expect(ledFrameKey(st(5, 0.1))).toBe(ledFrameKey(st(5, 0.2)));
    expect(ledFrameKey(st(5, 0.1))).not.toBe(ledFrameKey(st(5, 0.3)));
    expect(ledFrameKey(st(5, 0.1, 1, true))).toBe(ledFrameKey(st(6, 0.9, 1, true)));
    expect(ledFrameKey(st(0, 0.1, 0))).toBe(ledFrameKey(st(3, 0.9, 0)));   // bar 0 is the name card: it does not move
    expect(ledFrameKey(st(5, 0.1, 1, false, 0))).not.toBe(ledFrameKey(st(5, 0.1, 1, false, 1)));   // a cheer repaints
    expect(ledFrameKey(st(5, 0.1, 1, true, 0))).toBe(ledFrameKey(st(5, 0.1, 1, true, 1.2)));       // …but not under reduced flashing
  });
});

describe('the LED wall: the mesh', () => {
  let scene: Scene;
  beforeAll(() => { scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene); });
  it('is an emissive screen plane kept OUT of the glow include list (a halo would be drawn over the dancer in front of it), repainting only on a new key', async () => {
    const { glowCandidate } = await import('../scene/EmissiveGlow');
    const w = mountLedWall(scene, { at: [0, 4, 14], width: 15, height: 3.3, small: false, track: 'WINDWARD CIRCLE', player: 'ELI' });
    expect(glowCandidate(w.mesh.name, w.mesh.material!.name, 1, true)).toBe(false);
    expect(w.update(st(5, 0.1))).toBe(true);                            // the first frame paints (bar 1: a moving pattern)
    expect(w.update(st(5, 0.15))).toBe(false);                          // same key: no repaint
    expect(w.update(st(5, 0.6))).toBe(true);                            // a new quarter-beat
    painted.length = 0;
    w.update(st(0, 0, -1, false));                                      // the count-in: the name card
    expect(painted).toContain('THE CYPHER');
    w.setTrack('MIDNIGHT RUN');
    painted.length = 0;
    w.update(st(0, 0, 12, false));                                      // bar 12 → the third line of the card cycle
    expect(painted).toContain('MIDNIGHT RUN');
    w.dispose();
  });
  it('reads forwards from the stage camera on the −z side (painted mirrored: a negative uScale clamps to a flat colour) and is emissive over a black albedo', () => {
    const w = mountLedWall(scene, { at: [0, 4, 14], width: 15, height: 3.3, small: false, track: 'A' });
    transforms.length = 0;
    w.update(st(5, 0.1));
    expect(transforms[0]).toEqual([-1, 0, 0, 1, 768, 0]);          // the canvas is flipped in x for the paint…
    expect(transforms[transforms.length - 1]).toEqual([1, 0, 0, 1, 0, 0]);   // …and put back
    const m = w.mesh.material as unknown as { unlit: boolean; emissiveTexture: { uScale: number }; albedoColor: { r: number; g: number; b: number } };
    expect(m.emissiveTexture.uScale).toBe(1);
    expect(m.unlit).toBeFalsy();
    expect(m.albedoColor.r + m.albedoColor.g + m.albedoColor.b).toBe(0);
    w.dispose();
  });
  it('a small (phone) wall is half the texture size', () => {
    const big = mountLedWall(scene, { at: [0, 4, 14], width: 15, height: 3.3, small: false, track: 'A' });
    const small = mountLedWall(scene, { at: [0, 4, 14], width: 15, height: 3.3, small: true, track: 'A' });
    const sz = (m: typeof big): number => (m.mesh.material as unknown as { emissiveTexture: { getSize(): { width: number } } }).emissiveTexture.getSize().width;
    expect(sz(big)).toBe(sz(small) * 2);
    big.dispose(); small.dispose();
  });
});
