// EVERY-SCREEN P4 (2026-11-11): "Numbers you can trust" — the plan's gate, as tests.
//   1. error and repeat-to-repeat spread are MEASURED (scripts/every-screen/trust.mts → lib/results/trust.json) and shown
//      as a ± line wherever the number is shown;
//   2. no measured number appears without its method and how sure (every result view; the jump check; the screens);
//   3. a progress number → its source in one tap (the row opens on the tool, its method, and each number's own test);
//   4. a bad set-up is caught before the test starts, not after.
// The walks (vertical ≤ 3 taps, movement screen 3 taps and under 3 minutes) are scripts/every-screen/jobs-list.mts.
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TRUST from '@/lib/results/trust.json';
import { jumpSure, mirrorScreenSure, quickScreenSure, sprintSure, vbtSure, readinessSure } from '@/lib/results/trust';
import { approachView, dropView, jumpHeightView, jumpTestView } from '@/lib/results/jump';
import { sprintView } from '@/lib/results/sprint';
import { vbtView } from '@/lib/results/vbt';
import { readinessView } from '@/lib/results/readiness';
import { chapterView, sessionFinishView } from '@/lib/results/small';
import { combineRows, deviceJumpRows, readinessRow, savedJumpRow, sprintRows, vbtRows } from '@/lib/results/progress';
import { ResultCard } from '@/components/result-card/result-card';
import { AssessRunner, type RunnerView } from '@/lib/assess/runner';
import { standFront } from '@/lib/assess/replay';
import { FRAMING_FIX_LINES } from '@/lib/screen/copy';
import type { PoseFrame } from '@/lib/pose/landmarks';

const NEXT = { label: 'Again', href: null };

describe('1. the ± is measured, and shown from the measurement', () => {
  it('trust.json holds a measurement per tool, and says which are recorded and which synthetic', () => {
    expect(TRUST.jump).toMatchObject({ basis: 'recorded', unit: 'cm' });
    expect(TRUST.jump.jumpsRead).toBeGreaterThanOrEqual(5);
    expect(TRUST.jump.reads).toBeGreaterThan(TRUST.jump.jumpsRead);        // each jump read more than once: a repeat spread
    expect(TRUST.mirrorScreen.basis).toBe('recorded');
    for (const k of ['quickScreen', 'sprint', 'vbt'] as const) expect(TRUST[k].basis).toBe('synthetic');
  });
  it('each line carries its own measured numbers (not a written ±)', () => {
    expect(jumpSure('cm').sure).toContain(`± ${Math.max(1, Math.round(TRUST.jump.meanMiss))} cm`);
    expect(jumpSure('cm').sure).toContain(`${TRUST.jump.jumpsRead} recorded jumps`);
    expect(quickScreenSure().sure).toContain(`${TRUST.quickScreen.sameColourPct}%`);
    expect(vbtSure().sure).toContain(`${TRUST.vbt.reps} computer-made reps`);
    expect(sprintSure().sure).toContain(`${TRUST.sprint.runs} computer-made runs`);
    expect(mirrorScreenSure().sure).toContain(`${TRUST.mirrorScreen.runs} times`);
  });
  it('a synthetic measurement says so in its own words', () => {
    for (const s of [quickScreenSure(), sprintSure(), vbtSure()]) expect(s.sure).toMatch(/computer-made/);
    expect(sprintSure().sure).toMatch(/No recorded run yet/);
    expect(vbtSure().sure).toMatch(/No recorded set yet/);
  });
  it('a jump height in the line is whole units, never a decimal (lib/screen/flight-jump.test.ts)', () => {
    expect(jumpSure('in').sure).not.toMatch(/\d+\.\d+ (in|cm)/);
  });
});

