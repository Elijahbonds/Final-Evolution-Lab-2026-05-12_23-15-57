// tests/helpers/fakeCoachBusinessDb.ts — COACH-BUSINESS: an in-memory stand-in for the coach-business tables that answers
// lib/coach-business/store.ts's named statements (SQL.*) with the same semantics (ON CONFLICT, compare-and-set counts).
// Any statement it does not know throws, so a new query cannot pass a test by accident. The real-Postgres proof of the
// same statements is tests/coach-business/store.integration.test.ts.
import { SQL } from '@/lib/coach-business/store';
import type { LedgerPost } from '@/lib/coach-business/webhook';

type Row = Record<string, any>;

export interface FakeState {
  ready: boolean;
  instructors: { userId: string; slug: string; displayName: string; headline: string | null; specialties: string[]; published: boolean }[];
  packages: Map<string, Row>;
  sales: Map<string, Row>;
  connect: Map<string, Row>;
  market: Map<string, Row>;
  highlights: Map<string, Row>;
  applications: Map<string, Row>;
  users: Map<string, { name: string; email: string }>;
  statements: string[];
}

export function fakeCoachBusinessDb(init: Partial<Pick<FakeState, 'ready'>> = {}) {
  const s: FakeState = {
    ready: init.ready ?? true,
    instructors: [], packages: new Map(), sales: new Map(), connect: new Map(), market: new Map(), highlights: new Map(), applications: new Map(),
    users: new Map(), statements: [],
  };
  const name = (sql: string) => (Object.entries(SQL).find(([, v]) => v === sql)?.[0]) ?? (sql.includes('information_schema.tables') ? 'probe' : sql.includes('pg_advisory') ? 'lock' : null);
  const now = () => new Date();
  const holding = (r: Row, at: Date) => ['PAID', 'ACTIVE', 'PARTIALLY_REFUNDED'].includes(r.status) || (r.status === 'PENDING' && new Date(r.holdExpiresAt) > at);

  async function query(sql: string, ...v: any[]): Promise<any[]> {
    const n = name(sql);
    s.statements.push(n ?? sql);
    switch (n) {
      case 'probe': return s.ready ? [{ ok: 1 }] : [];
      case 'lock': case 'lockPackage': return [];
      case 'marketProfile': return s.market.has(v[0]) ? [{ ...s.market.get(v[0]) }] : [];
      case 'listedCoaches':
        return s.instructors.filter((i) => i.published && s.market.get(i.userId)?.listed).map((i) => ({ ...i, ...s.market.get(i.userId) }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
      case 'packagesFor': return [...s.packages.values()].filter((p) => p.coachId === v[0]).sort((a, b) => a.sortOrder - b.sortOrder);
      case 'activePackagesFor': return [...s.packages.values()].filter((p) => v[0].includes(p.coachId) && p.active).sort((a, b) => a.sortOrder - b.sortOrder);
      case 'packageById': return s.packages.has(v[0]) ? [{ ...s.packages.get(v[0]) }] : [];
      case 'countPackages': return [{ n: [...s.packages.values()].filter((p) => p.coachId === v[0]).length }];
      case 'takenFor': {
        const counts = new Map<string, number>();
        for (const r of s.sales.values()) if (v[0].includes(r.packageId) && holding(r, v[1])) counts.set(r.packageId, (counts.get(r.packageId) ?? 0) + 1);
        return [...counts].map(([packageId, c]) => ({ packageId, n: c }));
      }
      case 'connectFor': return s.connect.has(v[0]) ? [{ ...s.connect.get(v[0]) }] : [];
      case 'saleById': return s.sales.has(v[0]) ? [{ ...s.sales.get(v[0]) }] : [];
      case 'salesForCoach':
        return [...s.sales.values()].filter((r) => r.coachId === v[0] && r.status !== 'PENDING' && r.status !== 'EXPIRED')
          .map((r) => ({ ...r, title: s.packages.get(r.packageId)?.title ?? '' }));
      case 'highlightsFor': return [...s.highlights.values()].filter((h) => h.coachId === v[0]).map((h) => ({ ...h }));
      case 'highlightById': return s.highlights.has(v[0]) ? [{ ...s.highlights.get(v[0]) }] : [];
      case 'applicationsFor':
        return [...s.applications.values()].filter((a) => a.coachId === v[0]).map((a) => ({ ...a, applicantName: s.users.get(a.applicantId)?.name ?? null, applicantEmail: s.users.get(a.applicantId)?.email ?? null }));
      default: throw new Error(`fakeCoachBusinessDb: unknown query ${sql.slice(0, 80)}`);
    }
  }

  async function execute(sql: string, ...v: any[]): Promise<number> {
    const n = name(sql);
    s.statements.push(n ?? sql);
    switch (n) {
      case 'upsertMarketProfile': s.market.set(v[0], { userId: v[0], listed: v[1], acceptingClients: v[2], sports: v[3], goals: v[4] }); return 1;
      case 'insertPackage':
        s.packages.set(v[0], { id: v[0], coachId: v[1], kind: v[2], title: v[3], summary: v[4], priceCents: v[5], includes: v[6], capacity: v[7], sessions: v[8], active: v[9], sortOrder: v[10] });
        return 1;
      case 'updatePackage': {
        const p = s.packages.get(v[0]);
        if (!p || p.coachId !== v[1]) return 0;
        Object.assign(p, { kind: v[2], title: v[3], summary: v[4], priceCents: v[5], includes: v[6], capacity: v[7], sessions: v[8], active: v[9] });
        return 1;
      }
      case 'insertConnect':
        if (s.connect.has(v[0])) return 0;
        s.connect.set(v[0], { userId: v[0], stripeAccountId: v[1], livemode: v[2], chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false });
        return 1;
      case 'updateConnect': {
        const r = [...s.connect.values()].find((c) => c.stripeAccountId === v[0]);
        if (!r) return 0;
        Object.assign(r, { chargesEnabled: v[1], payoutsEnabled: v[2], detailsSubmitted: v[3] });
        return 1;
      }
      case 'insertSale':
        s.sales.set(v[0], {
          id: v[0], packageId: v[1], coachId: v[2], buyerId: v[3], kind: v[4], status: 'PENDING', amountCents: v[5], feeCents: v[6],
          refundedCents: 0, feeRefundedCents: 0, stripeAccountId: v[7], livemode: v[8], holdExpiresAt: v[9], checkoutSessionId: null,
          paymentIntentId: null, subscriptionId: null, paidAt: null, createdAt: now(),
        });
        return 1;
      case 'attachCheckout': { const r = s.sales.get(v[0]); if (!r || r.checkoutSessionId) return 0; r.checkoutSessionId = v[1]; return 1; }
      case 'markPaid': {
        const r = s.sales.get(v[0]);
        if (!r || !['PENDING', 'EXPIRED'].includes(r.status)) return 0;
        Object.assign(r, { status: v[1], paymentIntentId: v[2] ?? r.paymentIntentId, subscriptionId: v[3] ?? r.subscriptionId, checkoutSessionId: r.checkoutSessionId ?? v[4], paidAt: now() });
        return 1;
      }
      case 'markExpired': { const r = s.sales.get(v[0]); if (!r || r.status !== 'PENDING') return 0; r.status = 'EXPIRED'; return 1; }
      case 'markCanceled': { const r = s.sales.get(v[0]); if (!r || r.status !== 'ACTIVE') return 0; r.status = 'CANCELED'; return 1; }
      case 'applyRefund': {
        const r = s.sales.get(v[0]);
        if (!r || r.refundedCents !== v[1]) return 0;
        Object.assign(r, { refundedCents: v[2], feeRefundedCents: r.feeRefundedCents + v[3], status: v[4] });
        return 1;
      }
      case 'insertHighlight': s.highlights.set(v[0], { id: v[0], coachId: v[1], clientId: v[2], text: v[3], consentAt: null, consentAdult: false, revokedAt: null }); return 1;
      case 'consentHighlight': { const h = s.highlights.get(v[0]); if (!h || h.clientId !== v[1]) return 0; Object.assign(h, { consentAt: now(), consentAdult: true, revokedAt: null }); return 1; }
      case 'revokeHighlight': { const h = s.highlights.get(v[0]); if (!h || (h.clientId !== v[1] && h.coachId !== v[1])) return 0; h.revokedAt = now(); return 1; }
      case 'upsertApplication': {
        const existing = [...s.applications.values()].find((a) => a.coachId === v[1] && a.applicantId === v[2]);
        if (existing) Object.assign(existing, { packageId: v[3], goal: v[4], note: v[5], status: 'OPEN' });
        else s.applications.set(v[0], { id: v[0], coachId: v[1], applicantId: v[2], packageId: v[3], goal: v[4], note: v[5], status: 'OPEN', createdAt: now() });
        return 1;
      }
      case 'setApplicationStatus': { const a = s.applications.get(v[0]); if (!a || a.coachId !== v[1]) return 0; a.status = v[2]; return 1; }
      default: throw new Error(`fakeCoachBusinessDb: unknown statement ${sql.slice(0, 80)}`);
    }
  }

  const db = {
    $queryRawUnsafe: query as any,
    $executeRawUnsafe: execute,
    async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> { return fn(db); },
  };
  return { db, state: s };
}

/** A ledger that keeps one row per idempotency key (LedgerTransaction.idempotencyKey is unique) and refuses an unbalanced one. */
export function fakeLedger() {
  const rows: LedgerPost[] = [];
  const keys = new Set<string>();
  return {
    rows,
    async post(tx: LedgerPost) {
      const sum = tx.postings.reduce((n, p) => n + p.amount, 0);
      if (sum !== 0 || tx.postings.some((p) => p.amount === 0 || !Number.isInteger(p.amount))) throw new Error('unbalanced');
      if (keys.has(tx.idempotencyKey)) return;
      keys.add(tx.idempotencyKey);
      rows.push(tx);
    },
    /** FEL's net platform revenue in cents (money in is a negative PLATFORM_REVENUE posting). */
    revenue(): number {
      return 0 - rows.flatMap((r) => r.postings).filter((p) => p.type === 'PLATFORM_REVENUE').reduce((n, p) => n + p.amount, 0) || 0;
    },
  };
}

/** Seed a coach with an active package and (optionally) a ready Connect account. */
export function seedCoach(state: FakeState, o: { coachId?: string; slug?: string; packageId?: string; kind?: string; priceCents?: number; capacity?: number | null; connect?: boolean } = {}) {
  const coachId = o.coachId ?? 'coach-1';
  const packageId = o.packageId ?? 'pkg-1';
  state.instructors.push({ userId: coachId, slug: o.slug ?? 'jordan-lee', displayName: 'Jordan Lee', headline: 'Jump coach', specialties: ['Vertical'], published: true });
  state.packages.set(packageId, {
    id: packageId, coachId, kind: o.kind ?? 'session_pack', title: '4 sessions', summary: 'Four live sessions', priceCents: o.priceCents ?? 19_999,
    includes: JSON.stringify(['4 live sessions', 'A written plan']), capacity: o.capacity === undefined ? 2 : o.capacity, sessions: (o.kind ?? 'session_pack') === 'session_pack' ? 4 : null, active: true, sortOrder: 0,
  });
  if (o.connect !== false) state.connect.set(coachId, { userId: coachId, stripeAccountId: `acct_${coachId}`, livemode: false, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true });
  return { coachId, packageId };
}
