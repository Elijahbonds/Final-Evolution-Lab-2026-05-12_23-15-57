// lib/health/healthDataCopy.ts — the Health data panel's two count lines (MIRROR-COACH P7 FIX, 2026-09-29, review).
//
// Profile's Health data panel (components/profile-view.tsx HealthDataSection) said what is stored, and the erase toast
// said what was deleted, from counts app/api/health/consent returns — intakes, pain check-ins, daily check-ins and
// consent records. The narrow health erase (lib/prq-data-rights.ts eraseHealthData) also deletes the Dial-Up Breath's
// use log (schema.prisma BreathLog), and Privacy §5 now names it, but neither line did: an adult who had used the breath
// twice erased two rows nobody mentioned. Both lines name every kind of row now. Pure, so it is tested without a DOM.

/** The panel's counts, as app/api/health/consent returns them (each optional: an older response reads as 0). */
export interface HealthDataCounts { healthIntakes?: number; painCheckIns?: number; readinessCheckIns?: number; breathLogs?: number }

/** What the narrow health erase reports (lib/prq-data-rights.ts HealthErasedCounts), each optional for the same reason. */
export interface HealthErasedLine extends HealthDataCounts { healthConsents?: number }

const nOf = (n: number | undefined, one: string): string => `${n ?? 0} ${(n ?? 0) === 1 ? one : `${one}s`}`;

/** "Deleted 1 intake, 2 pain check-ins, 0 daily check-ins, 2 Dial-Up Breath uses and 1 consent record". */
export function healthEraseToast(e: HealthErasedLine): string {
  return `Deleted ${nOf(e.healthIntakes, 'intake')}, ${nOf(e.painCheckIns, 'pain check-in')}, ${nOf(e.readinessCheckIns, 'daily check-in')}, `
    + `${nOf(e.breathLogs, 'Dial-Up Breath use')} and ${nOf(e.healthConsents, 'consent record')}`;
}

/** "1 intake, 0 pain check-ins, 3 daily check-ins, 1 Dial-Up Breath use stored." */
export function healthStoredLine(c: HealthDataCounts | undefined | null): string {
  return `${nOf(c?.healthIntakes, 'intake')}, ${nOf(c?.painCheckIns, 'pain check-in')}, ${nOf(c?.readinessCheckIns, 'daily check-in')}, `
    + `${nOf(c?.breathLogs, 'Dial-Up Breath use')} stored.`;
}
