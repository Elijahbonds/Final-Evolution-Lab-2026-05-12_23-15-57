// lib/party/social/client.ts — the one party connection this page holds (PARTY-CHAT lane, 2026-10-13).
//
// A MODULE SINGLETON, on purpose: the root layout's PartyDock reads it, and the App Router never unloads the layout on a
// client navigation, so the party (and its voice) carries on from page to page and into every game. A FULL reload
// starts a fresh module: the dock calls resumeStored(), which reads the stored party token (persist.ts) and rejoins as
// the same member with netd's resume secret — same seat, same host crown — within RESUME_GRACE_MS.
//
// Handshake (server/netd/src/partyServer.ts): open `/party`, send p_hello with a fresh ticket from /api/party/ticket.
// An OLD netd has no /party: it answers {t:'error', reason:'room and peer required'} (or a match `welcome`) — the page
// shows "Parties need a server update" and nothing else in the app changes.
//
// Nothing said in the party is stored or logged here; the feed is state.ts's in-memory list.

import { applyFrame, EMPTY_PARTY, inParty, type PartyState, type PartyMember } from './state';
import { partySocketUrl } from './config';
import { loadBlocks, loadStoredParty, saveBlocks, storeParty, type BlockEntry } from './persist';

export type IceServer = { urls: string[]; username?: string; credential?: string };

export interface TicketReply { ticket: string | null; adult: boolean; iceServers: IceServer[] }

