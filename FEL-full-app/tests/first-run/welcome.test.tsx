// /welcome (ONB-02/03): signed-in only, teach for verified adults only, and each path's first win on the page.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({ session: null as null | { user: { id: string } }, dobYear: null as number | null }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: async () => ({ dobYear: h.dobYear }) } } }));

import WelcomePage from '@/app/welcome/page';
import { isSignedInOnly } from '@/lib/screen/config';

const ADULT = new Date().getFullYear() - 30;
const TEEN = new Date().getFullYear() - 16;
const render = async (path?: string) => renderToStaticMarkup(await WelcomePage({ searchParams: path ? { path } : {} }));

beforeEach(() => { h.session = { user: { id: 'u1' } }; h.dobYear = ADULT; });

describe('/welcome', () => {
  it('sends a signed-out visitor to sign in, and comes back to the same path', async () => {
    h.session = null;
    await expect(render('learn')).rejects.toThrow('REDIRECT /login?next=%2Fwelcome%3Fpath%3Dlearn');
    expect(isSignedInOnly('/welcome')).toBe(true);
  });

  it('train: the paced breathing, no camera', async () => {
    const html = await render('train');
    expect(html).toContain('data-first-win="train"');
    expect(html).toContain('data-breath-start');
    expect(html).toContain('Start · 39 seconds');
    expect(html).not.toMatch(/getUserMedia|<video/);
  });

  it('learn: the first Playbook card, and "Got it" waits for the feed\'s count', async () => {
    const html = await render('learn');
    expect(html).toContain('data-playbook-card="playbook.ch1-remember-1"');
    expect(html).toContain('The Body&#x27;s Control Panel');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-card-got-it/);
  });

  it('teach (verified adult): the invite, then the first-client steps and the sample combine', async () => {
    const html = await render('teach');
    expect(html).toContain('data-first-win="teach"');
    expect(html).toContain('data-invite-make');
    expect(html).toContain('data-coach-first-run');
    expect(html).toContain('data-sample-label');
  });

  it('teach (teen, or no birth year): shown train instead, and teach is held in the picker', async () => {
    for (const year of [TEEN, null]) {
      h.dobYear = year;
      const html = await render('teach');
      expect(html).toContain('data-first-win="train"');
      expect(html).not.toContain('data-coach-first-run');
      expect(html).toMatch(/data-path="teach" data-held="true"/);
    }
  });

  it('create: three steps and the door to the Closet; play: the door to the game; junk: play', async () => {
    expect(await render('create')).toMatch(/data-first-win="create"[\s\S]*href="\/closet"/);
    expect(await render('play')).toMatch(/data-first-win="play"[\s\S]*href="\/play\/dunk"/);
    expect(await render('nonsense')).toContain('data-first-win="play"');
    expect(await render('body')).toContain('data-first-win="train"');
  });
});
