// Owner decision 2026-09-24: refund every purchase that delivered nothing, automatically, on the next wallet read.
// Owner additions 2026-09-25: the class passes (their entitlement row deleted with the refund), workout plans without
// the erased-plan proof, and a booked session whose slot ended with no join link ever posted (the charge the booking
// claims paid back, the booking marked refunded, in one transaction).
//
// GET /api/v1/wallet, POST /api/v1/sessions/book, readWallet(), the sweep and the credit writers (applyDelta, applyLc) run for real here. The
// database is an in-memory stand-in that behaves like Postgres where it matters: a transaction's writes land only when
// it commits, the ledger's idempotency key is unique across every writer (a second instance's committed row
// included), and after a unique violation the transaction is aborted, so every later statement in it fails and
// nothing it did survives. It honours the `where` clauses the sweep sends, so a query that forgot its status filter
// would pay back a cancelled booking here exactly as it would in production. The SessionJoinLink table can be switched
// off (P2021, or no accessor on an older client). Only the session and the house book (postLc) are stubbed. Nothing
// here needs a database.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/public/_prisma/client';

interface WalletRow { id: string; playerId: string; coins: bigint; shards: bigint; lc: bigint; version: bigint; updatedAt: Date }
interface EntryRow {
  id: string; walletId: string; currency: string; delta: bigint; balanceAfter: bigint; reasonCode: string; source: string;
  idempotencyKey: string; metadata: Record<string, unknown> | null; createdAt: Date;
}
interface Booking { id: string; userId: string; kind: string; sessionKey: string; status: string; shardsPaid: number; startsAt: Date; createdAt: Date }
interface Store {
  wallets: WalletRow[];
  entries: EntryRow[];
  owned: { userId: string; itemId: string; acquiredAt: Date }[];
  bookings: Booking[];
  plans: { userId: string; tier: string; createdAt: Date }[];
  cards: { userId: string; cardKey: string }[];
  entitlements: { playerId: string; skuId: string; quantity: number }[];
  creditLedger: { userId: string; amount: number; reason: string; dedupeKey: string | null }[];
  /** The slots with a SessionJoinLink row (each a link that passes the rules). */
  links: Set<string>;
  /** false: the schema was never pushed, so the SessionJoinLink table is not in the database (P2021). */
  linkTable: boolean;
  /** false: a Prisma client generated before the model, with no prisma.sessionJoinLink at all. */
  accessor: boolean;
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
const { POST: sessionsBook } = await import('@/app/api/v1/sessions/book/route');
const { upcomingGroupSlots } = await import('@/lib/sessions/schedule');
const { readWallet, earn, spend } = await import('./wallet-service');
const { refundNotesFor } = await import('./dead-buy-refunds');
const { refundKey } = await import('./dead-buys');
const { NOT_ON_SALE } = await import('./catalog');
const { GET: musicOwned, POST: musicBuy } = await import('@/app/api/music/unlock/route');
const { spendResultFromStatus, ownedReadFromResponse, SPEND_FAILURE_TEXT } = await import('@/lib/babylon/music/purchases');

const unique = (target: string) => new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (\`${target}\`)`, { code: 'P2002', clientVersion: 'test' });
const missingTable = () => Object.assign(new Error('The table `public.SessionJoinLink` does not exist in the current database.'), { code: 'P2021' });

let ids = 0;
const nextId = (p: string) => `${p}_${++ids}`;

/** Does a row satisfy a Prisma `where` of the shapes these routes send: equality, `in`, and a `gte`/`lt` on a Date. */
const matches = (row: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => {
  const have = row[k];
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const cond = v as { in?: unknown[]; gte?: Date; lt?: Date };
    if (Array.isArray(cond.in)) return cond.in.includes(have);
    if (cond.gte) return (have as Date).getTime() >= cond.gte.getTime();
    if (cond.lt) return (have as Date).getTime() < cond.lt.getTime();
  }
  return have === v;
});

/** One server instance's Prisma client over the shared store. */
function client(store: Store) {
  function delegates(inTx: { aborted: boolean; writes: Array<() => void>; keys: string[]; view: Store } | null) {
    const live = store;
    const view = inTx ? inTx.view : live;
    const guard = () => { if (inTx?.aborted) throw new Error('current transaction is aborted, commands ignored until end of transaction block'); };
    // a write lands on this view now, and on the store when (and only if) the transaction commits
    const write = (fn: (s: Store) => void) => { fn(view); if (inTx) inTx.writes.push(() => fn(live)); };
    const walletBy = (w: { playerId?: string; id?: string }) => view.wallets.find((x) => (w.id ? x.id === w.id : x.playerId === w.playerId)) ?? null;
    const joinLinks = {
      findMany: async ({ where }: { where: { sessionKey: { in: string[] } } }) => {
        if (!live.linkTable) throw missingTable();
        return where.sessionKey.in.filter((k) => live.links.has(k)).map((sessionKey) => ({ sessionKey, url: 'https://us02web.zoom.us/j/81234567890' }));
      },
    };
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
        // MUSIC-SUITE P2: GET /api/music/unlock reads the player's kit rows (playerId, skuId in [...])
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          guard();
          return view.entitlements.filter((e) => matches(e as unknown as Record<string, unknown>, where)).map((e) => ({ skuId: e.skuId }));
        },
        upsert: async ({ create }: { create: { playerId: string; skuId: string; quantity: number } }) => {
          guard();
          write((s) => { if (!s.entitlements.some((e) => e.playerId === create.playerId && e.skuId === create.skuId)) s.entitlements.push({ ...create }); });
          return {};
        },
        deleteMany: async ({ where }: { where: { playerId: string; skuId: string } }) => {
          guard();
          const gone = view.entitlements.filter((e) => e.playerId === where.playerId && e.skuId === where.skuId).length;
          write((s) => { s.entitlements = s.entitlements.filter((e) => !(e.playerId === where.playerId && e.skuId === where.skuId)); });
          return { count: gone };
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
        // the sweep's reads (the player's bookings, a private slot's confirmed ones) and the booking route's come here
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          guard();
          return view.bookings.filter((b) => matches(b as unknown as Record<string, unknown>, where)).map((b) => ({ ...b }));
        },
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          guard();
          const b = view.bookings.find((x) => matches(x as unknown as Record<string, unknown>, where));
          return b ? { ...b } : null;
        },
        count: async ({ where }: { where: Record<string, unknown> }) => view.bookings.filter((b) => matches(b as unknown as Record<string, unknown>, where)).length,
        create: async ({ data }: { data: Omit<Booking, 'id' | 'status' | 'createdAt'> }) => {
          guard();
          const b: Booking = { ...data, id: nextId('bk'), status: 'confirmed', createdAt: new Date() };
          write((s) => s.bookings.push({ ...b }));
          return { ...b };
        },
        // a conditional update re-checks the row's latest COMMITTED version (Postgres locks it first), so a status
        // another writer committed meanwhile is seen here, snapshot or not
        updateMany: async ({ where, data }: { where: { id: string; status: string }; data: { status: string } }) => {
          guard();
          const hit = live.bookings.filter((b) => b.id === where.id && b.status === where.status).length;
          if (hit) write((s) => { for (const b of s.bookings) if (b.id === where.id && b.status === where.status) b.status = data.status; });
          return { count: hit };
        },
      },
      workoutPlan: {
        findMany: async ({ where }: { where: { userId: string } }) => live.plans.filter((p) => p.userId === where.userId).map((p) => ({ tier: p.tier, createdAt: p.createdAt })),
      },
      get sessionJoinLink() { return live.accessor ? joinLinks : undefined; },
    };
  }
  const c = delegates(null) as ReturnType<typeof delegates> & { $transaction: unknown };
  // Writes inside land on a private view and replay onto the store only on commit, all or nothing: an abort, a throw,
  // or a key another instance committed meanwhile (Postgres would have failed that insert) discards every one.
  c.$transaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    const tx = { aborted: false, writes: [] as Array<() => void>, keys: [] as string[], view: structuredClone({ ...store, beforeInsert: undefined, links: undefined }) as Store };
    const out = await fn(delegates(tx));
    if (tx.aborted) throw new Error('current transaction is aborted');
    if (tx.keys.some((k) => store.entries.some((e) => e.idempotencyKey === k))) throw unique('idempotencyKey');
    for (const w of tx.writes) w();
    return out;
  };
  return c;
}

