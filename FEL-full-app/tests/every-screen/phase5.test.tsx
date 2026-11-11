// EVERY-SCREEN P5 (2026-11-11): "Booking, groups and the coach's day" — what phase 5 changed, as tests. Each fails on the
// code before it. The walks themselves (join ≤ 4, a 1:1 ≤ 5, cancel ≤ 3 with the rule first, adjust ≤ 4, attendance one
// tap a person) are scripts/every-screen/jobs-list.mts, on the LIT rig for the booking ones (jobs.mts --lit).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { shouldScrollTop } from '@/components/shell/nav-scroll-top';
import { readLine, READ_LINE } from '@/components/program-ask/program-builder';
import { bandBody, nextSession } from '@/components/coach/quick-adjust';
import { todaySlot } from '@/components/group-booking/coach-groups';
import { Fold } from '@/components/every-screen/fold';
import { quietGain } from '@/components/dual-wallet-chip';
import type { ProgramTree, TreeExercise } from '@/lib/coach/loop';

const src = (p: string) => readFileSync(p, 'utf8');

describe('booking: the doors, the rule first, and fewer taps', () => {
  it('Train shows Groups, Book a 1:1 and your sessions only once booking is open (nothing that leads to "Opens soon")', () => {
    const t = src('app/train/page.tsx');
    expect(t).toContain('groupBookingOpen(prisma as unknown as GroupDb)');
    expect(t).toMatch(/\.\.\.\(groupsOpen \? \[\{\s*href: '\/groups'/);
    expect(t).toContain("href: '/groups/one-on-one'");
    expect(t).toContain('{groupsOpen ? <MyGroupSessions compact /> : null}');
    expect(src('lib/group-booking/server.ts')).toContain('export async function groupBookingOpen(');
  });
  it('your sessions on Train: hidden with nothing booked; the cancel rule sits above the Cancel buttons', () => {
    const m = src('components/group-booking/my-group-sessions.tsx');
    expect(m).toContain("if (compact && !seats.some((x) => x.status === 'booked') && !ones.some((x) => x.status === 'booked')) return null;");
    expect(m.indexOf('{compact && mine.cancelLine ?')).toBeLessThan(m.indexOf('<ul className={L.rows}>'));
  });
  it('a 1:1 with one way to book open (in person while the coach store is off) has it picked already', () => {
    const b = src('components/group-booking/one-on-one-booker.tsx');
    expect(b).toContain('useState<\'online\' | \'in_person\' | null>(trainers.length === 1 ? only(trainers[0]) : null)');
  });
  it("a group that meets today opens on today's roster, so attendance is one tap a person", () => {
    const now = Date.parse('2026-11-11T20:00:00Z');                   // Wed 12:00 in Los Angeles
    const s = (key: string, at: string) => ({ slotKey: key, label: key, startsAt: at, taken: 1 });
    expect(todaySlot([s('mon', '2026-11-09T03:00:00Z'), s('wed', '2026-11-12T03:00:00Z')], now)).toBe('wed');   // Wed 7 pm LA
    expect(todaySlot([s('mon', '2026-11-10T03:00:00Z')], now)).toBeNull();
    expect(src('components/group-booking/coach-groups.tsx')).toContain("const small = 'fel-press inline-flex min-h-11");
  });
  it("the coach's groups screen draws a switched-off board with the page (no Loading… line pushed down)", () => {
    const g = src('app/coach/groups/page.tsx');
    expect(g).toContain('const open = await groupBookingOpen(');
    expect(g).toContain('{open ? <CoachGroups /> : <OpensSoon');
  });
});

describe("the coach's day: adjust one exercise in 4 taps from the first screen", () => {
  const ex = (id: string, name: string, band: string | null = 'drive'): TreeExercise => ({
    id, order: 1, exerciseId: `x-${id}`, name, sets: 3, reps: '8', load: '', tempo: '3-1-1-0', restSeconds: 90, coachNote: null,
    section: 'key' as TreeExercise['section'], isKeySet: false, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: band,
  });
  const tree: ProgramTree = { id: 'p', name: 'P', coachId: 'c', clientId: 'a', blocks: [
    { id: 'b1', order: 1, label: 'Week 1', targetDate: null, sessions: [
      { id: 's1', order: 1, label: 'Session 1', exercises: [ex('e1', 'Squat')] },
      { id: 's2', order: 2, label: 'Session 2', kind: 'recovery', exercises: [ex('e2', 'Walk')] },
      { id: 's3', order: 3, label: 'Session 3', exercises: [ex('e3', 'Push-up')] },
    ] },
  ] };
  it('the Program tab lists the next session the athlete does (not one done, never an off day)', () => {
    expect(nextSession(tree, [])?.id).toBe('s1');
    expect(nextSession(tree, ['s1'])?.id).toBe('s3');
    expect(nextSession(tree, ['s1', 's3'])).toBeNull();
  });
  it("a band tap sends the builder's own update with only the band changed", () => {
    const b = bandBody(ex('e1', 'Squat'), 'cruise');
    expect(b).toMatchObject({ action: 'update', sessionExerciseId: 'e1', effortBand: 'cruise', sets: 3, reps: '8', tempo: '3-1-1-0' });
  });
  it('the athlete sheet shows it above "Open the builder"', () => {
    const v = src('app/coach/_components/clients-view.tsx');
    expect(v.indexOf('<QuickAdjust')).toBeGreaterThan(-1);
    expect(v.indexOf('<QuickAdjust')).toBeLessThan(v.indexOf('data-open-builder>Open the builder'));
  });
});

describe('carried from phase 4', () => {
  it('1. once a program is built, what FEL read folds to one line ("What FEL read: … Change")', () => {
    expect(READ_LINE).toBe('What FEL read:');
    expect(readLine(['Only one band', 'Medium band', 'Full body', '3 days a week', '40 min'])).toBe('only one band · medium band · full body · 3 days a week …');
    expect(readLine(['Full body', '3 days a week'])).toBe('full body · 3 days a week');
    const b = src('components/program-ask/program-builder.tsx');
    expect(b).toContain('const readFolded = !!p && !askOpen && !readOpen;');
    expect(b).toContain('<section data-testid="program-chips" hidden={readFolded}');
  });
  it('2. a page opened by a tap starts at its top, never under the sticky rail', () => {
    expect(shouldScrollTop(110, 113, '', false)).toBe(true);           // the rig's case: scrolled less than the rail
    expect(shouldScrollTop(0, 113, '', false)).toBe(false);            // already at the top
    expect(shouldScrollTop(110, 113, '#mine', false)).toBe(false);     // an anchor keeps its place
    expect(shouldScrollTop(110, 113, '', true)).toBe(false);           // back / forward keeps what the browser restores
    expect(shouldScrollTop(900, 113, '', false)).toBe(false);          // further than the page's start: Next placed it
    expect(src('app/layout.tsx')).toContain('<NavScrollTop />');
  });
  it('3. the daily first-session coins show by the chip, not as a toast over the screen (the amount is unchanged)', () => {
    expect(quietGain('daily_first_session')).toBe(true);
    expect(quietGain('game_win')).toBe(false);
    expect(quietGain(undefined)).toBe(false);
    const c = src('components/dual-wallet-chip.tsx');
    expect(c).toContain('pointer-events-none absolute');
    expect(src('lib/wallet/client.ts')).toContain('event: report.event_type');
  });
});

describe('the screens: sizes, targets and folds', () => {
  it('a Fold renders nothing inside until it is opened (a closed <details> still laid its words out)', () => {
    const html = renderToStaticMarkup(h(Fold, { summary: 'How to set the phone up', testId: 't' }, h('p', null, 'hidden words')));
    expect(html).toContain('How to set the phone up');
    expect(html).not.toContain('hidden words');
    expect(html).toContain('aria-expanded="false"');
  });
  it('set-up guides are folds: shots, bar speed (tips and slow-motion), sprint steps', () => {
    expect(src('components/hoops-cam/shot-session.tsx')).not.toContain('<details');
    expect(src('components/vbt/velocity-session.tsx')).not.toContain('<details className="text-xs text-white/60" data-vbt-guide>');
    expect(src('components/vbt/velocity-session.tsx')).toContain('testId="vbt-slowmo"');
    expect(src('components/sprint/speed-app.tsx')).toContain('testId="sprint-steps"');
  });
  it('no text under 12 px in the sprint diagram; no empty history; 44 px targets', () => {
    expect(src('components/sprint/setup-diagram.tsx')).not.toMatch(/fontSize=\{(?:[0-9]|1[01])\}/);
    expect(src('components/sprint/speed-app.tsx')).toContain("${cameraOn || !runs.length ? 'hidden' : ''}");
    expect(src('components/library/look.ts')).toContain('inline-flex min-h-11 shrink-0');
    expect(src('components/hoops-cam/look.ts')).toContain('fel-press min-h-11 rounded-full');
    expect(src('components/sessions-view.tsx')).toContain('flex min-h-11 items-center justify-center text-[12px] text-cyan-300 underline">How to earn shards');
    expect(src('components/vbt/velocity-session.tsx')).toContain('min-h-11 min-w-11 rounded-md border px-2');
  });
  it('today\'s drill says nothing rather than "No scores yet." (its Start is right there)', () => {
    expect(src('app/train/today-drill/_components/today-drill-run.tsx')).toContain("view.skill && view.focus !== 'starter' ?");
  });
  it('the admin category box is named (it was named by its placeholder only)', () => {
    expect(src('app/coach/admin/_components/kb-admin.tsx')).toContain('aria-label="New category name"');
  });
});
