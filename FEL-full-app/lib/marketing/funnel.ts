/**
 * lib/marketing/funnel.ts — pure marketing-funnel helpers (no side effects).
 * Shared by the subscribe route, the admin funnel view, and tests.
 */

import { createHash } from 'crypto';

export type FunnelStage = 'lead' | 'welcomed' | 'activated' | 'converted' | 'dormant';

// Ordered progression (dormant is a side-state, kept last for display).
export const FUNNEL_ORDER: FunnelStage[] = ['lead', 'welcomed', 'activated', 'converted', 'dormant'];

export const STAGE_META: Record<FunnelStage, { label: string; color: string; blurb: string }> = {
  lead:      { label: 'Lead',      color: '#00E5FF', blurb: 'Captured email' },
  welcomed:  { label: 'Welcomed',  color: '#A855F7', blurb: 'Welcome email sent' },
  activated: { label: 'Activated', color: '#00FF9D', blurb: 'Played a session' },
  converted: { label: 'Converted', color: '#FFD700', blurb: 'Full account created' },
  dormant:   { label: 'Dormant',   color: '#FF3366', blurb: 'Went inactive' },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Non-reversible IP fingerprint for dedupe/abuse signals (never store raw IP). */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`fel-lead:${ip}`).digest('hex').slice(0, 32);
}

export interface FunnelCounts {
  total: number;
  byStage: Record<FunnelStage, number>;
  conversionRate: number; // converted / total, 0..1
}

export function computeFunnelCounts(rows: { stage: FunnelStage }[]): FunnelCounts {
  const byStage: Record<FunnelStage, number> = { lead: 0, welcomed: 0, activated: 0, converted: 0, dormant: 0 };
  for (const r of rows) byStage[r.stage] = (byStage[r.stage] ?? 0) + 1;
  const total = rows.length;
  const conversionRate = total > 0 ? byStage.converted / total : 0;
  return { total, byStage, conversionRate };
}
