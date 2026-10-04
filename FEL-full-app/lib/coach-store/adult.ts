/**
 * Buyers, referrers, live sessions, uploads, and the Train with Elijah link all use the
 * same verified-adult check the age lane already shipped: canWriteHealthData.
 * Unknown age is not an adult. This file does not invent a second year-gap rule.
 */
import { canWriteHealthData } from '@/lib/privacy/healthWriteGate';
import type { GateDb } from '@/lib/privacy/scanSaveGate';

export async function isVerifiedAdult(db: GateDb, userId: string): Promise<boolean> {
  return canWriteHealthData(db, userId);
}
