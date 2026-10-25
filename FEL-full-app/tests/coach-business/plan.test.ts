// COACH-BUSINESS: Coach Free and Coach Pro (owner, 2026-10-25). Price and Free limit are settings, not code.
import { describe, expect, it } from 'vitest';
import {
  FREE_CLIENT_LIMIT_DEFAULT, coachFreeClientLimit, coachProPriceCents, isCoachConnectPaymentsEnabled, isCoachMarketplaceEnabled, isCoachProEnabled,
} from '@/lib/coach-business/config';
import { clientLimitGate, featureGate, planFor, proPaywall, PRO_FEATURES } from '@/lib/coach-business/plan';
import { coachFeatureRefusal, coachRosterRefusal, readCoachPlan, type PlanDb } from '@/lib/coach-business/planServer';

const env = (o: Record<string, string> = {}) => ({ ...o }) as unknown as NodeJS.ProcessEnv;

function planDb(subs: { product: string; status: string }[], active = 0, opts: { throwSubs?: boolean } = {}) {
  const reads = { subs: 0, count: 0 };
  const db: PlanDb = {
    subscription: { findMany: async () => { reads.subs += 1; if (opts.throwSubs) throw new Error('down'); return subs; } },
    coachClient: { count: async () => { reads.count += 1; return active; } },
  };
  return { db, reads };
}

describe('the settings', () => {
  it('every switch is OFF by default', () => {
    expect(isCoachConnectPaymentsEnabled(env())).toBe(false);
    expect(isCoachProEnabled(env())).toBe(false);
    expect(isCoachMarketplaceEnabled(env())).toBe(false);
  });

  it('the Pro price has NO default: unset or nonsense is null (nothing is sold at a price the repo invented)', () => {
    expect(coachProPriceCents(env())).toBeNull();
    expect(coachProPriceCents(env({ COACH_PRO_PRICE_USD_CENTS: '' }))).toBeNull();
    expect(coachProPriceCents(env({ COACH_PRO_PRICE_USD_CENTS: '19.99' }))).toBeNull();
    expect(coachProPriceCents(env({ COACH_PRO_PRICE_USD_CENTS: '-100' }))).toBeNull();
    expect(coachProPriceCents(env({ COACH_PRO_PRICE_USD_CENTS: '50' }))).toBeNull();
    expect(coachProPriceCents(env({ COACH_PRO_PRICE_USD_CENTS: '2900' }))).toBe(2900);
  });

  it('the Free client limit is a setting: default 3, any whole number 0–1000', () => {
    expect(FREE_CLIENT_LIMIT_DEFAULT).toBe(3);
    expect(coachFreeClientLimit(env())).toBe(3);
    expect(coachFreeClientLimit(env({ COACH_FREE_CLIENT_LIMIT: '5' }))).toBe(5);
    expect(coachFreeClientLimit(env({ COACH_FREE_CLIENT_LIMIT: '0' }))).toBe(0);
    expect(coachFreeClientLimit(env({ COACH_FREE_CLIENT_LIMIT: 'lots' }))).toBe(3);
    expect(coachFreeClientLimit(env({ COACH_FREE_CLIENT_LIMIT: '100000' }))).toBe(3);
  });
});

