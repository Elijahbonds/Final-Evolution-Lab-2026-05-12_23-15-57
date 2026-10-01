// The consent promise's home: /account and /settings, the link in the consent bullet, and login ?next=.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HEALTH_DATA_CONSENT_COPY } from '@/lib/health/intake';
import { ACCOUNT_SETTINGS_PATH } from './paths';
import { ConsentBulletText } from '@/components/health/consent-bullet';
import { AccountDataPanel } from '@/components/account/account-settings';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('/account and /settings both resolve', () => {
  it('the account page is the settings home and sends a signed-out visitor to login with ?next', () => {
    const page = read('app/account/page.tsx');
    expect(page).toContain('AccountSettings');
    expect(page).toContain('login?next=');
    expect(page).toContain('ACCOUNT_SETTINGS_PATH');
    expect(page).not.toContain('notFound(');
  });

  it('/settings redirects to /account', () => {
    const page = read('app/settings/page.tsx');
    expect(page).toContain('redirect(ACCOUNT_SETTINGS_PATH)');
    expect(ACCOUNT_SETTINGS_PATH).toBe('/account');
    expect(page).not.toContain('notFound(');
  });
});

describe('the consent screen links account settings without changing the promise', () => {
  const bullet = HEALTH_DATA_CONSENT_COPY.bullets.find((b) => b.includes('account settings'));

  it('the sentence is still the export-or-erase promise', () => {
    expect(bullet).toBe('You can export or erase this data at any time from your account settings.');
  });

  it('that sentence links to /account', () => {
    const html = renderToStaticMarkup(createElement(ConsentBulletText, { text: bullet! }));
    expect(html).toContain('href="/account"');
    expect(html).toContain('You can export or erase this data at any time from your ');
    expect(html).toContain('account settings');
    expect(html).toContain('.');
  });

  it('both consent screens render the bullet through that link', () => {
    expect(read('app/play/mirror/_components/health-intake-gate.tsx')).toContain('<ConsentBulletText text={b} />');
    expect(read('components/coach/pain-checkin.tsx')).toContain('<ConsentBulletText text={b} />');
  });
});

describe('account settings offers download and a confirm step before erase', () => {
  it('shows Download my data and Erase my health data before anyone confirms', () => {
    const html = renderToStaticMarkup(createElement(AccountDataPanel, {
      email: 'ada@fel.test',
      confirming: false,
      erasing: false,
      onAskErase: () => {},
      onCancel: () => {},
      onConfirmErase: () => {},
    }));
    expect(html).toContain('Download my data');
    expect(html).toContain('href="/api/account/export"');
    expect(html).toContain('Erase my health data');
    expect(html).not.toContain('Yes, erase my health data');
    expect(html).toContain('ada@fel.test');
  });

  it('the confirm step names what is deleted before the erase runs', () => {
    const html = renderToStaticMarkup(createElement(AccountDataPanel, {
      email: 'ada@fel.test',
      confirming: true,
      erasing: false,
      onAskErase: () => {},
      onCancel: () => {},
      onConfirmErase: () => {},
    }));
    expect(html).toContain('Yes, erase my health data');
    expect(html).toContain('Cancel');
    expect(html).toContain('permanently deletes');
    expect(html).toContain('consent records stay');
    expect(html).not.toContain('>Erase my health data<');
  });
});

describe('login honors ?next for same-origin paths only', () => {
  it('the form and the login page both go through loginDestination', () => {
    const form = read('components/auth-form.tsx');
    expect(form).toContain('loginDestination(nextRaw, fallback)');
    expect(form).toContain("searchParams.get('next')");
    expect(form).toMatch(/mode === 'login' \? loginDestination/);
    const page = read('app/login/page.tsx');
    expect(page).toContain('loginDestination(raw, \'/\')');
  });

  it('the erase and export routes take the user id from the session and do not read a client id', () => {
    for (const file of ['app/api/account/export/route.ts', 'app/api/account/health-erase/route.ts']) {
      const src = read(file);
      expect(src, file).toContain('getServerSession(authOptions)');
      expect(src, file).not.toMatch(/searchParams|req\.json|body\.userId|request\.json/);
    }
    expect(read('app/api/account/health-erase/route.ts')).toContain('eraseHealthData(tx, userId)');
    expect(read('app/api/account/export/route.ts')).toContain('collectAccountExport(prisma, userId)');
  });
});
