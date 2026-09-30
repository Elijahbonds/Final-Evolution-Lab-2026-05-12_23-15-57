// R-HEALTH-CLIENT (2026-09-30; FE PM 19:38 and 19:53 PT; AM 19:47 PT), test d: app/play/mirror/page.tsx, the ONE ask.
// The async server component is called directly (next-auth, prisma and the scan opt-in mocked) and the element tree it
// returns is inspected — no DOM. The parent-consent gate is gone from the flow, HealthIntakeGate wraps MirrorHarness
// directly, the intake gets canWriteHealth (canWriteHealthData) and the Mirror gets canSaveScan (canSaveScanNumbers), and
// no failure of either check, or of the intake-status read, can 500 the page: it answers false / due and renders.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as unknown,
  prisma: null as any,
  optedIn: false,
  canSave: null as null | ((...a: any[]) => any),
  canWrite: null as null | ((...a: any[]) => any),
  latest: null as null | ((...a: any[]) => any),
  guardianImported: false,
}));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); } }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
// no real opt-in record exists yet (PRIVACY-CORE/AB-04): the positive control mocks it true
vi.mock('@/lib/privacy/scanSaveOptIn', () => ({ scanSaveOptIn: async () => h.optedIn }));
vi.mock('@/lib/privacy/scanSaveGate', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/privacy/scanSaveGate')>();
  return { ...real, canSaveScanNumbers: (...a: Parameters<typeof real.canSaveScanNumbers>) => (h.canSave ?? real.canSaveScanNumbers)(...a) };
});
vi.mock('@/lib/privacy/healthWriteGate', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/privacy/healthWriteGate')>();
  return { ...real, canWriteHealthData: (...a: Parameters<typeof real.canWriteHealthData>) => (h.canWrite ?? real.canWriteHealthData)(...a) };
});
vi.mock('@/lib/health/intake', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/health/intake')>();
  return { ...real, latestIntake: (...a: Parameters<typeof real.latestIntake>) => (h.latest ?? real.latestIntake)(...a) };
});
// the two client components are stood in for: this test reads the tree the page builds, not what they render
const { stub } = vi.hoisted(() => ({ stub: (displayName: string) => Object.assign(() => null, { displayName }) }));
vi.mock('@/app/play/mirror/_components/mirror-harness', () => ({ MirrorHarness: stub('MirrorHarness') }));
vi.mock('@/app/play/mirror/_components/health-intake-gate', () => ({ HealthIntakeGate: stub('HealthIntakeGate') }));
vi.mock('@/app/play/mirror/_components/guardian-consent-gate', () => {
  h.guardianImported = true;            // runs only if something imports the module
  return { GuardianConsentGate: stub('GuardianConsentGate') };
});

import { readFileSync } from 'node:fs';
import { isValidElement, type ReactElement } from 'react';
import MirrorPage from '@/app/play/mirror/page';
import { MirrorHarness } from '@/app/play/mirror/_components/mirror-harness';
import { HealthIntakeGate } from '@/app/play/mirror/_components/health-intake-gate';
import { UNKNOWN_LOCAL_STATUS } from '@/app/play/mirror/_components/intake-refusal';
import { INTAKE_VERSION } from '@/lib/health/intake';
import { youthGateFor } from '@/lib/mirror/screenCorrectives';
import {
  HEALTH_ADULT, HEALTH_REFUSED_CASES, THIS_YEAR, callsOn, newSpyDb, spyPrisma, type AgeCase, type SpyDb,
} from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-rhc-page';
let db: SpyDb;
function as(c: AgeCase, o: { optedIn?: boolean } = {}) {
  db = newSpyDb();
  c.seed(db, UID);
  h.prisma = spyPrisma(db);
  h.session = { user: { id: UID } };
  h.optedIn = o.optedIn ?? false;
}

type El = ReactElement<Record<string, any>>;
function all(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) { node.forEach((n) => all(n, out)); return out; }
  if (!isValidElement(node)) return out;
  out.push(node as El);
  all((node.props as Record<string, unknown>).children, out);
  return out;
}
const nameOf = (el: El) => (typeof el.type === 'string' ? el.type : (el.type as { displayName?: string }).displayName ?? '');
async function render() {
  const root = (await MirrorPage()) as El;
  const gate = root.props.children as El;
  const harness = gate.props.children as El;
  return { root, gate, harness };
}
const recent = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

