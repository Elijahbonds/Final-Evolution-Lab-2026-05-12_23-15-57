// COACH-TOOLS-EASY (2026-11-02): the Messages inbox's order and its unread seam, the business page's "Still to do", the
// reviews on the result card's "no number" variant, and the coach home's names. Pure.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inboxRows, sheetTabFor, unreadFor } from '@/lib/coach-tools/inbox';
import { businessTodo } from '@/lib/coach-tools/businessTodo';
import { formReviewView, mirrorReviewView } from '@/lib/coach-tools/reviewResult';
import { lintStyle } from '@/lib/cue-style/style';

const ROOT = join(__dirname, '..', '..');
const ROSTER = [
  { id: 'a', name: 'Ada', programId: 'p-a' }, { id: 'b', name: 'Ben', programId: 'p-b' },
  { id: 'c', name: 'Cara', programId: null }, { id: 'd', name: 'Dev', programId: 'p-d' },
];

describe('the Messages inbox', () => {
  it('unread first, most first, then by name; athletes with no thread last', () => {
    const rows = inboxRows(ROSTER, { available: true, total: 3, byProgram: { 'p-d': 2, 'p-b': 1 } });
    expect(rows.map((r) => [r.id, r.unread])).toEqual([['d', 2], ['b', 1], ['a', 0], ['c', null]]);
  });
  it('before the read markers\' pending SQL is applied: no count at all (never a false 0), by name', () => {
    const rows = inboxRows(ROSTER, { available: false });
    expect(rows.map((r) => r.unread)).toEqual([null, null, null, null]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'd', 'c']);
    expect(unreadFor(null, 'p-a')).toBeNull();
  });
  it('the athlete sheet opens on the thread only when something there is unread', () => {
    expect(sheetTabFor(2)).toBe('thread');
    expect(sheetTabFor(0)).toBe('week');
    expect(sheetTabFor(null)).toBe('week');
  });
});

const DASH = {
  ready: true, paymentsLive: false, needsStripeSetup: true, marketplaceOn: true,
  profile: { slug: 's', displayName: 'Dee', headline: null, bio: null, specialties: [], certifications: [], published: false },
  market: { listed: false, acceptingClients: true, sports: [], goals: [] },
  packages: [], applications: [{ status: 'OPEN' }, { status: 'OPEN' }, { status: 'DECLINED' }], highlights: [{ id: 'h', text: 't', state: 'waiting' }],
} as unknown as Parameters<typeof businessTodo>[0];

describe('the business page\'s "Still to do"', () => {
  it('lists only what is left, each a jump to its card', () => {
    expect(businessTodo(DASH).map((t) => [t.id, t.href])).toEqual([['publish', '#profile-h'], ['package', '#pkg-h'], ['applications', '#apps-h'], ['results', '#hl-h']]);
    expect(businessTodo(DASH).find((t) => t.id === 'applications')!.text).toBe('Answer 2 applications');
  });
  it('payments appear only once the owner has turned them on; nothing about prices or fees', () => {
    expect(businessTodo(DASH).some((t) => t.id === 'payments')).toBe(false);
    expect(businessTodo({ ...DASH, paymentsLive: true }).some((t) => t.id === 'payments')).toBe(true);
    for (const t of businessTodo({ ...DASH, paymentsLive: true })) expect(t.text).not.toMatch(/\$|%|fee|price/i);
  });
  it('a published page with a package and nothing waiting: nothing to do', () => {
    const done = { ...DASH, profile: { ...DASH.profile!, published: true }, market: { ...DASH.market, listed: true }, packages: [{ active: true }], applications: [], highlights: [] } as unknown as Parameters<typeof businessTodo>[0];
    expect(businessTodo(done)).toEqual([]);
  });
});

describe('reviews on the result card\'s "no number" variant', () => {
  it('no number row; the read is the line; one next step', () => {
    const v = formReviewView('Goblet squat', 6, 'Knees cave in on reps 3 and 4.', true);
    expect(v.value).toBeNull();
    expect(v.measure).toBe('Goblet squat · 6 reps');
    expect(v.next.label).toBe('Send it to my coach');
    expect(formReviewView('Goblet squat', 1, 'x', false).next.label).toBe('Film it again');
    expect(mirrorReviewView('Squat', 8, 'The fix held.').value).toBeNull();
  });
  it('the new words pass the style guide', () => {
    for (const [l, tier] of [['Send it to my coach', 'label'], ['Film it again', 'label'], ['Next set', 'label'], ['Messages', 'label'],
      ['A thread starts with their first program.', 'card'], ['Still to do', 'label'], ['All set. Your page and packages are ready.', 'card'],
      ['Tap a cue to send it', 'label'], ['Or write a short note', 'label'], ['Readiness, pain and missed sessions', 'label']] as const) expect(lintStyle(l, tier), l).toEqual([]);
  });
});

describe('the coach home', () => {
  const home = readFileSync(join(ROOT, 'app/coach/_components/clients-view.tsx'), 'utf8');
  it('each tool is named for what it is; Messages and Combine day are rows of their own', () => {
    for (const old of ["'Roster check'", "'Filmed sets'", "reviews: 'Filmed sets'"]) expect(home).not.toContain(old);
    for (const name of ["'Form reviews'", "'Weekly plan updates'", "'Readiness and alerts'"]) expect(home).toContain(name);
    expect(home).toContain('data-coach-tool="combine"');
    expect(home).toContain("'messages'");
    expect(home).toContain('placeholder="Message your athlete"');
  });
  it('on a desktop: two columns, and the roster wraps instead of scrolling sideways', () => {
    const look = readFileSync(join(ROOT, 'components/coach/coach-queue/look.ts'), 'utf8');
    expect(look).toMatch(/columns: 'lg:grid lg:grid-cols-/);
    expect(look).toMatch(/strip: .*lg:flex-wrap lg:overflow-visible/);
  });
});
