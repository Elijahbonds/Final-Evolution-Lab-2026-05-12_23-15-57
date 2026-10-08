/**
 * Re-screen history for adults who opt in through AB-04. Scores and flags only.
 * "Share with my coach" stays off while scanSaveOptIn is false. No second migration.
 */
import { scanSaveOptIn } from '@/lib/privacy/scanSaveOptIn';

export interface RescreenPoint {
  day: number;
  scores: Record<string, number>;
  flags: string[];
}

export async function shareWithCoachAllowed(db: unknown, userId: string): Promise<boolean> {
  return scanSaveOptIn(db, userId);
}

export const RESCREEN_DAYS = [14, 28, 42, 56] as const;
