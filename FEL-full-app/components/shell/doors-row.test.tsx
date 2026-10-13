// The Profile tab's Bookings door (owner 2026-10-13): present on Profile, lights Profile, and hidden while the page is off.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { DOORS, doorsFor } from '@/lib/nav/doors';
import { DoorsRow } from './doors-row';
import { tabForPath } from './tab-bar';

describe('Bookings door', () => {
  it('is a Profile door, and /account/bookings keeps the Profile tab lit', () => {
    expect(DOORS.find((d) => d.href === '/account/bookings')).toEqual(expect.objectContaining({ tab: 'profile', label: 'Bookings' }));
    expect(doorsFor('profile').map((d) => d.href)).toContain('/account/bookings');
    expect(tabForPath('/account/bookings')?.id).toBe('profile');
  });

  it('shows on the Profile row, and `hide` drops it so the row never links to a 404', () => {
    expect(renderToStaticMarkup(createElement(DoorsRow, { tab: 'profile' }))).toContain('href="/account/bookings"');
    const hidden = renderToStaticMarkup(createElement(DoorsRow, { tab: 'profile', hide: ['/account/bookings'] }));
    expect(hidden).not.toContain('/account/bookings');
    expect(hidden).toContain('href="/press"');
  });

  it('the Profile page hides the door while COACH_STORE_ENABLED is off', () => {
    const src = readFileSync('app/profile/page.tsx', 'utf8');
    expect(src).toContain("hide={isCoachStoreEnabled() ? [] : ['/account/bookings']}");
  });
});
