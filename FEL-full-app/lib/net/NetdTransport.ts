// FEL NETPLAY — WebSocket transport (2026-09-12).
//
// Implements the 3-method Transport the netcode core declares, over fel-netd (server/netd).
// The netcode never imports this: it takes a Transport, so a test can hand it a fake and a future
// migration can hand it something else entirely.

import { isNetMsg, type NetMsg, type Transport } from './protocol';

export interface NetdOptions {
  /** wss://fel-netd-xxxx.run.app — no trailing slash. */
  url: string;
  roomId: string;
  peerId: string;
  mode: string;
  /** Called on every connection state change, for HUD/lobby. */
  onStatus?: (s: NetStatus) => void;
}

export type NetStatus =
  | { kind: 'connecting' }
  | { kind: 'open'; isAuthority: boolean; peers: string[] }
  | { kind: 'peer_join'; peer: string; authority: string | null }
  | { kind: 'peer_leave'; peer: string; authority: string | null; authorityChanged: boolean }
  | { kind: 'closed'; willRetry: boolean }
  | { kind: 'error'; reason: string };

/** Backoff between reconnects: quick at first (a flaky moment), then patient (a dead server). */
const RETRY_MS = [250, 500, 1000, 2000, 5000, 10_000];

export class NetdTransport implements Transport {
  private ws: WebSocket | null = null;
  private handler: ((m: NetMsg) => void) | null = null;
  private retries = 0;
  private closedByUs = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Queued while the socket is down, so a reconnect does not lose the tick that triggered it. */
  private pending: NetMsg[] = [];

  constructor(private opts: NetdOptions) { this.open(); }

  private open(): void {
    this.opts.onStatus?.({ kind: 'connecting' });
    const u = new URL(this.opts.url);
    u.searchParams.set('room', this.opts.roomId);
    u.searchParams.set('peer', this.opts.peerId);
    u.searchParams.set('mode', this.opts.mode);
    const ws = new WebSocket(u.toString());
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      // flush anything that piled up while we were down, oldest first
      for (const m of this.pending.splice(0)) this.rawSend(m);
    };

    ws.onmessage = (ev) => {
      let msg: unknown;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      const t = (msg as { t?: string }).t;
      if (t === 'welcome') {
        const w = msg as { isAuthority: boolean; peers: string[] };
        this.opts.onStatus?.({ kind: 'open', isAuthority: w.isAuthority, peers: w.peers });
        return;
      }
      if (t === 'peer_join') { const m = msg as { peer: string; authority: string | null }; this.opts.onStatus?.({ kind: 'peer_join', peer: m.peer, authority: m.authority }); return; }
      if (t === 'peer_leave') { const m = msg as { peer: string; authority: string | null; authorityChanged: boolean }; this.opts.onStatus?.({ kind: 'peer_leave', peer: m.peer, authority: m.authority, authorityChanged: !!m.authorityChanged }); return; }
      if (t === 'error') { this.opts.onStatus?.({ kind: 'error', reason: String((msg as { reason?: string }).reason ?? 'unknown') }); return; }
      if (t === 'pong') return;
      if (isNetMsg(msg)) this.handler?.(msg);
    };

    ws.onclose = () => {
      const willRetry = !this.closedByUs;
      this.opts.onStatus?.({ kind: 'closed', willRetry });
      if (willRetry) this.scheduleRetry();
    };
    ws.onerror = () => { /* onclose always follows; retry is handled there */ };
  }

  private scheduleRetry(): void {
    const wait = RETRY_MS[Math.min(this.retries, RETRY_MS.length - 1)];
    this.retries++;
    this.timer = setTimeout(() => this.open(), wait);
  }

  private rawSend(msg: NetMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else this.queue(msg);
  }

  /** Bounded: a long outage must not grow an unbounded backlog that then floods the server. */
  private queue(msg: NetMsg): void {
    this.pending.push(msg);
    if (this.pending.length > 120) this.pending.splice(0, this.pending.length - 120);
  }

  send(msg: NetMsg): void { this.rawSend(msg); }
  onMessage(handler: (m: NetMsg) => void): void { this.handler = handler; }

  close(): void {
    this.closedByUs = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }
}

/** Retry schedule, exported so the reconnect policy is testable without a socket. */
export const RETRY_SCHEDULE = RETRY_MS;
