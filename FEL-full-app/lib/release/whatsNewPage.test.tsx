// QG-05: /whats-new renders the generated notes (app/whats-new/page.tsx), signed out and signed in.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const session = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: () => session() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import WhatsNewPage from '@/app/whats-new/page';
import { publicReleases, type Release } from './notes';
import data from './releases.json';

describe('/whats-new', () => {
  it('shows every public note of the newest release, under its area, with the footer for a signed-out visitor', async () => {
    session.mockResolvedValue(null);
    const html = renderToStaticMarkup(await WhatsNewPage());
    const [latest] = publicReleases((data as { releases: Release[] }).releases);
    expect(html).toContain(latest.version);
    for (const a of latest.areas) {
      expect(html).toContain(a.area);
      for (const n of a.notes) expect(html).toContain(n.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'));
    }
    expect(html).toContain('href="/terms"');   // PublicLegalFooter
    expect(html).not.toContain('(team only)');
  });

  it('a signed-in visitor gets the notes without the public chrome', async () => {
    session.mockResolvedValue({ user: { id: 'u1' } });
    const html = renderToStaticMarkup(await WhatsNewPage());
    expect(html).toContain('data-whats-new');
    expect(html).not.toContain('href="/terms"');
  });
});
