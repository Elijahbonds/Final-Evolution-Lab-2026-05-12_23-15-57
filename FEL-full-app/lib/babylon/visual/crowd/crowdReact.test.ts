import { describe, expect, it } from 'vitest';
import { CrowdDirector, PRIORITY, delayFor, planFor, shareFor, type FanSeat } from './crowdReact';
import { CROWD_CLIPS } from './crowdVat';

const seats = (n: number, home: 'seated' | 'standing' = 'seated'): FanSeat[] => Array.from({ length: n }, (_, i) => ({ home, along: i / Math.max(1, n - 1) }));
const CLIP = new Map(CROWD_CLIPS.map((c) => [c.name, c]));

describe('plans', () => {
  it('every plan starts in the posture it is given and chains postures without a jump', () => {
    for (const kind of ['cheer', 'groan', 'stand', 'finish'] as const) {
      for (const posture of ['seated', 'standing'] as const) {
        for (const reduced of [false, true]) {
          let p = posture;
          for (const s of planFor(kind, posture, reduced, 1)) {
            const c = CLIP.get(s.clip)!;
            expect(c.from, `${kind}/${posture}/${reduced}: ${s.clip}`).toBe(p);
            p = c.to;
          }
          // anything but the finish ends where it started (the fan goes back to its own idle)
          if (kind !== 'finish') expect(p, `${kind}/${posture}/${reduced}`).toBe(posture);
        }
      }
    }
  });

  it('reduced motion keeps reactions small: no jumps, nobody stands, a third of the crowd', () => {
    for (const kind of ['cheer', 'groan', 'stand', 'finish'] as const) {
      const clips = planFor(kind, 'seated', true, 1).map((s) => s.clip);
      expect(clips, kind).not.toContain('stand_cheer');
      expect(clips, kind).not.toContain('sit_cheer');
      expect(clips, kind).not.toContain('rise');
      expect(shareFor(kind, 1, true)).toBeCloseTo(shareFor(kind, 1, false) / 3, 9);
    }
    // and the stagger loses its ripple
    expect(delayFor(3, 1, 1, true)).toBeLessThan(delayFor(3, 1, 1, false));
  });

  it('the finish stands the crowd up and holds it; a big one jumps, any other applauds', () => {
    expect(planFor('finish', 'seated', false, 1).map((s) => s.clip)).toEqual(['rise', 'stand_cheer']);
    expect(planFor('finish', 'seated', false, 0.5).map((s) => s.clip)).toEqual(['rise', 'stand_clap']);
    expect(planFor('finish', 'seated', false, 1).at(-1)!.seconds).toBe(Infinity);
  });

  it('a bigger moment moves more of the crowd', () => {
    expect(shareFor('cheer', 1, false)).toBeGreaterThan(shareFor('cheer', 0.3, false));
    expect(shareFor('finish', 0.1, false)).toBe(1);
  });
});

describe('the director', () => {
  it('a cheer reaches part of the crowd, staggered, and every fan comes back to its idle', () => {
    const d = new CrowdDirector(seats(200));
    const n = d.react('cheer', 0.5, 10, false);
    expect(n).toBeGreaterThan(60);
    expect(n).toBeLessThan(170);
    const first = d.tick(10.001);
    expect(first.length).toBeLessThan(n);   // nobody starts on the very frame (the stagger)
    const started = new Set<number>(first.map((c) => c.fan));
    for (let t = 10; t < 11; t += 1 / 60) for (const c of d.tick(t)) if (c.clip === 'sit_cheer') started.add(c.fan);
    expect(started.size).toBe(n);
    for (let t = 11; t < 14; t += 1 / 60) d.tick(t);
    for (let i = 0; i < 200; i++) expect(d.clipOf(i)).toBe('sit_idle');
  });

  it('a groan never cuts a cheer off; a finish cuts anything and holds', () => {
    const d = new CrowdDirector(seats(50));
    d.react('cheer', 1, 0, false);
    for (let t = 0; t < 0.5; t += 1 / 60) d.tick(t);
    const cheering = [...Array(50).keys()].filter((i) => d.clipOf(i) === 'sit_cheer');
    expect(cheering.length).toBeGreaterThan(10);
    d.react('groan', 1, 0.5, false);
    for (let t = 0.5; t < 0.9; t += 1 / 60) d.tick(t);
    for (const i of cheering) expect(d.clipOf(i)).not.toBe('sit_groan');
    d.react('finish', 1, 1, false);
    for (let t = 1; t < 30; t += 1 / 30) d.tick(t);
    for (let i = 0; i < 50; i++) expect(d.clipOf(i)).toBe('stand_cheer');
    expect(d.react('cheer', 1, 31, false)).toBe(0);   // the night is over
    expect(PRIORITY.finish).toBeGreaterThan(PRIORITY.cheer);
  });

  it('a standing ovation rises, cheers and sits back down', () => {
    const d = new CrowdDirector(seats(20));
    d.react('stand', 1, 0, false);
    const seen = new Set<string>();
    for (let t = 0; t < 8; t += 1 / 60) for (const c of d.tick(t)) seen.add(c.clip);
    expect([...seen]).toEqual(expect.arrayContaining(['rise', 'stand_cheer', 'sit_down', 'sit_idle']));
    for (let i = 0; i < 20; i++) expect(d.postureOf(i)).toBe('seated');
  });

  it('is deterministic: the same reactions at the same times give the same clips', () => {
    const run = (): string => {
      const d = new CrowdDirector(seats(80, 'standing'));
      const log: string[] = [];
      d.react('cheer', 0.7, 1, false); d.react('groan', 0.4, 3, false);
      for (let t = 0; t < 6; t += 1 / 30) for (const c of d.tick(t)) log.push(`${c.fan}:${c.clip}:${c.since.toFixed(3)}`);
      return log.join('|');
    };
    expect(run()).toBe(run());
  });
});
