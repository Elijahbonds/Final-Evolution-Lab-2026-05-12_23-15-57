import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as mod from './business';
import { BUSINESS_CONTACT_EMAIL, BUSINESS_LEGAL_NAME, REAL_MAILING_ADDRESS } from './business';

// LEGAL-COPY (2026-10-07; FE PM Oct 7 2:39 PM PT): the business address becomes ONE config value, read by every
// legal surface. These pin the value, that it is still a business (never a home/street) address, and that the
// literal text lives in exactly one non-test source file.

describe('the one business address', () => {
  // LEGAL-COPY-2 (FE PM 10:11 AM PT Oct 8): the placeholder constant is gone. No address is set, and nothing stands in
  // for one: no marker, token, placeholder or substitute address.
  it('has no placeholder and no address while unset', () => {
    expect(BUSINESS_LEGAL_NAME).toBe('Final Evolution LLC');
    expect(BUSINESS_CONTACT_EMAIL).toBe('FinalEvolution.us@gmail.com');
    expect('BUSINESS_MAILING_ADDRESS' in mod).toBe(false);
    expect(REAL_MAILING_ADDRESS).toBeNull();
    const src = readFileSync(join('lib', 'legal', 'business.ts'), 'utf8');
    expect(src).not.toContain('[Business mailing address');
    expect(src).not.toMatch(/pending/i);
    expect(src).not.toContain("'[");
    expect(src).not.toContain('"[');
  });

  it('is a business address, never a home/street address (passes addressRejected)', async () => {
    // Imported here only: the address module is a coach-store/money file, fine for a test to read.
    const { addressRejected } = await import('@/lib/coach-store/address');
    // LEGAL-COPY-2: the constant is gone, so the same rule runs over the whole source; REAL_MAILING_ADDRESS is still null.
    expect(addressRejected(readFileSync(join('lib', 'legal', 'business.ts'), 'utf8'))).toBeNull();
  });

  // STORE-TERMS-4 (FE PM 5:24 AM PT Oct 8): the approved store terms Part B (lib/store-terms/text-b.ts, frozen) has the
  // heading "2.7 Business mailing address", so it is the ONE other allowed carrier of that phrase. It never carries
  // the address itself: only the {BUSINESS_ADDRESS} token, which the page fills from lib/legal/business.ts.
  it('is the only non-test source carrying the literal text "Business mailing address" (plus the store terms Part B heading)', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return files(p);
        return /\.(ts|tsx)$/.test(name) && !name.includes('.test.') ? [p] : [];
      });
    const carriers: string[] = [];
    for (const root of ['app', 'components', 'lib']) {
      for (const file of files(root)) {
        if (/business mailing address/i.test(readFileSync(file, 'utf8'))) carriers.push(file);
      }
    }
    expect([...carriers].map((f) => f.split('\\').join('/')).sort()).toEqual(['lib/legal/business.ts', 'lib/store-terms/text-b.ts']);
  });

  it('the store terms Part B (lib/store-terms/text-b.ts) has exactly 2 {BUSINESS_ADDRESS} tokens and no written-out address', async () => {
    const { addressRejected } = await import('@/lib/coach-store/address');
    const src = readFileSync(join('lib', 'store-terms', 'text-b.ts'), 'utf8');
    expect(src.split('{BUSINESS_ADDRESS}').length - 1).toBe(2);
    // The same street-address rule as above finds no street address anywhere in the file, and there is no ZIP code.
    expect(addressRejected(src)).toBeNull();
    expect(src).not.toMatch(/\b\d{5}(?:-\d{4})?\b/);
    expect(src).not.toContain('[Business mailing address');
  });
});
