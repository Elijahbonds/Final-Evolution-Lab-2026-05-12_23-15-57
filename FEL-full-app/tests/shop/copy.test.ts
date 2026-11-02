// PLAT-P07 (2026-11-02): the shop front's own words (draft copy for the Owner Inbox) and FEL Pro's three lines (an owner
// draft) are short and plain, name no price or fee, and carry no medical word.
import { describe, expect, it } from 'vitest';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import { SHOP_COPY } from '@/components/shop/shop-copy';
import { PRO_COPY, PRO_LINES } from '@/components/pro/pro-copy';
import { WALLET_COPY } from '@/components/shop/wallet-balances';

const words = (s: string) => s.split(/\s+/).filter((x) => /[A-Za-z0-9]/.test(x)).length;
const LINES = [...Object.values(SHOP_COPY), ...Object.values(PRO_COPY), ...PRO_LINES,
  ...(['lc', 'coins', 'shards'] as const).flatMap((k) => [WALLET_COPY[k].name, WALLET_COPY[k].line]), WALLET_COPY.earn, WALLET_COPY.spend];

describe('the shop front\'s words', () => {
  it('no medical word, no money, no paragraph over 12 words', () => {
    for (const l of LINES) {
      expect(MEDICAL_WORDS.test(l), l).toBe(false);
      expect(l, l).not.toMatch(/\$|\d+ ?%|fee|refund|renew/i);
      expect(words(l), l).toBeLessThanOrEqual(12);
    }
  });
  it('FEL Pro says what it gives in three lines', () => {
    expect(PRO_LINES).toHaveLength(3);
  });
});
