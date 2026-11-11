// BINJGB-SHELF-1 — the pages and the local-frame route, rendered for real with next-auth, prisma and next/navigation
// mocked (the flags are the real ones, driven by env). T-FLAG-SHELF-OFF, T-SHELF-U13-ROUTE (shelf AND a slug, gate before
// notFound), T-SHELF-AGE-UNKNOWN, T-TEEN-NO-LOCAL (server-omitted), T-FLAG-LOCAL-OFF, T-LOCAL-FLAG-OFF, T-NO-LOCAL-ROUTE,
// T-SHELF-EMPTY-ROW (page copy), T-SHELF-ZERO-TITLES.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { ROOT, read } from './helpers';

const h = vi.hoisted(() => ({
  session: { user: { id: 'u1' } } as { user: { id?: string } } | null,
  dob: 1990 as number | null,
  reads: 0,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));
vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: async () => { h.reads++; return { dobYear: h.dob }; } } },
}));
// next/dynamic(ssr:false) renders nothing on the server, so the picker's presence is pinned with a marker.
vi.mock('@/components/binjgb/local-player-lazy', () => ({
  LocalPlayerLazy: () => createElement('div', { 'data-test-picker': true }, 'PICKER'),
}));

import ShelfPage from '@/app/play/gb-shelf/page';
import TitlePage from '@/app/play/gb-shelf/[slug]/page';
import { GET as frameGet } from '@/app/play/gb-shelf/local-frame/route';
import { AGE_PROMPT_COPY, PICKER_COPY, SHELF_COPY } from '@/lib/binjgb/copy';

const ADULT = 1990, TEEN = 2010, U13 = 2018;

async function shelf(): Promise<string> {
  return renderToStaticMarkup(await (ShelfPage as unknown as () => Promise<ReactElement>)());
}
async function title(slug: string): Promise<string> {
  return renderToStaticMarkup(await (TitlePage as unknown as (p: { params: { slug: string } }) => Promise<ReactElement>)({ params: { slug } }));
}
function frameReq(nonce: string | null = 'AAAAAAAAAAAAAAAAAAAAAA==') {
  return new NextRequest('https://fel.example/play/gb-shelf/local-frame', { headers: nonce ? { 'x-nonce': nonce } : {} });
}

beforeEach(() => {
  h.session = { user: { id: 'u1' } };
  h.dob = ADULT;
  h.reads = 0;
  process.env.NEXTAUTH_URL = 'https://fel.example';
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  delete process.env.BINJGB_SHELF_ENABLED;
  delete process.env.BINJGB_LOCAL_FILE_ENABLED;
});
const on = (shelfOn: boolean, localOn: boolean) => {
  if (shelfOn) process.env.BINJGB_SHELF_ENABLED = '1'; else delete process.env.BINJGB_SHELF_ENABLED;
  if (localOn) process.env.BINJGB_LOCAL_FILE_ENABLED = '1'; else delete process.env.BINJGB_LOCAL_FILE_ENABLED;
};

describe('T-FLAG-SHELF-OFF: flag unset → every shelf route is a 404, before anything is read', () => {
  it('/play/gb-shelf, /play/gb-shelf/<slug> and the local frame', async () => {
    on(false, true);
    await expect(shelf()).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(title('anything')).rejects.toThrow('NEXT_NOT_FOUND');
    expect((await frameGet(frameReq())).status).toBe(404);
    expect(h.reads).toBe(0);
  });
});

