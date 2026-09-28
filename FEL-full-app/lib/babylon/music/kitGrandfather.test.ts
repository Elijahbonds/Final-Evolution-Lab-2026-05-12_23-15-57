// MUSIC-SUITE P6 (2026-09-25), owner decision #23: a kit the Music Room gave away before 2026-09-20 is kept — a one-time
// server grant. This file pins the pure rules (the device's claim, the server's decision) and the loader's call. The
// grant written for real, on the real routes and the real dead-buy sweep, is lib/wallet/dead-buy-refunds.test.ts; the
// ledger rules (backed, never swept) are lib/wallet/dead-buys.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let shellProps: Record<string, unknown> | null = null;
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/games/game-shell', () => ({
  GameShell: (p: Record<string, unknown>) => { shellProps = p; return null; },
}));

import { MusicLoader } from '@/app/play/music/_components/loader';
import {
  ACCOUNT_CLOCK_SLACK_MS, FREE_WINDOW_KITS, KIT_GRANDFATHER_CUTOFF_MS, LIBRARY_INDEX_KEY, LIBRARY_LEGACY_KEY, MAX_GRANDFATHER_RECORDS,
  claimGrandfatherKits, decideGrandfather, grandfatherAnswerDefinite, grandfatherClaim, grandfatherMarkKey, grandfatherNote,
  grandfatherSku, parseGrandfatherClaim, settleGrandfatherClaim, type GrandfatherRecord,
} from './kitGrandfather';
import { KIT_CACHE_KEY, kitCacheKey, readKitCache, writeKitCache, type ReadOwnedKits } from './purchases';
import { KEY_INDEX, KEY_LEGACY_TRACKS } from './StudioLibrary';
import { KIT_META, type KitId } from './SynthKit';

const DAY = 86_400_000;
const CUT = KIT_GRANDFATHER_CUTOFF_MS;
const SEP_1 = Date.parse('2026-09-01T12:00:00-07:00');
const AUG_1 = Date.parse('2026-08-01T12:00:00-07:00');

type Mem = Map<string, string>;
const storeOf = (mem: Mem) => ({
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
});
const song = (kit: string, createdAt: unknown, id = `trk_${String(createdAt)}_${kit}`) => ({ id, title: 'x', authorId: 'me', authorName: 'You', kit, createdAt });

describe('the constants', () => {
  it('the cutoff is the start of 2026-09-20 on the owner\'s clock (PDT), and the free window is NEON and DUST, frozen', () => {
    expect(new Date(CUT).toISOString()).toBe('2026-09-20T07:00:00.000Z');
    expect([...FREE_WINDOW_KITS]).toEqual(['neon', 'dust']);
    expect(Object.isFrozen(FREE_WINDOW_KITS)).toBe(true);
    // the two kits that cost something (SynthKit.ts; unchanged since 4b766804^) — STREET never cost a shard
    expect((Object.keys(KIT_META) as KitId[]).filter((k) => KIT_META[k].unlockShards > 0)).toEqual(['neon', 'dust']);
  });

  it('reads the exact keys the room and the library write', () => {
    expect(KIT_CACHE_KEY).toBe('fel_studio_kits_v1');   // the pre-4b766804 room's only record (StudioMode.tsx at 4b766804^:119/190)
    expect(LIBRARY_INDEX_KEY).toBe(KEY_INDEX);
    expect(LIBRARY_LEGACY_KEY).toBe(KEY_LEGACY_TRACKS);
  });

  it('the grant is the kit\'s own shop SKU, with a note that names it', () => {
    expect(grandfatherSku('neon')).toBe('music_kit_neon');
    expect(grandfatherNote('dust')).toMatch(/^DUST kit is yours to keep: you unlocked it before Sep 20, 2026/);
  });
});

