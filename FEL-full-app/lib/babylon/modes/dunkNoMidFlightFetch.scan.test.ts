// PERF-834-LCP (b), PL-3 (source) (2026-10-29): DunkMode's late steps ask the flight gate first. His body's every try, the rest of the
// contest set (it rides on his arrival: dressing, bus, tent, voices, walk-out) and the corner props' parking all wait while a dunk is in
// the air — the window is the takeoff ('cinematic') to the slam's finishAttempt ('resolve' until `finishing`).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dunk = readFileSync(path.join(__dirname, 'DunkMode.ts'), 'utf8');
const between = (s: string, a: string, b: string) => { const i = s.indexOf(a); const j = s.indexOf(b, i + a.length); expect(i, a).toBeGreaterThan(-1); expect(j, b).toBeGreaterThan(i); return s.slice(i, j); };

describe('PL-3: no late-asset step starts between takeoff and the slam', () => {
  it('the gate covers takeoff → the slam', () => {
    expect(dunk).toContain("import { createFlightGate } from './flightGate';");
    expect(dunk).toContain("const flightGate = createFlightGate(() => phase === 'cinematic' || (phase === 'resolve' && !finishing), () => !ended);");
    expect(between(dunk, 'function resolveDunk(ctx: ModeContext)', '\n  }')).toContain("setPhase('resolve')");
    expect(dunk).toMatch(/setPhase\('cinematic'\); setWin\('takeoff'\);/);
  });
  it('his body: every try waits for the gate, and the contest set behind his arrival starts only after it clears', () => {
    const body = between(dunk, 'async function bringRival(', '\n  /** The corner props');
    const gate = body.indexOf('await flightGate.clear();');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(body.indexOf('rival = await spawnRivalBody(ctx, foe);'));
    expect(body.lastIndexOf('await flightGate.clear();')).toBeGreaterThan(body.indexOf('rival = await spawnRivalBody(ctx, foe);'));
  });
  it('the bus and the tent park only after the gate clears', () => {
    const corner = between(dunk, 'function parkCornerProps(', '\n  function bindBody(');
    expect(corner.match(/\.then\(async \((r|root)\) => \{\n\s+await flightGate\.clear\(\);/g)).toHaveLength(2);
  });
  it('#493 untouched: the slam buffer and on-time window stand', () => {
    expect(dunk).toMatch(/SLAM_BUFFER_SEC\s*=\s*0\.22/);
  });
});
