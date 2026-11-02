// NEX-06: Studio share links — who makes them, what they carry, the screen, the gate, revoke, takedown, the pending table — and the
// routes and the landing run for real with the session and the database as stand-ins (tests/helpers/fakeShareDb.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ session: null as unknown, users: new Map<string, { role: string | null; dobYear: number | null; name: string | null }>(), db: null as unknown }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => m.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, p) => {
      if (p === 'then') return undefined;
      if (p === 'user') return { findUnique: async (a: { where: { id: string } }) => m.users.get(a.where.id) ?? null };
      return (m.db as Record<string | symbol, unknown>)[p as string];
    },
  }),
}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); }, redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POST as createRoute, GET as listRoute } from '@/app/api/studio/share/route';
import { DELETE as revokeRoute } from '@/app/api/studio/share/[id]/route';
import { POST as takedownRoute } from '@/app/api/studio/share/[id]/takedown/route';
import SharedVenuePage from '@/app/play/shared/[token]/page';
import { SHARE_LIMITS, createShareLink, hashShareToken, isShareToken, openShareLink, prepareShare, revokeShareLink, shareMakerAllowed, shareProbe, shareRoute, takedownShareLink, typedTexts } from './share';
import { screenShareText } from './shareScreen';
import { SHARE_HANDOFF_PREFIX, readShareHandoff } from './shareHandoff';
import { reportBody, reportShareLink } from './shareReport';
import { resetStudioVenueCache, studioPickFor } from './runtime';
import { exportVenue } from './exportVenue';
import { pointWonGraph } from './scripts';
import { everyKindVenue, placed } from '@/tests/helpers/nexusStudio';
import { fakeShareDb } from '@/tests/helpers/fakeShareDb';
import { emptyCreatorDoc } from '@/lib/creator/look/doc';

const PHONE = { drawCalls: 65, activeMeshes: 58, textureMb: 53, skinnedBodies: 4 };
const cleanVenue = (name = 'Night Court') => {
  const v = everyKindVenue();
  v.name = name;
  v.objects = v.objects.filter((o) => o.type !== 'decal');
  v.objects.push(placed('decal:scuff', [-12, 0, 12]));
  return v;
};
const cast = { player: { name: 'Nova', body: 'female' as const, doc: { ...emptyCreatorDoc(), colours: { jersey: '#FF3366' } }, base: { skinTone: '#8D5524' } } };
const goodExport = (name?: string) => exportVenue(cleanVenue(name), cast, [{ id: 'sc1', name: 'cheer', ...pointWonGraph() }]);
let db: ReturnType<typeof fakeShareDb>;

beforeEach(() => {
  db = fakeShareDb(); m.db = db;
  shareProbe.reset();
  m.users = new Map([['owner', { role: 'admin', dobYear: 1980, name: 'Elijah' }], ['founder', { role: 'founder', dobYear: null, name: 'F' }], ['player', { role: 'player', dobYear: 1990, name: 'P' }], ['teen', { role: 'player', dobYear: new Date().getFullYear() - 15, name: 'T' }]]);
  m.session = { user: { id: 'owner' } };
  vi.stubEnv('STUDIO_SHARE_ENABLED', '1');
  vi.stubEnv('NEXUS_STUDIO_ENABLED', '1');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetStudioVenueCache(); });

describe('the text screen (an adapter over the party list until the safety screen lands)', () => {
  it('refuses listed words, look-alikes included, and says which', () => {
    for (const t of ['Fuck Court', 'sh1t show', 'N4zi arena', 'the @ss end', 'kys stadium']) {
      const r = screenShareText(t);
      expect(r.ok, t).toBe(false);
    }
    expect(screenShareText('sh1t show')).toEqual({ ok: false, found: 'sh1t' });
  });
  it('passes the false positives (Scunthorpe-safe: stems at a word start, whole words whole)', () => {
    for (const t of ['Scunthorpe Arena', 'Essex Classic', 'Cockpit Court', 'Shiitake Stadium', 'Assistant’s Court', 'Night Court', 'Dickens Park', 'Bass Pro Pitch', 'Hancock Field',
      'As good as it gets', 'Comic Con Court', 'Nigel’s Nightclub', 'Lagos, Nigeria']) expect(screenShareText(t).ok, t).toBe(true);
  });
});

