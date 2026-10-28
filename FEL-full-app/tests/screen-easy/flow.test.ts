// SCREEN-EASY (2026-10-28): the FULL Quick Screen's live flow, played end to end by lib/screen-easy/sim.ts (the real
// runner, the replay's synthetic athlete). Pins what docs/SCREEN-EASY-AUDIT.md §2 found and §4 fixed:
//   · the front-on moves first and the wall last (one turn to side-on, one at the wall);
//   · the pain check after each TEST is still asked, every time, and still waits for an answer — now both hands up, from
//     where the athlete stands, instead of a walk to the device and back; "yes" is still a tap and still stops the screen;
//   · the set-up lines are heard (the countdown waits for them), the "done" card is the pain check's first line;
//   · the second side of a move starts on "Go." once the athlete is in place, and the wrong leg is held;
//   · no wall: one tap skips the ankle bend, which is then not read (never guessed);
//   · the grades are the same ones the offline grader gives (no grader, band or threshold changed).
import { describe, expect, it } from 'vitest';
import { simulateFullScreen } from '@/lib/screen-easy/sim';
import { AssessRunner, QUICK_PARTS, REST_PARTS, STANCE_FOOT_UP } from '@/lib/assess/runner';
import { film, singleLegSquat, slsJoints, standFront } from '@/lib/assess/replay';
import { PAIN_CHECK_LINE } from '@/lib/screen/copy';
import { SETUP } from '@/lib/screen-easy/copy';
import { PAIN_REFERRAL } from '@/lib/assess/why';
import { th } from '@/lib/assess/thresholds';
import { HandsUpAnswer, HANDS_UP_HOLD_MS, handsAreUp } from '@/lib/screen-easy/handsUp';

describe('the order: front-on first, then side-on, the wall last', () => {
  it('T1 facing, T3 left and right, the jump, then T1 side-on and the ankle bend at the wall', () => {
    expect(QUICK_PARTS.map((p) => p.id)).toEqual(['T1-front', 'T3-left', 'T3-right', 'T5', 'T1-side', 'T2-left', 'T2-right']);
    // one change of view from front to side, and no way back
    const views = QUICK_PARTS.map((p) => p.view);
    expect(views.filter((v, i) => i && v !== views[i - 1])).toEqual(['side']);
    expect(QUICK_PARTS[QUICK_PARTS.length - 1].test).toBe('T2');
    expect(REST_PARTS.map((p) => p.id)).toEqual(['T1-front', 'T3-left', 'T3-right', 'T1-side', 'T2-left', 'T2-right']);
  });
});

describe('the whole screen, live (realistic noise, 1% missed frames)', () => {
  const r = simulateFullScreen({ noise: true, dropRate: 0.01, seed: 1 });

  it('reaches the result with every test scored, in under 160 s of camera time, with no walk to the device', () => {
    expect(r.done).toBe(true);
    expect(r.result!.tests.map((t) => `${t.id}:${t.status}`)).toEqual(['T1:scored', 'T2:scored', 'T3:scored', 'T5:scored']);
    expect(r.numberMs! / 1000).toBeLessThan(160);
    expect(r.taps).toBe(0);
    expect(r.handsUp).toBe(4);
  });

  it('asks the pain check after each of the four tests, and the done line comes first in the same line', () => {
    const asks = r.said.filter((s) => s.text.endsWith(PAIN_CHECK_LINE)).map((s) => s.text);
    expect(asks).toHaveLength(4);
    expect(asks.map((a) => a.replace(PAIN_CHECK_LINE, '').trim())).toEqual([
      'Three. Single-leg squat: done.', 'Jump: done.', 'Three. Overhead squat: done.', 'Three. Ankle bend: done.',
    ]);
  });

  it('every set-up line is heard: none is cut off (the calibration count runs with its 3 s stand; a turn fix ends when they turn)', () => {
    const setups = new Set<string>(Object.values(SETUP));
    expect(r.cut.filter((c) => setups.has(c.text) || c.text.endsWith(PAIN_CHECK_LINE))).toEqual([]);
    expect(r.cut.length).toBeLessThanOrEqual(2);
  });

  it('no rep refused on a clean athlete (the live heel check reads the same smoothed series as its floor)', () => {
    expect(r.parts.flatMap((p) => p.refused)).toEqual([]);
  });

  it('the second leg of the single-leg squat starts on "Go." — no second 3-2-1 — and the second ankle side too', () => {
    const goAfter = (part: string) => {
      const p = r.parts.find((x) => x.part === part)!;
      return r.said.filter((s) => s.at >= p.startMs && s.at <= p.activeMs!).map((s) => s.text);
    };
    expect(goAfter('T3-right')).not.toContain('3');
    expect(goAfter('T3-right')).toContain('Go.');
    expect(goAfter('T2-right')).not.toContain('3');
    expect(goAfter('T3-left')).toContain('3');           // a first side keeps its countdown
  });
});

