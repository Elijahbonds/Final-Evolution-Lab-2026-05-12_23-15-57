// VENICE-SKATE-THPS (2026-09-09) — the rail catch window, and the moving rail's identity.
//
// The bars here are the ones the eye failed on: a rail 0.5 m up that a rider passing over at speed could never catch,
// and locks that paid a full bonus for a grind that dismounted on its first step.
import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { qualifyRail, pickRail, nearestOnSegment } from './RailMagnet';
import { MovingRail } from './ParkGoals';

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
// a 12 m rail down +z at bar height, the shape the Venice plaza actually has
const A = V(0, 0.5, -6), B = V(0, 0.5, 6);
const RUN = V(0, 0, 8);           // 8 m/s straight down it
const WIN = { reach: 2.0, align: 0.34 };

describe('the rail catch window', () => {
  it('catches a rider riding down the rail from the side the old 1.1 m sphere could never reach', () => {
    // popped level with the bar, 1.4 m to the side: the historic 1.1 m sphere is measured from the FEET, so it cannot
    // reach across a metre and a half however well the line is set up
    expect(qualifyRail(A, B, V(1.4, 0.6, 0), RUN, WIN).ok).toBe(true);
    expect(qualifyRail(A, B, V(1.4, 0.6, 0), RUN, { reach: 1.1, align: 0.34 }).ok).toBe(false);
  });

  it('refuses a rail it is only crossing', () => {
    const across = qualifyRail(A, B, V(0.4, 0.6, 0), V(8, 0, 0), WIN);
    expect(across.ok).toBe(false);
    expect(across.ok === false && across.why).toBe('across');
  });

  it('refuses the last few percent of a rail — an end lock grinds for 0.00 s and still pays', () => {
    const end = qualifyRail(A, B, V(0.2, 0.6, 5.8), RUN, WIN);
    expect(end.ok).toBe(false);
    expect(end.ok === false && end.why).toBe('end');
    expect(qualifyRail(A, B, V(0.2, 0.6, 0), RUN, WIN).ok).toBe(true);
  });

  it('refuses a bar above the deck — you fall onto a rail, you never rise onto one', () => {
    const above = qualifyRail(V(0, 1.6, -6), V(0, 1.6, 6), V(0.3, 0.6, 0), RUN, WIN);
    expect(above.ok).toBe(false);
    expect(above.ok === false && above.why).toBe('above');
  });

  it('refuses a parked rider', () => {
    const still = qualifyRail(A, B, V(0.3, 0.6, 0), V(0, 0, 0), WIN);
    expect(still.ok).toBe(false);
    expect(still.ok === false && still.why).toBe('still');
  });

  it('a wider ask (POP pressed) reaches a rail the passive magnet does not', () => {
    const feet = V(2.6, 0.6, 0);
    expect(qualifyRail(A, B, feet, RUN, WIN).ok).toBe(false);
    expect(qualifyRail(A, B, feet, RUN, { reach: 3.0, align: 0.34 * 0.6 }).ok).toBe(true);
  });

  it('picks the NEAREST qualifying rail, not the first in the list', () => {
    const far = { a: V(-1.8, 0.5, -6), b: V(-1.8, 0.5, 6), bonus: 100 };
    const near = { a: V(0.2, 0.5, -6), b: V(0.2, 0.5, 6), bonus: 300 };
    expect(pickRail([far, near], V(0, 0.6, 0), RUN, WIN)).toBe(near);
    expect(pickRail([near, far], V(0, 0.6, 0), RUN, WIN)).toBe(near);
  });

  it('picks nothing when every rail is refused', () => {
    expect(pickRail([{ a: A, b: B, bonus: 300 }], V(9, 0.6, 0), RUN, WIN)).toBe(null);
  });

  it('clamps the nearest point to the segment', () => {
    expect(nearestOnSegment(A, B, V(0, 0.5, 40)).t).toBe(1);
    expect(nearestOnSegment(A, B, V(0, 0.5, -40)).t).toBe(0);
    expect(nearestOnSegment(A, B, V(0, 0.5, 0)).d).toBeCloseTo(0, 5);
  });
});

describe('the patrol rail keeps one identity', () => {
  const rail = () => new MovingRail(V(-3, 0.5, 0), V(3, 0.5, 0), V(0, 0, -8), V(0, 0, 8), 0.25);

  it('hands out the SAME line object every frame — a fresh literal per read is why the goal never ticked', () => {
    const r = rail();
    const first = r.line;
    r.update(0.5);
    expect(r.line).toBe(first);
  });

  it('carries its own goal credit, so a lock can be identified without an array index', () => {
    const r = rail();
    expect(r.line.gapId).toBe(r.gapId);
    expect(r.line.bonus).toBe(300);
  });

  it('moves the line it already handed out', () => {
    const r = rail();
    const live = r.line;
    const z0 = live.a.z;
    r.update(1.0);
    void r.line;                       // the mode re-reads it every frame
    expect(live.a.z).not.toBeCloseTo(z0, 3);
    expect(live.b.z - live.a.z).toBeCloseTo(0, 5);   // the rail did not stretch
  });
});
