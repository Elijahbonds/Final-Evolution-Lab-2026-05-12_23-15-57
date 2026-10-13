import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOOST_CARDS, BOOST_SKU_PREFIX, STAT_MODIFIER_KEYS, assertCosmeticCard, statModifierKeys, boostIdFromSku, boostSkuId, cardById, gameVitals,
  measuredPrq, ownedFromEntitlements, purchaseCheck,
} from './boosts';
import { CATALOG, getSku } from '../wallet/catalog';

describe('the catalogue', () => {
  it('carries all six of the cards the iOS build ships', () => {
    expect(BOOST_CARDS).toHaveLength(6);
    expect(BOOST_CARDS.map((c) => c.id).sort()).toEqual([
      'amir-signature', 'bonds-bounce', 'coach-v-elite', 'directors-cut', 'flight-lab-pro', 'neural-max',
    ]);
  });

  it('gives every card an id, a price, an accent and words of its own', () => {
    for (const c of BOOST_CARDS) {
      expect(c.costShards).toBeGreaterThan(0);
      expect(c.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.tagline.length).toBeGreaterThan(10);
      expect(c.creator.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(BOOST_CARDS.map((c) => c.id)).size).toBe(BOOST_CARDS.length);
  });

  it('finds a card by id and returns null rather than throwing on a bad one', () => {
    expect(cardById('bonds-bounce')?.creator).toBe('Elijah Bonds');
    expect(cardById('not-a-card')).toBeNull();
  });
});

// CARD-SAFE-2 (FE PM Oct 12): cards are cosmetic. Was: owned cards lifted the game-side PRQ (capped at +25). Shards are
// sold for money, so that was pay-to-win; the lift is gone and these pin that it stays gone.
describe('the game-side number (CARD-SAFE-2: no pay-to-win)', () => {
  it('is the measured number when nothing is owned', () => {
    expect(gameVitals(60, [])).toEqual({ base: 60, boosted: 60, lift: 0 });
  });

  it('owning any card, or all six, changes nothing', () => {
    for (const c of BOOST_CARDS) expect(gameVitals(50, [c.id])).toEqual({ base: 50, boosted: 50, lift: 0 });
    expect(gameVitals(50, BOOST_CARDS.map((c) => c.id))).toEqual({ base: 50, boosted: 50, lift: 0 });
  });

  it('a made-up id changes nothing either', () => {
    expect(gameVitals(50, ['not-a-card', 'neither-is-this']).lift).toBe(0);
  });

  it('never leaves 0–100 at either end', () => {
    expect(gameVitals(98, ['coach-v-elite']).boosted).toBe(98);
    expect(gameVitals(-40, []).base).toBe(0);
    expect(gameVitals(500, []).boosted).toBe(100);
  });
});

describe('cosmetic only (CARD-SAFE-2)', () => {
  it('no card carries a stat: no boost, PRQ, vertical, efficiency, neural or readiness field', () => {
    for (const c of BOOST_CARDS) {
      expect(statModifierKeys(c)).toEqual([]);
      expect(() => assertCosmeticCard(c)).not.toThrow();
    }
  });

  it('keeps all six names (incl. Amir Smith), taglines, accents and links', () => {
    expect(BOOST_CARDS.map((c) => c.creator)).toEqual(['Elijah Bonds', 'Amir Smith', 'Flight Lab', 'Coach V', 'Neural Max', 'Director Stella']);
    for (const c of BOOST_CARDS) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.tagline.length).toBeGreaterThan(0);
      expect(c.accent).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('blurbs describe the frame only, and the store never calls them boost cards (Cyber, CARD-SAFE-2)', () => {
    for (const c of BOOST_CARDS) {
      expect(c.blurb).toMatch(/^Cosmetic card frame/);
      expect(c.blurb).not.toMatch(/vertical|jump|data|performance|drive|tuned|handle|hang|body control|elite|package/i);
    }
    const store = readFileSync('components/wallet/coin-store.tsx', 'utf8');
    expect(store).toContain("what: 'Creator cards'");
    expect(store).not.toMatch(/boost cards/i);
  });

  it('rejects a stat-bearing card', () => {
    expect(() => assertCosmeticCard({ id: 'x', boost: { prq: 10 } })).toThrow(/stat_modifier_rejected: boost/);
    expect(() => assertCosmeticCard({ id: 'x', prq: 5, vertical: 3 })).toThrow(/prq,vertical/);
    expect(STAT_MODIFIER_KEYS).toEqual(expect.arrayContaining(['boost', 'prq', 'vertical', 'neural', 'damage']));
  });

  it('no file outside the catalogue reads a card stat, and the shelf shows no stat numbers', () => {
    const shelf = readFileSync('components/cards/boost-shelf.tsx', 'utf8');
    expect(shelf).not.toMatch(/\.boost\./);
    expect(shelf).not.toContain('BOOST_PRQ_CAP');
    expect(shelf).toContain('Cosmetic');
    expect(shelf).not.toMatch(/never sold for money|coming soon/i);
    for (const f of ['app/profile/page.tsx', 'app/dev/shelf/cards/page.tsx']) {
      expect(readFileSync(f, 'utf8')).not.toContain('from cards');
    }
  });
});

describe('the measurement number', () => {
  it('is the base, clamped, and nothing else', () => {
    expect(measuredPrq(60)).toBe(60);
    expect(measuredPrq(-5)).toBe(0);
    expect(measuredPrq(140)).toBe(100);
  });

  it('takes no card list at all — there is nowhere to put a bought point', () => {
    // If this signature ever grows a second parameter, the guard below is the one that has to be re-argued.
    expect(measuredPrq.length).toBe(1);
  });

  it('a card owner measures and plays at the same number (CARD-SAFE-2)', () => {
    const v = gameVitals(60, ['coach-v-elite']);
    expect(v.boosted).toBe(60);
    expect(measuredPrq(v.base)).toBe(60);
  });
});

describe('the wall between a purchase and a prescription', () => {
  // The rule this whole module exists for. A bought +PRQ may change a fight; it may never change what an athlete
  // is told to eat or what their movement screen reports. Enforced against the real files, so wiring a boost into
  // one of them fails here rather than shipping.
  const ROOT = join(__dirname, '..', '..');
  const MEASUREMENT_FILES = [
    'lib/kitchens/buildSnapshot.ts',
    'lib/kitchens/mealRxBuilder.ts',
    'lib/profile/scanToSnapshot.ts',
    'lib/kitchens/squatScan.ts',
    'lib/mirror/assessment.ts',
  ];

  for (const rel of MEASUREMENT_FILES) {
    it(`${rel} does not import the boost catalogue`, () => {
      const path = join(ROOT, rel);
      let src: string;
      try { src = readFileSync(path, 'utf8'); } catch { return; } // file may not exist in every checkout
      expect(src).not.toMatch(/from\s+['"].*cards\/boosts['"]/);
      expect(src).not.toMatch(/gameVitals|BOOST_CARDS|boostedPrq/);
    });
  }

  it('no file under lib/kitchens or lib/mirror reaches for the boosted number', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      let entries: string[];
      try { entries = readdirSync(dir); } catch { return; }
      for (const e of entries) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!p.endsWith('.ts') || p.endsWith('.test.ts')) continue;
        if (/cards\/boosts/.test(readFileSync(p, 'utf8'))) offenders.push(p.slice(ROOT.length + 1));
      }
    };
    walk(join(ROOT, 'lib', 'kitchens'));
    walk(join(ROOT, 'lib', 'mirror'));
    expect(offenders).toEqual([]);
  });
});

