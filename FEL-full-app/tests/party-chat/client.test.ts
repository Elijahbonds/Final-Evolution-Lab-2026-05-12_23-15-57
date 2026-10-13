// PARTY-CHAT (2026-10-13): the page's party connection and state, driven through a fake socket — no network.
import { describe, it, expect, beforeEach } from 'vitest';
import { PartyClient, PARTY_RETRY_MS, type PartyIo } from '@/lib/party/social/client';
import { applyFrame, EMPTY_PARTY, FEED_MAX, captionText } from '@/lib/party/social/state';
import { dockPlace } from '@/lib/party/social/tuck';
import { activityLine } from '@/lib/party/social/activity';
import { partySocketUrl, partyInviteUrl } from '@/lib/party/social/config';
import { loadStoredParty } from '@/lib/party/social/persist';

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeSocket.all.push(this); }
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  frame(f: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(f) }); }
  drop() { this.readyState = 3; this.onclose?.(); }
}

function storage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}

let timers: { fn: () => void; ms: number }[] = [];
let clock = 1_000_000;
const io = (ticket: string | null = 'tkt'): PartyIo => ({
  socket: (url) => new FakeSocket(url) as unknown as WebSocket,
  ticket: async () => ({ ticket, adult: ticket !== null, iceServers: [] }),
  now: () => clock,
  setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
  clearTimeout: (h) => { timers = timers.filter((t) => t !== h); },
});
const flush = () => new Promise((r) => setTimeout(r, 0));
const last = () => FakeSocket.all[FakeSocket.all.length - 1];

beforeEach(() => {
  FakeSocket.all = [];
  timers = [];
  (globalThis as { window?: unknown }).window = { sessionStorage: storage(), localStorage: storage() };
});

async function joined(c: PartyClient, code = 'ABC234') {
  c.join(code, 'ANA');
  await flush();
  const ws = last();
  ws.open();
  ws.frame({ t: 'p_welcome', v: 1, code, you: 'm1', resume: 'res-1', rights: { text: true, voice: true } });
  ws.frame({ t: 'p_state', code, you: 'm1', host: 'm1', members: [{ peer: 'm1', name: 'ANA', pub: 'pa', host: true }, { peer: 'm2', name: 'BO', pub: 'pb' }], me: { text: true, voice: true } });
  return ws;
}

