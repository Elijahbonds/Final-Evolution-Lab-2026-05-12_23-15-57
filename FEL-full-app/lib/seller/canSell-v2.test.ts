// SELLER-18-1 v2: the setting (SELLER_ADULT_GATE_ENABLED → gateOn) and Cyber F1 (holdsSellerRows) in the pure rule,
// with the REAL age check (lib/coach-store/adult.ts isVerifiedAdult) over a fake user table.
import { describe, expect, it, vi } from 'vitest';
import { isVerifiedAdult } from '@/lib/coach-store/adult';
import { isSellerAdultGateEnabled } from '@/lib/flags';
import { sellerRefusal, type SellerGateDeps } from './canSell';

const YEAR = new Date().getFullYear();

function deps(rows: Record<string, number | null>, over: Partial<SellerGateDeps> = {}) {
  const reads: string[] = [];
  const db = { user: { findUnique: async ({ where }: { where: { id: string } }) => { reads.push(where.id); return where.id in rows ? { dobYear: rows[where.id] } : null; } } };
  const onMinorSeller = vi.fn(async (_id: string) => undefined);
  const g: SellerGateDeps = { db: db as never, hasRole: async () => true, isAdult: isVerifiedAdult, onMinorSeller, ...over };
  return { g, reads, onMinorSeller };
}

describe('SELLER_ADULT_GATE_ENABLED: off by default, the usual on-words', () => {
  it('reads only its own key; unset, empty or anything else is off', () => {
    const env = (v?: string) => (v === undefined ? {} : { SELLER_ADULT_GATE_ENABLED: v }) as unknown as NodeJS.ProcessEnv;
    expect(isSellerAdultGateEnabled(env())).toBe(false);
    for (const off of ['', '0', 'false', 'off', 'no', 'enabled', '2']) expect(isSellerAdultGateEnabled(env(off)), off).toBe(false);
    for (const on of ['1', 'true', 'on', 'yes', ' TRUE ', 'Yes']) expect(isSellerAdultGateEnabled(env(on)), on).toBe(true);
  });
});

describe('gateOn false: the role only — no birth-year read, no takedown', () => {
  it('a teen and an unknown-age account with the role pass; nobody\'s birth year is read', async () => {
    const { g, reads, onMinorSeller } = deps({ teen: YEAR - 15, blank: null }, { gateOn: false });
    expect(await sellerRefusal('teen', g)).toBeNull();
    expect(await sellerRefusal('blank', g)).toBeNull();
    expect(reads).toEqual([]);
    expect(onMinorSeller).not.toHaveBeenCalled();
  });

  it('the role still decides: no role (or no id) is not_a_seller, exactly as before', async () => {
    const { g } = deps({ adult: 1990 }, { gateOn: false, hasRole: async () => false });
    expect(await sellerRefusal('adult', g)).toBe('not_a_seller');
    expect(await sellerRefusal(null, g)).toBe('not_a_seller');
  });

  it('gateOn true behaves as the rule with no setting given (absent = on for the pure rule)', async () => {
    for (const gateOn of [true, undefined]) {
      const { g } = deps({ teen: YEAR - 15, adult: 1990, blank: null }, { gateOn });
      expect(await sellerRefusal('teen', g)).toBe('under_18');
      expect(await sellerRefusal('blank', g)).toBe('age_unknown');
      expect(await sellerRefusal('adult', g)).toBeNull();
    }
  });
});

describe('Cyber F1: only an account that really sells is taken down; everyone else is just refused', () => {
  it('a teen with no seller rows: under_18, and the takedown never starts', async () => {
    const rowsAsked: string[] = [];
    const { g, onMinorSeller } = deps({ teen: YEAR - 15 }, { holdsSellerRows: async (id) => { rowsAsked.push(id); return false; } });
    expect(await sellerRefusal('teen', g)).toBe('under_18');
    expect(rowsAsked).toEqual(['teen']);
    expect(onMinorSeller).not.toHaveBeenCalled();
  });

  it('a teen with seller rows: under_18, and the takedown starts once for that account', async () => {
    const { g, onMinorSeller } = deps({ teen: YEAR - 15 }, { holdsSellerRows: async () => true });
    expect(await sellerRefusal('teen', g)).toBe('under_18');
    expect(onMinorSeller).toHaveBeenCalledTimes(1);
    expect(onMinorSeller).toHaveBeenCalledWith('teen');
  });

  it('a seller-rows read that fails is "no": refused, nothing taken down', async () => {
    const { g, onMinorSeller } = deps({ teen: YEAR - 15 }, { holdsSellerRows: async () => { throw new Error('table missing'); } });
    expect(await sellerRefusal('teen', g)).toBe('under_18');
    expect(onMinorSeller).not.toHaveBeenCalled();
  });

  it('seller rows are never asked for an adult, an unknown age, or a non-seller', async () => {
    const holdsSellerRows = vi.fn(async () => true);
    const { g, onMinorSeller } = deps({ adult: 1990, blank: null }, { holdsSellerRows });
    expect(await sellerRefusal('adult', g)).toBeNull();
    expect(await sellerRefusal('blank', g)).toBe('age_unknown');
    expect(await sellerRefusal('nobody', { ...g, hasRole: async () => false })).toBe('not_a_seller');
    expect(holdsSellerRows).not.toHaveBeenCalled();
    expect(onMinorSeller).not.toHaveBeenCalled();
  });
});
