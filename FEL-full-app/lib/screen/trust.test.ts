// MIRROR-TRUST-RATING (2026-10-23): MT-1…MT-15, MT-17, MT-18, MT-21, MT-22. The rating is a label beside the result: it
// is worked out on this device from what the screen already holds, it changes no grade, and it keeps no number.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { gradeSession } from '@/lib/assess/runner';
import { kneeWall, quickCapture, replay, type QuickScenario } from '@/lib/assess/replay';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { summarize, summarizeWithTrust } from './checks';
import { GRADED_CHECKS, th, type ThresholdId } from './PROPOSED-thresholds';
import { TRUST, TRUST_IDS, TRUST_VERSION, tr } from './PROPOSED-trust';
import {
  TRUST_MEASURE_IDS, TRUST_REASONS, gradeSignals, rateMeasures, trustFor, trustSignals, worstTrust,
  type MeasureSignals, type MeasureTrust, type TrustMeasureId,
} from './trust';
import { TRUST_INFO_LINE, TRUST_REASON_LINES, TRUST_WORDS } from './copy';
import { KEYS, forgetAgeForTests, gateRecord, readResult, writeResult, type StorageLike } from './store';

const ROOT = join(__dirname, '../..');
const GOOD: QuickScenario = { fps: 60 };   // "good settings": the jump filmed over the jump gate
const ok = (id: TrustMeasureId, o: Partial<MeasureSignals> = {}): MeasureSignals => ({
  id, read: true, vis: 0.95, framing: { dim: 0, wrongView: 0, cutOff: 0, distance: 0 }, conf: 1, poseHz: 30, repsComplete: true, ...o,
});
const rate1 = (s: MeasureSignals) => rateMeasures([s])[0];
const rowsOf = (sc: QuickScenario) => { const cap = quickCapture(sc); return replay(cap).trust; };
const row = (rows: readonly MeasureTrust[], id: TrustMeasureId, side?: 'left' | 'right') => rows.find((r) => r.id === id && r.side === side)!;

describe('MT-1: a clean replay capture is High on every graded check', () => {
  it('ohsFront / ohsSide / kneeWall / singleLegSquat / cmj at good settings: High, no reasons', () => {
    for (const sc of [GOOD, { ...GOOD, noise: true }]) {
      const rows = rowsOf(sc);
      const graded = rows.filter((r) => r.id !== 'jump.height');
      const expected = GRADED_CHECKS.reduce((n, c) => n + (c.sided ? 2 : 1), 0);
      expect(graded).toHaveLength(expected);
      for (const r of graded) expect(r, `${r.id} ${r.side ?? ''}`).toEqual({ id: r.id, ...(r.side ? { side: r.side } : {}), level: 'high', reasons: [] });
    }
  });
});

describe('MT-2 / MT-3: check-joint visibility', () => {
  it('between visMedium and visHigh: Medium + lowVisibility; under visMedium: Low + lowVisibility', () => {
    const mid = (tr('trust.visHigh') + tr('trust.visMedium')) / 2;
    expect(rate1(ok('ohs.depth', { vis: mid }))).toEqual({ id: 'ohs.depth', level: 'medium', reasons: ['lowVisibility'] });
    expect(rate1(ok('ohs.depth', { vis: tr('trust.visMedium') - 0.01 }))).toEqual({ id: 'ohs.depth', level: 'low', reasons: ['lowVisibility'] });
    expect(rate1(ok('ohs.depth', { vis: tr('trust.visHigh') })).level).toBe('high');
  });
});

