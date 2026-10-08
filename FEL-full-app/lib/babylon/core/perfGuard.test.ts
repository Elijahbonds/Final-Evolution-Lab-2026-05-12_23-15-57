// perfGuard — the paced requester, the idle modes and the levers, on a NullEngine with a scripted clock (perf-guard,
// 2026-10-06). No GPU: what is asserted is which frames run and what each lever is set to, never a pixel.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  NullEngine, Scene, FreeCamera, Vector3, DirectionalLight, ShadowGenerator, MeshBuilder, ParticleSystem,
} from '@babylonjs/core';
import { mountPerfGuard, guardPolicy, paceModeFor, registerPerfTarget, type GuardHost, type PerfGuardHandle } from './perfGuard';
import { LEVELS, MAX_LEVEL, IDLE_FRAME_MS } from './PerfGovernor';
import type { FitResult } from './canvasFit';

/** A scripted browser: rAF and timers run only when the test advances the clock. */
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
  /** One vsync: fire due timers, then the frame callbacks queued before it. */
  vsync(ms = 1000 / 60): void {
    this.t += ms;
    for (const [id, tm] of [...this.timers]) if (tm.at <= this.t) { this.timers.delete(id); tm.cb(); }
    const due = [...this.raf]; this.raf.clear();
    for (const [, cb] of due) cb(this.t);
  }
  run(ms: number, hz = 60): void { const end = this.t + ms; while (this.t < end - 1e-6) this.vsync(1000 / hz); }
  setHidden(h: boolean): void { this.isHidden = h; for (const v of this.vis) v(); }
}

const FIT: FitResult = { hardwareScalingLevel: 0.5, effectiveDpr: 2, backingWidth: 780, backingHeight: 1688, limitedBy: 'dpr' };
const PHONE = { pacing: true, governor: true, hud: false };

let engine: NullEngine, scene: Scene, host: FakeHost, guard: PerfGuardHandle, renders: number;
/** NullEngine keeps no scaling level of its own: the last level the guard handed the engine. */
let hw = 1;
beforeEach(() => {
  engine = new NullEngine();
  engine.setHardwareScalingLevel = (l: number) => { hw = l; };
  engine.getHardwareScalingLevel = () => hw;
  scene = new Scene(engine);
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  host = new FakeHost();
  engine.setHardwareScalingLevel(FIT.hardwareScalingLevel);
  renders = 0;
});
afterEach(() => { guard?.dispose(); scene.dispose(); engine.dispose(); });

function mount(policy = PHONE, onHidden?: () => void): void {
  guard = mountPerfGuard({ engine, scene, tier: 'mobile', fit: FIT, host, policy, onHidden });
  guard.setPhase('playing');
  engine.runRenderLoop(() => { renders++; scene.render(); });
}

describe('policy', () => {
  it('phones are paced and governed; a small desktop window is governed but keeps its rate; desktop gets idle only', () => {
    expect(guardPolicy('mobile', true, null)).toEqual({ pacing: true, governor: true, hud: false });
    expect(guardPolicy('mobile', false, null)).toEqual({ pacing: false, governor: true, hud: false });
    expect(guardPolicy('desktop', false, null)).toEqual({ pacing: false, governor: false, hud: false });
    expect(guardPolicy('tv', true, null)).toEqual({ pacing: false, governor: false, hud: false });   // a later lane's tier
    expect(guardPolicy('desktop', false, 'phone')).toEqual({ pacing: true, governor: true, hud: true });
    expect(guardPolicy('mobile', true, 'off')).toEqual({ pacing: false, governor: false, hud: false });
    expect(guardPolicy('mobile', true, '1').hud).toBe(true);
  });
  it('the phase decides the refresh; hidden beats everything', () => {
    expect(paceModeFor('playing', false, false)).toBe('run');
    expect(paceModeFor('ready', false, false)).toBe('run');
    expect(paceModeFor('paused', false, false)).toBe('low');
    expect(paceModeFor('ended', false, false)).toBe('low');
    expect(paceModeFor('error', false, false)).toBe('low');
    expect(paceModeFor('playing', false, true)).toBe('low');
    expect(paceModeFor('playing', true, false)).toBe('stop');
  });
});