describe('who makes a link (owner Q6)', () => {
  it('the owner\'s roles always; anyone else only a strict verified adult; a teen builds but stays private', () => {
    const y = new Date().getFullYear();
    expect(shareMakerAllowed('admin', null)).toBe('ok');
    expect(shareMakerAllowed('founder', y - 15)).toBe('ok');
    expect(shareMakerAllowed('player', 1980)).toBe('ok');
    expect(shareMakerAllowed('player', y - 18)).toBe('teen');   // strict: a gap of 18 is not yet verified
    expect(shareMakerAllowed('player', y - 15)).toBe('teen');
    expect(shareMakerAllowed('player', null)).toBe('unknown_age');
  });
});

describe('what a link carries', () => {
  it('the venue, sanitised, with its scripts — never a cast; typed texts are the name and every banner', () => {
    const r = prepareShare(goodExport(), PHONE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.exp).not.toHaveProperty('cast');
    expect(r.exp.scripts?.length).toBe(1);
    expect(typedTexts(r.exp).map((t) => t.field)).toEqual(['venue name', 'banner']);
  });
  it('refused with every reason: a word in the name or a banner, an object on the court, no phone measurement', () => {
    const bad = exportVenue({ ...everyKindVenue(), name: 'Shit Court' }, null, [{ id: 's', name: 'x', ...pointWonGraph() }]);
    bad.scripts![0].nodes.find((n) => n.kind === 'banner')!.params.text = 'FUCK YES';
    const r = prepareShare(bad, null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.join('\n')).toMatch(/scuff mark .* playing area/);
    expect(r.problems.join('\n')).toMatch(/Measure the venue on Phone first/);
    expect(r.problems.join('\n')).toMatch(/venue name “Shit Court”/);
    expect(r.problems.join('\n')).toMatch(/banner “FUCK YES”/);
    expect(prepareShare({ nope: 1 }, PHONE)).toEqual({ ok: false, problems: ['This is not a venue a mode can play.'] });
  });
  it('opens the mode\'s own page with the hand-off key; the live tiebreak is Tennis\'s variant', () => {
    expect(shareRoute('tiebreak', 'ssl_x')).toBe('/play/tennis?variant=tiebreak&share=ssl_x');
    expect(shareRoute('football', 'ssl_x')).toBe('/play/football?share=ssl_x');
    expect(shareRoute('volleyball', 'ssl_x')).toBe('/play/volleyball?share=ssl_x');
    expect(shareRoute('derby', 'ssl_x')).toBe('/play/derby?share=ssl_x');
    expect(shareRoute('dunk', 'ssl_x')).toBeNull();
  });
});

