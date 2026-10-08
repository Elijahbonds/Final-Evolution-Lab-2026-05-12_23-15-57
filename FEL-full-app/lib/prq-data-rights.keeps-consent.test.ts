// MIRROR-COACH-ERASE (2026-09-30, owner 07:53 PT, "No wait and fix"): both erases KEEP every HealthConsent row.
// A grant already older than 7 days stays old enough (consentOldEnough, unchanged). Erase creates, re-dates and
// un-revokes nothing. Against a fake client; the routes are checked statically.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eraseHealthData, erasePrqData } from './prq-data-rights';
import { consentOldEnough } from './breath/rampGate';

type Row = Record<string, unknown> & { userId: string };

const NOW = new Date('2026-09-30T12:00:00.000Z');
const GRANTED = new Date('2026-09-20T12:00:00.000Z'); // 10 days before NOW — older than the 7-day first-opt-in week
const REVOKED = new Date('2026-09-22T12:00:00.000Z');

function fakeDb() {
  const store = {
    prqEntry: [
      { id: 'p1', userId: 'u1', attribute: 'power', value: 28 },
      { id: 'p9', userId: 'other', attribute: 'power', value: 70 },
    ] as Row[],
    workoutScan: [
      { id: 'w1', userId: 'u1', kind: 'movement_screen' },
      { id: 'w9', userId: 'other', kind: 'dunk' },
    ] as Row[],
    workoutPlan: [{ id: 'plan1', userId: 'u1', scanId: 'w1' }] as Row[],
    healthIntake: [
      { id: 'hi1', userId: 'u1' },
      { id: 'hi9', userId: 'other' },
    ] as Row[],
    painCheckIn: [
      { id: 'pc1', userId: 'u1' },
      { id: 'pc9', userId: 'other' },
    ] as Row[],
    readinessCheckIn: [
      { id: 'rc1', userId: 'u1' },
      { id: 'rc9', userId: 'other' },
    ] as Row[],
    breathLog: [
      { id: 'bl1', userId: 'u1' },
      { id: 'bl9', userId: 'other' },
    ] as Row[],
    healthConsent: [
      { id: 'hc-live', userId: 'u1', scope: 'health_data', coachId: null, grantedAt: GRANTED, revokedAt: null },
      { id: 'hc-revoked', userId: 'u1', scope: 'coach_view', coachId: 'coach-1', grantedAt: GRANTED, revokedAt: REVOKED },
      { id: 'hc-other', userId: 'other', scope: 'health_data', coachId: null, grantedAt: GRANTED, revokedAt: null },
    ] as Row[],
  };
  const calls: string[] = [];
  const deletable = (name: 'prqEntry' | 'workoutScan' | 'healthIntake' | 'painCheckIn' | 'readinessCheckIn' | 'breathLog') => ({
    deleteMany: async ({ where }: { where: { userId: string } }) => {
      calls.push(`${name}.deleteMany`);
      const before = store[name].length;
      store[name] = store[name].filter((r) => r.userId !== where.userId);
      return { count: before - store[name].length };
    },
  });
  const healthConsent = {
    findMany: async () => { calls.push('healthConsent.findMany'); return store.healthConsent; },
    create: async (a: { data: Row }) => { calls.push('healthConsent.create'); store.healthConsent.push(a.data); return a.data; },
    update: async () => { calls.push('healthConsent.update'); throw new Error('erase must not update a consent row'); },
    updateMany: async () => { calls.push('healthConsent.updateMany'); throw new Error('erase must not update a consent row'); },
    delete: async () => { calls.push('healthConsent.delete'); throw new Error('erase must not delete a consent row'); },
    deleteMany: async () => { calls.push('healthConsent.deleteMany'); throw new Error('erase must not delete a consent row'); },
  };
  const db = {
    prqEntry: deletable('prqEntry'),
    workoutScan: deletable('workoutScan'),
    healthIntake: deletable('healthIntake'),
    painCheckIn: deletable('painCheckIn'),
    readinessCheckIn: deletable('readinessCheckIn'),
    breathLog: deletable('breathLog'),
    healthConsent,
  };
  return { db, store, calls };
}

describe('erase keeps every HealthConsent row', () => {
  it('eraseHealthData leaves a grant older than 7 days old enough, and creates or changes no consent row', async () => {
    const f = fakeDb();
    const before = structuredClone(f.store.healthConsent);
    const erased = await eraseHealthData(f.db, 'u1');
    expect(erased.healthConsents).toBe(0);
    expect(f.store.healthConsent).toEqual(before);
    expect(f.store.healthIntake.map((r) => r.id)).toEqual(['hi9']);
    expect(f.store.painCheckIn.map((r) => r.id)).toEqual(['pc9']);
    expect(f.store.readinessCheckIn.map((r) => r.id)).toEqual(['rc9']);
    expect(f.store.breathLog.map((r) => r.id)).toEqual(['bl9']);
    expect(f.calls.filter((c) => c.startsWith('healthConsent.'))).toEqual([]);
    const live = f.store.healthConsent.find((r) => r.id === 'hc-live')!;
    expect(live).toEqual(before.find((r) => r.id === 'hc-live'));
    expect(consentOldEnough(live.grantedAt as Date, NOW)).toBe(true);
    const revoked = f.store.healthConsent.find((r) => r.id === 'hc-revoked')!;
    expect(revoked.revokedAt).toEqual(REVOKED);
  });

  it('erasePrqData keeps the same ledger, deletes this user\'s PRQ and scans, and leaves the workout plan', async () => {
    const f = fakeDb();
    const before = structuredClone(f.store.healthConsent);
    const erased = await erasePrqData(f.db, 'u1');
    expect(erased.healthConsents).toBe(0);
    expect(erased.prqEntries).toBe(1);
    expect(erased.movementHistory).toBe(1);
    expect(f.store.healthConsent).toEqual(before);
    expect(f.store.prqEntry.map((r) => r.id)).toEqual(['p9']);
    expect(f.store.workoutScan.map((r) => r.id)).toEqual(['w9']);
    expect(f.store.workoutPlan).toEqual([{ id: 'plan1', userId: 'u1', scanId: 'w1' }]);
    expect(f.store.healthIntake.map((r) => r.id)).toEqual(['hi9']);
    expect(f.calls.filter((c) => c.startsWith('healthConsent.'))).toEqual([]);
    expect(consentOldEnough(before[0].grantedAt as Date, NOW)).toBe(true);
  });

  it('the product erase routes call the helpers and never delete HealthConsent (static)', () => {
    const root = join(__dirname, '..');
    const consent = readFileSync(join(root, 'app/api/health/consent/route.ts'), 'utf8');
    const wide = readFileSync(join(root, 'app/api/prq/delete/route.ts'), 'utf8');
    expect(consent).toMatch(/eraseHealthData/);
    expect(consent).not.toMatch(/healthConsent\.delete/);
    expect(wide).toMatch(/erasePrqData/);
    expect(wide).not.toMatch(/healthConsent\.delete/);
  });
});
