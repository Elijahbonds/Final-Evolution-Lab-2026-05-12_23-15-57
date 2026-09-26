// MUSIC-SUITE P2 (2026-09-25): a press just after a step's beat that reaches hit() before the frame's update() fired the
// step. P1 found it (BASELINE.md §2a: +1/+5/+15/+30 ms taps were wild MISSes, and a bot aiming at the beat scored 1,170,
// grade D, where one frame early scored 5,395, grade A); re-checked on 02387a65 before the fix. The press now fires the
// press steps due by its own time (DancePerformance.fireDuePresses), so input-first and update-first give one answer.
// The frozen pre-P9 core keeps the bug: DanceCore.equivalence.test.ts, pinned difference 3.

import { describe, it, expect } from 'vitest';
import { DancePerformance, generateRoutine, beatDuration, type DanceStep, type Judgement } from './DanceCore';
import { DANCE_TRACKS } from './danceTracks';

const press = (beat: number): DanceStep => ({ clipId: `p${beat}`, beat, holdBeats: 1, mirrored: false });

describe('a press just after the beat, before the frame fires the step', () => {
  it('scores the step it is on, whatever the frame order (P1\'s four taps)', () => {
    for (const late of [0.001, 0.005, 0.015, 0.03, 0.089, 0.199]) {
      const inputFirst = new DancePerformance(60), updateFirst = new DancePerformance(60);
      for (const p of [inputFirst, updateFirst]) { p.setRoutine([press(1), press(2)]); p.start(0.5); p.update(1.49); }
      updateFirst.update(1.5 + late);
      const a = inputFirst.hit(1.5 + late), b = updateFirst.hit(1.5 + late);
      expect(a).toBe(b);
      expect(a).not.toBe('MISS');
      expect([inputFirst.score, inputFirst.combo, inputFirst.counts]).toEqual([updateFirst.score, updateFirst.combo, updateFirst.counts]);
    }
  });

  it('fires the step once: onStepFired from the press, never again from the next frame', () => {
    const p = new DancePerformance(60);
    p.setRoutine([press(1), press(2)]);
    const fired: string[] = [];
    p.onStepFired = (s) => fired.push(s.clipId);
    p.start(0.5);
    p.update(1.49);
    expect(p.hit(1.505)).toBe('PERFECT');
    expect(fired).toEqual(['p1']);
    p.update(1.52); p.update(2.6);
    expect(fired).toEqual(['p1', 'p2']);
    p.update(4);
    expect(p.counts).toEqual({ PERFECT: 1, GREAT: 0, GOOD: 0, MISS: 1 });   // only the untouched second step expired
  });

  it('a bot tapping ON the beat now scores what a bot one frame early scores (THE CYPHER, every frame phase)', () => {
    const t = DANCE_TRACKS.find((x) => x.id === 'cypher')!;
    const steps = generateRoutine({ bars: t.bars, difficulty: t.difficulty, seed: t.seed });
    const bd = beatDuration(t.bpm);
    const run = (offset: number, phase: number): { score: number; labels: Judgement[] } => {
      const p = new DancePerformance(t.bpm);
      p.setRoutine(steps);
      const start = 10;
      p.start(start);
      const taps = steps.map((s) => start + s.beat * bd + offset);
      const labels: Judgement[] = [];
      let ti = 0;
      const end = start + (p.totalBeats + 1) * bd;
      for (let f = start + phase; f < end; f += 1 / 60) {
        while (ti < taps.length && taps[ti] <= f) labels.push(p.hit(taps[ti++]));   // input first, then the frame
        p.update(f);
      }
      p.update(end + 1);
      return { score: p.score, labels };
    };
    for (const phase of [0, 0.004, 0.008, 0.012, 0.016]) {
      const onBeat = run(0, phase), frameEarly = run(-1 / 60, phase);
      expect(onBeat.labels.every((l) => l === 'PERFECT')).toBe(true);
      expect(frameEarly.labels.every((l) => l === 'PERFECT')).toBe(true);
      expect(onBeat.score).toBe(frameEarly.score);
    }
  });

  it('a due body step is left to update() and hitBody: the press takes the press step behind it, out of order', () => {
    // 60 BPM from 10: a jump (body) at 11.0 and a press step at 11.1; the last frame was 10.95, the press lands at 11.12
    const jump: DanceStep = { clipId: 'jump', beat: 1, holdBeats: 0, mirrored: false, move: 'jump', limb: 'feet', lateGraceSec: 0.25 };
    const p = new DancePerformance(60);
    p.setRoutine([jump, press(1.1)]);
    const fired: string[] = [];
    p.onStepFired = (s) => fired.push(s.clipId);
    p.start(10);
    p.update(10.95);
    expect(p.hit(11.12)).toBe('PERFECT');                   // the press step, 20 ms late
    expect(fired).toEqual(['p1.1']);                          // the jump is not the press's to fire
    expect(p.upcoming(11.12).map((u) => u.step.clipId)).toEqual(['jump']);
    p.update(11.15);
    expect(fired).toEqual(['p1.1', 'jump']);                  // the jump fires on the frame; the press step never again
    expect(p.hitBody(11.03, { move: 'jump', limb: 'feet' })).toBe('PERFECT');
    p.update(13);
    expect(fired).toEqual(['p1.1', 'jump']);
    expect(p.counts).toEqual({ PERFECT: 2, GREAT: 0, GOOD: 0, MISS: 0 });
  });

  it('a stopped or unstarted performance fires nothing from a press', () => {
    const p = new DancePerformance(60);
    p.setRoutine([press(1)]);
    const fired: string[] = [];
    p.onStepFired = (s) => fired.push(s.clipId);
    expect(p.hit(5)).toBe('MISS');                            // before start(): no clock, nothing fires
    p.start(0); p.stop();
    expect(p.hit(1.01)).toBe('MISS');
    expect(fired).toEqual([]);
  });
});
