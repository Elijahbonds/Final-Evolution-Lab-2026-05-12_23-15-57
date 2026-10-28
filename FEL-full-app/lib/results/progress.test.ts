// PLAT-P03: My progress's rows — the phone's last 10 jumps (TRY-11), saved history, combine re-tests (TRY-08) — and a
// page that only reads.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JumpHistoryEntry } from '@/lib/jump/historyStore';
import type { MyCombine } from '@/lib/combine/server';
import { byNewest, combineRows, DEVICE_JUMPS, deviceJumpRows, readinessRow, savedJumpRow, SPARK_POINTS, sprintRows } from './progress';

const ROOT = join(__dirname, '..', '..');
const DAY = 86_400_000;

describe('the phone\'s jumps (TRY-11)', () => {
  const jumps: JumpHistoryEntry[] = Array.from({ length: 12 }, (_, i) => ({
    id: `jump-${String(i).padStart(4, '0')}`, at: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(), test: 'check' as const,
    bestCm: 40 + i, plusMinusCm: 1.4, jumps: 3, verified: false, manualFrames: false, source: 'live' as const, fps: 60, rsi: null, contactMs: null, v0Mps: null, rsiMod: null,
  }));
  it('one row, the last 10 in its history, newest first, six points on the line', () => {
    const [row] = deviceJumpRows(jumps);
    expect(row.source).toBe('device');
    expect(row.history).toHaveLength(DEVICE_JUMPS);
    expect(row.history[0].value).toBe((51 / 2.54).toFixed(1));
    expect(row.spark).toHaveLength(SPARK_POINTS);
    // +1 cm a day is inside the jump band: about the same
    expect(row.vsLast).toBe('same');
    expect(row.vsLine).toBe('About the same as last time');
  });
});

describe('saved history and combines', () => {
  it('saved jump checks make one account row with the arrow', () => {
    const row = savedJumpRow([{ at: 1 * DAY, cm: 50 }, { at: 2 * DAY, cm: 55 }])!;
    expect(row.source).toBe('account');
    expect(row.vsLast).toBe('up');
  });
  it('two combines: each station a row, re-test against the last combine', () => {
    const st = (best: number, sprint: number) => [
      { id: 'cmj:standing', kind: 'cmj' as const, variant: 'standing', best, touchCm: null, attempts: [best], rank: 1, of: 9 },
      { id: 'sprint:40yd', kind: 'sprint' as const, variant: '40yd', best: sprint, touchCm: null, attempts: [sprint], rank: 1, of: 9 },
    ];
    const events: MyCombine[] = [{ id: 'b', name: 'B', createdAt: 50 * DAY, stations: st(58.4, 5.06) }, { id: 'a', name: 'A', createdAt: 5 * DAY, stations: st(54.1, 5.21) }];
    const rows = combineRows(events);
    expect(rows.map((r) => r.measure)).toEqual(['Vertical jump', 'Sprint · 40 yd (hand-timed)']);
    expect(rows[0].vsLast).toBe('up');
    expect(rows[0].history.map((h) => h.value)).toEqual(['23.0', '21.3']);
    expect(rows[1].vsLast).toBeNull();   // a stopwatch has no band: the change, no arrow
  });
  it('readiness days keep their own read; sprint rows split by start', () => {
    const r = readinessRow([{ day: '2026-10-01', bestCm: 41, band: 'normal', belowReal: false }, { day: '2026-10-02', bestCm: 44, band: 'ready', belowReal: false }], 'device')!;
    expect(r.vsLast).toBe('up');
    expect(r.vsLine).toBe('Above your normal');
    const runs = sprintRows([
      { v: 1, id: 'a', at: '2026-10-01T00:00:00Z', test: 'gate', label: '40 yd', distanceM: 36.6, timeS: 5.3, sdS: 0.03, startKind: 'go', reactionIncluded: true, splits: [], topSpeed: null, topSpeedSd: null, vmax: null, vmaxSd: null, tau: null, f0PerKg: null, pmaxPerKg: null, poseHz: 60, method: 'camera' },
      { v: 1, id: 'b', at: '2026-10-02T00:00:00Z', test: 'gate', label: '40 yd', distanceM: 36.6, timeS: 5.1, sdS: 0.03, startKind: 'movement', reactionIncluded: false, splits: [], topSpeed: null, topSpeedSd: null, vmax: null, vmaxSd: null, tau: null, f0PerKg: null, pmaxPerKg: null, poseHz: 60, method: 'camera' },
    ]);
    expect(runs).toHaveLength(2);
    expect(byNewest(runs)[0].latest).toBe('5.10');
  });
});

describe('My progress only reads', () => {
  it('no fetch, no beacon, no storage write anywhere in the page, its view or its models', () => {
    for (const f of ['app/train/progress/page.tsx', 'components/progress/progress-view.tsx', 'lib/results/progress.ts', 'lib/results/progressServer.ts']) {
      const src = readFileSync(join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(src, f).not.toMatch(/\bfetch\(|sendBeacon|setItem\(|removeItem\(|method:\s*['"](POST|PUT|PATCH|DELETE)|\.(create|update|upsert|delete)(Many)?\(|\$executeRaw/);
    }
  });
  it('the saved half is gated by the scan-save gate, and readiness / bar speed only behind it', () => {
    const src = readFileSync(join(ROOT, 'lib/results/progressServer.ts'), 'utf8');
    expect(src).toContain('canSaveScanNumbers(db, userId)');
    expect(src).toMatch(/if \(!canSave\) return \{ \.\.\.NOTHING_SAVED, combines \}/);
  });
});
