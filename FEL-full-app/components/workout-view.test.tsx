import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyzeMovement, defaultMetrics } from '@/lib/workout/movement-screen';
import { demoScan, WorkoutView } from './workout-view';

// /workout has no camera capture. Its "scan" used to POST random numbers to /api/v1/workout/scan, which stored them
// as a real WorkoutScan — and playerIdentity reads the newest scan's avatarSpec as a measured body. What it shows now
// is a demo worked out on the page and never sent.
const src = readFileSync(new URL('./workout-view.tsx', import.meta.url), 'utf8');

describe('WorkoutView, the demo scan', () => {
  it('posts nothing to the scan route: the only call left there is delete-my-data', () => {
    const methods = [...src.matchAll(/fetch\('\/api\/v1\/workout\/scan',\s*\{\s*method:\s*'(\w+)'/g)].map((m) => m[1]);
    expect(methods).toEqual(['DELETE']);
  });

  it('invents no numbers', () => {
    expect(src).not.toMatch(/Math\.random/);
    expect(demoScan()).toEqual(demoScan());
  });

  it('shows the weakest pillar the plan route targets when it is sent no scan', () => {
    // buyPlan sends no scanId now, so the plan route plans from defaultMetrics(); the demo must show that same focus.
    expect(demoScan().analysis).toEqual(analyzeMovement(defaultMetrics()));
  });

  it('delete says what the route deletes (every saved scan and plan, Mirror history included), asks first, and checks the answer', () => {
    // DELETE /api/v1/workout/scan runs workoutPlan.deleteMany + workoutScan.deleteMany for the user: the Mirror's dunk
    // history (kind 'dunk') and screens live in WorkoutScan. The old line said "cleared from this session".
    const route = readFileSync(new URL('../app/api/v1/workout/scan/route.ts', import.meta.url), 'utf8');
    expect(route).toMatch(/workoutScan\.deleteMany\(\{ where: \{ userId \} \}\)/);
    expect(src).not.toMatch(/cleared from this session/);
    expect(src).toMatch(/window\.confirm\([\s\S]*Mirror dunk history[\s\S]*workout plans you bought/);
    expect(src).toMatch(/deleted = res\.ok/);
  });

  it('says it is a demo on the button', () => {
    const m = renderToStaticMarkup(createElement(WorkoutView));
    expect(m).toContain('Run Demo Scan');
    expect(m).not.toContain('Run System Scan');
    expect(m).not.toMatch(/Scan your movement, meet your mini-avatar/);   // the intro promised a scan of your body
    expect(m).toContain('Run the demo scan');
  });
});
