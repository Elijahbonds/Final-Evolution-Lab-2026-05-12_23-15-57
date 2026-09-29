// The steps before the camera (SCREEN-SHIP gate 5 and the pain gate): age first, a parent's consent under 18 or with no
// age, then pain; "yes" to pain never reaches the camera; nothing can skip consent.
import { describe, expect, it } from 'vitest';
import { PRE_START, preStep, type PreEvent, type PreState } from './flow';
import { mayPersist } from './store';

const run = (events: PreEvent[]): PreState => events.reduce((s, e) => preStep(s, e, new Date('2026-09-29T12:00:00Z')), PRE_START);

describe('age, then consent, then pain, then the camera', () => {
  it('an adult: age → pain → camera; the gate allows keeping the result', () => {
    const s = run([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: false }]);
    expect(s.step).toBe('camera');
    expect(mayPersist(s.gate)).toBe(true);
  });

  it('under 18 and an age not given go through the parent step first', () => {
    for (const age of ['under-18', 'unknown'] as const) {
      const a = run([{ type: 'start' }, { type: 'age', age }]);
      expect(a.step, age).toBe('consent');
      expect(a.gate, age).toBeNull();
      const b = preStep(a, { type: 'consent' });
      expect(b.step, age).toBe('pain');
      expect(b.gate).toMatchObject({ ageBand: age, parentCheckbox: true });
    }
  });

  it('nothing skips consent: pain and camera cannot be reached from the consent step, and back returns to the age', () => {
    const c = run([{ type: 'start' }, { type: 'age', age: 'under-18' }]);
    expect(preStep(c, { type: 'pain', hurts: false }).step).toBe('consent');
    expect(preStep(c, { type: 'back' }).step).toBe('age');
    expect(run([{ type: 'pain', hurts: false }]).step).toBe('intro');   // from the start: nothing
    expect(run([{ type: 'start' }, { type: 'pain', hurts: false }]).step).toBe('age');
  });

  it('PAIN: "yes" ends it with no camera and no gate kept; "no" goes on to the camera', () => {
    const yes = run([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: true }]);
    expect(yes.step).toBe('painStop');
    expect(yes.gate).toBeNull();
    const no = run([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: false }]);
    expect(no.step).toBe('camera');
  });

  it('the page asks for the camera only from the camera step', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const app = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    // the one call from the steps before the camera
    expect(app).toMatch(/if \(next\.step === 'camera'\) \{ void startCamera\(\); return; \}/);
    const calls = app.match(/startCamera\(/g)!.length;
    expect(calls).toBe(3);      // the camera step, the lighter-model restart and the camera card's retry: nothing earlier
    // a new screen wipes the last one before anything else
    expect(app).toMatch(/if \(e\.type === 'start'\) clearScreen\(tabStorage\(\), localForClear\(\)\);/);
  });

  it('restart forgets everything', () => {
    const s = run([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'restart' }]);
    expect(s).toEqual(PRE_START);
  });
});
