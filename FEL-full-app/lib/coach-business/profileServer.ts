// lib/coach-business/profileServer.ts — COACH-BUSINESS: everything a coach's public page reads, in one place, so the
// page and its no-minor test read through the same code.
//
// The only client-derived rows read are CoachHighlight rows, and every one passes publicHighlights() with the set of
// client ids that are verified adults NOW (User.dobYear, the strict rule). Applications, sales, rosters — nothing else
// about a client is read here at all.
import { prisma } from '@/lib/db';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { isCoachProEnabled } from './config';
import { connectGate } from './connect';
import { cleanGoals, cleanSports } from './market';
import { packageAction, spotsLeft, type CoachPackage } from './packages';
import { featureGate } from './plan';
import { readCoachPlan } from './planServer';
import { highlightClientIds, publicHighlights, type HighlightRow, type PublicHighlight } from './profile';
import { activePackagesFor, businessReady, connectFor, highlightsFor, marketProfile, takenFor, type ConnectRow, type RawDb } from './store';
import { planDb } from './server';

/** Of these ids, the ones whose account is a verified adult today. A failed read is nobody. */
export async function adultIdsOf(ids: readonly string[], now: Date = new Date()): Promise<Set<string>> {
  if (!ids.length) return new Set();
  try {
    const rows = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, dobYear: true } });
    return new Set(rows.filter((r) => verifiedAdult(r.dobYear ?? null, now)).map((r) => r.id));
  } catch (e) {
    console.warn('[coach-business] age read failed; no highlight shown', e instanceof Error ? e.name : typeof e);
    return new Set();
  }
}

export interface BusinessSection {
  sports: string[];
  goals: string[];
  acceptingClients: boolean;
  listed: boolean;
  highlights: PublicHighlight[];
  packages: (CoachPackage & { spotsLeft: number | null; action: ReturnType<typeof packageAction> })[];
  paymentsLive: boolean;
}

/** Can this coach take a Book right now? Connect ready in the gate's mode, and the plan allows payments. */
export function coachCanCharge(acct: Pick<ConnectRow, 'chargesEnabled' | 'livemode'> | null, live: boolean, planAllows: boolean): boolean {
  return !!acct && acct.chargesEnabled && acct.livemode === live && planAllows;
}

/** The coach-business half of the page. null while the tables are not there (the page shows what it shows today). */
export async function loadBusinessSection(db: RawDb, coachId: string, now: Date = new Date()): Promise<BusinessSection | null> {
  if (!(await businessReady(db))) return null;
  const [market, packages, acct, rows] = await Promise.all([
    marketProfile(db, coachId), activePackagesFor(db, [coachId]), connectFor(db, coachId), highlightsFor(db, coachId),
  ]);
  const adults = await adultIdsOf(highlightClientIds(rows as HighlightRow[]), now);
  const taken = await takenFor(db, packages.map((k) => k.id), now);
  const gate = connectGate();
  const plan = gate.ok ? await readCoachPlan(planDb(), coachId) : 'free';
  const canCharge = gate.ok && coachCanCharge(acct, gate.live, featureGate(plan, 'payments', isCoachProEnabled()).ok);
  const acceptingClients = market ? !!market.acceptingClients : true;
  return {
    sports: cleanSports(market?.sports),
    goals: cleanGoals(market?.goals),
    acceptingClients,
    listed: !!market?.listed,
    highlights: publicHighlights(rows, adults),
    packages: packages.map((k) => {
      const left = spotsLeft(k.capacity, taken.get(k.id) ?? 0);
      const open = packageAction({ paymentsLive: gate.ok, coachCanCharge: canCharge, spotsLeft: left, active: k.active });
      const action = acceptingClients || open === null ? open : 'full';
      return { ...k, spotsLeft: left, action };
    }),
    paymentsLive: gate.ok && canCharge,
  };
}
