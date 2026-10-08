// SCREEN A (voice-only live run): nothing is answered silently; the count is always heard; every tracking-slip cause
// says its own line; the stand-stills explain themselves; and a part that keeps losing the athlete stops restarting.
import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { AssessRunner, CueQueue, type RunnerView } from './runner';
import { ohsFront, ohsSide, standFront, standSide } from './replay';
import { th } from './thresholds';
import { LOSS_FRAMES, PART_RESTART_MAX } from '@/lib/screen/ui';
import {
  BEEP_MEANS_COUNTED, CALIBRATE_FRONT_LINE, CALIBRATE_SIDE_LINE, FRAMING_FIX_LINES, PAIN_CHECK_LINE, RESTART_WAIT_LINE,
  TRACKING_LOSS_PROMPT,
} from '@/lib/screen/copy';
import { facingCue } from './protocol';
import { PAIN_REFERRAL } from './why';

const STAND = { front: standFront(0.5), left: standSide('left', 0.5), right: standSide('right', 0.5) };
/** One plain standing part: T1-front's definition with a long leash, so a pause can be watched without reps. */
const standPart = { id: 'T1-front', test: 'T1', view: 'front', target: 3, maxAttempts: 99, maxMs: 120000, label: null, setup: 'Stand.' } as const;

interface Drive {
  /** Answer the after-test pain check with this. */
  painAnswer?: boolean;
  /** Step out of the shot for this long, this many times, in the middle of this part's reps. */
  absences?: { part: string; ms: number; times: number };
  maxLoops?: number;
}

/** The runner driven as the SCREEN A page drives it: hands-free, the pre-camera taps already made (or "Not sure"). */
function drive(sc: Drive = {}, takeoffLeg: 'left' | 'right' | null = 'left') {
  const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, takeoffLeg, cameraFps: () => 30 });
  let t = 0;
  let v: RunnerView = r.tick({ t, present: false, image: [] }, t);
  const steps: string[] = [], said: string[] = [], counts: number[] = [];
  const fed = new Set<string>();
  let absences = 0;
  let painKey: string | null = null;
  const track = () => {
    const key = `${v.step}:${v.part ?? ''}`;
    if (steps[steps.length - 1] !== key) steps.push(key);
    if (v.say) said.push(v.say.text);
    if (v.step === 'active' && counts[counts.length - 1] !== v.reps.count) counts.push(v.reps.count);
    return key;
  };
  const gap = (ms: number) => { for (let g = 0; g < ms; g += 33) { t += 33; v = r.tick({ t, present: false, image: [] }, t); track(); } };
  const feed = (frames: readonly PoseFrame[], opts: { part?: string } = {}) => {
    for (const f of frames) {
      t += 33;
      v = r.tick({ ...f, t }, t);
      track();
      if (opts.part && sc.absences?.part === opts.part && absences < sc.absences.times && v.reps.marks.length > 0) {
        absences++;
        gap(sc.absences.ms);
      }
      if (opts.part && v.part !== opts.part) break;
    }
  };
  const standFor = (vw: RunnerView) => (vw.view === 'side' ? (vw.part === 'T2-right' ? STAND.right : STAND.left) : STAND.front);
  for (let loop = 0; loop < (sc.maxLoops ?? 4000) && v.step !== 'done' && v.step !== 'stopped'; loop++) {
    if (v.step === 'painCheck') {
      // SCREEN A: the check waits for the tap; the drive lets one frame's silence pass, then taps as the page's big
      // Yes/No does — so a steps log with 'painCheck' proves the tap was needed (a timeout would have moved it on)
      if (painKey && steps[steps.length - 1] === painKey) {
        r.answerPain(sc.painAnswer ?? false, t);
        painKey = null;
      } else painKey = `${v.step}:${v.part ?? ''}`;
      t += 33;
      v = r.tick({ ...standFor(v).frames[0], t }, t);
      track();
      continue;
    }
    if (v.step === 'active') {
      const part = v.part!;
      if (!fed.has(part)) {
        fed.add(part);
        feed((part === 'T1-front' ? ohsFront({}) : part === 'T1-side' ? ohsSide({}) : STAND.front).frames, { part });
      } else feed(standFor(v).frames);
    } else feed(standFor(v).frames);
  }
  return { r, v, steps, said, counts };
}

