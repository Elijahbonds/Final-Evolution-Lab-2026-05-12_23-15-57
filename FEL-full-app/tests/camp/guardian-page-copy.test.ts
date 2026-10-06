// SAFETY FIX (owner-approved 2026-10-06): /consent/guardian said "The Mirror, pain check-ins and the daily check-in are
// open now" after a guardian's OK — false since TEEN-WRITE-BLOCK (2026-09-29) took the guardian path off health writes.
// The copy now says what the OK unlocks today, and this test holds each claim to the code that makes it true.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const src = (p: string): string => readFileSync(p, 'utf8');
const code = (p: string): string => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const PAGE = code('app/consent/guardian/page.tsx');
const GATE = code('app/play/mirror/_components/guardian-consent-gate.tsx');

describe('what the guardian page tells a player the OK unlocks', () => {
  it('no screen promises the Mirror, pain check-ins or the daily check-in open with a guardian\'s OK', () => {
    expect(PAGE).not.toMatch(/are open now/);
    for (const s of [PAGE, GATE]) {
      expect(s).not.toMatch(/keep using the Mirror, pain check-ins and the daily check-in/);
      expect(s).not.toMatch(/before you can use the Mirror, log a pain check-in or answer the daily check-in/);
    }
  });

  it('it says the one thing the OK unlocks — a camp plan going live — and that is what the camp route gates on', () => {
    expect(PAGE).toMatch(/camp\s+plan your coach builds with you go live/);
    expect(GATE).toMatch(/before a camp plan your coach builds with you can go live/);
    const plans = code('app/api/v1/camp/plans/route.ts');
    expect(plans).toMatch(/if \(needsGuardianConsent\(birthYear\) && !consent\) return bad\('guardian_consent_required', 412\);/);
  });

  it('pain and daily check-ins save only for a verified 18+, guardian or not — as the page says', () => {
    expect(PAGE).toMatch(/Pain check-ins and the daily check-in save only for players who are 18 or over/);
    for (const route of ['app/api/health/pain/route.ts', 'app/api/health/readiness/route.ts']) {
      expect(code(route), route).toMatch(/if \(!\(await canWriteHealthData\(prisma, userId\)\)\) return refuseHealthWrite\(\);/);
    }
  });

  it('the Mirror runs on the device for everyone and keeps nothing under 18 — no guardian gate in front of it', () => {
    expect(PAGE).toMatch(/The Mirror runs on your device either way; under 18 it keeps nothing/);
    const mirror = code('app/play/mirror/page.tsx');
    expect(mirror).not.toMatch(/<GuardianConsentGate/);
    expect(mirror).toMatch(/canSaveScanNumbers\(prisma, id\)/);
  });
});
