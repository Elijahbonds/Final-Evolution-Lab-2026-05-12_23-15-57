import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTION_KEY, ATTRIBUTION_TTL_DAYS, NONE, attributionFromSearch, attributionProps, attributionReport, captureFirstTouch,
  cleanAttribution, cleanRef, cleanTag, readFirstTouch, signupAttribution,
} from './utm';

const memory = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const NOW = Date.UTC(2026, 9, 25, 12);

describe('ONB-04: reading the tags', () => {
  it('reads utm_source / medium / campaign and ref, cleaned', () => {
    expect(attributionFromSearch('?utm_source=Instagram&utm_medium=bio%20link&utm_campaign=Fall_Launch&ref=amir7')).toEqual({
      source: 'instagram', medium: 'bio-link', campaign: 'fall_launch', ref: 'AMIR7',
    });
    expect(attributionFromSearch('?foo=1')).toBeNull();
    expect(attributionFromSearch('')).toBeNull();
  });

  it('drops anything that is not a tag: an email address, markup, an over-long ref', () => {
    expect(cleanTag('someone@example.com')).toBeNull();
    expect(cleanTag('<script>x</script>')).toBe('scriptxscript');
    expect(cleanTag('x'.repeat(200))).toHaveLength(64);
    expect(cleanRef('ABCDEFGHIJKLMNOPQ')).toBeNull();
    expect(cleanRef('code!!')).toBe('CODE');
    expect(cleanAttribution({ source: 'a@b.c' })).toBeNull();
    expect(cleanAttribution('nope')).toBeNull();
  });
});

describe('ONB-04: keeping the first touch, first-party', () => {
  it('keeps the first tagged visit, and a later one does not overwrite it', () => {
    const s = memory();
    expect(captureFirstTouch('?utm_source=x&ref=CODE', s, NOW)).toMatchObject({ source: 'x', ref: 'CODE', day: '2026-10-25' });
    expect(captureFirstTouch('?utm_source=y', s, NOW + 3_600_000)).toMatchObject({ source: 'x' });
    expect(JSON.parse(s.m.get(ATTRIBUTION_KEY)!)).toEqual({ source: 'x', medium: null, campaign: null, ref: 'CODE', day: '2026-10-25' });
  });

  it('keeps no id, no time of day and no page: four tags and a day', () => {
    const s = memory();
    captureFirstTouch('?utm_campaign=c&gclid=abc&fbclid=def&email=a%40b.c', s, NOW);
    expect(Object.keys(JSON.parse(s.m.get(ATTRIBUTION_KEY)!)).sort()).toEqual(['campaign', 'day', 'medium', 'ref', 'source']);
    expect(s.m.get(ATTRIBUTION_KEY)).not.toMatch(/gclid|fbclid|abc|def|@/);
  });

  it(`expires after ${ATTRIBUTION_TTL_DAYS} days, so a new first touch can start`, () => {
    const s = memory();
    captureFirstTouch('?utm_source=old', s, NOW);
    const later = NOW + (ATTRIBUTION_TTL_DAYS + 2) * 86_400_000;
    expect(readFirstTouch(s, later)).toBeNull();
    expect(captureFirstTouch('?utm_source=new', s, later)).toMatchObject({ source: 'new' });
  });

  it('never throws on a blocked or corrupt store', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(captureFirstTouch('?utm_source=x', blocked, NOW)).toMatchObject({ source: 'x' });
    expect(readFirstTouch({ getItem: () => '{not json' }, NOW)).toBeNull();
    expect(readFirstTouch(null, NOW)).toBeNull();
  });

  it('posts only the four tags with the sign-up, and nothing when there were none', () => {
    expect(signupAttribution({ source: 'x', medium: null, campaign: null, ref: 'CODE' })).toEqual({ source: 'x', medium: null, campaign: null, ref: 'CODE' });
    expect(signupAttribution(null)).toBeUndefined();
    expect(attributionProps({ source: 'x', medium: null, campaign: null, ref: 'CODE' })).toEqual({ utmSource: 'x', utmRef: 'CODE' });
  });
});

describe('ONB-04: counting it in the funnel', () => {
  it('groups sign-ups by source and joins each one to its FIRST paid order', () => {
    const lines = attributionReport(
      [
        { userId: 'u1', props: { fromGuest: false, utmSource: 'x', utmRef: 'CODE' } },
        { userId: 'u2', props: { fromGuest: false, utmSource: 'x', utmRef: 'CODE' } },
        { userId: 'u3', props: { fromGuest: true } },
        { userId: 'u1', props: { utmSource: 'x', utmRef: 'CODE' } }, // a repeat event for the same account counts once
      ],
      [
        { userId: 'u1', amount: 999, createdAt: new Date('2026-10-26') },
        { userId: 'u1', amount: 4999, createdAt: new Date('2026-10-28') },
        { userId: 'u3', amount: 500, createdAt: new Date('2026-10-27') },
      ],
    );
    expect(lines[0]).toEqual({ source: 'x', medium: NONE, campaign: NONE, ref: 'CODE', signups: 2, purchasers: 1, firstPurchaseCents: 999 });
    expect(lines[1]).toEqual({ source: NONE, medium: NONE, campaign: NONE, ref: NONE, signups: 1, purchasers: 1, firstPurchaseCents: 500 });
  });
});
