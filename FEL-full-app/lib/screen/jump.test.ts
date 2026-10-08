// SCREEN-JUMP-ONLY: the jump skips T1–T3, the full screen reuses that jump, and the result is inches or centimetres.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JUMP_PARTS, REST_PARTS, AssessRunner, gradeSession, type RunnerView } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, standFront, syntheticCalibration, type Capture } from '@/lib/assess/replay';
import { inches } from '@/lib/assess/why';
import { JumpResult } from '@/app/play/mirror/assess/_components/jump-result';
import { preStep } from './flow';
import { cmFromInches, formatJumpCm, readJumpUnit, writeJumpUnit, type JumpUnit } from './jump';
import type { StorageLike } from './store';

class Mem implements StorageLike {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('inches and centimetres', () => {
  it('10 in is 25.4 cm, and 40 cm is 15.7 in', () => {
    expect(cmFromInches(10)).toBe(25.4);
    expect(inches(25.4)).toBe(10);
    expect(formatJumpCm(25.4, 'in')).toBe('10.0 in');
    expect(formatJumpCm(40, 'cm')).toBe('40.0 cm');
    expect(formatJumpCm(40, 'in')).toBe('15.7 in');
    expect(inches(40)).toBe(15.7);
  });

  it('the unit defaults to inches and is kept only in the injected store', () => {
    const s = new Mem();
    expect(readJumpUnit(s)).toBe<JumpUnit>('in');
    writeJumpUnit(s, 'cm');
    expect(readJumpUnit(s)).toBe('cm');
  });
});

describe('jump-only, then the rest of the screen', () => {
  it('the jump parts are T5 only, and the rest has no T5', () => {
    expect(JUMP_PARTS.map((p) => p.id)).toEqual(['T5']);
    expect(REST_PARTS.some((p) => p.test === 'T5')).toBe(false);
    expect(REST_PARTS.map((p) => p.test)).toEqual(['T1', 'T1', 'T2', 'T2', 'T3', 'T3']);
  });

  it('a jump-only run never walks T1, T2 or T3', () => {
    const run = driveJump();
    expect(run.v.step).toBe('done');
    expect(run.steps.some((s) => /T1|T2|T3/.test(s))).toBe(false);
    expect(run.steps).toContain('active:T5');
    expect(run.v.result!.tests.find((t) => t.id === 'T5')!.status).toBe('scored');
    expect(run.v.result!.tests.filter((t) => t.id !== 'T5').every((t) => t.status === 'skipped')).toBe(true);
  });

  it('the full screen after a jump keeps that same T5 result and does not need T5 frames', () => {
    const cal = syntheticCalibration();
    const jump = gradeSession({ calibration: cal, T5: cmj([{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }]).frames });
    const t5 = jump.tests.find((t) => t.id === 'T5')!;
    const rest = gradeSession({
      calibration: cal,
      T1: { front: ohsFront({ kneeInL: 0.06 }).frames, side: ohsSide().frames },
      T2: { left: kneeWall('left').frames, right: kneeWall('right').frames },
      T3: { left: singleLegSquat('left').frames, right: singleLegSquat('right').frames },
    }, { T5: t5 });
    expect(rest.tests.find((t) => t.id === 'T5')).toBe(t5);
    expect(rest.tests.find((t) => t.id === 'T1')!.status).toBe('scored');
    expect(t5.t5!.bestHeightCm).toBeGreaterThan(43);
  });

  it('yes to pain on a jump-only start never reaches the camera', () => {
    let s = preStep({ step: 'intro', age: null, gate: null, kind: 'full' }, { type: 'start', kind: 'jump' });
    s = preStep(s, { type: 'age', age: '18+' });
    s = preStep(s, { type: 'pain', hurts: true });
    expect(s.kind).toBe('jump');
    expect(s.step).toBe('painStop');
    expect(s.gate).toBeNull();
    expect(preStep(s, { type: 'cameraOn' }).step).toBe('painStop');
  });
});

describe('the jump result', () => {
  const view = (kid: boolean) => text(renderToStaticMarkup(createElement(JumpResult, {
    heightCm: 40, attempts: 3, kid, jumpIn: 15.7, lastIn: null, onFull: () => {}, onAgain: () => {},
  })));
  const html = (kid: boolean) => renderToStaticMarkup(createElement(JumpResult, {
    heightCm: 40, attempts: 3, kid, jumpIn: 15.7, lastIn: null, onFull: () => {}, onAgain: () => {},
  }));

  it('an adult sees inches, the attempts, the meaning line, and the three ways on', () => {
    const h = html(false);
    expect(text(h)).toContain('15.7 in');
    expect(text(h)).toContain('3 attempts, best kept');
    expect(text(h)).toContain('A personal best to beat next time.');
    expect(h).toContain('text-[40px]');
    expect(h).toContain('Do the full screen');
    expect(h).toContain('href="/screen/program/dunking"');
    expect(h).toContain('href="/play/brain-brawl"');
  });

  it('a kid sees the number and the full screen, and no band, program, or personal best', () => {
    const h = html(true);
    expect(text(h)).toContain('15.7 in');
    expect(h).toContain('Do the full screen');
    expect(h).not.toMatch(/data-cta|personal best|Brain Brawl|dunking/i);
    expect(view(true)).not.toMatch(/\b(green|yellow|red)\b/i);
  });
});

function driveJump(maxLoops = 4000) {
  // SCREEN A: as the page does — the take-off tap (null = "Not sure") is passed in, and the pain check is tapped "no"
  const r = new AssessRunner({ aspect: 4 / 3, parts: JUMP_PARTS, painAsked: true, handsFree: true, takeoffLeg: null, cameraFps: () => 60 });
  let t = 0;
  let v: RunnerView = r.tick({ t, present: false, image: [] }, t);
  const steps: string[] = [];
  const stand = standFront(0.5);
  const fed = new Set<string>();
  const track = () => { const mark = `${v.step}:${v.part ?? ''}`; if (steps[steps.length - 1] !== mark) steps.push(mark); };
  const feed = (c: Capture) => {
    const frames = c.frames;
    const first = frames[0]?.t ?? 0;
    const start = t + 33;
    for (const frame of frames) {
      t = start + (frame.t - first);
      v = r.tick({ ...frame, t }, t);
      track();
      if (v.part !== 'T5' && v.step !== 'active') break;
    }
  };
  for (let loop = 0; loop < maxLoops && v.step !== 'done' && v.step !== 'stopped'; loop++) {
    r.autoAdvance(t);
    if (v.step === 'painCheck') {
      // SCREEN A: the big tap, not an auto-advance
      r.answerPain(false, t);
      const frame = stand.frames[loop % stand.frames.length];
      t += 33;
      v = r.tick({ ...frame, t }, t);
      track();
      continue;
    }
    if (v.step === 'active' && v.part === 'T5' && !fed.has('T5')) {
      fed.add('T5');
      feed(cmj([{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }]));
    } else {
      const frame = stand.frames[loop % stand.frames.length];
      t += 33;
      v = r.tick({ ...frame, t }, t);
      track();
    }
  }
  return { v, steps };
}
