// vis-race (visual wave 2) — the sprint's start line and finish.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { installOffscreenShim } from '../../../tests/helpers/canvasShim';
import { TIMER_REPAINT_MS, boardMarks, buildSprintDressing, floodsFor, timerText, towerPlan } from './sprintDressing';

installOffscreenShim();

function rig() {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  new FreeCamera('cam', new Vector3(0, 3, 6), scene);
  return scene;
}

afterEach(() => vi.restoreAllMocks());

describe('the sprint dressing, pure', () => {
  it('distance boards stand at a quarter, a half and three quarters of the race', () => {
    expect(boardMarks(100)).toEqual([25, 50, 75]);
    expect(boardMarks(60)).toEqual([15, 30, 45]);
  });
  it('the timer shows seconds and hundredths, zero-padded, never past 99.99', () => {
    expect(timerText(null)).toBe('00.00');
    expect(timerText(7.4)).toBe('07.40');
    expect(timerText(13.456)).toBe('13.46');
    expect(timerText(250)).toBe('99.99');
    expect(timerText(-1)).toBe('00.00');
  });
  it('floodlight towers are for the night (and dusk) only', () => {
    expect(floodsFor('nightGame')).toBe(true);
    expect(floodsFor('dusk')).toBe(true);
    expect(floodsFor('daylight')).toBe(false);
    expect(floodsFor(undefined)).toBe(false);
    const t = towerPlan(100);
    expect(t).toHaveLength(6);
    expect(t.every((p) => Math.abs(p.x) > 6 && p.z <= 0 && p.z >= -100)).toBe(true);   // beside the track, along the straight
  });
});

describe('the sprint dressing, built', () => {
  it('in daylight: blocks, a starter, boards and a finish gantry; no floods; nothing pickable; the small things never cast', () => {
    const scene = rig();
    const d = buildSprintDressing(scene, 100, { laneX: [-0.7, 0.9], mood: 'daylight' });
    const names = scene.meshes.map((m) => m.name);
    for (const n of ['__sprint_blocks_base', '__sprint_blocks_pads', 'sprint_starter_legs', 'sprint_starter_shirt', '__sprint_boards', 'sprint_finish_gantry', '__sprint_finish_timer']) expect(names).toContain(n);
    expect(names.some((n) => /^flood_/.test(n))).toBe(false);
    expect(scene.meshes.every((m) => !m.isPickable)).toBe(true);
    // the glow's regex must NOT take the timer (a halo whites out the digits), and the fixture lights must find no light in a day
    expect(scene.meshes.some((m) => /neon|led_?wall|_led\b/i.test(m.name) && m.name.includes('timer'))).toBe(false);
    const draws = scene.meshes.length;
    expect(draws).toBeLessThan(20);
    d.dispose();
    expect(scene.meshes.length).toBe(0);
  });
  it('at Night Meet: six floodlight heads the fixture lights can find', () => {
    const scene = rig();
    const d = buildSprintDressing(scene, 100, { laneX: [-0.7, 0.9], mood: 'nightGame' });
    expect(scene.meshes.filter((m) => /^flood_/.test(m.name))).toHaveLength(6);
    d.dispose();
  });
  it('the timer repaints at most every TIMER_REPAINT_MS, but the tape paints at once', () => {
    const scene = rig();
    let now = 5000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const d = buildSprintDressing(scene, 100, { laneX: [-0.7] });
    const tex = scene.textures.find((t) => t.name === 'sprint_timer_tex') as unknown as { update: () => void };
    let paints = 0;
    const real = tex.update.bind(tex);
    tex.update = () => { paints++; real(); };
    d.setClock(0.1); d.setClock(0.2); d.setClock(0.3);      // inside the gate of the first paint
    expect(paints).toBe(0);
    now += TIMER_REPAINT_MS + 1; d.setClock(0.4);
    expect(paints).toBe(1);
    d.setClock(0.5);                                           // gated again
    expect(paints).toBe(1);
    d.setClock(12.34, true);                                   // the tape: whatever the gate says
    expect(paints).toBe(2);
    d.setClock(12.34, true);                                   // unchanged: nothing to paint
    expect(paints).toBe(2);
    d.dispose();
  });
});