describe('2. no measured number without its method and how sure', () => {
  const sprintOk = { ok: true, test: 'gate', label: '40 yd', timeS: 5.12, sdS: 0.02, trace: null, startKind: 'go', reactionIncluded: false } as never;
  const views = {
    jump: jumpHeightView({ measure: 'Jump check', bestCm: 40, plusMinusCm: 2, lastCm: null, line: 'x', next: NEXT }),
    jumpTest: jumpTestView({ test: 'cmj' as never, bestCm: 40, plusMinusCm: 2, last: null, line: 'x', next: NEXT }),
    bounce: jumpTestView({ test: 'rj105' as never, bestCm: null, plusMinusCm: null, rsi: 1.8, last: null, line: 'x', next: NEXT }),
    approach: approachView({ heightCm: 60, plusMinusCm: 3, line: 'x', next: NEXT }),
    drop: dropView({ rsi: 1.5, line: 'x', next: NEXT }),
    sprint: sprintView(sprintOk, null, 'x', NEXT),
    vbt: vbtView({ liftName: 'Back squat', loadKg: 100, bestMcv: 0.62, pm: 0.03, repMcvs: [0.62], fps: 60, last: null, line: 'x', next: NEXT }),
    readiness: readinessView({ label: 'Ready', bestCm: 40, band: 'ready', reason: null, belowReal: false, baselineCm: 39, line: 'x', next: null } as never, NEXT),
    chapter: chapterView({ score: 80, bestBefore: null, line: 'x', next: NEXT }),
    finish: sessionFinishView({ setsDone: 9, line: 'x', next: NEXT }),
  };
  for (const [name, v] of Object.entries(views)) {
    it(`${name}: a number carries a method and a how-sure line`, () => {
      expect(v.value).not.toBeNull();
      expect(v.howSure?.method.length, name).toBeGreaterThan(5);
      expect(v.howSure?.sure.length, name).toBeGreaterThan(10);
    });
  }
  it('the approach jump and the bounce score say they are not yet measured on recorded takes (not the jump check\'s ±)', () => {
    expect(views.approach.howSure?.sure).toMatch(/Not yet measured on recorded approach jumps/);
    expect(views.bounce.howSure?.sure).toMatch(/Not yet measured on recorded bounces/);
  });
  it('the result card shows it under the number, visible (not behind Details)', () => {
    const html = renderToStaticMarkup(h(ResultCard, { view: views.jump, reveal: false }));
    expect(html).toContain('data-result-sure');
    expect(html.indexOf('data-result-sure')).toBeGreaterThan(html.indexOf('data-result-number'));
    expect(html.indexOf('data-result-sure')).toBeLessThan(html.indexOf('data-result-line'));
    expect(html).toContain(jumpSure('in').sure.replace(/'/g, '&#x27;'));
  });
  it('the jump check, the Quick Screen and the Mirror screen show theirs (source)', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('app/play/mirror/assess/_components/jump-result.tsx', 'utf8')).toContain('data-jump-sure');
    const rv = readFileSync('app/play/mirror/assess/_components/results-view.tsx', 'utf8');
    expect(rv).toContain('data-screen-sure');
    expect(rv).toContain('data-jump-sure');
    expect(readFileSync('app/play/mirror/_components/mirror-harness.tsx', 'utf8')).toContain('data-score-sure');
    void readinessSure;
  });
});

describe('3. a progress number → its source in one tap', () => {
  const iso = (d: number) => new Date(Date.UTC(2026, 10, d, 15)).toISOString();
  const rows = [
    ...deviceJumpRows([{ id: 'a', at: iso(1), test: 'check', bestCm: 40, plusMinusCm: 2, jumps: 3, verified: false, manualFrames: false, source: 'live', fps: 30 } as never,
      { id: 'b', at: iso(3), test: 'check', bestCm: 42, plusMinusCm: 2, jumps: 2, verified: false, manualFrames: false, source: 'live', fps: 30 } as never]),
    savedJumpRow([{ at: Date.UTC(2026, 10, 2), cm: 41 }])!,
    ...sprintRows([{ v: 1, id: 's', at: iso(2), test: 'gate', label: '40 yd', distanceM: 36.6, timeS: 5.2, sdS: 0.02, startKind: 'go', reactionIncluded: false, splits: [], topSpeed: null, topSpeedSd: null, vmax: null, vmaxSd: null } as never]),
    ...vbtRows([{ day: '2026-11-02', at: Date.UTC(2026, 10, 2), lift: 'back_squat', loadKg: 100, source: 'plate', fps: 60, reps: 5, partials: 0, bestMcv: 0.6, meanMcv: 0.55, lastMcv: 0.5, repMcvs: [0.6] } as never], 'device'),
    readinessRow([{ day: '2026-11-02', bestCm: 40, band: 'ready', belowReal: false }], 'device')!,
    ...combineRows([{ id: 'e', name: 'Fall combine', createdAt: Date.UTC(2026, 10, 1), stations: [{ id: 'st', kind: 'cmj', variant: '', best: 50, touchCm: null, attempts: [50], rank: null, of: 1 }] }] as never),
  ];
  it('every row names its tool, its method and how sure, and a page to open it', () => {
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const r of rows) {
      expect(r.trace.tool, r.key).toBeTruthy();
      expect(r.trace.how.method.length, r.key).toBeGreaterThan(5);
      expect(r.trace.how.sure.length, r.key).toBeGreaterThan(10);
      expect(r.trace.href, r.key).toMatch(/^\/train\//);
    }
  });
  it('every number in a row\'s history says the test it came from', () => {
    for (const r of rows) for (const x of r.history) expect(x.from, `${r.key} ${x.value}`).toBeTruthy();
    const jump = rows.find((r) => r.key.startsWith('device:jump'))!;
    expect(jump.history.map((x) => x.from)).toEqual([expect.stringMatching(/: best of 2 jumps$/), expect.stringMatching(/: best of 3 jumps$/)]);
  });
  it('the row opens on the source: one tap (the row is the button; the trace and the history are what it opens)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('components/progress/progress-view.tsx', 'utf8');
    expect(src).toContain('data-progress-trace');
    expect(src).toContain('data-progress-source');
    expect(src).toContain('data-progress-from');
  });
});

