// fel-netd's own test (PARTY-CHAT lane, 2026-10-13): the real server on a real port, through real sockets.
// The rules are unit-tested in the app's suite (tests/party-chat/netd-party.test.ts); this proves the shell around them:
// the legacy room path is unchanged, /healthz names the feature, and a party handshake carries the signed ticket.
//
//   cd server/netd && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { WebSocket } from 'ws';
import { signTicket } from '../src/ticket.ts';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const SECRET = 'netd-test-secret';
let server: ChildProcess;

before(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    env: { ...process.env, PORT: String(PORT), PARTY_TICKET_SECRET: SECRET }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('netd did not start')), 15_000);
    server.stdout!.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); resolve(); } });
  });
});
after(() => { server.kill(); });

/** Open a socket and collect frames; `next(t)` waits for the next frame of that type. */
function client(path: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}${path}`);
  const frames: Record<string, unknown>[] = [];
  const waiters: { t: string; resolve: (m: Record<string, unknown>) => void }[] = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    const w = waiters.findIndex((x) => x.t === m.t);
    if (w >= 0) waiters.splice(w, 1)[0].resolve(m); else frames.push(m);
  });
  const opened = new Promise<void>((r) => ws.on('open', () => r()));
  const next = (t: string) => {
    const i = frames.findIndex((f) => f.t === t);
    if (i >= 0) return Promise.resolve(frames.splice(i, 1)[0]);
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      waiters.push({ t, resolve });
      setTimeout(() => reject(new Error(`no ${t}`)), 5000);
    });
  };
  return { ws, opened, next, send: (m: unknown) => ws.send(JSON.stringify(m)), frames };
}

const ticket = (name: string, adult: boolean) =>
  signTicket({ uid: `uid-${name}`, pub: `pub-${name}`, name, adult, exp: Date.now() + 60_000 }, SECRET);

test('healthz names the party feature', async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/healthz`);
  const j = await r.json() as { ok: boolean; features: string[] };
  assert.equal(j.ok, true);
  assert.deepEqual(j.features, ['party1']);
});

test('the legacy match room is unchanged', async () => {
  const c = client('/?room=r1&peer=p1&mode=onevone');
  const w = await c.next('welcome');
  assert.equal(w.isAuthority, true);
  c.ws.close();
});

test('create, join by code, chat between adults, a teen refused free text', async () => {
  const host = client('/party');
  await host.opened;
  host.send({ t: 'p_hello', v: 1, create: true, ticket: ticket('ANA', true) });
  const hw = await host.next('p_welcome');
  assert.match(String(hw.code), /^[2-9A-HJKMNP-Z]{6}$/);
  assert.deepEqual(hw.rights, { text: true, voice: true });

  const guest = client('/party');
  await guest.opened;
  guest.send({ t: 'p_hello', v: 1, code: String(hw.code).toLowerCase(), ticket: ticket('BO', true) });
  const gw = await guest.next('p_welcome');
  assert.equal(gw.code, hw.code);

  guest.send({ t: 'p_chat', text: 'hi ana' });
  const line = await host.next('p_chat');
  assert.equal(line.text, 'hi ana');
  assert.equal(line.from, gw.you);

  // a forged ticket is teen rules: it knocks, and once let in it still cannot put words in the room
  const kid = client('/party');
  await kid.opened;
  kid.send({ t: 'p_hello', v: 1, code: hw.code, ticket: ticket('TY', true).replace(/.$/, 'x'), name: 'ty' });
  const kw = await kid.next('p_welcome');
  assert.deepEqual(kw.rights, { text: false, voice: false });
  await kid.next('p_wait');
  host.send({ t: 'p_admit', peer: kw.you });
  await kid.next('p_state');
  kid.send({ t: 'p_chat', text: 'meet me outside' });
  const e = await kid.next('p_error');
  assert.equal(e.code, 'text_adults_only');
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(![...host.frames, ...guest.frames].some((f) => JSON.stringify(f).includes('meet me')));

  for (const c of [host, guest, kid]) c.ws.close();
});

test('a reload resumes the same member', async () => {
  const a = client('/party');
  await a.opened;
  a.send({ t: 'p_hello', v: 1, create: true, ticket: ticket('ANA', true) });
  const w1 = await a.next('p_welcome');
  a.ws.close();
  const b = client('/party');
  await b.opened;
  b.send({ t: 'p_hello', v: 1, code: w1.code, ticket: ticket('ANA', true), resume: w1.resume });
  const w2 = await b.next('p_welcome');
  assert.equal(w2.you, w1.you);
  assert.equal(w2.resumed, true);
  b.ws.close();
});

test('an unknown code is refused', async () => {
  const c = client('/party');
  await c.opened;
  c.send({ t: 'p_hello', v: 1, code: 'ZZZZZZ' });
  const r = await c.next('p_refused');
  assert.equal(r.reason, 'not_found');
});
