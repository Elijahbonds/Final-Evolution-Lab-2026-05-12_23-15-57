// lib/coach-business/planServer.ts — COACH-BUSINESS: the Free/Pro reads behind the pure gates in plan.ts.
//
// Two reads, both by the coach's own id: their ACTIVE subscriptions, and (for the client allowance) the size of their
// live roster. A read that fails does NOT gate the coach: while COACH_PRO_ENABLED is on, a failed read answers Pro for
// features and "room" for clients, logged — a database blip must not lock a paying coach out of their own business.
// Payments never rely on this alone: the money routes have their own switch, key fence and Stripe checks.
import { NextResponse } from 'next/server';
import { isAllowlistedCoach } from '@/lib/coach-store/coaches';
import { coachFreeClientLimit, isCoachProEnabled } from './config';
import { clientLimitGate, featureGate, planFor, proPaywall, PRO_PAYWALL_STATUS, ROSTER_FULL, type CoachPlan, type ProFeature } from './plan';

/** The two Prisma delegates these reads use (the real client, or a test stand-in). */
export interface PlanDb {
  subscription: { findMany(args: { where: { userId: string; status: 'ACTIVE' }; select: { product: true; status: true } }): Promise<{ product: string; status: string }[]> };
  coachClient: { count(args: { where: { coachId: string; endedAt: null } }): Promise<number> };
}

export interface CoachPlanStatus {
  plan: CoachPlan;
  /** Are the gates enforced right now (COACH_PRO_ENABLED)? */
  gatesOn: boolean;
  /** The Free allowance and the live roster size, for the dashboard's "2 of 3 clients" line. */
  clientLimit: number;
  activeClients: number | null;
}

export async function readCoachPlan(db: PlanDb, userId: string, env: NodeJS.ProcessEnv = process.env): Promise<CoachPlan> {
  if (isAllowlistedCoach(userId, env)) return 'pro';
  try {
    const subscriptions = await db.subscription.findMany({ where: { userId, status: 'ACTIVE' }, select: { product: true, status: true } });
    return planFor({ subscriptions, allowlisted: false });
  } catch (e) {
    // PAYMENTS-READY (coordinator, 2026-10-26): kept as Pro on purpose. A failed read never gates the coach, and a sale
    // made in that moment takes FEL's Pro rate (PLATFORM_FEE_BPS_PRO): charging a coach more than their plan allows is
    // worse than FEL losing a few cents on a database blip. One line, no id, no PII.
    console.warn('[coach-business] plan read failed; counted as Pro (not gated, Pro fee rate)', e instanceof Error ? e.name : typeof e);
    return 'pro';
  }
}

export async function coachPlanStatus(db: PlanDb, userId: string, env: NodeJS.ProcessEnv = process.env): Promise<CoachPlanStatus> {
  const plan = await readCoachPlan(db, userId, env);
  let activeClients: number | null = null;
  try { activeClients = await db.coachClient.count({ where: { coachId: userId, endedAt: null } }); } catch { activeClients = null; }
  return { plan, gatesOn: isCoachProEnabled(env), clientLimit: coachFreeClientLimit(env), activeClients };
}

/** null when the coach may use the feature; otherwise the 402 to answer with. Nothing is read while the gates are off. */
export async function coachFeatureRefusal(db: PlanDb, userId: string, feature: ProFeature, env: NodeJS.ProcessEnv = process.env): Promise<NextResponse | null> {
  if (!isCoachProEnabled(env)) return null;
  const plan = await readCoachPlan(db, userId, env);
  const g = featureGate(plan, feature, true);
  return g.ok ? null : NextResponse.json(proPaywall(feature), { status: PRO_PAYWALL_STATUS });
}

/**
 * null when one more client may join this coach; otherwise the 409 the JOINING CLIENT gets. The client is told only that
 * the coach is not taking new clients — never the coach's plan or billing.
 */
export async function coachRosterRefusal(db: PlanDb, coachId: string, env: NodeJS.ProcessEnv = process.env): Promise<NextResponse | null> {
  if (!isCoachProEnabled(env)) return null;
  const plan = await readCoachPlan(db, coachId, env);
  if (plan === 'pro') return null;
  let active: number;
  try { active = await db.coachClient.count({ where: { coachId, endedAt: null } }); } catch (e) {
    console.warn('[coach-business] roster count failed; not gating', e instanceof Error ? e.name : typeof e);
    return null;
  }
  const g = clientLimitGate(plan, active, coachFreeClientLimit(env), true);
  return g.ok ? null : NextResponse.json(ROSTER_FULL, { status: 409 });
}
