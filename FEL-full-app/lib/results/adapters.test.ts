// PLAT-P03: every adapter's "vs last", with its tool's OWN band (read, never changed), including "about the same".
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JUMP_SAME_BAND_IN } from '@/lib/profile-v2/tiles';
import { realChange } from '@/lib/jump/session';
import { BAR_SPEED_CV, READINESS_LOAD_TOL } from '@/lib/vbt/thresholds';
import type { KeptSet } from '@/lib/vbt/sets';
import type { SprintRecord } from '@/lib/sprint/store';
import type { RunResult } from '@/lib/sprint/session';
import type { ReadinessView } from '@/lib/coach/readiness/view';
import type { MyCombine, MyStation } from '@/lib/combine/server';
import type { JumpHistoryEntry } from '@/lib/jump/historyStore';
import { compareLast, vsLineOf, isBetter } from './view';
import { JUMP_BAND_CM, jumpHeightView, jumpTestView, lastOfTest, approachView, dropView } from './jump';
import { lastComparable, sprintBand, sprintView, timePm } from './sprint';
import { lastComparableSet, sameLoad, vbtCompare, vbtView } from './vbt';
import { readinessView, readinessVs } from './readiness';
import { previousStation, stationBand, stationSeries, stationView } from './combine';
import { chapterView, sessionFinishView } from './small';

const NEXT = { label: 'Next', href: null };
const ROOT = join(__dirname, '..', '..');

