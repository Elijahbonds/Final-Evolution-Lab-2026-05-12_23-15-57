// ACCOUNT-SHIFT (2026-11-12): /account's "Jump numbers" panel is decided on the server and is in the first paint.
// Before, it rendered nothing until two requests answered, then appeared on top for a verified adult and pushed every
// section below it down (CLS 0.112 on a phone; budget 0.02; PR #588). These fail on the code before the fix.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { ScanSaveAccount } from '@/components/privacy/scan-save-account';
import { readSavedHistory, readScanSaveAccountState, type ScanSaveAccountState } from '@/lib/privacy/scanSaveAccountState';
import { SCAN_SAVE_CONSENT_TEXT } from '@/lib/privacy/scanSaveConsent';

const src = (p: string) => readFileSync(p, 'utf8');
const thisYear = new Date().getUTCFullYear();
const AT = '2026-11-12T17:05:00.000Z';

/** a stand-in for prisma with the shapes the reads use */
function fakeDb(o: { dobYear: number | null; optIn: boolean; rows?: number; scansThrow?: boolean }) {
  const findMany = vi.fn(async () => {
    if (o.scansThrow) throw new Error('boom');
    return Array.from({ length: o.rows ?? 0 }, (_, i) => ({ id: `s${i}`, kind: 'dunk', metrics: { verticalCm: 60 + i }, createdAt: new Date(AT) }));
  });
  return {
    findMany,
    db: {
      user: { findUnique: async () => ({ dobYear: o.dobYear }) },
      scanSaveOptIn: { findUnique: async () => (o.optIn ? { granted: true, revokedAt: null, scope: 'jump_numbers', coachShares: null } : null) },
      coachClient: { findMany: async () => [] },
      workoutScan: { findMany },
    },
  };
}

describe('the server decides who sees the panel, with the same reads as its routes', () => {
  it('a verified adult who opted in: the panel and the list', async () => {
    const { db } = fakeDb({ dobYear: thisYear - 30, optIn: true, rows: 2 });
    const s = await readScanSaveAccountState(db, 'u1');
    expect(s).toMatchObject({ verifiedAdult: true, optedIn: true, visible: true, hasSaved: true });
    expect(s.items.map((i) => i.id)).toEqual(['s0', 's1']);
  });
  it('a verified adult who has not opted in: the panel, no list, the delete still offered when rows exist', async () => {
    const { db } = fakeDb({ dobYear: thisYear - 30, optIn: false, rows: 1 });
    expect(await readScanSaveAccountState(db, 'u1')).toEqual({ verifiedAdult: true, optedIn: false, visible: false, hasSaved: true, items: [] });
  });
  it('a teen, an exact 18-year gap and an unknown age see nothing, and their saved numbers are not read', async () => {
    for (const dobYear of [thisYear - 15, thisYear - 18, null]) {
      const { db, findMany } = fakeDb({ dobYear, optIn: true, rows: 3 });
      expect(await readScanSaveAccountState(db, 'u1')).toEqual({ verifiedAdult: false, optedIn: false, visible: false, hasSaved: false, items: [] });
      expect(findMany).not.toHaveBeenCalled();
    }
  });
  it('a failed read of the saved numbers fails closed, as the route did', async () => {
    const { db } = fakeDb({ dobYear: thisYear - 30, optIn: true, scansThrow: true });
    expect(await readSavedHistory(db, 'u1', { verifiedAdult: true, optedIn: true })).toEqual({ visible: false, hasSaved: false, items: [] });
  });
  it('/account reads it while it renders and hands it to the panel; the scan-history route answers from the same read', () => {
    const page = src('app/account/page.tsx');
    expect(page).toContain('await readScanSaveAccountState(prisma, userId)');
    expect(page).toContain('<ScanSaveAccount initial={scanSave} />');
    expect(src('app/api/account/scan-history/route.ts')).toContain('readSavedHistory(prisma, userId, status)');
  });
});

describe('the panel is in the first paint for the people who see it, and only for them', () => {
  const adult = (o: Partial<ScanSaveAccountState> = {}): ScanSaveAccountState => ({ verifiedAdult: true, optedIn: false, visible: false, hasSaved: false, items: [], ...o });

  it('a verified adult: the server HTML carries the panel, its heading and its unchanged consent words', () => {
    const html = renderToString(h(ScanSaveAccount, { initial: adult() }));
    expect(html).toContain('data-testid="scan-save-account"');
    expect(html).toContain('Jump numbers');
    expect(html).toContain(SCAN_SAVE_CONSENT_TEXT);
    expect(html).not.toContain('checked=""');
  });
  it('opted in with a saved number: the list is in the server HTML, its time held invisibly until the page is live', () => {
    const html = renderToString(h(ScanSaveAccount, { initial: adult({ optedIn: true, visible: true, hasSaved: true, items: [{ id: 'a', kind: 'prove_it', at: AT, numbers: { verticalCm: 61, judgesScore: 8 } }] }) }));
    expect(html).toContain('checked=""');
    expect(html).toMatch(/Prove It<\/span>/);
    expect(html).toContain(' · 61 cm');
    expect(html).toContain(' · judges 8');
    // the local time zone is unknown on the server: the slot is the UTC time, hidden, never shown as the person's time
    expect(html).toMatch(/<span style="visibility:hidden">11\/12\/2026, 5:05:00\sPM<\/span>/);
  });
  it('revoked with rows left: the delete is in the first paint', () => {
    expect(renderToString(h(ScanSaveAccount, { initial: adult({ hasSaved: true }) }))).toContain('data-testid="scan-save-delete"');
  });
  it('a teen or an unknown age: nothing, as before; with no server state it still waits for its requests', () => {
    expect(renderToString(h(ScanSaveAccount, { initial: { verifiedAdult: false, optedIn: false, visible: false, hasSaved: false, items: [] } }))).toBe('');
    expect(renderToString(h(ScanSaveAccount, { initial: null }))).toBe('');
    expect(renderToString(h(ScanSaveAccount))).toBe('');
  });
});
