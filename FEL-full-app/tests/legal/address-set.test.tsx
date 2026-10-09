import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUSINESS_MAILING_ADDRESS } from '@/lib/legal/business';
import { escapeHtml } from '@/lib/store-terms/render';

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/components/public-chrome', () => ({
  PublicTopBar: () => null,
  PublicLegalFooter: () => null,
}));
vi.mock('@/lib/legal/business', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/legal/business')>()),
  REAL_MAILING_ADDRESS: 'TEST ADDRESS LINE',
}));

import StoreTermsPage from '@/app/store-terms/page';
import TermsPage from '@/app/terms/page';
import PrivacyPage from '@/app/privacy/page';

async function render(page: unknown): Promise<string> {
  const jsx = await (page as () => Promise<React.ReactElement>)();
  return renderToStaticMarkup(jsx);
}

describe('mailing address set', () => {
  it('/terms shows it', async () => {
    expect(await render(TermsPage)).toContain('Mail: TEST ADDRESS LINE');
  });

  it('/privacy shows it twice', async () => {
    const html = await render(PrivacyPage);
    expect(html).toContain('Mail: TEST ADDRESS LINE');
    expect(html).toContain('write to Final Evolution LLC, TEST ADDRESS LINE.');
  });

  it('/store-terms keeps the section and fills both places', async () => {
    const html = await render(StoreTermsPage);
    expect(html).toContain('<section id="mailing-address">');
    expect(html.split('TEST ADDRESS LINE').length - 1).toBe(2);
  });

  for (const [name, page] of [
    ['/store-terms', StoreTermsPage],
    ['/terms', TermsPage],
    ['/privacy', PrivacyPage],
  ] as const) {
    it(`${name} has no placeholder, token or "pending"`, async () => {
      const html = await render(page);
      expect(html).not.toContain(BUSINESS_MAILING_ADDRESS);
      expect(html).not.toContain(escapeHtml(BUSINESS_MAILING_ADDRESS));
      expect(html).not.toContain('{BUSINESS_ADDRESS}');
      expect(html).not.toMatch(/pending/i);
    });
  }
});
