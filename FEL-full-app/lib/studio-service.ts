/**
 * lib/studio-service.ts — NEXUS Studio Creator metering & entitlement (M3 Track C).
 *
 * Pure-ish service layer that sits ON TOP of the Phase 2 CELL cost engine
 * (CellUsage rows already record per-build token/$ usage). It adds the
 * monetization policy: tier resolution, monthly build quota, an included build
 * budget, prepaid overage credits, and cartridge manifest validation.
 *
 * Nothing here talks to Stripe; money movements go through the M1 ledger via
 * lib/studio-credits.ts. Everything is gated behind isStudioCreatorEnabled().
 */

import { prisma } from '@/lib/db';
import type { DbClient } from '@/lib/ledger';
import {
  STUDIO_PLANS,
  type StudioPlan,
  type StudioTier,
} from '@/lib/studio-plan';
import { studioCreditBalance, ledgerStudioOverageSpend } from '@/lib/studio-credits';

/** Canonical billing-month key (UTC), e.g. "2026-07". */
export function billingMonthKey(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** First instant (UTC) of the billing month containing `d`. */
export function billingMonthStart(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Resolve a user's Studio tier. Precedence: BYO (has provider keys) > CREATOR
 * (active STUDIO_CREATOR subscription) > FREE. A creator who supplies their own
 * keys routes builds directly to their provider, so the platform neither meters
 * cost nor enforces a USD budget for them.
 */
export async function resolveStudioTier(userId: string, db: DbClient = prisma): Promise<StudioTier> {
  const d = db as any;
  const [keyCount, sub] = await Promise.all([
    d.cellApiKey.count({ where: { userId } }),
    d.subscription.findFirst({
      where: { userId, product: 'STUDIO_CREATOR', status: 'ACTIVE' },
    }),
  ]);
  if (keyCount > 0) return 'BYO';
  if (sub) return 'CREATOR';
  return 'FREE';
}

export interface StudioUsage {
  month: string;
  builds: number;        // distinct build invocations this month
  meteredUsdCents: number; // metered build spend this month, in US cents (rounded)
  meteredUsdRaw: number;   // exact float dollars for display
}

/** Aggregate this-month CellUsage across all of a user's projects. */
export async function getStudioUsage(userId: string, at: Date = new Date(), db: DbClient = prisma): Promise<StudioUsage> {
  const d = db as any;
  const month = billingMonthKey(at);
  const start = billingMonthStart(at);

  const projects = await d.cellProject.findMany({
    where: { userId },
    select: { id: true },
  });
  const projectIds = projects.map((p: any) => p.id);
  if (projectIds.length === 0) {
    return { month, builds: 0, meteredUsdCents: 0, meteredUsdRaw: 0 };
  }

  const rows = await d.cellUsage.findMany({
    where: { projectId: { in: projectIds }, createdAt: { gte: start } },
    select: { buildId: true, costUsd: true },
  });

  const builds = new Set<string>();
  let usd = 0;
  for (const r of rows) {
    if (r.buildId) builds.add(r.buildId);
    usd += r.costUsd;
  }
  return {
    month,
    builds: builds.size,
    meteredUsdCents: Math.round(usd * 100),
    meteredUsdRaw: usd,
  };
}

export interface BuildGate {
  allowed: boolean;
  tier: StudioTier;
  plan: StudioPlan;
  usage: StudioUsage;
  creditBalance: number; // STUDIO_CREDIT balance (>= 0)
  reason:
    | 'ok'
    | 'ok_byo'
    | 'ok_within_included'
    | 'ok_overage_credits'
    | 'build_quota_exceeded'
    | 'budget_exceeded_no_credits';
  /** Human-readable explanation. */
  detail: string;
}

/**
 * Read-only gate: may this user start another build this month? Does NOT charge
 * anything — charging happens post-build in settleBuildOverage once actual cost
 * is known.
 */
export async function checkBuildAllowed(userId: string, at: Date = new Date(), db: DbClient = prisma): Promise<BuildGate> {
  const tier = await resolveStudioTier(userId, db);
  const plan = STUDIO_PLANS[tier];
  const [usage, creditBalance] = await Promise.all([
    getStudioUsage(userId, at, db),
    studioCreditBalance(db, userId),
  ]);

  const base = { tier, plan, usage, creditBalance };

  // BYO: user pays their provider directly; only an abuse ceiling applies.
  if (plan.byoKeys) {
    if (plan.buildsPerMonth >= 0 && usage.builds >= plan.buildsPerMonth) {
      return { ...base, allowed: false, reason: 'build_quota_exceeded', detail: `BYO abuse ceiling of ${plan.buildsPerMonth} builds/month reached.` };
    }
    return { ...base, allowed: true, reason: 'ok_byo', detail: 'Bring-your-own-keys: builds route to your provider.' };
  }

  // Build-count quota.
  if (plan.buildsPerMonth >= 0 && usage.builds >= plan.buildsPerMonth) {
    return { ...base, allowed: false, reason: 'build_quota_exceeded', detail: `Monthly build quota of ${plan.buildsPerMonth} reached for the ${plan.label} plan.` };
  }

  // Tiers with no metered budget and no overage (e.g. FREE): the build-count
  // quota checked above is the sole limiter. Those builds are platform-funded
  // within the free allowance, so metered spend does not gate them.
  if (plan.includedUsdCents <= 0 && !plan.overageAllowed) {
    return { ...base, allowed: true, reason: 'ok_within_included', detail: `Within the ${plan.label} monthly build allowance.` };
  }

  // Within the included metered budget.
  if (usage.meteredUsdCents < plan.includedUsdCents) {
    return { ...base, allowed: true, reason: 'ok_within_included', detail: 'Within included monthly build budget.' };
  }

  // Beyond included budget: need overage credits.
  if (plan.overageAllowed && creditBalance > 0) {
    return { ...base, allowed: true, reason: 'ok_overage_credits', detail: `Included budget used; drawing from ${creditBalance} prepaid credits.` };
  }

  return {
    ...base,
    allowed: false,
    reason: 'budget_exceeded_no_credits',
    detail: plan.overageAllowed
      ? 'Included budget used and no prepaid credits remain. Purchase a build credit pack to continue.'
      : `The ${plan.label} plan has no overage. Upgrade to Creator to keep building.`,
  };
}

/**
 * After a build completes, draw prepaid credits for the portion of metered spend
 * that falls beyond the included monthly budget. Returns the number of credits
 * charged (0 if fully within the included budget or tier has no overage).
 *
 * `priorMeteredUsdCents` = the user's metered spend this month BEFORE this build.
 * `buildUsdCents`        = this build's metered cost in US cents.
 */
export async function settleBuildOverage(
  userId: string,
  opts: { priorMeteredUsdCents: number; buildUsdCents: number; buildId: string },
  db: DbClient = prisma
): Promise<{ chargedCredits: number }> {
  const tier = await resolveStudioTier(userId, db);
  const plan = STUDIO_PLANS[tier];
  if (!plan.overageAllowed || opts.buildUsdCents <= 0) return { chargedCredits: 0 };

  const totalAfter = opts.priorMeteredUsdCents + opts.buildUsdCents;
  // Only the amount above the included budget is billable overage.
  const overStart = Math.max(opts.priorMeteredUsdCents, plan.includedUsdCents);
  const billable = Math.max(0, totalAfter - overStart);
  if (billable <= 0) return { chargedCredits: 0 };

  await ledgerStudioOverageSpend(db, {
    userId,
    credits: billable,
    idempotencyKey: `studio-overage:${opts.buildId}`,
    metadata: { buildId: opts.buildId, buildUsdCents: opts.buildUsdCents, billable },
  });
  return { chargedCredits: billable };
}

// ─── Cartridge manifest ───

export interface CartridgeManifest {
  name: string;
  version: string;
  engine: string;   // e.g. "cell-web-1"
  genre: string;
  entry: string;    // entry file path within the bundle, e.g. "index.html"
  files: Array<{ path: string; hash?: string }>;
  inputs?: string[];
  description?: string;
}

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/** Validate + normalize a cartridge manifest submitted for publishing. */
export function validateCartridgeManifest(input: any): { ok: boolean; errors: string[]; manifest?: CartridgeManifest } {
  const errors: string[] = [];
  const obj = input && typeof input === 'object' ? input : {};

  const name = String(obj.name ?? '').trim();
  if (!name) errors.push('name is required');
  if (name.length > 160) errors.push('name too long (max 160)');

  const version = String(obj.version ?? '').trim();
  if (!SEMVER_RE.test(version)) errors.push('version must be semver (e.g. 1.0.0)');

  const engine = String(obj.engine ?? 'cell-web-1').trim();
  const genre = String(obj.genre ?? '').trim();
  const entry = String(obj.entry ?? '').trim();
  if (!entry) errors.push('entry file is required');

  const filesIn = Array.isArray(obj.files) ? obj.files : [];
  if (filesIn.length === 0) errors.push('files must list at least one file');
  const files = filesIn
    .map((f: any) => ({ path: String(f?.path ?? '').trim(), hash: f?.hash ? String(f.hash) : undefined }))
    .filter((f: { path: string }) => f.path.length > 0);
  if (files.length !== filesIn.length) errors.push('every file entry needs a path');
  if (entry && files.length && !files.some((f: { path: string }) => f.path === entry)) {
    errors.push('entry must reference a file listed in files[]');
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    manifest: {
      name,
      version,
      engine,
      genre,
      entry,
      files,
      inputs: Array.isArray(obj.inputs) ? obj.inputs.map((s: any) => String(s)) : undefined,
      description: obj.description ? String(obj.description) : undefined,
    },
  };
}
