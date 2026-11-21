// lane/online-play: the page against a party2 netd (six-seat 3v3, winners stay on) and against the party1 one deployed before it.
import { describe, it, expect, beforeEach } from 'vitest';
import { PartyClient, type PartyIo } from '@/lib/party/social/client';
import { applyFrame, EMPTY_PARTY } from '@/lib/party/social/state';

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
}
const storage = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }; };
const io = (): PartyIo => ({
  socket: (url) => new FakeSocket(url) as unknown as WebSocket,
  ticket: async () => ({ ticket: 'tkt', adult: true, iceServers: [] }),
  now: () => 1_000_000, setTimeout: () => 0, clearTimeout: () => {},
});
const flush = () => new Promise((r) => setTimeout(r, 0));
const last = () => FakeSocket.all[FakeSocket.all.length - 1];
const members = ['m1', 'm2', 'm3'].map((peer, i) => ({ peer, name: ['ANA', 'BO', 'CY'][i], pub: `p${i}`, host: i === 0 }));

async function joined(features?: string[]) {
  const c = new PartyClient(io(), 'ws://x/party');
  c.join('ABC234', 'ANA');
  await flush();
  const ws = last();
  ws.open();
  ws.frame({ t: 'p_welcome', v: 1, code: 'ABC234', you: 'm1', resume: 'r', rights: { text: true, voice: true }, ...(features ? { features } : {}) });
  ws.frame({ t: 'p_state', code: 'ABC234', you: 'm1', host: 'm1', members, me: { text: true, voice: true } });
  return { c, ws };
}

beforeEach(() => {
  FakeSocket.all = [];
  (globalThis as { window?: unknown }).window = { sessionStorage: storage(), localStorage: storage() };
});

describe('what the server speaks', () => {
  it('a party2 server: features read, "Start together" sends the run\'s order', async () => {
    const { c, ws } = await joined(['party1', 'party2']);
    expect(c.supports('party2')).toBe(true);
    c.startTogether('onevone');
    expect(ws.sent.at(-1)).toEqual({ t: 'p_start', mode: 'onevone', order: ['m1', 'm2'] });
  });
  it('a party1 server (no features): the old p_start exactly, no order', async () => {
    const { c, ws } = await joined();
    expect(c.supports('party2')).toBe(false);
    c.startTogether('threevthree');
    expect(ws.sent.at(-1)).toEqual({ t: 'p_start', mode: 'threevthree' });
  });
  it('winners stay on switched off: no order either', async () => {
    const { c, ws } = await joined(['party1', 'party2']);
    c.runOn = false;
    c.startTogether('onevone');
    expect(ws.sent.at(-1)).toEqual({ t: 'p_start', mode: 'onevone' });
  });
});

describe('the result comes back, and the court\'s line moves', () => {
  it('a game this page started together ends: the winning seats go to netd; netd\'s p_result moves the run', async () => {
    const { c, ws } = await joined(['party1', 'party2']);
    ws.frame({ t: 'p_start', id: 's1', mode: 'onevone', title: '1v1', path: '/play/onevone', room: 'pt-ABC234-x', inMs: 5000, seat: 'h9' });
    c.reportResult({ room: 'pt-ABC234-x', winners: ['foe'], score: [11, 4] });
    expect(ws.sent.at(-1)).toEqual({ t: 'p_result', room: 'pt-ABC234-x', winners: ['foe'], score: [11, 4] });
    c.reportResult({ room: 'pt-other', winners: ['h9'] });   // another game's: ignored
    expect(ws.sent.at(-1)).toMatchObject({ room: 'pt-ABC234-x' });
    ws.frame({ t: 'p_result', id: 's1', mode: 'onevone', winners: ['m2'], losers: ['m1'], score: [11, 4] });
    expect(c.getState().lastResult).toMatchObject({ winners: ['m2'], losers: ['m1'], score: [11, 4] });
    expect(c.getState().feed.at(-1)?.text).toBe('BO won 11–4');
    // BO holds the court; CY is next up; ANA (the loser) is at the back
    expect(c.nextUp('onevone')).toMatchObject({ home: ['m2'], away: ['m3'], sitting: ['m1'] });
    c.startTogether('onevone');
    expect(ws.sent.at(-1)).toEqual({ t: 'p_start', mode: 'onevone', order: ['m2', 'm3'] });
  });
  it('a party1 server never gets a p_result', async () => {
    const { c, ws } = await joined();
    ws.frame({ t: 'p_start', id: 's1', mode: 'onevone', title: '1v1', path: '/play/onevone', room: 'pt-x', inMs: 5000, seat: 'h9' });
    const n = ws.sent.length;
    c.reportResult({ room: 'pt-x', winners: ['h9'] });
    expect(ws.sent.length).toBe(n);
  });
  it('applyFrame bounds a p_result (ids only, at most six)', () => {
    const s = applyFrame(EMPTY_PARTY, { t: 'p_result', id: 'x', mode: 'onevone', winners: ['ok', '<script>', 7], losers: Array(20).fill('a'), score: [1, 'x'] }, new Set(), 0);
    expect(s.lastResult).toMatchObject({ winners: ['ok'], score: null });
    expect(s.lastResult!.losers.length).toBeLessThanOrEqual(6);
  });
});
