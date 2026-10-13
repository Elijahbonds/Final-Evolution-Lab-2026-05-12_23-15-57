import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUSINESS_CONTACT_EMAIL } from '@/lib/legal/business';
import { escapeHtml } from '@/lib/store-terms/render';

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/components/public-chrome', () => ({
  PublicTopBar: () => null,
  PublicLegalFooter: () => null,
}));

import StoreTermsPage from '@/app/store-terms/page';
import TermsPage from '@/app/terms/page';
import PrivacyPage from '@/app/privacy/page';

async function render(page: unknown): Promise<string> {
  const jsx = await (page as () => Promise<React.ReactElement>)();
  return renderToStaticMarkup(jsx);
}

describe('no mailing address set', () => {
  const pages: Array<[string, unknown]> = [
    ['/store-terms', StoreTermsPage],
    ['/terms', TermsPage],
    ['/privacy', PrivacyPage],
  ];

  for (const [name, page] of pages) {
    it(`${name} shows no address line, placeholder or token`, async () => {
      const html = await render(page);
      expect(html).not.toContain('[Business mailing address');
      expect(html).not.toContain(escapeHtml('[Business mailing address'));
      expect(html).not.toContain('{BUSINESS_ADDRESS}');
      expect(html).not.toMatch(/pending/i);
      expect(html).not.toMatch(/Mail:/);
      expect(html).not.toContain('write to Final Evolution LLC');
      expect(html).not.toContain('by mail to');
      expect(html).toContain(BUSINESS_CONTACT_EMAIL);
    });

    // LEGAL-COPY-2: no placeholder bracket in what a reader sees. Tags are stripped first, because Tailwind class
    // names such as bg-[#050505] carry a '[' that is not visible text.
    it(`${name} visible text has no '[' and no token`, async () => {
      const visible = (await render(page)).replace(/<[^>]*>/g, '');
      expect(visible).not.toContain('[');
      expect(visible).not.toContain('{BUSINESS_ADDRESS}');
    });
  }

  it('/privacy reads cleanly after the dropped clause', async () => {
    const html = await render(PrivacyPage);
    expect(html).toContain('from the email address on your account. We may ask you to confirm it is you');
    expect(html).toContain('Final Evolution LLC');
    expect(html).toContain('Policy version: 2026-10-13b');
  });

  it('/terms keeps its Contact section and version', async () => {
    const html = await render(TermsPage);
    expect(html).toContain('Final Evolution LLC');
    expect(html).toContain('Policy version: 2026-10-13b');
  });

  it('/store-terms drops only the mailing-address section', async () => {
    const html = await render(StoreTermsPage);
    expect(html).not.toContain('<section id="mailing-address">');
    expect(html).toContain('<section id="contact">');
    expect(html).toContain('Store terms version: store-terms-2026-10-12');
  });
});
