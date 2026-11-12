// lib/coach-business/teamFee.ts — COACH-DELIVERY COA-12 (2026-10-27): a "team fee" — one of the coach's packages of kind
// 'team_fee' (packages.ts), sent to their whole roster or one team they run. Each athlete it reaches gets one message in
// their EXISTING program thread with the fee's own page (/coach/<slug>/fee/<packageId>), where the normal package checkout
// runs (service.ts startPackageCheckout: the buyer's terms tick, 18+ buyers only, FEL's 5% + the processing fee on top).
//
// THE RULES:
//   · the money switch first: payments off → 409 store_closed payments_off, nothing sent (a fee nobody can pay is noise);
//   · the coach's own ACTIVE team_fee package; their live roster, or a team they run (members on that roster only);
//   · ADULTS ONLY receive it: a purchase is 18+ (service.ts), and a guardian paying for a teen is not built — so a 13–17
//     athlete (or a blank birth year) is skipped and counted. OWNER CALL: a guardian-pays path for youth team dues;
//   · no program thread, no message (the automations' rule); nothing is emailed.
import type { PrismaClient } from '@/public/_prisma/client';
import { coachPeople, mayAssign, type PeopleDb } from '@/lib/coach/parity/people';
import { connectGate } from './connect';
import { packagePriceLabel } from './packages';
import { businessReady, packageById, type RawDb } from './store';

export interface TeamFeeDeps {
  db: RawDb & PeopleDb & Pick<PrismaClient, 'coachingProgram' | 'programMessage'>;
  env: NodeJS.ProcessEnv;
  now: Date;
  coachSlug(coachId: string): Promise<string | null>;
}

export type TeamFeeResult =
  | { ok: true; sent: number; skippedMinor: number; noThread: number }
  | { ok: false; status: number; error: string; reason?: string };

export const teamFeePath = (slug: string, packageId: string) => `/coach/${encodeURIComponent(slug)}/fee/${encodeURIComponent(packageId)}`;

/** DRAFT copy (owner review): the thread message. */
export function teamFeeMessage(o: { title: string; priceCents: number; path: string }): string {
  return `Team fee: ${o.title} — ${packagePriceLabel(o.priceCents, 'team_fee')} (plus a card processing fee). Pay here: ${o.path}`;
}

export async function sendTeamFee(deps: TeamFeeDeps, coachId: string, body: unknown): Promise<TeamFeeResult> {
  const gate = connectGate(deps.env);
  if (!gate.ok) return { ok: false, status: 409, error: 'store_closed', reason: gate.reason };
  if (!(await businessReady(deps.db))) return { ok: false, status: 503, error: 'coach_business_not_ready' };
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const pkg = typeof b.packageId === 'string' ? await packageById(deps.db, b.packageId) : null;
  if (!pkg || pkg.coachId !== coachId || !pkg.active) return { ok: false, status: 404, error: 'package_not_found' };
  if (pkg.kind !== 'team_fee') return { ok: false, status: 400, error: 'not_team_fee' };
  const slug = await deps.coachSlug(coachId);
  if (!slug) return { ok: false, status: 409, error: 'no_public_page' };
  const people = await coachPeople(deps.db, coachId, deps.now);
  const scope = b.scope ?? 'roster';
  if (scope !== 'roster' && !mayAssign(people, scope, b.scopeId)) return { ok: false, status: 403, error: scope === 'team' ? 'not_your_team' : 'not_your_athlete' };
  const team = scope === 'team' ? people.teams.find((t) => t.id === b.scopeId) : null;
  const reach = scope === 'roster' ? people.roster : scope === 'team' ? people.roster.filter((r) => team?.memberIds.includes(r.id)) : people.roster.filter((r) => r.id === b.scopeId);
  const out = { ok: true as const, sent: 0, skippedMinor: 0, noThread: 0 };
  const text = teamFeeMessage({ title: pkg.title, priceCents: pkg.priceCents, path: teamFeePath(slug, pkg.id) });
  for (const a of reach) {
    if (!a.adult) { out.skippedMinor++; continue; }
    const thread = await deps.db.coachingProgram.findFirst({ where: { coachId, clientId: a.id, isActive: true }, orderBy: { createdAt: 'desc' }, select: { id: true } }).catch(() => null);
    if (!thread) { out.noThread++; continue; }
    await deps.db.programMessage.create({ data: { programId: thread.id, authorId: coachId, body: text } });
    out.sent++;
  }
  return out;
}
