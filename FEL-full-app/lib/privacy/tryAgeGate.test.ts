// TRY-AGE-PLACEHOLDER-1: Cyber's B1 tests 2-4 (the exact-birthday bands, the session lock, nothing but the band kept).
import { afterEach, describe, expect, it } from 'vitest';
import { gateForBand, lockTryAge, tryAgeBand } from './tryAgeGate';
import { forgetAgeForTests, KEYS } from '@/lib/screen/store';

const NOW = new Date(2026, 10, 2, 12);   // 2 Nov 2026, local noon

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    m,
    s: {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => { m.set(k, String(v)); },
      removeItem: (k: string) => { m.delete(k); },
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    },
  };
}

afterEach(() => { forgetAgeForTests(); });

describe('TRY-AGE-PLACEHOLDER-1: /try age bands from the full birth date', () => {
  it('a birthday one day short of 18 gets the teen path and the 18th birthday gets the adult path; one day short of 13 is blocked', () => {
    expect(tryAgeBand('2008-11-03', NOW)).toBe('13-17');
    expect(gateForBand(tryAgeBand('2008-11-03', NOW))).toBe('local');
    expect(tryAgeBand('2008-11-02', NOW)).toBe('18+');
    expect(gateForBand(tryAgeBand('2008-11-02', NOW))).toBe('adult');
    expect(tryAgeBand('2013-11-03', NOW)).toBe('under-13');
    expect(gateForBand(tryAgeBand('2013-11-03', NOW))).toBe('blocked');
    expect(tryAgeBand('2013-11-02', NOW)).toBe('13-17');
  });

  it('never rounds a year-only or unreadable answer up a band', () => {
    expect(tryAgeBand(null, NOW)).toBe('unknown');
    expect(tryAgeBand('2008', NOW)).toBe('unknown');
    expect(tryAgeBand('2027-01-01', NOW)).toBe('unknown');
    expect(gateForBand('unknown')).toBe('local');
    // a 29 February birthday turns 18 on 1 March of a plain year
    expect(tryAgeBand('2008-02-29', new Date(2026, 1, 28, 12))).toBe('13-17');
    expect(tryAgeBand('2008-02-29', new Date(2026, 2, 1, 12))).toBe('18+');
  });

  it('after a blocked or teen result, a re-pick in the same session cannot move to an older band', () => {
    const teen = memoryStorage();
    expect(lockTryAge(teen.s, tryAgeBand('2010-05-05', NOW))).toBe('local');
    expect(lockTryAge(teen.s, tryAgeBand('1990-05-05', NOW))).toBe('local');
    forgetAgeForTests();
    const kid = memoryStorage();
    expect(lockTryAge(kid.s, tryAgeBand('2018-05-05', NOW))).toBe('blocked');
    expect(lockTryAge(kid.s, tryAgeBand('2010-05-05', NOW))).toBe('blocked');
    expect(lockTryAge(kid.s, tryAgeBand('1990-05-05', NOW))).toBe('blocked');
  });

  it('a /try teen or blocked result stores no birth date: the session lock holds the age band only', () => {
    for (const [date, band] of [['2010-05-05', '13-17'], ['2018-05-05', 'under-13']] as const) {
      forgetAgeForTests();
      const { m, s } = memoryStorage();
      lockTryAge(s, tryAgeBand(date, NOW));
      expect([...m.keys()]).toEqual([KEYS.sessionAge]);
      expect(KEYS.sessionAge).toBe('fel.screen.sessionAge');
      expect(m.get(KEYS.sessionAge)).toBe(band);
      for (const v of m.values()) { expect(v).not.toContain('2010'); expect(v).not.toContain('2018'); expect(v).not.toMatch(/\d{4}-\d{2}/); }
    }
  });
});
