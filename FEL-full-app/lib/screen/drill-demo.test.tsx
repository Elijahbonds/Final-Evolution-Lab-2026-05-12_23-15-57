// The Quick Screen's drill demo slot, filled (EDU-LINKS, 2026-10-07; owner decision "drill demos: reuse the 3D
// ExerciseDemo"). Closed, it is one button; opened, it is ExerciseDemo's 3D character (its avatar canvas) — not its YouTube
// tab, so no third-party player can load on the screen path (lib/screen/offsite.test.ts).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DrillDemo } from '@/app/play/mirror/assess/_components/drill-demo';
import { SCREEN_DEMO_LOOPS } from '@/lib/library/surfaceDemo';
import { DEMO_NOTE, SCREEN_TEST_NAMES } from './copy';

describe('the drill demo', () => {
  // AUTOPLAY (owner, 2026-10-27: "It should play automatically, don't make the platform confusing"): no "watch" tap. The
  // first paint is an empty stage box that opens itself when it scrolls into view; nothing 3D is loaded on the server.
  it('first paint: an autoplay stage box (no button), nothing 3D loaded yet', () => {
    const h = renderToStaticMarkup(createElement(DrillDemo, { test: 'T1', drill: 'Knees out over the toes' }));
    expect(h).toMatch(/^<div data-demo-watch="true" aria-hidden="true"/);
    expect(h).not.toContain('<button');
    expect(h).not.toContain('data-demo-open');
  });

  it('DEMO RENDERS: opened, it is the 3D character (loading client-side), labelled with the drill, the note under it', () => {
    const h = renderToStaticMarkup(createElement(DrillDemo, { test: 'T3', drill: 'Hips level', initiallyOpen: true }));
    expect(h).toContain('data-demo-open="T3"');
    expect(h).toContain('Loading the demo');   // ExerciseDemo's avatar canvas, loaded client-side only (ssr:false)
    expect(h).toContain('aria-label="Single-leg squat: Hips level"');
    expect(h).toContain(DEMO_NOTE);
    expect(h).not.toMatch(/<iframe|youtube/i);   // no video URL passed: no third-party player on the screen path
    expect(h).not.toMatch(/Demo coming/);
  });

  // T-POSE (owner playtest 2026-10-27) — TEST CHANGED: these two asserted the demo reused exercise-avatar-canvas.tsx and
  // picked its motion by a stat. That canvas played elijah.glb's one unrelated capture for every check (measured: the
  // arms swinging 12°–171° off hanging, the head off the canvas) — the T-pose the owner saw. The demo is the library
  // stage now (AvatarDemo): the check's own loop or, without one, the start position still, "Demo coming".
  it('every check names its loop, or none (the still) — never another movement', () => {
    for (const t of Object.keys(SCREEN_TEST_NAMES)) expect(t in SCREEN_DEMO_LOOPS, t).toBe(true);
  });

  it('plays through the library stage (components/library/avatar-demo.tsx), not the one-clip canvas or ExerciseDemo', () => {
    const src = readFileSync('app/play/mirror/assess/_components/drill-demo.tsx', 'utf8');
    expect(src).toMatch(/from '@\/components\/library\/avatar-demo'/);
    expect(src).not.toMatch(/import\('@\/components\/coach\/exercise-avatar-canvas'\)/);
    expect(src).not.toMatch(/components\/coach\/exercise-demo'/);   // its YouTube tab would break the off-site guard
  });
});
