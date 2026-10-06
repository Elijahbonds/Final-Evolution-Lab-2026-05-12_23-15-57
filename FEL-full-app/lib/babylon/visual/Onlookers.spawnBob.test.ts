// IMPROVE (2026-10-06, Brain Brawl #16 / #18): Onlookers' opt-in `onSpawn` (each body's root the moment it lands, however
// late) and `idleBobStepSec` (the calm breathe-bob written at most that often; a cheer still moves every frame). Without
// either option the crowd behaves exactly as before.
import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from '@babylonjs/core';

/** When set, each spawn waits for its own gate (a body landing late). */
let gates: (() => void)[] | null = null;
const roots: { position: Vector3; getChildMeshes: () => unknown[] }[] = [];
vi.mock('../core/CharacterLibrary', () => ({
  CharacterLibrary: {
    spawn: async (_s: unknown, _u: unknown, o: { position: Vector3 }) => {
      if (gates) await new Promise<void>((r) => gates!.push(r));
      const root = { position: o.position.clone(), getChildMeshes: () => [] };
      roots.push(root);
      return { root, animator: { currentGroup: { pause: () => {}, restart: () => {} }, play: () => null }, dispose: () => {} };
    },
  },
}));

import { Onlookers } from './Onlookers';

const spots = [new Vector3(1, 0, 0), new Vector3(-1, 0, 0)];
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('Onlookers onSpawn', () => {
  it('hands over every body as it lands — the late one too', async () => {
    roots.length = 0; gates = [];
    const seen: unknown[] = [];
    const crowd = new Onlookers({} as never, spots, '#7c3aed', Vector3.Zero(), { onSpawn: (r) => seen.push(r) });
    await settle();
    expect(seen.length).toBe(0);
    gates[0](); await settle();
    expect(seen).toEqual([roots[0]]);
    gates[1](); await settle();   // lands "after 12 s": the polls this replaces had stopped by then
    expect(seen).toEqual([roots[0], roots[1]]);
    gates = null;
    crowd.dispose();
  });
  it('a throwing callback does not lose the body', async () => {
    roots.length = 0;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const crowd = new Onlookers({} as never, spots, '#7c3aed', Vector3.Zero(), { onSpawn: () => { throw new Error('x'); } });
    await settle();
    crowd.update(0.016);
    expect(roots.length).toBe(2);
    expect(roots[0].position.y).not.toBe(0);   // still bobbed: it is in the crowd
    warn.mockRestore();
    crowd.dispose();
  });
});

describe('Onlookers idleBobStepSec', () => {
  it('writes the calm bob only once per step, and every frame while cheering', async () => {
    roots.length = 0;
    const crowd = new Onlookers({} as never, spots, '#7c3aed', Vector3.Zero(), { idleBobStepSec: 0.1 });
    await settle();
    crowd.update(0.12);
    const y1 = roots[0].position.y;
    crowd.update(0.03);   // 0.03 s since the last write: held
    expect(roots[0].position.y).toBe(y1);
    crowd.update(0.03);
    expect(roots[0].position.y).toBe(y1);
    crowd.update(0.05);   // 0.11 s: written
    expect(roots[0].position.y).not.toBe(y1);
    crowd.cheer(1);
    const y2 = roots[0].position.y;
    crowd.update(0.016);
    const y3 = roots[0].position.y;
    crowd.update(0.016);
    expect(y3).not.toBe(y2);
    expect(roots[0].position.y).not.toBe(y3);   // cheering: every frame
    crowd.dispose();
  });
  it('without the option the bob is written every frame (unchanged)', async () => {
    roots.length = 0;
    const crowd = new Onlookers({} as never, spots, '#7c3aed', Vector3.Zero());
    await settle();
    crowd.update(0.03);
    const y1 = roots[0].position.y;
    crowd.update(0.03);
    expect(roots[0].position.y).not.toBe(y1);
    crowd.dispose();
  });
});
