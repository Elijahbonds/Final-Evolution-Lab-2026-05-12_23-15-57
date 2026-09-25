// HOTFIX (2026-09-24): reduced motion reaches every shake and screen flash outside JuiceKit too — the harness Shaker
// (ctx.feel.shaker, feel.impact), the rig's exposure flash (a made three, a momentum tier, lightning), the stands' phone
// flashes, and the 2-D canvas games' shake and flash. And the one thing it must NOT touch: the gameplay hit-stop
// (gameFeel.timeScale), the clock every mode's dt is multiplied by.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube map NullEngine cannot build

import fs from 'node:fs';
import path from 'node:path';
import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import type { TargetCamera } from '@babylonjs/core';
import { Shaker, hitStop, timeScale } from './gameFeel';
import { mountLightRig } from '../scene/LightRig';
import { PhoneFlashes } from '../visual/PhoneFlashes';
import { createFlash, createShake, flashFor, shakeFor, triggerFlash, triggerShake } from '../../canvas-juice';
import { createFlash as createBloom, triggerFlash as triggerBloom } from '../../impact-system';
import { createDragonMoment, drawDragonOverlay, triggerDragonMoment, updateDragonMoment } from '../../camera-director';
import { SensoryBus } from '../../feel/sensory-bus';
import { MOTION_KEY, REDUCE_QUERY, writeMotionPref } from '../../a11y/reducedMotion';

function device(osReduce: boolean, stored?: string) {
  const store = new Map<string, string>();
  if (stored) store.set(MOTION_KEY, stored);
  vi.stubGlobal('window', {
    location: { search: '' },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } },
    matchMedia: (q: string) => ({ matches: q === REDUCE_QUERY && osReduce, addEventListener() {}, removeEventListener() {} }),
  });
}