describe('SCREEN A 2: no silent answers', () => {
  it('hands-free with the take-off tap answered "right" is scored right — no hidden "left" default', () => {
    const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, takeoffLeg: 'right' });
    expect(r.takeoffLeg).toBe('right');
    let t = 0;
    let v = r.tick({ t, present: false, image: [] }, t);
    for (let i = 0; i < 400 && v.step !== 'calibrate'; i++) { t += 33; v = r.tick({ ...STAND.front.frames[0], t }, t); }
    expect(v.step).toBe('calibrate');                                   // framing went straight to the calibration
    expect(r.takeoffLeg).toBe('right');
  });

  it('a "Not sure" answer (null) stays null the whole way and is never asked or defaulted', () => {
    const run = drive({}, null);
    expect(run.v.step).toBe('done');
    expect(run.r.takeoffLeg).toBeNull();
    expect(run.v.result!.takeoffLeg).toBeNull();
    expect(run.steps.some((s) => s.startsWith('takeoff:'))).toBe(false);
  });

  it('an un-answered runner (no takeoffLeg option) parks on the takeoff prompt, hands-free or not', () => {
    const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true });
    let t = 0;
    let v = r.tick({ t, present: false, image: [] }, t);
    for (let i = 0; i < 400 && v.step !== 'takeoff'; i++) { t += 33; v = r.tick({ ...STAND.front.frames[0], t }, t); }
    expect(v.step).toBe('takeoff');
    for (let i = 0; i < 60; i++) { t += 33; r.autoAdvance(t); v = r.tick({ ...STAND.front.frames[0], t }, t); }
    expect(v.step).toBe('takeoff');                                     // autoAdvance answers nothing any more
    expect(r.takeoffLeg).toBeNull();
    r.answerTakeoff('left', t);
    t += 33;
    expect(r.tick({ ...STAND.front.frames[0], t }, t).step).toBe('calibrate');
  });

  it('the first pain prompt waits for its tap too: autoAdvance moves nothing', () => {
    const r = new AssessRunner({ aspect: 4 / 3 });                      // the pre-camera pain question not pre-asked
    let t = 0;
    let v = r.tick({ t, present: false, image: [] }, t);
    for (let i = 0; i < 400 && v.step !== 'pain'; i++) { t += 33; v = r.tick({ ...STAND.front.frames[0], t }, t); }
    expect(v.step).toBe('pain');
    r.autoAdvance(t + 33);
    expect(r.tick({ ...STAND.front.frames[0], t: t + 66 }, t + 66).step).toBe('pain');
  });
});

describe('SCREEN A 3: the pain check after each test, by voice and one big tap', () => {
  it('hands-free visits painCheck after the test, says the walk-back line, and waits — no timeout', () => {
    const run = drive({ maxLoops: 900 });
    expect(run.v.step).toBe('done');
    expect(run.steps.filter((s) => s.startsWith('painCheck:'))).toHaveLength(4);   // after each TEST, incl. T1's second part
    expect(run.said).toContain(PAIN_CHECK_LINE);
    // and it really waited: drive() feeds plain standing frames between the check and the tap, with the clock running
  });

  it('the check does not advance on its own while the athlete walks back', () => {
    const run = drive({ maxLoops: 900 });
    const t1 = run.steps.indexOf('miniResult:');
    expect(t1).toBeGreaterThan(0);
    expect(run.steps[t1 + 1]).toBe('painCheck:');
  });

  it('"Yes" stops the screen with pain and nothing is scored after', () => {
    const run = drive({ painAnswer: true, maxLoops: 900 });
    expect(run.v.step).toBe('stopped');
    expect(run.v.result!.pain).toBe(true);
    expect(run.v.result!.tests.some((t) => t.status === 'painStop')).toBe(true);
    expect(run.said).toContain(PAIN_REFERRAL);
    expect(run.steps.filter((s) => s.startsWith('active:')).length).toBeLessThan(7);
  });
});

describe('SCREEN A 6: every count is heard', () => {
  it('the count line is forced: a waiting "Slower." can never replace it', () => {
    const q = new CueQueue(2500);
    q.push('Slower.', 0, true);
    expect(q.take(0)?.text).toBe('Slower.');
    q.push('Slower.', 10, true);                                // a routine "Slower." waiting…
    q.push('One', 100, true);                                   // …is replaced by the forced count
    expect(q.take(101)?.text).toBe('One');                      // forced: no gap
    expect(q.take(3000)).toBeNull();                            // and "Slower." is gone — never said over the count
  });

  it('the spoken count for every counted rep, and "Beep means it counted." once per run', () => {
    const run = drive();
    expect(run.v.step).toBe('done');
    expect(run.counts.slice(0, 3)).toEqual([0, 1, 2]);          // T1-front's counted reps
    expect(run.said).toContain('One');
    expect(run.said).toContain('Two');
    expect(run.said.filter((s) => s === BEEP_MEANS_COUNTED)).toHaveLength(1);
  });
});

