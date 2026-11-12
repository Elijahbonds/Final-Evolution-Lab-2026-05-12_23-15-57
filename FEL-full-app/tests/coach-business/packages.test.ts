// COACH-BUSINESS: a coach's packages — what is accepted, the spots left, and which button shows.
import { describe, expect, it } from 'vitest';
import { packageAction, packagePriceLabel, parsePackageInput, spotsLeft } from '@/lib/coach-business/packages';
import { profileJsonLd, slugFromName, slugOk } from '@/lib/coach-business/profile';

const good = { kind: 'session_pack', title: 'Four sessions', summary: 'Live, one to one', priceCents: 20_000, includes: ['4 live sessions', ' A plan '], capacity: 5, sessions: 4 };

describe('packages', () => {
  it('accepts the four kinds, each with a price, what is included and a capacity', () => {
    expect(parsePackageInput(good)).toEqual({ ok: true, value: { ...good, includes: ['4 live sessions', 'A plan'], active: true } });
    expect(parsePackageInput({ ...good, kind: 'monthly', sessions: null, capacity: null })).toMatchObject({ ok: true, value: { capacity: null } });
    expect(parsePackageInput({ ...good, kind: 'single_review', sessions: undefined })).toMatchObject({ ok: true });
    expect(parsePackageInput({ ...good, kind: 'program', sessions: '' })).toMatchObject({ ok: true });
  });

  it('refuses what a coach could get wrong', () => {
    expect(parsePackageInput({ ...good, kind: 'bundle' })).toMatchObject({ ok: false, field: 'kind' });
    expect(parsePackageInput({ ...good, priceCents: 99 })).toMatchObject({ ok: false, field: 'priceCents' });
    expect(parsePackageInput({ ...good, priceCents: 1_000_001 })).toMatchObject({ ok: false, field: 'priceCents' });
    expect(parsePackageInput({ ...good, priceCents: 120.5 })).toMatchObject({ ok: false, field: 'priceCents' });
    expect(parsePackageInput({ ...good, includes: [] })).toMatchObject({ ok: false, field: 'includes' });
    expect(parsePackageInput({ ...good, capacity: 0 })).toMatchObject({ ok: false, field: 'capacity' });
    expect(parsePackageInput({ ...good, sessions: null })).toMatchObject({ ok: false, field: 'sessions' });
    expect(parsePackageInput({ ...good, kind: 'monthly', sessions: 4 })).toMatchObject({ ok: false, field: 'sessions' });
    expect(parsePackageInput({ ...good, title: 'x' })).toMatchObject({ ok: false, field: 'title' });
  });

  it('spots left and the button', () => {
    expect(spotsLeft(null, 99)).toBeNull();
    expect(spotsLeft(3, 1)).toBe(2);
    expect(spotsLeft(3, 7)).toBe(0);
    expect(packageAction({ paymentsLive: true, coachCanCharge: true, spotsLeft: 2, active: true })).toBe('book');
    expect(packageAction({ paymentsLive: false, coachCanCharge: true, spotsLeft: 2, active: true })).toBe('apply');
    expect(packageAction({ paymentsLive: true, coachCanCharge: false, spotsLeft: null, active: true })).toBe('apply');
    expect(packageAction({ paymentsLive: true, coachCanCharge: true, spotsLeft: 0, active: true })).toBe('full');
    expect(packageAction({ paymentsLive: true, coachCanCharge: true, spotsLeft: 1, active: false })).toBeNull();
    expect(packagePriceLabel(12_000, 'monthly')).toBe('$120.00 / month');
    expect(packagePriceLabel(4_000, 'single_review')).toBe('$40.00');
  });
});

describe('profile', () => {
  it('slugs never shadow a /coach page', () => {
    expect(slugOk('jordan-lee')).toBe(true);
    for (const bad of ['business', 'highlight', 'join', 'dashboard', 'ab', 'Jordan', '-x-', 'a--b']) expect(slugOk(bad), bad).toBe(false);
    expect(slugFromName('Jordan Lée')).toBe('jordan-lee');
    expect(slugFromName('Al')).toBe('coach-al');
  });

  it('JSON-LD escapes the coach\'s own text so it can never close the script tag', () => {
    const ld = profileJsonLd({ slug: 's', displayName: '</script><script>alert(1)</script>', headline: null, bio: null, specialties: [], certifications: [] }, [], 'https://x/coach/s');
    expect(ld).not.toContain('</script>');
    expect(JSON.parse(ld).name).toBe('</script><script>alert(1)</script>');
  });
});
