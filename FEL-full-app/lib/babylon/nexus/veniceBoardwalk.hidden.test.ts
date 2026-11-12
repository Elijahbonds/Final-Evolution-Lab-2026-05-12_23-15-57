// DUNK-FLAGSHIP (2026-10-27): the Venice dunk dressing's files are hidden the moment each one lands. They wait at the world origin
// until all five have loaded, and the boardwalk's fronts stood between the run-up camera and the dunker (measured on the rig: a
// ray from the camera to the hero hit facade_taco, facade_tattoo and the hero palm through the first runway of the night).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneLoader } from '@babylonjs/core';
import { mountVeniceDunkDressing } from './veniceBoardwalk';

interface FakeRoot { enabled: boolean; setEnabled(v: boolean): void; dispose(): void }
const root = (): FakeRoot => ({ enabled: true, setEnabled(v) { this.enabled = v; }, dispose() {} });

afterEach(() => vi.restoreAllMocks());

describe('the Venice dunk dressing while it loads', () => {
  it('hides each file the moment it lands, while the others are still loading', async () => {
    const roots: FakeRoot[] = [];
    const pending: Array<(v: unknown) => void> = [];
    const rejects: Array<(e: unknown) => void> = [];
    vi.spyOn(SceneLoader, 'ImportMeshAsync').mockImplementation((() => new Promise((res, rej) => { pending.push(res); rejects.push(rej); })) as never);
    const scene = { isDisposed: false } as never, holder = { isDisposed: () => false } as never;
    const run = mountVeniceDunkDressing(scene, holder).catch((e: Error) => e.message);
    expect(pending.length).toBe(5);
    // the first four arrive; the crowd is still on the wire
    for (let i = 0; i < 4; i++) { const r = root(); roots.push(r); pending[i]({ meshes: [r] }); }
    await new Promise((r) => setTimeout(r, 0));
    expect(roots.map((r) => r.enabled)).toEqual([false, false, false, false]);   // nothing stands at the origin waiting
    rejects[4](new Error('offline'));
    expect(await run).toMatch(/did not load/);   // a failed load still drops the dressing (unchanged)
  });
});
