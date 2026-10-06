// IMPROVE (2026-10-06, surf item 6): the beach crowd behind the surf lens is put away — disabled, its clip paused — and comes back
// (clip resumed) when it is in front again. Opt-in: a crowd nobody culls is untouched.
import { describe, expect, it, vi } from 'vitest';
import type { Scene } from '@babylonjs/core';
import { Onlookers } from './Onlookers';

function crowdAt(zs: number[]) {
  const o = new Onlookers({} as Scene, []);   // no spots: nothing spawns; the bodies are handed in below
  const bodies = zs.map((z) => {
    const group = { pause: vi.fn(), restart: vi.fn() };
    let enabled = true;
    const root = { position: { x: 0, y: 0, z }, setEnabled: (on: boolean) => { enabled = on; } };
    const char = { root, animator: { currentGroup: group }, dispose: () => undefined };
    return { char, root, baseY: 0, phase: 0, group, enabled: () => enabled };
  });
  (o as unknown as { figures: unknown[] }).figures.push(...bodies);
  return { o, bodies };
}

describe('Onlookers.cullBehind (surf item 6)', () => {
  const eye = { x: 0, y: 3, z: -38 };
  const toSea = { x: 0, y: 0, z: -1 };   // the surf lens: out to sea, the beach behind it
  it('puts away the bodies behind the lens and pauses their clips; the ones in front stay', () => {
    const { o, bodies } = crowdAt([131, 135, -80]);
    expect(o.cullBehind(eye, toSea)).toBe(1);
    expect(bodies.map((b) => b.enabled())).toEqual([false, false, true]);
    expect(bodies[0].group.pause).toHaveBeenCalledTimes(1);
    expect(bodies[2].group.pause).not.toHaveBeenCalled();
    o.cullBehind(eye, toSea);                          // no change, no second pause
    expect(bodies[0].group.pause).toHaveBeenCalledTimes(1);
  });
  it('brings them back, clip resumed, when the lens turns to them', () => {
    const { o, bodies } = crowdAt([131]);
    o.cullBehind(eye, toSea);
    expect(o.cullBehind(eye, { x: 0, y: 0, z: 1 })).toBe(1);
    expect(bodies[0].enabled()).toBe(true);
    expect(bodies[0].group.restart).toHaveBeenCalledTimes(1);
  });
  it('a body just behind the lens plane (inside the margin) is kept', () => {
    const { o } = crowdAt([-36]);
    expect(o.cullBehind(eye, toSea)).toBe(1);
  });
});
