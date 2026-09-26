import { describe, expect, it } from 'vitest';
import { matchExercise, prescribeFromScreen, type CatalogueExercise } from './mirrorToProgram';
import { validateExerciseSpec } from './loop';
import { doseLine } from './structure';

const CAT: CatalogueExercise[] = [
  { id: 'e1', name: 'Tibialis raise', category: 'ankle' },
  { id: 'e2', name: 'Banded clamshell', category: 'hip' },
  { id: 'e3', name: 'Bulgarian split squat', category: 'lower-body' },
  { id: 'e4', name: 'Dead bug', category: 'core' },
  { id: 'e5', name: 'Open book', category: 'mobility' },
];
const screen = (findings: { checkId: string; grade: string; side?: 'left' | 'right' }[]) =>
  ({ meaning: [], suggestions: [], findings });

describe('the screen writes the corrective work', () => {
  it('prescribes the worst finding first, and one-sided before bilateral', () => {
    const out = prescribeFromScreen(screen([
      { checkId: 'ribAngle', grade: 'borderline' },
      { checkId: 'hipLevel', grade: 'fail' },
      { checkId: 'kneeTrackingL', grade: 'fail', side: 'left' },
    ]), CAT);
    expect(out[0].findingId).toBe('kneeTrackingL');      // a one-sided fail leads
    expect(out[1].findingId).toBe('hipLevel');           // then the other fail
    expect(out[2].findingId).toBe('ribAngle');           // borderlines last
  });

  it('only prescribes what the coach actually has, and says what it wanted when it has nothing', () => {
    const out = prescribeFromScreen(screen([{ checkId: 'heelLine', grade: 'fail', side: 'right' }]), CAT);
    expect(out[0].exercise?.name).toBe('Tibialis raise');

    const empty = prescribeFromScreen(screen([{ checkId: 'heelLine', grade: 'fail' }]), []);
    expect(empty[0].exercise).toBeNull();                // never invents a movement
    expect(empty[0].wanted).toContain('ankle');          // but the empty slot is actionable
  });

  it('carries the reason, so a coach can see why it is there and bin it', () => {
    const out = prescribeFromScreen(screen([{ checkId: 'singleLeg', grade: 'fail', side: 'left' }]), CAT);
    expect(out[0].because).toMatch(/single-leg test/i);
    expect(out[0].because).toMatch(/left/);
    // timed: the seconds are a field the builder can run a timer on, not only words in `reps` (MIRROR-COACH P2)
    expect(out[0].reps).toMatch(/30 s each side/);
    expect(out[0].workSeconds).toBe(30);
    expect(prescribeFromScreen(screen([{ checkId: 'trunk', grade: 'fail' }]), CAT)[0].workSeconds).toBeNull();
  });

  it('never prescribes the same movement twice in one draft', () => {
    const out = prescribeFromScreen(screen([
      { checkId: 'kneeTrackingL', grade: 'fail', side: 'left' },
      { checkId: 'kneeTrackingR', grade: 'fail', side: 'right' },
    ]), CAT);
    const ids = out.map((p) => p.exercise?.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('bounds the draft — three an athlete does beats nine they skip', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ checkId: ['heelLine', 'hipLevel', 'ribAngle'][i % 3], grade: 'fail' }));
    expect(prescribeFromScreen(screen(many), CAT)).toHaveLength(3);
    expect(prescribeFromScreen(screen(many), CAT, 5)).toHaveLength(5);
  });

  it('a clean screen prescribes nothing', () => {
    expect(prescribeFromScreen(screen([{ checkId: 'hipLevel', grade: 'stable' }]), CAT)).toEqual([]);
  });

  it('matches on the name first, then the category', () => {
    expect(matchExercise(['clamshell'], CAT)?.id).toBe('e2');
    expect(matchExercise(['nothing-like-this', 'core'], CAT)?.id).toBe('e4');   // fell through to category
    expect(matchExercise(['nope'], CAT)).toBeNull();
  });
});

// MIRROR-COACH P2 review (2026-09-26): the single-leg prescription, saved the way the coach accepts it and read the way
// Today and /training read it. The dose line dropped "each side" ("3 × 30 s") — half the prescribed work per set.
describe('the single-leg prescription reaches Today with its "each side"', () => {
  it('prescribe → the builder\'s validator → the dose line', () => {
    const [p] = prescribeFromScreen(screen([{ checkId: 'singleLeg', grade: 'fail', side: 'left' }]), CAT);
    const v = validateExerciseSpec({ exerciseId: p.exercise!.id, sets: p.sets, reps: p.reps, workSeconds: p.workSeconds, section: 'prep', load: '' });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.spec).toMatchObject({ reps: '30 s each side', workSeconds: 30, load: '' });
    expect(doseLine(v.spec)).toBe('3 × 30 s each side');
    // the timer moved to 40 keeps the side
    const v40 = validateExerciseSpec({ ...v.spec, workSeconds: 40 });
    expect(v40.ok && doseLine(v40.spec)).toBe('3 × 40 s each side');
  });
});
