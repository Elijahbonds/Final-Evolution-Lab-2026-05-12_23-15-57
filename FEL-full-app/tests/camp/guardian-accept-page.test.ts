// MIRROR-COACH P6 (2026-09-29): the guardian accept page's player screens and the accept button's two flows. No DOM
// in this runner (node environment), so — like components/coach/readiness-checkin.test.tsx — a server render is the
// real first paint, the pure helpers are called directly, and the wiring is read from source.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerRequest } from '@/app/consent/guardian/[token]/player-request';
import { AcceptButton, acceptErrorCopy, acceptRequest } from '@/app/consent/guardian/[token]/accept-button';
import { PLAYER_ACCEPT_REFUSALS } from '@/lib/consent/guardianAccept';

const render = (step: Parameters<typeof PlayerRequest>[0]['step']) =>
  renderToStaticMarkup(createElement(PlayerRequest, { step, token: 'tok-1', menteeName: 'Jordan' }));

describe('PlayerRequest — one screen per step, a button only where the route would say yes', () => {
  it('signed out: sign in or make an account, and NO accept button', () => {
    const html = render('sign_in');
    expect(html).toContain('href="/login?next=%2Fconsent%2Fguardian%2Ftok-1"');
    expect(html).toContain('href="/signup?next=%2Fconsent%2Fguardian%2Ftok-1"');
    expect(html).toContain('come back to this page');
    expect(html).not.toContain('<button');
  });

  it('the mentee: told it is for their parent or guardian, NO accept button', () => {
    const html = render('is_mentee');
    expect(html).toContain('signed in as Jordan');
    expect(html).not.toContain('<button');
  });

  it('an account that reads as a minor: told why, NO accept button', () => {
    const html = render('not_adult');
    expect(html).toContain('has to be an adult');
    expect(html).not.toContain('<button');
  });

  it('no birth year on file: the button, with a birth-year field, disabled until four digits', () => {
    const html = render('declare_birth_year');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });

  it('an adult on file: the button, no field', () => {
    const html = render('confirm');
    expect(html).toContain('<button');
    expect(html).not.toContain('<input');
    expect(html).not.toMatch(/<button[^>]*disabled=""/);
  });

  it('copy stays inside the lane rules — no fear words, no claims about keeping anyone safe', () => {
    const all = (['sign_in', 'is_mentee', 'not_adult', 'declare_birth_year', 'confirm'] as const).map(render).join(' ');
    expect(all).not.toMatch(/reduc\w* risk|prevent\w* injur|diagnos|guarantee|verif(y|ied) (your )?(identity|age)/i);
  });
});

describe('AcceptButton — the camp flow is P5\'s, unchanged', () => {
  it('camp: the same GET P5 made, no body', () => {
    expect(acceptRequest('camp', 'a b')).toEqual({ url: '/api/v1/camp/consent?token=a%20b' });
  });

  it('camp: the same render P5 made (no field, same button)', () => {
    const html = renderToStaticMarkup(createElement(AcceptButton, { token: 't' }));
    expect(html).not.toContain('<input');
    expect(html).toContain('Yes, I&#x27;m their parent or guardian');
  });

  it('camp: P5\'s two error strings, word for word', () => {
    expect(acceptErrorCopy('camp', 'self_accept_blocked')).toBe(
      "This has to be confirmed by your parent or guardian, not you — you're currently signed in as the athlete this is for. Sign out first, or have them open this link on their own phone or account.",
    );
    expect(acceptErrorCopy('camp', 'not_found')).toBe('That link is no longer valid — ask them to send you a new one.');
  });

  it('player: PATCH with a JSON body — the birth year never goes in a URL', () => {
    const r = acceptRequest('player', 'tok', 1984);
    expect(r.url).toBe('/api/v1/camp/consent');
    expect(r.init?.method).toBe('PATCH');
    expect(JSON.parse(String(r.init?.body))).toEqual({ token: 'tok', birthYear: 1984 });
    expect(JSON.parse(String(acceptRequest('player', 'tok').init?.body))).toEqual({ token: 'tok' });
  });

  it('player: every refusal the route can give has its own words, and none of them says "sign out"', () => {
    for (const code of Object.keys(PLAYER_ACCEPT_REFUSALS)) {
      const copy = acceptErrorCopy('player', code);
      expect(copy, code).not.toBe(acceptErrorCopy('player', 'not_found'));
      expect(copy.toLowerCase(), code).not.toContain('sign out');
    }
  });
});

