// CREATE HUB phase 4: the public blocks read only approved, public cards by adult creators (teen work never shows).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({ calls: [] as any[], rows: [] as any[] }));
vi.mock('@/lib/db', () => ({
  prisma: {
    creativeCard: { findMany: async (args: any) => { h.calls.push(args); return h.rows; } },
    gameSession: { findMany: async () => [{ id: 'gs1', mode: 'dunk', score: 900, won: true }] },
    signatureAttempt: { findMany: async () => [] },
  },
}));
import { SignatureMoves } from './signature-moves';
import { CommunityReads } from './community-reads';
import { publicCardWhere } from '@/lib/creator/creative-card-review';

beforeEach(() => { h.calls = []; h.rows = []; });

describe('public creative blocks', () => {
  it('Signature moves asks for this owner\'s approved public sport cards by an adult, and shows the run', async () => {
    h.rows = [{ id: 'c1', title: 'Mine', art: { kind: 'sport', signatureMoveId: 'Windmill', routineId: 'gs1' }, createdAt: new Date() }];
    const html = renderToStaticMarkup((await SignatureMoves({ ownerId: 'u1' }))!);
    expect(h.calls[0].where).toEqual({ ownerId: 'u1', primary: 'sport', ...publicCardWhere() });
    expect(h.calls[0].where.owner.dobYear.lte).toBeLessThanOrEqual(new Date().getFullYear() - 19);
    expect(html).toContain('Signature moves'); expect(html).toContain('Windmill'); expect(html).toContain('Dunk · 900 pts · won');
  });
  it('Community reads asks for approved public writing by adults, and credits the creator', async () => {
    h.rows = [{ id: 'w1', title: 'Dawn', art: { kind: 'writing', text: 'The court at dawn.' }, createdAt: new Date(), owner: { name: 'Ari', creatorCards: [{ slug: 'ari', published: true }] } }];
    const html = renderToStaticMarkup((await CommunityReads())!);
    expect(h.calls[0].where).toEqual({ primary: 'writing', ...publicCardWhere() });
    expect(html).toContain('Community reads'); expect(html).toContain('The court at dawn.'); expect(html).toContain('href="/card/ari"');
  });
  it('nothing to show renders nothing', async () => {
    expect(await SignatureMoves({ ownerId: 'u1' })).toBeNull();
    expect(await CommunityReads()).toBeNull();
  });
});
