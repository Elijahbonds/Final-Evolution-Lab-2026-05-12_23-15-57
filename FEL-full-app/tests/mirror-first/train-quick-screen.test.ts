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
// DAILY-DRILL (2026-10-24; test changed): /train now also draws today's drill, which reads the account's age on purpose
// (the drills page's youth gate and profile v2's opt-in gate decide what it may pick; tests/daily-drill tests those
// reads). It is stood in for here, so "reads no age" below still measures the Quick Screen card and nothing else.
vi.mock('@/lib/daily-drill/load', async (orig) => ({
  ...(await orig<typeof import('@/lib/daily-drill/load')>()),
  loadDailyDrill: async () => { h.reads.push('loadDailyDrill'); return null; },
}));

import TrainPage from '@/app/train/page';
import { SCREEN_HOME, isQuickScreenPath } from '@/lib/screen/routes';
import { FULL_SCREEN_HREF } from '@/lib/screen-easy/door';
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
  // SCREEN-EASY (2026-10-28; test changed, flagged): the card opens the FULL screen itself, no longer /screen's start card —
  // whose first button is the jump, which /train has as its own card. Still never a way past the screen's own steps: a
  // ?run= start asks the age question first (lib/screen/minor-lock.test.tsx, "from a ?run= link (no start card)"), and the
  // pain question after it. /screen stays the QR address.
  it('is on the shelf, opening the full screen at its own age step (?run=full; never past it)', async () => {
    const c = card(await render());
    expect(c).not.toBeNull();
    expect(c!.href).toBe(FULL_SCREEN_HREF);
    expect(c!.href).toBe('/play/mirror/assess?run=full');
    expect(isQuickScreenPath(c!.href.split('?')[0])).toBe(true);
    expect(c!.href).not.toBe(SCREEN_HOME);
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