describe('MT-4…MT-7: framing shares', () => {
  const over = (k: 'dim' | 'wrongView' | 'cutOff' | 'distance', v: number) => ok('sls.kneeCave', { side: 'left', framing: { dim: 0, wrongView: 0, cutOff: 0, distance: 0, [k]: v } });
  it.each(['dim', 'wrongView', 'cutOff', 'distance'] as const)('%s over its line gives that reason (Medium between the lines, Low over the Medium line)', (k) => {
    const mid = (tr('trust.framingBadHigh') + tr('trust.framingBadMedium')) / 2;
    expect(rate1(over(k, mid))).toMatchObject({ level: 'medium', reasons: [k] });
    expect(rate1(over(k, tr('trust.framingBadMedium') + 0.05))).toMatchObject({ level: 'low', reasons: [k] });
    expect(rate1(over(k, tr('trust.framingBadHigh'))).level).toBe('high');
  });
  it('from real frames: a T3 clip drifted off-centre reads `distance`; a T2 clip filmed facing the camera reads `wrongView`', () => {
    const cap = quickCapture(GOOD);
    const shift = (fs: readonly PoseFrame[], dx: number) => fs.map((f) => ({ ...f, image: f.image.map((l) => ({ ...l, x: l.x + dx })) }));
    const drifted = { ...cap, T3: { ...cap.T3!, left: shift(cap.T3!.left!, 0.3) } };
    const s = trustSignals(drifted, replay(drifted).tests).find((x) => x.id === 'sls.kneeCave' && x.side === 'left')!;
    expect(s.framing!.distance).toBeGreaterThan(tr('trust.framingBadMedium'));
    expect(rateMeasures([s])[0].reasons).toContain('distance');
    const front = { ...cap, T2: { ...cap.T2!, left: cap.T3!.left! } };   // a front-on clip where side-on is needed
    const w = trustSignals(front, replay(front).tests).find((x) => x.id === 'ktw.shinAngle' && x.side === 'left')!;
    expect(w.framing!.wrongView).toBeGreaterThan(tr('trust.framingBadMedium'));
  });
});

describe('MT-8 / MT-9: frames read and pose rate', () => {
  it('confidence or the passing share under its line gives tooFewFrames', () => {
    expect(rate1(ok('ktw.lrGap', { conf: (tr('trust.confHigh') + tr('trust.confMedium')) / 2 }))).toMatchObject({ level: 'medium', reasons: ['tooFewFrames'] });
    expect(rate1(ok('ktw.lrGap', { conf: tr('trust.confMedium') - 0.01 }))).toMatchObject({ level: 'low', reasons: ['tooFewFrames'] });
  });
  it('a pose rate under the 24 Hz gate gives Low + lowPoseHz', () => {
    expect(tr('trust.poseHzMedium')).toBe(th('gate.minPoseHz'));
    expect(rate1(ok('ohs.heelLift', { poseHz: tr('trust.poseHzMedium') - 1 }))).toEqual({ id: 'ohs.heelLift', level: 'low', reasons: ['lowPoseHz'] });
  });
});

describe('MT-10 / MT-11: valid reps and unread measures', () => {
  it('fewer valid reps than gate.minValidReps: at most Medium, with fewValidReps', () => {
    expect(rate1(ok('ktw.shinAngle', { side: 'left', repsComplete: false }))).toEqual({ id: 'ktw.shinAngle', side: 'left', level: 'medium', reasons: ['fewValidReps'] });
    const cap = quickCapture(GOOD);
    const short = { ...cap, T2: { ...cap.T2!, left: kneeWall('left', {}, { reps: th('gate.minValidReps') - 1, fps: 60 }).frames } };
    const r = row(replay(short).trust, 'ktw.shinAngle', 'left');
    expect(r.reasons).toContain('fewValidReps');
  });
  it('an unread value or band gives Low + notRead (a skipped jump: every jump measure)', () => {
    expect(rate1(ok('ohs.depth', { read: false }))).toEqual({ id: 'ohs.depth', level: 'low', reasons: ['notRead'] });
    const rows = rowsOf({ ...GOOD, only: ['T1', 'T2', 'T3'] });
    for (const r of rows.filter((x) => x.id.startsWith('jump.'))) expect(r).toMatchObject({ level: 'low', reasons: ['notRead'] });
  });
});

