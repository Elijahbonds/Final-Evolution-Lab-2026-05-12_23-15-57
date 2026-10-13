// fel-netd — the party's socket shell (PARTY-CHAT lane, 2026-10-13).
//
// Moves bytes for party.ts and owns the clock, nothing else. The handshake is a FIRST MESSAGE, not URL parameters, so
// the signed ticket (which carries an account id) never lands in a request log:
//
//   client → wss://netd/party         (an old netd answers {t:'error', reason:'room and peer required'} and closes)
//   client → {t:'p_hello', v:1, create:true | code:'ABC234', ticket, resume, name}
//   server → {t:'p_welcome', v:1, code, you, resume, resumed, rights}  then  p_state / p_wait …
//          | {t:'p_refused', reason: 'full' | 'banned' | 'door_full' | 'not_found' | 'busy' | 'bad_hello'}
//
// Messages are relayed and forgotten: nothing a member says is written anywhere, logged, or kept for a late joiner.
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocket } from 'ws';
import {
  createParty, connect, disconnect, handle, sweep, isPartyCollectable, type Party, type Effects, type PartyEnv,
} from './party.js';
import { PARTY_CODE_ALPHABET, PARTY_CODE_LEN, PARTY_FRAME_MAX_BYTES, parsePartyCode } from './partyRules.js';
import { verifyTicket, sealSlip } from './ticket.js';

/** A bound on memory: one instance holds every party in RAM (README: single-instance state). */
const MAX_PARTIES = 5000;
const HELLO_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 15_000;

const parties = new Map<string, Party>();
const byPeer = new Map<string, WebSocket>();   // `${code}:${peer}` → socket
const whoIs = new Map<WebSocket, { code: string; peer: string }>();
const alive = new WeakSet<WebSocket>();

const rand = (): string => randomBytes(6).toString('base64url');
const secret = (): string | undefined => process.env.PARTY_TICKET_SECRET || undefined;
const env = (): PartyEnv => {
  const s = secret();
  return { seal: s ? (slip) => sealSlip(slip, s) : null };
};

function newCode(): string {
  for (let i = 0; i < 20; i++) {
    let c = '';
    for (let j = 0; j < PARTY_CODE_LEN; j++) c += PARTY_CODE_ALPHABET[randomInt(PARTY_CODE_ALPHABET.length)];
    if (!parties.has(c)) return c;
  }
  return '';
}

const send = (ws: WebSocket | undefined, msg: unknown): void => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};

function apply(code: string, fx: Effects): void {
  for (const o of fx.out) for (const peer of o.to) send(byPeer.get(`${code}:${peer}`), o.msg);
  for (const peer of fx.close) {
    const ws = byPeer.get(`${code}:${peer}`);
    byPeer.delete(`${code}:${peer}`);
    if (ws) { whoIs.delete(ws); ws.close(1000, 'party'); }
  }
}

export function partyHealth(): { parties: number; features: string[] } {
  return { parties: parties.size, features: ['party1'] };
}

export function acceptParty(ws: WebSocket): void {
  alive.add(ws);
  ws.on('pong', () => alive.add(ws));
  const helloTimer = setTimeout(() => { if (!whoIs.has(ws)) ws.close(1008, 'hello'); }, HELLO_TIMEOUT_MS);

  ws.on('message', (raw) => {
    const text = String(raw);
    if (text.length > PARTY_FRAME_MAX_BYTES) return;   // dropped, never fatal
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const now = Date.now();
    const who = whoIs.get(ws);

    if (!who) {
      if (msg.t !== 'p_hello') return;
      clearTimeout(helloTimer);
      hello(ws, msg, now);
      return;
    }
    if (msg.t === 'p_ping') { send(ws, { t: 'p_pong', at: now }); return; }
    const p = parties.get(who.code);
    if (!p) return;
    apply(p.code, handle(p, who.peer, msg, now, rand, env()));
  });

  const goodbye = () => {
    clearTimeout(helloTimer);
    const who = whoIs.get(ws);
    whoIs.delete(ws);
    if (!who) return;
    // a socket replaced by a resume must not take its member down with it
    if (byPeer.get(`${who.code}:${who.peer}`) !== ws) return;
    byPeer.delete(`${who.code}:${who.peer}`);
    const p = parties.get(who.code);
    if (p) apply(p.code, disconnect(p, who.peer, Date.now()));
  };
  ws.on('close', goodbye);
  ws.on('error', goodbye);
}

function hello(ws: WebSocket, msg: Record<string, unknown>, now: number): void {
  const refuse = (reason: string) => { send(ws, { t: 'p_refused', reason }); ws.close(1000, 'refused'); };
  if (msg.v !== 1) { refuse('bad_hello'); return; }
  let p: Party | undefined;
  if (msg.create === true) {
    if (parties.size >= MAX_PARTIES) { refuse('busy'); return; }
    const code = newCode();
    if (!code) { refuse('busy'); return; }
    p = createParty(code, now);
    parties.set(code, p);
  } else {
    const code = parsePartyCode(msg.code);
    p = code ? parties.get(code) : undefined;
    if (!p) { refuse('not_found'); return; }
  }
  // NO VALID TICKET = TEEN RULES. The claims come from the signature, never from the hello itself.
  const claims = verifyTicket(msg.ticket, secret(), now);
  const res = connect(p, {
    claims: claims ? { uid: claims.uid, pub: claims.pub, name: claims.name, adult: claims.adult } : null,
    guestName: typeof msg.name === 'string' ? msg.name : undefined,
    resume: typeof msg.resume === 'string' ? msg.resume.slice(0, 64) : null,
  }, now, rand);
  if (!res.ok) {
    if (p.members.size === 0) parties.delete(p.code);
    refuse(res.reason);
    return;
  }
  const key = `${p.code}:${res.member.peer}`;
  const old = byPeer.get(key);
  if (old && old !== ws) { whoIs.delete(old); old.close(1000, 'resumed'); }
  byPeer.set(key, ws);
  whoIs.set(ws, { code: p.code, peer: res.member.peer });
  send(ws, {
    t: 'p_welcome', v: 1, code: p.code, you: res.member.peer, resume: res.member.resume, resumed: res.resumed,
    rights: { text: res.member.adult, voice: res.member.adult },
  });
  apply(p.code, res.effects);
}

/** Grace expiries, stale knocks, empty parties, dead sockets. Called from index.ts's reaper. */
let lastBeat = 0;
export function sweepParties(now: number): void {
  for (const p of [...parties.values()]) {
    apply(p.code, sweep(p, now));
    if (isPartyCollectable(p, now)) parties.delete(p.code);
  }
  if (now - lastBeat < HEARTBEAT_MS) return;
  lastBeat = now;
  for (const ws of whoIs.keys()) {
    if (!alive.has(ws)) { ws.terminate(); continue; }
    alive.delete(ws);
    try { ws.ping(); } catch { /* closing */ }
  }
}
