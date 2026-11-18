import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({
  pendingRows: [] as unknown[],
  coachLink: true,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'u1' } }) }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); } }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRawUnsafe: async () => h.pendingRows,
    coachClient: {
      findFirst: async (args: { where?: { clientId?: string; coachId?: string } }) => (
        args.where?.clientId && h.coachLink ? { coach: { name: 'Coach Dee' } } : null
      ),
    },
    coachingProgram: { count: async () => 0 },
  },
}));
vi.mock('@/lib/coach/todayCard', async (orig) => ({ ...(await orig<typeof import('@/lib/coach/todayCard')>()), todayCardFor: async () => null }));
vi.mock('@/lib/daily-drill/load', async (orig) => ({ ...(await orig<typeof import('@/lib/daily-drill/load')>()), loadDailyDrill: async () => null }));
vi.mock('@/lib/group-booking/server', async (orig) => ({ ...(await orig<typeof import('@/lib/group-booking/server')>()), groupBookingOpen: async () => false }));
vi.mock('@/components/shell/tab-page', () => ({ TabPage: (p: { children?: ReactNode }) => createElement('div', null, p.children) }));
vi.mock('@/components/shell/doors-row', () => ({ DoorsRow: () => null }));

import TrainPage from '@/app/train/page';
import { resetGroupsProbe } from '@/lib/groups/store';
import { resetSignatureProbe } from '@/lib/signature/store';
import { resetCombineProbe } from '@/lib/combine/store';

const renderTrain = async () => renderToStaticMarkup(await TrainPage());

describe('/train shelf readiness', () => {
  beforeEach(() => {
    resetGroupsProbe();
    resetSignatureProbe();
    resetCombineProbe();
    h.pendingRows = [];
    h.coachLink = true;
  });

  it('does not advertise SQL-backed products whose destination pages are still unavailable', async () => {
    const html = await renderTrain();
    expect(html).toContain('Your programming');
    expect(html).not.toContain('Signature programs');
    expect(html).not.toContain('Squads and teams');
    expect(html).not.toContain('Your combines');
  });

  it('restores the cards as soon as the same probes report ready', async () => {
    h.pendingRows = [{ ok: 1 }];
    const html = await renderTrain();
    expect(html).toContain('Signature programs');
    expect(html).toContain('Squads and teams');
    expect(html).toContain('Your combines');
  });
});
