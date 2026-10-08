// MIRROR-PROGRESS (2026-10-07; plan Phase 4): the Today card at the top of /play and /train — a coached athlete's door to
// today's session (lib/coach/todayCard.ts over the same in-memory database Today's own route tests use), the card's words,
// and its place on both pages. It defers to Today for why training is paused or lighter (the intake's red flag; COACH-AI's
// Limited / Out), and is the same for a coached minor.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({ view: null as unknown, userId: 'client-1' }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: h.userId } }) }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); } }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, { get: (_t, table: string) => (table === 'then' ? undefined : new Proxy({}, { get: () => async () => null })) }),
}));
vi.mock('@/components/shell/tab-page', () => ({ TabPage: (p: { children?: ReactNode }) => createElement('div', null, p.children) }));
vi.mock('@/components/shell/doors-row', () => ({ DoorsRow: () => null }));
vi.mock('@/components/shell/play-shelf', () => ({ PlayShelf: () => createElement('section', { 'data-shelf': true }, 'THE SHELF') }));
vi.mock('@/components/shell/venue-strip', () => ({ VenueStrip: () => null }));
vi.mock('@/components/season-pass-track', () => ({ SeasonPassTrack: () => null }));
// the pages' own read is stood in for here; todayCardFor itself is tested over the memory database below
vi.mock('@/lib/coach/todayCard', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/coach/todayCard')>();
  return { ...real, todayCardFor: vi.fn(async () => h.view) };
});

import TrainPage from '@/app/train/page';
import PlayPage from '@/app/play/page';
import { TodayCard } from '@/components/coach/today-card';
import { catalogueRow, newTodayStore, seedProgram, todayMemoryDb, type TodayStore } from '@/lib/coach/todayMemoryDb';

const { todayCardFor, todayCardLines, TODAY_HREF } = await vi.importActual<typeof import('@/lib/coach/todayCard')>('@/lib/coach/todayCard');

const THIS_YEAR = new Date().getFullYear();
let store: TodayStore;
let S: string[] = [];
let PID = '';
const NOW = new Date('2026-10-07T12:00:00Z');
const notSet = async () => null;

function seed(dobYear: number | null, sessions = [
  { order: 1, label: 'Day 1', exercises: [{ exerciseId: 'pe-goblet' }, { exerciseId: 'pe-row' }] },
  { order: 2, label: 'Day 2', kind: 'recovery' as const, exercises: [{ exerciseId: 'pe-row' }] },
]) {
  store = newTodayStore();
  store.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear });
  store.pe.push(catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat' }), catalogueRow({ id: 'pe-row', coachId: 'coach-1', name: 'Row' }));
  const ids = seedProgram(store, { coachId: 'coach-1', clientId: 'client-1', name: 'Base block', blockLabel: 'Week 1', sessions });
  S = ids.sessionIds; PID = ids.programId;
}
const complete = (sessionId: string) => {
  const at = new Date('2026-10-01T10:00:00Z');
  store.cs.push({ id: `cs-${sessionId}`, programId: PID, sessionId, clientId: 'client-1', completedAt: at, cooldownDoneAt: null, createdAt: at, updatedAt: at });
};
const card = (db = todayMemoryDb(store), availability = notSet as (db: unknown, u: string, d: string) => Promise<'full' | 'limited' | 'out' | null>) =>
  todayCardFor(db, 'client-1', { now: NOW, availability });

