/**
 * lib/partner-keys.ts — NEXUS Studio partner API key helpers (M3 Track C).
 *
 * A partner key is a bearer secret a creator issues to call the public partner
 * API on their behalf. We store ONLY a sha256 hash of the raw key (never the raw
 * value); the raw key is shown exactly once at creation. Lookups hash the
 * presented bearer token and match on the unique keyHash column.
 */

import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { PARTNER_KEY_PREFIX, PARTNER_UNIT_COST } from '@/lib/studio-plan';
import { billingMonthKey } from '@/lib/studio-service';

export function hashPartnerKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Generate a fresh raw partner key, its hash, and a display hint. */
export function generatePartnerKey(): { raw: string; hash: string; hint: string } {
  const rand = crypto.randomBytes(24).toString('base64url');
  const raw = `${PARTNER_KEY_PREFIX}${rand}`;
  return { raw, hash: hashPartnerKey(raw), hint: `${PARTNER_KEY_PREFIX}…${raw.slice(-4)}` };
}

/** Extract a bearer token from an Authorization header. */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export interface AuthedPartnerKey {
  id: string;
  userId: string;
  scopes: string[];
  monthlyQuota: number;
}

/**
 * Authenticate a raw bearer partner key. Returns the active key record (with
 * parsed scopes) or null. Updates lastUsedAt best-effort.
 */
export async function authenticatePartnerKey(raw: string | null): Promise<AuthedPartnerKey | null> {
  if (!raw) return null;
  const keyHash = hashPartnerKey(raw);
  const rec = await prisma.studioPartnerKey.findUnique({ where: { keyHash } });
  if (!rec || !rec.active || rec.revokedAt) return null;
  prisma.studioPartnerKey.update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return {
    id: rec.id,
    userId: rec.userId,
    scopes: (rec.scopes || '').split(',').map((s) => s.trim()).filter(Boolean),
    monthlyQuota: rec.monthlyQuota,
  };
}

/** Billable units for a scope/endpoint class. */
export function unitsForScope(scope: string): number {
  return PARTNER_UNIT_COST[scope] ?? 1;
}

/** This-month billable units consumed by a partner key. */
export async function partnerMonthlyUnits(partnerKeyId: string, at: Date = new Date()): Promise<number> {
  const month = billingMonthKey(at);
  const agg = await prisma.partnerUsage.aggregate({
    where: { partnerKeyId, billingMonth: month },
    _sum: { units: true },
  });
  return agg._sum.units ?? 0;
}

/** Record one metered partner call. Best-effort; never throws into the request path. */
export async function recordPartnerUsage(
  partnerKeyId: string,
  opts: { endpoint: string; units: number; status: number; costUsd?: number; at?: Date }
): Promise<void> {
  const at = opts.at ?? new Date();
  try {
    await prisma.partnerUsage.create({
      data: {
        partnerKeyId,
        endpoint: opts.endpoint,
        units: opts.units,
        status: opts.status,
        costUsd: opts.costUsd ?? 0,
        billingMonth: billingMonthKey(at),
      },
    });
  } catch {
    /* best-effort metering */
  }
}
