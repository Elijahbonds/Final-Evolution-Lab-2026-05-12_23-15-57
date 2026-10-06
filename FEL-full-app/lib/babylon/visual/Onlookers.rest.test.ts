// IMPROVE (2026-10-06, the Cypher's #20): Onlookers' opt-in `restBetweenCheers` — the ring's clips hold still between
// cheers and a cheer starts them again; without the option nothing is ever paused (every other crowd is unchanged).
import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from '@babylonjs/core';

const groups: { paused: number; restarted: number }[] = [];
/** When set, each spawn waits for its own gate (a body landing late). */
let gates: (() => void)[] | null = null;
vi.mock('../core/CharacterLibrary', () => ({
  CharacterLibrary: {
    spawn: async () => {
      if (gates) await new Promise<void>((r) => gates!.push(r));
      const g = { paused: 0, restarted: 0 };
      groups.push(g);
      const group = { pause: () => { g.paused++; }, restart: () => { g.restarted++; } };
      return {
        root: { position: new Vector3(), getChildMeshes: () => [] },
        animator: { currentGroup: group, play: () => null },
        dispose: () => {},
      };
    },
  },
}));

import { Onlookers } from './Onlookers';

const spots = [new Vector3(1, 0, 0), new Vector3(-1, 0, 0)];
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('Onlookers restBetweenCheers', () => {
  it('holds each body once it has posed and the crowd is calm; a cheer starts it again, and it rests after', async () => {
    groups.length = 0;
    const crowd = new Onlookers({} as never, spots, '#d946ef', Vector3.Zero(), { restBetweenCheers: true });
    await settle();
    expect(groups.length).toBe(2);
    crowd.update(0.3);
    expect(groups.every((g) => g.paused === 0)).toBe(true);   // too young: its clip has not posed it yet
    crowd.update(0.4);
    expect(groups.every((g) => g.paused === 1)).toBe(true);
    crowd.update(1);
    expect(groups.every((g) => g.paused === 1)).toBe(true);   // paused once, not every frame
    crowd.cheer(1);
    expect(groups.every((g) => g.restarted === 1)).toBe(true);
    crowd.update(1);
    expect(groups.every((g) => g.paused === 1)).toBe(true);   // still cheering
    crowd.update(1.5);
    expect(groups.every((g) => g.paused === 2)).toBe(true);   // the cheer ran out and the calm passed: rests again
    crowd.dispose();
  });
  it('a body that lands into an already calm crowd still poses before it rests (never held at its bind pose)', async () => {
    groups.length = 0;
    gates = [];
    const crowd = new Onlookers({} as never, spots, '#d946ef', Vector3.Zero(), { restBetweenCheers: true });
    await settle();
    gates[0]();   // the first body lands
    await settle();
    crowd.update(1);
    expect(groups[0].paused).toBe(1);
    gates[1]();   // the second lands a second later, into a calm crowd
    await settle();
    crowd.update(0.016);
    expect(groups[1].paused).toBe(0);
    crowd.update(0.7);
    expect(groups[1].paused).toBe(1);
    gates = null;
    crowd.dispose();
  });
  it('without the option nothing is paused', async () => {
    groups.length = 0;
    const crowd = new Onlookers({} as never, spots);
    await settle();
    for (let i = 0; i < 10; i++) crowd.update(0.5);
    crowd.cheer(1);
    expect(groups.every((g) => g.paused === 0 && g.restarted === 0)).toBe(true);
    crowd.dispose();
  });
});