describe('the pain check still waits for an answer', () => {
  /** A runner of the single-leg squat's left side alone, driven to its pain check (stands, then three reps). */
  function atPainCheck(): AssessRunner {
    const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, takeoffLeg: null, parts: [{ ...QUICK_PARTS[1] }] });
    const stand = standFront(1).frames, onLeft = film({ fps: 60, frames: Array.from({ length: 61 }, () => slsJoints('left', 0)) }, { fps: 30 }).frames;
    let t = 0, v = r.tick({ t, present: false, image: [] }, t);
    for (let i = 0; i < 4000 && v.step !== 'position'; i++) { t += 33; v = r.tick({ ...stand[i % stand.length], t }, t); }
    for (let i = 0; i < 4000 && v.step !== 'active'; i++) { t += 33; v = r.tick({ ...onLeft[i % onLeft.length], t }, t); }
    for (const f of singleLegSquat('left', {}, { reps: 3 }).frames) { t += 33; v = r.tick({ ...f, t }, t); if (v.step !== 'active' && v.step !== 'paused') break; }
    for (let i = 0; i < 60 && v.step === 'painCheck'; i++) { t += 33; v = r.tick({ ...stand[i % stand.length], t }, t); }
    expect(v.step).toBe('painCheck');                            // standing there, hands down: it waits
    expect(v.handsUpAnswer).toBe(true);
    return r;
  }

  it('hands already up when the question shows do not count; down, then up for the hold, does', () => {
    const a = new HandsUpAnswer();
    const up = film({ fps: 60, frames: Array.from({ length: 61 }, () => handsUpPose()) }, { fps: 30 }).frames;
    const down = standFront(1).frames;
    expect(handsAreUp(up[0])).toBe(true);
    let fired = false, t = 0;
    for (const f of up) { t += 33; fired ||= a.feed({ ...f, t }); }
    expect(fired).toBe(false);                                   // never armed
    for (const f of down.slice(0, 5)) { t += 33; a.feed({ ...f, t }); }
    const start = t;
    for (const f of up) { t += 33; if (a.feed({ ...f, t })) { fired = true; break; } }
    expect(fired).toBe(true);
    expect(t - start).toBeGreaterThanOrEqual(HANDS_UP_HOLD_MS);
  });

  it('a missed frame neither arms nor breaks the hold; a hand that drops resets it', () => {
    const a = new HandsUpAnswer();
    const up = film({ fps: 60, frames: Array.from({ length: 61 }, () => handsUpPose()) }, { fps: 30 }).frames;
    let t = 0;
    a.feed({ ...standFront(1).frames[0], t });
    let fired = false;
    for (let i = 0; i < up.length && !fired; i++) { t += 33; fired = a.feed(i % 4 === 3 ? { t, present: false, image: [] } : { ...up[i], t }); }
    expect(fired).toBe(true);
  });

  it('"Yes" is still one tap, and it stops the screen with the referral', () => {
    const r = atPainCheck();
    r.answerPain(true, 1e7);
    const v = r.view(1e7 + 1);
    expect(v.step).toBe('stopped');
    expect(v.result!.pain).toBe(true);
    expect(v.result!.tests.find((t) => t.id === 'T3')!.status).toBe('painStop');
  });

  it('"Something hurts: stop" still works at the pain check, and through every part', () => {
    const r = atPainCheck();
    r.reportPain(1e7);
    expect(r.view(1e7 + 1).step).toBe('stopped');
    expect(r.view(1e7 + 2).say?.text ?? PAIN_REFERRAL).toBe(PAIN_REFERRAL);
  });

  it('with nobody answering, the check never moves on by itself', () => {
    const r = simulateFullScreen({ seed: 3, handsUpMs: 10_000_000, tapMs: 10_000_000, limitMs: 90_000 });
    expect(r.done).toBe(false);
    expect(r.steps.painCheck! / 1000).toBeGreaterThan(20);      // parked on the first check until the limit
  });
});

