// FOLDABLE-SCREEN: a fold or rotation mid-session must re-fit the engine in place — no reload, no state
// loss. Before this watcher the harness heard only window `resize`; a foldable's cover↔main swap announces
// itself on `orientationchange` and the visualViewport first, and could leave the canvas mis-sized for the
// rest of the run. Node environment on purpose: EventTarget stands in for the window, no DOM, no GPU.
import { describe, expect, it, vi } from 'vitest';
import { watchCanvasFit } from './canvasFit';

class FakeHost extends EventTarget {
  visualViewport: EventTarget | null = new EventTarget();
}

const fakeEngine = () => ({ setHardwareScalingLevel: vi.fn(), resize: vi.fn() });
const canvas = { clientWidth: 800, clientHeight: 450 };

describe('watchCanvasFit — FOLDABLE-SCREEN', () => {
  it('re-fits in place on resize, orientationchange, and visualViewport resize; unwatch stops all three', () => {
    const host = new FakeHost();
    const engine = fakeEngine();
    const unwatch = watchCanvasFit(engine, canvas, host);

    host.dispatchEvent(new Event('resize'));               // classic window resize
    host.dispatchEvent(new Event('orientationchange'));    // fold flip / rotation
    host.visualViewport!.dispatchEvent(new Event('resize')); // cover↔main swap fires here first
    expect(engine.resize).toHaveBeenCalledTimes(3);
    expect(engine.setHardwareScalingLevel).toHaveBeenCalledTimes(3);

    unwatch();
    host.dispatchEvent(new Event('resize'));
    host.dispatchEvent(new Event('orientationchange'));
    host.visualViewport!.dispatchEvent(new Event('resize'));
    expect(engine.resize).toHaveBeenCalledTimes(3);        // torn down with the mode
  });

  it('a host with no visualViewport still re-fits on resize and orientationchange', () => {
    const host = new FakeHost();
    host.visualViewport = null;
    const engine = fakeEngine();
    const unwatch = watchCanvasFit(engine, canvas, host);
    host.dispatchEvent(new Event('resize'));
    host.dispatchEvent(new Event('orientationchange'));
    expect(engine.resize).toHaveBeenCalledTimes(2);
    unwatch();
    host.dispatchEvent(new Event('resize'));
    expect(engine.resize).toHaveBeenCalledTimes(2);
  });
});
