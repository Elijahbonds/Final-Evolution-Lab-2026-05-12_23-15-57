// tests/helpers/fakeCoachBusinessDb.ts — COACH-BUSINESS: an in-memory stand-in for the coach-business tables that answers
// lib/coach-business/store.ts's named statements (SQL.*) with the same semantics (ON CONFLICT, compare-and-set counts).
// Any statement it does not know throws, so a new query cannot pass a test by accident. The real-Postgres proof of the
// same statements is tests/coach-business/store.integration.test.ts.
import { SQL } from '@/lib/coach-business/store';
import type { LedgerPost } from '@/lib/coach-business/webhook';

type Row = Record<string, any>;

export interface FakeState {
  ready: boolean;
  /** PAYMENTS-READY: prisma/pending/2026-10-26-payments-ready.sql applied (CoachSaleDispute + requirementsDue). */
  paymentsReady: boolean;
  disputes: Map<string, Row>;
  /** PAYMENTS-READY: the LedgerTransaction rows the monthly-cap read sees ({ kind, metadata, createdAt }). */
  ledger: { kind: string; metadata: Record<string, unknown>; createdAt: Date }[];
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

export function fakeCoachBusinessDb(init: Partial<Pick<FakeState, 'ready' | 'paymentsReady'>> = {}) {
  const s: FakeState = {
    ready: init.ready ?? true,
    paymentsReady: init.paymentsReady ?? true,
    disputes: new Map(),
    ledger: [],
    instructors: [], packages: new Map(), sales: new Map(), connect: new Map(), market: new Map(), highlights: new Map(), applications: new Map(),
    users: new Map(), statements: [],
  };
  const name = (sql: string) => (Object.entries(SQL).find(([, v]) => v === sql)?.[0])
    ?? (sql.includes('information_schema.tables') ? (sql.includes('CoachSaleDispute') ? 'paymentsReadyProbe' : 'probe') : sql.includes('pg_advisory') ? 'lock' : null);
  const now = () => new Date();
  const holding = (r: Row, at: Date) => ['PAID', 'ACTIVE', 'PARTIALLY_REFUNDED'].includes(r.status) || (r.status === 'PENDING' && new Date(r.holdExpiresAt) > at);

  async function query(sql: string, ...v: any[]): Promise<any[]> {
    const n = name(sql);
    s.statements.push(n ?? sql);
    switch (n) {
      case 'probe': return s.ready ? [{ ok: 1 }] : [];
      case 'paymentsReadyProbe': return s.ready && s.paymentsReady ? [{ ok: 1 }] : [];
      case 'connectDueFor': { const r = s.connect.get(v[0]); return r ? [{ requirementsDue: !!r.requirementsDue }] : []; }
      case 'connectByAccount': { const r = [...s.connect.values()].find((c) => c.stripeAccountId === v[0]); return r ? [{ ...r }] : []; }
      case 'saleByPaymentIntent': return [...s.sales.values()].filter((r) => r.paymentIntentId === v[0]).map((r) => ({ id: r.id }));
      case 'saleBySubscription': return [...s.sales.values()].filter((r) => r.subscriptionId === v[0]).map((r) => ({ id: r.id }));
      case 'coachFeesSince': {
        let n = 0;
        for (const t of s.ledger) {
          if (t.metadata.coachId !== v[0] || t.createdAt < v[1]) continue;
          if (t.kind === 'COACH_CONNECT_FEE') n += Number(t.metadata.feeCents ?? 0);
          else if (t.kind === 'COACH_CONNECT_FEE_REFUND') n -= Number(t.metadata.feeReturnedCents ?? 0);
        }
        return [{ n }];
      }
      case 'coachPendingFees':
        return [{ n: [...s.sales.values()].filter((r) => r.coachId === v[0] && r.status === 'PENDING' && new Date(r.holdExpiresAt) > v[1]).reduce((a, r) => a + r.feeCents, 0) }];
      case 'disputeById': return s.disputes.has(v[0]) ? [{ ...s.disputes.get(v[0]) }] : [];
      case 'disputesForCoach':
        return [...s.disputes.values()].filter((d) => d.coachId === v[0])
          .map((d) => ({ ...d, title: s.packages.get(s.sales.get(d.saleId)?.packageId)?.title ?? '' }));
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
      case 'updateConnectDue': {
        if (!s.paymentsReady) throw Object.assign(new Error('column "requirementsDue" of relation "CoachConnectAccount" does not exist'), { code: '42703' });
        const r = [...s.connect.values()].find((c) => c.stripeAccountId === v[0]);
        if (!r) return 0;
        Object.assign(r, { chargesEnabled: v[1], payoutsEnabled: v[2], detailsSubmitted: v[3], requirementsDue: v[4] });
        return 1;
      }
      case 'insertDispute':
        if (s.disputes.has(v[0])) return 0;
        s.disputes.set(v[0], {
          id: v[0], saleId: v[1], coachId: v[2], chargeId: v[3], amountCents: v[4], reason: v[5], stripeStatus: v[6], outcome: 'OPEN',
          withdrawnCents: 0, reinstatedCents: 0, livemode: v[7], createdAt: now(), closedAt: null,
        });
        return 1;
      case 'setDisputeStatus': {
        const d = s.disputes.get(v[0]);
        if (!d || d.outcome !== 'OPEN') return 0;
        Object.assign(d, { stripeStatus: v[1], outcome: v[2], closedAt: v[2] === 'OPEN' ? null : now() });
        return 1;
      }
      case 'setDisputeFunds': {
        const d = s.disputes.get(v[0]);
        if (!d || d.withdrawnCents !== v[1] || d.reinstatedCents !== v[2]) return 0;
        Object.assign(d, { withdrawnCents: v[3], reinstatedCents: v[4] });
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

/** A ledger that keeps one row per idempotency key (LedgerTransaction.idempotencyKey is unique) and refuses an unbalanced one.
 *  PAYMENTS-READY: given the fake database's state, each new row is also visible to its monthly-cap read (state.ledger),
 *  stamped `clock()`. */
export function fakeLedger(mirror?: FakeState, clock: () => Date = () => new Date()) {
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
      mirror?.ledger.push({ kind: tx.kind, metadata: { ...tx.metadata }, createdAt: clock() });
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