describe('the paced requester', () => {
  it('a phone renders every vsync at the 60 cap on a 60 Hz panel', () => {
    mount();
    host.run(1000);
    expect(renders).toBeGreaterThanOrEqual(58);
  });

  it('a 120 Hz phone is held to 60', () => {
    mount();
    host.run(2000, 120);
    expect(renders).toBeGreaterThan(110);
    expect(renders).toBeLessThan(130);
  });

  it('a desktop (no pacing) renders every vsync, even at 120 Hz', () => {
    mount({ pacing: false, governor: false, hud: false });
    host.run(1000, 120);
    expect(renders).toBeGreaterThanOrEqual(118);
  });

  it('a 30 cap renders every other vsync — the game is not run on the skipped ones', () => {
    mount();
    guard.force(0, 30);
    host.run(200);   // the pacer settles
    const r0 = renders;
    host.run(2000);
    expect(renders - r0).toBeGreaterThanOrEqual(59);
    expect(renders - r0).toBeLessThanOrEqual(61);
  });

  it('a pause refreshes at the idle rate, and the physics hold still until play resumes', () => {
    mount();
    host.run(500);
    expect(scene.physicsEnabled).toBe(true);
    guard.setPhase('paused');
    expect(scene.physicsEnabled).toBe(false);
    const r0 = renders;
    host.run(5000);
    const idle = renders - r0;
    expect(idle).toBeGreaterThanOrEqual(5000 / IDLE_FRAME_MS - 2);
    expect(idle).toBeLessThanOrEqual(5000 / IDLE_FRAME_MS + 1);
    guard.setPhase('playing');
    expect(scene.physicsEnabled).toBe(true);
    const r1 = renders;
    host.run(1000);
    expect(renders - r1).toBeGreaterThanOrEqual(58);
  });

  it('the end card idles too; a mode that had switched its physics off gets that back, not true', () => {
    mount();
    scene.physicsEnabled = false;
    guard.setPhase('ended');
    guard.setPhase('playing');
    expect(scene.physicsEnabled).toBe(false);
  });

  it('a hidden page renders nothing, pauses the game through the harness, and comes back on show', () => {
    let pauses = 0;
    mount(PHONE, () => { pauses++; });
    host.run(300);
    host.setHidden(true);
    expect(pauses).toBe(1);
    const r0 = renders;
    host.run(5000);
    expect(renders).toBe(r0);
    expect(host.raf.size + host.timers.size).toBe(0);   // nothing polls while hidden
    host.setHidden(false);
    host.run(500);
    expect(renders - r0).toBeGreaterThanOrEqual(28);
  });

  it('the first frame after an idle resets the frame clock (no whole-pause step)', () => {
    mount();
    host.run(300);
    const pm = engine.performanceMonitor;
    let resets = 0;
    const orig = pm.disable.bind(pm);
    pm.disable = () => { resets++; orig(); };
    guard.setPhase('paused');
    host.run(1200);
    const idleResets = resets;
    expect(idleResets).toBeGreaterThanOrEqual(2);   // every idle frame is its own small step
    guard.setPhase('playing');
    host.run(100);
    expect(resets).toBe(idleResets + 1);              // and the first live frame, once
  });

  it('a covered scene (a host menu) idles like a pause', () => {
    mount();
    host.run(300);
    guard.setCovered(true);
    const r0 = renders;
    host.run(3000);
    expect(renders - r0).toBeLessThanOrEqual(3000 / IDLE_FRAME_MS + 1);
    guard.setCovered(false);
  });

  it('after dispose the requester is inert', () => {
    mount();
    host.run(200);
    guard.dispose();
    engine.stopRenderLoop();
    const r0 = renders;
    host.run(500);
    expect(renders).toBe(r0);
  });
});

