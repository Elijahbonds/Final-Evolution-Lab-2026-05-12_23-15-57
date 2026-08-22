/**
 * lib/metrics-rollup.ts
 * =====================
 * M13 Step 5 — first-party analytics rollup. Computes daily retention, active
 * users, viral K-factor and guest conversion from OUR OWN tables (GameSession,
 * User, AnalyticsEvent, ChallengeLink) and upserts one MetricRollup row per
 * UTC day. No third-party trackers; all data is first-party (privacy policy).
 *
 * Activity is measured off GameSession so retention works over historical data
 * that predates the analytics event stream. All windows are UTC calendar days.
 */

import { prisma } from '@/lib/db';

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

async function activeUserIds(from: Date, to: Date): Promise<Set<string>> {
  const rows = await prisma.gameSession.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

async function cohortRetention(refDayStart: Date, n: number): Promise<number | null> {
  const cohortStart = addDays(refDayStart, -n);
  const cohortEnd = addDays(cohortStart, 1);
  const cohort = await prisma.user.findMany({
    where: { createdAt: { gte: cohortStart, lt: cohortEnd } },
    select: { id: true },
  });
  if (cohort.length === 0) return null;
  const active = await activeUserIds(refDayStart, addDays(refDayStart, 1));
  const retained = cohort.filter((u) => active.has(u.id)).length;
  return Math.round((retained / cohort.length) * 1000) / 10; // percent, 1 dp
}

async function eventCounts(from: Date, to: Date): Promise<Record<string, number>> {
  const grouped = await prisma.analyticsEvent.groupBy({
    by: ['name'],
    where: { ts: { gte: from, lt: to } },
    _count: { name: true },
  });
  const out: Record<string, number> = {};
  for (const g of grouped) out[g.name] = g._count.name;
  return out;
}

export interface RollupPayload {
  dau: number;
  guestDau: number;
  mau: number;
  newUsers: number;
  d1: number | null;
  d7: number | null;
  d30: number | null;
  kFactor: number;
  guestConversionPct: number | null;
  signupConversionPct: number | null;
  events: Record<string, number>;
}

/** Compute (but do not persist) the rollup for the UTC day containing `date`. */
export async function computeRollup(date: Date): Promise<RollupPayload & { day: string }> {
  const ds = dayStart(date);
  const de = addDays(ds, 1);

  const activeToday = await activeUserIds(ds, de);
  const mauSet = await activeUserIds(addDays(ds, -29), de);

  const newUsers = await prisma.user.count({ where: { createdAt: { gte: ds, lt: de } } });
  const events = await eventCounts(ds, de);
  const guestDau = (
    await prisma.analyticsEvent.findMany({
      where: { ts: { gte: ds, lt: de }, guestId: { not: null } },
      select: { guestId: true },
      distinct: ['guestId'],
    })
  ).length;

  const [d1, d7, d30] = await Promise.all([
    cohortRetention(ds, 1),
    cohortRetention(ds, 7),
    cohortRetention(ds, 30),
  ]);

  // K-factor = invites per active user * conversion per open.
  const created = events['challenge_created'] ?? 0;
  const opened = events['challenge_opened'] ?? 0;
  const signups = events['signup_complete'] ?? 0;
  const invitesPerUser = activeToday.size > 0 ? created / activeToday.size : 0;
  const conversionPerOpen = opened > 0 ? Math.min(1, signups / opened) : 0;
  const kFactor = Math.round(invitesPerUser * conversionPerOpen * 1000) / 1000;

  const guestStart = events['guest_start'] ?? 0;
  const guestClaim = events['guest_claim'] ?? 0;
  const guestConversionPct = guestStart > 0 ? Math.round((guestClaim / guestStart) * 1000) / 10 : null;
  const signupConversionPct = opened > 0 ? Math.round((signups / opened) * 1000) / 10 : null;

  return {
    day: dayKey(ds),
    dau: activeToday.size,
    guestDau,
    mau: mauSet.size,
    newUsers,
    d1,
    d7,
    d30,
    kFactor,
    guestConversionPct,
    signupConversionPct,
    events,
  };
}

/** Compute + persist the rollup for one day. */
export async function upsertRollup(date: Date): Promise<string> {
  const { day, ...payload } = await computeRollup(date);
  await prisma.metricRollup.upsert({
    where: { day },
    update: { payload: payload as any, updatedAt: new Date() },
    create: { day, payload: payload as any },
  });
  return day;
}

/** Recompute + persist the last `n` days (inclusive of today). */
export async function recomputeRecent(n: number): Promise<string[]> {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    out.push(await upsertRollup(addDays(dayStart(today), -i)));
  }
  return out;
}
