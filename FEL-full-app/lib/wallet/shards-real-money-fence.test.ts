// SHARDS-FENCE (2026-10-13): Shards can NEVER be bought with real money while VIRTUAL_PURCHASES_ENABLED is off.
// Earned Shards still spend (lib/wallet/catalog.ts); this file is only about the real-money door. Three locks:
//   (1) every shard pack, every "off" spelling, a live-looking key: 409 store_closed virtual_purchases_off, and ZERO
//       Stripe, DB or body reads — nothing is created that a later fulfilment could mint from;
//   (2) the flag reader treats anything but 1/true/on/yes as OFF;
//   (3) source: every app/ route that opens a Stripe session for SHARD_PACK checks the flag BEFORE the Stripe call.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ stripeCalls: 0, dbCalls: 0, bodyReads: 0 }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'user-shards-1' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, { get: (_t, p) => (p === 'then' || typeof p === 'symbol' ? undefined : new Proxy({}, { get: () => async () => { h.dbCalls++; return null; } })) }),
}));
vi.mock('@/lib/stripe', () => ({ getStripe: () => { h.stripeCalls++; throw new Error('Stripe must not be reached while the fence is off'); } }));

import { POST as shardCheckout } from '@/app/api/v1/wallet/shard-checkout/route';
import { purchasesEnabledFromEnv } from '@/lib/wallet/purchases';
import { SHARD_PACKS } from '@/lib/shard-packs';

const KEYS = ['STRIPE_SECRET_KEY', 'VIRTUAL_PURCHASES_ENABLED', 'NEXTAUTH_URL'] as const;
const saved: Record<string, string | undefined> = {};
const OFF: (string | undefined)[] = [undefined, '', ' ', '0', 'false', 'off', 'no', 'FALSE', 'disabled'];

function req(packId: string) {
  return { json: async () => { h.bodyReads++; return { pack_id: packId }; }, headers: new Headers({ origin: 'https://fel.test' }) } as never;
}

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  process.env.STRIPE_SECRET_KEY = 'sk_live_fence_test_not_real';
  process.env.NEXTAUTH_URL = 'https://fel.test';
  h.stripeCalls = 0; h.dbCalls = 0; h.bodyReads = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.restoreAllMocks();
});

describe('Shards cannot be bought with real money while VIRTUAL_PURCHASES_ENABLED is off', () => {
  it('(1) every shard pack x every off value: 409 virtual_purchases_off, no Stripe, no DB, no body read', async () => {
    expect(SHARD_PACKS.length).toBeGreaterThan(0);
    for (const v of OFF) {
      if (v === undefined) delete process.env.VIRTUAL_PURCHASES_ENABLED; else process.env.VIRTUAL_PURCHASES_ENABLED = v;
      for (const pack of SHARD_PACKS) {
        const res = await shardCheckout(req(pack.id));
        expect(res.status, `${pack.id} with ${JSON.stringify(v)}`).toBe(409);
        expect(await res.json()).toMatchObject({ error: 'store_closed', reason: 'virtual_purchases_off' });
      }
    }
    expect(h.stripeCalls).toBe(0);
    expect(h.dbCalls).toBe(0);
    expect(h.bodyReads).toBe(0);
  });

  it('(1b) control: with the flag ON the same request gets past the fence (so the test above is not vacuous)', async () => {
    process.env.VIRTUAL_PURCHASES_ENABLED = '1';
    await shardCheckout(req(SHARD_PACKS[0].id)).catch(() => null);
    expect(h.bodyReads).toBe(1);
  });

  it('(2) the flag reader: only 1/true/on/yes open it, and never without a key', () => {
    for (const v of OFF) expect(purchasesEnabledFromEnv({ STRIPE_SECRET_KEY: 'sk_test_x', VIRTUAL_PURCHASES_ENABLED: v }), String(v)).toBe(false);
    for (const v of ['1', 'true', 'ON', ' yes ']) expect(purchasesEnabledFromEnv({ STRIPE_SECRET_KEY: 'sk_test_x', VIRTUAL_PURCHASES_ENABLED: v })).toBe(true);
    expect(purchasesEnabledFromEnv({ VIRTUAL_PURCHASES_ENABLED: '1' })).toBe(false);
  });

  it('(3) source: every app/ route that opens a SHARD_PACK Stripe session checks the flag before Stripe', () => {
    const ROOT = join(__dirname, '../..');
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
    });
    const sellers = walk(join(ROOT, 'app')).filter((f) => {
      const s = readFileSync(f, 'utf8');
      return /['"]SHARD_PACK['"]/.test(s) && /checkout\.sessions\.create\s*\(/.test(s);
    });
    expect(sellers.map((f) => relative(ROOT, f))).toContain('app/api/v1/wallet/shard-checkout/route.ts');
    for (const f of sellers) {
      const s = readFileSync(f, 'utf8');
      const gate = s.search(/purchasesEnabledFromEnv\(\)|isVirtualPurchasesEnabled\(\)/);
      const stripe = s.search(/getStripe\(\)|checkout\.sessions\.create\s*\(/);
      expect(gate, `${relative(ROOT, f)} never reads the flag`).toBeGreaterThan(-1);
      expect(gate, `${relative(ROOT, f)} reaches Stripe before the flag`).toBeLessThan(stripe);
    }
  });
});