beforeEach(() => {
  h.canSave = null; h.canWrite = null; h.latest = null; h.optedIn = false;
});

const USERS: [string, AgeCase, { optedIn?: boolean }, { canSaveScan: boolean; canWriteHealth: boolean }][] = [
  ...HEALTH_REFUSED_CASES.map((c) => [c.id, c, {}, { canSaveScan: false, canWriteHealth: false }] as [string, AgeCase, {}, { canSaveScan: boolean; canWriteHealth: boolean }]),
  ['adult 1990, not opted in', HEALTH_ADULT, {}, { canSaveScan: false, canWriteHealth: true }],
  ['adult 1990, opted in (opt-in mocked true)', HEALTH_ADULT, { optedIn: true }, { canSaveScan: true, canWriteHealth: true }],
];

describe.each(USERS)('%s', (_id, c, o, want) => {
  it('HealthIntakeGate wraps MirrorHarness directly; no GuardianConsentGate anywhere in the tree', async () => {
    as(c, o);
    const { root, gate, harness } = await render();
    expect(root.type).toBe('div');
    expect(gate.type).toBe(HealthIntakeGate);
    expect(harness.type).toBe(MirrorHarness);
    expect(all(root).map(nameOf)).toEqual(['div', 'HealthIntakeGate', 'MirrorHarness']);
  });

  it(`canSaveScan=${want.canSaveScan} on the Mirror, canWriteHealth=${want.canWriteHealth} on the intake (never canSaveScan)`, async () => {
    as(c, o);
    const { gate, harness } = await render();
    expect(harness.props.canSaveScan).toBe(want.canSaveScan);
    expect(gate.props.canWriteHealth).toBe(want.canWriteHealth);
    expect(gate.props).not.toHaveProperty('canSaveScan');
    expect(harness.props).not.toHaveProperty('canWriteHealth');
    expect(harness.props.youth).toBe(youthGateFor(db.tables.user[0].dobYear));
  });

  it('the GuardianConsent table is never read, and the guardian gate module is never imported', async () => {
    as(c, o);
    await render();
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
    expect(h.guardianImported).toBe(false);
  });

  it(want.canWriteHealth ? 'the verified adult: no intake-status read here (their gate asks the API)' : 'the browser-only intake gets its status from here: due, no stop', async () => {
    as(c, o);
    const { gate } = await render();
    if (want.canWriteHealth) {
      expect(callsOn(db, 'healthIntake')).toEqual([]);
      expect(gate.props.localStatus).toEqual(UNKNOWN_LOCAL_STATUS);
    } else {
      expect(callsOn(db, 'healthIntake')).toEqual(['healthIntake.findFirst']);
      expect(gate.props.localStatus).toEqual({ intakeDue: true, storedHardStop: false });
    }
  });
});

describe('the browser-only intake status, read on the server', () => {
  const intake = (o: Record<string, unknown>) => ({
    id: 'i1', userId: UID, version: INTAKE_VERSION, answers: {}, redFlags: [], birthYear: null,
    consentedAt: recent(), clearedAt: null, createdAt: recent(), ...o,
  });
  it('a current intake with a standing red flag → not due, stopped', async () => {
    as(HEALTH_REFUSED_CASES[1]);
    db.tables.healthIntake = [intake({ redFlags: ['heart_or_bp_condition'] })];
    expect((await render()).gate.props.localStatus).toEqual({ intakeDue: false, storedHardStop: true });
  });
  it('a current, cleared one → not due, not stopped', async () => {
    as(HEALTH_REFUSED_CASES[1]);
    db.tables.healthIntake = [intake({ redFlags: ['heart_or_bp_condition'], clearedAt: recent() })];
    expect((await render()).gate.props.localStatus).toEqual({ intakeDue: false, storedHardStop: false });
  });
  it('an old-version one → due again', async () => {
    as(HEALTH_REFUSED_CASES[0]);
    db.tables.healthIntake = [intake({ version: '2020-01-01' })];
    expect((await render()).gate.props.localStatus).toEqual({ intakeDue: true, storedHardStop: false });
  });
});

