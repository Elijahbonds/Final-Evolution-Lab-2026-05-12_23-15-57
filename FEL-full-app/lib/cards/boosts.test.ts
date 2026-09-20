import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOOST_CARDS, BOOST_PRQ_CAP, BOOST_SKU_PREFIX, boostIdFromSku, boostSkuId, cardById, gameVitals,
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

describe('the game-side number', () => {
  it('is the measured number when nothing is owned', () => {
    expect(gameVitals(60, [])).toEqual({ base: 60, boosted: 60, lift: 0 });
  });

  it('lifts by the owned card', () => {
    const v = gameVitals(50, ['neural-max']); // +8
    expect(v.base).toBe(50);
    expect(v.boosted).toBe(58);
    expect(v.lift).toBe(8);
  });

  it('caps the lift however many cards are owned', () => {
    const all = BOOST_CARDS.map((c) => c.id);
    const raw = BOOST_CARDS.reduce((s, c) => s + c.boost.prq, 0);
    expect(raw).toBeGreaterThan(BOOST_PRQ_CAP); // the cap has to actually bite
    expect(gameVitals(50, all).lift).toBe(BOOST_PRQ_CAP);
  });

  it('ignores an id that is not a card, so a made-up one cannot become points', () => {
    expect(gameVitals(50, ['not-a-card', 'neither-is-this']).lift).toBe(0);
  });

  it('does not pay twice for the same card listed twice', () => {
    expect(gameVitals(50, ['neural-max', 'neural-max']).lift).toBe(8);
  });

  it('never leaves 0–100 at either end', () => {
    expect(gameVitals(98, ['coach-v-elite']).boosted).toBe(100);
    expect(gameVitals(-40, []).base).toBe(0);
    expect(gameVitals(500, []).boosted).toBe(100);
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

  it('is what a boosted athlete still measures at', () => {
    const v = gameVitals(60, ['coach-v-elite']);
    expect(v.boosted).toBe(75);
    expect(measuredPrq(v.base)).toBe(60); // the meal Rx sees 60, the fight sees 75
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
