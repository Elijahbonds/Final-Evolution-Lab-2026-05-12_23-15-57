// Owner decision 2026-09-24: refund every purchase that delivered nothing, automatically, on the next wallet read.
//
// GET /api/v1/wallet, readWallet(), the sweep and the credit writers (applyDelta, applyLc) run for real here. The
// database is an in-memory stand-in that behaves like Postgres where it matters: a transaction's writes land only when
// it commits, the ledger's idempotency key is unique across every writer (a second instance's committed row
// included), and after a unique violation the transaction is aborted, so every later statement in it fails and
// nothing it did survives. Only the session and the house book (postLc) are stubbed. Nothing here needs a database.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/public/_prisma/client';

interface WalletRow { id: string; playerId: string; coins: bigint; shards: bigint; lc: bigint; version: bigint; updatedAt: Date }
interface EntryRow {
  id: string; walletId: string; currency: string; delta: bigint; balanceAfter: bigint; reasonCode: string; source: string;
  idempotencyKey: string; metadata: Record<string, unknown> | null; createdAt: Date;
}
interface Store {
  wallets: WalletRow[];
  entries: EntryRow[];
  owned: { userId: string; itemId: string; acquiredAt: Date }[];
  bookings: { userId: string; kind: string; createdAt: Date }[];
  plans: { userId: string; tier: string; createdAt: Date }[];
  scans: { userId: string; createdAt: Date }[];
  cards: { userId: string; cardKey: string }[];
  entitlements: { playerId: string; skuId: string; quantity: number }[];
  creditLedger: { userId: string; amount: number; reason: string; dedupeKey: string | null }[];
  /** The options of every batch transaction ($transaction([...])), so a test can see a read was one snapshot. */
  batches: unknown[];
  /** Runs just before a ledger row is inserted: a test uses it to let "another instance" commit first. */
  beforeInsert?: (key: string) => void;
  /** Counts ledger reads of the sweep's shape, so a test can see what a read cost. */
  sweepQueries: number;
}

const h = vi.hoisted(() => ({ session: { user: { id: 'p1' } } as unknown, client: null as unknown, onSale: new Set<string>() }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
// A getter, so each test's fresh client is a fresh object: the sweep remembers swept players per client.
vi.mock('@/lib/db', () => ({ get prisma() { return h.client; } }));
// /shop's gate, with a switch a test flips to put a card on sale; the real rule answers everything else.
vi.mock('@/lib/game-data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/game-data')>();
  return { ...real, shopCardOnSale: (key: string, set?: ReadonlySet<string>) => h.onSale.has(key) || real.shopCardOnSale(key, set) };
});
vi.mock('@/lib/profile-service', () => ({ getOrCreateProfile: async () => ({}) }));
// The double-entry house book is its own suite; here it only has to write inside the same transaction.
vi.mock('@/lib/ledger', () => ({
  postLc: async (db: { creditLedger: { create: (a: unknown) => Promise<unknown> } }, input: { userId: string; amount: number; reason: string; dedupeKey?: string }) => {
    await db.creditLedger.create({ data: { userId: input.userId, amount: input.amount, reason: input.reason, dedupeKey: input.dedupeKey ?? null } });
    return { creditLedgerId: 'cl', transactionId: 'tx' };
  },
}));

const { GET } = await import('@/app/api/v1/wallet/route');
const { POST: closetBuy } = await import('@/app/api/v1/closet/buy/route');
const { POST: walletSpend } = await import('@/app/api/v1/wallet/spend/route');
const { POST: shopBuy } = await import('@/app/api/shop/purchase/route');
const { DELETE: deleteMyData } = await import('@/app/api/v1/workout/scan/route');
const { readWallet, earn, spend } = await import('./wallet-service');
const { refundNotesFor } = await import('./dead-buy-refunds');
const { refundKey } = await import('./dead-buys');

const unique = (target: string) => new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (\`${target}\`)`, { code: 'P2002', clientVersion: 'test' });

let ids = 0;
const nextId = (p: string) => `${p}_${++ids}`;

