// lib/coach/aiChatAccess.ts — COACH-AI Phase 8 (2026-10-07): who may talk to the AI coach.
//
// TWO CHECKS, BOTH SERVER-SIDE, BOTH BEFORE ANYTHING IS SENT (plan item #9; owner decision 8: the AI coach stays off
// until this lands — abacusEnabled() is untouched and still runs first in the route):
//   1. ADULTS ONLY. Verified 18+ from the DATABASE's User.dobYear (lib/privacy/scanSaveGate readDobYear +
//      verifiedAdult, the same strict rule as canWriteHealthData). Unknown age is not an adult. Never the session
//      token, never the request body.
//   2. AN EXPLICIT AI-SHARING CONSENT. A live HealthConsent row of scope AI_SHARE_SCOPE: "send my question, the
//      attribute it is about and a few matching exercises to FEL's AI provider". The ledger is the existing
//      append-only HealthConsent table (a new scope VALUE, no new column: production has the table today), read the
//      same way lib/health/consent.ts reads its scopes — the newest un-revoked row wins. Granting needs check 1;
//      withdrawing needs nothing (taking your data back needs no age).
//
// NEVER THROWS. A failed read is a refusal (adult: false / consented: false), logged as one line with no PII
// (logGateFailure: the event plus the error's class and code).

import { logGateFailure, readDobYear, verifiedAdult, type GateDb } from '@/lib/privacy/scanSaveGate';

/** The HealthConsent.scope value for the AI coach's sharing consent. */
export const AI_SHARE_SCOPE = 'ai_coach_share';

// The words the athlete agrees to live in the pure ./aiChatGuard (the chat component imports them; this file imports
// next/server through scanSaveGate and must stay off the client).
export { AI_SHARE_COPY } from './aiChatGuard';

export interface AiShareRow { scope: string; grantedAt: Date; revokedAt: Date | null }

/** The live AI-sharing grant, if any: the newest un-revoked row of AI_SHARE_SCOPE. */
export function liveAiShare(rows: readonly AiShareRow[]): AiShareRow | null {
  const live = rows.filter((r) => r.scope === AI_SHARE_SCOPE && !r.revokedAt);
  if (!live.length) return null;
  return live.reduce((a, b) => (new Date(b.grantedAt).getTime() > new Date(a.grantedAt).getTime() ? b : a));
}

/** Structural: a route's `prisma` or a test stand-in. */
export interface AiAccessDb extends GateDb {
  healthConsent: {
    findMany(args: { where: { userId: string; scope: string }; select: { scope: true; grantedAt: true; revokedAt: true } }): Promise<AiShareRow[]>;
    create(args: { data: { userId: string; scope: string; grantedAt: Date } }): Promise<unknown>;
    updateMany(args: { where: { userId: string; scope: string; revokedAt: null }; data: { revokedAt: Date } }): Promise<{ count: number }>;
  };
}

export interface AiChatAccess { adult: boolean; consented: boolean; /** User.dobYear as read (null = unknown). */ dobYear: number | null }

/** Both checks. The consent ledger is not read when the age fails. */
export async function aiChatAccess(db: AiAccessDb, userId: string): Promise<AiChatAccess> {
  const dobYear = await readDobYear(db, userId, 'ai_coach_gate');
  if (!verifiedAdult(dobYear)) return { adult: false, consented: false, dobYear };
  return { adult: true, consented: await hasAiShareConsent(db, userId), dobYear };
}

export async function hasAiShareConsent(db: AiAccessDb, userId: string): Promise<boolean> {
  try {
    const rows = await db.healthConsent.findMany({ where: { userId, scope: AI_SHARE_SCOPE }, select: { scope: true, grantedAt: true, revokedAt: true } });
    return liveAiShare(rows) !== null;
  } catch (e) {
    logGateFailure('ai_coach_consent_read_failed', e);
    return false;
  }
}

/** Grant (idempotent: an existing live grant is kept, not duplicated). The caller has already checked the age. */
export async function grantAiShare(db: AiAccessDb, userId: string, now: Date = new Date()): Promise<void> {
  if (await hasAiShareConsent(db, userId)) return;
  await db.healthConsent.create({ data: { userId, scope: AI_SHARE_SCOPE, grantedAt: now } });
}

/** Withdraw every live grant of this scope (the rows stay, so the withdrawal has a time). */
export async function revokeAiShare(db: AiAccessDb, userId: string, now: Date = new Date()): Promise<number> {
  const r = await db.healthConsent.updateMany({ where: { userId, scope: AI_SHARE_SCOPE, revokedAt: null }, data: { revokedAt: now } });
  return r.count;
}

/** The fixed refusals. The client reads `error` to decide which panel to show. */
export const AI_CHAT_ADULTS_ONLY = { error: 'ai_coach_adults_only' } as const;
export const AI_CHAT_CONSENT_REQUIRED = { error: 'ai_share_consent_required' } as const;
