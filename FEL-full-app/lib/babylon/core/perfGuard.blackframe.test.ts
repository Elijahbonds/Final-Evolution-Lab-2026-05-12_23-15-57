// perfGuard — the one-frame black flash when the governor lowers resolution (issue #352). A hardware-scaling change
// resizes the canvas, which clears it; the guard must draw one frame AT ONCE (synchronously, before any rAF or timer
// fires), in 'run' and 'low', never in 'stop', and without queueing anything the paced loop did not already have.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NullEngine, Scene, FreeCamera, Vector3 } from '@babylonjs/core';
import { mountPerfGuard, type GuardHost, type PerfGuardHandle } from './perfGuard';
import { LEVELS, IDLE_FRAME_MS } from './PerfGovernor';
import type { FitResult } from './canvasFit';

/** A scripted browser: rAF and timers run only when the test advances the clock (as in perfGuard.test.ts). */
class FakeHost implements GuardHost {
  t = 0;
  isHidden = false;
  private seq = 0;
  raf = new Map<number, (t: number) => void>();
  timers = new Map<number, { at: number; cb: () => void }>();
  vis: Array<() => void> = [];
  requestAnimationFrame(cb: (t: number) => void): number { const id = ++this.seq; this.raf.set(id, cb); return id; }
  cancelAnimationFrame(id: number): void { this.raf.delete(id); }
  setTimeout(cb: () => void, ms: number): number { const id = ++this.seq; this.timers.set(id, { at: this.t + ms, cb }); return id; }
  clearTimeout(id: number): void { this.timers.delete(id); }
  now(): number { return this.t; }
  hidden(): boolean { return this.isHidden; }
  onVisibility(cb: () => void): () => void { this.vis.push(cb); return () => { this.vis = this.vis.filter((x) => x !== cb); }; }
  vsync(ms = 1000 / 60): void {
    this.t += ms;
    for (const [id, tm] of [...this.timers]) if (tm.at <= this.t) { this.timers.delete(id); tm.cb(); }
    const due = [...this.raf]; this.raf.clear();
    for (const [, cb] of due) cb(this.t);
  }
  run(ms: number, hz = 60): void { const end = this.t + ms; while (this.t < end - 1e-6) this.vsync(1000 / hz); }
  setHidden(h: boolean): void { this.isHidden = h; for (const v of this.vis) v(); }
  /** What is queued, by id: an unchanged queue keeps the same ids. */
  queued(): string { return `raf[${[...this.raf.keys()].join(',')}] timers[${[...this.timers.keys()].join(',')}]`; }
}

const FIT: FitResult = { hardwareScalingLevel: 0.5, effectiveDpr: 2, backingWidth: 780, backingHeight: 1688, limitedBy: 'dpr' };
const PHONE = { pacing: true, governor: true, hud: false };

let engine: NullEngine, scene: Scene, host: FakeHost, guard: PerfGuardHandle, renders: number;
let hw = 1;
let inRender: (() => void) | null = null;
beforeEach(() => {
  engine = new NullEngine();
  engine.setHardwareScalingLevel = (l: number) => { hw = l; };
  engine.getHardwareScalingLevel = () => hw;
  scene = new Scene(engine);
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  host = new FakeHost();
  engine.setHardwareScalingLevel(FIT.hardwareScalingLevel);
  renders = 0;
  inRender = null;
});
afterEach(() => { guard?.dispose(); scene.dispose(); engine.dispose(); });

function mount(policy = PHONE): void {
  guard = mountPerfGuard({ engine, scene, tier: 'mobile', fit: FIT, host, policy });
  guard.setPhase('playing');
  engine.runRenderLoop(() => { renders++; scene.render(); const f = inRender; inRender = null; f?.(); });
}

describe('a resolution change draws one frame at once (#352)', () => {
  it("'run': a level that changes the scale renders exactly one frame synchronously and queues nothing new", () => {
    mount();
    host.run(200);
    const q0 = host.queued(), r0 = renders;
    guard.force(2);
    expect(engine.getHardwareScalingLevel()).toBeCloseTo(0.5 / LEVELS[2].renderScale);
    expect(renders).toBe(r0 + 1);          // before any vsync
    expect(host.queued()).toBe(q0);         // the same queued tick, no second one
    host.vsync();
    expect(renders).toBe(r0 + 2);           // and the loop carries on at one frame per tick, not two
    host.run(1000);
    expect(renders - r0 - 2).toBeGreaterThanOrEqual(58);
    expect(renders - r0 - 2).toBeLessThanOrEqual(61);
  });

  it("'low': an idle scene draws one frame at once, keeps its one idle timer and queues no rAF", () => {
    mount();
    host.run(200);
    guard.setPhase('paused');
    host.run(IDLE_FRAME_MS * 2);
    const q0 = host.queued(), r0 = renders;
    expect(host.timers.size).toBe(1);
    guard.force(3);
    expect(renders).toBe(r0 + 1);
    expect(host.queued()).toBe(q0);
    host.run(IDLE_FRAME_MS * 4);
    expect(renders - r0 - 1).toBeLessThanOrEqual(5);   // still the idle rate
  });

  it("'stop': a hidden page draws nothing and queues nothing; it renders again on show", () => {
    mount();
    host.run(200);
    host.setHidden(true);
    host.run(100);                           // the tick queued before the hide drains; nothing polls after it
    expect(host.raf.size + host.timers.size).toBe(0);
    const r0 = renders;
    guard.force(2);
    expect(renders).toBe(r0);
    expect(host.raf.size + host.timers.size).toBe(0);
    host.setHidden(false);
    host.run(200);
    expect(renders).toBeGreaterThan(r0);
  });

  it('a level change that leaves the scale alone renders nothing extra', () => {
    mount();
    host.run(200);
    const r0 = renders, q0 = host.queued();
    guard.force(0, 30);                     // level 0 → level 0, only the cap moves
    expect(renders).toBe(r0);
    expect(host.queued()).toBe(q0);
    guard.force(2);
    const r1 = renders;
    guard.force(2);                          // the same level again
    expect(renders).toBe(r1);
  });

  it('an ungoverned tier never scales, so a forced level renders nothing extra', () => {
    mount({ pacing: false, governor: false, hud: false });
    host.run(200);
    const r0 = renders;
    guard.force(3);
    expect(engine.getHardwareScalingLevel()).toBe(0.5);
    expect(renders).toBe(r0);
  });

  it('a scale change from inside a frame (the governor) redraws once right after it, in the same tick, without re-entering', () => {
    mount();
    host.run(200);
    let depth = 0, maxDepth = 0;
    scene.onBeforeRenderObservable.add(() => { depth++; maxDepth = Math.max(maxDepth, depth); });
    scene.onAfterRenderObservable.add(() => { depth--; });
    const r0 = renders;
    inRender = () => guard.force(2);
    host.vsync();
    expect(renders).toBe(r0 + 2);           // the paced frame, then the redraw, before the next vsync
    expect(maxDepth).toBe(1);               // never a frame inside a frame
    expect(host.raf.size).toBe(1);          // one queued tick, as always
    expect(host.timers.size).toBe(0);
    host.vsync();
    expect(renders).toBe(r0 + 3);
  });

  it('the redraw does not feed the governor a frame (its measured fps is unchanged by it)', () => {
    mount();
    host.run(1000);
    const fps0 = guard.snapshot().fps;
    guard.force(2);
    expect(guard.snapshot().fps).toBeCloseTo(fps0, 6);
  });
});
