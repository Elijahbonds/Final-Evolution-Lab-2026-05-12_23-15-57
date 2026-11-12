// JUMP-TESTS: the jump history on this phone (adults only, numbers only, its CSV formula-safe), the frames picked by
// hand (the height again from two frames; never verified), and the pilot capture (off unless the build says '1'; its
// CSV carries the raw timing and the velocity/power estimates).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanEntry, forgetJumps, HISTORY_CSV_HEADER, HISTORY_KEY, jumpHistoryCsv, keepJump, loadJumps, type JumpHistoryEntry } from '@/lib/jump/historyStore';
import { autoEdges, changed, frameAt, manualRead, nudge } from '@/lib/jump/manualFrames';
import { verifyJump } from '@/lib/jump/session';
import { clearPilot, logCapture, PILOT_HEADER, pilotCsv, pilotEnabled, pilotRows } from '@/lib/jump/pilot';
import { protocolTake } from '@/lib/jump/protocolBench';
import { readProtocolClip } from '@/lib/jump/protocols';
import { parseCsv } from '@/lib/csv/csv';
import type { ReachStorage } from '@/lib/jump/reachStore';
import type { PoseFrame } from '@/lib/pose/landmarks';

const mem = (): ReachStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
};
const entry = (o: Partial<JumpHistoryEntry> = {}): JumpHistoryEntry => ({
  id: 'jump-abcdef123456', at: '2026-10-25T12:00:00.000Z', test: 'sj', bestCm: 35.2, plusMinusCm: 1.8, jumps: 3, verified: true,
  manualFrames: false, source: 'video', fps: 240, rsi: null, contactMs: null, v0Mps: 2.63, rsiMod: null, ...o,
});

describe('the history on this phone', () => {
  it('kept for an adult only: anyone else is refused before storage is touched', () => {
    const s = mem();
    expect(keepJump(s, entry(), { adult: false })).toBe(false);
    expect(s.map.size).toBe(0);
    expect(keepJump(s, entry(), { adult: true })).toBe(true);
    expect(keepJump(s, entry(), { adult: true })).toBe(false);       // the same id twice
    expect(loadJumps(s)).toEqual([entry()]);
  });
  it('numbers only: a field it does not write, or a value out of range, is dropped on the way in and out', () => {
    expect(cleanEntry({ ...entry(), frames: [1, 2] })).toEqual(entry());     // unknown keys are not carried
    expect(cleanEntry(entry({ bestCm: 900 }))).toBeNull();
    expect(cleanEntry(entry({ test: 'dunk' as never }))).toBeNull();
    expect(cleanEntry(entry({ id: '<script>' }))).toBeNull();
    const s = mem();
    s.setItem(HISTORY_KEY, JSON.stringify([entry(), { junk: true }, 'x']));
    expect(loadJumps(s)).toHaveLength(1);
    s.setItem(HISTORY_KEY, '{not json');
    expect(loadJumps(s)).toEqual([]);
    expect(loadJumps(null)).toEqual([]);
  });
  it('forgotten on a tap', () => {
    const s = mem();
    keepJump(s, entry(), { adult: true });
    forgetJumps(s);
    expect(loadJumps(s)).toEqual([]);
  });
  it('the CSV: oldest first, cm and in, the verified and manual marks, formula-safe', () => {
    const csv = jumpHistoryCsv([entry({ id: 'jump-bbbbbbbbbbbb', at: '2026-10-26T08:00:00.000Z', test: 'rj105', bestCm: 29.4, plusMinusCm: null, rsi: 2.85, contactMs: 181, verified: false }), entry({ manualFrames: true, verified: false })]);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...HISTORY_CSV_HEADER]);
    expect(rows[1].slice(0, 9)).toEqual(['2026-10-25', '12:00:00', 'Squat jump', '35.2', '13.9', '1.8', '3', 'no', 'yes']);
    expect(rows[2].slice(2, 4)).toEqual(['10-5 rebound jumps', '29.4']);
    expect(rows[2][11]).toBe('2.85');
    expect(csv.split('\r\n').every((l) => !/^[=+@]|,[=+@]/.test(l))).toBe(true);
  });
  it('the writers never send: no network call in the history, the CSV helpers or the components that keep', () => {
    for (const f of ['lib/jump/historyStore.ts', 'lib/csv/csv.ts', 'lib/csv/download.ts', 'lib/jump/pilot.ts', 'components/jump/jump-tests.tsx', 'components/jump/jump-history.tsx', 'components/jump/frame-review.tsx', 'components/jump/fv-profile.tsx', 'components/jump/pilot-capture.tsx']) {
      expect(readFileSync(join(__dirname, '../..', f), 'utf8'), f).not.toMatch(/fetch\(|sendBeacon|XMLHttpRequest|WebSocket/);
    }
  });
});

