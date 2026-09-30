// MIRROR-COACH P7 FIX (2026-09-29, review): the Health data panel names the Dial-Up Breath's use log, which the narrow
// health erase deletes (lib/prq-data-rights.ts eraseHealthData) — in what is stored, in the erase toast, in the route's
// counts and in the erase warning — and says nothing it does not count.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { healthEraseToast, healthStoredLine } from './healthDataCopy';

describe('the Health data panel names every kind of row the health erase deletes', () => {
  it('the erase toast, from the erase\'s own counts', () => {
    expect(healthEraseToast({ healthIntakes: 1, painCheckIns: 2, readinessCheckIns: 0, breathLogs: 2, healthConsents: 1 }))
      .toBe('Deleted 1 intake, 2 pain check-ins, 0 daily check-ins, 2 Dial-Up Breath uses and 1 consent record');
    expect(healthEraseToast({})).toBe('Deleted 0 intakes, 0 pain check-ins, 0 daily check-ins, 0 Dial-Up Breath uses and 0 consent records');
  });
  it('the stored line, with an older response (no breathLogs) read as 0', () => {
    expect(healthStoredLine({ healthIntakes: 1, painCheckIns: 0, readinessCheckIns: 3, breathLogs: 1 })).toBe('1 intake, 0 pain check-ins, 3 daily check-ins, 1 Dial-Up Breath use stored.');
    expect(healthStoredLine({ healthIntakes: 2, painCheckIns: 1 })).toBe('2 intakes, 1 pain check-in, 0 daily check-ins, 0 Dial-Up Breath uses stored.');
    expect(healthStoredLine(undefined)).toBe('0 intakes, 0 pain check-ins, 0 daily check-ins, 0 Dial-Up Breath uses stored.');
  });
  it('the route counts the log, and the panel uses both lines and names the uses in its erase warning (static)', () => {
    const route = readFileSync('app/api/health/consent/route.ts', 'utf8');
    expect(route).toMatch(/prisma\.breathLog\.count\(\{ where: \{ userId \} \}\)/);
    expect(route).toMatch(/counts: \{ healthIntakes, painCheckIns, readinessCheckIns, breathLogs \}/);
    const view = readFileSync('components/profile-view.tsx', 'utf8');
    expect(view).toContain('toast.success(healthEraseToast(e))');
    expect(view).toContain('healthStoredLine(view?.counts)');
    expect(view).toMatch(/Deletes your intake, every pain check-in, every daily check-in, your Dial-Up Breath uses and your consent records/);
  });
});
