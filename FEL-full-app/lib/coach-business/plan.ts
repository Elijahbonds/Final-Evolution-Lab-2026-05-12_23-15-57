// lib/coach-business/plan.ts — COACH-BUSINESS: Coach Free and Coach Pro (owner, 2026-10-25).
//
//   Free: a profile, packages people apply for, the marketplace, and up to COACH_FREE_CLIENT_LIMIT active clients.
//   Pro:  unlimited clients, AI drafts, live sessions, and taking payments.
//
// WHO IS PRO. An ACTIVE FEL_COACH or FEL_FACILITY subscription (the existing B2B entitlement, lib/pro-guard.ts
// isCoachUser — assumption: Coach Pro IS that entitlement, so the camp paywall and this one agree), or a coach-store
// allowlisted coach (COACH_STORE_COACH_USER_IDS: the owner's own store already sells).
//
// WHILE COACH_PRO_ENABLED IS OFF (the default) NOTHING IS GATED HERE: Pro cannot be bought yet, so a gate would only take
// away what coaches have today. Payments stay closed by their own switch (config.ts) either way.
//
// Pure: the server half (planServer.ts) reads the rows and the env and calls these.

export type CoachPlan = 'free' | 'pro';

/** The Pro features, by the names the routes and the upgrade card use. */
export const PRO_FEATURES = ['unlimited_clients', 'ai_drafts', 'live_sessions', 'payments'] as const;
export type ProFeature = (typeof PRO_FEATURES)[number];

/** What a coach reads on the upgrade card, one line per feature. Product copy. */
export const PRO_FEATURE_LABELS: Record<ProFeature, string> = {
  unlimited_clients: 'Unlimited clients',
  ai_drafts: 'AI-drafted weekly updates you approve',
  live_sessions: 'Live sessions',
  payments: 'Take payments for your packages',
};

export const PRO_PRODUCTS = ['FEL_COACH', 'FEL_FACILITY'] as const;

export function planFor(input: { subscriptions: readonly { product: string; status: string }[]; allowlisted: boolean }): CoachPlan {
  if (input.allowlisted) return 'pro';
  const pro = input.subscriptions.some((s) => s.status === 'ACTIVE' && (PRO_PRODUCTS as readonly string[]).includes(s.product));
  return pro ? 'pro' : 'free';
}

export type GateAnswer = { ok: true } | { ok: false; feature: ProFeature };

/** May this coach use a Pro feature? Always yes while the gates are off. */
export function featureGate(plan: CoachPlan, feature: ProFeature, gatesOn: boolean): GateAnswer {
  if (!gatesOn || plan === 'pro') return { ok: true };
  return { ok: false, feature };
}

/**
 * May one more client join this coach? `activeClients` counts the live roster (CoachClient rows not ended). A Free coach
 * at the allowance is refused; Pro, or gates off, never is.
 */
export function clientLimitGate(plan: CoachPlan, activeClients: number, limit: number, gatesOn: boolean): GateAnswer & { limit: number | null } {
  if (!gatesOn || plan === 'pro') return { ok: true, limit: null };
  return activeClients < limit ? { ok: true, limit } : { ok: false, feature: 'unlimited_clients', limit };
}

export interface ProPaywallBody {
  error: 'coach_pro_required';
  feature: ProFeature;
  message: string;
  /** What Free still includes, so the answer is never a dead end. */
  free: string;
  upgrade: '/coach/business#pro';
}

export function proPaywall(feature: ProFeature): ProPaywallBody {
  return {
    error: 'coach_pro_required',
    feature,
    message: `${PRO_FEATURE_LABELS[feature]} is part of Coach Pro.`,
    free: 'Your profile, packages clients apply for, the marketplace and your first clients stay free.',
    upgrade: '/coach/business#pro',
  };
}

/** 402, the status lib/pro-guard.ts already uses for a paywall. */
export const PRO_PAYWALL_STATUS = 402;

/** What a CLIENT is told when the coach's Free roster is full. Says nothing about the coach's plan or billing. */
export const ROSTER_FULL = { error: 'coach_roster_full', message: "This coach isn't taking new clients right now." } as const;
