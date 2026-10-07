import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUSINESS_CONTACT_EMAIL, BUSINESS_LEGAL_NAME, BUSINESS_MAILING_ADDRESS } from './business';

// LEGAL-COPY (2026-10-07; FE PM Oct 7 2:39 PM PT): the business address becomes ONE config value, read by every
// legal surface. These pin the value, that it is still a business (never a home/street) address, and that the
// literal text lives in exactly one non-test source file.

describe('the one business address', () => {
  it('is the agreed placeholder, en dash included', () => {
    expect(BUSINESS_LEGAL_NAME).toBe('Final Evolution LLC');
    expect(BUSINESS_MAILING_ADDRESS).toBe('[Business mailing address – pending]');
    expect(BUSINESS_CONTACT_EMAIL).toBe('FinalEvolution.us@gmail.com');
  });

  it('is a business address, never a home/street address (passes addressRejected)', async () => {
    // Imported here only: the address module is a coach-store/money file, fine for a test to read.
    const { addressRejected } = await import('@/lib/coach-store/address');
    expect(addressRejected(BUSINESS_MAILING_ADDRESS)).toBeNull();
  });

  it('is the only non-test source carrying the literal text "Business mailing address"', () => {
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
    expect(carriers).toEqual([expect.stringMatching(/lib[/\\]legal[/\\]business\.ts$/)]);
  });
});