/** Socket + fetch, injectable so a test can drive the client without a network. */
export interface PartyIo {
  socket(url: string): WebSocket;
  ticket(name: string): Promise<TicketReply>;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

const browserIo = (): PartyIo => ({
  socket: (url) => new WebSocket(url),
  ticket: async (name) => {
    try {
      const r = await fetch(`/api/party/ticket?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
      if (!r.ok) return { ticket: null, adult: false, iceServers: [] };
      const j = await r.json() as Partial<TicketReply>;
      return { ticket: typeof j.ticket === 'string' ? j.ticket : null, adult: j.adult === true, iceServers: Array.isArray(j.iceServers) ? j.iceServers : [] };
    } catch {
      return { ticket: null, adult: false, iceServers: [] };   // no ticket = teen rules: still a party, presets only
    }
  },
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
});

/** Reconnect waits: quick first (a blip, a reload), then patient. Gives up inside netd's resume grace. */
export const PARTY_RETRY_MS = [400, 1000, 2000, 4000, 8000, 8000];
const PING_MS = 20_000;

type Target = { create: true } | { code: string };

export class PartyClient {
  private state: PartyState;
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private target: Target | null = null;
  private resume: string | null = null;
  private name = '';
  private retries = 0;
  private gotFrame = false;
  private closedByUs = false;
  private timer: unknown = null;
  private ping: unknown = null;
  private sentBlocks = new Set<string>();
  private blocks: BlockEntry[] = [];
  private activity: string | null = null;
  iceServers: IceServer[] = [];
  /** Voice signaling frames (p_sig), for voice.ts. */
  onSignal: ((from: string, data: Record<string, unknown>) => void) | null = null;
  /** Every state change after a frame, for voice.ts to follow who is in voice. */
  onState: ((s: PartyState) => void) | null = null;

  constructor(private io: PartyIo = browserIo(), private url: string | null = partySocketUrl()) {
    this.state = { ...EMPTY_PARTY, status: url ? 'idle' : 'unavailable' };
    if (typeof window !== 'undefined') this.blocks = loadBlocks();
  }

  // ── the external store React reads (useSyncExternalStore) ──
  getState = (): PartyState => this.state;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private set(next: PartyState): void {
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach((fn) => fn());
    this.onState?.(next);
  }
  /** Patch local-only fields (a notice dismissed, a decline). */
  patch(p: Partial<PartyState>): void { this.set({ ...this.state, ...p }); }

  blockedPubs(): Set<string> { return new Set(this.blocks.map((b) => b.pub)); }
  blockList(): BlockEntry[] { return [...this.blocks]; }

  // ── joining ──
  create(name: string): void { this.open({ create: true }, name, null); }
  join(code: string, name: string): void { this.open({ code }, name, null); }

  /** After a full reload: rejoin the stored party as the same member. True when there was one to rejoin. */
  resumeStored(name: string): boolean {
    if (inParty(this.state)) return true;
    const p = loadStoredParty(this.io.now());
    if (!p) return false;
    this.open({ code: p.code }, name, p.resume);
    return true;
  }

  private open(target: Target, name: string, resume: string | null): void {
    if (!this.url) { this.set({ ...EMPTY_PARTY, status: 'unavailable' }); return; }
    this.teardown();
    this.target = target; this.name = name; this.resume = resume; this.retries = 0; this.closedByUs = false;
    this.sentBlocks.clear();
    this.set({ ...EMPTY_PARTY, status: 'connecting' });
    void this.connect();
  }

  private async connect(): Promise<void> {
    const t = await this.io.ticket(this.name);
    if (this.closedByUs || !this.target || !this.url) return;
    this.iceServers = t.iceServers;
    const ws = this.io.socket(this.url);
    this.ws = ws;
    this.gotFrame = false;
    ws.onopen = () => {
      const hello: Record<string, unknown> = { t: 'p_hello', v: 1, ticket: t.ticket, name: this.name };
      if ('create' in this.target!) hello.create = true; else hello.code = this.target!.code;
      if (this.resume) hello.resume = this.resume;
      ws.send(JSON.stringify(hello));
    };
    ws.onmessage = (ev) => {
      let f: Record<string, unknown>;
      try { f = JSON.parse(String(ev.data)); } catch { return; }
      if (!f || typeof f !== 'object') return;
      this.onFrame(ws, f);
    };
    ws.onclose = () => { if (this.ws === ws) this.onClosed(); };
    ws.onerror = () => { /* onclose follows */ };
  }

  private onFrame(ws: WebSocket, f: Record<string, unknown>): void {
    if (ws !== this.ws) return;
    const first = !this.gotFrame;
    this.gotFrame = true;
    // AN OLD NETD: no party path. Its legacy room answers with `error` ("room and peer required") or a match `welcome`.
    if (first && (f.t === 'error' || f.t === 'welcome')) {
      this.closedByUs = true;
      ws.close();
      this.ws = null;
      this.set({ ...EMPTY_PARTY, status: 'outdated', notice: 'Parties need a server update. Everything else works as usual.' });
      return;
    }
    if (f.t === 'p_sig') {
      const from = typeof f.from === 'string' ? f.from : '';
      if (from && f.data && typeof f.data === 'object') this.onSignal?.(from, f.data as Record<string, unknown>);
      return;
    }
    if (f.t === 'p_pong') return;
    if (f.t === 'p_welcome') {
      this.retries = 0;
      this.resume = typeof f.resume === 'string' ? f.resume : this.resume;
      const code = typeof f.code === 'string' ? f.code : '';
      this.target = { code };
      if (this.resume) storeParty({ code, resume: this.resume, at: this.io.now() });
      this.startPing();
    }
    const ended = f.t === 'p_refused' || f.t === 'p_kicked' || f.t === 'p_denied';
    if (ended) { this.closedByUs = true; storeParty(null); }
    this.set(applyFrame(this.state, f, this.blockedPubs(), this.io.now()));
    if (f.t === 'p_state') {
      this.syncBlocks();
      if (this.activity) this.send({ t: 'p_status', activity: this.activity });
      if (this.resume && this.state.code) storeParty({ code: this.state.code, resume: this.resume, at: this.io.now() });
    }
    if (ended) this.teardown();
  }

  private onClosed(): void {
    this.ws = null;
    this.stopPing();
    if (this.closedByUs) return;
    if (this.state.status === 'outdated') return;
    // never opened a party at all (wrong URL, server down): say so after the retries
    if (this.retries >= PARTY_RETRY_MS.length) {
      storeParty(null);
      this.set({ ...EMPTY_PARTY, status: 'ended', notice: "Can't reach the party server right now. Check your connection and try again." });
      return;
    }
    const wait = PARTY_RETRY_MS[this.retries++];
    if (inParty(this.state)) this.set({ ...this.state, status: 'reconnecting' });
    this.timer = this.io.setTimeout(() => { this.timer = null; void this.connect(); }, wait);
  }

  private startPing(): void {
    this.stopPing();
    const beat = () => { this.send({ t: 'p_ping' }); this.ping = this.io.setTimeout(beat, PING_MS); };
    this.ping = this.io.setTimeout(beat, PING_MS);
  }
  private stopPing(): void { if (this.ping) this.io.clearTimeout(this.ping); this.ping = null; }

  private teardown(): void {
    if (this.timer) this.io.clearTimeout(this.timer);
    this.timer = null;
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch { /* closing */ } }
  }

  send(msg: Record<string, unknown>): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  leave(): void {
    this.send({ t: 'p_leave' });
    this.closedByUs = true;
    storeParty(null);
    this.teardown();
    this.target = null; this.resume = null;
    this.set({ ...EMPTY_PARTY, status: this.url ? 'idle' : 'unavailable' });
  }

  /** "Back to the hub" after an ended party: clears the notice. */
  reset(): void { if (!inParty(this.state)) this.set({ ...EMPTY_PARTY, status: this.url ? 'idle' : 'unavailable' }); }

  // ── what a member does ──
  chat(text: string): boolean { return this.send({ t: 'p_chat', text }); }
  quick(id: string): boolean { return this.send({ t: 'p_quick', id }); }
  emote(id: string): boolean { return this.send({ t: 'p_emote', id }); }
  kick(peer: string): boolean { return this.send({ t: 'p_kick', peer }); }
  makeHost(peer: string): boolean { return this.send({ t: 'p_host', peer }); }
  admit(peer: string): boolean { return this.send({ t: 'p_admit', peer }); }
  deny(peer: string): boolean { return this.send({ t: 'p_deny', peer }); }
  report(peer: string, reason: string): boolean { return this.send({ t: 'p_report', peer, reason }); }
  startTogether(mode: string): boolean { return this.send({ t: 'p_start', mode }); }
  cancelStart(): boolean { return this.send({ t: 'p_start_cancel' }); }
  decline(): void {
    const s = this.state.start;
    if (!s || s.declined) return;
    this.send({ t: 'p_decline', id: s.id });
    this.set({ ...this.state, start: { ...s, declined: true } });
  }
  /** What this page is doing ("Playing Downtown"), for everyone's member list. Sent only on a change. */
  setActivity(text: string | null): void {
    if (text === this.activity) return;
    this.activity = text;
    if (this.state.status === 'live') this.send({ t: 'p_status', activity: text });
  }

  /** Block: the server stops their lines and voice reaching you, this page hides them, and it is remembered. */
  block(m: Pick<PartyMember, 'pub' | 'name'>): void {
    if (!m.pub || this.blocks.some((b) => b.pub === m.pub)) return;
    this.blocks = [...this.blocks, { pub: m.pub, name: m.name }];
    saveBlocks(this.blocks);
    this.send({ t: 'p_block', pub: m.pub });
    this.sentBlocks.add(m.pub);
    // their lines already on screen go too
    const peers = new Set(this.state.members.filter((x) => x.pub === m.pub).map((x) => x.peer));
    this.set({ ...this.state, feed: this.state.feed.filter((f) => !f.from || !peers.has(f.from)) });
  }
  unblock(pub: string): void {
    this.blocks = this.blocks.filter((b) => b.pub !== pub);
    saveBlocks(this.blocks);
    this.sentBlocks.delete(pub);
    this.send({ t: 'p_unblock', pub });
    this.listeners.forEach((fn) => fn());
  }
  /** A remembered block reaches the server again whenever that person is in the party (a new party, a resume). */
  private syncBlocks(): void {
    const blocked = this.blockedPubs();
    for (const m of this.state.members) {
      if (m.peer !== this.state.you && blocked.has(m.pub) && !this.sentBlocks.has(m.pub)) {
        if (this.send({ t: 'p_block', pub: m.pub })) this.sentBlocks.add(m.pub);
      }
    }
  }
}

let singleton: PartyClient | null = null;
/** The page's one party connection (created on first use, in the browser only). */
export function partyClient(): PartyClient {
  if (!singleton) singleton = new PartyClient();
  return singleton;
}
/** Tests only: replace the singleton. */
export function __setPartyClient(c: PartyClient | null): void { singleton = c; }