describe('the single-leg squat waits for the right leg', () => {
  it('standing on the left leg for the right-leg part: "Other leg", no countdown; on the right leg: "Go."', () => {
    const parts = [QUICK_PARTS[1], QUICK_PARTS[2]];
    const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, takeoffLeg: 'left', parts });
    const stand = standFront(1).frames;
    const onLeft = film({ fps: 60, frames: Array.from({ length: 61 }, () => slsJoints('left', 0)) }, { fps: 30 }).frames;
    const onRight = film({ fps: 60, frames: Array.from({ length: 61 }, () => slsJoints('right', 0)) }, { fps: 30 }).frames;
    let t = 0, v = r.tick({ t, present: false, image: [] }, t);
    const step = (f: (typeof stand)[number]) => { t += 33; v = r.tick({ ...f, t }, t); return v; };
    for (let i = 0; i < 4000 && v.step !== 'active'; i++) step(stand[i % stand.length]);
    const reps = singleLegSquat('left', {}, { reps: 3 }).frames;
    for (const f of reps) { step(f); if (v.part !== 'T3-left') break; }
    for (let i = 0; i < 400 && v.part !== 'T3-right'; i++) step(onLeft[i % onLeft.length]);
    expect(v.part).toBe('T3-right');
    const said: string[] = [];
    for (let i = 0; i < 300; i++) { step(onLeft[i % onLeft.length]); if (v.say) said.push(v.say.text); }
    expect(v.step).toBe('position');
    expect(v.wrongLeg).toBe(true);
    expect(said).toContain('Other leg. Stand on your right leg.');
    for (let i = 0; i < 300 && v.step !== 'active'; i++) { step(onRight[i % onRight.length]); if (v.say) said.push(v.say.text); }
    expect(v.step).toBe('active');
    expect(said[said.length - 1]).toBe('Go.');
    expect(STANCE_FOOT_UP).toBe(2 * th('t5.contactLine'));
  });
});

describe('no wall', () => {
  it('one tap skips the ankle bend: it is not read (never guessed), the rest is scored', () => {
    const r = simulateFullScreen({ noise: true, dropRate: 0.01, seed: 1, wall: false });
    expect(r.done).toBe(true);
    expect(r.taps).toBe(1);
    expect(r.result!.tests.map((t) => `${t.id}:${t.status}`)).toEqual(['T1:scored', 'T2:skipped', 'T3:scored', 'T5:scored']);
    expect(r.said[r.said.length - 1].text).toMatch(/^Ankle bend skipped: it needs a wall\. That is the screen done\./);
  });

  it('the way out exists only while the ankle bend is being set up', () => {
    let seen: string[] = [];
    simulateFullScreen({ seed: 1, onView: (v) => { if (v.canSkipWall) seen.push(`${v.part}:${v.step}`); } });
    seen = [...new Set(seen)];
    expect(seen.every((s) => /^T2-(left|right):(position|countdown)$/.test(s))).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
  });
});

// ── a body with both hands up (the sim's own pose, for the answer tests) ──
import { restPose, type Joints } from '@/lib/pose/synth';
function handsUpPose(): Joints {
  const j = restPose();
  j.LeftForeArm = [0.24, 1.72, 0]; j.LeftHand = [0.25, 1.98, 0.01];
  j.RightForeArm = [-0.24, 1.72, 0]; j.RightHand = [-0.25, 1.98, 0.01];
  return j;
}
