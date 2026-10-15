import { isCoachStoreEnabled } from '@/lib/flags';

/**
 * A "Book" link is shown only while the coach store is open. `/coach/<slug>` is a 404 whenever COACH_STORE_ENABLED is off
 * (app/coach/[slug]/page.tsx), and it is off by default, so /team and /team/<slug> were offering a Book button that led
 * to a "page not found" on the live site (bug sweep 2026-10-14: GET /coach/elijahbonds returned 404). Pass the href from
 * coachStoreBookHref; `enabled` is a seam for tests.
 */
export function bookHrefWhenStoreOpen(href: string | null, enabled: boolean = isCoachStoreEnabled()): string | null {
  return enabled ? href : null;
}
