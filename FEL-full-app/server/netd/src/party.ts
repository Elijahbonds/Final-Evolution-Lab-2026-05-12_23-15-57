// fel-netd — the PSN-style party, as a pure state machine (PARTY-CHAT lane, 2026-10-13).
//
// No sockets, no timers, no randomness of its own (the caller passes `rand`): index.ts moves bytes, this decides. Every
// rule the owner set for a party is enforced HERE, server-side, and unit-tested without opening a port
// (tests/party-chat/netd-party.test.ts):
//
//   - up to PARTY_MAX (6, netd MAX_PLAYERS) people, counting anyone waiting at the door;
//   - the server names every member (peer ids are assigned here, never chosen by a client) and stamps every relayed
//     message with the sender, so nobody can speak as somebody else;
//   - the host is the first in; when the host leaves (or their grace runs out) the longest-present member takes over —
//     the party outlives anyone's browser, like a netd room;
//   - only the host kicks, transfers the crown, lets people in, and starts a game; a kicked account cannot come back to
//     that party;
//   - TEENS (no valid adult ticket: under 18, unknown age, a guest): presets and emotes only, never free text, never
//     voice — refused here, not hidden in a client; and a party with a teen in it is INVITE-ONLY: a new arrival knocks
//     and the host lets them in (owner: "friends-only (invited) parties");
//   - rate limits per member per kind (partyRules RATE);
//   - nothing is stored: chat is relayed and forgotten. There is no history to hand a late joiner.
//
// Owner decisions: PSN-style party (2026-10-09), in the lane brief.

import {
  PARTY_MAX, RESUME_GRACE_MS, KNOCK_MAX, KNOCK_TTL_MS, START_COUNTDOWN_MS,
  cleanPartyName, cleanChatText, quickLine, emoteById, onlineMode, takeToken, freshBucket,
  type Bucket, type RateKind,
} from './partyRules.js';

export interface Claims { uid: string | null; pub: string; name: string; adult: boolean }

export interface Member {
  peer: string;
  /** The secret a reconnecting page presents to take this place back. Only ever sent to this member. */
  resume: string;
  uid: string | null;
  pub: string;
  name: string;
  adult: boolean;
  /** Join order: 1, 2, 3… Host transfer and "Start together" seats follow it. */
  seq: number;
  connected: boolean;
  goneAt: number | null;
  /** False while knocking at an invite-only party. */
  admitted: boolean;
  knockAt: number | null;
  voice: boolean;
  muted: boolean;
  deafened: boolean;
  /** "Playing Downtown", or null in the menus. Short, from the client, cleaned. */
  activity: string | null;
  /** Pubs this member blocked: the server stops relaying their chat to this member, and any voice between them. */
  blocks: Set<string>;
  buckets: Partial<Record<RateKind, Bucket>>;
}

export interface StartPlan {
  id: string;
  mode: string;
  room: string;
  at: number;
  /** peer → the peer id this member joins the match under (null = sitting this one out: the mode is full). */
  seats: Map<string, string | null>;
  declined: Set<string>;
}

export interface Party {
  code: string;
  createdAt: number;
  host: string | null;
  members: Map<string, Member>;
  /** Pubs the host kicked: that account cannot rejoin this party. */
  banned: Set<string>;
  seq: number;
  start: StartPlan | null;
  emptySince: number | null;
}

/** A frame to send: to these peers. */
export interface Out { to: string[]; msg: Record<string, unknown> }
export interface Effects { out: Out[]; close: string[] }

const none = (): Effects => ({ out: [], close: [] });

export function createParty(code: string, now: number): Party {
  return { code, createdAt: now, host: null, members: new Map(), banned: new Set(), seq: 0, start: null, emptySince: now };
}

const admitted = (p: Party): Member[] => [...p.members.values()].filter((m) => m.admitted);
const knocking = (p: Party): Member[] => [...p.members.values()].filter((m) => !m.admitted);
const live = (p: Party): Member[] => admitted(p).filter((m) => m.connected);

/** A party with a teen in it lets nobody in without the host. */
export function inviteOnly(p: Party): boolean {
  return admitted(p).some((m) => !m.adult);
}

/** What this member may do. Derived from the ticket, never from anything the client sends. */
export function rights(m: Pick<Member, 'adult'>): { text: boolean; voice: boolean } {
  return { text: m.adult, voice: m.adult };
}

// ── the view each member is sent ──────────────────────────────────────────────────────────────────────────────────