afterEach(() => { device(false); writeMotionPref('system'); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function shakerRig() {
  const scene = new Scene(new NullEngine());
  const camera = { position: new Vector3(1, 2, 3) };
  const shaker = new Shaker(scene, camera as unknown as TargetCamera);
  return { scene, camera, shaker, frames: (n: number) => { for (let i = 0; i < n; i++) scene.onBeforeRenderObservable.notifyObservers(scene); } };
}

describe('the harness Shaker (ctx.feel.shaker, feel.impact)', () => {
  it('full motion: a kick moves the camera', () => {
    device(false);
    const { camera, shaker, frames } = shakerRig();
    const at = camera.position.clone();
    shaker.kick(1); frames(4);
    expect(Vector3.Distance(at, camera.position)).toBeGreaterThan(0.001);
  });

  it('reduced: a kick leaves the camera where it was', () => {
    device(true);
    const { camera, shaker, frames } = shakerRig();
    const at = camera.position.clone();
    shaker.kick(1); frames(10);
    expect(camera.position.equals(at)).toBe(true);
  });
});

describe('the gameplay hit-stop is the SAME under every setting (only the picture changes)', () => {
  const trace = (): number[] => {
    let now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    hitStop(80);
    const out: number[] = [];
    for (let t = 0; t <= 130; t += 5) { now = 10_000 + t; out.push(+timeScale().toFixed(3)); }
    vi.restoreAllMocks();
    return out;
  };
  it('reduced and full freeze the mode clock for the same frames', () => {
    device(false); const full = trace();
    device(true); const calm = trace();
    expect(full[1]).toBe(0);            // it really is a freeze
    expect(calm).toEqual(full);
  });
});

describe('the rig exposure flash (a made three, a momentum tier, the storm)', () => {
  it('full motion: the exposure jumps', () => {
    device(false);
    const rig = mountLightRig(new Scene(new NullEngine()), 'dojoWarm', 'desktop');
    const base = rig.pipeline.imageProcessing.exposure;
    rig.flashBeat();
    expect(rig.pipeline.imageProcessing.exposure).toBeGreaterThan(base * 1.3);
  });

  it('reduced: the exposure does not move', () => {
    device(true);
    const rig = mountLightRig(new Scene(new NullEngine()), 'dojoWarm', 'desktop');
    const base = rig.pipeline.imageProcessing.exposure;
    rig.flashBeat();
    expect(rig.pipeline.imageProcessing.exposure).toBe(base);
  });
});

describe('the phone flashes in the stands (a strobe of up to 22 pops)', () => {
  it('full motion: a burst schedules flashes', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const pf = new PhoneFlashes(scene, Vector3.Zero());
    pf.burst(10, 1);
    expect(scene.onBeforeRenderObservable.observers.length).toBe(1);
  });

  it('reduced: a burst pops nothing', () => {
    device(true);
    const scene = new Scene(new NullEngine());
    const pf = new PhoneFlashes(scene, Vector3.Zero());
    pf.burst(22, 2.4);
    expect(scene.onBeforeRenderObservable.observers.length).toBe(0);
  });
});

describe('the 2-D canvas games (story rail, the boss, the 2-D karate)', () => {
  it('full motion: shake and flash arm', () => {
    device(false);
    const s = createShake(), f = createFlash();
    triggerShake(s, 8, 150); triggerFlash(f, '#fff', 80);
    expect([s.t, f.t]).toEqual([150, 80]);
  });

  it('reduced (the app override, device silent): neither arms', () => {
    device(false, 'reduce');
    const s = createShake(), f = createFlash();
    triggerShake(s, 8, 150); triggerFlash(f, '#fff', 80);
    expect([s.t, f.t]).toEqual([0, 0]);
  });
});

// HOTFIX (2026-09-24): the 2-D games that keep their OWN flash timer. The story boss (/story/boss, live) painted a
// full-canvas red flash on every hit the player took — `st.flash = 0.1`, then fillRect(0, 0, W, H) — that never went
// through triggerFlash, so reduced motion only removed its shake. The same shape sat in eight 2-D fallbacks, plus the
// shared impact-system bloom (the 2-D KO, the 3-D crowd pops) and the karate dragon moment's crimson flash.
describe('the 2-D games\' own flash and shake timers (the story boss\'s damage flash)', () => {
  it('full motion: flashFor / shakeFor hand back the seconds asked for', () => {
    device(false);
    expect([flashFor(0.1), shakeFor(0.35)]).toEqual([0.1, 0.35]);
  });
  it('reduced (the device, or the app override): 0 — the full-canvas fill never draws', () => {
    device(true);
    expect([flashFor(0.1), shakeFor(0.35)]).toEqual([0, 0]);
    device(false, 'reduce');
    expect([flashFor(0.15), shakeFor(0.35)]).toEqual([0, 0]);
  });

  it('the shared impact-system bloom arms in full motion and not in reduced', () => {
    device(false);
    const a = createBloom(); triggerBloom(a, '#ffffff', 0.7, 2.2);
    expect(a.alpha).toBe(0.7);
    device(true);
    const b = createBloom(); triggerBloom(b, '#ffffff', 0.7, 2.2);
    expect(b.alpha).toBe(0);
  });

  it('the dragon moment: reduced drops the crimson flash and keeps the push-in and the slow-mo (the mode\'s clock)', () => {
    const run = (reduce: boolean) => {
      device(reduce);
      const d = createDragonMoment();
      triggerDragonMoment(d);
      const fills: number[] = [];
      const ctx = { set fillStyle(_: string) {}, fillRect: () => { fills.push(1); } } as unknown as CanvasRenderingContext2D;
      const out: { flash: number; scale: number; zoom: number }[] = [];
      for (let i = 0; i < 12; i++) { updateDragonMoment(d, 1 / 60); drawDragonOverlay(ctx, 960, 540, d); out.push({ flash: d.flashAlpha, scale: d.timeScale, zoom: d.zoomFactor }); }
      return { out, fills: fills.length };
    };
    const full = run(false), calm = run(true);
    expect(full.out[0].flash).toBeGreaterThan(0.9);
    expect(full.fills).toBeGreaterThan(0);
    expect(calm.out.every((f) => f.flash === 0)).toBe(true);
    expect(calm.fills).toBe(0);
    expect(calm.out.map((f) => [f.scale, f.zoom])).toEqual(full.out.map((f) => [f.scale, f.zoom]));
  });

  it('every 2-D game sets its own flash / shake timer through the gate (no raw `st.flash = 0.1` left)', () => {
    // the games are canvas components with a rAF loop; mounting one needs a DOM this runner does not have (environment:
    // node), so the sites are pinned by source beside the behaviour above
    const dir = path.resolve(__dirname, '../../../components/games');
    const games = fs.readdirSync(dir).filter((f) => /-game\.tsx$/.test(f));
    const raw: string[] = [];
    for (const f of games) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(/\bst\.(flash|shake)\s*=\s*([^;]+);/g)) {
        const rhs = m[2].trim();
        if (/^0(\.0+)?$/.test(rhs)) continue;                        // clearing it is always fine
        if (/(flashFor|shakeFor)\(/.test(rhs)) continue;              // gated
        raw.push(`${f}: st.${m[1]} = ${rhs}`);
      }
    }
    expect(raw).toEqual([]);
    // the 3-D board fallback's chase-camera shake (behind the Babylon kill-switch) goes through the same gate
    const board = fs.readFileSync(path.join(dir, 'board-sports-3d.tsx'), 'utf8');
    const kicks = [...board.matchAll(/shakeRef\.current = (?!Math\.max\(0)([^;]+);/g)].map((m) => m[1]);
    expect(kicks.length).toBe(2);                                    // the landing and the bail
    expect(kicks.filter((r) => !r.startsWith('shakeFor('))).toEqual([]);
    const boss = fs.readFileSync(path.join(dir, 'glitch-boss-game.tsx'), 'utf8');
    expect(boss).toMatch(/const playerHit = [\s\S]{0,200}st\.flash = flashFor\(0\.1\)/);
  });
});

describe('the feel cores\' SensoryBus', () => {
  const bus = () => {
    const applyCameraShake = vi.fn(), hit = vi.fn();
    return { b: new SensoryBus({ camera: { applyCameraShake }, loop: { hitStop: hit } }), applyCameraShake, hit };
  };
  it('full motion: a contact shakes the camera', () => {
    device(false);
    const { b, applyCameraShake, hit } = bus();
    b.emit({ shake: 0.5, hitStopMs: 60 });
    expect(applyCameraShake).toHaveBeenCalledWith(0.5);
    expect(hit).toHaveBeenCalledWith(60);
  });
  it('reduced: no shake — the hit-stop (the loop\'s clock) still fires', () => {
    device(true);
    const { b, applyCameraShake, hit } = bus();
    b.emit({ shake: 0.5, hitStopMs: 60 });
    expect(applyCameraShake).not.toHaveBeenCalled();
    expect(b.stats.shakes).toBe(0);
    expect(hit).toHaveBeenCalledWith(60);
  });
});

// Sites that cannot be driven without a mounted mode (the harness's impact frame and QA trace, the replay's phone cut) and three
// slow-mos a mode made part of its clock. Pinned by source, beside the behaviour above.
describe('wiring that needs a whole mode to exercise', () => {
  const root = path.resolve(__dirname, '../../..');
  const src = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

  it('feel.impact only pulses the frame when flashes are allowed', () => {
    expect(src('lib/babylon/core/ModeHarness.ts')).toMatch(/impact: \(s: number\) => \{[^}]*if \(motionPolicy\(\)\.flash\) frame = kickImpactFrame\(frame, s\)/);
  });

  it('the QA trace does not count a suppressed flash or shake as the answer to a press', () => {
    const s = src('lib/babylon/core/ModeHarness.ts');
    expect(s).toMatch(/const unseen = \(\) => \(m === 'flash' && !motionPolicy\(\)\.flash\) \|\| \(m === 'shake' && !motionPolicy\(\)\.shake\)/);
    expect(s).toMatch(/if \(!unseen\(\)\) qa\.juice\(m\)/);
  });

  it('the replay phone cut only wobbles when shake is allowed', () => {
    const s = src('lib/babylon/scene/DunkReplayCam.ts');
    expect(s).toMatch(/const handheld = motionPolicy\(\)\.shake/);
    expect(s).toMatch(/cam\.shake && handheld \?/);
  });

  it('the slow-mos a mode times itself on are passed as gameplay (reduced motion keeps them whole)', () => {
    // the dunk and the dunk duel count the slam window in scene.animationTimeScale; skate slows its own dt for SLOW_SEC
    expect(src('lib/babylon/modes/DunkMode.ts')).toMatch(/hangSlowMoLatch = true;\s*ctx\.juice\.slowMo\(0\.4, 400, \{ gameplay: true \}\)/);
    expect(src('lib/babylon/modes/DunkDuelMode.ts')).toMatch(/hangSlowMoLatch = true;\s*ctx\.juice\.slowMo\(0\.4, 400, \{ gameplay: true \}\)/);
    expect(src('lib/babylon/modes/SkateRunMode.ts')).toMatch(/ctx\.juice\.slowMo\(SLOW_SCALE, SLOW_SEC \* 1000, \{ gameplay: true \}\)/);
  });

  it('the dunk contact punch pairs a gameplay juice freeze with the equal mode-clock freeze (both dunk modes)', () => {
    // reduced motion would otherwise free the limbs at 30 ms while feelHitStop(70) still holds the root and the ball
    for (const f of ['lib/babylon/modes/DunkMode.ts', 'lib/babylon/modes/DunkDuelMode.ts']) {
      expect(src(f)).toMatch(/ctx\.juice\.hitStop\(70, \{ gameplay: true \}\);[^\n]*\n\s*feelHitStop\(70\);/);
    }
  });
});