describe("the device's claim (client)", () => {
  it('the old kit list: its window kits, undated; STREET and junk ignored', () => {
    const mem: Mem = new Map([[KIT_CACHE_KEY, '["street","neon","dust","gold"]']]);
    expect(grandfatherClaim(storeOf(mem), 'u_ana')).toEqual([
      { kit: 'neon', at: null, from: 'kit_list' },
      { kit: 'dust', at: null, from: 'kit_list' },
    ]);
  });

  it("a song published on a window kit before the cutoff, from either library key: the earliest per kit", () => {
    const mem: Mem = new Map([
      [LIBRARY_INDEX_KEY, JSON.stringify({ v: 2, tracks: [song('neon', SEP_1), song('neon', AUG_1), song('street', AUG_1), song('dust', CUT)] })],
      [LIBRARY_LEGACY_KEY, JSON.stringify([song('dust', CUT - 1), song('neon', 0), song('neon', 'yesterday')])],
    ]);
    expect(grandfatherClaim(storeOf(mem), 'u_ana')).toEqual([
      { kit: 'neon', at: AUG_1, from: 'library' },
      { kit: 'dust', at: CUT - 1, from: 'library' },   // a millisecond before the cutoff counts; AT the cutoff never does
    ]);
  });

  it('nothing to claim, a settled claim, an unknown player or a refusing store: no claim at all', () => {
    const empty: Mem = new Map([[KIT_CACHE_KEY, '["street"]'], [LIBRARY_INDEX_KEY, JSON.stringify({ v: 2, tracks: [song('neon', CUT + DAY)] })]]);
    expect(grandfatherClaim(storeOf(empty), 'u_ana')).toBeNull();
    const had: Mem = new Map([[KIT_CACHE_KEY, '["neon"]'], [grandfatherMarkKey('u_ana'), '{"v":1,"status":200}']]);
    expect(grandfatherClaim(storeOf(had), 'u_ana')).toBeNull();
    expect(grandfatherClaim(storeOf(had), 'u_ben')).toEqual([{ kit: 'neon', at: null, from: 'kit_list' }]);   // settled per player
    expect(grandfatherClaim(storeOf(had), null)).toBeNull();
    expect(grandfatherClaim(storeOf(had), '')).toBeNull();
    expect(grandfatherClaim(null, 'u_ana')).toBeNull();
    const blocked = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
    expect(grandfatherClaim(blocked, 'u_ana')).toBeNull();
    const junk: Mem = new Map([[KIT_CACHE_KEY, 'not json'], [LIBRARY_INDEX_KEY, '{"v":2}'], [LIBRARY_LEGACY_KEY, '{}']]);
    expect(grandfatherClaim(storeOf(junk), 'u_ana')).toBeNull();
  });

  it('P6: the room\'s keyed cache write no longer deletes the old list before it can be claimed', () => {
    const mem: Mem = new Map([[KIT_CACHE_KEY, '["street","neon"]']]);
    writeKitCache(storeOf(mem), ['street'], 'u_ana');                          // the room's mount write (StudioMode.tsx:770)
    expect(readKitCache(storeOf(mem), 'u_ana')).toEqual(['street']);          // still never adopted as a cache
    expect(grandfatherClaim(storeOf(mem), 'u_ana')).toEqual([{ kit: 'neon', at: null, from: 'kit_list' }]);
  });
});

describe('settling the answer (client)', () => {
  it('a definite answer marks the claim settled for this player; a sign-in, timeout, throttle or fault is retried', () => {
    for (const s of [200, 400, 404, 409]) expect(grandfatherAnswerDefinite(s), String(s)).toBe(true);
    for (const s of [0, 401, 408, 429, 500, 503, 504]) expect(grandfatherAnswerDefinite(s), String(s)).toBe(false);
    const mem: Mem = new Map([[KIT_CACHE_KEY, '["neon"]']]);
    expect(settleGrandfatherClaim(storeOf(mem), 'u_ana', 503, { error: 'unavailable' })).toBe(false);
    expect(mem.has(grandfatherMarkKey('u_ana'))).toBe(false);
    expect(settleGrandfatherClaim(storeOf(mem), 'u_ana', 401, null)).toBe(false);
    expect(mem.has(grandfatherMarkKey('u_ana'))).toBe(false);
  });

  it('an ELIGIBLE account has had the old list honoured: it goes; an account made since leaves it for an older one', () => {
    const mem: Mem = new Map([[KIT_CACHE_KEY, '["neon"]']]);
    expect(settleGrandfatherClaim(storeOf(mem), 'u_new', 200, { eligible: false, granted: [], owned: [], refused: [{ kit: 'neon', why: 'account_after_cutoff' }] })).toBe(true);
    expect(mem.get(KIT_CACHE_KEY)).toBe('["neon"]');
    expect(mem.has(grandfatherMarkKey('u_new'))).toBe(true);
    expect(settleGrandfatherClaim(storeOf(mem), 'u_old', 200, { eligible: true, granted: ['music_kit_neon'], owned: [], refused: [] })).toBe(true);
    expect(mem.has(KIT_CACHE_KEY)).toBe(false);
    expect(settleGrandfatherClaim(storeOf(mem), 'u_x', 400, { error: 'invalid_claim' })).toBe(true);   // resending the same can't help
  });
});

