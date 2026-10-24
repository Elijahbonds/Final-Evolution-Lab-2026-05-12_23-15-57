// #326 MIRROR SAVE OPT-IN — TEENS CAN NEVER OPT IN (cursor-bundle-2, 2026-10-24; owner: "Teens must never be able to opt in").
//
// The Mirror now offers a verified adult the scan-save opt-in in-page (ScanSaveCard → POST /api/account/scan-save).
// This file pins that no 13–17 account — nor an unknown age, a missing row, a 12-year-old, or an exactly-18-by-year
// account — can turn Mirror saves on from it, at all three layers, each with an adult positive control so a test that
// passes because nothing renders or nothing runs is caught:
//   1. the page (app/play/mirror/page.tsx) hands the harness scanSaveEligible=false for every one of them, from the
//      DATABASE's User.dobYear — a parent's accepted GuardianConsent (what the coach loop's teen gate reads for TRAINING
//      saves, lib/coach/teenGate.ts) does not count, nor does a consent's menteeBirthYear behind a blank account year;
//   2. the harness, rendered with what the page hands a teen, shows no opt-in card and no consent checkbox, and the
//      save decision (lib/privacy/mirrorScanSaveOptIn.ts) stays false even if a grant were somehow recorded;
//   3. the server: POST /api/account/scan-save { granted: true } from each of them answers 403 and writes nothing.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as unknown, prisma: null as any }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); } }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));

import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MirrorPage from '@/app/play/mirror/page';
import { MirrorHarness } from '@/app/play/mirror/_components/mirror-harness';
import { POST as scanSavePost } from '@/app/api/account/scan-save/route';
import { mirrorCanSave, mirrorScanSaveOffered } from '@/lib/privacy/mirrorScanSaveOptIn';
import { SCAN_SAVE_CONSENT_TEXT } from '@/lib/privacy/scanSaveConsent';
import { youthGateFor } from '@/lib/mirror/screenCorrectives';
import {
  REFUSED_SCAN_CASES, THIS_YEAR, newSpyDb, seedAcceptedGuardian, seedUser, spyPrisma, writesOf, type AgeCase, type SpyDb,
} from '@/tests/helpers/writeSpyDb';

const UID = 'mirror-opt-in-teen';
let db: SpyDb;

function as(seed: (db: SpyDb, id: string) => void) {
  db = newSpyDb();
  seed(db, UID);
  h.prisma = spyPrisma(db);
  h.session = { user: { id: UID } };
}

/** Every account that is not a verified adult: REFUSED_SCAN_CASES less its adult-not-opted-in row, plus two more. */
const NOT_ADULT: AgeCase[] = [
  ...REFUSED_SCAN_CASES.filter((c) => !c.id.startsWith('18+')),
  withSeed('13', THIS_YEAR - 13),
  withSeed('16 with an accepted GuardianConsent', THIS_YEAR - 16, (d) => seedAcceptedGuardian(d, UID, THIS_YEAR - 16)),
  // the coach loop's teen gate reads a consent's menteeBirthYear when the account year is blank; the Mirror must not
  withSeed('blank year, accepted GuardianConsent naming an adult birth year', null, (d) => seedAcceptedGuardian(d, UID, 1990)),
];
const ADULT: AgeCase = withSeed('adult (1990), not opted in', 1990);

function withSeed(id: string, dobYear: number | null, extra?: (db: SpyDb) => void): AgeCase {
  return { id, dobYear, seed: (d, uid) => { seedUser(d, uid, dobYear); extra?.(d); } };
}

type El = ReactElement<Record<string, any>>;
async function harnessProps(): Promise<Record<string, any>> {
  const root = (await MirrorPage()) as El;
  const harness = (root.props.children as El).props.children as El;
  expect(isValidElement(harness) && harness.type).toBe(MirrorHarness);
  return harness.props;
}

function renderHarness(props: Record<string, any>): string {
  return renderToStaticMarkup(createElement(MirrorHarness, props));
}

