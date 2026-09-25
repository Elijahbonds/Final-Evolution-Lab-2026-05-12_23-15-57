// A mount that never finishes leaves no Body card behind (movement play P3, step 3, the review, 2026-09-24).
//
// runMode mounts the mode's card in sessionStore first, before any await (so mounts land in call order), and hands its
// disposer back only once the mode is up. A throw anywhere in between — the engine, the canvas fit, the scene, a rig —
// used to be caught only for createEngine: the rest left a dead mode's card (its moves, "raise both hands") up until
// the next mount. The real harness, with its engine and its canvas fit stood in for, so the failure lands exactly
// between the two.
import { describe, it, expect, vi, afterEach } from 'vitest';

const fail = vi.hoisted(() => ({ engine: false }));
vi.mock('./createEngine', () => ({
  createEngine: async () => {
    if (fail.engine) throw new Error('no WebGL here');
    return { fake: 'engine' };
  },
}));
vi.mock('./canvasFit', () => ({
  applyCanvasFit: () => { throw new Error('the canvas went away mid-mount'); },
}));

import { runMode, type HarnessOpts, type ModeDefinition } from './ModeHarness';
import { sessionStore } from './sessionStore';

const def = { modeId: 'skateboard', mood: 'day', load: async () => {}, onInput: () => {}, update: () => {} } as unknown as ModeDefinition;
const opts = { canvas: {} as HTMLCanvasElement, resultSink: () => {} } as unknown as HarnessOpts;

afterEach(() => { fail.engine = false; });

describe('runMode: the card comes down with a mount that failed', () => {
  it('a throw after the engine (the canvas fit here) unmounts the card and still rejects', async () => {
    const seen: (string | null)[] = [];
    const off = sessionStore.subscribe(() => seen.push(sessionStore.view().modeId));
    await expect(runMode(def, opts)).rejects.toThrow('the canvas went away mid-mount');
    off();
    expect(seen).toEqual(['skateboard', null]);         // mounted first (call order), then taken down
    expect(sessionStore.view().modeId).toBeNull();
  });
  it('a failed engine does the same', async () => {
    fail.engine = true;
    await expect(runMode(def, opts)).rejects.toThrow('no WebGL here');
    expect(sessionStore.view().modeId).toBeNull();
  });
  it('a failed mount never takes down the card of a mount that came after it (a quick remount)', async () => {
    const run = runMode(def, opts);                      // skateboard's card goes up, then it awaits its engine…
    const later = sessionStore.mount({ modeId: 'dunk', key: 'dunk', lines: [], drives: false, later: 'P5' });   // …and a remount lands
    await expect(run).rejects.toThrow('the canvas went away mid-mount');
    expect(sessionStore.view().modeId).toBe('dunk');    // the failed mount's writer was stale: dunk's card stays
    later.unmount();
  });
});
