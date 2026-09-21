import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { InputBus, emitToLive, liveInputBuses } from '../babylon/core/InputBus';

/**
 * The registry body control reaches modes through. Every mode builds its OWN InputBus, so an input source that
 * lives at the shell level — a camera — needs a way to find whichever mode is actually running.
 */
// These suites run in node, not jsdom, so the bus's listeners and poll loop need somewhere to attach. Only the
// registry is under test here; the pad path is covered by InputBus's own suites.
const g = globalThis as unknown as Record<string, unknown>;

beforeEach(() => {
  g.window = {
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(g, 'navigator', { value: { getGamepads: () => [] }, configurable: true, writable: true });
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = () => {};
  liveInputBuses().forEach((b) => b.stop());
});

afterEach(() => {
  liveInputBuses().forEach((b) => b.stop());
  delete g.window; delete g.requestAnimationFrame; delete g.cancelAnimationFrame;
});

describe('finding the running mode', () => {
  it('lists a bus only while it is running', () => {
    const bus = new InputBus();
    expect(liveInputBuses()).not.toContain(bus);
    bus.start();
    expect(liveInputBuses()).toContain(bus);
    bus.stop();
    expect(liveInputBuses()).not.toContain(bus);
  });

  it('DOES NOT EMIT INTO A MODE THAT HAS BEEN TORN DOWN', () => {
    // The bug this shape prevents: the camera keeps running while a mode unmounts, and body control keeps
    // pressing buttons on a dead game — or worse, leaves one held.
    const gone = new InputBus();
    const seen: unknown[] = [];
    gone.on((e) => seen.push(e));
    gone.start();
    gone.stop();

    emitToLive({ t: 'button', btn: 'A', pressed: true });
    expect(seen).toEqual([]);
  });

  it('reaches the mode that is running', () => {
    const bus = new InputBus();
    const seen: unknown[] = [];
    bus.on((e) => seen.push(e));
    bus.start();

    emitToLive({ t: 'button', btn: 'A', pressed: true });
    expect(seen).toContainEqual({ t: 'button', btn: 'A', pressed: true });
    bus.stop();
  });

  it('does not double-register a bus that is started twice', () => {
    const bus = new InputBus();
    bus.start();
    bus.start();
    expect(liveInputBuses().filter((b) => b === bus)).toHaveLength(1);
    bus.stop();
  });
});
