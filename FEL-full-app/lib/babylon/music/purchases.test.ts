import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// MUSIC-SUITE P2: the loader is mounted for real below (its spend and its owned-kits read), with the app router and the
// shell stood in for, exactly as performSet.test.ts does it — so the test sees what the loader hands the room.
let shellProps: Record<string, unknown> | null = null;
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/games/game-shell', () => ({
  GameShell: (p: Record<string, unknown>) => { shellProps = p; return null; },
}));

import { MusicLoader } from '@/app/play/music/_components/loader';
import {
  CELL_ASSIST_REASON, CELL_ASSIST_SHARDS, CELL_ASSIST_SKU, DEFAULT_KIT, KIT_CACHE_KEY, MUSIC_PURCHASES, MUSIC_SKU_PREFIX,
  SPEND_FAILURE_TEXT, assistSpend, cleanKitCache, confirmCopy, freeKits, initialShop, isKitId, kitForSku, kitSkuId,
  kitSpend, kitSpendReason, kitsAfterRead, kitsFromOwned, musicPurchase, newSpendNonce, ownedReadFromResponse,
  readKitCache, remixKit, remixKitNote, shopReducer, skuForSpend, spendReason, spendResultFromStatus, writeKitCache, kitCacheKey,
  type ReadOwnedKits, type ShardSpend, type ShopAction, type ShopState,
} from './purchases';
import { KIT_META, type KitId } from './SynthKit';
import { CATALOG, getSku } from '../../wallet/catalog';

describe('what the room sells', () => {
  it('lists every kit that costs something', () => {
    const paid = (Object.keys(KIT_META) as KitId[]).filter((k) => KIT_META[k].unlockShards > 0);
    expect(paid.length).toBeGreaterThan(0);
    for (const k of paid) expect(musicPurchase(kitSkuId(k)), k).not.toBeNull();
  });

  it('DOES NOT SELL A FREE KIT', () => {
    // A zero-price SKU means a spend call that takes a lock and writes a ledger row for nothing.
    for (const k of freeKits()) expect(musicPurchase(kitSkuId(k)), k).toBeNull();
    expect(freeKits()).toContain('street');
  });

  it('sells the Cell assist', () => {
    expect(musicPurchase(CELL_ASSIST_SKU)?.shards).toBe(CELL_ASSIST_SHARDS);
  });

  it('round-trips a kit through its SKU and refuses anything else', () => {
    for (const k of Object.keys(KIT_META) as KitId[]) expect(kitForSku(kitSkuId(k))).toBe(k);
    expect(kitForSku('music_kit_nonsense')).toBeNull();
    expect(kitForSku('boost_card_neural-max')).toBeNull();
    expect(kitForSku(CELL_ASSIST_SKU)).toBeNull();
  });
});

describe('the price shown and the price charged', () => {
  it('agree, for every single item', () => {
    // The whole reason this file exists. The room prints KIT_META[k].unlockShards next to the button; the
    // server charges the catalogue. If those two ever diverge the room lies about the price.
    for (const p of MUSIC_PURCHASES) {
      const sku = getSku(p.id);
      expect(sku, `${p.id} is not in the wallet catalogue`).not.toBeNull();
      expect(sku!.unitPrice, p.id).toBe(p.shards);
      expect(sku!.currency, p.id).toBe('shards');
    }
  });

  it('matches what StudioMode puts on screen for the Cell assist', () => {
    const src = readFileSync(join(__dirname, 'StudioMode.tsx'), 'utf8');
    const m = /const CELL_ASSIST_COST = (\d+)/.exec(src);
    expect(m, 'CELL_ASSIST_COST vanished from StudioMode').not.toBeNull();
    expect(Number(m![1])).toBe(CELL_ASSIST_SHARDS);
  });

  it('registers nothing under our prefix that is not ours', () => {
    const ours = Object.keys(CATALOG).filter((k) => k.startsWith(MUSIC_SKU_PREFIX));
    expect(ours.sort()).toEqual(MUSIC_PURCHASES.map((p) => p.id).sort());
  });

  it('charges shards, never coins — these are earned unlocks', () => {
    for (const p of MUSIC_PURCHASES) expect(getSku(p.id)!.currency).not.toBe('coins');
  });

  it('treats a kit as permanent and the assist as consumable', () => {
    for (const p of MUSIC_PURCHASES) {
      const expected = p.id === CELL_ASSIST_SKU;
      expect(getSku(p.id)!.consumable, p.id).toBe(expected);
    }
  });
});

