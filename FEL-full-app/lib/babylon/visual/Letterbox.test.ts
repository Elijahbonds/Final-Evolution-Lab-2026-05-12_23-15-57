// vis-foundation-2 A9.12 — the cinematic bars.
import { describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { LETTERBOX_MAX_SHARE, letterboxBarPx, mountLetterbox } from './Letterbox';

describe('letterboxBarPx', () => {
  it('cuts a 16:9 frame to scope at full level, nothing at zero', () => {
    expect(letterboxBarPx(1920, 1080, 1)).toBe(Math.round(Math.min((1080 - 1920 / 2.39) / 2, 1080 * LETTERBOX_MAX_SHARE)));
    expect(letterboxBarPx(1920, 1080, 0)).toBe(0);
    expect(letterboxBarPx(1920, 1080, 0.5)).toBeLessThan(letterboxBarPx(1920, 1080, 1));
  });
  it('never eats more than its share of a tall phone screen', () => {
    expect(letterboxBarPx(390, 844, 1)).toBe(Math.round(844 * LETTERBOX_MAX_SHARE));
  });
  it('a frame already wider than scope gets no bars; a zero-size canvas gets none', () => {
    expect(letterboxBarPx(2560, 900, 1)).toBe(0);
    expect(letterboxBarPx(0, 0, 1)).toBe(0);
  });
});

describe('mountLetterbox', () => {
  it('eases toward the larger of the asked level and the scene\'s cinematic level, without a DOM', () => {
    const engine = new NullEngine();
    (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
    const scene = new Scene(engine);
    new FreeCamera('cam', new Vector3(0, 1, -5), scene);
    let ask = 0;
    const lb = mountLetterbox(scene, null, () => ask);
    scene.render(); expect(lb.shown).toBe(0);
    ask = 1;
    for (let i = 0; i < 3; i++) scene.render();
    expect(lb.shown).toBeGreaterThan(0); expect(lb.shown).toBeLessThan(1);   // eased, not snapped
    for (let i = 0; i < 120; i++) scene.render();
    expect(lb.shown).toBe(1);
    ask = 0; (scene.metadata ??= {}).felCinematic = 0.5;
    for (let i = 0; i < 120; i++) scene.render();
    expect(lb.shown).toBe(0.5);
    lb.dispose(); scene.dispose(); engine.dispose();
  });
});