async function grant(): Promise<Response> {
  return scanSavePost(new Request('http://fel.test/api/account/scan-save', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ granted: true }),
  }) as never);
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('control: the cases really are the ages they say', () => {
  it('the seeded years', () => {
    expect(NOT_ADULT.length).toBeGreaterThanOrEqual(9);
    for (const c of NOT_ADULT) if (typeof c.dobYear === 'number') expect(THIS_YEAR - c.dobYear, c.id).toBeLessThanOrEqual(18);
    expect(THIS_YEAR - (ADULT.dobYear as number)).toBeGreaterThan(18);
  });
});

describe.each(NOT_ADULT.map((c) => [c.id, c] as const))('%s — can never opt in to Mirror saves', (_id, c) => {
  it('1. the page hands the harness scanSaveEligible=false and canSaveScan=false', async () => {
    as(c.seed);
    const props = await harnessProps();
    expect(props.scanSaveEligible).toBe(false);
    expect(props.canSaveScan).toBe(false);
    expect(mirrorScanSaveOffered({ canSaveScan: props.canSaveScan, scanSaveEligible: props.scanSaveEligible })).toBe(false);
  });

  it('2. the harness, given what the page hands this account, shows no opt-in card and no consent checkbox', async () => {
    as(c.seed);
    const html = renderHarness(await harnessProps());
    expect(html).not.toContain('data-mirror-scan-save-opt-in');
    expect(html).not.toContain('scan-save-toggle');
    expect(html).not.toContain(SCAN_SAVE_CONSENT_TEXT);
  });

  it('2b. the save decision stays false even if a grant were recorded on the page', () => {
    expect(mirrorCanSave({ canSaveScan: false, scanSaveEligible: false, grantedHere: true })).toBe(false);
  });

  it('3. POST /api/account/scan-save { granted: true } answers 403 and writes nothing', async () => {
    as(c.seed);
    const res = await grant();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'scan_save_adults_only', saved: false });
    expect(writesOf(db)).toEqual([]);
    expect(db.tables.scanSaveOptIn ?? []).toEqual([]);
  });
});

describe('positive control: a verified adult who has not opted in', () => {
  it('1. the page marks them eligible', async () => {
    as(ADULT.seed);
    const props = await harnessProps();
    expect(props.scanSaveEligible).toBe(true);
    expect(props.canSaveScan).toBe(false);
    expect(props.youth).toBe(youthGateFor(1990));
  });

  it('2. the harness shows the card, with the approved consent sentence and its checkbox unticked', async () => {
    as(ADULT.seed);
    const html = renderHarness(await harnessProps());
    expect(html).toContain('data-mirror-scan-save-opt-in');
    expect(html).toContain('data-testid="scan-save-toggle"');
    expect(html).toContain(SCAN_SAVE_CONSENT_TEXT);
    expect(html).not.toMatch(/scan-save-toggle"[^>]*checked/);
  });

  it('2b. saves start only once the server confirmed the grant', () => {
    expect(mirrorCanSave({ canSaveScan: false, scanSaveEligible: true, grantedHere: false })).toBe(false);
    expect(mirrorCanSave({ canSaveScan: false, scanSaveEligible: true, grantedHere: true })).toBe(true);
    // already opted in: no card (the Account page is where they change it), saves on
    expect(mirrorScanSaveOffered({ canSaveScan: true, scanSaveEligible: true })).toBe(false);
    expect(mirrorCanSave({ canSaveScan: true, scanSaveEligible: true, grantedHere: false })).toBe(true);
  });

  it('3. POST /api/account/scan-save { granted: true } is accepted and writes the one opt-in row', async () => {
    as(ADULT.seed);
    const res = await grant();
    expect(res.status).toBe(200);
    expect(writesOf(db)).toEqual(['scanSaveOptIn.upsert']);
    expect(db.tables.scanSaveOptIn).toHaveLength(1);
    expect(db.tables.scanSaveOptIn[0]).toMatchObject({ userId: UID, granted: true, revokedAt: null });
  });
});
