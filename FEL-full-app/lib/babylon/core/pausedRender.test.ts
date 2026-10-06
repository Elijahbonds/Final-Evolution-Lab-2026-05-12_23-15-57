// IMPROVE (2026-10-06, 3PT #18): the pause renders at ~10 fps; every other phase renders every tick.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderDue, PAUSED_RENDER_FPS } from './pausedRender';

describe('renderDue', () => {
  it('every phase but the pause renders every tick', () => {
    for (const p of ['loading', 'ready', 'countdown', 'playing', 'ended', 'error']) expect(renderDue(p, 1000, 999)).toBe(true);
  });
  it('the first paused tick renders, then about PAUSED_RENDER_FPS a second', () => {
    expect(renderDue('paused', 5000, Number.NEGATIVE_INFINITY)).toBe(true);
    let last = Number.NEGATIVE_INFINITY, renders = 0;
    for (let t = 0; t < 1000; t += 1000 / 60) if (renderDue('paused', t, last)) { renders++; last = t; }
    expect(renders).toBeGreaterThanOrEqual(PAUSED_RENDER_FPS - 1);
    expect(renders).toBeLessThanOrEqual(PAUSED_RENDER_FPS + 1);
  });
  it('the harness thins only scene.render(), after the per-tick jobs, and forgets the pause when it ends', () => {
    const h = readFileSync('lib/babylon/core/ModeHarness.ts', 'utf8');
    const loop = h.slice(h.indexOf('engine.runRenderLoop(() => {'), h.indexOf('const unwatchFit'));
    const due = loop.indexOf('if (!renderDue(phase, renderNow, lastPausedRender)) return;');
    expect(due).toBeGreaterThan(loop.indexOf('session.tick(phase'));   // the body clock (the resume hold) still runs every tick
    expect(due).toBeGreaterThan(loop.indexOf('def.update(ctx'));
    expect(due).toBeLessThan(loop.indexOf('scene.render();'));
    expect(loop).toMatch(/lastPausedRender = phase === 'paused' \? renderNow : Number\.NEGATIVE_INFINITY;\s*scene\.render\(\);/);
  });
});
