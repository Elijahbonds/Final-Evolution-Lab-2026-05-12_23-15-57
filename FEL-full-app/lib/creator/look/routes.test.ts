// The routes that store and serve the Creator's look, DRIVEN against the spy DB (IMPROVE (2026-10-06), CREATOR-PLAN
// phase 1): the Closet stores a sanitised doc in AvatarLook.face.creator for a verified adult and nothing for anyone
// else; a save that leaves the doc out (the Athlete Creator's Finalize) keeps it; hero-body serves the build's colour
// overrides (research item 1).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as unknown, prisma: null as any }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('@/lib/creator/athleteAxes-server', () => ({ axesFor: async () => null }));

import { NextRequest } from 'next/server';
import { POST as closetPOST } from '@/app/api/v1/closet/route';
import { POST as athletePOST } from '@/app/api/v1/creator/athlete/route';
import { GET as heroBodyGET } from '@/app/api/v1/hero-body/route';
import { defaultFace } from '@/lib/closet/wearable-catalog';
import { toBuild } from '@/lib/creator/schema/saveBuild';
import { THIS_YEAR, argsOf, newSpyDb, seedUser, spyPrisma, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'creator-1';
let db: SpyDb;
const DOC = {
  v: 1,
  parts: [{ id: 'h1', shape: 'spike', bone: 'Head', colour: '#ffd700', scale: [0.5, 2, 0.5], evil: '<script>' }, { id: 'h2', shape: 'trademark', bone: 'Head', colour: '#fff' }],
  colours: { jersey: '#c00000', skin: '#000' },
  shape: { face: { faceLong: 0.6 } },
  name: 'Jane Real',
};

function as(dobYear: number | null, existingFace?: Record<string, unknown>) {
  db = newSpyDb();
  seedUser(db, UID, dobYear);
  if (existingFace) db.tables.avatarLook = [{ id: 'al1', userId: UID, face: existingFace, equipped: {}, jersey: { number: 0, name: '' } }];
  h.prisma = spyPrisma(db);
  h.session = { user: { id: UID } };
}
const post = async (fn: (r: NextRequest) => Promise<Response>, url: string, body: unknown) => {
  const res = await fn(new NextRequest(`http://fel.test${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() };
};
const storedFace = () => db.tables.avatarLook[0].face as Record<string, any>;

beforeEach(() => { h.session = null; });

describe('POST /api/v1/closet stores the Creator doc inside face', () => {
  it('a verified adult: the doc is sanitised on the way in (unknown fields, ids and colours dropped; no shape numbers without the opt-in)', async () => {
    as(1990);
    const r = await post(closetPOST, '/api/v1/closet', { face: { ...defaultFace(), creator: DOC }, equipped: {} });
    expect(r.status).toBe(200);
    expect(storedFace().creator).toEqual({
      v: 1,
      parts: [{ id: 'h1', shape: 'spike', bone: 'Head', pos: [0, 0, 0], rot: [0, 0, 0], scale: [0.5, 2, 0.5], colour: '#FFD700', finish: 'matte', mirror: false }],
      paint: [], colours: { jersey: '#C00000' }, shape: { face: {}, body: {} }, flags: { suit: false },
    });
    expect(JSON.stringify(storedFace())).not.toMatch(/Jane|script|trademark/);
  });
  it('…and keeps the shape numbers with the numbers opt-in', async () => {
    as(1990);
    await post(closetPOST, '/api/v1/closet', { face: { ...defaultFace(), creator: DOC }, equipped: {}, saveLookNumbers: true });
    expect(storedFace().creator.shape).toEqual({ face: { faceLong: 0.6 }, body: {} });
  });
  it('a minor: nothing of the doc lands, and a stored one is written over', async () => {
    as(THIS_YEAR - 15, { ...defaultFace(), creator: { v: 1, colours: { jersey: '#123456' } } });
    const r = await post(closetPOST, '/api/v1/closet', { face: { ...defaultFace(), creator: DOC }, equipped: {} });
    expect(r.status).toBe(200);
    expect(storedFace()).toEqual(defaultFace());
  });
  it('a save without the doc keeps the stored one; an explicit null clears it', async () => {
    as(1990, { ...defaultFace(), creator: { v: 1, colours: { jersey: '#123456' } }, creatorSlots: [{ label: 'alt', doc: { v: 1, flags: { suit: true } } }] });
    await post(closetPOST, '/api/v1/closet', { face: { ...defaultFace(), hairStyle: 'Afro' }, equipped: {} });
    expect(storedFace().hairStyle).toBe('Afro');
    expect(storedFace().creator.colours).toEqual({ jersey: '#123456' });
    // phase 4a: the stored v1 slot is upgraded to v2 on the next save (its base from the face it was stored beside)
    expect(storedFace().creatorSlots).toEqual([expect.objectContaining({ id: 's1', label: 'ALT', body: 'male', doc: expect.objectContaining({ flags: { suit: true } }) })]);
    await post(closetPOST, '/api/v1/closet', { face: { ...defaultFace(), creator: null, creatorSlots: null }, equipped: {} });
    expect('creator' in storedFace()).toBe(false);
    expect('creatorSlots' in storedFace()).toBe(false);
  });
  it('a doc smuggling a picture is refused before any write (the image rule still holds)', async () => {
    as(1990);
    const r = await post(closetPOST, '/api/v1/closet', { face: { ...defaultFace(), creator: { v: 1, parts: [{ id: 'a', shape: 'disc', bone: 'Head', colour: '#fff', texture: 'data:image/png;base64,AAA' }] } }, equipped: {} });
    expect(r.status).toBe(400);
    expect(db.tables.avatarLook ?? []).toEqual([]);
  });
});

describe('POST /api/v1/creator/athlete keeps the doc it knows nothing about', () => {
  it('an adult\'s Finalize carries the stored doc over instead of wiping it', async () => {
    as(1990, { ...defaultFace(), creator: { v: 1, colours: { shoes: '#00FF00' } } });
    const r = await post(athletePOST, '/api/v1/creator/athlete', { values: { appearance: { hairStyle: 'Locs' } }, plate: '' });
    expect(r.status).toBe(200);
    const face = argsOf(db, 'avatarLook.upsert')[0].update.face;
    expect(face.hairStyle).toBe('Locs');
    expect(face.creator.colours).toEqual({ shoes: '#00FF00' });
  });
  it('a minor\'s Finalize writes the catalog face (no doc)', async () => {
    as(THIS_YEAR - 15, { ...defaultFace(), creator: { v: 1, colours: { shoes: '#00FF00' } } });
    await post(athletePOST, '/api/v1/creator/athlete', { values: {}, plate: '' });
    expect(argsOf(db, 'avatarLook.upsert')[0].update.face).toEqual(defaultFace());
  });
});

describe('GET /api/v1/hero-body serves the build\'s colour picks (research item 1)', () => {
  it('only the rows moved off their default', async () => {
    as(1990);
    db.tables.athleteBuild = [{ id: 'ab1', userId: UID, build: { frame: { bodyType: 'female' }, palette: { ...toBuild({}).palette, paletteJersey: '#FF3366', paletteShoes: 'not-a-colour' } } }];
    const j = await (await heroBodyGET()).json();
    expect(j).toMatchObject({ body: 'kit-female', guest: false, palette: { jersey: '#FF3366' } });
    expect(Object.keys(j.palette)).toEqual(['jersey']);
  });
  it('null when nothing was picked, and for a guest', async () => {
    as(1990);
    db.tables.athleteBuild = [{ id: 'ab1', userId: UID, build: { frame: {}, palette: toBuild({}).palette } }];
    expect((await (await heroBodyGET()).json()).palette).toBeNull();
    h.session = null;
    expect((await (await heroBodyGET()).json())).toMatchObject({ guest: true, palette: null });
  });
});