describe('todayCardFor', () => {
  beforeEach(() => seed(1990));

  it('a coached athlete: the next session, where it sits, how much is in it', async () => {
    expect(await card()).toEqual({
      kind: 'session', programName: 'Base block', coachName: 'Coach One', blockLabel: 'Week 1', sessionLabel: 'Day 1',
      index: 0, total: 2, exercises: 2, offDay: false,
    });
  });

  it('moves on with the program (the same "next" as Today), and names an off day as one', async () => {
    complete(S[0]);
    expect(await card()).toMatchObject({ kind: 'session', sessionLabel: 'Day 2', index: 1, offDay: true });
  });

  it('no card: not coached, a finished program, an inactive one, or a read that fails', async () => {
    expect(await todayCardFor(todayMemoryDb(newTodayStore()), 'client-1', { now: NOW, availability: notSet })).toBeNull();
    complete(S[0]); complete(S[1]);
    expect(await card()).toBeNull();
    seed(1990);
    store.program[0].isActive = false;
    expect(await card()).toBeNull();
    seed(1990);
    const broken = { ...todayMemoryDb(store), coachingProgram: { findMany: async () => { throw new Error('db down'); } } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await card(broken)).toBeNull();
  });

  it('defers to Today: a standing intake red flag, or Out, drops the session preview; Limited keeps it', async () => {
    expect(await card(undefined, async () => 'out')).toEqual({ kind: 'open', programName: 'Base block', coachName: 'Coach One' });
    expect(await card(undefined, async () => 'limited')).toMatchObject({ kind: 'session' });
    store.healthIntake.push({ id: 'hi-1', userId: 'client-1', createdAt: new Date('2026-10-01T00:00:00Z'), redFlags: ['chestPain'], clearedAt: null, answers: {} });
    expect(await card()).toMatchObject({ kind: 'open' });
  });

  it('the availability table not there yet (or failing): the card still shows the session', async () => {
    expect(await card(undefined, async () => { throw new Error('relation "CoachAvailability" does not exist'); })).toMatchObject({ kind: 'session' });
  });

  it('a coached 15-year-old gets the same card, and nothing is written', async () => {
    seed(THIS_YEAR - 15);
    const before = JSON.stringify(store);
    expect(await card()).toMatchObject({ kind: 'session', sessionLabel: 'Day 1' });
    expect(JSON.stringify(store)).toBe(before);
  });
});

describe('the card', () => {
  it('opens Today (/coach), says the session, and never says why training is paused', () => {
    const html = renderToStaticMarkup(createElement(TodayCard, { view: { kind: 'session', programName: 'Base block', coachName: 'Coach One', blockLabel: 'Week 1', sessionLabel: 'Day 1', index: 0, total: 8, exercises: 5, offDay: false } }));
    expect(TODAY_HREF).toBe('/coach');
    expect(html).toContain('href="/coach"');
    expect(html).toContain('Week 1 · Day 1');
    expect(html).toContain('Session 1 of 8 · 5 exercises');
    const open = todayCardLines({ kind: 'open', programName: 'Base block', coachName: 'Coach One' });
    expect(Object.values(open).join(' ')).not.toMatch(/out|limited|red flag|pain|injur|clinician/i);
    expect(renderToStaticMarkup(createElement(TodayCard, { view: null }))).toBe('');
  });
});

describe('its place: first on /train and on /play, for a coached athlete only', () => {
  const VIEW = { kind: 'session', programName: 'Base block', coachName: 'Coach One', blockLabel: 'Week 1', sessionLabel: 'Day 1', index: 0, total: 8, exercises: 5, offDay: false };

  it('/train: above the shelf\'s first card', async () => {
    h.view = VIEW;
    const html = renderToStaticMarkup(await TrainPage());
    expect(html).toContain('data-testid="today-card"');
    expect(html.indexOf('data-testid="today-card"')).toBeLessThan(html.indexOf('The Mirror'));
    h.view = null;
    expect(renderToStaticMarkup(await TrainPage())).not.toContain('today-card');
  });

  it('/play: above the game shelf', async () => {
    h.view = VIEW;
    const html = renderToStaticMarkup(await PlayPage());
    expect(html.indexOf('data-testid="today-card"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="today-card"')).toBeLessThan(html.indexOf('THE SHELF'));
    h.view = null;
    expect(renderToStaticMarkup(await PlayPage())).not.toContain('today-card');
  });
});
