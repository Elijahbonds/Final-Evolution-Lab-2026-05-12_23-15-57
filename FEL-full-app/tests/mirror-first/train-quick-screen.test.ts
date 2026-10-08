// MIRROR-FIRST P1 (2026-10-07): /train has a Quick Screen card. The no-sign-in screen (/screen → /play/mirror/assess) was
// linked from nowhere in the app. The card opens its FRONT DOOR, so its own age question and grown-up step come first for
// every visitor — the same card for a teen's account and an adult's (the page reads no age, and passes none on).
// app/ is outside the vitest include, so /train is rendered from here (lib/train-page-unlisted.test.tsx's way).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({ reads: [] as string[], userId: 'u-adult' }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: h.userId } }) }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); } }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
// every table the page reads is recorded: it must never read the user's age to decide this card
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, table: string) => (table === 'then' ? undefined : new Proxy({}, {
      get: (_u, op: string) => async () => {
        h.reads.push(`${table}.${op}`);
        return op === 'count' ? 0 : null;
      },
    })),
  }),
}));
vi.mock('@/components/shell/tab-page', () => ({
  TabPage: (p: { children?: ReactNode }) => createElement('div', null, p.children),
}));
vi.mock('@/components/shell/doors-row', () => ({ DoorsRow: () => null }));

import TrainPage from '@/app/train/page';
import { SCREEN_HOME, isQuickScreenPath } from '@/lib/screen/routes';
import { screenText } from '@/lib/share/screen';

beforeEach(() => { h.reads = []; });
const render = async () => renderToStaticMarkup(await TrainPage());
const card = (html: string) => {
  const at = html.indexOf('Quick Screen');
  if (at < 0) return null;
  const open = html.lastIndexOf('<a ', at);
  return { href: /href="([^"]+)"/.exec(html.slice(open))?.[1] ?? '', line: /Quick Screen\s*<\/span>\s*<span[^>]*>([^<]*)<\/span>/.exec(html)?.[1] ?? '' };
};

describe('/train, the Quick Screen card', () => {
  it('is on the shelf, linking the screen\'s front door (/screen), never a deep link past its age step', async () => {
    const c = card(await render());
    expect(c).not.toBeNull();
    expect(c!.href).toBe(SCREEN_HOME);
    expect(c!.href).toBe('/screen');
    expect(isQuickScreenPath(c!.href)).toBe(true);
    expect(c!.href).not.toMatch(/assess|\?run=/);
  });

  it('says it sends nothing, and names no condition, treatment or guarantee', async () => {
    const c = card(await render())!;
    expect(c.line).toMatch(/Nothing is sent/);
    expect(c.line).not.toMatch(/\bsav(e|ed)\b|medical|diagnos/i);
    expect(screenText(c.line)).toEqual([]);
  });

  it('a minor\'s account gets the same card, and the page reads no age to give it (the screen asks its own)', async () => {
    h.userId = 'u-adult';
    const adult = card(await render());
    const adultReads = [...h.reads];
    h.reads = [];
    h.userId = 'u-minor-2012';
    const minor = card(await render());
    expect(minor).toEqual(adult);
    expect(h.reads).toEqual(adultReads);
    expect(h.reads.some((r) => r.startsWith('user.'))).toBe(false);
  });

  it('the Mirror card is still first, and the shelf keeps its other doors', async () => {
    const html = await render();
    expect(html.indexOf('The Mirror')).toBeGreaterThan(-1);
    expect(html.indexOf('The Mirror')).toBeLessThan(html.indexOf('Quick Screen'));
    expect(html).toContain('Your programming');
  });
});