export function stateFor(p: Party, peer: string): Record<string, unknown> {
  const me = p.members.get(peer);
  if (!me) return { t: 'p_gone' };
  if (!me.admitted) return { t: 'p_wait', code: p.code, you: peer, name: me.name };
  const isHost = p.host === peer;
  return {
    t: 'p_state',
    code: p.code,
    you: peer,
    host: p.host,
    inviteOnly: inviteOnly(p),
    // NO age of anyone else is sent: only what THIS member may do
    me: { name: me.name, pub: me.pub, ...rights(me) },
    members: admitted(p).sort((a, b) => a.seq - b.seq).map((m) => ({
      peer: m.peer, name: m.name, pub: m.pub, host: m.peer === p.host, connected: m.connected,
      voice: m.voice, muted: m.muted, deafened: m.deafened, activity: m.activity,
    })),
    knocking: isHost ? knocking(p).map((m) => ({ peer: m.peer, name: m.name })) : [],
    max: PARTY_MAX,
  };
}

/** Everyone's view, as frames. */
export function broadcastState(p: Party): Out[] {
  return [...p.members.values()].filter((m) => m.connected).map((m) => ({ to: [m.peer], msg: stateFor(p, m.peer) }));
}

// ── joining and leaving ───────────────────────────────────────────────────────────────────────────────────────────

export type ConnectResult =
  | { ok: true; member: Member; resumed: boolean; effects: Effects }
  | { ok: false; reason: 'full' | 'banned' | 'door_full' | 'not_found' };

export interface ConnectArgs {
  /** Verified ticket claims, or null (guest / unknown age / bad ticket: teen rules). */
  claims: Claims | null;
  /** A guest's typed name (ignored when a ticket names the person). */
  guestName?: string;
  /** A resume secret from an earlier connection. */
  resume?: string | null;
}

export function connect(p: Party, a: ConnectArgs, now: number, rand: () => string): ConnectResult {
  // 1. TAKE A PLACE BACK: a reload, a network switch. Same member, same host crown.
  if (a.resume) {
    const back = [...p.members.values()].find((m) => m.resume === a.resume);
    if (back) {
      back.connected = true; back.goneAt = null;
      // the ticket may have been refreshed since: an age or a name can only come from it
      if (a.claims && a.claims.pub === back.pub) { back.adult = a.claims.adult; back.name = cleanPartyName(a.claims.name) || back.name; }
      if (!rights(back).voice) back.voice = false;
      p.emptySince = null;
      return { ok: true, member: back, resumed: true, effects: { out: broadcastState(p), close: [] } };
    }
  }
  const pub = a.claims?.pub ?? `g${rand()}`;
  if (p.banned.has(pub)) return { ok: false, reason: 'banned' };
  if (p.members.size >= PARTY_MAX) return { ok: false, reason: 'full' };
  const adult = a.claims?.adult === true;
  const first = admitted(p).length === 0;
  const mustKnock = !first && (!adult || inviteOnly(p));
  if (mustKnock && knocking(p).length >= KNOCK_MAX) return { ok: false, reason: 'door_full' };
  const m: Member = {
    peer: `m${rand()}`, resume: `${rand()}${rand()}${rand()}`, uid: a.claims?.uid ?? null, pub,
    name: cleanPartyName(a.claims?.name || a.guestName) || 'PLAYER', adult,
    seq: ++p.seq, connected: true, goneAt: null, admitted: !mustKnock, knockAt: mustKnock ? now : null,
    voice: false, muted: false, deafened: false, activity: null, blocks: new Set(), buckets: {},
  };
  p.members.set(m.peer, m);
  p.emptySince = null;
  if (first) p.host = m.peer;
  return { ok: true, member: m, resumed: false, effects: { out: broadcastState(p), close: [] } };
}

/** The longest-present admitted member, preferring someone whose page is connected. */
function nextHost(p: Party, except: string): string | null {
  const pool = admitted(p).filter((m) => m.peer !== except).sort((a, b) => a.seq - b.seq);
  return (pool.find((m) => m.connected) ?? pool[0])?.peer ?? null;
}

/** Take a member out for good (leave, kick, grace expired). Hands the crown on when it was theirs. */
export function remove(p: Party, peer: string, now: number): Effects {
  const m = p.members.get(peer);
  if (!m) return none();
  if (p.host === peer) p.host = nextHost(p, peer);
  p.members.delete(peer);
  if (p.start) p.start.seats.delete(peer);
  const fx: Effects = { out: [], close: [] };
  // a voice peer leaving: everyone tears down that connection now, not when ICE notices
  fx.out.push({ to: live(p).map((x) => x.peer), msg: { t: 'p_left', peer, name: m.name } });
  if (p.members.size === 0) p.emptySince = now;
  fx.out.push(...broadcastState(p));
  return fx;
}

