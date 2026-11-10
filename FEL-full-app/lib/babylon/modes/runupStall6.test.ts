// RUNUP-STALL-6 (2026-10-31): with dunk.preloadSet on, the paced body-mask path must finish and stay bounded on a scene
// whose observables behave like Babylon's (an addOnce made inside a notification runs in the SAME pass). AM's df51b03e
// gate hung there: the first-draw wait re-added itself forever in one after-render (7-9 GB, never TAP TO START).
import { describe, expect, it, vi } from 'vitest';
import { Observable } from '@babylonjs/core';
import { scheduleBodyMask, setMaskOnePerFrame, nextAfterRender, FIRST_DRAW_WAIT_MAX } from '../core/bodyMask';

/** Babylon's own Observable on both render hooks, a real frame counter, and a cap that turns a runaway into a failure. */
function babylonLikeScene(cap = 5000) {
  const before = new Observable<unknown>(), after = new Observable<unknown>();
  let adds = 0, frame = 0;
  for (const o of [before, after]) {
    const addOnce = o.addOnce.bind(o);
    (o as unknown as { addOnce: typeof addOnce }).addOnce = ((cb: never) => { if (++adds > cap) throw new Error(`runaway: ${adds} observers added`); return addOnce(cb); }) as never;
  }
  const scene = { onBeforeRenderObservable: before, onAfterRenderObservable: after, getFrameId: () => frame };
  const render = () => { frame++; before.notifyObservers(scene); after.notifyObservers(scene); };
  return { scene, render, adds: () => adds, observers: () => [...before.observers, ...after.observers].filter((o) => !(o as unknown as { _willBeUnregistered?: boolean })._willBeUnregistered).length };   // live ones (Babylon drops spent addOnce observers on a deferred tick)
}
const body = (scene: unknown) => ({ name: 'Body', skeleton: {}, getScene: () => scene, isDisposed: () => false, computeWorldMatrix: () => ({ m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }) });
function fitsPer(fn: () => void): number {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try { fn(); return warn.mock.calls.filter((c) => String(c[0]).startsWith('[FEL-KIT] body mask skipped')).length; } finally { warn.mockRestore(); }
}

describe('RUNUP-STALL-6: the knob-on (paced) mask path terminates, bounded, on Babylon observables', () => {
  it('Babylon really does run an addOnce made inside a notification in the same pass (the trap)', () => {
    const obs = new Observable<number>(); let calls = 0;
    const cb = () => { if (++calls < 5) obs.addOnce(cb); };
    obs.addOnce(cb); obs.notifyObservers(0);
    expect(calls).toBe(5);   // all five in ONE notification
  });
  it('nextAfterRender lands on the next frame, not the same pass', () => {
    const { scene, render } = babylonLikeScene(); let at = -1;
    scene.onAfterRenderObservable.addOnce(() => nextAfterRender(scene as never, () => { at = scene.getFrameId(); }));
    render(); expect(at).toBe(-1);
    render(); expect(at).toBe(2);
  });
  it('six paced bodies (his + five onlookers): every one fits, at most one a frame, and the work ends', () => {
    const s = babylonLikeScene();
    setMaskOnePerFrame(s.scene as never, true);
    for (let i = 0; i < 6; i++) scheduleBodyMask([body(s.scene)] as never);
    const perFrame: number[] = [];
    for (let f = 0; f < 40; f++) perFrame.push(fitsPer(s.render));   // FAILS (runaway throw) on df51b03e
    expect(perFrame.reduce((a, b) => a + b, 0)).toBe(6);
    expect(Math.max(...perFrame)).toBe(1);
    expect(perFrame[0]).toBe(0);                    // nothing on the body's first-draw frame (render 1); the first fit is render 2
    expect(s.observers()).toBe(0);                  // nothing left waiting: memory stays bounded
    expect(s.adds()).toBeLessThan(200);             // a bounded number of observers over the whole preload
  });
  it('the first-draw wait is capped even if the frame counter never moves', () => {
    const s = babylonLikeScene(); const stuck = { ...s.scene, getFrameId: () => 0 };
    setMaskOnePerFrame(stuck as never, true);
    scheduleBodyMask([body(stuck)] as never);
    let fits = 0; for (let f = 0; f < FIRST_DRAW_WAIT_MAX + 4; f++) fits += fitsPer(s.render);
    expect(fits).toBe(1);
    expect(s.observers()).toBe(0);
  });
  it('knob off (not paced): unchanged, the body fits on the first render', () => {
    const s = babylonLikeScene();
    scheduleBodyMask([body(s.scene)] as never);
    expect(fitsPer(s.render)).toBe(1);
  });
});
