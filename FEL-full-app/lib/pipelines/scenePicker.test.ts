// PIPELINES (owner, 2026-10-06): the Spot the Scene pack picker — FEL first, approved community packs credited with
// play counts — and the scene-packs route that feeds it (approved, public, adult, no private upload, credited).
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ rows: [] as any[], where: null as any }));
vi.mock('@/lib/db', () => ({ prisma: { creativeCard: { findMany: async (a: any) => { h.where = a.where; return h.rows; } } } }));

import { cycleChoice, fetchScenePacks, noteScenePackStart, packLabel, packPickLine, sceneChoices, type CommunityScenePack } from './scenePicker';
import { GET as scenePacksGET } from '@/app/api/v1/scene-packs/route';

const q = [{ id: 'q1', prompt: 'p', difficulty: 1 as const, options: [{ id: 'o0', label: 'a' }], answer: 'o0' }];
const FEL = { id: 'fel', title: 'Scene Vault', questions: q };
const cp = (id: string, over: Partial<CommunityScenePack> = {}): CommunityScenePack => ({ id: `card_${id}`, cardId: id, title: `Pack ${id}`, questions: q, creator: { name: 'ADA', href: '/card/ada' }, plays: 3, ...over });

describe('the choices', () => {
  it('FEL first, then each community pack once, credited, with plays', () => {
    const c = sceneChoices(FEL, [cp('a'), cp('b', { plays: 1 }), cp('a'), cp('e', { questions: [] })]);
    expect(c.map((x) => x.pack.id)).toEqual(['fel', 'card_a', 'card_b']);
    expect(c[0]).toMatchObject({ cardId: null, by: null });
    expect(packLabel(c[1])).toBe('Pack a · by ADA');
    expect(packPickLine(c[1], 1, 3)).toBe('PACK ▲▼ 2/3: Pack a · by ADA · 3 plays');
    expect(packPickLine(c[2], 2, 3)).toMatch(/1 play$/);
    expect(packPickLine(c[0], 0, 1)).toBe('Scene Vault');
  });
  it('a ?pack= link loads that community pack first, still credited', () => {
    const c = sceneChoices({ id: 'card_b', title: 'Pack b', questions: q }, [cp('a'), cp('b')]);
    expect(c.map((x) => x.pack.id)).toEqual(['card_b', 'card_a']);
    expect(c[0].by).toBe('ADA');
  });
  it('cycles both ways, and only a community pack counts a play', () => {
    expect(cycleChoice(0, -1, 3)).toBe(2);
    expect(cycleChoice(2, 1, 3)).toBe(0);
    const seen: string[] = [];
    const c = sceneChoices(FEL, [cp('a')]);
    noteScenePackStart(c[0], (id) => seen.push(id));
    noteScenePackStart(c[1], (id) => seen.push(id));
    expect(seen).toEqual(['a']);
  });
  it('a failed fetch is no community packs', async () => {
    expect(await fetchScenePacks(async () => { throw new Error('x'); })).toEqual([]);
    expect(await fetchScenePacks(async () => ({ ok: true, json: async () => ({ packs: [cp('a'), { nope: 1 }] }) }))).toHaveLength(1);
  });
});

describe('GET /api/v1/scene-packs', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'c1', title: 'Venice quiz', primary: 'scene', reviewState: 'approved', isPublic: true, ownerId: 'u1', createdAt: new Date(), stats: { plays: 4 },
    art: { kind: 'scene', venueId: 'venice', cameraPath: 'x', questions: [{ prompt: 'p', options: ['a', 'b', 'c', 'd'], answer: 1 }] },
    owner: { name: 'Ada', dobYear: 1990, creatorCards: [{ slug: 'ada', displayName: 'ADA' }] }, ...over,
  });
  it('queries approved, public, adult cards and credits each pack with its plays', async () => {
    h.rows = [row()];
    const body = await (await scenePacksGET(new NextRequest('http://localhost/api/v1/scene-packs'))).json();
    expect(h.where).toMatchObject({ primary: 'scene', isPublic: true, reviewState: 'approved' });
    expect(body.packs[0]).toMatchObject({ cardId: 'c1', ownerId: 'u1', creator: { name: 'ADA', href: '/card/ada' }, plays: 4, title: 'Venice quiz' });
  });
  it('holds the line on what the query returned: a teen\'s, a private, or a pending card never becomes a pack', async () => {
    h.rows = [row({ id: 't', owner: { name: 'Kid', dobYear: 2012 } }), row({ id: 'p', isPublic: false }), row({ id: 'r', reviewState: 'pending_review' }), row({ id: 'ok' })];
    const body = await (await scenePacksGET(new NextRequest('http://localhost/api/v1/scene-packs'))).json();
    expect(body.packs.map((p: { cardId: string }) => p.cardId)).toEqual(['ok']);
  });
});
