// Phase F-lite (lane/coast-f): crossing into a piece no longer builds its fine ground and refreshes every prop model in that frame
// (coast.streamSliced): the coarse ground stands in, and the work runs one job a frame. The first stream (the load) still builds
// at once. Same end state as the old way.
// zoneView paints DynamicTextures, which reach for OffscreenCanvas — a no-op 2D surface lets it build under node.
if (typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas === 'undefined') {
  const ctx2d = new Proxy({}, {
    get: (_t, k) => (k === 'measureText' ? () => ({ width: 0 })
      : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => undefined })
      : k === 'getImageData' ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })
      : () => undefined),
    set: () => true,
  });
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    width: number; height: number;
    constructor(w: number, h: number) { this.width = w; this.height = h; }
    getContext(): unknown { return ctx2d; }
  };
}
import { describe, expect, it, vi } from 'vitest';
import { NullEngine, Scene } from '@babylonjs/core';
import { COAST_STREAM_SLICED, mountZoneView } from './zoneView';
import { COAST_STREAM_FULL, COAST_STREAM_KEEP, COAST_STREAM_LOD, pieceAt, zonePieces, ZoneStreamer, arrivalSpawn } from './zoneLayout';

const rings = { full: COAST_STREAM_FULL, lod: COAST_STREAM_LOD, keep: COAST_STREAM_KEEP };
const fineCount = (scene: Scene) => scene.meshes.filter((m) => m.name.startsWith('coast_t_f_') && !m.isDisposed()).length;

function mount(sliced: boolean) {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);   // the prop models do not load under node: skipped, as on a failed fetch
  const scene = new Scene(new NullEngine());
  const view = mountZoneView(scene, { streamOn: true, sliced });
  const s = new ZoneStreamer(rings);
  const a = arrivalSpawn().pos, [i, j] = pieceAt(a.x, a.z);
  s.step(i, j);
  view.stream(s.tiers, zonePieces().map((p) => p.key));
  return { scene, view, s, i, j };
}

describe('coast.streamSliced: the crossing frame does one job, not all of them', () => {
  it('ships on (1)', () => { expect(COAST_STREAM_SLICED).toBe(1); });

  it('the load still builds the full ring at once', () => {
    const z = mount(true);
    const full = [...z.s.tiers.values()].filter((t) => t === 'full').length;
    expect(z.view.stats().fineMeshes).toBe(full - 0);   // every full land piece in view at once (sea pieces have no ground)
    expect(z.view.stats().pending).toBe(0);
  });

  it('crossing: nothing is built in the stream call; then at most one fine ground a frame, the coarse standing in; same end state as the old way', () => {
    const sliced = mount(true), whole = mount(false);
    // walk one piece inland (+x) in both
    for (const z of [sliced, whole]) { const ch = z.s.step(z.i + 1, z.j); z.view.stream(z.s.tiers, ch); }
    const before = fineCount(sliced.scene);
    expect(sliced.view.stats().pending).toBeGreaterThan(0);
    // the old way built the newly full pieces in the stream call; the sliced one has built none yet
    expect(fineCount(whole.scene)).toBeGreaterThan(before - 0);
    let last = before, frames = 0;
    while (sliced.view.stats().pending > 0 && frames < 60) {
      sliced.view.frame(0, 0, 1 / 60); frames++;
      const n = fineCount(sliced.scene);
      expect(n - last).toBeLessThanOrEqual(1);   // one build a frame at most
      last = n;
    }
    expect(sliced.view.stats().pending).toBe(0);
    // the old way's load-ahead and this one's have both had their frames: the same pieces shown, fine and coarse
    for (let k = 0; k < 30; k++) { sliced.view.frame(0, 0, 1 / 60); whole.view.frame(0, 0, 1 / 60); }
    const a = sliced.view.stats(), b = whole.view.stats();
    expect(a.fineMeshes).toBe(b.fineMeshes);
    expect(a.coarseMeshes).toBe(b.coarseMeshes);
  });
});