describe('MT-12: the jump\'s frame rate', () => {
  it('fpsLow gives jumpFpsLow; jump.height under trust.jumpHighFps is never High and carries under240', () => {
    const slow = rowsOf({});   // the synth's default 30 fps: under the 50 Hz jump gate
    expect(row(slow, 'jump.stiffLanding')).toMatchObject({ level: 'low', reasons: ['jumpFpsLow'] });
    expect(row(slow, 'jump.height').reasons).toEqual(expect.arrayContaining(['jumpFpsLow', 'under240']));
    const web = row(rowsOf(GOOD), 'jump.height');   // 60 fps: a browser camera
    expect(web).toEqual({ id: 'jump.height', level: 'medium', reasons: ['under240'] });
    for (const fps of [30, 60, 120, tr('trust.jumpHighFps') - 1]) expect(rate1(ok('jump.height', { jumpFps: fps })).level).not.toBe('high');
    expect(rate1(ok('jump.height', { jumpFps: tr('trust.jumpHighFps') }))).toEqual({ id: 'jump.height', level: 'high', reasons: [] });
  });
});

describe('MT-13: the worst-signal rule', () => {
  it('the level is the worst signal; reasons are every signal under High, worst first; all kept', () => {
    const r = rate1(ok('ohs.forwardLean', { vis: (tr('trust.visHigh') + tr('trust.visMedium')) / 2, conf: 0, framing: { dim: 1, wrongView: 0, cutOff: 0.2, distance: 0 } }));
    expect(r.level).toBe('low');
    expect(r.reasons).toEqual(['dim', 'tooFewFrames', 'cutOff', 'lowVisibility']);   // the Lows, then the Mediums
    expect(gradeSignals(ok('ohs.forwardLean')).every((g) => g.level === 'high')).toBe(true);
  });
  it('a sided card shows its worse side', () => {
    const l: MeasureTrust = { id: 'sls.hipDrop', side: 'left', level: 'medium', reasons: ['dim'] };
    const rr: MeasureTrust = { id: 'sls.hipDrop', side: 'right', level: 'low', reasons: ['cutOff'] };
    expect(worstTrust([l, rr])).toEqual({ level: 'low', reasons: ['cutOff', 'dim'] });
    expect(worstTrust([])).toBeNull();
  });
});

describe('MT-14: deterministic, and a carried-in jump keeps its rating', () => {
  it('the same captures give equal trust', () => {
    const a = replay(quickCapture({ noise: true, seed: 11 })), b = replay(quickCapture({ noise: true, seed: 11 }));
    expect(a.trust).toEqual(b.trust);
  });
  it('priorTests + priorTrust: the jump rows are the carried ones', () => {
    const jumpCap = quickCapture({ ...GOOD, only: ['T5'] });
    const jump = gradeSession(jumpCap);
    const t5 = jump.tests.find((t) => t.id === 'T5')!;
    const carried = jump.trust.filter((r) => r.id.startsWith('jump.')).map((r) => (r.id === 'jump.stiffLanding' ? { ...r, level: 'medium' as const, reasons: ['dim' as const] } : r));
    const rest = gradeSession(quickCapture({ ...GOOD, only: ['T1', 'T2', 'T3'] }), { T5: t5 }, carried);
    for (const c of carried) expect(row(rest.trust, c.id, c.side)).toEqual(c);
    const fresh = trustFor(quickCapture({ ...GOOD, only: ['T1', 'T2', 'T3'] }), rest.tests);
    expect(row(fresh, 'jump.stiffLanding').level).not.toBe('medium');   // without priorTrust it is rated from the result alone
  });
});

describe('MT-15: grading is untouched', () => {
  const FIXTURES: QuickScenario[] = [{}, GOOD, { noise: true }, { t1Front: { kneeInL: 0.06 } }, { t2: { right: { tibiaMax: 38.5 } } }, { only: ['T1', 'T2'] }, { painAfter: 'T2' }];
  it.each(FIXTURES.map((f, i) => [i, f] as const))('fixture %i: summarize() minus trust deep-equals the summary without it', (_i, sc) => {
    const r = replay(quickCapture(sc));
    const bare = summarize({ ...r, trust: [] });
    const withT = summarizeWithTrust(r);
    if (!bare) { expect(withT).toBeNull(); return; }
    const { trust, ...rest } = withT!;
    expect(rest).toEqual(bare);
    expect(summarize(r)).toEqual(bare);
    expect('trust' in summarize(r)!).toBe(false);
    expect(trust?.length ?? 0).toBeGreaterThan(0);
  });
});