// ── the players ──────────────────────────────────────────────────────────────────────────────────────────────────────
const NOW = new Date('2026-09-25T18:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const DAY = 24 * 60;
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// the group workout of Wed Sep 23, 5:30 PM PT (over), the one of Fri Sep 25 (two days on), and older ones
const GW_SEP23 = new Date('2026-09-24T00:30:00Z');
const GW_SEP18 = new Date('2026-09-19T00:30:00Z');
const GW_SEP16 = new Date('2026-09-17T00:30:00Z');
const GW_NEXT = new Date(NOW.getTime() + 2 * DAY * 60_000);
const PV_SEP24 = new Date('2026-09-24T23:00:00Z');

function seed(): { store: Store; rows: Record<string, EntryRow> } {
  const store: Store = { wallets: [], entries: [], owned: [], bookings: [], plans: [], cards: [], entitlements: [], creditLedger: [], links: new Set(), linkTable: true, accessor: true, sweepQueries: 0 };
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
  const book = (id: string, userId: string, kind: string, sessionKey: string, startsAt: Date, over: Partial<Booking> = {}) =>
    store.bookings.push({ id, userId, kind, sessionKey, status: 'confirmed', shardsPaid: 150, startsAt, createdAt: ago(3 * DAY), ...over });
  // p1 — dead: a /store wearable nobody delivered; a /store wearable bought again in the Closet; a /store kit; a
  // /store seminar seat (the k_ fallback key); a /store plan; a hollow /shop card; a /live class pass (2026-09-25).
  spend('store_cap', 'w1', 'cap_nexus', 'coins', 300, UUID(1), ago(3 * DAY));
  spend('store_toplab', 'w1', 'top_lab', 'coins', 400, UUID(2), ago(3 * DAY));
  spend('closet_toplab', 'w1', 'top_lab', 'coins', 400, UUID(3), ago(2 * DAY));
  store.owned.push({ userId: 'p1', itemId: 'top_lab', acquiredAt: new Date(ago(2 * DAY).getTime() + 60) });
  spend('store_dust', 'w1', 'music_kit_dust', 'shards', 400, UUID(4), ago(3 * DAY));
  spend('store_seminar', 'w1', 'seminar_seat', 'shards', 250, 'k_1758500000000_x1y2z3', ago(3 * DAY));
  spend('store_plan', 'w1', 'workout_plan_4w', 'shards', 60, UUID(5), ago(3 * DAY));
  rows.shop_jab = {
    id: 'shop_jab', walletId: 'w1', currency: 'lc', delta: -80n, balanceAfter: 420n, reasonCode: 'SHOP_PURCHASE', source: 'spend',
    idempotencyKey: 'shop:p1:drill-jab-flow', metadata: { cardKey: 'drill-jab-flow', name: 'Jab Flow Drill' }, createdAt: ago(3 * DAY),
  };
  store.entries.push(rows.shop_jab);
  store.cards.push({ userId: 'p1', cardKey: 'drill-jab-flow' }, { userId: 'p1', cardKey: 'some-catalog-card' });
  spend('store_class', 'w1', 'class_monthly', 'shards', 300, UUID(8), ago(3 * DAY));
  store.entitlements.push({ playerId: 'p1', skuId: 'class_monthly', quantity: 1 }, { playerId: 'p1', skuId: 'boost_card_neural-max', quantity: 1 });
  // p1 — delivered: the Room's own kit buy, a /store boost card (the Profile reads it), a booked group session.
  spend('room_neon', 'w1', 'music_kit_neon', 'shards', 200, 'music:p1:music_kit_neon', ago(3 * DAY));
  spend('store_boost', 'w1', 'boost_card_neural-max', 'shards', 400, UUID(6), ago(3 * DAY));
  spend('booked_group', 'w1', 'session_group_workout', 'shards', 150, UUID(7), ago(2 * DAY));
  const justBefore = (d: Date) => new Date(d.getTime() - 50);
  spend('charge_linked', 'w1', 'session_group_workout', 'shards', 150, UUID(11), justBefore(ago(7 * DAY)));
  spend('charge_cancelled', 'w1', 'session_group_workout', 'shards', 150, UUID(12), justBefore(ago(8 * DAY)));
  spend('charge_next', 'w1', 'session_group_workout', 'shards', 150, UUID(13), justBefore(ago(DAY)));
  // p1's bookings (2026-09-25), each just after its charge. bk_group booked the charge above and its session is over
  // with no link: that charge is paid back, once. bk_linked's slot had a link; bk_cancelled was cancelled; bk_free cost
  // nothing; bk_next is two days away and has no link yet.
  book('bk_group', 'p1', 'group_workout', 'gw_2026-09-23', GW_SEP23, { createdAt: new Date(ago(2 * DAY).getTime() + 80) });
  book('bk_linked', 'p1', 'group_workout', 'gw_2026-09-18', GW_SEP18, { createdAt: ago(7 * DAY) });
  store.links.add('gw_2026-09-18');
  book('bk_cancelled', 'p1', 'group_workout', 'gw_2026-09-16', GW_SEP16, { status: 'cancelled', createdAt: ago(8 * DAY) });
  book('bk_free', 'p1', 'group_workout', 'gw_2026-09-11', new Date('2026-09-12T00:30:00Z'), { shardsPaid: 0, createdAt: ago(9 * DAY) });
  book('bk_next', 'p1', 'group_workout', 'gw_2026-09-27', GW_NEXT, { createdAt: ago(DAY) });
  // p2 — a dead buy and a past private session of their own, which p1's reads must never touch
  spend('p2_token', 'w2', 'dunk_retry_token', 'coins', 50, UUID(9), ago(3 * DAY));
  spend('p2_private', 'w2', 'private_1on1', 'shards', 900, UUID(10), justBefore(ago(3 * DAY)));
  book('bk_p2', 'p2', 'private_1on1', 'pv_2026-09-24_16', PV_SEP24, { shardsPaid: 900 });
  return { store, rows };
}

const refundsIn = (store: Store) => store.entries.filter((e) => e.reasonCode === 'DEAD_BUY_REFUND');
const walletOf = (store: Store, playerId: string) => store.wallets.find((w) => w.playerId === playerId)!;
const bookingOf = (store: Store, id: string) => store.bookings.find((b) => b.id === id)!;
const statusOf = (store: Store) => Object.fromEntries(store.bookings.map((b) => [b.id, b.status]));

const P1_DEAD = {
  store_cap: { currency: 'coins', amount: 300, note: "We refunded 300 coins for Nexus Visor: it didn't deliver anything. Sorry about that." },
  store_toplab: { currency: 'coins', amount: 400, note: "We refunded 400 coins for Lab Compression Tee: it didn't deliver anything. Sorry about that." },
  store_dust: { currency: 'shards', amount: 400, note: "We refunded 400 shards for DUST kit: it didn't deliver anything. Sorry about that." },
  store_seminar: { currency: 'shards', amount: 250, note: "We refunded 250 shards for Seminar seat: it didn't deliver anything. Sorry about that." },
  store_plan: { currency: 'shards', amount: 60, note: "We refunded 60 shards for 4-Week Workout Plan: it didn't deliver anything. Sorry about that." },
  shop_jab: { currency: 'lc', amount: 80, note: "We refunded 80 Lab Credits for Jab Flow Drill: it didn't deliver anything. Sorry about that." },
  store_class: { currency: 'shards', amount: 300, note: "We refunded 300 shards for Monthly All-Access Pass: live classes haven't started yet. Sorry about that." },
} as const;
// the booking's refund is keyed on the charge it claims, so that charge reads as paid back like any other row
const P1_BOOKING = { key: refundKey('booked_group'), amount: 150, note: 'We refunded 150 shards for Group Workout, Wed, Sep 23, 5:30 PM PT: no link to join was ever posted. Sorry about that.' };
// 1000 + 300 + 400 coins; 2000 + 400 + 250 + 60 + 300 + 150 shards; 500 + 80 LC
const P1_AFTER = { coins: 1700n, shards: 3160n, lc: 580n };
const P1_REFUNDS = Object.keys(P1_DEAD).length + 1;

describe('GET /api/v1/wallet refunds what delivered nothing', () => {
  let store: Store;
  beforeEach(() => {
    vi.setSystemTime(NOW);
    ({ store } = seed());
    h.client = client(store);
    h.session = { user: { id: 'p1' } };
  });

  it('refunds exactly the dead rows and the unlinked past booking, once each, in their own currency, for what each took', async () => {
    const res = await GET();
    const body = await res.json();

    const refunds = refundsIn(store);
    expect(refunds.map((r) => r.idempotencyKey).sort()).toEqual([...Object.keys(P1_DEAD).map(refundKey), P1_BOOKING.key].sort());
    for (const r of refunds) {
      expect(r.walletId).toBe('w1');
      expect(r.source).toBe('refund');
      const was = r.idempotencyKey === P1_BOOKING.key ? { currency: 'shards', ...P1_BOOKING } : P1_DEAD[(r.metadata as { refundOf: keyof typeof P1_DEAD }).refundOf];
      expect(r.currency).toBe(was.currency);
      expect(r.delta).toBe(BigInt(was.amount));
      expect((r.metadata as { note: string }).note).toBe(was.note);
    }
    expect(walletOf(store, 'p1')).toMatchObject(P1_AFTER);
    expect(body).toMatchObject({ coins: 1700, shards: 3160, lc: 580 });
    // the balance each refund row records is the balance right after it
    const last = (cur: string) => refunds.filter((r) => r.currency === cur).at(-1)!.balanceAfter;
    expect([last('coins'), last('shards'), last('lc')]).toEqual([1700n, 3160n, 580n]);
  });

  it('hands the player the reason once, with the balance that went up', async () => {
    const body = await (await GET()).json();
    expect(body.refund_notes.map((n: { text: string }) => n.text).sort()).toEqual([...Object.values(P1_DEAD).map((d) => d.note), P1_BOOKING.note].sort());
    for (const n of body.refund_notes) expect(refundsIn(store).some((r) => r.id === n.id)).toBe(true);
    // two weeks on, the toast is no longer offered (the history keeps it)
    expect(refundNotesFor(h.client as object, 'p1', new Date(NOW.getTime() + 15 * DAY * 60_000))).toEqual([]);
  });

  it('skips every delivering row: the Closet buy, the Room\'s kit, the boost card, and the charges bookings claim (one paid back once, as its booking\'s)', async () => {
    await GET();
    const refunded = refundsIn(store).map((r) => (r.metadata as { refundOf: string }).refundOf);
    for (const id of ['closet_toplab', 'room_neon', 'store_boost', 'charge_linked', 'charge_cancelled', 'charge_next']) expect(refunded, id).not.toContain(id);
    // the charge bk_group claims came back once, as bk_group's refund, and stays claimed on a later read too
    expect(refundsIn(store).filter((r) => (r.metadata as { refundOf: string }).refundOf === 'booked_group').map((r) => (r.metadata as { booking?: string }).booking)).toEqual(['bk_group']);
    expect(bookingOf(store, 'bk_group').status).toBe('refunded');
    await readWallet(client(store) as never, 'p1');
    expect(refundsIn(store).filter((r) => (r.metadata as { refundOf: string }).refundOf === 'booked_group')).toHaveLength(1);
    expect(walletOf(store, 'p1')).toMatchObject(P1_AFTER);
  });

  it('undoes the /shop sale: the LC is back and the hollow card leaves the shelf, in the same transaction', async () => {
    await GET();
    expect(store.cards).toEqual([{ userId: 'p1', cardKey: 'some-catalog-card' }]);
    expect(store.creditLedger).toEqual([{ userId: 'p1', amount: 80, reason: 'DEAD_BUY_REFUND', dedupeKey: 'refund:shop_jab' }]);
  });

  // Owner decision 2026-09-25: a pass is paid back and its entitlement row goes with it; nothing else's row moves.
  it('undoes the class pass: the shards are back and its entitlement row is deleted, the boost card\'s row untouched', async () => {
    await GET();
    expect(store.entitlements).toEqual([{ playerId: 'p1', skuId: 'boost_card_neural-max', quantity: 1 }]);
    const r = refundsIn(store).find((e) => e.idempotencyKey === refundKey('store_class'))!;
    expect(r).toMatchObject({ currency: 'shards', delta: 300n, metadata: { refundOf: 'store_class', item: 'class_monthly', note: P1_DEAD.store_class.note } });
  });

  // Owner decision 2026-09-25: the player paid for a session they were never told how to join.
  it('pays a past booking back and marks it refunded, and leaves the linked, cancelled and upcoming ones alone', async () => {
    await GET();
    expect(statusOf(store)).toEqual({ bk_group: 'refunded', bk_linked: 'confirmed', bk_cancelled: 'cancelled', bk_free: 'refunded', bk_next: 'confirmed', bk_p2: 'confirmed' });
    const r = refundsIn(store).find((e) => e.idempotencyKey === P1_BOOKING.key)!;
    expect(r).toMatchObject({ currency: 'shards', delta: 150n, metadata: { refundOf: 'booked_group', booking: 'bk_group', sessionKey: 'gw_2026-09-23', kind: 'group_workout', note: P1_BOOKING.note } });
    // a booking of 0 shards is only closed: no ledger row, no note
    expect(refundsIn(store).some((e) => (e.metadata as { booking?: string }).booking === 'bk_free')).toBe(false);
    expect(refundNotesFor(h.client as object, 'p1').some((n) => /Sep 11/.test(n.text))).toBe(false);
  });

  it('never touches another player', async () => {
    await GET();
    expect(walletOf(store, 'p2')).toMatchObject({ coins: 10n, shards: 10n, lc: 10n, version: 1n });
    expect(bookingOf(store, 'bk_p2').status).toBe('confirmed');
    expect(refundsIn(store).every((r) => r.walletId === 'w1')).toBe(true);
    // p2's own read refunds p2's own row and p2's own past session, and only those
    h.session = { user: { id: 'p2' } };
    await GET();
    expect(walletOf(store, 'p2')).toMatchObject({ coins: 60n, shards: 910n });
    expect(refundsIn(store).filter((r) => r.walletId === 'w2').map((r) => r.idempotencyKey).sort()).toEqual([refundKey('p2_token'), refundKey('p2_private')].sort());
    expect(bookingOf(store, 'bk_p2').status).toBe('refunded');
    expect(refundNotesFor(h.client as object, 'p2').map((n) => n.text)).toContain('We refunded 900 shards for Private 1-on-1, Thu, Sep 24, 4:00 PM PT: no link to join was ever posted. Sorry about that.');
    expect(walletOf(store, 'p1')).toMatchObject(P1_AFTER);
  });

  it('is idempotent: a second read writes nothing and costs no ledger read; a fresh server instance writes nothing either', async () => {
    await GET();
    const after = structuredClone({ wallets: store.wallets, entries: store.entries, bookings: store.bookings, entitlements: store.entitlements });
    const queries = store.sweepQueries;
    const again = await (await GET()).json();
    expect(store.sweepQueries).toBe(queries);   // remembered on this instance: no ledger read at all
    expect(again.refund_notes).toHaveLength(P1_REFUNDS);
    // another instance has no memory: it reads the ledger once, finds the refunds, and writes nothing
    const other = client(store);
    const view = await readWallet(other as never, 'p1');
    expect(store.sweepQueries).toBe(queries + 1);
    expect(view).toMatchObject({ coins: 1700, shards: 3160, lc: 580 });
    expect({ wallets: store.wallets, entries: store.entries, bookings: store.bookings, entitlements: store.entitlements }).toEqual(after);
    expect(refundNotesFor(other, 'p1')).toHaveLength(P1_REFUNDS);
  });

  it('looks at a player again once their next booked session is over, on the same instance, and pays that one back then', async () => {
    await GET();
    const queries = store.sweepQueries;
    vi.setSystemTime(new Date(GW_NEXT.getTime() + 59 * 60_000));   // still running: nothing to look at
    await GET();
    expect(store.sweepQueries).toBe(queries);
    expect(bookingOf(store, 'bk_next').status).toBe('confirmed');
    vi.setSystemTime(new Date(GW_NEXT.getTime() + 61 * 60_000));   // over, and no link was ever posted
    const body = await (await GET()).json();
    expect(store.sweepQueries).toBe(queries + 1);
    expect(bookingOf(store, 'bk_next').status).toBe('refunded');
    expect(walletOf(store, 'p1').shards).toBe(P1_AFTER.shards + 150n);
    expect(body.refund_notes.map((n: { text: string }) => n.text)).toContain('We refunded 150 shards for Group Workout, Sun, Sep 27, 11:00 AM PT: no link to join was ever posted. Sorry about that.');
    // with a link posted before it ended, it would have been left alone
    const { store: s } = seed();
    s.links.add('gw_2026-09-27');
    vi.setSystemTime(new Date(GW_NEXT.getTime() + 61 * 60_000));
    await readWallet(client(s) as never, 'p1');
    expect(bookingOf(s, 'bk_next').status).toBe('confirmed');
  });

  it('two instances reading at once refund each row once', async () => {
    const a = client(store), b = client(store);
    await Promise.all([readWallet(a as never, 'p1'), readWallet(b as never, 'p1'), readWallet(a as never, 'p1')]);
    expect(refundsIn(store)).toHaveLength(P1_REFUNDS);
    expect(walletOf(store, 'p1')).toMatchObject(P1_AFTER);
    expect(bookingOf(store, 'bk_group').status).toBe('refunded');
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
    expect(walletOf(store, 'p1')).toMatchObject(P1_AFTER);   // 300 once, not twice
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

  it('losing the race on a class pass rolls back our entitlement delete with the credit: the row is exactly as the winner left it', async () => {
    // a winner that (unlike the real code) left the entitlement row: if ours had landed, the row would be gone
    store.beforeInsert = (key) => {
      if (key !== refundKey('store_class') || store.entries.some((e) => e.idempotencyKey === key)) return;
      walletOf(store, 'p1').shards += 300n;
      store.entries.push({ id: 'winner_pass', walletId: 'w1', currency: 'shards', delta: 300n, balanceAfter: 2300n, reasonCode: 'DEAD_BUY_REFUND', source: 'refund', idempotencyKey: key, metadata: { refundOf: 'store_class', note: P1_DEAD.store_class.note }, createdAt: new Date() });
    };
    await GET();
    expect(walletOf(store, 'p1').shards).toBe(P1_AFTER.shards);   // 300 once
    expect(store.entitlements.some((e) => e.skuId === 'class_monthly')).toBe(true);
  });

  it('losing the race on a booking rolls back our status flip with the credit, and the shards come back once', async () => {
    store.beforeInsert = (key) => {
      if (key !== P1_BOOKING.key || store.entries.some((e) => e.idempotencyKey === key)) return;
      walletOf(store, 'p1').shards += 150n;
      bookingOf(store, 'bk_group').status = 'refunded';
      store.entries.push({ id: 'winner_bk', walletId: 'w1', currency: 'shards', delta: 150n, balanceAfter: 0n, reasonCode: 'DEAD_BUY_REFUND', source: 'refund', idempotencyKey: key, metadata: { refundOf: 'booked_group', booking: 'bk_group', note: P1_BOOKING.note }, createdAt: new Date() });
    };
    const body = await (await GET()).json();
    expect(walletOf(store, 'p1').shards).toBe(P1_AFTER.shards);
    expect(refundsIn(store).filter((r) => r.idempotencyKey === P1_BOOKING.key).map((r) => r.id)).toEqual(['winner_bk']);
    expect(bookingOf(store, 'bk_group').status).toBe('refunded');
    expect(body.refund_notes.filter((n: { id: string }) => n.id === 'winner_bk')).toHaveLength(1);
  });

  it('a booking closed by somebody else between our read and our write is not paid back: the status flip guards the credit', async () => {
    store.beforeInsert = (key) => { if (key === P1_BOOKING.key) bookingOf(store, 'bk_group').status = 'refunded'; };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await GET();
    expect(refundsIn(store).some((r) => r.idempotencyKey === P1_BOOKING.key)).toBe(false);
    expect(walletOf(store, 'p1').shards).toBe(P1_AFTER.shards - 150n);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('booking bk_group'), expect.anything());
    // not remembered as done, so the next read looks again; the booking is no longer confirmed, so nothing more happens
    const queries = store.sweepQueries;
    await GET();
    expect(store.sweepQueries).toBe(queries + 1);
    expect(refundsIn(store).some((r) => r.idempotencyKey === P1_BOOKING.key)).toBe(false);
    warn.mockRestore();
  });

  it('pays no booking back while the SessionJoinLink table is not in the database, and does once it is', async () => {
    store.linkTable = false;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = await (await GET()).json();
    // the ledger's refunds still happen; no booking moves
    expect(refundsIn(store).map((r) => r.idempotencyKey).sort()).toEqual(Object.keys(P1_DEAD).map(refundKey).sort());
    expect(statusOf(store)).toEqual({ bk_group: 'confirmed', bk_linked: 'confirmed', bk_cancelled: 'cancelled', bk_free: 'confirmed', bk_next: 'confirmed', bk_p2: 'confirmed' });
    expect(walletOf(store, 'p1').shards).toBe(P1_AFTER.shards - 150n);
    expect(body.refund_notes).toHaveLength(P1_REFUNDS - 1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('join links unreadable (P2021)'));
    // not remembered as done: the next read looks again, and pays the booking back once the table is there
    const queries = store.sweepQueries;
    await GET();
    expect(store.sweepQueries).toBe(queries + 1);
    expect(bookingOf(store, 'bk_group').status).toBe('confirmed');
    store.linkTable = true;
    await GET();
    expect(bookingOf(store, 'bk_group').status).toBe('refunded');
    expect(walletOf(store, 'p1')).toMatchObject(P1_AFTER);
    expect(refundsIn(store)).toHaveLength(P1_REFUNDS);
    warn.mockRestore();
  });

  it('pays no booking back on a client that predates the model, or when the link read fails for any other reason', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    store.accessor = false;
    await GET();
    expect(bookingOf(store, 'bk_group').status).toBe('confirmed');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('join links unreadable (no accessor)'));
    store.accessor = true;
    const s2 = seed().store;
    const broken = client(s2);
    Object.defineProperty(broken, 'sessionJoinLink', { value: { findMany: async () => { throw Object.assign(new Error('unreachable'), { code: 'P1001' }); } } });
    await readWallet(broken as never, 'p1');
    expect(bookingOf(s2, 'bk_group').status).toBe('confirmed');
    expect(walletOf(s2, 'p1').shards).toBe(P1_AFTER.shards - 150n);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('join links unreadable (P1001)'));
    warn.mockRestore();
  });

  it('leaves a row younger than ten minutes for a later read, then refunds it', async () => {
    const { store: s } = seed();
    s.entries = s.entries.filter((e) => e.id === 'p2_token');
    s.bookings = [];
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

// Found in review 2026-09-25. The booking route answered a used key with its old receipt and booked another slot on it,
// so one charge could back several bookings, and the sweep paid each one back its own shardsPaid: shards from nothing.
// A booking now gets back only the charge it claims, under that charge's key, and the route refuses a used key.
describe('a booking is paid back the charge that booked it, once', () => {
  const bare = (): Store => ({
    wallets: [
      { id: 'w1', playerId: 'p1', coins: 0n, shards: 1000n, lc: 0n, version: 1n, updatedAt: ago(DAY) },
      { id: 'w2', playerId: 'p2', coins: 0n, shards: 1000n, lc: 0n, version: 1n, updatedAt: ago(DAY) },
    ],
    entries: [], owned: [], bookings: [], plans: [], cards: [], entitlements: [], creditLedger: [], links: new Set(), linkTable: true, accessor: true, sweepQueries: 0,
  });
  const charge = (s: Store, id: string, walletId: string, sku: string, price: number, key: string, createdAt: Date) => s.entries.push({
    id, walletId, currency: 'shards', delta: BigInt(-price), balanceAfter: 0n, reasonCode: 'SPEND_CATALOG_ITEM', source: 'spend',
    idempotencyKey: key, metadata: { skuId: sku, quantity: 1, unitPrice: price }, createdAt,
  });
  const booking = (s: Store, id: string, userId: string, kind: string, sessionKey: string, startsAt: Date, createdAt: Date, shardsPaid = 150) =>
    s.bookings.push({ id, userId, kind, sessionKey, status: 'confirmed', shardsPaid, startsAt, createdAt });
  const later = (ms: number) => new Date(NOW.getTime() + ms);
  let tick = 0;
  const bookAs = (userId: string, sessionKey: string, key: string) => {
    vi.setSystemTime(later(++tick * 1000));   // each call a second after the last, as a player's taps would be
    h.session = { user: { id: userId } };
    return post(sessionsBook, { kind: 'group_workout', sessionKey, idempotency_key: key });
  };
  beforeEach(() => { vi.setSystemTime(NOW); tick = 0; });

  it('a used key books nothing more: one charge, one seat, and only that seat is paid back when it ends with no link', async () => {
    const s = bare();
    h.client = client(s);
    const slots = upcomingGroupSlots(NOW, 6);
    for (const [key, mine] of [['mine:1', slots.slice(0, 3)], [UUID(80), slots.slice(3, 6)]] as const) {
      expect((await bookAs('p1', mine[0].sessionKey, key)).status, key).toBe(200);
      for (const slot of mine.slice(1)) {
        const res = await bookAs('p1', slot.sessionKey, key);
        expect(res.status, key).toBe(409);
        expect(await res.json(), key).toEqual({ error: 'replayed_key' });
      }
      // the same slot again is the booking it made, answered as such, and charges nothing
      expect(await (await bookAs('p1', mine[0].sessionKey, key)).json(), key).toMatchObject({ booked: true, alreadyBooked: true });
    }
    const charges = s.entries.filter((e) => e.reasonCode === 'SPEND_CATALOG_ITEM');
    expect(charges.map((e) => e.idempotencyKey)).toEqual(['mine:1', UUID(80)]);
    expect(s.bookings.map((b) => b.sessionKey)).toEqual([slots[0].sessionKey, slots[3].sessionKey]);
    expect(walletOf(s, 'p1').shards).toBe(700n);
    // every session over, none with a link: each seat's own charge comes back, once, keyed on that charge
    vi.setSystemTime(new Date(Date.parse(slots[5].startsAtIso) + 61 * 60_000));
    await readWallet(client(s) as never, 'p1');
    expect(walletOf(s, 'p1').shards).toBe(1000n);
    expect(refundsIn(s).map((r) => r.idempotencyKey).sort()).toEqual(charges.map((e) => refundKey(e.id)).sort());
    expect(s.bookings.map((b) => b.status)).toEqual(['refunded', 'refunded']);
    // and a paid-back charge's key books nothing either
    const next = upcomingGroupSlots(new Date(), 1)[0];
    for (const key of ['mine:1', UUID(80)]) expect((await post(sessionsBook, { kind: 'group_workout', sessionKey: next.sessionKey, idempotency_key: key })).status, key).toBe(409);
    expect(walletOf(s, 'p1').shards).toBe(1000n);
  });

  it('bookings already made on one charge\'s receipt: the charge comes back once, the other seats are closed with nothing, and the key replays nothing', async () => {
    const s = bare();
    h.client = client(s);
    const t0 = ago(10 * DAY);
    charge(s, 'c1', 'w1', 'session_group_workout', 150, 'mine:1', t0);
    booking(s, 'bk_a', 'p1', 'group_workout', 'gw_2026-09-16', GW_SEP16, new Date(t0.getTime() + 50));
    booking(s, 'bk_b', 'p1', 'group_workout', 'gw_2026-09-18', GW_SEP18, new Date(t0.getTime() + 60_000));
    booking(s, 'bk_c', 'p1', 'group_workout', 'gw_2026-09-23', GW_SEP23, new Date(t0.getTime() + 120_000));
    const body = await (await GET()).json();
    expect(walletOf(s, 'p1').shards).toBe(1150n);
    expect(refundsIn(s).map((r) => [r.idempotencyKey, r.delta, (r.metadata as { booking: string }).booking])).toEqual([[refundKey('c1'), 150n, 'bk_a']]);
    expect(statusOf(s)).toEqual({ bk_a: 'refunded', bk_b: 'refunded', bk_c: 'refunded' });
    expect(body.refund_notes).toHaveLength(1);
    // a fresh instance pays nothing more, and the key is no receipt now
    await readWallet(client(s) as never, 'p1');
    expect(walletOf(s, 'p1').shards).toBe(1150n);
    await expect(spend(h.client as never, { playerId: 'p1', idempotencyKey: 'mine:1', skuId: 'session_group_workout', quantity: 1 })).rejects.toMatchObject({ code: 'REPLAYED_KEY' });
  });

  it('a private slot two players raced into: its link was the first booker\'s alone, so the second is paid back and the first is not', async () => {
    const s = bare();
    const t0 = ago(3 * DAY);
    charge(s, 'c_p1', 'w1', 'private_1on1', 900, UUID(90), t0);
    booking(s, 'bk_first', 'p1', 'private_1on1', 'pv_2026-09-24_16', PV_SEP24, new Date(t0.getTime() + 50), 900);
    charge(s, 'c_p2', 'w2', 'private_1on1', 900, UUID(91), new Date(t0.getTime() + 20));
    booking(s, 'bk_second', 'p2', 'private_1on1', 'pv_2026-09-24_16', PV_SEP24, new Date(t0.getTime() + 70), 900);
    s.links.add('pv_2026-09-24_16');
    const c = client(s);
    await readWallet(c as never, 'p1');
    await readWallet(c as never, 'p2');
    expect(statusOf(s)).toEqual({ bk_first: 'confirmed', bk_second: 'refunded' });
    expect(walletOf(s, 'p1').shards).toBe(1000n);
    expect(walletOf(s, 'p2').shards).toBe(1900n);
    expect(refundsIn(s).map((r) => r.idempotencyKey)).toEqual([refundKey('c_p2')]);
  });

  it('a player swept with nothing booked is looked at again once a session they book afterwards ends, on any server instance', async () => {
    const s = bare();
    const a = client(s), b = client(s);
    await readWallet(a as never, 'p1');
    await readWallet(b as never, 'p1');   // both instances now remember p1 as done, with nothing to come
    const queries = s.sweepQueries;
    await readWallet(b as never, 'p1');
    expect(s.sweepQueries).toBe(queries);   // nothing booked since: no ledger read
    h.client = a;
    const slot = upcomingGroupSlots(NOW, 1)[0];
    expect((await bookAs('p1', slot.sessionKey, UUID(95))).status).toBe(200);   // booked through instance a
    expect(walletOf(s, 'p1').shards).toBe(850n);
    // on instance b, which never saw the booking: once the session is over with no link, the charge comes back
    vi.setSystemTime(new Date(Date.parse(slot.startsAtIso) + 61 * 60_000));
    await readWallet(b as never, 'p1');
    expect(walletOf(s, 'p1').shards).toBe(1000n);
    expect(s.bookings.map((x) => x.status)).toEqual(['refunded']);
    await readWallet(a as never, 'p1');   // and instance a pays nothing twice
    expect(walletOf(s, 'p1').shards).toBe(1000n);
    expect(refundsIn(s)).toHaveLength(1);
  });
});

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
    squat('attacker_pass', 'store_class', 'shards');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = await (await GET()).json();
    // top_lab's 400 back; cap_nexus, the card and the pass not, and the pass's entitlement row stays with its charge
    expect(walletOf(store, 'p1')).toMatchObject({ coins: 1400n, shards: P1_AFTER.shards - 300n, lc: 500n });
    expect(store.cards.some((c) => c.cardKey === 'drill-jab-flow')).toBe(true);
    expect(store.entitlements.some((e) => e.skuId === 'class_monthly')).toBe(true);
    for (const id of ['attacker_lc', 'attacker_coins', 'attacker_pass']) expect(body.refund_notes.map((n: { id: string }) => n.id)).not.toContain(id);
    expect(body.refund_notes).toHaveLength(P1_REFUNDS - 3);
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

  // Owner decision 2026-09-25: the refund must not leave a key that replays as a receipt. A pass's charge is keyed by
  // the browser, so a buy once classes exist comes under a new key and is charged; the old key buys nothing.
  it('a class pass whose charge was refunded is charged again if it is ever un-held; the old key and the refund key buy nothing', async () => {
    await GET();
    expect(walletOf(store, 'p1').shards).toBe(P1_AFTER.shards);
    expect(store.entitlements.some((e) => e.skuId === 'class_monthly')).toBe(false);
    // while held: the old key is refused as another purchase's, not answered with the old receipt
    const held = await post(walletSpend, { sku_id: 'class_monthly', idempotency_key: UUID(8) });
    expect(held.status).toBe(400);
    expect(await held.json()).toEqual({ error: 'replayed_key' });
    (NOT_ON_SALE as Set<string>).delete('class_monthly');
    try {
      for (const key of [UUID(8), refundKey('store_class')]) {
        const res = await post(walletSpend, { sku_id: 'class_monthly', idempotency_key: key });
        expect(res.status, key).toBe(400);
        expect(await res.json(), key).toEqual({ error: 'replayed_key' });
      }
      expect(walletOf(store, 'p1').shards).toBe(P1_AFTER.shards);
      expect(store.entitlements.some((e) => e.skuId === 'class_monthly')).toBe(false);
      // a fresh key is a fresh purchase: charged, and the entitlement row is written again
      const fresh = await post(walletSpend, { sku_id: 'class_monthly', idempotency_key: UUID(60) });
      expect(fresh.status).toBe(200);
      expect(await fresh.json()).toMatchObject({ spent: { currency: 'shards', amount: 300 } });
      expect(walletOf(store, 'p1').shards).toBe(P1_AFTER.shards - 300n);
      expect(store.entitlements.filter((e) => e.skuId === 'class_monthly')).toEqual([{ playerId: 'p1', skuId: 'class_monthly', quantity: 1 }]);
      // its own retry is a receipt, not a second charge; a fresh instance refunds nothing (the charge is inside the grace)
      const retry = await post(walletSpend, { sku_id: 'class_monthly', idempotency_key: UUID(60) });
      expect((await retry.json()).entry_id).toBe((store.entries.find((e) => e.idempotencyKey === UUID(60)))!.id);
      expect(walletOf(store, 'p1').shards).toBe(P1_AFTER.shards - 300n);
      await readWallet(client(store) as never, 'p1');
      expect(walletOf(store, 'p1').shards).toBe(P1_AFTER.shards - 300n);
    } finally {
      (NOT_ON_SALE as Set<string>).add('class_monthly');
    }
  });

  it('a boost card: the first charge delivered, a later /store charge of the same card is refunded', async () => {
    const s: Store = { ...seed().store, wallets: [{ id: 'w1', playerId: 'p1', coins: 0n, shards: 100n, lc: 0n, version: 1n, updatedAt: ago(DAY) }], entries: [], bookings: [], entitlements: [] };
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

  // Owner decision 2026-09-25: a plan no plan claims is paid back with or without a scan or plan on file.
  it('a workout plan: a /store charge no plan claims is refunded even with nothing else on file; the Workout charge its plan claims is not', async () => {
    const s: Store = { ...seed().store, wallets: [{ id: 'w1', playerId: 'p1', coins: 0n, shards: 100n, lc: 0n, version: 1n, updatedAt: ago(DAY) }], entries: [], bookings: [], entitlements: [] };
    const charge = (id: string, price: number, key: string, createdAt: Date) => s.entries.push({
      id, walletId: 'w1', currency: 'shards', delta: BigInt(-price), balanceAfter: 0n, reasonCode: 'SPEND_CATALOG_ITEM', source: 'spend',
      idempotencyKey: key, metadata: { skuId: 'workout_program_12w', quantity: 1, unitPrice: price }, createdAt,
    });
    charge('store_program', 200, UUID(70), ago(5 * DAY));
    charge('workout_program', 200, UUID(71), ago(2 * DAY));
    s.plans.push({ userId: 'p1', tier: 'program_12w', createdAt: new Date(ago(2 * DAY).getTime() + 50) });
    await readWallet(client(s) as never, 'p1');
    expect(s.entries.filter((e) => e.reasonCode === 'DEAD_BUY_REFUND').map((r) => (r.metadata as { refundOf: string }).refundOf)).toEqual(['store_program']);
    expect(s.wallets[0].shards).toBe(300n);
  });
});

// MUSIC-SUITE P2 (2026-09-25): the Music Room reads its kits from the account (GET /api/music/unlock), which until today
// had no caller — the reason the kits could be client_key ("nothing calls the entitlement read", dead-buys.ts). A /store
// kit charge wrote the same PlayerEntitlement row that read looks at, and a kit's refund never took that row back. So the
// read counts a row only with a charge the dead-buy rules keep (dead-buys.ts backedEntitlements), and here that is
// proven on the real routes, the real sweep and the real spend(): refunds stay exactly what they were, and nobody ends
// up with both the shards and the kit, or with two charges for one kit.
describe('the Music Room\'s kits come from the account, and a refund still means the kit is not yours', () => {
  let store: Store;
  beforeEach(() => {
    vi.setSystemTime(NOW);
    ({ store } = seed());
    // the rows spend() wrote with p1's two kit charges: /store's DUST (dead) and the Room's own NEON (delivered)
    store.entitlements.push({ playerId: 'p1', skuId: 'music_kit_dust', quantity: 1 }, { playerId: 'p1', skuId: 'music_kit_neon', quantity: 1 });
    h.client = client(store);
    h.session = { user: { id: 'p1' } };
  });
  const entitled = (sku: string, playerId = 'p1') => store.entitlements.some((e) => e.playerId === playerId && e.skuId === sku);
  const kitCharges = (sku: string, walletId = 'w1') => store.entries.filter((e) => e.walletId === walletId && e.reasonCode === 'SPEND_CATALOG_ITEM' && (e.metadata as { skuId?: string }).skuId === sku);

  it('lists the Room-bought kit; the /store kit is paid back on this very read and is not listed, though its row stays', async () => {
    const res = await musicOwned();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ owned: ['music_kit_neon'], shards: Number(P1_AFTER.shards) });
    expect(refundsIn(store).map((r) => r.idempotencyKey)).toContain(refundKey('store_dust'));   // the rule is unchanged
    expect(entitled('music_kit_dust')).toBe(true);   // a kit's refund takes nothing back, which is why the read must look past the row
    expect(ownedReadFromResponse(res.status, body)).toEqual({ ok: true, owned: ['music_kit_neon'], shards: 3160 });
  });

  it('a kit bought on /store AND in the Room: the /store charge is paid back, the Room\'s backs it — paid once, owned once', async () => {
    store.entries.push({
      id: 'store_neon', walletId: 'w1', currency: 'shards', delta: -200n, balanceAfter: 0n, reasonCode: 'SPEND_CATALOG_ITEM', source: 'spend',
      idempotencyKey: UUID(40), metadata: { skuId: 'music_kit_neon', quantity: 1, unitPrice: 200 }, createdAt: ago(4 * DAY),
    });
    const body = await (await musicOwned()).json();
    expect(body.owned).toEqual(['music_kit_neon']);
    expect(refundsIn(store).map((r) => r.idempotencyKey)).toEqual(expect.arrayContaining([refundKey('store_neon'), refundKey('store_dust')]));
    expect(walletOf(store, 'p1').shards).toBe(P1_AFTER.shards + 200n);
    const kept = kitCharges('music_kit_neon').filter((e) => !refundsIn(store).some((r) => r.idempotencyKey === refundKey(e.id)));
    expect(kept.map((e) => e.id)).toEqual(['room_neon']);
  });

  it('a kit paid back before this read (its row left behind) is for sale in the Room: one charge, then owned; a second buy replays', async () => {
    await GET();   // /api/v1/wallet: the sweep pays the /store DUST back, exactly as it did before P2
    expect((await (await musicOwned()).json()).owned).toEqual(['music_kit_neon']);
    const bought = await post(musicBuy, { sku: 'music_kit_dust' });
    expect(bought.status).toBe(200);
    expect(spendResultFromStatus(bought.status, await bought.json())).toEqual({ ok: true, shards: Number(P1_AFTER.shards) - 400 });
    expect((await (await musicOwned()).json())).toEqual({ owned: ['music_kit_dust', 'music_kit_neon'], shards: Number(P1_AFTER.shards) - 400 });
    const again = await post(musicBuy, { sku: 'music_kit_dust' });
    expect(again.status).toBe(200);
    expect(walletOf(store, 'p1').shards).toBe(P1_AFTER.shards - 400n);
    expect(kitCharges('music_kit_dust').map((e) => e.idempotencyKey)).toEqual([UUID(4), 'music:p1:music_kit_dust']);
    // and the sweep never touches the Room's charge
    await readWallet(client(store) as never, 'p1');
    expect(refundsIn(store).some((r) => r.idempotencyKey === refundKey(kitCharges('music_kit_dust')[1].id))).toBe(false);
  });

  it('a /store kit charge the sweep has not reached yet (inside the grace) is not a kit either, then or after its refund', async () => {
    h.session = { user: { id: 'p2' } };
    store.entries.push({
      id: 'young_neon', walletId: 'w2', currency: 'shards', delta: -200n, balanceAfter: 0n, reasonCode: 'SPEND_CATALOG_ITEM', source: 'spend',
      idempotencyKey: UUID(41), metadata: { skuId: 'music_kit_neon', quantity: 1, unitPrice: 200 }, createdAt: ago(1),
    });
    store.entitlements.push({ playerId: 'p2', skuId: 'music_kit_neon', quantity: 1 });
    expect((await (await musicOwned()).json()).owned).toEqual([]);
    expect(refundsIn(store).some((r) => r.idempotencyKey === refundKey('young_neon'))).toBe(false);
    vi.setSystemTime(new Date(NOW.getTime() + 15 * 60_000));
    expect((await (await musicOwned()).json()).owned).toEqual([]);
    expect(refundsIn(store).some((r) => r.idempotencyKey === refundKey('young_neon'))).toBe(true);
  });

  it('never lists another player\'s kit', async () => {
    h.session = { user: { id: 'p2' } };
    expect((await (await musicOwned()).json()).owned).toEqual([]);
  });

  it('a failed read is a 503 the room keeps its cache on — never "you own nothing"', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.client = { ...client(store), playerEntitlement: { findMany: async () => { throw new Error('db down'); } } };
    const res = await musicOwned();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: 'unavailable' });
    expect(ownedReadFromResponse(res.status, body)).toEqual({ ok: false, reason: 'unreachable' });
    err.mockRestore();
  });

  it('signed out: 401 from both, which the room says as "Sign in to unlock"', async () => {
    h.session = null;
    const read = await musicOwned();
    const buy = await post(musicBuy, { sku: 'music_kit_dust' });
    expect([read.status, buy.status]).toEqual([401, 401]);
    const r = spendResultFromStatus(buy.status, await buy.json());
    expect(r.ok ? '' : SPEND_FAILURE_TEXT[r.reason]).toBe('Sign in to unlock');
  });

  it('a buy the wallet cannot cover is a 409 the room reads as "Not enough Shards", and nothing moves', async () => {
    walletOf(store, 'p1').shards = 100n;
    h.session = { user: { id: 'p1' } };
    await GET();   // settle the refunds first, so the balance below is only this buy's doing
    walletOf(store, 'p1').shards = 100n;
    const before = store.entries.length;
    const res = await post(musicBuy, { sku: 'music_kit_dust' });
    expect(res.status).toBe(409);
    const r = spendResultFromStatus(res.status, await res.json());
    expect(r.ok ? '' : SPEND_FAILURE_TEXT[r.reason]).toBe('Not enough Shards');
    expect(store.entries.length).toBe(before);
    expect(walletOf(store, 'p1').shards).toBe(100n);
    // an item the room does not sell is refused, not "broke"
    const unknown = await post(musicBuy, { sku: 'music_kit_gold' });
    const u = spendResultFromStatus(unknown.status, await unknown.json());
    expect([unknown.status, u]).toEqual([404, { ok: false, reason: 'refused' }]);
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
