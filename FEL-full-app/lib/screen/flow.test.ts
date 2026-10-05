// The steps before the camera (SCREEN-SHIP gate 5 and the pain gate; SCREEN-FIX Cyber 1–2, S-2, S-3): age first, "A
// grown-up is with me" for under 18 or no age, then pain, then the camera card; "yes" to pain never reaches the camera;
// nothing skips the grown-up step; a locked age skips the question; the back arrow stays inside the flow.
import { describe, expect, it } from 'vitest';
import { PRE_START, backStep, preStep, type PreEvent, type PreState, type PreStep } from './flow';
import { AGE_BANDS, linksAllowed, needsGrownUp } from './age';
import { mayPersist } from './store';

const run = (events: PreEvent[], from: PreState = PRE_START): PreState => events.reduce((s, e) => preStep(s, e, new Date('2026-09-29T12:00:00Z')), from);

describe('every age band → the right next step', () => {
  it('18 or older: age → pain → the camera card → camera; the gate allows keeping the result', () => {
    const s = run([{ type: 'start' }, { type: 'age', age: '18+' }]);
    expect(s.step).toBe('pain');
    const c = run([{ type: 'pain', hurts: false }], s);
    expect(c.step).toBe('cameraInfo');
    expect(run([{ type: 'cameraOn' }], c).step).toBe('camera');
    expect(mayPersist(c.gate)).toBe(true);
  });

  it('13–17, under 13 and "rather not say" go through the grown-up step first', () => {
    for (const age of ['13-17', 'under-13', 'unknown'] as const) {
      expect(needsGrownUp(age), age).toBe(true);
      const a = run([{ type: 'start' }, { type: 'age', age }]);
      expect(a.step, age).toBe('grownUp');
      expect(a.gate, age).toBeNull();
      const b = preStep(a, { type: 'grownUp' });
      expect(b.step, age).toBe('pain');
      expect(b.gate).toMatchObject({ ageBand: age, grownUp: true });
      expect(mayPersist(b.gate), age).toBe(false);                    // CHANGED (SCREEN-FIX-2): nothing but the age answer is kept for them
    }
  });

  it('CHANGED (SCREEN-FIX-2, S-10): links out of the screen are for 18 or older only (was 13 and older)', () => {
    expect(AGE_BANDS.filter(linksAllowed)).toEqual(['18+']);
    expect(linksAllowed(null)).toBe(false);
  });
});

describe('the age is asked once per run', () => {
  it('a start that carries the tab\'s locked answer skips the question', () => {
    expect(run([{ type: 'start', locked: '18+' }]).step).toBe('pain');
    for (const locked of ['13-17', 'under-13', 'unknown'] as const) expect(run([{ type: 'start', locked }]).step, locked).toBe('grownUp');
    expect(run([{ type: 'start', locked: null }]).step).toBe('age');
  });

  it('an age answer outside the age step changes nothing', () => {
    const g = run([{ type: 'start', locked: 'under-13' }]);
    expect(preStep(g, { type: 'age', age: '18+' })).toBe(g);
  });
});

describe('nothing skips the grown-up step, and the camera waits for the camera card', () => {
  it('pain and the camera cannot be reached from the grown-up step', () => {
    const c = run([{ type: 'start' }, { type: 'age', age: '13-17' }]);
    expect(preStep(c, { type: 'pain', hurts: false }).step).toBe('grownUp');
    expect(preStep(c, { type: 'cameraOn' }).step).toBe('grownUp');
    expect(run([{ type: 'pain', hurts: false }]).step).toBe('intro');   // from the start: nothing
    expect(run([{ type: 'start' }, { type: 'pain', hurts: false }]).step).toBe('age');
  });

  it('S-3: "no" to pain shows the camera card; only its button reaches the camera', () => {
    const p = run([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: false }]);
    expect(p.step).toBe('cameraInfo');
    expect(run([{ type: 'cameraOn' }], p).step).toBe('camera');
    expect(run([{ type: 'cameraOn' }]).step).toBe('intro');
  });

  it('PAIN: "yes" ends it with no camera and no gate kept', () => {
    const yes = run([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: true }]);
    expect(yes.step).toBe('painStop');
    expect(yes.gate).toBeNull();
    expect(preStep(yes, { type: 'cameraOn' }).step).toBe('painStop');
  });

  it('the page asks for the camera only from the camera step', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const app = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    // the one call from the steps before the camera
    expect(app).toMatch(/if \(next\.step === 'camera'\) \{ void startCamera\(\); return; \}/);
    const calls = app.match(/startCamera\(/g)!.length;
    // the camera step, the lighter-model restart, the camera card's retry, and "Do the full screen"
    // after a jump (the camera was already allowed this run — nothing before the camera card opens one)
    expect(calls).toBe(4);
    // a new screen wipes the last one before anything else
    expect(app).toMatch(/if \(e\.type === 'start'\) clearScreen\(tabStorage\(\), localForClear\(\)\);/);
    // AGE-RESET (audit 2.2): a new Start also clears the last person's age answer, so it is asked again
    expect(app).toMatch(/if \(e\.type === 'start'\) resetAge\(tabStorage\(\)\);/);
    // the age answer is locked as it is given, and a start reads the lock (now always none, after the reset above)
    expect(app).toMatch(/\{ type: 'age', age: lockAge\(tabStorage\(\), e\.age\) \}/);
    expect(app).toMatch(/\{ type: 'start', locked: readAge\(tabStorage\(\)\), kind: e\.kind \}/);
  });

  it('restart forgets the steps (the tab\'s age lock lives in its storage, not here)', () => {
    const s = run([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'restart' }]);
    expect(s).toEqual(PRE_START);
  });
});

describe('S-2: the back arrow is one step back, inside the flow', () => {
  const at = (step: PreStep, age: PreState['age'] = '13-17'): PreState => ({ step, age, gate: null, kind: 'full' });
  it('age → the start; grown-up → the start (the age is locked); pain → the grown-up step, or the start for 18+', () => {
    expect(backStep(at('age', null))).toEqual(PRE_START);
    expect(backStep(at('grownUp'))).toEqual(PRE_START);
    expect(backStep(at('pain', '13-17')).step).toBe('grownUp');
    expect(backStep(at('pain', '13-17')).gate).toBeNull();                 // the checkbox is asked again
    expect(backStep(at('pain', '18+'))).toEqual(PRE_START);
    expect(backStep(at('painStop'))).toEqual(PRE_START);
  });

  it('the camera card → pain (the gate kept); the camera → the camera card; the start stays (the page goes to /screen)', () => {
    const p = run([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: false }]);
    const b = preStep(p, { type: 'back' });
    expect(b.step).toBe('pain');
    expect(b.gate).toEqual(p.gate);
    expect(backStep({ ...p, step: 'camera' }).step).toBe('cameraInfo');
    expect(backStep(PRE_START)).toBe(PRE_START);
  });

  it('every step\'s back lands on a step of the flow: never a URL, never out of the screen', () => {
    const steps: PreStep[] = ['intro', 'age', 'grownUp', 'pain', 'painStop', 'cameraInfo', 'camera'];
    for (const step of steps) for (const age of [...AGE_BANDS, null]) expect(steps, `${step}/${age}`).toContain(backStep({ step, age, gate: null, kind: 'full' }).step);
  });
});
