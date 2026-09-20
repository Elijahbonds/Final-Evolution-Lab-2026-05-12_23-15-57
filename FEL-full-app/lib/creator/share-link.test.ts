import { describe, expect, it } from 'vitest';
import { cardSharePath, cardShareUrl, cleanRefCode, signupPathFor } from './share-link';

describe('the card share link', () => {
  it('carries the owner\'s referral code — the whole point of the QR', () => {
    expect(cardSharePath('bonds', 'FEL7X2')).toBe('/card/bonds?ref=FEL7X2');
    expect(cardShareUrl('https://final-evolution-lab.web.app', 'bonds', 'fel7x2'))
      .toBe('https://final-evolution-lab.web.app/card/bonds?ref=FEL7X2');
    expect(signupPathFor('fel7x2')).toBe('/signup?ref=FEL7X2');
  });

  it('works without a code rather than pasting a broken one into the URL', () => {
    expect(cardSharePath('bonds', null)).toBe('/card/bonds');
    expect(cardSharePath('bonds', '')).toBe('/card/bonds');
    expect(signupPathFor(null)).toBe('/signup');
    // junk is dropped, not encoded: a malformed ref is worse than no ref, because it converts to nobody
    expect(cleanRefCode('../../etc')).toBeNull();
    expect(cleanRefCode('ab')).toBeNull();
    expect(cleanRefCode('THIS-CODE-IS-FAR-TOO-LONG')).toBeNull();
    expect(cardSharePath('bonds', 'no good')).toBe('/card/bonds');
  });

  it('normalises the slug and the origin so the QR and the clipboard never disagree', () => {
    expect(cardSharePath('BONDS')).toBe('/card/bonds');
    expect(cardShareUrl('https://x.dev/', 'bonds', 'FEL7X2')).toBe('https://x.dev/card/bonds?ref=FEL7X2');
  });
});
