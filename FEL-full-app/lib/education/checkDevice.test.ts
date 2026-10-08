import { describe, expect, it } from 'vitest';
import { DEVICE_KEY, readDeviceChecks, recordDeviceCheck, writeDeviceChecks } from './checkDevice';

// EDU-LINKS (2026-10-07): under 18 or an unknown age the server keeps nothing of a chapter check, so the device keeps the
// best score per chapter (owner decision 1, 2026-10-07: a teen's progress stays on the device). Scores only, no answers.

function memory(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data, length: 0, clear: () => data.clear(), key: () => null, removeItem: (k) => { data.delete(k); },
    getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, String(v)); },
  };
}

describe('a minor’s chapter check, on the device', () => {
  it('keeps the best score per chapter, and a pass stays a pass', () => {
    let c = recordDeviceCheck({}, 6, 70, false);
    c = recordDeviceCheck(c, 6, 90, true);
    c = recordDeviceCheck(c, 6, 40, false);
    expect(c).toEqual({ 6: { best: 90, passed: true } });
    expect(recordDeviceCheck({}, 1, 250, true)).toEqual({ 1: { best: 100, passed: true } });
  });

  it('round-trips through storage, holding scores only', () => {
    const s = memory();
    expect(writeDeviceChecks(s, recordDeviceCheck({}, 3, 80, true))).toBe(true);
    expect(readDeviceChecks(s)).toEqual({ 3: { best: 80, passed: true } });
    expect(s.data.get(DEVICE_KEY)).toBe('{"3":{"best":80,"passed":true}}');
  });

  it('blocked or junk storage reads as nothing kept and never throws', () => {
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readDeviceChecks(throwing)).toEqual({});
    expect(writeDeviceChecks(throwing, {})).toBe(false);
    expect(readDeviceChecks(null)).toEqual({});
    const s = memory();
    s.setItem(DEVICE_KEY, '{"6":{"best":"lots"},"x":{"best":1,"passed":true},"7":{"best":50,"passed":false}}');
    expect(readDeviceChecks(s)).toEqual({ 7: { best: 50, passed: false } });
    s.setItem(DEVICE_KEY, 'not json');
    expect(readDeviceChecks(s)).toEqual({});
  });

  it('the check component writes to the device only when the server did not keep the attempt', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('components/education/chapter-check.tsx', 'utf8');
    expect(src).toMatch(/if \(j\.saved !== true\) \{[\s\S]*writeDeviceChecks\(/);
  });
});
