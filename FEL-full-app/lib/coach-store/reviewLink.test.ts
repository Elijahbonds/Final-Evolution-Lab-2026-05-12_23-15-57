import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewHref, reviewRole, reviewStudioOpen } from './reviewLink';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('review studio: who gets one', () => {
  it('is the review route for the booking', () => {
    expect(reviewHref('bk_1')).toBe('/coach/review/bk_1');
    expect(reviewHref('a/b')).toBe('/coach/review/a%2Fb');
  });

  it('opens only for a paid video review', () => {
    expect(reviewStudioOpen({ kind: 'video_review', status: 'PAID' })).toBe(true);
    expect(reviewStudioOpen({ kind: 'video_review', status: 'HELD' })).toBe(false);
    expect(reviewStudioOpen({ kind: 'video_review', status: 'REFUND_DUE' })).toBe(false);
    expect(reviewStudioOpen({ kind: 'live_1on1', status: 'PAID' })).toBe(false);
  });

  it('gives the coach side only to the booking coach on the allowlist, the buyer the client side, anyone else nothing', () => {
    const b = { coachUserId: 'coach', clientUserId: 'buyer' };
    expect(reviewRole(b, 'coach', true)).toBe('coach');
    expect(reviewRole(b, 'coach', false)).toBe(null);
    expect(reviewRole(b, 'buyer', false)).toBe('client');
    expect(reviewRole(b, 'buyer', true)).toBe('client');
    expect(reviewRole(b, 'stranger', true)).toBe(null);
  });
});

describe('review studio: it is actually reachable', () => {
  // The orphan walk counts any `/coach/review/${…}` template anywhere, so reviewLink.ts alone would satisfy it.
  // These pin the two real doors and the coach side of the page.
  it('the coach dashboard links each open review', () => {
    const src = read('app/coach/dashboard/page.tsx');
    expect(src).toMatch(/reviewStudioOpen\(b\)\s*\?\s*<Link[^>]*href=\{reviewHref\(b\.id\)\}/);
  });

  it("the buyer's thanks page links a paid review to the studio", () => {
    const src = read('components/coach-store/thanks-poll.tsx');
    expect(src).toMatch(/reviewStudioOpen\(\{ kind: json\.kind, status: json\.status \}\)/);
    expect(src).toMatch(/href=\{reviewHref\(rowId\)\}/);
  });

  it('the page hands the coach the coach side of the studio', () => {
    const src = read('app/coach/review/[bookingId]/page.tsx');
    expect(src).toMatch(/<ReviewStudio bookingId=\{booking\.id\} coach=\{role === 'coach'\} \/>/);
    expect(src).toMatch(/if \(!role\) notFound\(\)/);
  });
});
