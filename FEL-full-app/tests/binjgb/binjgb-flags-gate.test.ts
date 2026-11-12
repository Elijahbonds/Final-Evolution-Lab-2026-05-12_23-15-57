// BINJGB-SHELF-1 — flags and the server age gate (Cyber G6 + L1). T-FLAG-SHELF-OFF (flag half), T-FLAG-LOCAL-OFF,
// T-LOCAL-AGE-GATE, T-TEEN-NO-LOCAL / T-LOCAL-ABSENT, T-SHELF-AGE-UNKNOWN, T-U13, T-NAV-ROW-OFF, T-SHELF-EMPTY-ROW.
import { afterEach, describe, expect, it } from 'vitest';
import { isBinjgbLocalFileEnabled, isBinjgbShelfEnabled } from '@/lib/flags';
import { homebrewRowVisible, localFrameAllowed, shelfAccess } from '@/lib/binjgb/gate';
import { homebrewRowFor } from '@/lib/binjgb/hubRow';
import { SHELF_TITLES } from '@/lib/binjgb/manifest';

const NOW = new Date('2026-11-09T12:00:00-08:00');
const ADULT = 1990, TEEN = 2010, U13 = 2015;   // 2026: gap 36 / 16 / 11

afterEach(() => {
  delete process.env.BINJGB_SHELF_ENABLED;
  delete process.env.BINJGB_LOCAL_FILE_ENABLED;
});

describe('both flags exist and default OFF', () => {
  it('unset → off; "1"/"true" → on; anything else → off', () => {
    delete process.env.BINJGB_SHELF_ENABLED;
    delete process.env.BINJGB_LOCAL_FILE_ENABLED;
    expect(isBinjgbShelfEnabled()).toBe(false);
    expect(isBinjgbLocalFileEnabled()).toBe(false);
    for (const v of ['0', 'false', '', 'off', 'nope']) {
      process.env.BINJGB_SHELF_ENABLED = v;
      process.env.BINJGB_LOCAL_FILE_ENABLED = v;
      expect(isBinjgbShelfEnabled(), v).toBe(false);
      expect(isBinjgbLocalFileEnabled(), v).toBe(false);
    }
    process.env.BINJGB_SHELF_ENABLED = '1';
    process.env.BINJGB_LOCAL_FILE_ENABLED = 'true';
    expect(isBinjgbShelfEnabled()).toBe(true);
    expect(isBinjgbLocalFileEnabled()).toBe(true);
  });
});

describe('shelfAccess — the server decides (G6 / L1)', () => {
  const at = (shelfOn: boolean, localOn: boolean, dobYear: number | null) => shelfAccess({ shelfOn, localOn, dobYear, now: NOW });

  it('T-FLAG-SHELF-OFF: shelf flag off → 404 for everyone, even an adult with the local flag on', () => {
    for (const dob of [ADULT, TEEN, U13, null]) expect(at(false, true, dob)).toEqual({ kind: 'not-found' });
  });

  it('T-LOCAL-AGE-GATE: under-13 blocked; unknown → age prompt; adult + both flags → picker; teen → picker absent', () => {
    expect(at(true, true, U13)).toEqual({ kind: 'not-found' });
    expect(at(true, true, null)).toEqual({ kind: 'age-prompt' });
    expect(at(true, true, ADULT)).toEqual({ kind: 'shelf', picker: true });
    expect(at(true, true, TEEN)).toEqual({ kind: 'shelf', picker: false });
  });

  it('T-TEEN-NO-LOCAL (= T-LOCAL-ABSENT): teen + both flags → shelf OK, picker absent; so is an 18-year gap (not verified 18+)', () => {
    expect(at(true, true, TEEN)).toEqual({ kind: 'shelf', picker: false });
    expect(at(true, true, 2008)).toEqual({ kind: 'shelf', picker: false });   // gap of exactly 18: may still be 17
    expect(localFrameAllowed({ shelfOn: true, localOn: true, dobYear: TEEN, now: NOW })).toBe(false);
  });

  it('T-SHELF-AGE-UNKNOWN: no birth year, or a nonsense one → the age prompt, never the player', () => {
    for (const dob of [null, undefined, 0, 3000, 1899]) {
      expect(shelfAccess({ shelfOn: true, localOn: true, dobYear: dob as number | null, now: NOW })).toEqual({ kind: 'age-prompt' });
    }
  });

  it('T-FLAG-LOCAL-OFF: local flag off → no picker for anyone; the local frame is not served', () => {
    expect(at(true, false, ADULT)).toEqual({ kind: 'shelf', picker: false });
    expect(localFrameAllowed({ shelfOn: true, localOn: false, dobYear: ADULT, now: NOW })).toBe(false);
    expect(localFrameAllowed({ shelfOn: false, localOn: true, dobYear: ADULT, now: NOW })).toBe(false);   // OQ-6
    expect(localFrameAllowed({ shelfOn: true, localOn: true, dobYear: ADULT, now: NOW })).toBe(true);
  });
});

describe('the quiet /play row (OQ-8)', () => {
  it('T-SHELF-ZERO-TITLES feeds it: v1 ships no titles', () => {
    expect(SHELF_TITLES).toEqual([]);
  });

  it('T-SHELF-EMPTY-ROW: zero titles → no row, even with the flag on and an adult', () => {
    expect(homebrewRowVisible(true, 0, ADULT, NOW)).toBe(false);
  });

  it('T-NAV-ROW-OFF: flag off → no row, even with titles', () => {
    expect(homebrewRowVisible(false, 3, ADULT, NOW)).toBe(false);
  });

  it('T-U13: under-13 (and unknown age) → no row; 13+ → row, once titles exist', () => {
    expect(homebrewRowVisible(true, 1, U13, NOW)).toBe(false);
    expect(homebrewRowVisible(true, 1, null, NOW)).toBe(false);
    expect(homebrewRowVisible(true, 1, TEEN, NOW)).toBe(true);
    expect(homebrewRowVisible(true, 1, ADULT, NOW)).toBe(true);
  });

  it('homebrewRowFor reads no age at all while the flag is off or the shelf is empty (v1)', async () => {
    let reads = 0;
    const readDob = async () => { reads++; return ADULT; };
    expect(await homebrewRowFor('u1', { shelfOn: () => false, titleCount: 5, readDob })).toBe(false);
    expect(await homebrewRowFor('u1', { shelfOn: () => true, titleCount: 0, readDob })).toBe(false);
    expect(await homebrewRowFor('u1')).toBe(false);   // the real deps: flag unset, zero titles
    expect(reads).toBe(0);
    expect(await homebrewRowFor('u1', { shelfOn: () => true, titleCount: 1, readDob })).toBe(true);
    expect(reads).toBe(1);
  });
});