describe('wiring, read from source', () => {
  const src = (p: string) => readFileSync(p, 'utf8');

  it('the "Ask a parent or guardian" screen POSTs WITHOUT a menteeId, so its requests are stored selfRequested', () => {
    const gate = src('app/play/mirror/_components/guardian-consent-gate.tsx');
    const post = gate.slice(gate.indexOf("fetch('/api/v1/camp/consent'"), gate.indexOf('const data = await res.json()'));
    expect(post).toContain("method: 'POST'");
    expect(post).not.toContain('menteeId');
    expect(gate).toContain('their own FEL account');
  });

  it('the page asks the rule module for its step — it does not re-derive who may confirm', () => {
    const page = src('app/consent/guardian/[token]/page.tsx');
    expect(page).toContain('playerAcceptStep(');
    expect(page).toContain('selfRequested: true');
    expect(page).not.toMatch(/getFullYear\(\)|dobYear\s*[<>]/);
  });

  it('the route decides with the same module, and never reads selfRequested from a request body', () => {
    const route = src('app/api/v1/camp/consent/route.ts');
    expect(route).toContain('decidePlayerAccept(');
    expect(route).not.toMatch(/body\.selfRequested|body\?\.selfRequested/);
    // the never-paywalled guard in tests/progression/b2b.test.ts still holds (it reads this same file)
    expect(route).not.toContain('requirePaidFacilitator');
  });
});

// MIRROR-COACH P6 FIX (2026-09-29, code review): both guardian screens say what the yes covers, from one list.
// test changed (owner decision 2026-10-06, "Match today"): this held the list to the Mirror, the pain check-in and the
// daily check-in — what canUse gated in P6. Since TEEN-WRITE-BLOCK a guardian's yes unlocks none of them (pain and
// daily check-ins save only for a verified 18+; the Mirror has no guardian gate). The owner chose to tell the guardian
// what it unlocks today — a camp plan going live — so the test now holds the list to the code that gates on it.
describe('what a guardian is told the yes covers — what it unlocks today, and nothing it no longer does', () => {
  it('the list names the camp plan going live, and that is what the camp route gates on the consent', async () => {
    const { GUARDIAN_CONSENT_COVERS, guardianConsentAsk } = await import('@/lib/consent/guardianGate');
    expect(GUARDIAN_CONSENT_COVERS.map((c) => c.unlocks)).toEqual(['camp_plan']);
    expect(guardianConsentAsk('Jordan')).toBe(
      "FEL is a training app. Before Jordan can start a camp plan their coach builds with them, we ask a parent or guardian to confirm that's OK.",
    );
    const plans = readFileSync('app/api/v1/camp/plans/route.ts', 'utf8');
    expect(plans).toMatch(/if \(needsGuardianConsent\(birthYear\) && !consent\) return bad\('guardian_consent_required', 412\);/);
  });

  it('it no longer asks a guardian to OK the Mirror, pain check-ins or the daily check-in', async () => {
    const { guardianConsentAsk } = await import('@/lib/consent/guardianGate');
    const ask = guardianConsentAsk('Jordan');
    expect(ask).not.toMatch(/Mirror|camera|pain|check-in|sleep|soreness|mood/i);
    for (const route of ['app/api/health/pain/route.ts', 'app/api/health/readiness/route.ts']) {
      expect(readFileSync(route, 'utf8'), route).toMatch(/if \(!\(await canWriteHealthData\(prisma, userId\)\)\) return refuseHealthWrite\(\);/);
    }
    expect(readFileSync('app/play/mirror/page.tsx', 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')).not.toMatch(/<GuardianConsentGate/);
  });

  it('a consent given under the old wording still reads accepted — nothing is invalidated or re-asked', async () => {
    const { guardianStatus, canUse } = await import('@/lib/consent/guardianGate');
    const old = [{ requestedAt: new Date('2026-09-30'), acceptedAt: new Date('2026-10-01'), revokedAt: null }];
    expect(guardianStatus(old)).toBe('accepted');
    expect(canUse('pain_checkin', { dobYear: 2012, consents: old }, new Date('2026-10-06'))).toBe(true);
    // the row stores no wording, and the camp plan's gate reads only acceptedAt / revokedAt — no date or text cut-off
    const plans = readFileSync('app/api/v1/camp/plans/route.ts', 'utf8');
    expect(plans).toContain("prisma.guardianConsent.findFirst({ where: { menteeId: plan.menteeId, acceptedAt: { not: null }, revokedAt: null }");
  });

  it('the player screen shows it (every step that introduces the request)', async () => {
    const { guardianConsentAsk } = await import('@/lib/consent/guardianGate');
    const esc = guardianConsentAsk('Jordan').replace(/'/g, '&#x27;');
    for (const step of ['sign_in', 'not_adult', 'declare_birth_year', 'confirm'] as const) expect(render(step), step).toContain(esc);
  });

  it('the camp screen reads the same list, and its accept call is still P5\'s GET', () => {
    const page = readFileSync('app/consent/guardian/[token]/page.tsx', 'utf8');
    expect(page).toContain('{guardianConsentAsk(menteeName)}');
    expect(page).not.toContain('log\n            how an exercise feels (a pain check-in), we ask');
    expect(page).toContain('<AcceptButton token={token} />');
    expect(acceptRequest('camp', 'x')).toEqual({ url: '/api/v1/camp/consent?token=x' });
  });
});
