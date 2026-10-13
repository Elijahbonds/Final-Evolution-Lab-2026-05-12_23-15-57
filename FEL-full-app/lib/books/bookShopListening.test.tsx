// Owner 2026-10-13: paid buyers keep listening when the shop is switched off. /press/library (the Listen page) must show
// owned books with BOOK_STORE_ENABLED / VIRTUAL_PURCHASES_ENABLED off, and neither listening door may read the switches.
// Selling stays behind them (bookCheckoutRoute.test.ts: "book checkout: the switch").
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: { user: { id: 'buyer-1', email: 'buyer@fel.test' } } as { user: { id?: string; email?: string } } | null,
  isAdult: true,
  rows: [{ bookSlug: 'blueprint', format: 'audiobook', status: 'ACTIVE' }] as { bookSlug: string; format: string; status: string }[],
  tablesReady: true,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/coach-store/adult', () => ({ isVerifiedAdult: async () => h.isAdult }));
vi.mock('@/components/press/press-frame', () => ({ PressFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/press/audio-player', () => ({
  AudioPlayer: ({ bookSlug, chapters }: { bookSlug: string; chapters: { canPlay: boolean }[] }) => (
    <div data-player={bookSlug} data-playable={chapters.filter((c) => c.canPlay).length} />
  ),
}));
vi.mock('@/lib/books/bookStore', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/books/bookStore')>();
  return {
    ...actual,
    prismaBookStore: () => ({
      claimByEmail: async () => 0,
      listActive: async () => {
        if (!h.tablesReady) throw new actual.BookTablesNotReady();
        return h.rows;
      },
    }),
  };
});

import LibraryPage from '@/app/press/library/page';

const KEYS = ['BOOK_STORE_ENABLED', 'VIRTUAL_PURCHASES_ENABLED'] as const;
const SAVED: Record<string, string | undefined> = {};
const render = async () => renderToStaticMarkup(await LibraryPage());

beforeEach(() => {
  for (const k of KEYS) { SAVED[k] = process.env[k]; delete process.env[k]; }   // the shop is OFF
  h.session = { user: { id: 'buyer-1', email: 'buyer@fel.test' } };
  h.isAdult = true;
  h.rows = [{ bookSlug: 'blueprint', format: 'audiobook', status: 'ACTIVE' }];
  h.tablesReady = true;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const k of KEYS) { if (SAVED[k] === undefined) delete process.env[k]; else process.env[k] = SAVED[k]; }
  vi.restoreAllMocks();
});

describe('/press/library with the shop switched off', () => {
  it('shows the owned audiobook and a player a buyer can play', async () => {
    const html = await render();
    expect(html).toContain('data-player="blueprint"');
    expect(html).not.toContain('data-playable="0"');
    expect(html).not.toContain('unavailable right now');
  });

  it('the same with both switches on (nothing depends on them)', async () => {
    process.env.BOOK_STORE_ENABLED = '1';
    process.env.VIRTUAL_PURCHASES_ENABLED = '1';
    expect(await render()).toContain('data-player="blueprint"');
  });

  it('an under-18 / unknown-age user is still asked to confirm their birth year, no player', async () => {
    h.isAdult = false;
    const html = await render();
    expect(html).toContain('confirm your birth year');
    expect(html).not.toContain('data-player');
  });

  it('a user who owns nothing sees no player', async () => {
    h.rows = [];
    const html = await render();
    expect(html).toContain('No audiobooks on this account yet.');
    expect(html).not.toContain('data-player');
  });

  it('a signed-out visitor is asked to log in, no player', async () => {
    h.session = null;
    const html = await render();
    expect(html).toContain('Log in to listen');
    expect(html).not.toContain('data-player');
  });

  it('book tables missing -> the library-unavailable line (fail closed), no player', async () => {
    h.tablesReady = false;
    const html = await render();
    expect(html).toContain('The library is unavailable right now.');
    expect(html).not.toContain('data-player');
  });
});

describe('the listening doors never read the shop switches', () => {
  const ROOT = join(__dirname, '..', '..');
  it.each(['app/api/books/stream/route.ts', 'app/press/library/page.tsx'])('%s', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    expect(src).not.toMatch(/bookShop'|bookShopClosedReason|bookStoreEnabled|virtualPurchasesOn|storeClosed/);
  });
});