describe('the server\'s parse (the body is the client\'s)', () => {
  it('keeps well-formed records, drops the rest, needs a date on a library record, and reads at most the cap', () => {
    expect(parseGrandfatherClaim(null)).toBeNull();
    expect(parseGrandfatherClaim({})).toBeNull();
    expect(parseGrandfatherClaim({ records: 'neon' })).toBeNull();
    expect(parseGrandfatherClaim({ records: [] })).toEqual([]);
    expect(parseGrandfatherClaim({
      records: [
        { kit: 'neon', at: null, from: 'kit_list' },
        { kit: 'dust', at: SEP_1 + 0.6, from: 'library' },
        { kit: 'dust', at: null, from: 'library' },          // an undated song proves nothing
        { kit: 'gold', at: SEP_1, from: 'library' },         // no such kit
        { kit: 'neon', at: 'Sep 1', from: 'library' },
        { kit: 'neon', at: SEP_1, from: 'server' },           // no such source
        { kit: 'street', at: null, from: 'kit_list' },        // parsed; refused by the decision (not in the window)
        null, 7,
      ],
    })).toEqual([
      { kit: 'neon', at: null, from: 'kit_list' },
      { kit: 'dust', at: SEP_1, from: 'library' },
      { kit: 'street', at: null, from: 'kit_list' },
    ]);
    const flood = Array.from({ length: 50 }, () => ({ kit: 'neon', at: null, from: 'kit_list' }));
    expect(parseGrandfatherClaim({ records: flood })).toHaveLength(MAX_GRANDFATHER_RECORDS);
  });
});

describe("the server's decision", () => {
  const OLD_ACCOUNT = new Date('2026-08-15T00:00:00Z');
  const list = (kit: KitId): GrandfatherRecord => ({ kit, at: null, from: 'kit_list' });
  const lib = (kit: KitId, at: number): GrandfatherRecord => ({ kit, at, from: 'library' });

  it('an account made before the cutoff with a window kit it does not own: granted, on its record', () => {
    const d = decideGrandfather([list('neon'), lib('dust', SEP_1)], OLD_ACCOUNT, []);
    expect(d).toEqual({
      eligible: true,
      grant: [{ kit: 'neon', record: list('neon') }, { kit: 'dust', record: lib('dust', SEP_1) }],
      owned: [], refused: [],
    });
  });

  it('RULE 1: an account made on or after the cutoff gets nothing, whatever the device says', () => {
    for (const made of [CUT, CUT + DAY, Date.parse('2026-09-26T10:00:00Z')]) {
      const d = decideGrandfather([list('neon'), lib('dust', SEP_1)], made, []);
      expect(d.eligible).toBe(false);
      expect(d.grant).toEqual([]);
      expect(d.refused).toEqual([{ kit: 'neon', why: 'account_after_cutoff' }, { kit: 'dust', why: 'account_after_cutoff' }]);
    }
    expect(decideGrandfather([list('neon')], Number.NaN, []).eligible).toBe(false);
  });

  it('RULE 2: never a kit that was not in the free window', () => {
    expect(decideGrandfather([list('street')], OLD_ACCOUNT, []).refused).toEqual([{ kit: 'street', why: 'not_in_free_window' }]);
  });

  it('RULE 3: never on a record dated on or after the cutoff, or before the account existed (a day of clock slack)', () => {
    expect(decideGrandfather([lib('neon', CUT)], OLD_ACCOUNT, []).refused).toEqual([{ kit: 'neon', why: 'dated_after_cutoff' }]);
    expect(decideGrandfather([lib('neon', CUT + 5 * DAY)], OLD_ACCOUNT, []).refused).toEqual([{ kit: 'neon', why: 'dated_after_cutoff' }]);
    expect(decideGrandfather([lib('neon', AUG_1)], OLD_ACCOUNT, []).refused).toEqual([{ kit: 'neon', why: 'dated_before_account' }]);
    const edge = OLD_ACCOUNT.getTime() - ACCOUNT_CLOCK_SLACK_MS;
    expect(decideGrandfather([lib('neon', edge)], OLD_ACCOUNT, []).grant).toHaveLength(1);
    expect(decideGrandfather([lib('neon', edge - 1)], OLD_ACCOUNT, []).grant).toHaveLength(0);
    // a kit with a bad record AND a good one is granted on the good one
    expect(decideGrandfather([lib('neon', CUT + DAY), list('neon')], OLD_ACCOUNT, []).grant).toEqual([{ kit: 'neon', record: list('neon') }]);
  });

  it('RULE 4: a kit the account already owns (a charge, or an earlier grant) is not granted again', () => {
    const d = decideGrandfather([list('neon'), list('dust')], OLD_ACCOUNT, ['street', 'neon']);
    expect(d.owned).toEqual(['neon']);
    expect(d.grant.map((g) => g.kit)).toEqual(['dust']);
  });
});

