// lane/online-play: the match transport — a final refusal ends it, a reap re-joins, the round trip is a median.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NetdTransport, smoothRtt, FINAL_REFUSALS, type NetStatus } from '../../lib/net/NetdTransport';

class FakeWs {
  static OPEN = 1; static all: FakeWs[] = [];
  readyState = 0; sent: string[] = []; closed = false;
  onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(public url: string) { FakeWs.all.push(this); }
  send(d: string) { this.sent.push(d); }
  close() { if (this.closed) return; this.closed = true; this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  frame(f: unknown) { this.onmessage?.({ data: JSON.stringify(f) }); }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); FakeWs.all = []; });

function make() {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeWs);
  const st: NetStatus[] = [];
  const t = new NetdTransport({ url: 'ws://x', roomId: 'r', peerId: 'foe', mode: 'onevone', onStatus: (s) => st.push(s) });
  const ws = FakeWs.all[0]; ws.open();
  return { t, st, ws };
}

describe('NetdTransport', () => {
  it('"full" is final: one refusal, no retry', () => {
    const { st, ws } = make();
    ws.frame({ t: 'error', reason: 'full' }); ws.close();
    vi.advanceTimersByTime(30_000);
    expect(FakeWs.all).toHaveLength(1);
    expect(st.some((s) => s.kind === 'refused')).toBe(true);
    expect(FINAL_REFUSALS.has('duplicate')).toBe(false);   // a reconnect racing its old socket keeps retrying
  });
  it('netd dropping THIS page (its reaper) while the socket is open: it joins again', () => {
    const { t, st, ws } = make();
    ws.frame({ t: 'welcome', isAuthority: false, peers: ['h1'] });
    ws.frame({ t: 'peer_leave', peer: 'foe', authority: 'h1', authorityChanged: false });
    expect(ws.closed).toBe(true);
    expect(st.filter((s) => s.kind === 'peer_leave')).toHaveLength(0);   // not reported as someone leaving
    vi.advanceTimersByTime(300);
    expect(FakeWs.all).toHaveLength(2);
    expect(t.rejoins).toBe(1);
  });
  it('another peer leaving is just reported', () => {
    const { st, ws } = make();
    ws.frame({ t: 'peer_leave', peer: 'h1', authority: 'foe', authorityChanged: true });
    expect(ws.closed).toBe(false);
    expect(st.at(-1)).toMatchObject({ kind: 'peer_leave', peer: 'h1' });
  });
  it('pings netd on open and reads the round trip as a median', () => {
    const { ws, t } = make();
    expect(JSON.parse(ws.sent[0]).t).toBe('ping');
    ws.frame({ t: 'pong', sent: Date.now() - 40 });
    expect(t.rttMs).toBe(40);
    expect(smoothRtt([10, 500, 20])).toBe(20);
  });
});
