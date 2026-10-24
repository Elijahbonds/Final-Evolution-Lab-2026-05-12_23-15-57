// CHALLENGES-2: the result card — both scores, who won, and only the sign-up offers each viewer may get (owner: play
// first, sign up only to save or to rematch; the age-screen block never sees a sign-up offer).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ChallengeResultCard, type ChallengeResultCardProps } from '@/components/challenges/challenge-result-card';
import { referralLine } from '@/components/challenges/referral-ping';

const base: ChallengeResultCardProps = {
  code: 'abc123', title: 'Downtown', outcome: 'won', myScore: '46', theirScore: '40', theirName: 'A friend', viewer: 'signed-in',
};
const card = (p: Partial<ChallengeResultCardProps>) => renderToStaticMarkup(createElement(ChallengeResultCard, { ...base, ...p }));

describe('the result card', () => {
  it('shows both scores and who won, in each outcome', () => {
    expect(card({})).toContain('You won');
    expect(card({ outcome: 'lost' })).toContain('They won this one');
    expect(card({ outcome: 'tie' })).toContain('A tie');
    const html = card({});
    expect(html).toMatch(/data-score="mine">46</);
    expect(html).toMatch(/data-score="theirs">40</);
    expect(html).toContain('A friend');
  });

  it('signed in: one REMATCH button and no sign-up; the name option only for an adult', () => {
    const html = card({});
    expect(html).toContain('data-action="rematch"');
    expect(html).not.toContain('/signup');
    expect(html).not.toContain('data-rematch-name');
    expect(card({ canShowName: true })).toContain('data-rematch-name="choice"');
  });

  it('an adult guest: sign-up to rematch and to save, nothing else', () => {
    const html = card({ viewer: 'guest' });
    expect(html).toContain('href="/signup?c=abc123"');
    expect(html).toContain('REMATCH — SIGN UP FIRST');
    expect(html).toContain('SAVE MY RESULT');
    expect(html).not.toContain('data-action="rematch"');
  });

  it('local (a teen, or play without saving): nothing to save; sign-up only to rematch; says it stayed here', () => {
    const html = card({ viewer: 'local' });
    expect(html).toContain('This result stays on this phone. Nothing was sent.');
    expect(html).toContain('SIGN UP TO REMATCH');
    expect(html).not.toContain('SAVE MY RESULT');
  });

  it('the age-screen block: no sign-up offer at all', () => {
    const html = card({ viewer: 'blocked' });
    expect(html).not.toContain('/signup');
    expect(html).not.toContain('data-action="rematch"');
    expect(html).toMatch(/data-score="mine">46</);
  });

  it('a carried result says it was saved from the guest run', () => {
    expect(card({ carried: true })).toContain('Saved to your account from your guest run.');
  });
});

describe('the referral line', () => {
  it('speaks only when this view paid something, and never names the other account', () => {
    expect(referralLine(null)).toBeNull();
    expect(referralLine({ asFriend: { status: 'not_yet' }, asReferrer: [{ status: 'already' }] })).toBeNull();
    expect(referralLine({ asFriend: { status: 'granted', amount: 100 }, asReferrer: [] })).toBe('+100 Lab Credits: you finished your first week. Your friend got the same.');
    expect(referralLine({ asFriend: { status: 'no_referral' }, asReferrer: [{ status: 'granted', amount: 100 }, { status: 'granted', amount: 100 }] }))
      .toBe('+200 Lab Credits: 2 friends you challenged finished a first week. They got the same.');
  });
});