class MemStore implements StorageLike {
  m = new Map<string, string>(); writes: string[] = [];
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.writes.push(k); this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
beforeEach(() => forgetAgeForTests());

describe('MT-17: what is kept', () => {
  it('summary.trust rows hold only id, side, level and reasons: no number, frame or landmark', () => {
    const s = summarizeWithTrust(replay(quickCapture({ noise: true })))!;
    for (const r of s.trust!) {
      expect(Object.keys(r).every((k) => ['id', 'side', 'level', 'reasons'].includes(k))).toBe(true);
      expect(Object.values(r).flat().every((v) => typeof v === 'string')).toBe(true);
    }
    expect(JSON.stringify(s.trust)).not.toMatch(/image|frames|landmark|"v"|"x"|"y"|vis|conf|poseHz|fps"/);
  });
});

describe('MT-18: the store parses trust strictly', () => {
  const S = summarizeWithTrust(replay(quickCapture(GOOD)))!;
  const put = (summary: unknown) => { const t = new MemStore(); t.setItem(KEYS.gate, JSON.stringify(gateRecord('18+', false))); t.setItem(KEYS.summary, JSON.stringify(summary)); return readResult(t); };
  it('accepts a summary with trust, and one without (an old tab)', () => {
    expect(put(S)!.summary.trust).toEqual(S.trust);
    const { trust: _t, ...old } = S; void _t;
    expect(put(old)!.summary.trust).toBeUndefined();
    const t = new MemStore(); expect(writeResult(t, gateRecord('18+', false), S)).toBe(true);
    expect(readResult(t)!.summary).toEqual(S);
  });
  it('rejects an unknown level, reason or id, a bad side, a non-array, or an extra key', () => {
    const r0 = S.trust![0];
    for (const bad of [
      [{ ...r0, level: 'certain' }], [{ ...r0, reasons: ['shaky'] }], [{ ...r0, id: 'jump.force' }], [{ ...r0, side: 'both' }],
      [{ ...r0, score: 0.9 }], [{ ...r0, frames: [] }], 'high', [null], [{ id: r0.id, level: r0.level }],
    ]) expect(put({ ...S, trust: bad }), JSON.stringify(bad)).toBeNull();
  });
});

/** Numeric literals in code (literals.test.ts's scanner, re-implemented): comments, strings and template text dropped. */
function numbers(src: string): string[] {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '\'' || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; out += '""'; continue; }
    if (c === '`') {
      i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { i += 2; let d = 1; while (i < src.length && d) { if (src[i] === '{') d++; else if (src[i] === '}') d--; if (d) out += src[i]; i++; } out += ' '; continue; }
        i++;
      }
      i++; continue;
    }
    out += c; i++;
  }
  const found = new Set<string>();
  for (const m of out.matchAll(/(?<![\w.$])(\d+(?:\.\d+)?(?:e-?\d+)?|\.\d+)(?![\w$])/g)) if (!['0', '1', '2'].includes(m[1])) found.add(m[1]);
  return [...found];
}
const LANDMARKS = ['11', '12', '13', '14', '15', '16', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33'];

describe('MT-21: copy, literals and the register', () => {
  it('every TrustReason has a line, every level a word, and the info line says it stays on this device', () => {
    for (const r of TRUST_REASONS) expect(TRUST_REASON_LINES[r]?.length, r).toBeGreaterThan(8);
    expect(Object.keys(TRUST_REASON_LINES).sort()).toEqual([...TRUST_REASONS].sort());
    expect(TRUST_WORDS).toEqual({ high: 'High trust', medium: 'Medium trust', low: 'Low trust' });
    expect(TRUST_INFO_LINE).toBe('Trust shows how clearly the camera saw each check. It is worked out on this device; nothing is sent.');
  });
  it('no screen file gains the old word for the device, and the trust copy names no programme or brand', () => {
    const banned = new RegExp(`\\b(this|the) ${['ph', 'one'].join('')}\\b`, 'i');
    const files = [
      ...readdirSync(join(ROOT, 'lib/screen')).filter((f) => /^(trust|PROPOSED-trust)/.test(f)).map((f) => `lib/screen/${f}`),
      'lib/screen/copy.ts', 'app/play/mirror/assess/_components/screen-ui.tsx', 'app/play/mirror/assess/_components/results-view.tsx',
      'app/play/mirror/assess/_components/jump-result.tsx',
    ];
    for (const f of files) expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(banned);
    for (const s of [...Object.values(TRUST_REASON_LINES), ...Object.values(TRUST_WORDS), TRUST_INFO_LINE]) expect(s).not.toMatch(/pjf|vertec|240|protocol/i);
  });
  it('trust.ts and trust-rows.ts hold no number but 0, 1, 2 or a landmark index', () => {
    for (const f of ['lib/screen/trust.ts', 'lib/screen/trust-rows.ts']) {
      expect(numbers(readFileSync(join(ROOT, f), 'utf8')).filter((x) => !LANDMARKS.includes(x)), f).toEqual([]);
    }
  });
  it('every register entry is TUNE and unsigned with a known source; a reuse entry equals its gate', () => {
    expect(TRUST_VERSION).toBe('trust-0.1-proposed');
    const SOURCES = ['spec-TUNE-EJ', 'repo-TUNE(elijah)', 'lane-guess-unsourced', 'pjf-protocol-2026-10-23 [S3]', 'ui-only'];
    for (const id of TRUST_IDS) {
      const e = TRUST[id] as { value: number; tune: boolean; signedOff: boolean; source: string; label: string; reuses?: ThresholdId };
      expect(e.tune, id).toBe(true);
      expect(e.signedOff, id).toBe(false);
      expect(SOURCES, id).toContain(e.source);
      expect(e.label.length, id).toBeGreaterThan(8);
      if (e.reuses) expect(e.value, id).toBe(th(e.reuses));
    }
    expect(TRUST['trust.visHigh'].reuses).toBe('gate.visibilityScoring');
    expect(TRUST['trust.visMedium'].reuses).toBe('gate.visibility');
    expect(TRUST['trust.confMedium'].reuses).toBe('gate.minConfidence');
    expect(TRUST['trust.jumpFpsMedium'].reuses).toBe('gate.jumpFps');
    // PM 2026-10-23 (TUNE): High needs 0.8; the framing lines 0.1 / 0.3; the 240 fps jump line kept
    expect([tr('trust.confHigh'), tr('trust.framingBadHigh'), tr('trust.framingBadMedium'), tr('trust.jumpHighFps')]).toEqual([0.8, 0.1, 0.3, 240]);
  });
});

describe('MT-22: no force measure', () => {
  it('no TrustMeasureId is a force measure, and no screen file shows a force number', () => {
    for (const id of TRUST_MEASURE_IDS) expect(id).not.toMatch(/force|newton|power|rfd|impulse/i);
    const dir = 'app/play/mirror/assess/_components';
    const files = [
      ...readdirSync(join(ROOT, dir)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${dir}/${f}`),
      ...readdirSync(join(ROOT, 'lib/screen')).filter((f) => /\.ts$/.test(f) && !f.endsWith('.test.ts')).map((f) => `lib/screen/${f}`),
    ];
    const strings = (src: string) => [...src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
    for (const f of files) for (const s of strings(readFileSync(join(ROOT, f), 'utf8'))) expect(s, `${f}: ${s}`).not.toMatch(/\b(force|newtons?|peak power|watts)\b/i);
  });
});
