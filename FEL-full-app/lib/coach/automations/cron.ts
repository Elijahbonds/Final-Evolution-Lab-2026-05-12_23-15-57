// lib/coach/automations/cron.ts — COACH-DELIVERY COA-01: the scheduled sweep's shared secret (the retention job's pattern,
// lib/retention/retentionJob.ts): unset = the route answers 503 and runs nothing (fail closed); compared in constant time.
import { timingSafeEqual } from 'node:crypto';

export const AUTOMATIONS_SECRET_HEADER = 'x-coach-automations-secret';

export function automationsSecret(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const s = env.COACH_AUTOMATIONS_CRON_SECRET;
  return s && s.length >= 16 ? s : null;
}

export function verifyAutomationsSecret(given: string | null | undefined, secret: string): boolean {
  if (typeof given !== 'string' || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
