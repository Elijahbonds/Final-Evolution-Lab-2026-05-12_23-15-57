// The invite's new halves through the real routes (coach-loop P1, 2026-10-20): a coded token from POST /api/coach/invite,
// the typed code's lookup, and the bulk import (paste or CSV) with email on and off. Only the session, the database
// and the mail transport are stand-ins.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ user: null as string | null, spy: null as any, mailOn: false, origin: 'https://fel.test' as string | null }));

vi.mock('next-auth', () => ({ getServerSession: async () => (h.user ? { user: { id: h.user } } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { spyPrisma } = await import('@/tests/helpers/writeSpyDb');
  return { prisma: new Proxy({}, { get: (_t, k) => spyPrisma(h.spy)[k] }) };
});
const outbox = vi.hoisted(() => ({ box: null as any }));
vi.mock('@/lib/mail', async (orig) => {
  const real = await orig<typeof import('@/lib/mail')>();
  const { MAIL_ON, MAIL_OFF } = await import('@/tests/helpers/mailOutbox');
  return {
    ...real,
    mailReady: () => h.mailOn,
    mailLinkOrigin: () => h.origin,
    sendMail: (m: import('@/lib/mail').MailMessage) => real.sendMail(m, { config: h.mailOn ? MAIL_ON : MAIL_OFF, transport: outbox.box }),
  };
});

import { NextRequest } from 'next/server';
import { POST as invitePOST } from '@/app/api/coach/invite/route';
import { GET as codeGET } from '@/app/api/coach/invite/code/[code]/route';
import { POST as bulkPOST } from '@/app/api/coach/invite/bulk/route';
import { newSpyDb, writesOf } from '@/tests/helpers/writeSpyDb';
import { mailOutbox } from '@/tests/helpers/mailOutbox';
import { codeOfToken, formatCode } from './inviteCode';
import { MAX_LIVE_INVITES_PER_COACH } from './invite';

beforeEach(() => {
  h.spy = newSpyDb({
    user: [{ id: 'coach-1', name: 'Coach Dee', email: 'dee@fel.test', dobYear: 1985 }, { id: 'athlete-9', name: 'Already Here', email: 'sam@x.com', dobYear: 1990 }],
    facilitatorProfile: [{ userId: 'coach-1', certificationStatus: 'certified' }],
    coachInvite: [],
  });
  outbox.box = mailOutbox();
  h.mailOn = false; h.origin = 'https://fel.test';
  h.user = 'coach-1';
});

const lookup = async (code: string, ip = '10.0.0.1') => {
  const res = await codeGET(new Request(`http://fel.test/api/coach/invite/code/${code}`, { headers: { 'x-forwarded-for': ip } }), { params: { code } });
  return { status: res.status, json: await res.json() as Record<string, any> };
};
const bulk = async (text: string, send = false) => {
  const res = await bulkPOST(new NextRequest('http://fel.test/api/coach/invite/bulk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, send }) }));
  return { status: res.status, json: await res.json() as Record<string, any> };
};

describe('a typed code beside the link', () => {
  it('a new invite carries a code, and typing it (any case, with a dash) finds the same landing page', async () => {
    const res = await invitePOST(new Request('http://fel.test/api/coach/invite', { method: 'POST', body: JSON.stringify({ use: 'many' }) }));
    const { invite } = await res.json();
    const code = codeOfToken(invite.token)!;
    expect(code).toMatch(/^[0-9A-Z]{8}$/);
    const r = await lookup(formatCode(code).toLowerCase());
    expect(r).toEqual({ status: 200, json: { path: `/coach/join/${invite.token}` } });
  });

  it('a closed, an expired, an unknown and a malformed code all answer the same 404', async () => {
    h.spy.tables.coachInvite.push(
      { token: 'AAAA1111~x', coachId: 'coach-1', use: 'once', closedAt: new Date(), expiresAt: new Date(Date.now() + 1e6), joined: 1 },
      { token: 'BBBB2222~x', coachId: 'coach-1', use: 'once', closedAt: null, expiresAt: new Date(Date.now() - 1), joined: 0 },
    );
    for (const c of ['AAAA1111', 'BBBB2222', 'CCCC3333', 'nope']) expect(await lookup(c, `ip-${c}`)).toEqual({ status: 404, json: { error: 'not_found' } });
  });

  it('a guesser is rate-limited per address', async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await lookup('ZZZZ9999', '10.9.9.9')).status;
    expect(last).toBe(429);
  });
});

describe('bulk import', () => {
  it('20 athletes pasted: 20 one-shot invites, each with its own code; nothing joined; email off says so', async () => {
    const paste = ['Name\tEmail', ...Array.from({ length: 20 }, (_, i) => `Player ${i + 1}\tp${i + 1}@team.org`)].join('\n');
    const r = await bulk(paste, true);
    expect(r.status).toBe(201);
    expect(r.json.sheet).toHaveLength(20);
    expect(new Set(r.json.sheet.map((s: any) => s.code)).size).toBe(20);
    expect(r.json.sheet.every((s: any) => s.emailed === 'off')).toBe(true);
    expect(r.json.email).toEqual({ requested: true, on: false });
    expect(h.spy.tables.coachInvite.filter((i: any) => i.use === 'once')).toHaveLength(20);
    expect(writesOf(h.spy).filter((w) => w !== 'coachInvite.create')).toEqual([]);
    expect(outbox.box.sent).toEqual([]);
  });

  it('with email on, each address gets its own link and code, and nothing about anybody else', async () => {
    h.mailOn = true;
    const r = await bulk('Sam Lee, sam@x.com\nRia <ria@x.com>\nAna Silva', true);
    expect(r.json.sheet.map((s: any) => s.emailed)).toEqual(['sent', 'sent', 'none']);
    expect(outbox.box.sent.map((m: any) => m.to)).toEqual(['sam@x.com', 'ria@x.com']);
    const [sam, ria] = outbox.box.sent;
    expect(sam.text).toContain(`https://fel.test${r.json.sheet[0].path}`);
    expect(sam.text).toContain(r.json.sheet[0].code);
    // where the code is typed, as a full address (no "Got a code?" button exists to point at)
    expect(sam.text).toContain('https://fel.test/coach/join and type the code');
    expect(sam.text).toContain('Coach Dee invited you');
    expect(sam.text).not.toContain('ria'); expect(ria.text).not.toMatch(/sam|Sam/);
    expect(sam.text).not.toContain('dee@fel.test');
  });

  it('never says whether an address already has an account (sam@x.com is a member; the answer is the same shape)', async () => {
    const r = await bulk('sam@x.com\nnobody@x.com');
    const keys = r.json.sheet.map((s: any) => Object.keys(s).sort().join(','));
    expect(keys[0]).toBe(keys[1]);
    expect(JSON.stringify(r.json)).not.toMatch(/athlete-9|Already Here|member|exists/i);
    expect(writesOf(h.spy)).not.toContain('coachClient.create');
  });

  it('send:false never emails, even with email on', async () => {
    h.mailOn = true;
    await bulk('sam@x.com', false);
    expect(outbox.box.sent).toEqual([]);
  });

  it('refuses a paste with nothing to invite, a list bigger than the room left, a coach who is not certified, and a stranger', async () => {
    expect((await bulk('  \n')).json.error).toBe('nothing_to_invite');
    for (let i = 0; i < MAX_LIVE_INVITES_PER_COACH - 2; i++) h.spy.tables.coachInvite.push({ token: `t${i}`, coachId: 'coach-1', use: 'once', closedAt: null, expiresAt: new Date(Date.now() + 1e6), joined: 0 });
    const full = await bulk('a@x.com\nb@x.com\nc@x.com');
    expect(full).toMatchObject({ status: 429, json: { error: 'too_many_invites', room: 2, asked: 3 } });
    h.spy.tables.facilitatorProfile = [];
    expect((await bulk('a@x.com')).status).toBe(403);
    h.user = null;
    expect((await bulk('a@x.com')).status).toBe(401);
  });

  it('a bad line is reported by number; the good lines still get invites', async () => {
    const r = await bulk('Sam, sam@x\nRia, ria@x.com');
    expect(r.json.problems).toEqual([{ line: 1, problem: 'bad_email' }]);
    expect(r.json.sheet.map((s: any) => s.line)).toEqual([2]);
  });
});