describe('SCREEN A 7 & 8: one spoken fix per cause, and the stand-stills explain themselves', () => {
  /** One part (T1 front), framed badly from the first frame: the athlete never gets in. */
  function badShot(make: (f: PoseFrame) => PoseFrame, loops = 400) {
    const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, takeoffLeg: 'left' });
    let t = 0;
    let v = r.tick({ t, present: false, image: [] }, t);
    const said: string[] = [];
    for (let i = 0; i < loops && v.step === 'framing'; i++) {
      t += 33;
      v = r.tick(make(STAND.front.frames[0]), t);
      if (v.say) said.push(v.say.text);
    }
    return { v, said };
  }

  const shift = (dx: number, dy: number) => (f: PoseFrame): PoseFrame => ({ ...f, image: f.image.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy })) });
  const squash = (k: number) => (f: PoseFrame): PoseFrame => ({ ...f, image: f.image.map((l) => ({ ...l, y: 0.5 + (l.y - 0.5) * k })) });

  it('each framing cause gets its own line, never the tracking-loss prompt', () => {
    expect(badShot((f) => f).said.every((s) => s === 'Hold that.')).toBe(true);    // a good shot: nothing to fix
    expect(badShot(() => ({ t: 0, present: false, image: [] })).said).toContain(FRAMING_FIX_LINES.noBody);
    expect(badShot(squash(0.2)).said).toContain(FRAMING_FIX_LINES.tooFar);
    expect(badShot(shift(0.3, 0)).said).toContain(FRAMING_FIX_LINES.offCentre);
    expect(badShot((f) => ({ ...f, image: f.image.map((l, i) => (i === 27 || i === 28 ? { ...l, v: 0.1 } : l)) })).said).toContain(FRAMING_FIX_LINES.cutOffBottom);
    expect(badShot(shift(0, -0.4)).said).toContain(FRAMING_FIX_LINES.cutOffTop);
  });

  it('tooClose, dim and "turned" get their own lines (the framing worst order puts the cut-offs first)', () => {
    // measured on the synthetic athlete: a body a third again too big reads "too close" with the feet already out of
    // the shot (the framing worst order says the cut-offs first), and a low-visibility body reads "dim" behind its
    // "turned" read — so all three lines are pinned through the runner's own helper, and the causes through framing
    const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, takeoffLeg: 'left' });
    const helper = r as unknown as { fixLine(f: { worst: string }): string | null };
    expect(helper.fixLine({ worst: 'tooClose' })).toBe(FRAMING_FIX_LINES.tooClose);
    expect(helper.fixLine({ worst: 'dim' })).toBe(FRAMING_FIX_LINES.dim);
    expect(helper.fixLine({ worst: 'turned' })).toBe(facingCue('front'));
    expect(helper.fixLine({ worst: null })).toBeNull();
    const big = badShot(squash(1.5)).said;
    expect(big).toContain(FRAMING_FIX_LINES.cutOffBottom);
    expect(big.some((s) => s === FRAMING_FIX_LINES.tooClose || s === FRAMING_FIX_LINES.cutOffBottom)).toBe(true);
    const dimmed = badShot((f) => ({ ...f, image: f.image.map((l) => ({ ...l, v: 0.4 })) })).said;
    expect(dimmed).toContain(facingCue('front'));                               // the turned read comes first
    for (const s of dimmed) expect(s).not.toContain(TRACKING_LOSS_PROMPT);
  });

  it('TRACKING_LOSS_PROMPT is kept for a pause with no framing cause (the model loses a body it can see)', () => {
    const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, takeoffLeg: 'left', parts: [standPart] });
    let t = 0;
    let v: RunnerView = r.tick({ t, present: false, image: [] }, t);
    const said: string[] = [];
    const push = (f: PoseFrame) => { t += 33; v = r.tick({ ...f, t }, t); if (v.say) said.push(v.say.text); };
    // into the active step
    for (let i = 0; i < 400 && v.step !== 'active'; i++) push(STAND.front.frames[0]);
    expect(v.step).toBe('active');
    // the knees and ankles sink under the skeleton's confidence floor (0.5) but stay 'seen' by the framing check
    // (0.3): tracking is lost while the shot reads completely fine — no framing cause at all
    const lost: PoseFrame = {
      ...STAND.front.frames[0],
      image: STAND.front.frames[0].image.map((l, i) => (i >= 25 && i <= 28 ? { ...l, v: 0.45 } : l)),
    };
    for (let i = 0; i < LOSS_FRAMES + 2 && v.step !== 'paused'; i++) push(lost);
    expect(v.step).toBe('paused');
    expect(v.framing!.worst).toBeNull();
    // the pause line is queued as the step flips — after this tick's line was already taken — and then waits out the
    // speech gap behind 'Go.': within a couple of seconds of paused ticks it is said
    for (let i = 0; i < 90 && !said.includes(`${TRACKING_LOSS_PROMPT}.`); i++) push(lost);
    expect(said).toContain(`${TRACKING_LOSS_PROMPT}.`);
    for (const line of Object.values(FRAMING_FIX_LINES)) expect(said).not.toContain(line);
    // and the paused instruction carries the same tracking-loss line
    expect(v.instruction.startsWith(`${TRACKING_LOSS_PROMPT}.`)).toBe(true);
  });

  it('the calibrations say what the standing still is for (the timings are unchanged)', () => {
    const run = drive();
    expect(run.said).toContain(CALIBRATE_FRONT_LINE);
    expect(run.said).toContain(CALIBRATE_SIDE_LINE);
    expect(run.said).not.toContain('Stand still facing the camera, arms by your sides, for three seconds.');
    expect(run.said).not.toContain('Stand still for two seconds.');
  });
});

