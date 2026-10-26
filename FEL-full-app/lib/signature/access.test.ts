// SIGNATURE-PROGRAMS (2026-10-25): who sees a program (draft vs approved) and which weeks open (the free starter week vs
// FEL Pro), through the page's own view builder; and the retest reads against the start of the program.
import { describe, expect, it } from 'vitest';
import { loadLibraryFiles } from '@/lib/library/files';
import { FREE_WEEKS, canSee, canStart, statusOf, weekAccess, type Viewer } from './access';
import { signatureProgram } from './content';
import { NO_ROWS, readsFrom, windows } from './facts';
import { PRO_NOT_ON_SALE_LINE, YOUTH_PRO_LINE } from './copy';
import type { DayGate, ExerciseLite } from './serve';
import { buildProgramView, programCard } from './view';
import type { Enrollment } from './types';

const LIB = new Map(loadLibraryFiles().map((e) => [e.id, e]));
const lookup = (id: string): ExerciseLite | null => {
  const e = LIB.get(id);
  return e ? { id: e.id, name: e.name, setup: e.setup, cues: e.cues, faults: e.faults, pattern: e.pattern, category: e.category, youthOk: e.youthOk, prehabNote: e.prehabNote, dosage: e.dosage } : null;
};
const GATE: DayGate = { youth: false, hardStopped: false, painDecision: null, jumpGate: { closed: false, why: '', href: null }, readinessLow: false };
const athlete = (o: Partial<Viewer> = {}): Viewer => ({ userId: 'u1', isAdmin: false, youth: false, hasPro: false, ...o });
const VJ = signatureProgram('vertical-jump')!;
const PF = signatureProgram('pain-free')!;
const week1Done: Enrollment = { programId: 'vertical-jump', startedAt: '2026-10-01T00:00:00.000Z', done: { 'w1:A': 'x', 'w1:B': 'x', 'w1:C': 'x' }, events: [] };
const view = (o: Partial<Parameters<typeof buildProgramView>[0]> = {}) =>
  buildProgramView({ program: VJ, status: 'approved', viewer: athlete(), ready: true, enrollment: null, gate: GATE, lookup, purchasesOpen: false, ...o });

describe('draft vs approved', () => {
  it('every program is a draft until the owner approves it', () => {
    expect(statusOf('vertical-jump', new Map())).toBe('draft');
    expect(statusOf('vertical-jump', new Map([['vertical-jump', { status: 'approved' }]]))).toBe('approved');
    expect(statusOf('vertical-jump', new Map([['vertical-jump', { status: 'nonsense' }]]))).toBe('draft');
  });

  it('an athlete never sees a draft or a rejected program; the admin previews both, labelled, with the gaps', () => {
    expect(canSee('draft', { isAdmin: false })).toBe(false);
    expect(canSee('rejected', { isAdmin: false })).toBe(false);
    expect(canSee('approved', { isAdmin: false })).toBe(true);
    expect(view({ status: 'draft' })).toBeNull();
    expect(view({ status: 'rejected' })).toBeNull();
    const admin = view({ status: 'draft', viewer: athlete({ isAdmin: true }) })!;
    expect(admin).toMatchObject({ draft: true, canStart: false });
    expect(admin.gaps!.length).toBeGreaterThan(0);
    const seen = view()!;
    expect(seen).toMatchObject({ draft: false, canStart: true, gaps: null });
  });

  it('only an approved program can be started, and only once the tables are applied', () => {
    expect(canStart('draft')).toBe(false);
    expect(canStart('approved')).toBe(true);
    expect(view({ ready: false })!).toMatchObject({ canStart: false, keep: 'none' });
  });
});

