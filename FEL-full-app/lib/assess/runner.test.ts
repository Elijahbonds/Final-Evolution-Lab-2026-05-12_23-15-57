// The live flow, driven frame by frame the way the page drives it: a synthetic athlete who stands where they are asked,
// does the movement when the countdown ends, and answers the prompts.
import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { AssessRunner, CueQueue, QUICK_PARTS, gradeSession, miniLine, type RunnerView } from './runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, standFront, standSide, syntheticCalibration, type Capture, type OhsOpts, type SlsOpts } from './replay';
import type { Side, TestId } from './protocol';
import { PAIN_REFERRAL } from './why';

interface Scenario {
  t1Front?: { kneeInL?: number };
  t1Side?: OhsOpts;
  t3Left?: SlsOpts;
  /** Answer yes at this prompt: 'pre' (before anything) or after a test. */
  painAt?: 'pre' | TestId;
  /** Step out of the shot for this long in the middle of this part's reps. */
  absence?: { part: string; ms: number };
}

const STAND = { front: standFront(0.5), left: standSide('left', 0.5), right: standSide('right', 0.5) };

function drive(sc: Scenario = {}, maxLoops = 4000) {
  const r = new AssessRunner({ aspect: 4 / 3, cameraFps: () => 30 });
  let t = 0;
  let v: RunnerView = r.tick({ t, present: false, image: [] }, t);
  const steps: string[] = [], said: string[] = [];
  const highFps = new Set<string>();
  const fed = new Set<string>();
  // SCREEN-SHIP: `part` stops the take when that part ends (the athlete does as told: three reps now, A2-2, so a
  // five-rep take's leftover reps would otherwise run into the next part: left-leg squats read as the right leg's
  // free foot touching down)
  const feed = (c: Capture | PoseFrame[], opts: { gapAt?: number; gapMs?: number; part?: string } = {}) => {
    const frames = Array.isArray(c) ? c : c.frames;
    const first = frames[0]?.t ?? 0;
    const start = t + 33;
    let shift = 0;
    for (let k = 0; k < frames.length; k++) {
      if (opts.gapAt !== undefined && k === opts.gapAt) {
        // step out of the shot: no body for gapMs
        for (let g = 0; g < opts.gapMs!; g += 33) { t = start + (frames[k].t - first) + shift + g; v = r.tick({ t, present: false, image: [] }, t); track(); }
        shift += opts.gapMs!;
      }
      t = start + (frames[k].t - first) + shift;
      v = r.tick({ ...frames[k], t }, t);
      track();
      if (opts.part && v.part !== opts.part) break;
    }
  };
  const track = () => {
    if (steps[steps.length - 1] !== `${v.step}:${v.part ?? ''}`) steps.push(`${v.step}:${v.part ?? ''}`);
    if (v.say) said.push(v.say.text);
    if (v.wantsHighFps && v.part) highFps.add(v.part);
  };
  const standFor = (vw: RunnerView) => (vw.view === 'side' ? (vw.part === 'T2-right' ? STAND.right : STAND.left) : STAND.front);
  for (let loop = 0; loop < maxLoops && v.step !== 'done' && v.step !== 'stopped'; loop++) {
    switch (v.step) {
      case 'pain': r.answerPain(sc.painAt === 'pre', t); v = r.tick({ ...STAND.front.frames[0], t: (t += 33) }, t); track(); break;
      case 'painCheck': r.answerPain(sc.painAt === v.test, t); v = r.tick({ ...STAND.front.frames[0], t: (t += 33) }, t); track(); break;
      case 'takeoff': r.answerTakeoff('left', t); v = r.tick({ ...STAND.front.frames[0], t: (t += 33) }, t); track(); break;
      case 'active': {
        const part = v.part!;
        if (!fed.has(part)) {
          fed.add(part);
          const cap = part === 'T1-front' ? ohsFront(sc.t1Front ?? {}) : part === 'T1-side' ? ohsSide(sc.t1Side ?? {})
            : part === 'T2-left' ? kneeWall('left') : part === 'T2-right' ? kneeWall('right')
            : part === 'T3-left' ? singleLegSquat('left', sc.t3Left ?? {}) : part === 'T3-right' ? singleLegSquat('right')
            : cmj([{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }]);
          feed(cap, sc.absence?.part === part ? { gapAt: Math.floor(cap.frames.length / 2), gapMs: sc.absence.ms, part } : { part });
        } else feed(standFor(v));
        break;
      }
      default: feed(standFor(v));
    }
  }
  return { r, v, steps, said, highFps };
}