describe('the bands are the tools\' own, unchanged', () => {
  it('JUMP_SAME_BAND_IN is still the TUNED 1.4 in, and the jump adapter reads it in cm', () => {
    expect(JUMP_SAME_BAND_IN).toBe(1.4);
    expect(JUMP_BAND_CM).toBeCloseTo(1.4 * 2.54, 6);
  });
  it('the bar-speed constants the VBT adapter reads are unchanged', () => {
    expect(BAR_SPEED_CV).toBe(0.04);
    expect(READINESS_LOAD_TOL).toBe(0.025);
  });
  it('lib/results defines no band of its own: every same-band comes from a tool', () => {
    for (const f of ['view.ts', 'jump.ts', 'sprint.ts', 'vbt.ts', 'readiness.ts', 'combine.ts', 'small.ts', 'progress.ts']) {
      const src = readFileSync(join(ROOT, 'lib/results', f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/(SAME_BAND|NOISE|_BAND\w*)\s*=\s*\d/);
    }
  });
});

describe('compareLast', () => {
  it('inside the band is "same" (≤, like realChange and compareWeeks); past it, up or down; no band, no arrow', () => {
    expect(compareLast(10, 9, 1).vsLast).toBe('same');
    expect(compareLast(10, 8.9, 1).vsLast).toBe('up');
    expect(compareLast(8.9, 10, 1).vsLast).toBe('down');
    expect(compareLast(10, 9, null)).toEqual({ vsLast: null, delta: 1 });
    expect(compareLast(10, null, 1).vsLast).toBeNull();
  });
  it('the words: "About the same as last time" or the change, said in the tool\'s own sense', () => {
    const w = { against: 'last time', up: 'higher', down: 'lower', fmt: (x: number) => `${x.toFixed(1)} in` };
    expect(vsLineOf({ vsLast: 'same', delta: 0.2 }, w)).toBe('About the same as last time');
    expect(vsLineOf({ vsLast: 'up', delta: 1.6 }, w)).toBe('1.6 in higher than last time');
    expect(vsLineOf({ vsLast: null, delta: null }, w)).toBeNull();
    expect(isBetter({ vsLast: 'down', better: 'down' })).toBe(true);
    expect(isBetter({ vsLast: 'same', better: 'down' })).toBeNull();
  });
});

describe('jump check and jump tests (JUMP_SAME_BAND_IN)', () => {
  it('about the same inside 1.4 in; higher past it; an estimate with its ±', () => {
    const same = jumpHeightView({ measure: 'Jump check', bestCm: 50, plusMinusCm: 2.6, lastCm: 50 - 1.3 * 2.54, line: 'l', next: NEXT });
    expect(same.vsLast).toBe('same');
    expect(same.vsLine).toBe('About the same as last time');
    expect(same.estimate).toBe(true);
    expect(same.value).toBe('19.7');
    expect(same.pm).toBe('1.0');
    const up = jumpHeightView({ measure: 'Jump check', bestCm: 50, plusMinusCm: null, lastCm: 50 - 1.6 * 2.54, line: 'l', next: NEXT });
    expect(up.vsLast).toBe('up');
    expect(up.vsLine).toBe('1.6 in higher than last time');
    expect(jumpHeightView({ measure: 'x', bestCm: 50, plusMinusCm: null, lastCm: null, line: 'l', next: NEXT }).vsLast).toBeNull();
  });
  it('a test compares with the last of the SAME test on the phone; the 10-5 has no band, so no arrow', () => {
    const e = (test: JumpHistoryEntry['test'], cm: number, at: string): JumpHistoryEntry => ({ id: `jump-${at}`, at, test, bestCm: cm, plusMinusCm: 1, jumps: 3, verified: false, manualFrames: false, source: 'video', fps: 60, rsi: 2.1, contactMs: 180, v0Mps: null, rsiMod: null });
    const hist = [e('cmjArms', 60, '2026-10-20T00:00:00.000Z'), e('cmjHips', 40, '2026-10-19T00:00:00.000Z')];
    expect(lastOfTest(hist, 'cmjHips')?.bestCm).toBe(40);
    expect(jumpTestView({ test: 'cmjHips', bestCm: 44, plusMinusCm: 1, last: lastOfTest(hist, 'cmjHips'), line: 'l', next: NEXT }).vsLast).toBe('up');
    const rj = jumpTestView({ test: 'rj105', bestCm: null, plusMinusCm: null, rsi: 2.4, last: hist[0], line: 'l', next: NEXT });
    expect(rj.vsLast).toBeNull();
    expect(rj.value).toBe('2.40');
  });
  it('approach jump: the jump band; drop jump: RSI, no arrow', () => {
    expect(approachView({ heightCm: 70, plusMinusCm: 2, lastCm: 70.5, line: 'l', next: NEXT }).vsLast).toBe('same');
    expect(dropView({ rsi: 1.8, line: 'l', next: NEXT }).vsLast).toBeNull();
  });
});

describe('sprint (each read\'s own ±, in quadrature)', () => {
  const run = (timeS: number, sdS: number | null): Extract<RunResult, { ok: true }> => ({ ok: true, test: 'gate', label: '40 yd', timeS, sdS, startKind: 'go', reactionIncluded: true, splits: [], trace: null, turns: null, poseHz: 60, tips: [] });
  const rec = (timeS: number, sdS: number | null, o: Partial<SprintRecord> = {}): SprintRecord => ({ v: 1, id: `r${timeS}`, at: '2026-10-20T00:00:00.000Z', test: 'gate', label: '40 yd', distanceM: 36.576, timeS, sdS, startKind: 'go', reactionIncluded: true, splits: [], topSpeed: null, topSpeedSd: null, vmax: null, vmaxSd: null, tau: null, f0PerKg: null, pmaxPerKg: null, poseHz: 60, method: 'camera', ...o });
  it('about the same inside √(±now² + ±last²); faster past it (a lower time is better)', () => {
    const band = sprintBand(timePm(0.03), timePm(0.03))!;
    expect(band).toBeCloseTo(Math.hypot(0.06, 0.06), 6);
    const same = sprintView(run(5.2, 0.03), rec(5.2 + band - 0.001, 0.03), 'm', NEXT);
    expect(same.vsLast).toBe('same');
    expect(same.vsLine).toBe('About the same as last time');
    const faster = sprintView(run(5.12, 0.03), rec(5.31, 0.03), 'm', NEXT);
    expect(faster.vsLast).toBe('down');
    expect(faster.better).toBe('down');
    expect(faster.vsLine).toBe('0.19 s faster than last time');
    expect(faster.unit).toBe('s');
    expect(faster.pm).toBe('0.06');
  });
  it('no ± on either read: no arrow; another start or distance is never compared', () => {
    expect(sprintView(run(5.1, null), rec(5.3, 0.03), 'm', NEXT).vsLast).toBeNull();
    expect(lastComparable([rec(5.3, 0.03, { startKind: 'movement', reactionIncluded: false }), rec(5.4, 0.03, { label: '20 yd' })], run(5.1, 0.03))).toBeNull();
    expect(lastComparable([rec(5.3, 0.03)], run(5.1, 0.03))?.timeS).toBe(5.3);
  });
});

describe('bar speed (the warm-up read\'s own real-change test)', () => {
  const set = (o: Partial<KeptSet>): KeptSet => ({ day: '2026-10-20', at: 1, lift: 'back_squat', loadKg: 100, source: 'pose', fps: 60, reps: 3, partials: 0, bestMcv: 0.8, meanMcv: 0.78, lastMcv: 0.76, bestPv: 1.2, lossPct: 5, stopPct: 20, repMcvs: [0.8, 0.78, 0.76], warmup: false, band: null, ...o });
  it('about the same inside the band realChange draws from BAR_SPEED_CV; faster past it', () => {
    expect(vbtCompare([0.8, 0.79, 0.78], [0.79, 0.78, 0.77], 60).vsLast).toBe('same');
    const up = vbtCompare([0.95, 0.94, 0.93], [0.8, 0.79, 0.78], 60);
    expect(up.vsLast).toBe('up');
    // the same answer realChange gives directly
    const te = (m: number) => Math.max(0.01, BAR_SPEED_CV * m) * 100;
    expect(realChange({ cm: 95, teCm: te(0.94) }, { cm: 80, teCm: te(0.79) }).kind).toBe('up');
    const v = vbtView({ liftName: 'Back squat', loadKg: 100, bestMcv: 0.95, pm: 0.03, repMcvs: [0.95, 0.94, 0.93], fps: 60, last: set({}), line: 'm', next: NEXT });
    expect(v.vsLine).toMatch(/m\/s faster than last time$/);
    expect(v.measure).toBe('Back squat · 100 kg');
  });
  it('the same lift at a load within the tool\'s tolerance only; med ball throws get no arrow', () => {
    expect(sameLoad(100, 102)).toBe(true);
    expect(sameLoad(100, 110)).toBe(false);
    expect(lastComparableSet([set({ at: 5, loadKg: 120 }), set({ at: 3 })], 'back_squat', 100, 10)?.at).toBe(3);
    expect(lastComparableSet([set({ at: 20 })], 'back_squat', 100, 10)).toBeNull();
    expect(vbtView({ liftName: 'Chest pass', loadKg: null, bestMcv: 6, pm: null, repMcvs: [], fps: 60, last: null, throws: true, line: '', next: NEXT }).vsLast).toBeNull();
  });
});

describe('readiness (the read\'s own facts)', () => {
  const view = (o: Partial<ReadinessView>): ReadinessView => ({ day: '2026-10-28', band: 'normal', reason: 'steady', label: 'Normal', line: 'reason', next: 'Train as planned today.', solo: true, bestCm: 42, meanCm: 41, feel: null, baselineCm: 41.8, baselineN: 6, dropPct: -0.5, realChangeCm: 2.1, belowReal: false, ease: false, rule: { kind: 'drop_pct', dropPct: 8, action: 'ease' } as never, coachTold: false, ...o });
  it('on your normal: about the same; above it: up; below it: down; still building: no arrow', () => {
    const same = readinessView(view({}), NEXT);
    expect(same.vsLast).toBe('same');
    expect(same.vsLine).toBe('About the same as your normal');
    expect(same.line).toBe('Train as planned today.');
    expect(readinessVs(view({ band: 'ready', reason: 'up' }))).toBe('up');
    expect(readinessVs(view({ band: 'low', reason: 'low_drop', belowReal: true }))).toBe('down');
    expect(readinessVs(view({ band: 'normal', reason: 'dip_noise' }))).toBe('same');
    expect(readinessVs(view({ band: 'building', reason: 'building', baselineCm: null }))).toBeNull();
  });
});

describe('combine (a jump station: the jump band; a stopwatch: no band)', () => {
  const st = (o: Partial<MyStation>): MyStation => ({ id: 'cmj:standing', kind: 'cmj', variant: 'standing', best: 58.4, touchCm: null, attempts: [58.4], rank: 2, of: 14, ...o });
  const events: MyCombine[] = [
    { id: 'c2', name: 'Spring', createdAt: 2000, stations: [st({}), st({ id: 'sprint:40yd', kind: 'sprint', variant: '40yd', best: 5.06 })] },
    { id: 'c1', name: 'Winter', createdAt: 1000, stations: [st({ best: 54.1 }), st({ id: 'sprint:40yd', kind: 'sprint', variant: '40yd', best: 5.21 })] },
  ];
  it('a re-test past the jump band is up; inside it, about the same', () => {
    const prev = previousStation(events, 'c2', 'cmj:standing');
    expect(prev?.best).toBe(54.1);
    const v = stationView(st({}), prev, NEXT);
    expect(v.vsLast).toBe('up');
    expect(v.vsLine).toBe('1.7 in higher than your last combine');
    expect(v.line).toBe('2nd of 14 in this combine.');
    expect(stationView(st({ best: 55 }), prev, NEXT).vsLast).toBe('same');
  });
  it('a hand-timed station has no band: no arrow, never an invented one; the series is oldest first', () => {
    expect(stationBand('sprint')).toBeNull();
    expect(stationView(events[0].stations[1], previousStation(events, 'c2', 'sprint:40yd'), NEXT).vsLast).toBeNull();
    expect(stationSeries(events).find((s) => s.id === 'cmj:standing')?.points.map((p) => p.value)).toEqual([54.1, 58.4]);
  });
});

describe('chapter check and session finish', () => {
  it('a score has no noise: the same score is about the same; a higher one is up', () => {
    expect(chapterView({ score: 80, bestBefore: 80, line: 'l', next: NEXT }).vsLast).toBe('same');
    const up = chapterView({ score: 100, bestBefore: 60, line: 'l', next: NEXT });
    expect(up.vsLast).toBe('up');
    expect(up.vsLine).toBe('40 points higher than your best');
    expect(chapterView({ score: 80, bestBefore: null, line: 'l', next: NEXT }).vsLast).toBeNull();
  });
  it('the session finish has nothing to compare with: no arrow', () => {
    const v = sessionFinishView({ setsDone: 12, line: 'l', next: NEXT });
    expect(v.vsLast).toBeNull();
    expect(v.value).toBe('12');
  });
});