describe('the table (pending SQL, through the probe)', () => {
  it('create → open → revoke: the token is shown once and only its hash stored; a revoked link is the same null as none', async () => {
    const c = await createShareLink(db, { creatorId: 'owner', creatorName: 'Elijah', venue: goodExport(), phone: PHONE });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(isShareToken(c.value.token)).toBe(true);
    expect(db.rows[0].tokenHash).toBe(hashShareToken(c.value.token));
    expect(JSON.stringify(db.rows)).not.toContain(c.value.token);
    expect(JSON.stringify(db.rows[0].payload)).not.toContain('Nova');
    const o = await openShareLink(db, c.value.token);
    expect(o).toMatchObject({ ok: true, value: { id: c.value.id, mode: 'tiebreak', venueName: 'Night Court', creatorName: 'Elijah' } });
    expect(db.rows[0].opens).toBe(1);
    expect(await revokeShareLink(db, c.value.id, 'someone-else')).toEqual({ ok: true, value: false });
    expect(await revokeShareLink(db, c.value.id, 'owner')).toEqual({ ok: true, value: true });
    expect(db.rows[0].payload).toBeNull();
    expect(await openShareLink(db, c.value.token)).toEqual({ ok: true, value: null });
    expect(await openShareLink(db, 'x'.repeat(32))).toEqual({ ok: true, value: null });
    expect(await openShareLink(db, 'not a token')).toEqual({ ok: true, value: null });
  });
  it('takedown nulls the payload; a display name that trips the screen is not stored', async () => {
    const c = await createShareLink(db, { creatorId: 'owner', creatorName: 'Shit Lord', venue: goodExport(), phone: PHONE });
    if (!c.ok) throw new Error('not made');
    expect(db.rows[0].creatorName).toBeNull();
    expect(await takedownShareLink(db, c.value.id)).toEqual({ ok: true, value: true });
    expect(db.rows[0]).toMatchObject({ payload: null, status: 'taken_down' });
    expect(await openShareLink(db, c.value.token)).toEqual({ ok: true, value: null });
  });
  it('caps: links live per creator, links made per hour', async () => {
    for (let i = 0; i < SHARE_LIMITS.perHour; i++) expect((await createShareLink(db, { creatorId: 'owner', creatorName: null, venue: goodExport(), phone: PHONE, now: Date.now() + i })).ok).toBe(true);
    expect(await createShareLink(db, { creatorId: 'owner', creatorName: null, venue: goodExport(), phone: PHONE })).toMatchObject({ ok: false, status: 429, error: 'rate_limited' });
    for (const r of db.rows) r.createdAt = new Date(0);
    while (db.rows.length < SHARE_LIMITS.livePerCreator) db.rows.push({ ...db.rows[0], id: `x${db.rows.length}` });
    expect(await createShareLink(db, { creatorId: 'owner', creatorName: null, venue: goodExport(), phone: PHONE })).toMatchObject({ ok: false, status: 429, error: 'too_many_links' });
  });
  it('the SQL not applied yet: every call is not_ready (503), never a throw; a refused venue is still refused first', async () => {
    db.tableThere = false;
    expect(await createShareLink(db, { creatorId: 'owner', creatorName: null, venue: goodExport(), phone: PHONE })).toMatchObject({ ok: false, status: 503, error: 'share_not_ready' });
    expect(await openShareLink(db, 'a'.repeat(32))).toMatchObject({ ok: false, status: 503 });
    expect(await createShareLink(db, { creatorId: 'owner', creatorName: null, venue: goodExport(), phone: null })).toMatchObject({ ok: false, status: 422 });
  });
  it('every statement is parameterised: no request value in the SQL text', async () => {
    const c = await createShareLink(db, { creatorId: 'owner', creatorName: 'Robert"); DROP TABLE x;--', venue: goodExport('Night Court'), phone: PHONE });
    if (!c.ok) throw new Error('not made');
    await openShareLink(db, c.value.token);
    for (const q of db.sql) { expect(q).not.toContain('DROP TABLE x'); expect(q).not.toContain(c.value.token); expect(q).not.toContain('owner'); }
  });
});

describe('the routes', () => {
  const post = (body: unknown) => createRoute(new Request('http://x/api/studio/share', { method: 'POST', body: JSON.stringify(body) }));
  it('POST: off → 404; signed out → 401; outside the Studio audience → 404; a refused venue → 422 with reasons; good → the URL once', async () => {
    vi.stubEnv('STUDIO_SHARE_ENABLED', '');
    expect((await post({ venue: goodExport(), phone: PHONE })).status).toBe(404);
    vi.stubEnv('STUDIO_SHARE_ENABLED', '1');
    m.session = null;
    expect((await post({ venue: goodExport(), phone: PHONE })).status).toBe(401);
    for (const who of ['player', 'teen']) { m.session = { user: { id: who } }; expect((await post({ venue: goodExport(), phone: PHONE })).status, who).toBe(404); }
    m.session = { user: { id: 'owner' } };
    const bad = await post({ venue: goodExport('Shit Court'), phone: PHONE });
    expect(bad.status).toBe(422);
    expect((await bad.json()).problems.join(' ')).toMatch(/Shit Court/);
    const ok = await post({ venue: goodExport(), phone: PHONE });
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j.url).toMatch(/^\/play\/shared\/[A-Za-z0-9_-]{32}$/);
    expect(j.mode).toBe('tiebreak');
    m.session = { user: { id: 'founder' } };   // the founder with no birth year on file: the owner's role makes links
    expect((await post({ venue: goodExport(), phone: PHONE })).status).toBe(200);
  });
  it('GET lists the creator\'s own links, with no token', async () => {
    await post({ venue: goodExport(), phone: PHONE });
    const r = await listRoute();
    const j = await r.json();
    expect(j.links).toHaveLength(1);
    expect(JSON.stringify(j)).not.toMatch(/tokenHash|token"/);
  });
  it('DELETE: the creator revokes; anyone else gets the 404 a missing link gets', async () => {
    const id = (await (await post({ venue: goodExport(), phone: PHONE })).json()).id as string;
    m.session = { user: { id: 'player' } };
    expect((await revokeRoute(new Request('http://x'), { params: { id } })).status).toBe(404);
    m.session = { user: { id: 'owner' } };
    expect((await revokeRoute(new Request('http://x'), { params: { id } })).status).toBe(200);
  });
  it('takedown: founder and admin by the DATABASE role; everyone else 404', async () => {
    const id = (await (await post({ venue: goodExport(), phone: PHONE })).json()).id as string;
    m.session = { user: { id: 'player', role: 'admin' } };
    expect((await takedownRoute(new Request('http://x'), { params: { id } })).status).toBe(404);
    m.session = { user: { id: 'founder' } };
    expect((await takedownRoute(new Request('http://x'), { params: { id } })).status).toBe(200);
    expect(db.rows[0]).toMatchObject({ status: 'taken_down', payload: null });
  });
});

