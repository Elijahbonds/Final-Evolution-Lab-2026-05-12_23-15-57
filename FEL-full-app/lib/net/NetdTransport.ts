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
  | { kind: 'open'; isAuthority: boolean; peers: string[]; authority?: string | null }
  | { kind: 'peer_join'; peer: string; authority: string | null }
  | { kind: 'peer_leave'; peer: string; authority: string | null; authorityChanged: boolean }
  | { kind: 'closed'; willRetry: boolean }
  | { kind: 'error'; reason: string }
  /** lane/online-play: netd turned this page away for good (the room is full): no more retries. */
  | { kind: 'refused'; reason: string }
  /** lane/online-play: a round trip to netd measured (every PING_EVERY_MS). */
  | { kind: 'rtt'; rttMs: number; jitterMs: number };

/** Backoff between reconnects: quick at first (a flaky moment), then patient (a dead server). */
const RETRY_MS = [250, 500, 1000, 2000, 5000, 10_000];
/** lane/online-play: netd answers {t:'ping'} with {t:'pong', sent} (every build, the one deployed today too). */
export const PING_EVERY_MS = 2000;
/** Refusals that end the attempt: retrying cannot help ("duplicate" can: the old socket of a reconnect is still being
 *  dropped server-side, so that one keeps retrying, as before). Measured before this lane: a seventh peer refused "full"
 *  reconnected every few seconds for as long as the page stayed open (scripts/probes/online-play/match-room.mts D). */
export const FINAL_REFUSALS = new Set(['full']);

export class NetdTransport implements Transport {
  private ws: WebSocket | null = null;
  private handler: ((m: NetMsg) => void) | null = null;
  private retries = 0;
  private closedByUs = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Queued while the socket is down, so a reconnect does not lose the tick that triggered it. */
  private pending: NetMsg[] = [];
  private pinger: ReturnType<typeof setInterval> | null = null;
  private rtts: number[] = [];
  /** The latest smoothed round trip to netd, ms (null before the first pong). */
  rttMs: number | null = null;
  /** Spread of the last round trips, ms. */
  jitterMs = 0;

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
      this.startPing(ws);
    };

    ws.onmessage = (ev) => {
      let msg: unknown;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      const t = (msg as { t?: string }).t;
      if (t === 'welcome') {
        const w = msg as { isAuthority: boolean; peers: string[]; authority?: string | null };
        this.opts.onStatus?.({ kind: 'open', isAuthority: w.isAuthority, peers: w.peers, authority: w.authority ?? null });
        return;
      }
      if (t === 'peer_join') { const m = msg as { peer: string; authority: string | null }; this.opts.onStatus?.({ kind: 'peer_join', peer: m.peer, authority: m.authority }); return; }
      if (t === 'peer_leave') { const m = msg as { peer: string; authority: string | null; authorityChanged: boolean }; this.opts.onStatus?.({ kind: 'peer_leave', peer: m.peer, authority: m.authority, authorityChanged: !!m.authorityChanged }); return; }
      if (t === 'error') {
        const reason = String((msg as { reason?: string }).reason ?? 'unknown');
        this.opts.onStatus?.({ kind: 'error', reason });
        if (FINAL_REFUSALS.has(reason)) { this.closedByUs = true; this.opts.onStatus?.({ kind: 'refused', reason }); }
        return;
      }
      if (t === 'pong') { this.onPong(msg as { sent?: unknown }); return; }
      if (isNetMsg(msg)) this.handler?.(msg);
    };

    ws.onclose = () => {
      this.stopPing();
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

  private startPing(ws: WebSocket): void {
    this.stopPing();
    const ping = () => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'ping', sent: Date.now() })); };
    ping();
    this.pinger = setInterval(ping, PING_EVERY_MS);
  }
  private stopPing(): void { if (this.pinger) clearInterval(this.pinger); this.pinger = null; }
  private onPong(m: { sent?: unknown }): void {
    if (typeof m.sent !== 'number') return;
    const rtt = Math.max(0, Date.now() - m.sent);
    this.rtts.push(rtt); if (this.rtts.length > 8) this.rtts.shift();
    this.rttMs = smoothRtt(this.rtts);
    this.jitterMs = Math.max(...this.rtts) - Math.min(...this.rtts);
    this.opts.onStatus?.({ kind: 'rtt', rttMs: this.rttMs, jitterMs: this.jitterMs });
  }

  send(msg: NetMsg): void { this.rawSend(msg); }
  onMessage(handler: (m: NetMsg) => void): void { this.handler = handler; }

  close(): void {
    this.closedByUs = true;
    this.stopPing();
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }
}

/** Retry schedule, exported so the reconnect policy is testable without a socket. */
export const RETRY_SCHEDULE = RETRY_MS;

/** The round trip a HUD shows: the median of the last few (one slow pong is not the connection). */
export function smoothRtt(samples: number[]): number {
  if (!samples.length) return 0;
  const s = [...samples].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)]);
}
