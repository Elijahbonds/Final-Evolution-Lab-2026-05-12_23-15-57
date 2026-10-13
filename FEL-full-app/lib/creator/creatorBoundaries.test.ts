import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const SOURCE_DIRS = ['app', 'components', 'lib', 'scripts', 'hooks', 'server'];

describe('creator platform boundaries (PR #18 slimmed down, owner 2026-10-13)', () => {
  it('no client component of the creator platform imports the database, the catalog or a store', () => {
    const client = [...files('components/creator-platform'), ...files('app/team'), ...files('app/media-kit'), ...files('app/work-with-us')]
      .filter((f) => readFileSync(f, 'utf8').startsWith("'use client'"));
    expect(client.length).toBeGreaterThan(0);
    for (const f of client) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/firebase|inquiryStore|creatorCatalog|@\/lib\/db|prisma/);
    }
  });

  it('firebase-admin and Firestore are gone: not a dependency, not imported anywhere', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(pkg.dependencies ?? {}).not.toHaveProperty('firebase-admin');
    expect(pkg.devDependencies ?? {}).not.toHaveProperty('firebase-admin');
    for (const dir of SOURCE_DIRS) {
      for (const f of files(dir)) {
        if (f.endsWith('creatorBoundaries.test.ts')) continue;
        expect(readFileSync(f, 'utf8'), f).not.toMatch(/from ['"]firebase-admin|require\(['"]firebase-admin|getFirestore\(|\.collection\(['"]/);
      }
    }
  });

  it('the booking engine, its checkout and webhook, and the Printful / Instagram / Connect stubs are gone', () => {
    for (const gone of [
      'app/api/creator/checkout', 'app/api/creator/slots', 'app/api/creator/webhook', 'app/bookings', 'app/team/[slug]/book',
      'components/creator-platform/slot-picker.tsx',
      'lib/creator/creatorCheckout.ts', 'lib/creator/creatorSlots.ts', 'lib/creator/creatorWebhook.ts', 'lib/creator/creatorStore.ts',
      'lib/creator/creatorStore.firestore.ts', 'lib/creator/fulfillment.ts', 'lib/creator/printful.ts', 'lib/creator/instagram.ts',
      'lib/creator/payouts.ts', 'lib/creator/notify.ts',
    ]) {
      expect(existsSync(gone), gone).toBe(false);
    }
  });

  it('what is kept still exists: team profiles, the media kit, work-with-us and the inquiry form and route', () => {
    for (const kept of [
      'app/team/page.tsx', 'app/team/[slug]/page.tsx', 'app/media-kit/page.tsx', 'app/work-with-us/page.tsx',
      'app/api/creator/inquiry/route.ts', 'components/creator-platform/inquiry-form.tsx', 'lib/creator/inquiryStore.ts',
    ]) {
      expect(existsSync(kept), kept).toBe(true);
    }
  });

  it('no creator page creates a Stripe checkout, and none reads a live Instagram, Printful or Connect endpoint', () => {
    const creator = [...files('app/team'), ...files('app/media-kit'), ...files('app/work-with-us'), ...files('app/api/creator'),
      ...files('components/creator-platform'), 'lib/creator/creatorCatalog.ts', 'lib/creator/inquiry.ts', 'lib/creator/inquiryStore.ts',
      'lib/creator/creatorViewer.ts'];
    for (const f of creator) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/checkout\.sessions|getBookStripe|from ['"]stripe['"]/);
      expect(src, f).not.toMatch(/graph\.instagram\.com|graph\.facebook\.com|accountLinks|accounts\.create|api\.printful\.com/);
    }
  });

  it('the Book buttons on /team link to the coach store, never to a booking page of our own', () => {
    for (const f of [...files('app/team'), 'lib/creator/creatorCatalog.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\/book\/\$\{|encodeURIComponent\(s\.id\)/);
    }
    const profile = readFileSync('app/team/[slug]/page.tsx', 'utf8');
    const index = readFileSync('app/team/page.tsx', 'utf8');
    expect(profile).toContain('coachStoreBookHref(profile)');
    expect(index).toContain('coachStoreBookHref(profile)');
    expect(readFileSync('lib/creator/creatorCatalog.ts', 'utf8')).toContain('`/coach/${profile.coachStoreSlug}`');
  });

  it('/work-with-us shows the form only when the inquiry table exists, and says "unavailable" otherwise', () => {
    const page = readFileSync('app/work-with-us/page.tsx', 'utf8');
    const probeAt = page.indexOf('inquiriesReady(');
    const gateAt = page.indexOf('{open ? (');
    const formAt = page.indexOf('<InquiryForm');
    expect(probeAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(probeAt);
    expect(formAt).toBeGreaterThan(gateAt);
    expect(page).toContain('INQUIRIES_UNAVAILABLE_MESSAGE');
    expect(page).not.toMatch(/\{true \? \(/);
  });
});
