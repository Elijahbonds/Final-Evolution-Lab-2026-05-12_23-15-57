// DAILY-DRILL — the card on Train, rendered: the drill, why it was picked, what finishing pays, the nudge with no number,
// the done state, the paused state; and its place on /train (above the coach's Today card, for every account).
import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'u1' } }) }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); } }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, { get: (_t, table: string) => (table === 'then' ? undefined : new Proxy({}, { get: () => async () => null })) }),
}));
vi.mock('@/components/shell/tab-page', () => ({ TabPage: (p: { children?: ReactNode }) => createElement('div', null, p.children) }));
vi.mock('@/components/shell/doors-row', () => ({ DoorsRow: () => null }));
vi.mock('@/lib/coach/todayCard', async (orig) => ({ ...(await orig<typeof import('@/lib/coach/todayCard')>()), todayCardFor: async () => null }));
vi.mock('@/lib/daily-drill/load', async (orig) => ({ ...(await orig<typeof import('@/lib/daily-drill/load')>()), loadDailyDrill: async () => h.view }));

import TrainPage from '@/app/train/page';
import { DailyDrillCard } from '@/components/daily-drill/daily-drill-card';
import { viewFrom } from '@/lib/daily-drill/load';
import { NOW, OPEN, STOPPED, YOUTH, hooper, newAdult, teen } from '@/tests/helpers/dailyDrillRows';

const html = (v: unknown) => renderToStaticMarkup(createElement(DailyDrillCard, { view: v as never }));
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');

describe('the daily drill card', () => {
  it('a hooper: the drill, its minutes, why (the number), the reward, the start link', () => {
    const out = decode(html(viewFrom('u1', hooper(), OPEN, NOW)));
    expect(out).toContain('data-daily-drill="open"');
    expect(out).toContain("Today's drill · 6 min");
    // test changed: drill redesign (TODAY-DRILL 2026-10-27) — the card says the plain name and why today in plain words
    expect(out).toContain('Soft landings');
    expect(out).toContain("Your shooting is your lowest number right now (40% of 30 shots made), so today's drill works on soft, balanced landings.");
    expect(out).toContain('Trains quiet, balanced landings');
    expect(out).not.toContain('data-daily-explainer');
    expect(out).toContain('Finish it for 10 Lab Credits, and day 4 of your streak.');
    expect(out).toContain('href="/train/today-drill"');
    expect(out).not.toContain('data-daily-nudge');
  });

  it('no number yet: the Wake-Up and the nudge to measure', () => {
    const out = decode(html(viewFrom('u1', newAdult(), OPEN, NOW)));
    // test changed: drill redesign — the plain name, and a first-timer's one-line explainer
    expect(out).toContain('Full-body wake-up');
    expect(out).toContain('data-daily-explainer');
    expect(out).toContain('data-daily-nudge');
    expect(out).toContain('href="/account"');
  });

  it('a teen: the same card, the all-round drill, an honest nudge; no name, no number, nothing to share', () => {
    const out = decode(html(viewFrom('u1', teen(), YOUTH, NOW)));
    expect(out).toContain('Under 18, your numbers stay on your phone');
    expect(out).not.toMatch(/share/i);
  });

  it('done: the paid line, no start link', () => {
    const out = decode(html(viewFrom('u1', { ...hooper(), claim: { delta: BigInt(30), metadata: { streakDays: 4 } } }, OPEN, NOW)));
    expect(out).toContain('data-daily-drill="done"');
    expect(out).toContain('+30 Lab Credits. Streak: 4 days. A new drill tomorrow.');
    expect(out).not.toContain('data-daily-start');
  });

  it('a standing red flag: the pause line and no drill', () => {
    const out = decode(html(viewFrom('u1', hooper(), STOPPED, NOW)));
    expect(out).toContain('data-daily-drill="stopped"');
    expect(out).not.toContain('/train/today-drill');
  });

  it('a failed read: nothing', () => {
    expect(html(null)).toBe('');
  });

  it('on /train: rendered for every account, above the shelf', async () => {
    h.view = viewFrom('u1', hooper(), OPEN, NOW);
    const out = renderToStaticMarkup(await TrainPage());
    expect(out).toContain('data-testid="daily-drill-card"');
    expect(out.indexOf('daily-drill-card')).toBeLessThan(out.indexOf('/play/mirror'));
    h.view = null;
    expect(renderToStaticMarkup(await TrainPage())).not.toContain('daily-drill-card');
  });
});
