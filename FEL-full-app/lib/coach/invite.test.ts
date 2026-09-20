import { describe, expect, it } from 'vitest';
import {
  INVITE_TTL_MS, inviteState, inviteUrl, invitePath, isOpen, joinWithInvite, type CoachInvite,
} from './invite';

const NOW = 1_700_000_000_000;
const inv = (o: Partial<CoachInvite> = {}): CoachInvite => ({
  token: 'tok', coachId: 'coach1', coachName: 'Elijah', use: 'many',
  createdAtMs: NOW - 1000, expiresAtMs: NOW + INVITE_TTL_MS.many, joined: 0, ...o,
});

describe('the coach invite', () => {
  it('a live link is open; a spent or expired one is not', () => {
    expect(isOpen(inv(), NOW)).toBe(true);
    expect(inviteState(inv({ expiresAtMs: NOW - 1 }), NOW)).toBe('expired');
    expect(inviteState(inv({ closedAtMs: NOW - 1 }), NOW)).toBe('closed');
    expect(inviteState(null, NOW)).toBe('unknown');
  });

  it('a one-shot link dies when it is used; a flyer link does not', () => {
    const once = joinWithInvite(inv({ use: 'once' }), 'client1', NOW, false);
    expect(once.result).toBe('joined');
    expect(once.closeInvite).toBe(true);
    const many = joinWithInvite(inv({ use: 'many' }), 'client1', NOW, false);
    expect(many.result).toBe('joined');
    expect(many.closeInvite).toBe(false);
  });

  it('tapping your own invite twice is a no-op, not an error — and never spends a one-shot', () => {
    const again = joinWithInvite(inv({ use: 'once' }), 'client1', NOW, true);
    expect(again.ok).toBe(true);
    expect(again.result).toBe('already');
    expect(again.closeInvite).toBe(false);          // the link is still there for the person it was meant for
    expect(again.message).toMatch(/already working with Elijah/i);
  });

  it('a coach cannot join their own roster', () => {
    const self = joinWithInvite(inv(), 'coach1', NOW, false);
    expect(self.ok).toBe(false);
    expect(self.result).toBe('self');
  });

  it('a dead link explains itself in words the athlete can act on', () => {
    expect(joinWithInvite(inv({ expiresAtMs: NOW - 1 }), 'c', NOW, false).message).toMatch(/expired.*new link/i);
    expect(joinWithInvite(inv({ closedAtMs: NOW - 1 }), 'c', NOW, false).message).toMatch(/already been used/i);
    expect(joinWithInvite(null, 'c', NOW, false).message).toMatch(/not valid/i);
  });

  it('a flyer link outlives a texted one', () => {
    expect(INVITE_TTL_MS.many).toBeGreaterThan(INVITE_TTL_MS.once);
  });

  it('one builder for the link, so the QR and the copy button cannot disagree', () => {
    expect(invitePath('abc')).toBe('/coach/join/abc');
    expect(inviteUrl('https://final-evolution-lab.web.app/', 'abc'))
      .toBe('https://final-evolution-lab.web.app/coach/join/abc');
    expect(invitePath('a/b?c')).toBe('/coach/join/a%2Fb%3Fc');   // a token never breaks out of its path
  });
});