describe('affording a card', () => {
  it('passes when the shards are there', () => {
    expect(purchaseCheck(cardById('neural-max'), 400, [])).toEqual({ ok: true, cost: 400 });
  });

  it('refuses one shard short', () => {
    expect(purchaseCheck(cardById('neural-max'), 399, [])).toEqual({ ok: false, reason: 'insufficient_shards', cost: 400 });
  });

  it('refuses a second copy', () => {
    expect(purchaseCheck(cardById('neural-max'), 9999, ['neural-max']).reason).toBe('already_owned');
  });

  it('refuses an unknown card without pricing it', () => {
    expect(purchaseCheck(cardById('nope'), 9999, [])).toEqual({ ok: false, reason: 'unknown_card', cost: 0 });
  });
});

describe('the bridge to the wallet', () => {
  it('round-trips a card id through its SKU id', () => {
    for (const c of BOOST_CARDS) expect(boostIdFromSku(boostSkuId(c.id))).toBe(c.id);
  });

  it('refuses a SKU that is not ours', () => {
    expect(boostIdFromSku('workout_plan_4w')).toBeNull();
    expect(boostIdFromSku('')).toBeNull();
  });

  it('refuses our own prefix over a card that does not exist', () => {
    // Otherwise a client could invent boost_card_whatever and have it counted as owned.
    expect(boostIdFromSku(BOOST_SKU_PREFIX + 'whatever')).toBeNull();
  });

  it('picks our cards out of a mixed entitlement list and drops the rest', () => {
    expect(ownedFromEntitlements([
      'workout_plan_4w', boostSkuId('neural-max'), 'class_monthly', boostSkuId('bonds-bounce'),
      BOOST_SKU_PREFIX + 'fake',
    ])).toEqual(['neural-max', 'bonds-bounce']);
  });

  it('registers every card in the spend catalog at its own price, in shards, not consumable', () => {
    for (const c of BOOST_CARDS) {
      const sku = getSku(boostSkuId(c.id));
      expect(sku, `${c.id} is not in the catalog`).not.toBeNull();
      expect(sku!.currency).toBe('shards');
      expect(sku!.unitPrice).toBe(c.costShards);
      expect(sku!.consumable).toBe(false);
    }
  });

  it('adds no SKU to the catalog that is not a real card', () => {
    const ours = Object.keys(CATALOG).filter((k) => k.startsWith(BOOST_SKU_PREFIX));
    expect(ours).toHaveLength(BOOST_CARDS.length);
    for (const k of ours) expect(boostIdFromSku(k)).not.toBeNull();
  });

  it('keeps shards as the currency — a card is never a cash purchase', () => {
    // schema.prisma: shards are "milestone-earned, NEVER purchasable". A boost that could be bought with money
    // would be a cash-for-PRQ path, which is the thing the whole file is arranged to prevent.
    for (const c of BOOST_CARDS) expect(getSku(boostSkuId(c.id))!.currency).not.toBe('coins');
  });
});