describe('frames picked by hand', () => {
  const frames: PoseFrame[] = Array.from({ length: 600 }, (_, k) => ({ t: k * (1000 / 240), present: true, image: [] }));
  const jump = { takeoffT: 1000.7, landT: 1501.9 };
  it('the app\'s read as frames: the first frame at or after each edge', () => {
    const e = autoEdges(frames, jump);
    expect(frames[e.takeoffIdx].t).toBeGreaterThanOrEqual(jump.takeoffT);
    expect(frames[e.takeoffIdx - 1].t).toBeLessThan(jump.takeoffT);
    expect(frameAt(frames, 1e9)).toBe(599);
  });
  it('the height again from two frames: g·T²/8, one frame of timing as its ±', () => {
    const e = { takeoffIdx: 240, landIdx: 360 };
    const r = manualRead(frames, e)!;
    expect(r.flightMs).toBe(500);
    expect(r.heightCm).toBeCloseTo((9.81 * 0.25) / 8 * 100, 1);
    expect(r.plusMinusCm).toBeCloseTo(((9.81 * 0.5 * (1 / 240)) / 4) * 100, 1);
    expect(r.frames).toBe(120);
  });
  it('a nudge stays inside the clip and keeps the take-off before the landing; back to the app\'s frames is not manual', () => {
    const a = autoEdges(frames, jump);
    expect(nudge(frames, a, 'takeoff', 10_000).takeoffIdx).toBe(a.landIdx - 1);
    expect(nudge(frames, a, 'land', -10_000).landIdx).toBe(a.takeoffIdx + 1);
    expect(nudge(frames, a, 'land', 10_000).landIdx).toBe(599);
    const moved = nudge(frames, a, 'land', 2);
    expect(changed(moved, a)).toBe(true);
    expect(changed(nudge(frames, moved, 'land', -2), a)).toBe(false);
    expect(manualRead(frames, { takeoffIdx: 5, landIdx: 5 })).toBeNull();
  });
  it('assumption (owner call): a jump with hand-picked frames is never verified, whatever else it passes', () => {
    const j = { index: 1, valid: true, heightCm: 40, heightSdCm: 0.5, method: 'refined' as const, quality: { flags: [], clean: true } };
    expect(verifyJump(j, { poseHz: 240, source: 'slowmo' }).verified).toBe(true);
    expect(verifyJump(j, { poseHz: 240, source: 'slowmo', manual: true })).toMatchObject({ verified: false, blocks: ['manual'] });
  });
});

describe('pilot capture', () => {
  beforeEach(() => clearPilot());
  it('off unless the build sets exactly "1"', () => {
    expect(pilotEnabled({})).toBe(false);
    for (const v of ['0', 'true', 'yes', '', ' 1']) expect(pilotEnabled({ NEXT_PUBLIC_JUMP_PILOT_CAPTURE: v })).toBe(false);
    expect(pilotEnabled({ NEXT_PUBLIC_JUMP_PILOT_CAPTURE: '1' })).toBe(true);
    expect(pilotEnabled()).toBe(false);   // this test run's environment: off
  });
  it('per-trial raw timing, how it was timed, its ±, and the estimates; a manual capture is its own; power only with a mass', () => {
    const { frames } = protocolTake('cmjHips', { fps: 240, seed: 1 });
    const r = readProtocolClip(frames, 4 / 3, 'cmjHips');
    if (!r.ok) throw new Error(r.why);
    logCapture({ test: 'cmjHips', source: 'video', t5: r.t5, fps: r.fps, stretch: r.stretch, frames: r.frames, front: r.front });
    const m = manualRead(r.frames, { takeoffIdx: autoEdges(r.frames, r.best!).takeoffIdx, landIdx: autoEdges(r.frames, r.best!).landIdx + 1 })!;
    logCapture({ test: 'cmjHips', source: 'video', t5: r.t5, fps: r.fps, frames: r.frames, front: r.front, manual: { index: r.best!.index, read: m } });
    expect(pilotRows()).toHaveLength(6);
    const rows = parseCsv(pilotCsv({ participant: 'P07', session: '1' }));
    expect(rows[0]).toEqual([...PILOT_HEADER]);
    const col = (name: string) => PILOT_HEADER.indexOf(name as (typeof PILOT_HEADER)[number]);
    const first = rows[1];
    expect(first[col('participant')]).toBe('P07');
    expect(first[col('method')]).toBe('refined');
    expect(Number(first[col('flight_ms')])).toBeGreaterThan(400);
    expect(Number(first[col('landing_ms')]) - Number(first[col('takeoff_ms')])).toBeCloseTo(Number(first[col('flight_ms')]), -1);
    expect(Number(first[col('v0_mps')])).toBeGreaterThan(2.5);
    expect(Number(first[col('push_off_cm')])).toBeGreaterThan(20);
    expect(first[col('peak_power_w')]).toBe('');
    expect(rows.filter((x) => x[col('method')] === 'manual')).toHaveLength(1);
    const withMass = parseCsv(pilotCsv({ participant: 'P07', session: '1', massKg: 80 }));
    expect(Number(withMass[1][col('peak_power_w')])).toBeGreaterThan(2000);
    expect(Number(withMass[1][col('mean_power_w')])).toBeGreaterThan(500);
    // a code that is not a code (a name, a formula) is left out
    expect(parseCsv(pilotCsv({ participant: 'Jane Doe', session: '=1' }))[1].slice(0, 2)).toEqual(['', '']);
  });
});
