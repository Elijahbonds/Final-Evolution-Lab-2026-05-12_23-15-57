// MIRROR-FIXES (2026-10-25): the live lunge's rep counter (lungeReps.ts) under the synth's default landmark jitter.
// lane/coach-video-review measured the harness's old count (RepCounter on LungeAudit's velocity phase) at 24 of 76
// jittered lunges over 6 seeds; this lane reproduced it (scripts/probes/_mirror-live-jitter.ts) before the fix.
import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { RepCounter } from '@/lib/babylon/nexus/neuro-mirror/rules/rep-counter';
import { LungeAudit, type LungeFrameResult } from './lungeAudit';
import { LUNGE_REP_ARM_DEPTH, LUNGE_REP_END_DEPTH, LungeRepCounter } from './lungeReps';
import { initialLungeSession, lungePhaseToMovement, stepLungeSession, LUNGE_REPS_PER_SIDE } from './lungeStage';
import { checkFraming } from './framing';
import { MIN_REP_FRAMES } from './sideRepStage';
import { lungeSet, lungeSets, realNegatives } from '@/tests/helpers/mirrorJitterSets';

const reads = (frames: readonly PoseFrame[]): { r: LungeFrameResult; t: number }[] => {
  const audit = new LungeAudit();
  return frames.map((f) => ({ t: f.t, r: audit.evaluate({ present: f.present, timestampMs: f.t, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })) }) }));
};
const count = (frames: readonly PoseFrame[]) => { const c = new LungeRepCounter(); let n = 0; for (const { r, t } of reads(frames)) if (c.feed(r, t)) n++; return n; };
/** The harness's count before this lane: RepCounter on the audit's velocity phase (the control). */
const oldCount = (frames: readonly PoseFrame[]) => { const c = new RepCounter(); let n = 0; for (const { r, t } of reads(frames)) if (c.feed(lungePhaseToMovement(r.phase), t)) n++; return n; };

const SETS = lungeSets([1, 2, 3, 4, 5, 6]);

describe('the live lunge count under landmark jitter', () => {
  it('counts every rep of every set, stored and jittered, and never an extra one (76 of 76; was 24)', () => {
    const wrong = SETS.map((s) => ({ s, n: count(s.frames) })).filter(({ s, n }) => n !== s.reps).map(({ s, n }) => `${s.name}: ${n}/${s.reps}`);
    expect(wrong).toEqual([]);
    expect(SETS.reduce((a, s) => a + s.reps, 0)).toBe(76);
  });

  it('control: the old phase count really did lose jittered reps on these same sets (so the test above measures the fix)', () => {
    const jittered = SETS.filter((s) => s.name.includes('seed'));
    const old = jittered.reduce((a, s) => a + oldCount(s.frames), 0), want = jittered.reduce((a, s) => a + s.reps, 0);
    expect(old).toBeLessThan(want / 2);
    expect(oldCount(SETS[0].frames)).toBe(4);                        // and was right on the noise-free fixtures
  });

  it('the owner\'s real takes — standing still, running in place, shuffling — count no lunge', () => {
    for (const n of realNegatives()) expect(count(n.frames), n.name).toBe(0);
  });

  it('a frame handed over twice (a 60 Hz display on a 30 fps camera) changes no count', () => {
    const s = SETS[0];
    expect(count(s.frames.flatMap((f) => [f, f]))).toBe(s.reps);
  });

  it(`a dip that never reaches ${LUNGE_REP_ARM_DEPTH} of the depth is not a rep; a blip under ${MIN_REP_FRAMES} frames is not either`, () => {
    const c = new LungeRepCounter();
    const at = (depth01: number, t: number) => c.feed({ present: true, front: 'left', depth01 }, t);
    let t = 0;
    for (const d of [0, 0.1, 0.2, 0.29, 0.2, 0.05, 0]) expect(at(d, (t += 33))).toBe(false);
    // armed, then back above the end line after fewer than MIN_REP_FRAMES frames
    expect(at(0.5, (t += 33))).toBe(false);
    for (let i = 0; i < MIN_REP_FRAMES - 2; i++) at(0.5, (t += 33));
    expect(at(LUNGE_REP_END_DEPTH / 2, (t += 33))).toBe(false);
    expect(c.reps).toBe(0);
    // a real rep: armed, held, back over the end line
    at(0.6, (t += 33));
    for (let i = 0; i < MIN_REP_FRAMES; i++) at(0.8, (t += 33));
    expect(at(0.15, (t += 33))).toBe(false);                          // still inside the band: not yet
    expect(at(0.05, (t += 33))).toBe(true);
    expect(c.reps).toBe(1);
  });

  it('nobody in frame, or the audit still calibrating (front null), neither arms nor closes a rep', () => {
    const c = new LungeRepCounter();
    for (let i = 0; i < 20; i++) expect(c.feed({ present: true, front: null, depth01: 0.9 }, i * 33)).toBe(false);
    expect(c.feed({ present: true, front: 'left', depth01: 0 }, 1000)).toBe(false);
    expect(c.feed({ present: false, front: null, depth01: 0 }, 1033)).toBe(false);
    expect(c.reps).toBe(0);
  });
});

describe('the guided lunge, driven the harness\'s way, reaches its review under jitter', () => {
  it(`${LUNGE_REPS_PER_SIDE} left then ${LUNGE_REPS_PER_SIDE} right jittered lunges: both sides counted in full (seeds 1–4)`, () => {
    for (const seed of [1, 2, 3, 4]) {
      const left = lungeSet('left', Array(LUNGE_REPS_PER_SIDE).fill(0), seed);
      const right = lungeSet('right', Array(LUNGE_REPS_PER_SIDE).fill(0), seed + 100);
      const t0 = left[left.length - 1].t + 1000;
      const frames = [...left, ...right.map((f) => ({ ...f, t: f.t + t0 }))];
      const audit = new LungeAudit();
      let counter = new LungeRepCounter();
      let s = initialLungeSession();
      for (const f of frames) {
        if (s.stage === 'review') break;
        const landmarks = f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v }));
        const read = audit.evaluate({ present: f.present, timestampMs: f.t, landmarks });
        const framedRight = checkFraming({ present: f.present, landmarks }, 'front').ok;
        const step = stepLungeSession(s, { nowMs: f.t, present: read.present, framedRight, phase: read.phase, faults: read.faults, repCompleted: counter.feed(read, f.t) });
        s = step.state;
        if (step.stageChanged) counter = new LungeRepCounter();
      }
      expect(s.stage, `seed ${seed}`).toBe('review');
      expect([s.workReps.left.length, s.workReps.right.length], `seed ${seed}`).toEqual([LUNGE_REPS_PER_SIDE, LUNGE_REPS_PER_SIDE]);
    }
  });
});