describe('4. a bad set-up is caught before the test, not after', () => {
  const STAND = standFront(0.5);
  const feed = (make: (f: PoseFrame) => PoseFrame, loops = 300) => {
    const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, takeoffLeg: 'left' });
    let t = 0;
    let v: RunnerView = r.tick({ t, present: false, image: [] }, t);
    const said: string[] = [];
    for (let i = 0; i < loops; i++) { t += 33; v = r.tick(make({ ...STAND.frames[0], t }), t); if (v.say) said.push(v.say.text); }
    return { v, said };
  };
  it('feet out of the shot: ten seconds of it and the test never starts; the line says how to fix it', () => {
    const r = feed((f) => ({ ...f, image: f.image.map((l, i) => (i >= 27 ? { ...l, v: 0.1 } : l)) }));
    expect(r.v.step).toBe('framing');
    expect(r.said).toContain(FRAMING_FIX_LINES.cutOffBottom);
  });
  it('the camera turned the wrong way (side-on to a front check): the test never starts', () => {
    const side = (f: PoseFrame): PoseFrame => ({ ...f, image: f.image.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * 0.15 })) });
    expect(feed(side).v.step).toBe('framing');
  });
  it('the control: the same stand, well framed, moves on past the framing step', () => {
    expect(feed((f) => f).v.step).not.toBe('framing');
  });
});

describe('carried from phase 3: the builder\'s first screen once a program is on it', () => {
  it('the ask folds to one line (all of it, never clamped) with "Change the ask"; an ask that arrives with the address starts folded', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('components/program-ask/program-builder.tsx', 'utf8');
    expect(src).toContain('data-testid="program-ask-folded"');
    expect(src).toContain('data-testid="program-ask-open"');
    expect(src).toContain('useState(!initialQuestion)');
    expect(src).not.toContain('line-clamp-2">{q}');
    expect(src).toContain('<form hidden={!askOpen}');
  });
  it('the lede is the builder\'s and steps aside once a program is shown; room is left under the docked Start', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('app/train/build/page.tsx', 'utf8')).not.toContain('lede={PAGE_LEDE}');
    const src = readFileSync('components/program-ask/program-builder.tsx', 'utf8');
    expect(src).toContain('data-testid="program-lede"');
    expect(src).toContain('data-dock-spacer');
  });
});

describe('the measurement screens\' own small targets are 44 px (the rig: "← Train" 36 px tall on all six)', () => {
  it('"← Train", the sprint chips, the bar-speed families and lifts, and readiness\'s "Back to Train"', async () => {
    const { readFileSync } = await import('node:fs');
    for (const p of ['readiness', 'progress', 'jumps', 'velocity', 'speed']) expect(readFileSync(`app/train/${p}/page.tsx`, 'utf8'), p).toContain('inline-flex min-h-11 items-center rounded-xl border border-white/10 px-3 py-2 text-[12px]');
    expect(readFileSync('app/train/combine/page.tsx', 'utf8')).toContain('inline-flex min-h-11 items-center text-[14px] text-fel-soft hover:text-white">← Train');
    expect(readFileSync('components/sprint/speed-app.tsx', 'utf8')).toContain('min-h-11 rounded-lg border px-3 text-sm font-bold ${on');
    const v = readFileSync('components/vbt/velocity-session.tsx', 'utf8');
    expect(v).toContain('min-h-11 shrink-0 rounded-lg border px-3 text-sm font-bold ${family');
    expect(v).toContain('min-h-11 rounded-full border px-3 text-[13px] ${liftId');
    expect(readFileSync('components/readiness/readiness-check.tsx', 'utf8')).toContain('inline-flex min-h-11 items-center underline">Back to Train');
  });
});
