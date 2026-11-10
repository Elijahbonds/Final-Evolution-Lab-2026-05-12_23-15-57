// SELLER-18-1 v3 (Cyber re-review N6 / C3): SELLER_ADULT_GATE_ENABLED is ON only for 1 / true / on / yes — trimmed and
// case-folded, the same rule as every other server flag (lib/flags.ts envOn) — and everything else is OFF.
// .env.example lists it, off by default.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { isCoachReviewUploadsEnabled, isSellerAdultGateEnabled } from '@/lib/flags';

const env = (v?: string) => (v === undefined ? {} : { SELLER_ADULT_GATE_ENABLED: v }) as unknown as NodeJS.ProcessEnv;
const ON = ['1', 'true', 'on', 'yes', 'ON ', ' True', 'YES', '\ton\n'];
const OFF = ['', ' ', '0', 'false', 'off', 'no', 'ture', 'enabled', 'y', 't', '2', '1.0', 'on yes', '"1"', "'true'", 'null', 'undefined'];

describe('SELLER_ADULT_GATE_ENABLED parse', () => {
  const saved = { gate: process.env.SELLER_ADULT_GATE_ENABLED, uploads: process.env.COACH_REVIEW_UPLOADS_ENABLED };
  afterEach(() => {
    for (const [k, v] of [['SELLER_ADULT_GATE_ENABLED', saved.gate], ['COACH_REVIEW_UPLOADS_ENABLED', saved.uploads]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it('unset is OFF', () => {
    expect(isSellerAdultGateEnabled(env())).toBe(false);
    delete process.env.SELLER_ADULT_GATE_ENABLED;
    expect(isSellerAdultGateEnabled()).toBe(false);   // the default argument reads process.env
  });

  it('only 1 / true / on / yes turn it ON, any casing, surrounding whitespace ignored', () => {
    for (const v of ON) expect(isSellerAdultGateEnabled(env(v)), JSON.stringify(v)).toBe(true);
  });

  it('everything else stays OFF: empty, 0, false, off, no, typos (ture), other words (enabled), quoted values', () => {
    for (const v of OFF) expect(isSellerAdultGateEnabled(env(v)), JSON.stringify(v)).toBe(false);
  });

  it('the same casing and whitespace rule as the existing flag parser (envOn, via COACH_REVIEW_UPLOADS_ENABLED)', () => {
    for (const v of [...ON, ...OFF]) {
      process.env.COACH_REVIEW_UPLOADS_ENABLED = v;
      process.env.SELLER_ADULT_GATE_ENABLED = v;
      expect(isSellerAdultGateEnabled(), JSON.stringify(v)).toBe(isCoachReviewUploadsEnabled());
    }
  });

  it('.env.example lists it once, empty (OFF), in the server-flag block', () => {
    const lines = readFileSync('.env.example', 'utf8').split('\n');
    const hits = lines.filter((l) => /^\s*SELLER_ADULT_GATE_ENABLED\s*=/.test(l));
    expect(hits).toEqual(['SELLER_ADULT_GATE_ENABLED=""']);
    const value = hits[0].split('=')[1].replace(/^"|"$/g, '');
    expect(isSellerAdultGateEnabled(env(value))).toBe(false);
    const at = lines.indexOf(hits[0]);
    const block = lines.findIndex((l) => l.startsWith('# --- Server feature flags'));
    expect(block).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(block);
  });
});
