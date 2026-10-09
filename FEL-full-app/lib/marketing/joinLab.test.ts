// JOIN-LAB-HIDE (2026-09-29): the Join the Lab switch is on for exactly one value, the string 'true'. Everything a
// person might type meaning "on" ('1', 'TRUE', 'yes') leaves the form hidden, so turning it on is a deliberate act.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { joinLabEnabled } from './joinLab';

describe('joinLabEnabled', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('is off when the key is unset', () => {
    expect(joinLabEnabled({})).toBe(false);
  });

  it.each(['', 'false', '1', 'TRUE', 'True', 'yes', 'on', ' true', 'true '])('is off for %j', (value) => {
    expect(joinLabEnabled({ NEXT_PUBLIC_JOIN_LAB_ENABLED: value })).toBe(false);
  });

  it("is on only for the exact string 'true'", () => {
    expect(joinLabEnabled({ NEXT_PUBLIC_JOIN_LAB_ENABLED: 'true' })).toBe(true);
  });

  it('reads process.env when no env is passed', () => {
    vi.stubEnv('NEXT_PUBLIC_JOIN_LAB_ENABLED', undefined);
    expect(joinLabEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_JOIN_LAB_ENABLED', 'false');
    expect(joinLabEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_JOIN_LAB_ENABLED', 'true');
    expect(joinLabEnabled()).toBe(true);
  });

  it('accepts process.env passed whole', () => {
    vi.stubEnv('NEXT_PUBLIC_JOIN_LAB_ENABLED', 'true');
    expect(joinLabEnabled(process.env)).toBe(true);
  });
});