describe('the shelf page (flag on)', () => {
  it('needs a session (redirect to login, like /play)', async () => {
    on(true, false);
    h.session = null;
    await expect(shelf()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('T-SHELF-U13-ROUTE: under-13 → 404 on /play/gb-shelf AND on any /play/gb-shelf/<slug> (the gate runs first)', async () => {
    on(true, true);
    h.dob = U13;
    await expect(shelf()).rejects.toThrow('NEXT_NOT_FOUND');
    h.reads = 0;
    await expect(title('some-slug')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.reads).toBe(1);   // the slug stub read the age before its own notFound()
  });

  it('T-SHELF-AGE-UNKNOWN: unknown age → the age prompt, not the shelf, the picker or a player (shelf and slug)', async () => {
    on(true, true);
    h.dob = null;
    for (const html of [await shelf(), await title('some-slug')]) {
      expect(html).toContain('data-gb-age-prompt');
      expect(html).toContain(AGE_PROMPT_COPY.message);
      expect(html).not.toContain('PICKER');
      expect(html).not.toContain(SHELF_COPY.empty);
    }
  });

  it('T-SHELF-EMPTY-ROW / T-SHELF-ZERO-TITLES: the page says "No games on the shelf." and lists nothing', async () => {
    on(true, false);
    const html = await shelf();
    expect(html).toContain(SHELF_COPY.title);
    expect(html).toContain(SHELF_COPY.empty);
    expect(html).toContain(SHELF_COPY.credits);
    expect(html).toContain('href="/credits"');
    expect(html).not.toMatch(/coming soon|placeholder/i);
    expect(html).not.toContain('href="/play/gb-shelf/');
  });

  it('T-TEEN-NO-LOCAL: teen + both flags → the shelf renders, the picker is not in the HTML (server-omitted, not CSS)', async () => {
    on(true, true);
    h.dob = TEEN;
    const html = await shelf();
    expect(html).toContain(SHELF_COPY.empty);
    expect(html).not.toContain('PICKER');
    expect(html).not.toContain(PICKER_COPY.button);
    expect(html).not.toContain('type="file"');
  });

  it('T-FLAG-LOCAL-OFF: adult, local flag off → no picker', async () => {
    on(true, false);
    expect(await shelf()).not.toContain('PICKER');
  });

  it('adult + both flags → the picker is rendered', async () => {
    on(true, true);
    expect(await shelf()).toContain('PICKER');
  });

  it('every slug is a 404 for an adult too: v1 has no titles', async () => {
    on(true, true);
    await expect(title('tobu')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('T-LOCAL-FLAG-OFF / L1: the local frame is served only to a verified adult with both flags on', () => {
  it('404 with either flag off, signed out, under-13, unknown age or a teen', async () => {
    const cases: [boolean, boolean, number | null, boolean][] = [
      [true, false, ADULT, true], [false, true, ADULT, true], [true, true, ADULT, false],
      [true, true, U13, true], [true, true, null, true], [true, true, TEEN, true],
    ];
    for (const [s, l, dob, signedIn] of cases) {
      on(s, l);
      h.dob = dob;
      h.session = signedIn ? { user: { id: 'u1' } } : null;
      expect((await frameGet(frameReq())).status, JSON.stringify([s, l, dob, signedIn])).toBe(404);
    }
  });

  it('404 without the middleware nonce, or without a configured site origin (never a request header)', async () => {
    on(true, true);
    expect((await frameGet(frameReq(null))).status).toBe(404);
    expect((await frameGet(frameReq('not a nonce <script>'))).status).toBe(404);
    delete process.env.NEXTAUTH_URL;
    expect((await frameGet(frameReq())).status).toBe(404);
  });

  it('adult + both flags → the sandbox document: a nonce-carrying vendor script, the configured origin, no game bytes', async () => {
    on(true, true);
    const res = await frameGet(frameReq());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('<script nonce="AAAAAAAAAAAAAAAAAAAAAA==" src="/vendor/binjgb/binjgb.js"></script>');
    expect(html).toContain('"appOrigin":"https://fel.example"');
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|localStorage|indexedDB/);
  });
});

describe('T-NO-LOCAL-ROUTE (OQ-6)', () => {
  it('there is no /play/gb-local route or folder', () => {
    expect(existsSync(join(ROOT, 'app/play/gb-local'))).toBe(false);
  });
});

describe('/play renders the quiet row only through the server gate', () => {
  it('app/play/page.tsx asks homebrewRowFor and passes the answer to HomebrewShelfRow, after the PlayShelf', () => {
    const src = read('app/play/page.tsx');
    expect(src).toMatch(/const homebrewRow = await homebrewRowFor\(me\);/);
    expect(src).toMatch(/<PlayShelf \/>\s*\n\s*<HomebrewShelfRow show=\{homebrewRow\} \/>/);
  });
});
