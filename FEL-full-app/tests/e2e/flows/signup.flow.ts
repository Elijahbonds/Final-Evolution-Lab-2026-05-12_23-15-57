// KEY FLOW 1 — sign up. A new visitor answers the age question, makes an account and lands in the game they came for.
//
// What it holds (each one a thing that has broken or been decided before):
//   * the credential fields do not exist until the birth year is locked (AGE-SCREEN: the year is asked first);
//   * the sign-up button (BEGIN EVOLUTION) stays disabled until the terms box is ticked;
//   * POST /api/signup carries the email, the CURRENT policy version, the birth year and the full birth date;
//   * the real next-auth client then signs in (CSRF token included) and the page makes a FULL navigation to the
//     onboarding destination (LOGIN-LOOP-FIX: never a client-side replace), not back to /login.
import { CURRENT_POLICY_VERSION } from '../../../lib/policies';
import { DEFAULT_FIRST_GAME, destinationFor, resolveFirstGame } from '../../../lib/onboarding/firstRun';
import { assert, until } from '../../../scripts/e2e/rig';
import type { Flow } from '../../../scripts/e2e/flow';
import { FakeAuth } from '../fakes/auth';

export const signupFlow: Flow = {
  name: 'signup',
  title: 'A new visitor answers the age question, creates an account and lands in their first game',
  async run(ctx) {
    const auth = new FakeAuth();
    const s = ctx.session({
      pages: { '/signup': { entry: 'tests/e2e/entries/signup.tsx' } },
      api: (req) => {
        const a = auth.handle(req);
        if (a) return a;
        if (req.path === '/api/signup' && req.method === 'POST') {
          const b = req.body as { email?: string; password?: string; name?: string };
          if (!b?.email || !b.password || b.password.length < 6) return { status: 400, json: { error: 'Email and a 6+ character password are required' } };
          if (auth.users.has(b.email)) return { status: 409, json: { error: 'An account with that email already exists' } };
          auth.add({ id: 'u-new', email: b.email, password: b.password, name: b.name ?? '' });
          return { json: { ok: true } };
        }
        return undefined;
      },
    });
    const page = await s.open('/signup');
    await page.getByText('Select year').first().waitFor({ state: 'attached', timeout: 20_000 });
    assert(await page.locator('input[type="email"]').count() === 0, 'the email field rendered before the birth year was locked (AGE-SCREEN)');
    await ctx.shot(page, '1-age-step');

    await page.locator('select').first().selectOption('1995');
    await page.getByLabel('Month').fill('6');
    await page.getByLabel('Day').fill('15');
    await page.getByRole('button', { name: /continue/i }).first().click();

    const email = page.locator('input[type="email"]');
    await email.waitFor({ timeout: 10_000 });
    await page.getByPlaceholder('Athlete name').fill('Rig Tester');
    await email.fill('rig.tester@example.com');
    await page.locator('input[type="password"]').fill('correct-horse-9');
    const create = page.locator('form button[type="submit"]');
    assert((await create.innerText()).trim() === 'BEGIN EVOLUTION', `the sign-up button reads ${JSON.stringify(await create.innerText())}`);
    assert(await create.isDisabled(), 'the sign-up button was enabled before the terms box was ticked');
    await page.locator('label:has-text("I agree to the") > span').first().click();
    assert(await create.isEnabled(), 'the sign-up button stayed disabled after the terms box was ticked');
    await ctx.shot(page, '2-filled');
    await create.click();

    const sent = await until('POST /api/signup', () => s.called('/api/signup', 'POST')[0]);
    const body = sent.body as Record<string, unknown>;
    assert(body.email === 'rig.tester@example.com', `signup sent email ${JSON.stringify(body.email)}`);
    assert(body.policyVersion === CURRENT_POLICY_VERSION, `signup sent policyVersion ${JSON.stringify(body.policyVersion)}, current is ${CURRENT_POLICY_VERSION}`);
    assert(body.birthYear === 1995, `signup sent birthYear ${JSON.stringify(body.birthYear)}`);
    assert(body.birthDate === '1995-06-15', `signup sent birthDate ${JSON.stringify(body.birthDate)}`);
    await until('the credentials sign-in', () => s.called('/api/auth/callback/credentials', 'POST')[0]);

    const want = destinationFor('play', resolveFirstGame({ chosen: DEFAULT_FIRST_GAME }));
    const landed = await page.waitForSelector('[data-rig-landed]', { timeout: 15_000 }).then((h) => h.getAttribute('data-rig-landed'));
    assert(landed === want, `after sign-up the page went to ${landed}, expected the first game ${want}`);
    assert(auth.signedIn?.email === 'rig.tester@example.com', 'the account was not signed in');
    ctx.log(`signed up, signed in, landed on ${landed}`);
  },
};