describe('the levers', () => {
  function rig() {
    const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1), scene);
    const sg = new ShadowGenerator(512, sun);
    const box = MeshBuilder.CreateBox('caster', {}, scene);
    sg.addShadowCaster(box);
    const gull = MeshBuilder.CreatePlane('gull_0', {}, scene);
    const trail = new ParticleSystem('fx_ball_trail', 100, scene); trail.emitRate = 100;
    const amb = new ParticleSystem('amb_snow', 100, scene); amb.emitRate = 60;
    return { sg, gull, trail, amb };
  }

  it('each level sets resolution on top of the fit, the shadow refresh, particles and the ambient life; level 0 restores all', () => {
    const { sg, gull, trail, amb } = rig();
    mount();
    host.run(100);
    guard.force(2);
    host.run(50);
    expect(engine.getHardwareScalingLevel()).toBeCloseTo(0.5 / LEVELS[2].renderScale);
    expect(sg.getShadowMap()!.refreshRate).toBe(LEVELS[2].shadowEvery);
    guard.force(MAX_LEVEL);
    host.run(50);
    const L = LEVELS[MAX_LEVEL];
    expect(trail.emitRate).toBeCloseTo(100 * L.particles);
    expect(amb.emitRate).toBe(0);
    expect(gull.isEnabled()).toBe(false);
    guard.force(0);
    host.run(50);
    expect(engine.getHardwareScalingLevel()).toBeCloseTo(0.5);
    expect(sg.getShadowMap()!.refreshRate).toBe(1);
    expect(trail.emitRate).toBe(100);
    expect(amb.emitRate).toBe(60);
    expect(gull.isEnabled()).toBe(true);
  });

  it('a rate the mode sets while scaled becomes the new 100%', () => {
    const { trail } = rig();
    mount();
    guard.force(MAX_LEVEL);
    host.run(50);
    trail.emitRate = 150;           // the mode's trail goes to 'flash'
    host.run(50);
    expect(trail.emitRate).toBeCloseTo(150 * LEVELS[MAX_LEVEL].particles);
    guard.force(0);
    host.run(50);
    expect(trail.emitRate).toBe(150);
  });

  it('a burst appearing at a low level carries fewer particles', () => {
    mount();
    guard.force(MAX_LEVEL);
    const burst = new ParticleSystem('fx_dust_1', 26, scene);
    burst.manualEmitCount = 26;
    host.run(50);
    expect(burst.manualEmitCount).toBe(Math.round(26 * LEVELS[MAX_LEVEL].particles));
  });

  it('a shadow map that is not every-frame (RENDER_ONCE, a mode\'s own rate) is left alone', () => {
    const { sg } = rig();
    sg.getShadowMap()!.refreshRate = 0;
    mount();
    guard.force(MAX_LEVEL);
    expect(sg.getShadowMap()!.refreshRate).toBe(0);
  });

  it('a re-fit (rotation) moves the base and keeps the governor\'s scale on top; never below 1:1', () => {
    mount();
    guard.force(3);
    guard.scalable.setHardwareScalingLevel(0.6);
    expect(engine.getHardwareScalingLevel()).toBeCloseTo(Math.min(1, 0.6 / LEVELS[3].renderScale));
    guard.scalable.setHardwareScalingLevel(1);          // a 1x fit: nothing to give
    expect(engine.getHardwareScalingLevel()).toBe(1);
  });

  it('an ungoverned tier keeps the fit exactly', () => {
    mount({ pacing: false, governor: false, hud: false });
    guard.scalable.setHardwareScalingLevel(0.5);
    expect(engine.getHardwareScalingLevel()).toBe(0.5);
  });

  it('registered targets (a crowd) hear every level, and a late one gets the current level at once', () => {
    mount();
    const seen: string[] = [];
    registerPerfTarget(scene, { setPerfLevel: (l) => seen.push(l.crowd) });
    guard.force(MAX_LEVEL);
    guard.force(0);
    expect(seen).toEqual(['still', 'full']);
    guard.force(MAX_LEVEL);
    const late: string[] = [];
    registerPerfTarget(scene, { setPerfLevel: (l) => late.push(l.crowd) });
    expect(late).toEqual(['still']);
  });
});
