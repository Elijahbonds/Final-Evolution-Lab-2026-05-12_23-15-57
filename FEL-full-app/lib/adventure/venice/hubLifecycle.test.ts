// venice-v2 (2026-11-18): Cursor PR #635's race — a slow first Venice load torn down after a second one began closed the NEWER
// hub. Load, tear down and reload quickly, in every order that happens, and the newer hub must keep running.
import { describe, expect, it } from 'vitest';
import { SceneScoped } from './hubLifecycle';

type Hub = { name: string; closed: boolean };
const sceneA = { id: 'A' }, sceneB = { id: 'B' };

/** What VeniceHubMode does on a scene's disposal: close that hub; reset the page only if it was the current one. */
function tearDown(h: SceneScoped<Hub>, scene: object, page: { card: string | null }) {
  const r = h.close(scene);
  if (r.state) r.state.closed = true;
  if (r.wasCurrent) page.card = null;
  return r;
}

describe('a Venice hub closes with its own scene', () => {
  it('slow first load torn down AFTER the second finished: the second keeps running and keeps the page', () => {
    const h = new SceneScoped<Hub>(), page = { card: null as string | null };
    const a: Hub = { name: 'A', closed: false }, b: Hub = { name: 'B', closed: false };
    h.begin(sceneA);                     // first load starts (slow)
    h.begin(sceneB);                     // the player leaves and comes back: the second load starts
    h.open(sceneB, b); page.card = 'B';  // the second finishes first
    h.open(sceneA, a);                   // the first finishes late
    const r = tearDown(h, sceneA, page); // the first run's teardown
    expect(r.wasCurrent).toBe(false);
    expect(a.closed).toBe(true);
    expect(b.closed).toBe(false);
    expect(page.card).toBe('B');
    expect(r.current).toBe(b);
    expect(h.current()).toBe(b);
  });
  it('first load torn down BEFORE it finished, then the second: nothing of the second is touched', () => {
    const h = new SceneScoped<Hub>(), page = { card: null as string | null };
    const b: Hub = { name: 'B', closed: false };
    h.begin(sceneA);
    h.begin(sceneB);
    const r = tearDown(h, sceneA, page);   // A never opened (its load stops on a disposed scene)
    expect(r.state).toBeUndefined();
    expect(r.wasCurrent).toBe(false);
    h.open(sceneB, b); page.card = 'B';
    expect(h.current()).toBe(b);
    expect(page.card).toBe('B');
  });
  it('the current hub torn down: it closes and the page resets; a reload is current again', () => {
    const h = new SceneScoped<Hub>(), page = { card: 'A' as string | null };
    const a: Hub = { name: 'A', closed: false };
    h.begin(sceneA); h.open(sceneA, a);
    const r = tearDown(h, sceneA, page);
    expect(r.wasCurrent).toBe(true);
    expect(a.closed).toBe(true);
    expect(page.card).toBeNull();
    expect(h.current()).toBeNull();
    const a2: Hub = { name: 'A2', closed: false };
    h.begin(sceneB); h.open(sceneB, a2);
    expect(h.current()).toBe(a2);
    expect(h.scenes()).toEqual([sceneB]);
  });
  it('ten quick load / tear-down / reload cycles leave exactly one live hub', () => {
    const h = new SceneScoped<Hub>(), page = { card: null as string | null };
    let prev: object | null = null;
    for (let i = 0; i < 10; i++) {
      const sc = { id: i }, hub: Hub = { name: String(i), closed: false };
      h.begin(sc); h.open(sc, hub); page.card = hub.name;
      if (prev) tearDown(h, prev, page);   // the old run's teardown lands after the new load
      expect(page.card).toBe(hub.name);
      prev = sc;
    }
    expect(h.scenes()).toHaveLength(1);
  });
});