describe('the connection', () => {
  it('with no NEXT_PUBLIC_NETD_URL parties are unavailable and nothing connects', () => {
    const c = new PartyClient(io(), null);
    expect(c.getState().status).toBe('unavailable');
    c.create('ANA');
    expect(FakeSocket.all).toHaveLength(0);
  });

  it('create sends a hello with the ticket, then goes live', async () => {
    const c = new PartyClient(io(), 'ws://netd/party');
    c.create('ANA');
    await flush();
    last().open();
    expect(last().sent[0]).toMatchObject({ t: 'p_hello', v: 1, create: true, ticket: 'tkt', name: 'ANA' });
    last().frame({ t: 'p_welcome', code: 'QWE789', you: 'm1', resume: 'r', rights: { text: true, voice: true } });
    last().frame({ t: 'p_state', code: 'QWE789', you: 'm1', host: 'm1', members: [{ peer: 'm1', name: 'ANA', pub: 'p' }], me: { text: true, voice: true } });
    expect(c.getState()).toMatchObject({ status: 'live', code: 'QWE789', host: 'm1' });
    expect(loadStoredParty(clock)).toMatchObject({ code: 'QWE789', resume: 'r' });
  });

  it('AN OLD NETD: its legacy "room and peer required" answer → "Parties need a server update"', async () => {
    const c = new PartyClient(io(), 'ws://netd/party');
    c.create('ANA');
    await flush();
    last().open();
    last().frame({ t: 'error', reason: 'room and peer required' });
    expect(c.getState().status).toBe('outdated');
    expect(c.getState().notice).toMatch(/server update/);
    expect(timers).toHaveLength(0);   // and it does not keep knocking
  });

  it('a dropped socket reconnects with the resume secret, and comes back as the same member', async () => {
    const c = new PartyClient(io(), 'ws://netd/party');
    const ws = await joined(c);
    ws.drop();
    expect(c.getState().status).toBe('reconnecting');
    expect(timers[0].ms).toBe(PARTY_RETRY_MS[0]);
    timers.shift()!.fn();
    await flush();
    last().open();
    expect(last().sent[0]).toMatchObject({ t: 'p_hello', code: 'ABC234', resume: 'res-1' });
  });

  it('after a full reload the stored party token rejoins', async () => {
    const a = new PartyClient(io(), 'ws://netd/party');
    await joined(a);
    const b = new PartyClient(io(), 'ws://netd/party');   // the new page's module
    expect(b.resumeStored('ANA')).toBe(true);
    await flush();
    last().open();
    expect(last().sent[0]).toMatchObject({ t: 'p_hello', code: 'ABC234', resume: 'res-1' });
  });

  it('kicked: the party ends, the stored token is cleared, no reconnect', async () => {
    const c = new PartyClient(io(), 'ws://netd/party');
    const ws = await joined(c);
    ws.frame({ t: 'p_kicked' });
    expect(c.getState()).toMatchObject({ status: 'ended' });
    expect(c.getState().notice).toMatch(/removed you/);
    expect(loadStoredParty(clock)).toBeNull();
    expect(timers.filter((t) => t.ms !== 20_000)).toHaveLength(0);
  });

  it('leave says goodbye and forgets the party', async () => {
    const c = new PartyClient(io(), 'ws://netd/party');
    const ws = await joined(c);
    c.leave();
    expect(ws.sent.some((m) => m.t === 'p_leave')).toBe(true);
    expect(c.getState().status).toBe('idle');
    expect(loadStoredParty(clock)).toBeNull();
  });

  it('a block hides their lines here, tells the server, and is re-sent in the next party', async () => {
    const c = new PartyClient(io(), 'ws://netd/party');
    const ws = await joined(c);
    ws.frame({ t: 'p_chat', id: 'c1', from: 'm2', name: 'BO', text: 'hello', at: 1 });
    expect(c.getState().feed).toHaveLength(1);
    c.block({ pub: 'pb', name: 'BO' });
    expect(ws.sent.at(-1)).toEqual({ t: 'p_block', pub: 'pb' });
    expect(c.getState().feed).toHaveLength(0);
    ws.frame({ t: 'p_quick', id: 'gg', key: 'k1', from: 'm2', name: 'BO', at: 2 });
    expect(c.getState().feed).toHaveLength(0);
    // a new page, a new party with BO in it: the remembered block goes to the server again
    const d = new PartyClient(io(), 'ws://netd/party');
    const ws2 = await joined(d, 'QWE789');
    expect(ws2.sent).toContainEqual({ t: 'p_block', pub: 'pb' });
  });

  it('a guest (no ticket) still joins: the server applies teen rules', async () => {
    const c = new PartyClient(io(null), 'ws://netd/party');
    c.join('ABC234', 'KID');
    await flush();
    last().open();
    expect(last().sent[0]).toMatchObject({ ticket: null, code: 'ABC234' });
  });
});

