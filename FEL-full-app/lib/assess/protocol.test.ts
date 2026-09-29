import { describe, expect, it } from 'vitest';
import { FULL_TESTS, PROTOCOL, QUICK_TESTS, runnableTests, testDef, testsFor } from './protocol';

describe('the jump-screen protocol', () => {
  it('defines all seven tests, T1–T7, in order', () => {
    expect(PROTOCOL.map((t) => t.id)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
    expect(FULL_TESTS).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
  });

  it('the Quick Screen is T1, T2, T3 and T5, and all four are graded here', () => {
    expect(testsFor('quick').map((t) => t.id)).toEqual(QUICK_TESTS);
    expect(runnableTests('quick').map((t) => t.id)).toEqual(['T1', 'T2', 'T3', 'T5']);
  });

  it('the Full screen lists T4, T6 and T7 as not built', () => {
    expect(testsFor('full').map((t) => t.id)).toEqual(FULL_TESTS);
    expect(PROTOCOL.filter((t) => t.notBuilt).map((t) => t.id)).toEqual(['T4', 'T6', 'T7']);
    expect(runnableTests('full').map((t) => t.id)).toEqual(['T1', 'T2', 'T3', 'T5']);
  });

  it('views and sides are the spec\'s', () => {
    expect(testDef('T1')).toMatchObject({ view: 'front+side', sided: false, reps: 3 });
    expect(testDef('T2')).toMatchObject({ view: 'side', sided: true });
    expect(testDef('T3')).toMatchObject({ view: 'front', sided: true, reps: 3 });   // SCREEN-SHIP A2-2: three reps per check (was 5)
    expect(testDef('T5')).toMatchObject({ view: 'front', sided: false, reps: 3 });
    expect(testDef('T7').sided).toBe(true);
  });

  it('the CMJ is the hands-on-hips standard (owner default Q3)', () => {
    expect(testDef('T5').setup).toMatch(/hands on your hips/i);
  });

  it('a setup line positions the athlete and never coaches the movement being scored', () => {
    for (const t of PROTOCOL) expect(t.setup, t.id).not.toMatch(/knees? out|chest up|brace|keep your back/i);
  });
});