/** One server instance's Prisma client over the shared store. */
function client(store: Store) {
  function delegates(inTx: { aborted: boolean; writes: Array<() => void>; keys: string[]; view: Store } | null) {
    const live = store;
    const view = inTx ? inTx.view : live;
    const guard = () => { if (inTx?.aborted) throw new Error('current transaction is aborted, commands ignored until end of transaction block'); };
    // a write lands on this view now, and on the store when (and only if) the transaction commits
    const write = (fn: (s: Store) => void) => { fn(view); if (inTx) inTx.writes.push(() => fn(live)); };
    const walletBy = (w: { playerId?: string; id?: string }) => view.wallets.find((x) => (w.id ? x.id === w.id : x.playerId === w.playerId)) ?? null;
    return {
      wallet: {
        findUnique: async ({ where }: { where: { playerId?: string; id?: string } }) => { guard(); const w = walletBy(where); return w ? { ...w } : null; },
        create: async ({ data }: { data: { playerId: string } }) => {
          guard();
          const w: WalletRow = { id: nextId('w'), playerId: data.playerId, coins: 0n, shards: 0n, lc: 0n, version: 0n, updatedAt: new Date() };
          write((s) => s.wallets.push({ ...w }));
          return { ...w };
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, { increment: bigint }> }) => {
          guard();
          write((s) => {
            const w = s.wallets.find((x) => x.id === where.id)!;
            for (const [k, v] of Object.entries(data)) (w as unknown as Record<string, bigint>)[k] += v.increment;
            w.updatedAt = new Date();
          });
          return { ...walletBy({ id: where.id })! };
        },
        // spend()'s conditional decrement: only when every `gte` in the where holds
        updateMany: async ({ where, data }: { where: Record<string, unknown> & { id: string }; data: Record<string, { increment?: bigint; decrement?: bigint }> }) => {
          guard();
          const w = walletBy({ id: where.id }) as unknown as Record<string, bigint> | null;
          if (!w || !Object.entries(where).every(([k, v]) => k === 'id' || w[k] >= (v as { gte: bigint }).gte)) return { count: 0 };
          write((s) => {
            const x = s.wallets.find((y) => y.id === where.id) as unknown as Record<string, bigint>;
            for (const [k, v] of Object.entries(data)) x[k] += (v.increment ?? 0n) - (v.decrement ?? 0n);
          });
          return { count: 1 };
        },
      },
      playerEntitlement: {
        upsert: async ({ create }: { create: { playerId: string; skuId: string; quantity: number } }) => {
          guard();
          write((s) => { if (!s.entitlements.some((e) => e.playerId === create.playerId && e.skuId === create.skuId)) s.entitlements.push({ ...create }); });
          return {};
        },
      },
      walletLedgerEntry: {
        findUnique: async ({ where }: { where: { idempotencyKey: string } }) => {
          guard();
          const e = view.entries.find((x) => x.idempotencyKey === where.idempotencyKey) ?? live.entries.find((x) => x.idempotencyKey === where.idempotencyKey);
          return e ? { ...e } : null;
        },
        findMany: async ({ where }: { where: { walletId: string; reasonCode: { in: string[] } } }) => {
          guard();
          store.sweepQueries++;
          return view.entries.filter((e) => e.walletId === where.walletId && where.reasonCode.in.includes(e.reasonCode)).map((e) => ({ ...e }));
        },
        create: async ({ data }: { data: Omit<EntryRow, 'id' | 'createdAt'> }) => {
          guard();
          store.beforeInsert?.(data.idempotencyKey);
          if (view.entries.some((x) => x.idempotencyKey === data.idempotencyKey) || live.entries.some((x) => x.idempotencyKey === data.idempotencyKey)) {
            if (inTx) inTx.aborted = true;
            throw unique('idempotencyKey');
          }
          const e: EntryRow = { ...data, id: nextId('e'), createdAt: new Date() };
          view.entries.push(e);
          if (inTx) { inTx.keys.push(e.idempotencyKey); inTx.writes.push(() => live.entries.push(e)); }
          return { ...e };
        },
      },
      creditLedger: {
        create: async ({ data }: { data: Store['creditLedger'][number] }) => {
          guard();
          if (data.dedupeKey && live.creditLedger.some((c) => c.userId === data.userId && c.dedupeKey === data.dedupeKey)) { if (inTx) inTx.aborted = true; throw unique('userId,dedupeKey'); }
          write((s) => s.creditLedger.push({ ...data }));
          return { id: nextId('cl') };
        },
      },
      cardOwnership: {
        findUnique: async ({ where }: { where: { userId_cardKey: { userId: string; cardKey: string } } }) =>
          view.cards.find((c) => c.userId === where.userId_cardKey.userId && c.cardKey === where.userId_cardKey.cardKey) ?? null,
        create: async ({ data }: { data: { userId: string; cardKey: string } }) => { guard(); write((s) => s.cards.push({ ...data })); return { ...data }; },
        deleteMany: async ({ where }: { where: { userId: string; cardKey: string } }) => {
          guard();
          write((s) => { s.cards = s.cards.filter((c) => !(c.userId === where.userId && c.cardKey === where.cardKey)); });
          return { count: 1 };
        },
      },
      ownedWearable: {
        findMany: async ({ where }: { where: { userId: string; itemId: { in: string[] } } }) =>
          live.owned.filter((o) => o.userId === where.userId && where.itemId.in.includes(o.itemId)).map((o) => ({ itemId: o.itemId, acquiredAt: o.acquiredAt })),
        findUnique: async ({ where }: { where: { userId_itemId: { userId: string; itemId: string } } }) =>
          live.owned.find((o) => o.userId === where.userId_itemId.userId && o.itemId === where.userId_itemId.itemId) ?? null,
        upsert: async ({ create }: { create: { userId: string; itemId: string } }) => {
          if (!live.owned.some((o) => o.userId === create.userId && o.itemId === create.itemId)) live.owned.push({ ...create, acquiredAt: new Date() });
          return {};
        },
      },
      sessionBooking: {
        findMany: async ({ where }: { where: { userId: string; kind: { in: string[] } } }) =>
          live.bookings.filter((b) => b.userId === where.userId && where.kind.in.includes(b.kind)).map((b) => ({ kind: b.kind, createdAt: b.createdAt })),
      },
      workoutPlan: {
        findMany: async ({ where }: { where: { userId: string } }) => live.plans.filter((p) => p.userId === where.userId).map((p) => ({ tier: p.tier, createdAt: p.createdAt })),
      },
      workoutScan: {
        findFirst: async ({ where }: { where: { userId: string } }) => {
          const mine = live.scans.filter((s) => s.userId === where.userId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          return mine[0] ? { createdAt: mine[0].createdAt } : null;
        },
      },
    };
  }
  return {
    ...delegates(null),
    // Writes inside land on a private view and replay onto the store only on commit, all or nothing: an abort, a throw,
    // or a key another instance committed meanwhile (Postgres would have failed that insert) discards every one. A batch
    // of reads ($transaction([...])) is recorded with its options and answered as it stands.
    $transaction: async <T>(fn: ((tx: unknown) => Promise<T>) | Promise<unknown>[], options?: unknown): Promise<unknown> => {
      if (Array.isArray(fn)) { store.batches.push(options ?? null); return Promise.all(fn); }
      const tx = { aborted: false, writes: [] as Array<() => void>, keys: [] as string[], view: structuredClone({ ...store, beforeInsert: undefined }) as Store };
      const out = await fn(delegates(tx));
      if (tx.aborted) throw new Error('current transaction is aborted');
      if (tx.keys.some((k) => store.entries.some((e) => e.idempotencyKey === k))) throw unique('idempotencyKey');
      for (const w of tx.writes) w();
      return out;
    },
  };
}