describe('the state, frame by frame', () => {
  const none = new Set<string>();
  it('bounds what it draws', () => {
    const s = applyFrame(EMPTY_PARTY, { t: 'p_state', code: 'ABC234', you: 'm1', members: Array.from({ length: 20 }, (_, i) => ({ peer: `m${i}`, name: 'X'.repeat(50), pub: 'p' })) }, none, 0);
    expect(s.members).toHaveLength(6);
    expect(s.members[0].name).toHaveLength(12);
    expect(applyFrame(EMPTY_PARTY, { t: 'p_state', members: [{ peer: '<script>' }] }, none, 0).members).toHaveLength(0);
  });
  it('the feed is capped and in memory only', () => {
    let s = applyFrame(EMPTY_PARTY, { t: 'p_state', code: 'ABC234', you: 'm1', members: [{ peer: 'm1', name: 'A', pub: 'p' }] }, none, 0);
    for (let i = 0; i < FEED_MAX + 10; i++) s = applyFrame(s, { t: 'p_chat', id: `c${i}`, from: 'm1', text: `hi ${i}` }, none, i);
    expect(s.feed).toHaveLength(FEED_MAX);
  });
  it('quick chat and emotes become words for captions and screen readers', () => {
    let s = applyFrame(EMPTY_PARTY, { t: 'p_state', you: 'm1', members: [{ peer: 'm2', name: 'BO', pub: 'p' }] }, none, 0);
    s = applyFrame(s, { t: 'p_emote', id: 'clap', key: 'k', from: 'm2' }, none, 0);
    expect(captionText(s.caption!)).toBe('BO: Applause');
    s = applyFrame(s, { t: 'p_quick', id: 'gg', key: 'k2', from: 'm2' }, none, 0);
    expect(captionText(s.caption!)).toBe('BO: GG!');
    // an unknown preset id draws nothing
    expect(applyFrame(s, { t: 'p_quick', id: 'evil', key: 'k3', from: 'm2' }, none, 0).feed).toHaveLength(2);
  });
  it('a start offer only ever points at a /play page', () => {
    expect(applyFrame(EMPTY_PARTY, { t: 'p_start', id: 'x', path: 'https://evil.example', room: 'r', inMs: 5000 }, none, 0).start).toBeNull();
    expect(applyFrame(EMPTY_PARTY, { t: 'p_start', id: 'x', mode: 'onevone', path: '/play/onevone', room: 'pt-1', seat: 'foe', inMs: 5000 }, none, 100).start)
      .toMatchObject({ at: 5100, seat: 'foe', room: 'pt-1' });
  });
});

describe('the tuck rule (owner: nothing on the play screen but the HUD)', () => {
  it('hidden while playing, tucked on the pause and results, a bar elsewhere', () => {
    expect(dockPlace('playing', false, true)).toBe('hidden');
    expect(dockPlace('countdown', false, true)).toBe('hidden');
    expect(dockPlace('paused', false, true)).toBe('tucked');
    expect(dockPlace('ended', false, true)).toBe('tucked');
    expect(dockPlace('ready', false, true)).toBe('bar');
    expect(dockPlace(null, false, true)).toBe('bar');
    expect(dockPlace(null, true, true)).toBe('hidden');     // the Quick Screen
    expect(dockPlace(null, false, false)).toBe('hidden');   // not in a party
  });
});

describe('small pieces', () => {
  it('the socket URL comes from NEXT_PUBLIC_NETD_URL', () => {
    expect(partySocketUrl('wss://fel-netd-x.run.app')).toBe('wss://fel-netd-x.run.app/party');
    expect(partySocketUrl('https://fel-netd-x.run.app/')).toBe('wss://fel-netd-x.run.app/party');
    expect(partySocketUrl('ws://localhost:8090')).toBe('ws://localhost:8090/party');
    expect(partySocketUrl('')).toBeNull();
    expect(partySocketUrl('ftp://x')).toBeNull();
    expect(partyInviteUrl('https://fel.app/', 'ABC234')).toBe('https://fel.app/party/ABC234');
  });
  it('activity lines', () => {
    expect(activityLine('threepoint', '/play/threepoint')).toBe('Playing Downtown');
    expect(activityLine('onevone', '/play/onevone')).toBe('Playing 1v1 Streetball');
    expect(activityLine(null, '/play')).toBeNull();
    expect(activityLine(null, '/play/dunk')).toBe('Picking a game');
  });
});
