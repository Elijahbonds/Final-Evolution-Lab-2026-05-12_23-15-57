// The Quick Screen's drill demo slot, filled (EDU-LINKS, 2026-10-07; owner decision "drill demos: reuse the 3D
// ExerciseDemo"). Closed, it is one button; opened, it is ExerciseDemo's 3D character (its avatar canvas) — not its YouTube
// tab, so no third-party player can load on the screen path (lib/screen/offsite.test.ts).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEMO_STAT, DrillDemo } from '@/app/play/mirror/assess/_components/drill-demo';
import { DEMO_NOTE, DEMO_WATCH, SCREEN_TEST_NAMES } from './copy';

describe('the drill demo', () => {
  it('first paint: one "Watch the demo" button, nothing 3D loaded yet', () => {
    const h = renderToStaticMarkup(createElement(DrillDemo, { test: 'T1', drill: 'Knees out over the toes' }));
    expect(h).toMatch(/^<button type="button" data-demo-watch/);
    expect(h).toContain(DEMO_WATCH);
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

  it('every check has a demo motion, and the jump is shown as power', () => {
    for (const t of Object.keys(SCREEN_TEST_NAMES)) expect(DEMO_STAT[t as keyof typeof DEMO_STAT], t).toBeTruthy();
    expect(DEMO_STAT.T5).toBe('power');
  });

  it('reuses ExerciseDemo’s 3D canvas (components/coach/exercise-avatar-canvas.tsx) rather than a new asset', () => {
    const src = readFileSync('app/play/mirror/assess/_components/drill-demo.tsx', 'utf8');
    expect(src).toMatch(/import\('@\/components\/coach\/exercise-avatar-canvas'\)/);
    expect(src).not.toMatch(/components\/coach\/exercise-demo'/);   // its YouTube tab would break the off-site guard
  });
});