describe('NEVER-500 (AM 19:47 PT): no check can fail the page', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  const noPii = () => {
    const logged = warn.mock.calls.map((a: unknown[]) => a.join(' ')).join('\n');
    expect(logged).not.toContain(UID);
    expect(logged).not.toContain('@fel.test');
    expect(logged).not.toMatch(/\b(19|20)\d\d\b/);
    return logged;
  };

  it.each([
    ['throws', () => { throw new Error('boom'); }],
    ['rejects', async () => { throw Object.assign(new Error('db down'), { code: 'P1001' }); }],
  ])('canSaveScanNumbers %s → the page resolves with canSaveScan={false}', async (_n, impl) => {
    as(HEALTH_ADULT, { optedIn: true });
    h.canSave = impl;
    const { harness } = await render();
    expect(harness.props.canSaveScan).toBe(false);
    expect(noPii()).toContain('mirror_page_can_save_failed');
  });

  it.each([
    ['throws', () => { throw new Error('boom'); }],
    ['rejects', async () => { throw new Error('db down'); }],
  ])('canWriteHealthData %s → the page resolves with canWriteHealth={false}', async (_n, impl) => {
    as(HEALTH_ADULT);
    h.canWrite = impl;
    const { gate } = await render();
    expect(gate.props.canWriteHealth).toBe(false);
    expect(noPii()).toContain('mirror_page_health_write_failed');
  });

  it('latestIntake rejects (P2021: the table is missing) → the page resolves; localStatus is due, no stop', async () => {
    as(HEALTH_REFUSED_CASES[1]);
    h.latest = async () => { throw Object.assign(new Error('The table `public.HealthIntake` does not exist'), { code: 'P2021' }); };
    const { gate } = await render();
    expect(gate.props.localStatus).toEqual({ intakeDue: true, storedHardStop: false });
    expect(noPii()).toMatch(/mirror_page_intake_status_failed \w+ P2021/);
  });

  it('a thrown DB read (every prisma call rejects) → the page resolves: canSaveScan false, canWriteHealth false, due', async () => {
    as(HEALTH_ADULT, { optedIn: true });
    h.prisma = new Proxy({}, { get: () => new Proxy({}, { get: () => async () => { throw Object.assign(new Error('conn'), { code: 'P1001' }); } }) });
    const { gate, harness } = await render();
    expect(harness.props.canSaveScan).toBe(false);
    expect(gate.props.canWriteHealth).toBe(false);
    expect(gate.props.localStatus).toEqual({ intakeDue: true, storedHardStop: false });
    expect(harness.props.youth).toBe('unknownAge');
    noPii();
  });

  it('a session with no user id → the page resolves: both false, due, and no gate reads the database', async () => {
    as(HEALTH_ADULT, { optedIn: true });
    h.session = { user: {} };
    const { gate, harness } = await render();
    expect(harness.props.canSaveScan).toBe(false);
    expect(gate.props.canWriteHealth).toBe(false);
    expect(gate.props.localStatus).toEqual(UNKNOWN_LOCAL_STATUS);
    expect(db.calls).toEqual([]);
  });

  it('control: no session at all still redirects to /login, as before', async () => {
    h.session = null;
    await expect(MirrorPage()).rejects.toThrow('NEXT_REDIRECT /login');
  });

  it('control: the seeded 17-year-old really has an accepted GuardianConsent — and it still unlocks nothing', async () => {
    const c = HEALTH_REFUSED_CASES.find((x) => /17/.test(x.id))!;
    as(c);
    expect(db.tables.guardianConsent?.[0]?.acceptedAt).toBeInstanceOf(Date);
    expect(THIS_YEAR - db.tables.user[0].dobYear).toBe(17);
    const { gate, harness } = await render();
    expect([gate.props.canWriteHealth, harness.props.canSaveScan]).toEqual([false, false]);
  });
});

describe('STATIC: page.tsx', () => {
  const src = readFileSync(new URL('../../app/play/mirror/page.tsx', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('imports and mounts no GuardianConsentGate', () => {
    expect(code).not.toMatch(/GuardianConsentGate|guardian-consent-gate/);
  });
  it('asks the rules from their own modules (imported, not copied)', () => {
    expect(code).toContain("from '@/lib/privacy/scanSaveGate'");
    expect(code).toContain("from '@/lib/privacy/healthWriteGate'");
    expect(code).not.toMatch(/thisYear|getFullYear|dobYear\s*[<>]/);
  });
  it('the intake screen is handed canWriteHealth, the Mirror canSaveScan', () => {
    expect(code).toContain('<HealthIntakeGate canWriteHealth={canWriteHealth} localStatus={localStatus}>');
    expect(code).toContain('canSaveScan={canSaveScan} />');
  });
});