describe('the free starter week vs FEL Pro', () => {
  it('week 1 is free; later weeks need an active FEL Pro', () => {
    expect(FREE_WEEKS).toBe(1);
    expect(weekAccess(1, { hasPro: false })).toBe('free');
    expect(weekAccess(2, { hasPro: false })).toBe('locked');
    expect(weekAccess(2, { hasPro: true })).toBe('pro');
  });

  it('before starting, week 1 is served in full and every later week is locked for a non-Pro athlete', () => {
    const v = view()!;
    expect(v.current).toMatchObject({ week: 1, access: 'free' });
    expect(v.current!.sessions.length).toBe(3);
    expect(v.weeks.slice(1).every((w) => w.access === 'locked' && w.sessions.every((s) => s.state === 'locked'))).toBe(true);
  });

  it('after the free week a non-Pro athlete gets the lock and NO content of week 2; no checkout while payments are off', () => {
    const v = view({ enrollment: week1Done })!;
    expect(v.current).toMatchObject({ week: 2, access: 'locked', sessions: [] });
    expect(v.premium).toMatchObject({ locked: true, line: PRO_NOT_ON_SALE_LINE, purchasesOpen: false, checkout: null });
    const open = view({ enrollment: week1Done, purchasesOpen: true })!;
    // test changed (payments-ready): the link was a GET to the POST-only checkout route (405); it opens the /pro buy page now
    expect(open.premium.checkout?.monthly).toBe('/pro?plan=monthly');
  });

  it('a FEL Pro athlete gets week 2 served', () => {
    const v = view({ enrollment: week1Done, viewer: athlete({ hasPro: true }) })!;
    expect(v.current).toMatchObject({ week: 2, access: 'pro' });
    expect(v.current!.sessions.length).toBe(3);
    expect(v.nextSessionId).toBe('w2:A');
    expect(v.premium.locked).toBe(false);
  });

  it('under youth rules: progress on the phone, the free week only (FEL Pro is 18+), even holding a Pro row', () => {
    const v = view({ viewer: athlete({ youth: true, hasPro: true }), enrollment: week1Done })!;
    expect(v).toMatchObject({ keep: 'device', youth: true, enrolled: false });
    expect(v.current).toMatchObject({ week: 1, access: 'free' });
    expect(v.weeks.slice(1).every((w) => w.access === 'locked')).toBe(true);
    expect(v.premium).toMatchObject({ line: YOUTH_PRO_LINE, checkout: null });
  });

  it('the pain-free page carries the prehab note', () => {
    expect(view({ program: PF })!.prehabNote).toBe('General prehab, not treatment.');
    expect(programCard(PF, 'approved', null, false).prehabNote).toBe('General prehab, not treatment.');
  });

  it('the card says where the athlete is', () => {
    const c = programCard(VJ, 'approved', week1Done, false);
    expect(c.progress).toMatchObject({ week: 2, of: 10, sessionsDone: 3, weekDone: 0, weekTotal: 3, next: 'Mon · Land and stick' });
  });
});

describe('the retest reads', () => {
  const start = Date.parse('2026-09-01T00:00:00Z');
  const now = Date.parse('2026-10-20T00:00:00Z');
  const day = 86_400_000;
  it('compare the start window with the last two weeks, never overlapping', () => {
    const w = windows(start, start + 3 * day);
    expect(w.recent[0]).toBeGreaterThanOrEqual(w.start[1]);
  });
  it('a jump up past the same-band reads up; a drop past the draft\'s inch reads down; nothing reads none', () => {
    const at = (d: number) => start + d * day;
    expect(readsFrom({ ...NO_ROWS, jumps: [{ at: at(1), cm: 50 }, { at: now - 2 * day, cm: 55 }] }, start, now).jump).toBe('up');
    expect(readsFrom({ ...NO_ROWS, jumps: [{ at: at(1), cm: 50 }, { at: now - 2 * day, cm: 50.5 }] }, start, now).jump).toBe('same');
    expect(readsFrom({ ...NO_ROWS, jumps: [{ at: at(1), cm: 50 }, { at: now - 2 * day, cm: 46 }] }, start, now).jump).toBe('down');
    expect(readsFrom(NO_ROWS, start, now)).toMatchObject({ jump: 'none', form: 'none', shot: 'none', landing: 'not_yet', readiness: 'none' });
    expect(readsFrom({ ...NO_ROWS, landingPassed: true, readinessLowDays: 2 }, start, now)).toMatchObject({ landing: 'pass', readiness: 'down' });
    expect(readsFrom({ ...NO_ROWS, form: [{ at: at(2), share: 0.5 }, { at: now - day, share: 0.7 }] }, start, now).form).toBe('up');
  });
});
