// IRON-PARADISE-OUT (2026-10-03): the Train tab's Iron Paradise card is parked out of the page (the card
// definition stays in app/train/page.tsx, filtered by lib/unlisted-modes.ts). vitest does not collect app/**,
// so the page is rendered from here with its auth/db reads mocked, the way tests/mirror-no-save does it.

import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    coachClient: { findFirst: async () => null },
    coachingProgram: { count: async () => 0 },
  },
}));
// the shell is stood in for: this test reads the cards the page builds, not the chrome around them
vi.mock('@/components/shell/tab-page', () => ({
  TabPage: (p: { children?: React.ReactNode }) => createElement('div', null, p.children),
}));
vi.mock('@/components/shell/doors-row', () => ({ DoorsRow: () => null }));

describe('/train with Iron Paradise parked', () => {
  it('renders the Train shelf without the Iron Paradise card or any link to /play/training', async () => {
    const { default: TrainPage } = await import('@/app/train/page');
    const html = renderToStaticMarkup(await TrainPage());
    expect(html).toContain('The Mirror');
    expect(html).toContain('Your programming');
    expect(html).not.toContain('Iron Paradise');
    expect(html).not.toContain('/play/training');
  });
});