describe('SCREEN A 9: the restart loop is capped', () => {
  it('after the one auto-retry and one more restart, further absences do not reset or re-speak the setup', () => {
    const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, takeoffLeg: 'left', parts: [standPart] });
    let t = 0;
    let v: RunnerView = r.tick({ t, present: false, image: [] }, t);
    const said: string[] = [];
    const push = (f: PoseFrame) => { t += 33; v = r.tick({ ...f, t }, t); if (v.say) said.push(v.say.text); };
    // into the active step, one rep counted (feed the squat take until the first rep lands), then the walk-offs.
    // A restart needs the athlete back in the shot long enough to pass the position hold before the next absence, or
    // the absence clock simply carries on (the runner's standing behaviour for someone who never comes back).
    for (let i = 0; i < 400 && v.step !== 'active'; i++) push(STAND.front.frames[0]);
    expect(v.step).toBe('active');
    const take = ohsFront({}).frames;
    for (let i = 0; i < take.length && v.reps.marks.length === 0; i++) push(take[i]);
    expect(v.reps.marks.length).toBeGreaterThan(0);
    // out of frame: pose timestamps keep moving (the camera still delivers frames — the athlete is just not in them)
    const absentMs = th('gate.absenceRestartMs') + 400;
    const absence = () => { for (let g = 0; g < absentMs; g += 33) push({ t, present: false, image: [] }); };
    const back = (ms = 6600) => { for (let g = 0; g < ms; g += 33) push(STAND.front.frames[0]); };
    const marks: number[] = [];
    const saidPastCap: string[] = [];
    for (let round = 0; round < PART_RESTART_MAX + 2; round++) {
      const saidBefore = said.length;
      absence();
      marks.push(v.reps.marks.length);
      if (round > PART_RESTART_MAX) saidPastCap.push(...said.slice(saidBefore));   // absences after the capped one
      expect(v.step === 'position' || v.step === 'paused').toBe(true);
      if (round < PART_RESTART_MAX) back();                                        // back in the shot before the next walk-off
    }
    expect(said.filter((s) => s.includes('trying this move once more'))).toHaveLength(PART_RESTART_MAX);
    expect(said.filter((s) => s === RESTART_WAIT_LINE)).toHaveLength(1);           // spoken once, on the cap
    expect(said.filter((s) => s.startsWith('Starting that one again.'))).toHaveLength(0);
    expect(marks).toEqual(marks.map(() => 0));                                     // every restart really reset the part
    expect(said.filter((s) => s === 'Stand.')).toHaveLength(1);                    // the setup is never re-spoken
    // …and past the cap it is silent: no retry, no wait line again, no setup — at most the throttled framing fix
    expect(saidPastCap.filter((s) => s.includes('trying this move once more') || s === RESTART_WAIT_LINE || s === 'Stand.')).toEqual([]);
    // …and the athlete who walks back into the shot still resumes where the part was
    back();
    for (let i = 0; i < 400 && v.step !== 'active'; i++) push(STAND.front.frames[0]);
    expect(v.step).toBe('active');
  });

  it('a short loss still pauses with the fix line and resumes where it was', () => {
    const run = drive({ absences: { part: 'T1-front', ms: 33 * (LOSS_FRAMES + 2), times: 1 }, maxLoops: 900 });
    expect(run.steps).toContain('paused:T1-front');
    expect(run.said).toContain(FRAMING_FIX_LINES.noBody);              // out of the shot: the framing cause's line
    expect(run.v.step).toBe('done');
  });
});
