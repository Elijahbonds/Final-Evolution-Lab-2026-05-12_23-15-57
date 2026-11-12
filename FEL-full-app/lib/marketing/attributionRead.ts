// attributionRead — the funnel page's reads for ONB-04 (sign-ups by source, first purchase) and ONB-02 (first wins).
// Our own tables only: AnalyticsEvent (signup_complete, first_win) and Order (PAID). Each read is capped and fails soft:
// the admin page shows an empty table rather than a 500.
import type { OrderRow, SignupRow } from './utm';

/** (new) How far back the funnel's source and first-win tables look. */
export const ATTRIBUTION_WINDOW_DAYS = 90;
/** (new) Rows read per table, at most. */
export const ATTRIBUTION_READ_CAP = 5000;

interface Db {
  analyticsEvent: { findMany(args: unknown): Promise<Array<{ userId?: string | null; props: unknown }>> };
  order: { findMany(args: unknown): Promise<Array<{ userId: string; amount: number; createdAt: Date }>> };
}

export interface AttributionReads { signups: SignupRow[]; orders: OrderRow[]; firstWins: unknown[] }

export async function readAttribution(db: unknown, now: Date = new Date()): Promise<AttributionReads> {
  const d = db as Db;
  const since = new Date(now.getTime() - ATTRIBUTION_WINDOW_DAYS * 86_400_000);
  const soft = async <T>(f: () => Promise<T[]>): Promise<T[]> => { try { return await f(); } catch (e) { console.error('[funnel] attribution read failed:', (e as Error)?.message ?? e); return []; } };
  const signups = await soft(() => d.analyticsEvent.findMany({
    where: { name: 'signup_complete', createdAt: { gte: since } },
    select: { userId: true, props: true }, orderBy: { createdAt: 'desc' }, take: ATTRIBUTION_READ_CAP,
  })) as SignupRow[];
  const ids = [...new Set(signups.map((s) => s.userId).filter((x): x is string => typeof x === 'string' && x.length > 0))];
  const orders = ids.length ? await soft(() => d.order.findMany({
    where: { userId: { in: ids }, status: 'PAID' },
    select: { userId: true, amount: true, createdAt: true }, take: ATTRIBUTION_READ_CAP,
  })) : [];
  const firstWins = (await soft(() => d.analyticsEvent.findMany({
    where: { name: 'first_win', createdAt: { gte: since } },
    select: { props: true }, take: ATTRIBUTION_READ_CAP,
  }))).map((r) => r.props);
  return { signups, orders, firstWins };
}
