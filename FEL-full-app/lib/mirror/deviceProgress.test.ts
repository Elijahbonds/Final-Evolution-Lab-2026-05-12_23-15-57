// MIRROR-PROGRESS (plan Phase 4, 2026-10-07; owner decision 1): the phone-only history — capped, wipeable, never sent.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEVICE_HISTORY_CAP, DEVICE_PROGRESS_KEY, deviceStorage, forgetDeviceProgress, readDeviceHistory, recordDeviceProgress, type ProgressStorage,
} from './deviceProgress';

function memory(): ProgressStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('recordDeviceProgress / readDeviceHistory', () => {
  it('answers what came BEFORE the new value (what it is compared with), oldest first', () => {
    const s = memory();
    expect(recordDeviceProgress('squat', 0.5, 1, s)).toEqual([]);
    expect(recordDeviceProgress('squat', 0.6, 2, s)).toEqual([0.5]);
    expect(recordDeviceProgress('squat', 0.7, 3, s)).toEqual([0.5, 0.6]);
    expect(readDeviceHistory('squat', s)).toEqual([0.5, 0.6, 0.7]);
    // movements are kept apart
    expect(readDeviceHistory('lunge', s)).toEqual([]);
  });

  it(`capped at ${DEVICE_HISTORY_CAP} per movement, newest kept`, () => {
    const s = memory();
    for (let i = 0; i < 12; i++) recordDeviceProgress('hinge', i / 10, i, s);
    expect(readDeviceHistory('hinge', s)).toEqual([0.7, 0.8, 0.9, 1.0, 1.1]);
    const stored = JSON.parse(s.map.get(DEVICE_PROGRESS_KEY)!);
    expect(stored.byMovement.hinge).toHaveLength(DEVICE_HISTORY_CAP);
  });

  it('keeps only { at, value } under one key — no pose, no fault names, no account', () => {
    const s = memory();
    recordDeviceProgress('pushup', 0.75, 1_790_000_000_000, s);
    expect([...s.map.keys()]).toEqual([DEVICE_PROGRESS_KEY]);
    expect(JSON.parse(s.map.get(DEVICE_PROGRESS_KEY)!)).toEqual({ v: 1, byMovement: { pushup: [{ at: 1_790_000_000_000, value: 0.75 }] } });
  });

  it('a corrupt, foreign or oversized value reads as no history (and is replaced on the next write)', () => {
    for (const junk of ['{nope', '[]', '{"v":2,"byMovement":{}}', JSON.stringify({ v: 1, byMovement: { squat: [{ at: 'x', value: 1 }], evil: [{ at: 1, value: 1 }] } }), 'x'.repeat(30_000)]) {
      const s = memory();
      s.map.set(DEVICE_PROGRESS_KEY, junk);
      expect(readDeviceHistory('squat', s)).toEqual([]);
      expect(recordDeviceProgress('squat', 0.5, 1, s)).toEqual([]);
      expect(Object.keys(JSON.parse(s.map.get(DEVICE_PROGRESS_KEY)!).byMovement)).toEqual(['squat']);
    }
  });

  it('no storage, or storage that throws: null — the caller says this phone keeps nothing', () => {
    expect(readDeviceHistory('squat', null)).toBeNull();
    expect(recordDeviceProgress('squat', 0.5, 1, null)).toBeNull();
    const throwing: ProgressStorage = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => { throw new Error('x'); } };
    expect(readDeviceHistory('squat', throwing)).toBeNull();
    expect(recordDeviceProgress('squat', 0.5, 1, throwing)).toBeNull();
    expect(forgetDeviceProgress(throwing)).toBe(false);
    const readOnly: ProgressStorage = { ...memory(), setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(recordDeviceProgress('squat', 0.5, 1, readOnly)).toBeNull();
  });

  it('a non-finite value is never kept', () => {
    const s = memory();
    expect(recordDeviceProgress('squat', NaN, 1, s)).toBeNull();
    expect(s.map.size).toBe(0);
  });
});

describe('forgetDeviceProgress', () => {
  it('wipes every movement from this phone', () => {
    const s = memory();
    recordDeviceProgress('squat', 0.5, 1, s);
    recordDeviceProgress('lunge', 0.5, 1, s);
    expect(forgetDeviceProgress(s)).toBe(true);
    expect(s.map.size).toBe(0);
    expect(readDeviceHistory('squat', s)).toEqual([]);
  });
});

describe('deviceStorage', () => {
  it('null with no window (the server render, the tests\' stubbed window), or when touching localStorage throws', () => {
    expect(deviceStorage()).toBeNull();
    vi.stubGlobal('window', { get localStorage() { throw new Error('SecurityError'); } });
    expect(deviceStorage()).toBeNull();
    const s = memory();
    vi.stubGlobal('window', { localStorage: s });
    expect(deviceStorage()).toBe(s);
  });
});

describe('NEVER SENT (owner decision 1): the module has no way to reach a network', () => {
  it('no fetch, XHR, beacon, socket or import of anything that could', () => {
    const src = readFileSync(new URL('./deviceProgress.ts', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\/api\//);
    const imports = src.match(/from '[^']+'/g) ?? [];
    expect(imports.every((i) => i === "from './progressReading'")).toBe(true);
  });
});
