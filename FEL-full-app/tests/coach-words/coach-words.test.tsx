// COACH-WORDS (owner, 2026-11-12): "shorter first-screen wording" on five coach screens, the owner reviews every line
// (docs/COACH-WORDING-REVIEW.md). Each screen is rendered in the state the every-screen rig scores, and the test holds two
// things: the explanation that was cut stays cut, and every money, consent and privacy sentence is still there word for word.
// /coach/highlight/[id] and /coach/session: nothing cut (all consent and privacy wording); see ./notices.test.tsx.
// No assertion here replaced an older one: no test asserted the cut sentences (they were added with this lane).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  invite: null as null | Record<string, unknown>,
}));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  notFound: () => { throw new Error('notFound'); },
  redirect: (to: string) => { throw new Error(`redirect ${to}`); },
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    coachInvite: { findUnique: vi.fn(async () => h.invite) },
    coachClient: { findUnique: vi.fn(async () => null) },
  },
}));

import CoachBusinessThanksPage from '@/app/coach/business/thanks/page';
import JoinPage from '@/app/coach/join/[token]/page';
import { RecordSet } from '@/components/coach/form-review/record-set';

/** the words a person reads: tags out, entities decoded, whitespace collapsed */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

describe('/coach/business/thanks, opened with no checkout session', () => {
  it('the explanation is shorter; the payment sentence is word for word', async () => {
    const shown = text(renderToStaticMarkup(await CoachBusinessThanksPage({ searchParams: {} })));
    expect(shown).toContain('This page confirms a coach booking after you pay.');
    expect(shown).not.toContain('This page opens after you pay');
    expect(shown).toContain('There is no payment to look up from here.');   // money wording: unchanged
    expect(shown).toContain('Nothing to show here');
  });
});

describe('/coach/join/[token]', () => {
  const at = Date.now();
  const invite = (over: Record<string, unknown> = {}) => ({
    token: 't1', coachId: 'coach1', use: 'once', closedAt: null, expiresAt: new Date(at + 86_400_000), joined: 0,
    createdAt: new Date(at - 1000), coach: { name: 'Coach Riley' }, ...over,
  });
  it('an open invite: no "Coach invite" label over the heading; what the athlete agrees to is word for word', async () => {
    h.invite = invite(); h.session = { user: { id: 'athlete1' } };
    const shown = text(renderToStaticMarkup(await JoinPage({ params: { token: 't1' } })));
    expect(shown).not.toContain('Coach invite');
    expect(shown).toContain('Coach Riley wants to coach you');
    // consent wording: unchanged
    expect(shown).toContain('Accept and Coach Riley can build your programming, watch your movement screens and send you work. You can leave at any time.');
    expect(shown).toContain('Join Coach Riley');
    h.session = null;
  });
  it('an expired invite says what to do in one line', async () => {
    h.invite = invite({ expiresAt: new Date(at - 1000) });
    const shown = text(renderToStaticMarkup(await JoinPage({ params: { token: 't1' } })));
    expect(shown).toContain('This invite has expired');
    expect(shown).toContain('Ask your coach for a fresh link.');
    expect(shown).not.toContain('they can make one in a tap');
  });
});

describe('/coach/form-review, the record screen before filming', () => {
  it('one short line on what the camera does; the estimate and privacy lines are word for word', () => {
    const shown = text(renderToStaticMarkup(createElement(RecordSet, { ctx: { programId: 'p1', sessionExerciseId: 's1', exerciseName: 'Goblet squat', movement: 'squat', ready: true, send: { ok: true } } as never })));
    expect(shown).toContain('The camera counts and checks each rep. Every number is an estimate.');
    expect(shown).not.toContain('The camera counts your reps and reads each one.');
    expect(shown).not.toContain('Your camera shows here.');
    expect(shown).toContain('Nothing is recorded to a file.');                // privacy: unchanged
    expect(shown).toContain('Film a set for your coach');
  });
});
