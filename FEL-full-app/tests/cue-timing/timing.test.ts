// CUE TIMING on synthetic feeds (CUE-REWRITE, 2026-10-27): the Mirror's live coach driven the way the harness drives it
// (tests/helpers/cueTiming.ts), every spoken line logged on the pose clock.
//
// MEASURED BEFORE THE FIX (same feeds, this lane's first run; docs/CUE-AUDIT.md "Timing"):
//   · the hinge's and the push-up's first correction started 3.0–3.5 s into the ~4 s stage line ("Now the work set…"):
//     1 overlap per set, gap −33 ms (hinge) and −600 ms (push-up) — two lines at once;
//   · the rep that closed the set was still cued on the frame the review opened ("Slower. Stay straight." after the last
//     push-up, the regress after the last hinge rep).
// The fixes change WHEN a line is said, not what is detected: CueEngine.holdFor (the coach waits while a line is being
// said; lib/cue-style/speech.ts) and no live cue once the set is over (sideRepStage.ts applySideRepFrame).
import { describe, expect, it } from 'vitest';
import { squatSet, type SquatRep } from '@/tests/helpers/liveSets';
import { hingeSet, pushupSet } from '@/lib/mirror/fixtures/sideRepBuild';
import { HINGE_CUE_TABLE, HINGE_LIVE } from '@/lib/mirror/hingeStage';
import { PUSHUP_CUE_TABLE, PUSHUP_LIVE } from '@/lib/mirror/pushupStage';
import { CueEngine, CONFIRM_LINE } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { speechMs, WORDS_PER_SEC } from '@/lib/cue-style/speech';
import { sideCoach, squatCoach, timing, type Said } from '@/tests/helpers/cueTiming';

const SQ = (pat: (i: number) => SquatRep) => squatSet(Array.from({ length: 11 }, (_, i) => pat(i)));
const SQUATTY = { backM: 0.05, dropM: 0.30, trunkDeg: 30 };
const SAG = { hipOffM: -0.12 };

const FEEDS: [string, () => { said: Said[]; workReps: number }][] = [
  ['squat, clean', () => squatCoach(SQ(() => 'clean'))],
  ['squat, knee caves every rep', () => squatCoach(SQ(() => 'kneeInLeft'))],
  ['squat, knee caves every other rep', () => squatCoach(SQ((i) => (i % 2 ? 'kneeInLeft' : 'clean')))],
  ['squat, knee fixed after work rep 4', () => squatCoach(SQ((i) => (i < 7 ? 'kneeInLeft' : 'clean')))],
  ['hinge, clean', () => sideCoach(HINGE_LIVE, HINGE_CUE_TABLE, hingeSet({ reps: 11, setup: 75 }))],
  ['hinge, knees every rep', () => sideCoach(HINGE_LIVE, HINGE_CUE_TABLE, hingeSet({ reps: 11, setup: 75, rep: () => SQUATTY }))],
  ['hinge, knees every other rep', () => sideCoach(HINGE_LIVE, HINGE_CUE_TABLE, hingeSet({ reps: 11, setup: 75, rep: (i) => (i % 2 ? SQUATTY : undefined) }))],
  ['push-up, sag every rep', () => sideCoach(PUSHUP_LIVE, PUSHUP_CUE_TABLE, pushupSet({ reps: 11, setup: 75, rep: () => SAG }))],
  ['push-up, sag every other rep', () => sideCoach(PUSHUP_LIVE, PUSHUP_CUE_TABLE, pushupSet({ reps: 11, setup: 75, rep: (i) => (i % 2 ? SAG : undefined) }))],
];

describe('the live coach\'s timing, per feed', () => {
  it.each(FEEDS)('%s', (_name, run) => {
    const r = run();
    const t = timing(r);
    expect(r.workReps).toBe(8);
    // one voice at a time: no line starts while another is still being said
    expect(t.overlaps).toBe(0);
    // no praise and correction for the same fault inside 6 s, either order
    expect(t.contradictions).toEqual([]);
    // never more than one correction every other rep (the 6 s hold-down at this tempo): the coach does not spam
    expect(t.correctionsPerRep).toBeLessThanOrEqual(0.5);
    // corrections only in the work set: never during the check (it is measuring), never after the set is over
    for (const s of r.said) if (s.level !== 'line' && s.level !== 'confirm') expect(s.stage, s.text).toBe('work');
    // what is said mid-rep is a live cue: 2–5 words (the regress is said when the set stops: ≤ 14)
    for (const s of r.said) if (s.level === 'cue' || s.level === 'reply' || s.level === 'escalate') expect(s.text.split(/\s+/).length, s.text).toBeLessThanOrEqual(5);
  });

  it('a clean set gets no correction at all', () => {
    for (const [name, run] of FEEDS.filter(([n]) => /clean/.test(n))) {
      expect(run().said.filter((s) => s.level !== 'line'), name).toEqual([]);
    }
  });

  it('a fault the athlete fixes earns one "That\'s it. Keep it." and then silence', () => {
    const r = squatCoach(SQ((i) => (i < 7 ? 'kneeInLeft' : 'clean')));
    const confirms = r.said.filter((s) => s.level === 'confirm');
    expect(confirms.map((s) => s.text)).toEqual([CONFIRM_LINE]);
    expect(r.said.filter((s) => s.t > confirms[0].t && s.level !== 'line')).toEqual([]);
  });
});

describe('CueEngine.holdFor — the coach waits while a line is said', () => {
  it('no cue starts inside the window; the fault is still there after it, so the cue comes then', () => {
    const ce = new CueEngine({ clearByRep: true });
    ce.holdFor(0, speechMs('Now 8 reps. I will coach you between reps.'));
    expect(ce.decide(1000, ['heelRise'])).toBeNull();
    expect(ce.decide(3000, ['heelRise'])).toBeNull();
    const evt = ce.decide(speechMs('Now 8 reps. I will coach you between reps.') + 1, ['heelRise']);
    expect(evt?.level).toBe('cue');
  });
  it('a line takes about words ÷ 2.5 s, plus a breath', () => {
    expect(WORDS_PER_SEC).toBe(2.5);
    expect(speechMs('Knees out over toes')).toBe(1600 + 400);
  });
});