// ── the players ──────────────────────────────────────────────────────────────────────────────────────────────────────
const NOW = new Date('2026-09-25T18:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const DAY = 24 * 60;
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function seed(): { store: Store; rows: Record<string, EntryRow> } {
  const store: Store = { wallets: [], entries: [], owned: [], bookings: [], plans: [], scans: [], cards: [], entitlements: [], creditLedger: [], batches: [], sweepQueries: 0 };
  store.wallets.push(
    { id: 'w1', playerId: 'p1', coins: 1000n, shards: 2000n, lc: 500n, version: 7n, updatedAt: ago(DAY) },
    { id: 'w2', playerId: 'p2', coins: 10n, shards: 10n, lc: 10n, version: 1n, updatedAt: ago(DAY) },
  );
  const rows: Record<string, EntryRow> = {};
  const spend = (name: string, walletId: string, sku: string, currency: string, price: number, key: string, createdAt: Date) => {
    rows[name] = {
      id: name, walletId, currency, delta: BigInt(-price), balanceAfter: 0n, reasonCode: 'SPEND_CATALOG_ITEM', source: 'spend',
      idempotencyKey: key, metadata: { skuId: sku, quantity: 1, unitPrice: price }, createdAt,
    };
    store.entries.push(rows[name]);
  };
  // p1 — dead: a /store wearable nobody delivered; a /store wearable bought again in the Closet; a /store kit; a
  // /store seminar seat (the k_ fallback key); a /store plan with an older scan on file; a hollow /shop card.
  spend('store_cap', 'w1', 'cap_nexus', 'coins', 300, UUID(1), ago(3 * DAY));
  spend('store_toplab', 'w1', 'top_lab', 'coins', 400, UUID(2), ago(3 * DAY));
  spend('closet_toplab', 'w1', 'top_lab', 'coins', 400, UUID(3), ago(2 * DAY));
  store.owned.push({ userId: 'p1', itemId: 'top_lab', acquiredAt: new Date(ago(2 * DAY).getTime() + 60) });
  spend('store_dust', 'w1', 'music_kit_dust', 'shards', 400, UUID(4), ago(3 * DAY));
  spend('store_seminar', 'w1', 'seminar_seat', 'shards', 250, 'k_1758500000000_x1y2z3', ago(3 * DAY));
  spend('store_plan', 'w1', 'workout_plan_4w', 'shards', 60, UUID(5), ago(3 * DAY));
  store.scans.push({ userId: 'p1', createdAt: ago(4 * DAY) });
  rows.shop_jab = {
    id: 'shop_jab', walletId: 'w1', currency: 'lc', delta: -80n, balanceAfter: 420n, reasonCode: 'SHOP_PURCHASE', source: 'spend',
    idempotencyKey: 'shop:p1:drill-jab-flow', metadata: { cardKey: 'drill-jab-flow', name: 'Jab Flow Drill' }, createdAt: ago(3 * DAY),
  };
  store.entries.push(rows.shop_jab);
  store.cards.push({ userId: 'p1', cardKey: 'drill-jab-flow' }, { userId: 'p1', cardKey: 'some-catalog-card' });
  // p1 — delivered or held: the Room's own kit buy, a /store boost card (the Profile reads it), a booked group
  // session, a held class pass.
  spend('room_neon', 'w1', 'music_kit_neon', 'shards', 200, 'music:p1:music_kit_neon', ago(3 * DAY));
  spend('store_boost', 'w1', 'boost_card_neural-max', 'shards', 400, UUID(6), ago(3 * DAY));
  spend('booked_group', 'w1', 'session_group_workout', 'shards', 150, UUID(7), ago(2 * DAY));
  store.bookings.push({ userId: 'p1', kind: 'group_workout', createdAt: new Date(ago(2 * DAY).getTime() + 80) });
  spend('store_class', 'w1', 'class_monthly', 'shards', 300, UUID(8), ago(3 * DAY));
  // p2 — a dead buy of their own, which p1's reads must never touch
  spend('p2_token', 'w2', 'dunk_retry_token', 'coins', 50, UUID(9), ago(3 * DAY));
  return { store, rows };
}

const refundsIn = (store: Store) => store.entries.filter((e) => e.reasonCode === 'DEAD_BUY_REFUND');
const walletOf = (store: Store, playerId: string) => store.wallets.find((w) => w.playerId === playerId)!;

const P1_DEAD = {
  store_cap: { currency: 'coins', amount: 300, note: "We refunded 300 coins for Nexus Visor: it didn't deliver anything. Sorry about that." },
  store_toplab: { currency: 'coins', amount: 400, note: "We refunded 400 coins for Lab Compression Tee: it didn't deliver anything. Sorry about that." },
  store_dust: { currency: 'shards', amount: 400, note: "We refunded 400 shards for DUST kit: it didn't deliver anything. Sorry about that." },
  store_seminar: { currency: 'shards', amount: 250, note: "We refunded 250 shards for Seminar seat: it didn't deliver anything. Sorry about that." },
  store_plan: { currency: 'shards', amount: 60, note: "We refunded 60 shards for 4-Week Workout Plan: it didn't deliver anything. Sorry about that." },
  shop_jab: { currency: 'lc', amount: 80, note: "We refunded 80 Lab Credits for Jab Flow Drill: it didn't deliver anything. Sorry about that." },
} as const;

describe('GET /api/v1/wallet refunds what delivered nothing', () => {
  let store: Store;
  beforeEach(() => {
    vi.setSystemTime(NOW);
    ({ store } = seed());
    h.client = client(store);
    h.session = { user: { id: 'p1' } };
  });

  it('refunds exactly the dead rows, once each, in their own currency, for what each took', async () => {
    const res = await GET();
    const body = await res.json();

    const refunds = refundsIn(store);
    expect(refunds.map((r) => r.idempotencyKey).sort()).toEqual(Object.keys(P1_DEAD).map(refundKey).sort());
    for (const r of refunds) {
      const was = P1_DEAD[(r.metadata as { refundOf: keyof typeof P1_DEAD }).refundOf];
      expect(r.walletId).toBe('w1');
      expect(r.currency).toBe(was.currency);
      expect(r.delta).toBe(BigInt(was.amount));
      expect(r.source).toBe('refund');
      expect((r.metadata as { note: string }).note).toBe(was.note);
    }
    // 1000 + 300 + 400 coins; 2000 + 400 + 250 + 60 shards; 500 + 80 LC
    expect(walletOf(store, 'p1')).toMatchObject({ coins: 1700n, shards: 2710n, lc: 580n });
    expect(body).toMatchObject({ coins: 1700, shards: 2710, lc: 580 });
    // the balance each refund row records is the balance right after it
    const last = (cur: string) => refunds.filter((r) => r.currency === cur).at(-1)!.balanceAfter;
    expect([last('coins'), last('shards'), last('lc')]).toEqual([1700n, 2710n, 580n]);
  });

  it('hands the player the reason once, with the balance that went up', async () => {
    const body = await (await GET()).json();
    expect(body.refund_notes.map((n: { text: string }) => n.text).sort()).toEqual(Object.values(P1_DEAD).map((d) => d.note).sort());
    for (const n of body.refund_notes) expect(refundsIn(store).some((r) => r.id === n.id)).toBe(true);
    // two weeks on, the toast is no longer offered (the history keeps it)
    expect(refundNotesFor(h.client as object, 'p1', new Date(NOW.getTime() + 15 * DAY * 60_000))).toEqual([]);
  });

  it('skips every delivering or held row: the Closet buy, the Room\'s kit, the boost card, the booked session, the class pass', async () => {
    await GET();
    const refunded = new Set(refundsIn(store).map((r) => (r.metadata as { refundOf: string }).refundOf));
    for (const id of ['closet_toplab', 'room_neon', 'store_boost', 'booked_group', 'store_class']) expect(refunded.has(id), id).toBe(false);
  });

  it('undoes the /shop sale: the LC is back and the hollow card leaves the shelf, in the same transaction', async () => {
    await GET();
    expect(store.cards).toEqual([{ userId: 'p1', cardKey: 'some-catalog-card' }]);
    expect(store.creditLedger).toEqual([{ userId: 'p1', amount: 80, reason: 'DEAD_BUY_REFUND', dedupeKey: 'refund:shop_jab' }]);
  });

  it('never touches another player', async () => {
    await GET();
    expect(walletOf(store, 'p2')).toMatchObject({ coins: 10n, shards: 10n, lc: 10n, version: 1n });
    expect(refundsIn(store).every((r) => r.walletId === 'w1')).toBe(true);
    // p2's own read refunds p2's own row, and only that
    h.session = { user: { id: 'p2' } };
    await GET();
    expect(walletOf(store, 'p2').coins).toBe(60n);
    expect(refundsIn(store).filter((r) => r.walletId === 'w2').map((r) => r.idempotencyKey)).toEqual([refundKey('p2_token')]);
    expect(walletOf(store, 'p1')).toMatchObject({ coins: 1700n, shards: 2710n, lc: 580n });
  });

  it('is idempotent: a second read writes nothing and costs no query; a fresh server instance writes nothing either', async () => {
    await GET();
    const after = structuredClone({ wallets: store.wallets, entries: store.entries });
    const queries = store.sweepQueries;
    const again = await (await GET()).json();
    expect(store.sweepQueries).toBe(queries);   // remembered on this instance: no ledger read at all
    expect(again.refund_notes).toHaveLength(6);
    // another instance has no memory: it reads the ledger once, finds the refunds, and writes nothing
    const other = client(store);
    const view = await readWallet(other as never, 'p1');
    expect(store.sweepQueries).toBe(queries + 1);
    expect(view).toMatchObject({ coins: 1700, shards: 2710, lc: 580 });
    expect({ wallets: store.wallets, entries: store.entries }).toEqual(after);
    expect(refundNotesFor(other, 'p1')).toHaveLength(6);
  });

  it('two instances reading at once refund each row once', async () => {
    const a = client(store), b = client(store);
    await Promise.all([readWallet(a as never, 'p1'), readWallet(b as never, 'p1'), readWallet(a as never, 'p1')]);
    expect(refundsIn(store)).toHaveLength(6);
    expect(walletOf(store, 'p1')).toMatchObject({ coins: 1700n, shards: 2710n, lc: 580n });
  });

  it('losing the unique-key race on coins or shards rolls ours back and keeps the winner\'s refund', async () => {
    // "Another instance" commits the refund of store_cap between our check and our insert.
    store.beforeInsert = (key) => {
      if (key !== refundKey('store_cap') || store.entries.some((e) => e.idempotencyKey === key)) return;
      walletOf(store, 'p1').coins += 300n;
      store.entries.push({ id: 'winner', walletId: 'w1', currency: 'coins', delta: 300n, balanceAfter: 1300n, reasonCode: 'DEAD_BUY_REFUND', source: 'refund', idempotencyKey: key, metadata: { refundOf: 'store_cap', note: P1_DEAD.store_cap.note }, createdAt: new Date() });
    };
    const body = await (await GET()).json();
    expect(refundsIn(store).filter((r) => r.idempotencyKey === refundKey('store_cap')).map((r) => r.id)).toEqual(['winner']);
    expect(walletOf(store, 'p1')).toMatchObject({ coins: 1700n, shards: 2710n, lc: 580n });   // 300 once, not twice
    expect(body.refund_notes.map((n: { id: string }) => n.id)).toContain('winner');
  });

  it('losing the race on Lab Credits aborts the whole transaction: no second credit, the card row untouched by us', async () => {
    store.beforeInsert = (key) => {
      if (key !== refundKey('shop_jab') || store.entries.some((e) => e.idempotencyKey === key)) return;
      walletOf(store, 'p1').lc += 80n;
      store.cards = store.cards.filter((c) => c.cardKey !== 'drill-jab-flow');
      store.entries.push({ id: 'winner_lc', walletId: 'w1', currency: 'lc', delta: 80n, balanceAfter: 580n, reasonCode: 'DEAD_BUY_REFUND', source: 'refund', idempotencyKey: key, metadata: { refundOf: 'shop_jab', note: P1_DEAD.shop_jab.note }, createdAt: new Date() });
    };
    const body = await (await GET()).json();
    expect(walletOf(store, 'p1').lc).toBe(580n);
    expect(refundsIn(store).filter((r) => r.idempotencyKey === refundKey('shop_jab')).map((r) => r.id)).toEqual(['winner_lc']);
    expect(store.creditLedger).toEqual([]);   // our house-book row died with our transaction
    // the loser reads the winner's row as "already refunded", so the player still gets the note, once
    expect(body.refund_notes.filter((n: { id: string }) => n.id === 'winner_lc')).toHaveLength(1);
  });

  it('leaves a row younger than ten minutes for a later read, then refunds it', async () => {
    const { store: s } = seed();
    s.entries = s.entries.filter((e) => e.walletId === 'w2');
    s.entries.push({ id: 'young', walletId: 'w2', currency: 'coins', delta: -50n, balanceAfter: 0n, reasonCode: 'SPEND_CATALOG_ITEM', source: 'spend', idempotencyKey: UUID(20), metadata: { skuId: 'dunk_retry_token' }, createdAt: ago(1) });
    const c = client(s);
    await readWallet(c as never, 'p2');
    expect(refundsIn(s).map((r) => r.idempotencyKey)).toEqual([refundKey('p2_token')]);
    vi.setSystemTime(new Date(NOW.getTime() + 15 * 60_000));
    await readWallet(c as never, 'p2');   // not remembered as done, so it looks again
    expect(refundsIn(s).map((r) => r.idempotencyKey).sort()).toEqual([refundKey('p2_token'), refundKey('young')].sort());
    expect(walletOf(s, 'p2').coins).toBe(110n);
  });

  it('a failed sweep never breaks the read: the balance comes back as it stands', async () => {
    const broken = { ...client(store), walletLedgerEntry: { findMany: async () => { throw new Error('db down'); } } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(readWallet(broken as never, 'p1')).resolves.toMatchObject({ coins: 1000, shards: 2000, lc: 500 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

const post = (handler: (req: never) => Promise<Response>, body: unknown) => handler(new Request('http://fel.test/api', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as never);

describe('the keys a refund leaves behind buy nothing', () => {
  let store: Store;
  beforeEach(() => {
    vi.setSystemTime(NOW);
    ({ store } = seed());
    h.client = client(store);
    h.session = { user: { id: 'p1' } };
    h.onSale.clear();
  });

  it('a Closet buy replaying the refund row\'s key, or the refunded row\'s own key, is refused: no charge, no wearable', async () => {
    const body = await (await GET()).json();
    expect(body.coins).toBe(1700);
    const refundOfCap = refundKey('store_cap');
    for (const [itemId, key] of [['shoes_evo', refundOfCap], ['cap_nexus', UUID(1)]]) {
      const res = await post(closetBuy, { itemId, idempotency_key: key });
      expect(res.status, key).toBe(409);
      expect(await res.json(), key).toEqual({ error: 'replayed_key' });
    }
    expect(store.owned.map((o) => o.itemId)).toEqual(['top_lab']);
    expect(walletOf(store, 'p1').coins).toBe(1700n);
  });

  it('a Closet buy replaying a dead row\'s key BEFORE the sweep ever read the wallet is refused too, and the sweep still refunds it once', async () => {
    const res = await post(closetBuy, { itemId: 'cap_nexus', idempotency_key: UUID(1) });
    expect(res.status).toBe(409);
    expect(store.owned.some((o) => o.itemId === 'cap_nexus')).toBe(false);
    await readWallet(client(store) as never, 'p1');
    expect(refundsIn(store).filter((r) => r.idempotencyKey === refundKey('store_cap'))).toHaveLength(1);
    expect(walletOf(store, 'p1').coins).toBe(1700n);
  });

  it('a real retry still gets its receipt: the same Closet key twice charges once, and a server-made key replays days later', async () => {
    const first = await spend(h.client as never, { playerId: 'p1', idempotencyKey: UUID(30), skuId: 'shoes_evo', quantity: 1 });
    const again = await spend(h.client as never, { playerId: 'p1', idempotencyKey: UUID(30), skuId: 'shoes_evo', quantity: 1 });
    expect(again.entry_id).toBe(first.entry_id);
    expect(store.entries.filter((e) => e.idempotencyKey === UUID(30))).toHaveLength(1);
    expect(walletOf(store, 'p1').coins).toBe(1700n - 800n);
    // the Room's own kit key, three days old: its replay is the unlock it already paid for
    const kit = await spend(h.client as never, { playerId: 'p1', idempotencyKey: 'music:p1:music_kit_neon', skuId: 'music_kit_neon', quantity: 1 });
    expect(kit.entry_id).toBe('room_neon');
    // the same key for another item is not a retry of this one
    await expect(spend(h.client as never, { playerId: 'p1', idempotencyKey: UUID(30), skuId: 'shoes_flight', quantity: 1 })).rejects.toMatchObject({ code: 'REPLAYED_KEY' });
  });

  it('another player\'s key is answered as a fresh key would be: no entry id, and a buy on it is refused without a charge', async () => {
    h.session = { user: { id: 'p2' } };
    // the probe from the review: a held SKU under p1's /shop key. It reads exactly like a key nobody used.
    const probe = await post(walletSpend, { sku_id: 'class_pass_single', idempotency_key: 'shop:p1:drill-jab-flow' });
    const fresh = await post(walletSpend, { sku_id: 'class_pass_single', idempotency_key: UUID(50) });
    expect(probe.status).toBe(400);
    expect(await probe.json()).toEqual(await fresh.json());
    // a Closet buy on p1's /store key, with the coins to pay: the insert fails on the key, so nothing is charged or handed over
    walletOf(store, 'p2').coins = 1000n;
    const closet = await post(closetBuy, { itemId: 'cap_nexus', idempotency_key: UUID(1) });
    expect(closet.status).toBe(409);
    expect(await closet.json()).toEqual({ error: 'replayed_key' });
    expect(store.owned.some((o) => o.userId === 'p2')).toBe(false);
    expect(walletOf(store, 'p2').coins).toBe(1000n);   // the 300 was never taken: the whole transaction rolled back
  });

  it('a refund key another wallet took first is not a refund: nothing is marked paid back, no note, and a later read tries again', async () => {
    const squat = (id: string, rowId: string, currency: string) => store.entries.push({
      id, walletId: 'w2', currency, delta: -60n, balanceAfter: 0n, reasonCode: 'SPEND_CATALOG_ITEM', source: 'spend',
      idempotencyKey: refundKey(rowId), metadata: { skuId: 'workout_plan_4w', quantity: 1, unitPrice: 60 }, createdAt: ago(60),
    });
    squat('attacker_lc', 'shop_jab', 'shards');
    squat('attacker_coins', 'store_cap', 'shards');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = await (await GET()).json();
    expect(walletOf(store, 'p1')).toMatchObject({ coins: 1400n, lc: 500n });   // top_lab's 400 back; cap_nexus and the card not
    expect(store.cards.some((c) => c.cardKey === 'drill-jab-flow')).toBe(true);
    expect(body.refund_notes.map((n: { id: string }) => n.id)).not.toContain('attacker_lc');
    expect(body.refund_notes.map((n: { id: string }) => n.id)).not.toContain('attacker_coins');
    expect(body.refund_notes).toHaveLength(4);
    expect(warn).toHaveBeenCalled();
    const queries = store.sweepQueries;
    await GET();
    expect(store.sweepQueries).toBe(queries + 1);   // not remembered as done
    warn.mockRestore();
  });

  it('a /shop card whose sale was refunded charges again when it goes on sale, once', async () => {
    await GET();
    expect(walletOf(store, 'p1').lc).toBe(580n);
    h.onSale.add('drill-jab-flow');
    const res = await post(shopBuy, { cardKey: 'drill-jab-flow' });
    expect(res.status).toBe(200);
    expect(walletOf(store, 'p1').lc).toBe(500n);
    expect(store.cards.filter((c) => c.cardKey === 'drill-jab-flow')).toHaveLength(1);
    expect(store.entries.filter((e) => e.reasonCode === 'SHOP_PURCHASE').map((e) => e.idempotencyKey))
      .toEqual(['shop:p1:drill-jab-flow', 'shop:p1:drill-jab-flow:after-refund:shop_jab']);
    expect((await post(shopBuy, { cardKey: 'drill-jab-flow' })).status).toBe(400);   // owned now
    await readWallet(client(store) as never, 'p1');   // a fresh instance refunds nothing more
    expect(walletOf(store, 'p1').lc).toBe(500n);
  });

  it('a boost card: the first charge delivered, a later /store charge of the same card is refunded', async () => {
    const s: Store = { wallets: [{ id: 'w1', playerId: 'p1', coins: 0n, shards: 100n, lc: 0n, version: 1n, updatedAt: ago(DAY) }], entries: [], owned: [], bookings: [], plans: [], scans: [], cards: [], entitlements: [], creditLedger: [], batches: [], sweepQueries: 0 };
    const charge = (id: string, sku: string, price: number, key: string, createdAt: Date) => s.entries.push({
      id, walletId: 'w1', currency: 'shards', delta: BigInt(-price), balanceAfter: 0n, reasonCode: 'SPEND_CATALOG_ITEM', source: 'spend',
      idempotencyKey: key, metadata: { skuId: sku, quantity: 1, unitPrice: price }, createdAt,
    });
    charge('profile_bounce', 'boost_card_bonds-bounce', 750, 'boost_card:p1:bonds-bounce', ago(3 * DAY));
    charge('store_bounce', 'boost_card_bonds-bounce', 750, UUID(40), ago(2 * DAY));
    charge('store_max_a', 'boost_card_neural-max', 400, UUID(41), ago(3 * DAY));
    charge('store_max_b', 'boost_card_neural-max', 400, UUID(42), ago(3 * DAY - 1));
    await readWallet(client(s) as never, 'p1');
    const refunds = s.entries.filter((e) => e.reasonCode === 'DEAD_BUY_REFUND');
    expect(refunds.map((r) => (r.metadata as { refundOf: string }).refundOf).sort()).toEqual(['store_bounce', 'store_max_b']);
    expect((refunds.find((r) => (r.metadata as { refundOf: string }).refundOf === 'store_bounce')!.metadata as { note: string }).note)
      .toBe("We refunded 750 shards for Bonds Bounce Blueprint: it didn't deliver anything. Sorry about that.");
    expect(s.wallets[0].shards).toBe(100n + 750n + 400n);
  });

  it('reads the plans and the oldest scan in one repeatable-read snapshot', async () => {
    await GET();
    expect(store.batches).toEqual([{ isolationLevel: 'RepeatableRead' }]);
  });
});

describe('delete-my-data', () => {
  it('erases the plans and the scans in one transaction, so no reader sees one gone and the other left', async () => {
    const batches: unknown[][] = [];
    const lazy = (op: string) => (args: unknown) => ({ op, args });   // a Prisma query runs only when its transaction does
    h.session = { user: { id: 'p1' } };
    h.client = {
      workoutPlan: { deleteMany: lazy('workoutPlan.deleteMany') },
      workoutScan: { deleteMany: lazy('workoutScan.deleteMany') },
      $transaction: async (ops: unknown[]) => { batches.push(ops); return ops.map(() => ({ count: 1 })); },
    };
    const res = await deleteMyData();
    expect(res.status).toBe(200);
    expect(batches).toEqual([[
      { op: 'workoutPlan.deleteMany', args: { where: { userId: 'p1' } } },
      { op: 'workoutScan.deleteMany', args: { where: { userId: 'p1' } } },
    ]]);
  });
});

describe('an earn under another wallet\'s key', () => {
  it('passes the checks a fresh key gets, then is refused on the key: no grant, no entry id, the event marked replayed_key', async () => {
    const updates: unknown[] = [];
    const foreign = { id: 'their_row', walletId: 'w_them', currency: 'coins', delta: 500n, balanceAfter: 500n, reasonCode: 'X', idempotencyKey: 'k_theirs', metadata: {}, createdAt: new Date() };
    const mine = { id: 'w_me', playerId: 'me', coins: 7n, shards: 0n, lc: 0n, version: 1n, updatedAt: new Date() };
    const db = {
      walletLedgerEntry: { findUnique: async () => foreign, count: async () => 0, aggregate: async () => ({ _sum: { delta: 0n } }) },
      wallet: { findUnique: async () => mine },
      perfEarnEvent: { create: async () => ({ id: 'ev1' }), count: async () => 0, update: async (a: unknown) => { updates.push(a); return {}; } },
      gameSession: { findFirst: async () => ({ won: false }) },
      rewardRule: { findUnique: async () => null },
      $transaction: async () => { throw new Error('the grant must not open a transaction'); },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await earn(db as never, { playerId: 'me', idempotencyKey: 'k_theirs', eventType: 'mode_session_completed', payload: { run_id: 'r1', score: 80 } });
    warn.mockRestore();
    expect(r).toMatchObject({ granted: { coins: 0, shards: 0 }, entry_id: null, rejected: 'replayed_key', balances: { coins: 7 } });
    expect(updates).toEqual([{ where: { id: 'ev1' }, data: { rejectedReason: 'replayed_key' } }]);
  });
});

describe('a refund is not an earn', () => {
  it('the daily earn cap leaves dead-buy refunds out of what was earned today', async () => {
    const seen: Array<{ where: Record<string, unknown> }> = [];
    const db = {
      walletLedgerEntry: {
        findUnique: async () => null,
        count: async () => 0,
        aggregate: async (args: { where: Record<string, unknown> }) => { seen.push(args); throw new Error('stop here'); },
      },
      perfEarnEvent: { create: async () => ({ id: 'ev1' }), count: async () => 0, update: async () => ({}) },
      gameSession: { findFirst: async () => ({ won: false }) },
      rewardRule: { findUnique: async () => null },
    };
    await expect(earn(db as never, { playerId: 'p1', idempotencyKey: 'k1', eventType: 'mode_session_completed', payload: { run_id: 'r1', score: 80 } }))
      .rejects.toThrow('stop here');
    expect(seen[0].where).toMatchObject({ currency: 'coins', delta: { gt: 0 }, reasonCode: { not: 'DEAD_BUY_REFUND' } });
  });
});