describe('the loader sends the claim before the owned-kits read (MUSIC-SUITE P6)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const mount = (playerId: string | null) => {
    shellProps = null;
    renderToStaticMarkup(createElement(MusicLoader, { playerId }));
    return ((shellProps as { gameProps?: Record<string, unknown> } | null)?.gameProps ?? {}).readOwnedKits as ReadOwnedKits;
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('POST /api/music/grandfather first, then GET /api/music/unlock — which already lists the granted kit — and only once', async () => {
    const mem: Mem = new Map([[KIT_CACHE_KEY, '["street","neon"]']]);
    vi.stubGlobal('localStorage', storeOf(mem));
    const f = vi.fn(async (url: string, init?: RequestInit) => (url === '/api/music/grandfather'
      ? json(200, { eligible: true, granted: ['music_kit_neon'], owned: [], refused: [] })
      : json(200, { owned: ['music_kit_neon'], shards: 40 })));
    vi.stubGlobal('fetch', f);
    const read = mount('u_ana');
    expect(await read()).toEqual({ ok: true, owned: ['music_kit_neon'], shards: 40 });
    const calls = f.mock.calls.map(([url, init]) => [url, (init as RequestInit | undefined)?.method ?? 'GET']);
    expect(calls).toEqual([['/api/music/grandfather', 'POST'], ['/api/music/unlock', 'GET']]);
    expect(JSON.parse(String((f.mock.calls[0][1] as RequestInit).body))).toEqual({ records: [{ kit: 'neon', at: null, from: 'kit_list' }] });
    expect(mem.has(KIT_CACHE_KEY)).toBe(false);                  // honoured, so gone
    expect(mem.has(grandfatherMarkKey('u_ana'))).toBe(true);
    f.mockClear();
    await read();                                                // the next read (a REPLAY remount, a later visit)
    expect(f.mock.calls.map(([url]) => url)).toEqual(['/api/music/unlock']);
  });

  it('nothing to claim, or no known player: straight to the read, as before', async () => {
    vi.stubGlobal('localStorage', storeOf(new Map([[kitCacheKey('u_ana'), '["street"]']])));
    const f = vi.fn(async () => json(200, { owned: [], shards: 0 }));
    vi.stubGlobal('fetch', f);
    await mount('u_ana')();
    await mount(null)();
    expect(f.mock.calls.map(([url]) => url)).toEqual(['/api/music/unlock', '/api/music/unlock']);
  });

  it('a claim that fails is tried again next time and never takes the read down with it', async () => {
    const mem: Mem = new Map([[KIT_CACHE_KEY, '["dust"]']]);
    vi.stubGlobal('localStorage', storeOf(mem));
    const f = vi.fn(async (url: string) => {
      if (url === '/api/music/grandfather') throw new TypeError('Failed to fetch');
      return json(200, { owned: [], shards: 5 });
    });
    vi.stubGlobal('fetch', f);
    expect(await mount('u_ana')()).toEqual({ ok: true, owned: [], shards: 5 });
    expect(mem.get(KIT_CACHE_KEY)).toBe('["dust"]');
    expect(mem.has(grandfatherMarkKey('u_ana'))).toBe(false);
    expect(await claimGrandfatherKits(storeOf(mem), 'u_ana', async () => json(503, { error: 'unavailable' }))).toBe('retry');
    expect(await claimGrandfatherKits(storeOf(mem), 'u_ana', async () => json(200, { eligible: true, granted: ['music_kit_dust'] }))).toBe('settled');
    expect(await claimGrandfatherKits(storeOf(mem), 'u_ana', async () => { throw new Error('never sent'); })).toBe('none');
  });
});