describe('the Quick Screen, start to finish', () => {
  const run = drive();

  it('walks framing → pain → takeoff → calibration → every part → results', () => {
    expect(run.v.step).toBe('done');
    const seq = run.steps.map((s) => s.split(':')[0]);
    expect(seq.slice(0, 4)).toEqual(['framing', 'pain', 'takeoff', 'calibrate']);
    for (const p of QUICK_PARTS) expect(run.steps, p.id).toContain(`active:${p.id}`);
    expect(run.steps).toContain('calibrateSide:T1-side');
    expect(seq.filter((s) => s === 'miniResult')).toHaveLength(4);
    expect(seq.filter((s) => s === 'painCheck')).toHaveLength(4);
  });

  it('grades what it watched: a clean athlete, 3/3 across the board, a jump near 45 cm', () => {
    const res = run.v.result!;
    expect(res.pain).toBe(false);
    expect(res.tests.map((t) => `${t.id}:${t.status}:${t.score03}`)).toEqual(['T1:scored:3', 'T2:scored:3', 'T3:scored:3', 'T5:scored:3']);
    expect(res.tests[3].t5!.bestHeightCm!).toBeGreaterThan(43);
    expect(res.tests[3].t5!.bestHeightCm!).toBeLessThan(47);
    expect(res.mqs).toMatchObject({ label: 'Quick', fmsTotal: 12, fmsMax: 12 });
    expect(res.prqPreview.map((w) => w.axis).sort()).toEqual(['flexibility', 'power']);
    expect(res.takeoffLeg).toBe('left');
  });

  it('says one thing at a time: the setup, the countdown, the rep count, the mini-result — and no pattern coaching', () => {
    expect(run.said).toEqual(expect.arrayContaining(['3', '2', '1', 'Go.', 'One', 'Two', 'Three. Done.', 'Any pain right now? Tap yes or no.']));
    // SCREEN-SHIP: the per-test card says "done" (no score mid-screen; the grades come once, in words, on the results)
    expect(run.said.some((s) => /^Three\. Overhead squat: done\.$/.test(s))).toBe(true);
    expect(run.said.some((s) => /^Three\. Single-leg squat: done\.$/.test(s))).toBe(true);
    expect(run.said.filter((s) => s === 'Three. Done.').length).toBe(3);   // the beat after T1-front, T2-left, T3-left
    expect(run.said.filter((s) => /knees? out|chest up|brace|keep your back|straighten/i.test(s))).toEqual([]);
  });

  it('asks for 60 fps on the jump, and only there', () => {
    expect([...run.highFps]).toEqual(['T5']);
  });

  it('holds no frames once it is done (the skeletons for the results page are the only landmarks kept)', () => {
    const res = run.v.result!;
    expect(res.tests.every((t) => t.frozen.every((f) => f.image.length === 33))).toBe(true);
  });
});

describe('what it sees changes the verdict, live and in the result', () => {
  it('a caving left knee turns the T1 front reps amber and faults the left knee', () => {
    const run = drive({ t1Front: { kneeInL: 0.06 } });
    const t1 = run.v.result!.tests[0];
    expect(t1.sides.both!.metrics.filter((m) => m.fault).map((m) => m.id)).toEqual(['valgusLeft']);
    expect(run.v.result!.findings.length).toBeGreaterThan(0);
  });
});

describe('leaving the shot', () => {
  it('a short absence pauses the part and it resumes where it was', () => {
    const run = drive({ absence: { part: 'T3-left', ms: 2000 } });
    expect(run.steps).toContain('paused:T3-left');
    expect(run.v.step).toBe('done');
    expect(run.v.result!.tests[2].sides.left!.repsValid).toBe(3);   // SCREEN-SHIP: three reps asked (A2-2; was five)
  });

  it('six seconds out of the shot restarts the part', () => {
    const run = drive({ absence: { part: 'T1-front', ms: 6500 } });
    expect(run.said.some((x) => x.startsWith('Starting that one again.') || x.includes('trying this move once more'))).toBe(true);
    const i = run.steps.indexOf('paused:T1-front');
    expect(run.steps.slice(i)).toContain('position:T1-front');
  });
});

describe('pain stops the screen', () => {
  it('pain before anything: the referral, no scores, nothing to save', () => {
    const run = drive({ painAt: 'pre' });
    expect(run.v.step).toBe('stopped');
    expect(run.v.result).toMatchObject({ pain: true, tests: [], mqs: null, prqPreview: [] });
    expect(run.said).toContain(PAIN_REFERRAL);
  });

  it('pain after a test: that test is 0/3, the rest never run, no MQS, no PRQ', () => {
    const run = drive({ painAt: 'T2' });
    const res = run.v.result!;
    expect(run.v.step).toBe('stopped');
    expect(res.tests.map((t) => `${t.id}:${t.status}`)).toEqual(['T1:scored', 'T2:painStop', 'T3:skipped', 'T5:skipped']);
    expect(res.tests[1].score03).toBe(0);
    expect(res.mqs).toBeNull();
    expect(res.prqPreview).toEqual([]);
    expect(res.findings).toEqual([]);
    expect(run.steps.some((s) => s.startsWith('active:T3'))).toBe(false);
  });

  it('pain reported mid-test stops it there', () => {
    const r = new AssessRunner({ aspect: 4 / 3, takeoffLeg: 'right' });
    r.reportPain(0);
    expect(r.view(0).step).toBe('stopped');
  });
});

describe('the pieces', () => {
  it('the cue queue speaks at most once per gap, replaces an unsaid line, and does not nag', () => {
    const q = new CueQueue(2500);
    q.push('Step back.', 0);
    expect(q.take(0)).toMatchObject({ text: 'Step back.' });
    q.push('A', 100); q.push('B', 200);
    expect(q.take(1000)).toBeNull();
    expect(q.take(2600)).toMatchObject({ text: 'B' });
    q.push('B', 3000);
    expect(q.take(6000)).toBeNull();                      // the same line again within 8 s is dropped
    q.push('3', 6100, true);
    q.push('Step back.', 6100);                          // a routine line does not displace a forced one
    expect(q.take(6100)).toMatchObject({ text: '3' });   // forced: no gap
  });

  it('the mini-result line (spec §8)', () => {
    const res = gradeSession({ calibration: syntheticCalibration(), T3: { left: singleLegSquat('left', { kneeIn: 0.06 }).frames, right: singleLegSquat('right').frames } });
    expect(miniLine(res.tests[2])).toBe('Single-leg squat L 2/3 · R 3/3');
  });

  it('gradeSession is deterministic', () => {
    const cap = { calibration: syntheticCalibration(), T2: { left: kneeWall('left').frames, right: kneeWall('right', { tibiaMax: 36 }).frames } as Record<Side, PoseFrame[]> };
    expect(gradeSession(cap)).toEqual(gradeSession(cap));
  });
});
