import { describe, expect, it } from 'vitest';
import { GO_AT, ROCKET_EARLIEST, ROCKET_LATEST, classifyStart, newStart, stepStart, beatLabel } from './RaceStart';

function run(pressAt: number | null, releaseAt: number | null = null) {
  let s = newStart(); const beats: number[] = []; let went = false;
  for (let t = 0; t < GO_AT + 0.5; t += 1 / 60) {
    const down = pressAt !== null && t + 1e-9 >= pressAt && (releaseAt === null || t < releaseAt);
    const r = stepStart(s, 1 / 60, down); s = r.state;
    if (r.beatChanged) beats.push(s.beat);
    if (r.wentGo) went = true;
  }
  return { s, beats, went };
}

describe('RaceStart', () => {
  it('counts 3 · 2 · 1 · GO once each, and nobody is released before GO', () => {
    const { beats, went, s } = run(null);
    expect(beats).toEqual([3, 2, 1, 0]);
    expect(went).toBe(true);
    expect(s.go).toBe(true);
  });
  it('a throttle down on "2" and held is a ROCKET', () => {
    expect(run(GO_AT - 1.9).s.outcome).toBe('rocket');
    expect(run(GO_AT - 1.5).s.outcome).toBe('rocket');
    expect(run(GO_AT - ROCKET_LATEST - 0.02).s.outcome).toBe('rocket');
  });
  it('a throttle held from "3" bogs — BURNOUT', () => {
    expect(run(GO_AT - 2.6).s.outcome).toBe('burnout');
    expect(run(GO_AT - ROCKET_EARLIEST - 0.1).s.outcome).toBe('burnout');
  });
  it('late, released, or never pressed is a NORMAL start — never a penalty for not trying', () => {
    expect(run(GO_AT - 0.2).s.outcome).toBe('normal');
    expect(run(GO_AT - 0.9).s.outcome).toBe('normal');   // on "1"
    expect(run(GO_AT - 1.5, GO_AT - 0.3).s.outcome).toBe('normal');
    expect(run(null).s.outcome).toBe('normal');
  });
  it('re-pressing restarts the window from the new press', () => {
    // down on 3, up, down again on 2: the second press is what counts
    let s = newStart();
    for (let t = 0; t < GO_AT + 0.1; t += 1 / 60) {
      const down = (t >= GO_AT - 2.8 && t < GO_AT - 2.2) || t >= GO_AT - 1.6;
      s = stepStart(s, 1 / 60, down).state;
    }
    expect(s.outcome).toBe('rocket');
  });
  it('classifies at the window edges and labels the beats', () => {
    expect(classifyStart(GO_AT - ROCKET_EARLIEST)).toBe('rocket');
    expect(classifyStart(GO_AT - ROCKET_LATEST)).toBe('rocket');
    expect(classifyStart(null)).toBe('normal');
    expect([3, 2, 1, 0, -1].map(beatLabel)).toEqual(['3', '2', '1', 'GO!', '']);
  });
});