/** The socket went away. The place is kept for RESUME_GRACE_MS (a knock is simply dropped). */
export function disconnect(p: Party, peer: string, now: number): Effects {
  const m = p.members.get(peer);
  if (!m) return none();
  if (!m.admitted) { p.members.delete(peer); return { out: broadcastState(p), close: [] }; }
  m.connected = false; m.goneAt = now; m.voice = false;
  return { out: broadcastState(p), close: [] };
}

/** Grace expiries and stale knocks. Run on a timer. */
export function sweep(p: Party, now: number): Effects {
  const fx: Effects = { out: [], close: [] };
  for (const m of [...p.members.values()]) {
    if (!m.admitted && m.knockAt !== null && now - m.knockAt > KNOCK_TTL_MS) {
      p.members.delete(m.peer);
      fx.out.push({ to: [m.peer], msg: { t: 'p_denied', reason: 'timeout' } });
      fx.close.push(m.peer);
      fx.out.push(...broadcastState(p));
      continue;
    }
    if (!m.connected && m.goneAt !== null && now - m.goneAt > RESUME_GRACE_MS) {
      const r = remove(p, m.peer, now);
      fx.out.push(...r.out);
    }
  }
  return fx;
}

/** Empty for longer than a reload takes: the party is over. */
export function isPartyCollectable(p: Party, now: number): boolean {
  return p.members.size === 0 && p.emptySince !== null && now - p.emptySince > RESUME_GRACE_MS;
}

// ── messages from a member ────────────────────────────────────────────────────────────────────────────────────────

const err = (peer: string, code: string, extra?: Record<string, unknown>): Effects =>
  ({ out: [{ to: [peer], msg: { t: 'p_error', code, ...extra } }], close: [] });

function limited(m: Member, kind: RateKind, now: number): boolean {
  const b = (m.buckets[kind] ??= freshBucket(kind, now));
  return !takeToken(b, kind, now);
}

/** Admitted, connected members who have not blocked `from` (and whom `from` has not blocked). */
function audience(p: Party, from: Member, filter?: (m: Member) => boolean): string[] {
  return live(p)
    .filter((m) => m.peer !== from.peer && !m.blocks.has(from.pub) && !from.blocks.has(m.pub))
    .filter((m) => (filter ? filter(m) : true))
    .map((m) => m.peer);
}

const ACTIVITY_MAX = 40;
const cleanActivity = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, ACTIVITY_MAX);
  return s || null;
};

/**
 * One frame from `peer`. `msg` is untrusted JSON. Returns what to send and whom to disconnect. Anything unknown,
 * malformed, not allowed or over a rate limit is answered with a p_error to the sender only, and nothing is relayed.
 */
export function handle(p: Party, peer: string, msg: Record<string, unknown>, now: number, rand: () => string, env: PartyEnv = { seal: null }): Effects {
  const me = p.members.get(peer);
  if (!me || !me.connected) return none();
  const t = msg.t;
  // a knocking member can only leave
  if (!me.admitted && t !== 'p_leave') return err(peer, 'waiting');
  const isHost = p.host === peer;

  switch (t) {
    case 'p_leave': {
      const fx = remove(p, peer, now);
      fx.close.push(peer);
      return fx;
    }

    // ── host controls ──
    case 'p_kick': case 'p_host': case 'p_admit': case 'p_deny': {
      if (!isHost) return err(peer, 'host_only');
      if (limited(me, 'control', now)) return err(peer, 'slow_down');
      const target = typeof msg.peer === 'string' ? p.members.get(msg.peer) : undefined;
      if (!target || target.peer === peer) return err(peer, 'no_such_member');
      if (t === 'p_kick') {
        if (!target.admitted) return err(peer, 'no_such_member');
        p.banned.add(target.pub);
        const fx = remove(p, target.peer, now);
        fx.out.unshift({ to: [target.peer], msg: { t: 'p_kicked' } });
        fx.close.push(target.peer);
        return fx;
      }
      if (t === 'p_host') {
        if (!target.admitted) return err(peer, 'no_such_member');
        p.host = target.peer;
        return { out: broadcastState(p), close: [] };
      }
      if (t === 'p_admit') {
        if (target.admitted) return err(peer, 'no_such_member');
        if (admitted(p).length >= PARTY_MAX) return err(peer, 'full');
        target.admitted = true; target.knockAt = null;
        return { out: broadcastState(p), close: [] };
      }
      // p_deny
      if (target.admitted) return err(peer, 'no_such_member');
      p.members.delete(target.peer);
      return { out: [{ to: [target.peer], msg: { t: 'p_denied', reason: 'host' } }, ...broadcastState(p)], close: [target.peer] };
    }

    case 'p_status': {
      if (limited(me, 'status', now)) return err(peer, 'slow_down');
      me.activity = cleanActivity(msg.activity);
      return { out: broadcastState(p), close: [] };
    }

    default:
      return handleMore(p, me, isHost, msg, now, rand, env);
  }
}

