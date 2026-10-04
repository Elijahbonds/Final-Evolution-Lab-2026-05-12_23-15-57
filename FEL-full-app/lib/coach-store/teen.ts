import { createHash, randomBytes } from 'node:crypto';
import { TEEN_OFFLINE_GRACE_DAYS } from './constants';

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** The raw code is shown once. Only the hash is stored. */
export function newUnlockCode(): { raw: string; hash: string } {
  const raw = randomBytes(9).toString('base64url');
  return { raw, hash: hashSecret(raw) };
}

/**
 * The phone may keep working for 7 days after the last successful online check.
 * The grace is decided on the device. Nothing here uploads progress.
 */
export function teenOfflineOpen(lastOkAt: Date | null, now: Date): boolean {
  if (!lastOkAt) return false;
  return now.getTime() - lastOkAt.getTime() <= TEEN_OFFLINE_GRACE_DAYS * 86_400_000;
}

export function drillsForTeen<T extends { adultOnly?: boolean }>(drills: readonly T[]): T[] {
  return drills.filter((d) => !d.adultOnly);
}