describe('the landing and the hand-off', () => {
  const open = async (token: string) => { try { return await SharedVenuePage({ params: { token } }); } catch (e) { return (e as Error).message; } };
  it('off → 404; signed out → login; a missing or revoked link → 404; a live one → the landing with the venue, the name and the route', async () => {
    const c = await createShareLink(db, { creatorId: 'owner', creatorName: 'Elijah', venue: goodExport(), phone: PHONE });
    if (!c.ok) throw new Error('not made');
    vi.stubEnv('STUDIO_SHARE_ENABLED', '');
    expect(await open(c.value.token)).toBe('NOT_FOUND');
    vi.stubEnv('STUDIO_SHARE_ENABLED', '1');
    m.session = null;
    expect(await open(c.value.token)).toBe(`REDIRECT /login?next=${encodeURIComponent(`/play/shared/${c.value.token}`)}`);
    m.session = { user: { id: 'teen' } };   // any signed-in account opens a link (Q5)
    const el = await open(c.value.token) as { props: Record<string, unknown> };
    expect(el.props).toMatchObject({ id: c.value.id, venueName: 'Night Court', creatorName: 'Elijah', modeLabel: 'Tiebreak', route: `/play/tennis?variant=tiebreak&share=${c.value.id}` });
    expect(el.props.venue).not.toHaveProperty('cast');
    expect(await open('b'.repeat(32))).toBe('NOT_FOUND');
    await revokeShareLink(db, c.value.id, 'owner');
    expect(await open(c.value.token)).toBe('NOT_FOUND');
  });
  it('the mode reads the hand-off for `?share=<id>`: practice, never in a competitive run, never for another mode, never a cast', () => {
    const exp = goodExport();
    const store = new Map([[SHARE_HANDOFF_PREFIX + 'ssl_abcdefghijklmnop', JSON.stringify(exp)]]);
    const ss = { getItem: (k: string) => store.get(k) ?? null };
    expect(readShareHandoff('ssl_abcdefghijklmnop', ss)).not.toHaveProperty('cast');
    expect(readShareHandoff('ssl_bad', ss)).toBeNull();
    const page = (search: string) => { vi.stubGlobal('window', { location: { search }, sessionStorage: ss, localStorage: { getItem: () => null } }); resetStudioVenueCache(); };
    page('?variant=tiebreak&share=ssl_abcdefghijklmnop');
    expect(studioPickFor('tiebreak', { env: 'production' })).toMatchObject({ source: 'shared', competitive: false });
    expect(studioPickFor('tiebreak', { env: 'production' })!.exp.scripts?.length).toBe(1);
    expect(studioPickFor('football', { env: 'production' })).toBeNull();
    for (const k of ['arena', 'c', 'mp', 'signature', 'net', 'party', 'ranked']) {
      page(`?share=ssl_abcdefghijklmnop&${k}=1`);
      expect(studioPickFor('tiebreak', { env: 'production' }), k).toBeNull();
    }
  });
  it('GameShell starts a shared run as a playtest run (unpaid, unranked)', () => {
    const shell = readFileSync(join(__dirname, '..', '..', 'components', 'games', 'game-shell.tsx'), 'utf8');
    expect(shell).toContain("const shareRun = searchParams.has('share');");
    expect(shell).toContain('...(playtestRun || shareRun ? { playtest: true } : {})');
  });
  it('Report posts to the safety lane\'s route in its own shape, and says plainly when reporting is not open yet', async () => {
    expect(reportBody('ssl_x', 'hate')).toEqual({ target: 'studio_share', reason: 'hate', ref: 'ssl_x' });
    const f = (status: number) => vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;
    expect(await reportShareLink('ssl_x', 'hate', f(200))).toBe('received');
    expect(await reportShareLink('ssl_x', 'hate', f(404))).toBe('not_open');
    expect(await reportShareLink('ssl_x', 'hate', f(400))).toBe('not_open');
    expect(await reportShareLink('ssl_x', 'hate', f(500))).toBe('failed');
  });
});