/** Why a member may report someone. Fixed ids: nothing typed rides along with a report. */
export const REPORT_REASONS = ['harassment', 'hate', 'sexual', 'threat', 'cheating', 'other'] as const;

/** What the socket shell lends the state machine: the report sealer (ticket.ts sealSlip, or null with no secret). */
export interface PartyEnv { seal: ((slip: { reporterUid: string | null; reportedUid: string | null; reportedName: string; code: string; reason: string; at: number }) => string) | null }

const SIG_KINDS = new Set(['offer', 'answer', 'ice', 'bye']);
const SIG_MAX_CHARS = 12_000;
const BLOCKS_MAX = 200;

/** Chat, voice and "Start together". */
function handleMore(p: Party, me: Member, isHost: boolean, msg: Record<string, unknown>, now: number, rand: () => string, env: PartyEnv): Effects {
  const peer = me.peer;
  switch (msg.t) {
    // ── words ──
    case 'p_chat': {
      // TEENS NEVER PUT FREE TEXT IN A PARTY. Refused here: the line is not relayed to anyone, in any form.
      if (!rights(me).text) return err(peer, 'text_adults_only');
      if (limited(me, 'chat', now)) return err(peer, 'slow_down');
      const text = cleanChatText(msg.text);
      if (!text) return err(peer, 'bad_text');
      const line = { t: 'p_chat', id: rand(), from: peer, name: me.name, text, at: now };
      // free text reaches adults only: a teen's party view is presets and emotes
      return { out: [{ to: audience(p, me, (m) => rights(m).text), msg: line }, { to: [peer], msg: { ...line, self: true } }], close: [] };
    }
    case 'p_quick': case 'p_emote': {
      const ok = msg.t === 'p_quick' ? quickLine(msg.id) : emoteById(msg.id);
      if (!ok) return err(peer, 'bad_preset');
      if (limited(me, 'quick', now)) return err(peer, 'slow_down');
      const line = { t: msg.t, id: ok.id, key: rand(), from: peer, name: me.name, at: now };
      return { out: [{ to: audience(p, me), msg: line }, { to: [peer], msg: { ...line, self: true } }], close: [] };
    }

    // ── block and report ──
    case 'p_block': case 'p_unblock': {
      const pub = typeof msg.pub === 'string' ? msg.pub.slice(0, 40) : '';
      if (!pub || pub === me.pub) return err(peer, 'no_such_member');
      if (msg.t === 'p_unblock') { me.blocks.delete(pub); return none(); }
      if (me.blocks.size >= BLOCKS_MAX) return err(peer, 'too_many_blocks');
      me.blocks.add(pub);
      // any voice between the two ends now, on both sides
      const them = [...p.members.values()].filter((m) => m.pub === pub).map((m) => m.peer);
      return { out: them.length ? [{ to: them, msg: { t: 'p_sig', from: peer, data: { kind: 'bye' } } }] : [], close: [] };
    }
    case 'p_report': {
      if (limited(me, 'control', now)) return err(peer, 'slow_down');
      const target = typeof msg.peer === 'string' ? p.members.get(msg.peer) : undefined;
      if (!target || target.peer === peer) return err(peer, 'no_such_member');
      const reason = (REPORT_REASONS as readonly string[]).includes(msg.reason as string) ? (msg.reason as string) : 'other';
      const slip = env.seal ? env.seal({ reporterUid: me.uid, reportedUid: target.uid, reportedName: target.name, code: p.code, reason, at: now }) : null;
      return { out: [{ to: [peer], msg: { t: 'p_report_slip', peer: target.peer, slip } }], close: [] };
    }

    // ── voice ──
    case 'p_voice': {
      // TEENS NEVER GET VOICE. The flag cannot be set, so no member ever sees them as a voice peer, and p_sig refuses them.
      if (!rights(me).voice) return err(peer, 'voice_adults_only');
      if (limited(me, 'status', now)) return err(peer, 'slow_down');
      const wasOn = me.voice;
      me.voice = msg.on === true;
      me.muted = msg.muted === true;
      me.deafened = msg.deafened === true;
      const fx: Effects = { out: broadcastState(p), close: [] };
      if (wasOn && !me.voice) fx.out.push({ to: live(p).filter((m) => m.voice && m.peer !== peer).map((m) => m.peer), msg: { t: 'p_sig', from: peer, data: { kind: 'bye' } } });
      return fx;
    }
    case 'p_sig': {
      if (!rights(me).voice || !me.voice) return err(peer, 'voice_adults_only');
      const target = typeof msg.to === 'string' ? p.members.get(msg.to) : undefined;
      // the other end must be an admitted, connected adult with voice on, and neither may have blocked the other
      if (!target || !target.admitted || !target.connected || !rights(target).voice || !target.voice) return err(peer, 'no_voice_peer');
      if (target.blocks.has(me.pub) || me.blocks.has(target.pub)) return err(peer, 'no_voice_peer');
      const data = msg.data as Record<string, unknown> | null;
      if (!data || typeof data !== 'object' || !SIG_KINDS.has(data.kind as string)) return err(peer, 'bad_signal');
      if (JSON.stringify(data).length > SIG_MAX_CHARS) return err(peer, 'bad_signal');
      if (limited(me, 'signal', now)) return err(peer, 'slow_down');
      return { out: [{ to: [target.peer], msg: { t: 'p_sig', from: peer, data } }], close: [] };
    }

    // ── "Start together" ──
    case 'p_start': {
      if (!isHost) return err(peer, 'host_only');
      if (limited(me, 'control', now)) return err(peer, 'slow_down');
      const mode = onlineMode(msg.mode);
      if (!mode) return err(peer, 'bad_mode');
      if (p.start && now < p.start.at) return err(peer, 'starting');
      const order = live(p).sort((a, b) => (a.peer === p.host ? -1 : b.peer === p.host ? 1 : a.seq - b.seq));
      const seats = new Map<string, string | null>();
      order.forEach((m, i) => seats.set(m.peer, i === 0 ? `h${rand()}` : i < mode.humans ? (i === 1 ? mode.guestPeer : `g${i}${rand()}`) : null));
      p.start = { id: rand(), mode: mode.id, room: `pt-${p.code}-${rand()}`, at: now + START_COUNTDOWN_MS, seats, declined: new Set() };
      return { out: startFrames(p, now), close: [] };
    }
    case 'p_start_cancel': {
      if (!isHost) return err(peer, 'host_only');
      if (!p.start || now >= p.start.at) return none();
      const id = p.start.id;
      p.start = null;
      return { out: [{ to: live(p).map((m) => m.peer), msg: { t: 'p_start_cancel', id } }], close: [] };
    }
    case 'p_decline': {
      const s = p.start;
      if (!s || msg.id !== s.id || now >= s.at + 1000 || s.declined.has(peer)) return none();
      s.declined.add(peer);
      // a declined seat passes to the next person who is sitting this one out, in join order
      const freed = s.seats.get(peer) ?? null;
      s.seats.set(peer, null);
      const out: Out[] = [{ to: live(p).map((m) => m.peer), msg: { t: 'p_declined', id: s.id, peer, name: me.name } }];
      if (freed) {
        const next = live(p).sort((a, b) => a.seq - b.seq).find((m) => s.seats.get(m.peer) === null && !s.declined.has(m.peer));
        if (next) { s.seats.set(next.peer, freed); out.push(...startFrames(p, now, [next.peer])); }
      }
      return { out, close: [] };
    }
  }
  return err(peer, 'unknown_message', { got: typeof msg.t === 'string' ? msg.t.slice(0, 24) : null });
}

/** The personal "Joining X…" frame: the same room for everyone, and this member's own seat (or none). */
function startFrames(p: Party, now: number, only?: string[]): Out[] {
  const s = p.start;
  if (!s) return [];
  const mode = onlineMode(s.mode)!;
  return live(p).filter((m) => !only || only.includes(m.peer)).map((m) => ({
    to: [m.peer],
    msg: { t: 'p_start', id: s.id, mode: mode.id, title: mode.title, path: mode.path, room: s.room, inMs: Math.max(0, s.at - now), seat: s.seats.get(m.peer) ?? null },
  }));
}
