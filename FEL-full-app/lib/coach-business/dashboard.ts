// lib/coach-business/dashboard.ts — COACH-BUSINESS: what /coach/business shows a coach about their own business, and the
// profile save. Reads by the coach's own id only.
import { prisma } from '@/lib/db';
import { isMissingTable } from '@/lib/coach-store/gate';
import { coachProPriceCents, isCoachMarketplaceEnabled } from './config';
import { paymentsLive } from './connect';
import { cleanGoals, cleanSports, type MarketGoal, type Sport } from './market';
import { spotsLeft, type CoachPackage } from './packages';
import { coachPlanStatus, type CoachPlanStatus } from './planServer';
import { cleanProfileText, slugFromName, slugOk } from './profile';
import {
  applicationsFor, businessReady, connectFor, highlightsFor, marketProfile, packagesFor, saveMarketProfile, salesForCoach, takenFor,
  type ApplicationView, type CoachSaleView, type ConnectRow, type RawDb,
} from './store';
import { planDb } from './server';

export interface DashboardProfile {
  slug: string; displayName: string; headline: string | null; bio: string | null; specialties: string[]; certifications: string[]; published: boolean;
}

export interface Dashboard {
  ready: boolean;
  plan: CoachPlanStatus;
  proPriceCents: number | null;
  paymentsLive: boolean;
  marketplaceOn: boolean;
  profile: DashboardProfile | null;
  market: { listed: boolean; acceptingClients: boolean; sports: Sport[]; goals: MarketGoal[] };
  packages: (CoachPackage & { spotsLeft: number | null })[];
  connect: Pick<ConnectRow, 'chargesEnabled' | 'payoutsEnabled' | 'detailsSubmitted' | 'livemode'> | null;
  sales: CoachSaleView[];
  applications: ApplicationView[];
  highlights: { id: string; text: string; state: 'waiting' | 'approved' | 'withdrawn' }[];
}

async function instructorFor(userId: string): Promise<DashboardProfile | null> {
  try {
    const i = await prisma.instructor.findUnique({
      where: { userId },
      select: { slug: true, displayName: true, headline: true, bio: true, specialties: true, certifications: true, published: true },
    });
    return i ?? null;
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}

export async function loadDashboard(db: RawDb, userId: string, now: Date = new Date()): Promise<Dashboard> {
  const [plan, profile, ready] = await Promise.all([coachPlanStatus(planDb(), userId), instructorFor(userId), businessReady(db)]);
  const base: Dashboard = {
    ready, plan, proPriceCents: coachProPriceCents(), paymentsLive: paymentsLive(), marketplaceOn: isCoachMarketplaceEnabled(), profile,
    market: { listed: false, acceptingClients: true, sports: [], goals: [] },
    packages: [], connect: null, sales: [], applications: [], highlights: [],
  };
  if (!ready) return base;
  const [market, packages, connect, sales, applications, highlights] = await Promise.all([
    marketProfile(db, userId), packagesFor(db, userId), connectFor(db, userId), salesForCoach(db, userId), applicationsFor(db, userId), highlightsFor(db, userId),
  ]);
  const taken = await takenFor(db, packages.map((p) => p.id), now);
  return {
    ...base,
    market: market ? { listed: !!market.listed, acceptingClients: !!market.acceptingClients, sports: cleanSports(market.sports), goals: cleanGoals(market.goals) } : base.market,
    packages: packages.map((p) => ({ ...p, spotsLeft: spotsLeft(p.capacity, taken.get(p.id) ?? 0) })),
    connect: connect ? { chargesEnabled: !!connect.chargesEnabled, payoutsEnabled: !!connect.payoutsEnabled, detailsSubmitted: !!connect.detailsSubmitted, livemode: !!connect.livemode } : null,
    sales,
    applications,
    highlights: highlights.map((h) => ({ id: h.id, text: h.text, state: h.revokedAt ? 'withdrawn' : h.consentAt ? 'approved' : 'waiting' })),
  };
}

export type SaveProfileResult = { ok: true; slug: string } | { ok: false; status: number; error: string };

/**
 * Create or update the coach's public profile (the coach store's Instructor row) and their marketplace opt-in. A slug is
 * chosen once from the name, or given; it must be free and must not shadow a /coach page.
 */
export async function saveProfile(db: RawDb, userId: string, body: unknown): Promise<SaveProfileResult> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const text = cleanProfileText(b);
  if (text.displayName.length < 2) return { ok: false, status: 400, error: 'invalid_name' };
  const published = b.published === true;
  try {
    const existing = await prisma.instructor.findUnique({ where: { userId }, select: { id: true, slug: true } });
    let slug = existing?.slug ?? '';
    if (!existing) {
      slug = typeof b.slug === 'string' && b.slug ? b.slug.trim().toLowerCase() : slugFromName(text.displayName);
      if (!slugOk(slug)) return { ok: false, status: 400, error: 'invalid_slug' };
      const taken = await prisma.instructor.findUnique({ where: { slug }, select: { id: true } });
      if (taken) return { ok: false, status: 409, error: 'slug_taken' };
      await prisma.instructor.create({ data: { userId, slug, ...text, published } });
    } else {
      await prisma.instructor.update({ where: { userId }, data: { ...text, published } });
    }
    if (b.market && typeof b.market === 'object' && (await businessReady(db))) {
      const m = b.market as Record<string, unknown>;
      await saveMarketProfile(db, { userId, listed: m.listed === true, acceptingClients: m.acceptingClients !== false, sports: cleanSports(m.sports), goals: cleanGoals(m.goals) });
    }
    return { ok: true, slug };
  } catch (e) {
    if (isMissingTable(e)) return { ok: false, status: 503, error: 'coach_business_not_ready' };
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'P2002') return { ok: false, status: 409, error: 'slug_taken' };
    throw e;
  }
}