describe('the seam that was never wired', () => {
  it('is wired now — the music route is what the loader calls', () => {
    const loader = readFileSync(join(__dirname, '..', '..', '..', 'app', 'play', 'music', '_components', 'loader.tsx'), 'utf8');
    expect(loader).toMatch(/spendShards/);
    expect(loader).toMatch(/\/api\/music\/unlock/);
  });

  it('refuses a spend it does not recognise instead of waving it through', () => {
    // The old fallback ALLOWED anything when the prop was absent. The replacement must fail closed. (MUSIC-SUITE P2: the
    // answer is typed now — a refusal, not `false` — and it is driven for real in 'the loader, for real' below.)
    const loader = readFileSync(join(__dirname, '..', '..', '..', 'app', 'play', 'music', '_components', 'loader.tsx'), 'utf8');
    expect(loader).toMatch(/if \(!sku\) return SPEND_REFUSED/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MUSIC-SUITE P2 (2026-09-25): ACADEMY ECONOMY HONESTY. P1 (outbox musicsuite/understand-wf_3a55346f-032.json): kits and
// the Cell assist were charged straight from the click (StudioMode.tsx:231-251 then), REMIX bought the track's kit
// (:313-321), every non-2xx read 'Not enough Shards' (loader.tsx:43-46), and owned kits lived in localStorage only
// (:166-169) while GET /api/music/unlock had no caller.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, '..', '..', '..');
/** The code, not the prose: block comments (JSX ones too) and // comments out, so a comment NAMING the old bug never trips a pin. */
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const studioSrc = () => stripComments(readFileSync(join(ROOT, 'lib', 'babylon', 'music', 'StudioMode.tsx'), 'utf8'));
/** The body of `const <name> = ...` up to the next blank line — enough to see what a handler does. */
const handler = (src: string, name: string): string => {
  const i = src.indexOf(`const ${name} = `);
  expect(i, `${name} vanished from StudioMode`).toBeGreaterThan(-1);
  const end = src.indexOf('\n\n', i);
  return src.slice(i, end < 0 ? undefined : end);
};

describe('what an answer from the shop means', () => {
  it('401 is signed out, 402 and the route\'s 409 are not enough shards, a 5xx or no answer never reached the till', () => {
    expect(spendResultFromStatus(200, { ok: true, shards: 1040, sku: 'music_kit_neon' })).toEqual({ ok: true, shards: 1040 });
    expect(spendResultFromStatus(200, null)).toEqual({ ok: true });
    expect(spendResultFromStatus(401, { error: 'unauthorized' })).toEqual({ ok: false, reason: 'signed_out' });
    expect(spendResultFromStatus(402, null)).toEqual({ ok: false, reason: 'insufficient' });
    expect(spendResultFromStatus(409, { error: 'insufficient_shards', shards: 20, cost: 200 })).toEqual({ ok: false, reason: 'insufficient' });
    expect(spendResultFromStatus(409, null)).toEqual({ ok: false, reason: 'insufficient' });   // the route's only 409, body lost
    expect(spendResultFromStatus(409, { error: 'replayed_key' })).toEqual({ ok: false, reason: 'refused' });
    for (const st of [500, 502, 503, 504, 408, 429, 0]) expect(spendResultFromStatus(st, { error: 'internal_error' }), String(st)).toEqual({ ok: false, reason: 'unreachable' });
    for (const st of [400, 403, 404]) expect(spendResultFromStatus(st, { error: 'unknown_item' }), String(st)).toEqual({ ok: false, reason: 'refused' });
  });

  it('says each failure in its own words — and "Not enough Shards" only when that is what happened', () => {
    expect(SPEND_FAILURE_TEXT).toEqual({
      signed_out: 'Sign in to unlock',
      insufficient: 'Not enough Shards',
      // MUSIC-SUITE P2 FIX PASS: a 502/504 or a lost answer can come AFTER the charge committed — never "nothing was charged"
      unreachable: "Couldn't reach the shop — if it went through, you won't be charged twice",
      refused: "The shop doesn't sell that — nothing was charged",
    });
    const said = (st: number) => { const r = spendResultFromStatus(st, null); return r.ok ? 'ok' : SPEND_FAILURE_TEXT[r.reason]; };
    expect([said(401), said(409), said(500)]).toEqual(['Sign in to unlock', 'Not enough Shards', "Couldn't reach the shop — if it went through, you won't be charged twice"]);
    expect(SPEND_FAILURE_TEXT.unreachable).not.toMatch(/nothing was charged/);
  });


  it('the owned read: a good answer lists the kit SKUs; a garbled 200 or any failure is never "you own nothing"', () => {
    expect(ownedReadFromResponse(200, { owned: ['music_kit_neon', 7, null], shards: 300 })).toEqual({ ok: true, owned: ['music_kit_neon'], shards: 300 });
    expect(ownedReadFromResponse(200, { owned: [] })).toEqual({ ok: true, owned: [] });
    expect(ownedReadFromResponse(200, {})).toEqual({ ok: false, reason: 'unreachable' });
    expect(ownedReadFromResponse(200, null)).toEqual({ ok: false, reason: 'unreachable' });
    expect(ownedReadFromResponse(401, null)).toEqual({ ok: false, reason: 'signed_out' });
    expect(ownedReadFromResponse(503, { error: 'unavailable' })).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('names the SKU by the reason alone: a paid kit, the Cell foundation — and nothing else, whatever it costs', () => {
    expect(skuForSpend(kitSpendReason('neon'))).toBe('music_kit_neon');
    expect(skuForSpend(kitSpendReason('dust'))).toBe('music_kit_dust');
    expect(skuForSpend(CELL_ASSIST_REASON)).toBe(CELL_ASSIST_SKU);
    expect(skuForSpend(kitSpendReason('street'))).toBeNull();   // free: there is nothing to buy
    // the old loader took ANY spend of 50 as a Cell assist; the reason now has to say so
    for (const r of ['', 'unlock kit gold', 'market buy art', 'cell foundation ']) expect(skuForSpend(r), r).toBeNull();
    expect(spendReason(kitSpend('neon'))).toBe('unlock kit neon');
    expect(spendReason(assistSpend('n1'))).toBe(CELL_ASSIST_REASON);
  });

  it('a nonce is short, route-safe, and different per buy', () => {
    const a = newSpendNonce(1_758_800_000_000, () => 0.123), b = newSpendNonce(1_758_800_000_000, () => 0.456);
    for (const n of [a, b, newSpendNonce()]) expect(n).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
    expect(a).not.toBe(b);
  });
});

describe('every spend asks first (the inline confirm)', () => {
  it('says what, for how much, and the two ways out: Unlock NEON for 200 Shards?  UNLOCK / CANCEL', () => {
    expect(confirmCopy(kitSpend('neon'))).toEqual({ question: 'Unlock NEON for 200 Shards?', yes: 'UNLOCK', no: 'CANCEL', balance: null });
    expect(confirmCopy(kitSpend('dust'), 1240)).toEqual({ question: 'Unlock DUST for 400 Shards?', yes: 'UNLOCK', no: 'CANCEL', balance: 'You have 1,240.' });
    expect(confirmCopy(assistSpend('n1'), 0)).toEqual({ question: 'Lay a Cell foundation for 50 Shards?', yes: 'BUY', no: 'CANCEL', balance: 'You have 0.' });
    // the price asked is the price charged (the catalogue test above pins KIT_META to the SKU)
    expect(kitSpend('neon').cost).toBe(musicPurchase(kitSkuId('neon'))!.shards);
    expect(assistSpend('n').cost).toBe(musicPurchase(CELL_ASSIST_SKU)!.shards);
  });

  const run = (s: ShopState, ...as: ShopAction[]) => as.reduce(shopReducer, s);
  const fresh = () => initialShop(['street']);

  it('a tap on a locked kit or on CELL only opens the confirm; CANCEL closes it and nothing was bought', () => {
    const neon = kitSpend('neon');
    const asked = run(fresh(), { type: 'ask', spend: neon });
    expect(asked).toMatchObject({ pending: neon, busy: false, error: null, owned: ['street'] });
    expect(run(asked, { type: 'cancel' })).toMatchObject({ pending: null, owned: ['street'], epoch: 0 });
    // an owned kit has nothing to ask
    expect(run(initialShop(['street', 'neon']), { type: 'ask', spend: neon }).pending).toBeNull();
  });

  it('the yes is one purchase: busy until the answer, a second yes / new ask / cancel meanwhile changes nothing', () => {
    const neon = kitSpend('neon');
    const busy = run(fresh(), { type: 'ask', spend: neon }, { type: 'confirm' });
    expect(busy.busy).toBe(true);
    expect(run(busy, { type: 'confirm' })).toBe(busy);
    expect(run(busy, { type: 'ask', spend: kitSpend('dust') })).toBe(busy);
    expect(run(busy, { type: 'cancel' })).toBe(busy);
    const done = run(busy, { type: 'spent', spend: neon, result: { ok: true, shards: 800 } });
    expect(done).toMatchObject({ owned: ['street', 'neon'], pending: null, busy: false, shards: 800, epoch: 1 });
    // an answer for a spend no longer on screen moves nothing
    expect(run(done, { type: 'spent', spend: neon, result: { ok: true } })).toBe(done);
    // a confirm with nothing asked does nothing
    expect(run(fresh(), { type: 'confirm' })).toEqual(fresh());
  });

  it('a failed yes keeps the confirm open with its reason (and the assist\'s nonce, so a retry is the same purchase)', () => {
    const cell = assistSpend('nonce_1');
    for (const reason of ['signed_out', 'insufficient', 'unreachable', 'refused'] as const) {
      const s = run(fresh(), { type: 'ask', spend: cell }, { type: 'confirm' }, { type: 'spent', spend: cell, result: { ok: false, reason } });
      expect(s, reason).toMatchObject({ pending: cell, busy: false, error: reason, owned: ['street'], epoch: 0 });
      // retry: the same pending spend, error cleared while it is out
      expect(run(s, { type: 'confirm' })).toMatchObject({ pending: cell, busy: true, error: null });
    }
    // a bought foundation adds no kit
    const ok = run(fresh(), { type: 'ask', spend: cell }, { type: 'confirm' }, { type: 'spent', spend: cell, result: { ok: true } });
    expect(ok).toMatchObject({ owned: ['street'], pending: null, epoch: 1 });
  });

  it('MUSIC-SUITE P2 FIX PASS: an assist whose answer was lost keeps its nonce past CANCEL — the next CELL is the same purchase', () => {
    const first = assistSpend('lost_1');
    const lost = run(fresh(), { type: 'ask', spend: first }, { type: 'confirm' }, { type: 'spent', spend: first, result: { ok: false, reason: 'unreachable' } });
    expect(lost.unsettledAssistNonce).toBe('lost_1');
    const cancelled = run(lost, { type: 'cancel' });
    expect(cancelled).toMatchObject({ pending: null, unsettledAssistNonce: 'lost_1' });
    // the review's case: CELL again makes a fresh nonce — the reducer puts the outstanding one back
    const again = run(cancelled, { type: 'ask', spend: assistSpend('fresh_2') });
    expect(again.pending).toEqual({ kind: 'assist', cost: CELL_ASSIST_SHARDS, nonce: 'lost_1' });
    // it landed after all: the route replays the original entry (ok) — foundation laid, the nonce settled
    const p = again.pending!;
    const landed = run(again, { type: 'confirm' }, { type: 'spent', spend: p, result: { ok: true, shards: 150 } });
    expect(landed).toMatchObject({ pending: null, unsettledAssistNonce: null, shards: 150 });
    expect(run(landed, { type: 'ask', spend: assistSpend('fresh_3') }).pending).toMatchObject({ nonce: 'fresh_3' });
    // a definite "no" settles it too (a replay that is refused for want of shards never charged the first time)
    const no = run(again, { type: 'confirm' }, { type: 'spent', spend: p, result: { ok: false, reason: 'insufficient' } });
    expect(no.unsettledAssistNonce).toBeNull();
    // a kit's lost answer leaves no assist nonce behind (a kit's key is permanent; refreshOwned repairs it)
    const neon = kitSpend('neon');
    expect(run(fresh(), { type: 'ask', spend: neon }, { type: 'confirm' }, { type: 'spent', spend: neon, result: { ok: false, reason: 'unreachable' } }).unsettledAssistNonce).toBeNull();
  });

  it('the account\'s answer replaces the cache (a refunded kit goes), a failed read keeps it, a stale one is dropped', () => {
    const cached = initialShop(['street', 'neon', 'dust']);
    expect(run(cached, { type: 'read', read: { ok: true, owned: ['music_kit_dust'], shards: 55 }, epoch: 0 }))
      .toMatchObject({ owned: ['street', 'dust'], shards: 55 });
    expect(run(cached, { type: 'read', read: { ok: false, reason: 'unreachable' }, epoch: 0 })).toBe(cached);
    expect(run(cached, { type: 'read', read: { ok: false, reason: 'signed_out' }, epoch: 0 })).toBe(cached);
    // the mount read races a quick NEON buy: sent at epoch 0, answered after the buy (epoch 1) without NEON — dropped
    const neon = kitSpend('neon');
    const bought = run(fresh(), { type: 'ask', spend: neon }, { type: 'confirm' }, { type: 'spent', spend: neon, result: { ok: true } });
    expect(run(bought, { type: 'read', read: { ok: true, owned: [] }, epoch: 0 })).toBe(bought);
    // a confirm for a kit the account turns out to own has nothing left to ask
    const asked = run(fresh(), { type: 'ask', spend: neon });
    expect(run(asked, { type: 'read', read: { ok: true, owned: ['music_kit_neon'] }, epoch: 0 })).toMatchObject({ pending: null, owned: ['street', 'neon'] });
  });
});

describe('the kits the account owns', () => {
  it('the free kit always; a paid kit only by its SKU; nothing else', () => {
    expect(kitsFromOwned([])).toEqual(['street']);
    expect(kitsFromOwned(['music_kit_dust', 'music_kit_neon', 'music_cell_assist', 'music_kit_gold', 42])).toEqual(['street', 'neon', 'dust']);
    expect(isKitId('neon')).toBe(true);
    expect(isKitId('constructor')).toBe(false);
    expect(DEFAULT_KIT).toBe(freeKits()[0]);
  });

  it('the device cache is only a cache: cleaned on read, the server wins when it answers', () => {
    expect(cleanKitCache('["street","neon","gold","__proto__"]')).toEqual(['street', 'neon']);
    expect(cleanKitCache('not json')).toEqual(['street']);
    expect(cleanKitCache(null)).toEqual(['street']);
    expect(cleanKitCache('{"neon":true}')).toEqual(['street']);
    expect(kitsAfterRead(['street', 'neon', 'dust'], { ok: true, owned: [] })).toEqual(['street']);
    expect(kitsAfterRead(['street', 'neon'], { ok: false, reason: 'unreachable' })).toEqual(['street', 'neon']);
  });

  it('reads and writes THIS PLAYER\'s cache, and survives a storage that throws', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
    expect(readKitCache(store, 'u_ana')).toEqual(['street']);
    writeKitCache(store, ['dust', 'street'], 'u_ana');
    expect(mem.get(kitCacheKey('u_ana'))).toBe('["street","dust"]');
    expect(kitCacheKey('u_ana')).toBe(`${KIT_CACHE_KEY}:u_ana`);
    expect(readKitCache(store, 'u_ana')).toEqual(['street', 'dust']);
    const blocked = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
    expect(readKitCache(blocked, 'u_ana')).toEqual(['street']);
    expect(() => writeKitCache(blocked, ['street'], 'u_ana')).not.toThrow();
    expect(readKitCache(null, 'u_ana')).toEqual(['street']);
  });

  // MUSIC-SUITE P3 (2026-09-25), P2's open item: one shared key meant the next player on a shared device saw the last
  // player's kits as owned until the server read landed (and for good if it never did).
  it('A SHARED DEVICE: one player\'s kits never show as another\'s; an unknown player reads no cache', () => {
    const mem = new Map<string, string>([[KIT_CACHE_KEY, '["street","neon","dust"]']]);   // the old shared value
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
    expect(readKitCache(store, 'u_ana')).toEqual(['street']);             // the old shared cache is never adopted
    writeKitCache(store, ['street', 'neon', 'dust'], 'u_ana');
    expect(mem.has(KIT_CACHE_KEY)).toBe(false);                           // and it is dropped on the first keyed write
    expect(readKitCache(store, 'u_ana')).toEqual(['street', 'neon', 'dust']);
    expect(readKitCache(store, 'u_ben')).toEqual(['street']);              // Ben, same device: only the free kit
    expect(readKitCache(store, null)).toEqual(['street']);                 // a room that doesn't know who is playing
    expect(readKitCache(store, '')).toEqual(['street']);
    writeKitCache(store, ['neon'], undefined);                             // …writes nothing
    expect([...mem.keys()]).toEqual([kitCacheKey('u_ana')]);
  });
});

describe('REMIX never buys', () => {
  it('opens on the track\'s kit when you own it, on the default kit when you don\'t — and says so, charging nothing', () => {
    expect(remixKit('neon', ['street', 'neon'])).toEqual({ kit: 'neon', locked: null });
    expect(remixKitNote(remixKit('neon', ['street', 'neon']))).toBeNull();
    const plan = remixKit('dust', ['street', 'neon']);
    expect(plan).toEqual({ kit: 'street', locked: 'dust' });
    expect(remixKitNote(plan)).toBe("This remix opens on STREET: the original uses DUST, which you haven't unlocked (400 Shards in KITS). Nothing was charged.");
    // a record with a kit the room no longer has opens on the default kit, nothing locked to buy
    expect(remixKit('gold', ['street'])).toEqual({ kit: 'street', locked: null });
  });
});

describe('the loader, for real (MUSIC-SUITE P2)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const mount = () => {
    shellProps = null;
    renderToStaticMarkup(createElement(MusicLoader));
    const gp = (shellProps as { gameProps?: Record<string, unknown> } | null)?.gameProps ?? {};
    return { spend: gp.spendShards as ShardSpend, read: gp.readOwnedKits as ReadOwnedKits };
  };
  const answer = (status: number, body: unknown) => vi.fn(async () => new Response(body === undefined ? 'not json' : JSON.stringify(body), { status }));

  it('hands the room a typed spend and the owned-kits read', () => {
    const { spend, read } = mount();
    expect(typeof spend).toBe('function');
    expect(typeof read).toBe('function');
  });

  it('answers each status in its own words — a 401 and a 500 are no longer "Not enough Shards"', async () => {
    const { spend } = mount();
    const cases: [number, unknown, unknown][] = [
      [200, { ok: true, shards: 800, sku: 'music_kit_neon' }, { ok: true, shards: 800 }],
      [401, { error: 'unauthorized' }, { ok: false, reason: 'signed_out' }],
      [409, { error: 'insufficient_shards', shards: 10, cost: 200 }, { ok: false, reason: 'insufficient' }],
      [500, { error: 'internal_error' }, { ok: false, reason: 'unreachable' }],
      [502, undefined, { ok: false, reason: 'unreachable' }],   // a proxy's HTML error page
      [404, { error: 'unknown_item' }, { ok: false, reason: 'refused' }],
    ];
    for (const [status, body, want] of cases) {
      const f = answer(status, body);
      vi.stubGlobal('fetch', f);
      expect(await spend(200, kitSpendReason('neon')), String(status)).toEqual(want);
      const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('/api/music/unlock');
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body)).sku).toBe('music_kit_neon');
    }
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await spend(200, kitSpendReason('neon'))).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('sends the room\'s nonce for a foundation, so a retry is the same purchase; refuses an unknown spend without a request', async () => {
    const { spend } = mount();
    const f = answer(200, { ok: true, shards: 950 });
    vi.stubGlobal('fetch', f);
    await spend(CELL_ASSIST_SHARDS, CELL_ASSIST_REASON, { nonce: 'room_nonce_1' });
    await spend(CELL_ASSIST_SHARDS, CELL_ASSIST_REASON, { nonce: 'room_nonce_1' });
    const bodies = f.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
    expect(bodies).toEqual([{ sku: CELL_ASSIST_SKU, nonce: 'room_nonce_1' }, { sku: CELL_ASSIST_SKU, nonce: 'room_nonce_1' }]);
    f.mockClear();
    expect(await spend(50, 'anything that costs 50')).toEqual({ ok: false, reason: 'refused' });
    expect(f).not.toHaveBeenCalled();
  });

  it('reads the account\'s kits from GET /api/music/unlock, and a failure is a failure, not an empty list', async () => {
    const { read } = mount();
    const f = answer(200, { owned: ['music_kit_dust'], shards: 12 });
    vi.stubGlobal('fetch', f);
    expect(await read()).toEqual({ ok: true, owned: ['music_kit_dust'], shards: 12 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(url).toBe('/api/music/unlock');
    expect(init?.method ?? 'GET').toBe('GET');
    vi.stubGlobal('fetch', answer(503, { error: 'unavailable' }));
    expect(await read()).toEqual({ ok: false, reason: 'unreachable' });
    vi.stubGlobal('fetch', answer(401, { error: 'unauthorized' }));
    expect(await read()).toEqual({ ok: false, reason: 'signed_out' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await read()).toEqual({ ok: false, reason: 'unreachable' });
  });
});

describe('StudioMode wires it (source pins; the room is Web Audio + React and is driven in the browser probe)', () => {
  it('a kit tap and CELL only ask; the confirm\'s yes is the one place a spend happens', () => {
    const src = studioSrc();
    expect(handler(src, 'pickKit')).not.toMatch(/trySpend|spendShards/);
    expect(handler(src, 'pickKit')).toContain("shopDispatch({ type: 'ask', spend: kitSpend(id) })");
    expect(handler(src, 'cellAssist')).not.toMatch(/trySpend|spendShards/);
    expect(handler(src, 'cellAssist')).toContain("shopDispatch({ type: 'ask', spend: assistSpend() })");
    expect(src.match(/await trySpend\(/g)).toHaveLength(1);
    expect(handler(src, 'confirmSpend')).toContain('const result = await trySpend(p);');
    expect(src).toContain('data-qa="shop-confirm"');
    expect(src).toContain('onClick={() => void confirmSpend()}');
    expect(src).not.toMatch(/window\.confirm|(?<![\w.])confirm\s*\(/);
  });

  it('REMIX goes nowhere near the shop', () => {
    const remix = handler(studioSrc(), 'startRemix');
    expect(remix).not.toMatch(/pickKit|trySpend|spendShards|shopDispatch/);
    expect(remix).toContain('const plan = remixKit(r.kit, shop.owned);');
  });

  it('every failure is shown in its own words; "Not enough Shards" is never hard-coded; no shop wired sells nothing', () => {
    const src = studioSrc();
    expect(src).toContain('{SPEND_FAILURE_TEXT[shop.error]}');
    expect(src).not.toContain("'Not enough Shards'");
    expect(src).not.toMatch(/allowing "\$\{reason\}"/);
    expect(handler(src, 'trySpend')).toContain('if (!spendShards) return SPEND_REFUSED;');
  });

  it('owned kits come from the account at mount; localStorage is read only through the cleaned cache', () => {
    const src = studioSrc();
    expect(src).toContain('useEffect(() => { refreshOwned(); }, [refreshOwned]);');
    expect(src).toContain('initialShop(readKitCache(kitStorage(), playerId))');   // MUSIC-SUITE P3: this player's cache
    expect(src).toContain('writeKitCache(kitStorage(), shop.owned, playerId)');
    expect(src).not.toContain("localStorage.getItem('fel_studio_kits_v1')");
    expect(src).not.toContain("localStorage.setItem('fel_studio_kits_v1'");
  });

  it('both loaders hand the room the read beside the spend', () => {
    for (const f of ['app/play/music/_components/loader.tsx', 'app/dev/music/loader.tsx']) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).toMatch(/readOwnedKits/);
    }
  });
});