describe('Free versus Pro', () => {
  it('Pro is an ACTIVE FEL_COACH or FEL_FACILITY subscription, or the coach-store allowlist', () => {
    expect(planFor({ subscriptions: [], allowlisted: false })).toBe('free');
    expect(planFor({ subscriptions: [{ product: 'FEL_PRO', status: 'ACTIVE' }], allowlisted: false })).toBe('free');
    expect(planFor({ subscriptions: [{ product: 'FEL_COACH', status: 'PAST_DUE' }], allowlisted: false })).toBe('free');
    expect(planFor({ subscriptions: [{ product: 'FEL_COACH', status: 'ACTIVE' }], allowlisted: false })).toBe('pro');
    expect(planFor({ subscriptions: [{ product: 'FEL_FACILITY', status: 'ACTIVE' }], allowlisted: false })).toBe('pro');
    expect(planFor({ subscriptions: [], allowlisted: true })).toBe('pro');
  });

  it('with the gates ON, Free is refused every Pro feature and Pro is not', () => {
    expect(PRO_FEATURES).toEqual(['unlimited_clients', 'ai_drafts', 'live_sessions', 'payments']);
    for (const f of PRO_FEATURES) {
      expect(featureGate('free', f, true)).toEqual({ ok: false, feature: f });
      expect(featureGate('pro', f, true)).toEqual({ ok: true });
    }
  });

  it('with the gates OFF (the default), nobody is refused anything', () => {
    for (const f of PRO_FEATURES) expect(featureGate('free', f, false)).toEqual({ ok: true });
    expect(clientLimitGate('free', 999, 3, false).ok).toBe(true);
  });

  it('a Free coach keeps exactly the limit; Pro has no limit', () => {
    expect(clientLimitGate('free', 2, 3, true).ok).toBe(true);
    expect(clientLimitGate('free', 3, 3, true)).toEqual({ ok: false, feature: 'unlimited_clients', limit: 3 });
    expect(clientLimitGate('free', 0, 0, true).ok).toBe(false);
    expect(clientLimitGate('pro', 10_000, 3, true)).toEqual({ ok: true, limit: null });
  });

  it('the paywall says what Free still includes', () => {
    const p = proPaywall('ai_drafts');
    expect(p.error).toBe('coach_pro_required');
    expect(p.free).toMatch(/stay free/);
    expect(p.upgrade).toBe('/coach/business#pro');
  });
});

describe('the server gates', () => {
  it('gates OFF: no read at all, nothing refused', async () => {
    const { db, reads } = planDb([], 50);
    expect(await coachFeatureRefusal(db, 'u1', 'ai_drafts', env())).toBeNull();
    expect(await coachRosterRefusal(db, 'u1', env())).toBeNull();
    expect(reads).toEqual({ subs: 0, count: 0 });
  });

  it('gates ON: a Free coach gets 402 for AI drafts; a Pro coach does not', async () => {
    const on = env({ COACH_PRO_ENABLED: '1' });
    const free = await coachFeatureRefusal(planDb([]).db, 'u1', 'ai_drafts', on);
    expect(free?.status).toBe(402);
    expect((await free!.json()).feature).toBe('ai_drafts');
    expect(await coachFeatureRefusal(planDb([{ product: 'FEL_COACH', status: 'ACTIVE' }]).db, 'u1', 'ai_drafts', on)).toBeNull();
  });

  it('gates ON: the client joining a full Free roster is told only that the coach is not taking clients', async () => {
    const on = env({ COACH_PRO_ENABLED: '1', COACH_FREE_CLIENT_LIMIT: '2' });
    expect(await coachRosterRefusal(planDb([], 1).db, 'c1', on)).toBeNull();
    const full = await coachRosterRefusal(planDb([], 2).db, 'c1', on);
    expect(full?.status).toBe(409);
    const body = await full!.json();
    expect(body.error).toBe('coach_roster_full');
    expect(JSON.stringify(body)).not.toMatch(/pro|plan|billing|subscri/i);
    expect(await coachRosterRefusal(planDb([{ product: 'FEL_FACILITY', status: 'ACTIVE' }], 500).db, 'c1', on)).toBeNull();
  });

  it('a failed plan read does not lock a coach out (it answers Pro, logged)', async () => {
    expect(await readCoachPlan(planDb([], 0, { throwSubs: true }).db, 'u1', env({ COACH_PRO_ENABLED: '1' }))).toBe('pro');
  });

  it('the coach-store allowlist is Pro without a read', async () => {
    const { db, reads } = planDb([]);
    expect(await readCoachPlan(db, 'owner-1', env({ COACH_STORE_COACH_USER_IDS: 'owner-1' }))).toBe('pro');
    expect(reads.subs).toBe(0);
  });
});
