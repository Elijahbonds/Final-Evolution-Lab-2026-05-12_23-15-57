// The routes that store, serve and switch SLOTS, driven against the spy DB (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a):
// the Closet stores whole characters with ownership-filtered worn items and the active one materialised; GET trims to the
// active slot for a spawn and to summaries for the switcher; "Play as" moves only the pointer; hero-body plays the active
// slot's body, 'scan' only for an account that owns one; the Athlete Creator edits the active character.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as unknown, prisma: null as any }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('@/lib/creator/athleteAxes-server', () => ({ axesFor: async () => null }));

import { NextRequest } from 'next/server';
import { GET as closetGET, POST as closetPOST } from '@/app/api/v1/closet/route';
import { POST as activePOST } from '@/app/api/v1/closet/active/route';
import { POST as athletePOST } from '@/app/api/v1/creator/athlete/route';
import { GET as heroBodyGET } from '@/app/api/v1/hero-body/route';
import { defaultFace } from '@/lib/closet/wearable-catalog';
import { emptyCreatorDoc, type CreatorSlotV2 } from '@/lib/creator/look/doc';
import { THIS_YEAR, argsOf, newSpyDb, seedUser, spyPrisma, writesOf, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'slots-1';
let db: SpyDb;
const slot = (id: string, over: Partial<CreatorSlotV2> = {}): CreatorSlotV2 => ({
  id, label: id.toUpperCase(), body: 'male', base: { skinTone: '#8D5524' }, doc: { ...emptyCreatorDoc(), colours: { jersey: '#FF0000' } }, ...over,
});
function as(dobYear: number | null, existingFace?: Record<string, unknown>, owned: string[] = [], email = `${UID}@fel.test`) {
  db = newSpyDb();
  seedUser(db, UID, dobYear);
  if (existingFace) db.tables.avatarLook = [{ id: 'al1', userId: UID, face: existingFace, equipped: { tops: 'top_lab' }, jersey: { number: 0, name: '' } }];
  db.tables.ownedWearable = owned.map((itemId, i) => ({ id: `o${i}`, userId: UID, itemId }));
  h.prisma = spyPrisma(db);
  h.session = { user: { id: UID, email } };
}
const req = (url: string, body?: unknown) => new NextRequest(`http://fel.test${url}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const stored = () => db.tables.avatarLook[0] as Record<string, any>;

beforeEach(() => { h.session = null; });
afterEach(() => { delete process.env.FEL_SCAN_OWNER_EMAILS; });

describe('POST /api/v1/closet with slots', () => {
  it('stores whole characters; a slot cannot wear an item the account does not own; the active one is the top level and the account\'s worn set', async () => {
    as(1990, undefined, ['band_flow']);
    const face = { ...defaultFace(), creatorSlots: [slot('s1'), slot('s2', { base: { skinTone: '#22CC44' }, equipped: { headwear: 'band_flow', accessory: 'acc_sleeve', tops: 'top_lab' } })], activeSlot: 's2' };
    const r = await closetPOST(req('/api/v1/closet', { face, equipped: { accessory: 'acc_sleeve' } }));
    expect(r.status).toBe(200);
    const f = stored().face;
    expect(f.activeSlot).toBe('s2');
    expect(f.skinTone).toBe('#22CC44');
    expect(f.creatorSlots[1].equipped).toEqual({ headwear: 'band_flow', accessory: null, tops: 'top_lab' });
    expect(stored().equipped).toMatchObject({ headwear: 'band_flow', accessory: null, tops: 'top_lab' });
  });
  it('a minor stores no slot (the look stays on the device)', async () => {
    as(THIS_YEAR - 15);
    await closetPOST(req('/api/v1/closet', { face: { ...defaultFace(), creatorSlots: [slot('s1')], activeSlot: 's1' } }));
    expect(stored().face).toEqual(defaultFace());
  });
});

describe('GET /api/v1/closet', () => {
  const face = { ...defaultFace(), creatorSlots: [slot('s1'), slot('s2', { label: 'GOJO', base: { skinTone: '#F3D2B3', hairColor: '#F4F6FA' } })], activeSlot: 's2' };
  it('?for=spawn answers the active slot only', async () => {
    as(1990, face);
    const j = await (await closetGET(req('/api/v1/closet?for=spawn'))).json();
    expect(j.look.face.creatorSlots.map((s: CreatorSlotV2) => s.id)).toEqual(['s2']);
    expect(j.look.face.activeSlot).toBe('s2');
  });
  it('?for=slots answers summaries only (id, label, body, chips) and the active id', async () => {
    as(1990, face);
    const j = await (await closetGET(req('/api/v1/closet?for=slots'))).json();
    expect(j).toEqual({ slots: [expect.objectContaining({ id: 's1' }), { id: 's2', label: 'GOJO', body: 'male', chips: { skin: '#F3D2B3', hair: '#F4F6FA', accent: expect.any(String) } }], activeSlot: 's2', lookLocal: false });
  });
  it('without a query the whole look, as before', async () => {
    as(1990, face);
    const j = await (await closetGET(req('/api/v1/closet'))).json();
    expect(j.look.face.creatorSlots).toHaveLength(2);
  });
});

describe('POST /api/v1/closet/active ("Play as")', () => {
  it('moves the pointer, re-materialises the top level, and wears the slot\'s items filtered through the inventory', async () => {
    as(1990, { ...defaultFace(), creatorSlots: [slot('s1'), slot('s2', { base: { skinTone: '#22CC44' }, equipped: { headwear: 'band_flow', accessory: 'acc_sleeve' } })], activeSlot: 's1' }, []);
    const r = await activePOST(req('/api/v1/closet/active', { slotId: 's2' }));
    expect(await r.json()).toEqual({ switched: true, activeSlot: 's2', lookLocal: false });
    expect(stored().face.activeSlot).toBe('s2');
    expect(stored().face.skinTone).toBe('#22CC44');
    expect(stored().equipped).toMatchObject({ headwear: null, accessory: null, tops: 'top_lab' });   // band_flow is not owned any more
  });
  it('an unknown slot is a 404 and writes nothing; a bad id is a 400; a guest 401', async () => {
    as(1990, { ...defaultFace(), creatorSlots: [slot('s1')], activeSlot: 's1' });
    expect((await activePOST(req('/api/v1/closet/active', { slotId: 'zz' }))).status).toBe(404);
    expect((await activePOST(req('/api/v1/closet/active', { slotId: '../x' }))).status).toBe(400);
    expect(writesOf(db)).toEqual([]);
    h.session = null;
    expect((await activePOST(req('/api/v1/closet/active', { slotId: 's1' }))).status).toBe(401);
  });
  it('a minor: nothing is written; the answer says to switch the device copy', async () => {
    as(THIS_YEAR - 15, defaultFace());
    expect(await (await activePOST(req('/api/v1/closet/active', { slotId: 's1' }))).json()).toEqual({ switched: false, lookLocal: true });
    expect(writesOf(db)).toEqual([]);
  });
});

describe('GET /api/v1/hero-body plays the active slot\'s body', () => {
  const withActive = (body: CreatorSlotV2['body']) => ({ ...defaultFace(), creatorSlots: [slot('s1', { body })], activeSlot: 's1' });
  it('a scan owner\'s kit-body slot plays the kit body; his scan slot (or no slot) the scan', async () => {
    process.env.FEL_SCAN_OWNER_EMAILS = 'owner@fel.test';
    as(1990, withActive('male'), [], 'owner@fel.test');
    expect(await (await heroBodyGET()).json()).toMatchObject({ body: 'kit-male', scanOwned: true });
    as(1990, withActive('female'), [], 'owner@fel.test');
    expect((await (await heroBodyGET()).json()).body).toBe('kit-female');
    as(1990, withActive('scan'), [], 'owner@fel.test');
    expect((await (await heroBodyGET()).json()).body).toBe('scan');
    as(1990, defaultFace(), [], 'owner@fel.test');
    expect((await (await heroBodyGET()).json()).body).toBe('scan');
  });
  it('anyone else\'s scan slot is the kit body (the frame\'s), and scanOwned is false', async () => {
    process.env.FEL_SCAN_OWNER_EMAILS = 'owner@fel.test';
    as(1990, withActive('scan'));
    db.tables.athleteBuild = [{ id: 'ab1', userId: UID, build: { frame: { bodyType: 'female' } } }];
    expect(await (await heroBodyGET()).json()).toMatchObject({ body: 'kit-female', scanOwned: false });
    as(1990, withActive('female'));
    expect((await (await heroBodyGET()).json()).body).toBe('kit-female');
  });
  it('a guest: the neutral kit, no scan', async () => {
    expect(await (await heroBodyGET()).json()).toMatchObject({ body: 'kit-male', guest: true, scanOwned: false });
  });
});

describe('POST /api/v1/creator/athlete edits the active character', () => {
  it('the Finalize\'s face lands on the active slot; the other slots and the pointer survive', async () => {
    as(1990, { ...defaultFace(), creatorSlots: [slot('s1'), slot('s2')], activeSlot: 's2' });
    const r = await athletePOST(req('/api/v1/creator/athlete', { values: { appearance: { hairStyle: 'Locs' } }, plate: '' }));
    expect(r.status).toBe(200);
    const face = argsOf(db, 'avatarLook.upsert')[0].update.face;
    expect(face.activeSlot).toBe('s2');
    expect(face.creatorSlots.map((s: CreatorSlotV2) => s.id)).toEqual(['s1', 's2']);
    expect(face.creatorSlots[1].base.hairStyle).toBe('Locs');
    expect(face.creatorSlots[0].base.hairStyle).toBeUndefined();
    expect(face.hairStyle).toBe('Locs');
  });
});
