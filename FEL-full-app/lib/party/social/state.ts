// lib/party/social/state.ts — the party as this page knows it, and how each server frame changes it (PARTY-CHAT lane,
// 2026-10-13). Pure: no socket, no DOM, no React. The connection (connection.ts) feeds frames in; the dock draws it.
//
// Every frame is bounded here before it is drawn (names, lines and lists are capped again), the same rule
// lib/party/protocol.ts applies to the couch party's PartyView: the page never trusts a frame's sizes.
//
// EPHEMERAL: the feed lives in memory only, capped at FEED_MAX, and is gone with the page. Nothing here is written to
// storage, sent to the app's API, or logged.

import { EMOTES, QUICK_CHAT, PARTY_MAX, emoteById, quickLine } from '@/server/netd/src/partyRules';

export type PartyStatus =
  | 'idle'          // not in a party
  | 'unavailable'   // NEXT_PUBLIC_NETD_URL is not set: parties are not switched on here
  | 'connecting'
  | 'waiting'       // knocking at an invite-only party
  | 'live'
  | 'reconnecting'
  | 'outdated'      // the party server is an old netd: "Parties need a server update"
  | 'ended';        // left, kicked, turned away, or the party is over (see `notice`)

export interface PartyMember {
  peer: string;
  name: string;
  pub: string;
  host: boolean;
  connected: boolean;
  voice: boolean;
  muted: boolean;
  deafened: boolean;
  activity: string | null;
}

export type FeedKind = 'chat' | 'quick' | 'emote' | 'system';

export interface FeedItem {
  key: string;
  kind: FeedKind;
  from: string | null;
  name: string;
  text: string;
  glyph?: string;
  self: boolean;
  at: number;
}

export interface StartOffer {
  id: string;
  mode: string;
  title: string;
  path: string;
  room: string;
  /** The peer id this page joins the match under, or null: the mode is full, you stay in the party. */
  seat: string | null;
  /** Local clock (Date.now()) when everyone is pulled in. */
  at: number;
  declined: boolean;
}

export interface PartyState {
  status: PartyStatus;
  /** One plain sentence for the person: why the party ended, why a join failed, a refused action. */
  notice: string | null;
  code: string | null;
  you: string | null;
  host: string | null;
  rights: { text: boolean; voice: boolean };
  inviteOnly: boolean;
  members: PartyMember[];
  knocking: { peer: string; name: string }[];
  feed: FeedItem[];
  /** The latest quick-chat / emote line, for the caption strip (accessibility: what was said, in words). */
  caption: FeedItem | null;
  start: StartOffer | null;
  /** A report slip the page should carry to /api/party/report (consumed by the dock). */
  reportSlip: { peer: string; slip: string | null } | null;
}

export const FEED_MAX = 60;
const NAME_MAX = 12;
const TEXT_MAX = 240;

export const EMPTY_PARTY: PartyState = {
  status: 'idle', notice: null, code: null, you: null, host: null, rights: { text: false, voice: false }, inviteOnly: false,
  members: [], knocking: [], feed: [], caption: null, start: null, reportSlip: null,
};

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const id = (v: unknown): string => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : '');

/** Plain words for every refusal the server can send. */
export const PARTY_ERRORS: Record<string, string> = {
  host_only: 'Only the party host can do that.',
  slow_down: "You're sending a lot — give it a few seconds.",
  text_adults_only: 'Typed chat is for 18+ accounts. Quick chat and emotes work for everyone.',
  voice_adults_only: 'Voice chat is for 18+ accounts.',
  bad_text: "That message couldn't be sent.",
  bad_preset: "That quick-chat line isn't available.",
  no_such_member: "That person isn't in the party any more.",
  full: `The party is full (${PARTY_MAX}).`,
  waiting: 'Waiting for the host to let you in.',
  starting: 'A game is already starting.',
  bad_mode: "That game can't be started together.",
  no_voice_peer: "That person isn't in voice.",
  too_many_blocks: "You've blocked a lot of people — unblock some first.",
};

export const REFUSALS: Record<string, string> = {
  full: `That party is full (${PARTY_MAX} people).`,
  banned: "The host removed you from that party, so you can't rejoin it.",
  door_full: 'Too many people are waiting to get into that party. Try again in a minute.',
  not_found: 'No party with that code right now. Check the code, or ask for a new invite.',
  busy: 'The party server is busy. Try again in a minute.',
  bad_hello: 'This page is out of date — reload it to join parties.',
};

function member(raw: unknown): PartyMember | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const peer = id(m.peer);
  if (!peer) return null;
  return {
    peer, name: str(m.name, NAME_MAX) || 'PLAYER', pub: id(m.pub), host: m.host === true, connected: m.connected !== false,
    voice: m.voice === true, muted: m.muted === true, deafened: m.deafened === true,
    activity: typeof m.activity === 'string' ? m.activity.slice(0, 40) : null,
  };
}

function push(s: PartyState, item: FeedItem): PartyState {
  const feed = [...s.feed, item].slice(-FEED_MAX);
  const caption = item.kind === 'quick' || item.kind === 'emote' || item.kind === 'system' ? item : s.caption;
  return { ...s, feed, caption };
}

function nameOf(s: PartyState, peer: string | null, fallback: unknown): string {
  return s.members.find((m) => m.peer === peer)?.name ?? (str(fallback, NAME_MAX) || 'PLAYER');
}

/** Words for a quick-chat or emote line: what the caption strip and a screen reader say. */
export function captionText(item: Pick<FeedItem, 'kind' | 'name' | 'text' | 'self'>): string {
  const who = item.self ? 'You' : item.name;
  if (item.kind === 'emote') return `${who}: ${item.text}`;
  if (item.kind === 'system') return item.text;
  return `${who}: ${item.text}`;
}

/**
 * One server frame → the next state. `blockedPubs` hides a blocked person's lines on this page even before the server
 * hears about the block (and after a resume, while it is being re-sent). `now` is the local clock.
 */
export function applyFrame(s: PartyState, f: Record<string, unknown>, blockedPubs: ReadonlySet<string>, now: number): PartyState {
  switch (f.t) {
    case 'p_welcome': {
      const r = (f.rights ?? {}) as Record<string, unknown>;
      return { ...s, status: 'connecting', notice: null, code: str(f.code, 6), you: id(f.you), rights: { text: r.text === true, voice: r.voice === true } };
    }
    case 'p_wait':
      return { ...s, status: 'waiting', code: str(f.code, 6) || s.code };
    case 'p_state': {
      const members = Array.isArray(f.members) ? (f.members as unknown[]).slice(0, PARTY_MAX).map(member).filter((m): m is PartyMember => !!m) : [];
      const knocking = Array.isArray(f.knocking)
        ? (f.knocking as unknown[]).slice(0, PARTY_MAX).flatMap((k) => {
          const o = (k ?? {}) as Record<string, unknown>;
          return id(o.peer) ? [{ peer: id(o.peer), name: str(o.name, NAME_MAX) || 'PLAYER' }] : [];
        })
        : [];
      const me = (f.me ?? {}) as Record<string, unknown>;
      return {
        ...s, status: 'live', code: str(f.code, 6) || s.code, you: id(f.you) || s.you, host: id(f.host) || null, members, knocking,
        inviteOnly: f.inviteOnly === true, rights: { text: me.text === true, voice: me.voice === true },
      };
    }
    case 'p_left': {
      const name = nameOf(s, id(f.peer), f.name);
      return push(s, { key: `left-${id(f.peer)}-${now}`, kind: 'system', from: null, name, text: `${name} left the party`, self: false, at: now });
    }
    case 'p_chat': case 'p_quick': case 'p_emote': {
      const from = id(f.from);
      const pub = s.members.find((m) => m.peer === from)?.pub;
      if (pub && blockedPubs.has(pub)) return s;
      const self = f.self === true;
      const name = nameOf(s, from, f.name);
      // chat lines carry their own id; a preset's `id` is WHICH preset, so its line id is `key`
      const key = `${f.t}-${f.t === 'p_chat' ? id(f.id) : id(f.key)}-${from}`;
      if (s.feed.some((x) => x.key === key)) return s;
      if (f.t === 'p_chat') {
        const text = str(f.text, TEXT_MAX);
        return text ? push(s, { key, kind: 'chat', from, name, text, self, at: now }) : s;
      }
      if (f.t === 'p_quick') {
        const q = quickLine(f.id);
        return q ? push(s, { key, kind: 'quick', from, name, text: q.text, self, at: now }) : s;
      }
      const e = emoteById(f.id);
      return e ? push(s, { key, kind: 'emote', from, name, text: e.label, glyph: e.glyph, self, at: now }) : s;
    }
    case 'p_error': {
      const code = str(f.code, 32);
      return { ...s, notice: PARTY_ERRORS[code] ?? null };
    }
    case 'p_refused':
      return { ...EMPTY_PARTY, status: 'ended', notice: REFUSALS[str(f.reason, 16)] ?? "Couldn't join that party." };
    case 'p_kicked':
      return { ...EMPTY_PARTY, status: 'ended', notice: 'The host removed you from the party.' };
    case 'p_denied':
      return { ...EMPTY_PARTY, status: 'ended', notice: f.reason === 'timeout' ? 'Nobody let you in — ask the host to try again.' : "The host didn't let you in this time." };
    case 'p_start': {
      const inMs = typeof f.inMs === 'number' && Number.isFinite(f.inMs) ? Math.max(0, Math.min(10_000, f.inMs)) : 5000;
      const path = str(f.path, 64);
      if (!/^\/play\/[a-z0-9-]+$/.test(path)) return s;
      return {
        ...s,
        start: {
          id: id(f.id), mode: id(f.mode), title: str(f.title, 40), path, room: id(f.room),
          seat: f.seat === null ? null : id(f.seat) || null, at: now + inMs, declined: false,
        },
      };
    }
    case 'p_start_cancel':
      return s.start && s.start.id === f.id ? { ...push(s, { key: `cancel-${now}`, kind: 'system', from: null, name: '', text: 'The host cancelled the game', self: false, at: now }), start: null } : s;
    case 'p_declined': {
      const name = nameOf(s, id(f.peer), f.name);
      return push(s, { key: `declined-${id(f.peer)}-${id(f.id)}`, kind: 'system', from: null, name, text: `${name} is sitting this one out`, self: id(f.peer) === s.you, at: now });
    }
    case 'p_report_slip':
      return { ...s, reportSlip: { peer: id(f.peer), slip: typeof f.slip === 'string' ? f.slip.slice(0, 4096) : null } };
  }
  return s;
}

export const isHost = (s: Pick<PartyState, 'you' | 'host'>): boolean => !!s.you && s.you === s.host;
export const me = (s: Pick<PartyState, 'you' | 'members'>): PartyMember | null => s.members.find((m) => m.peer === s.you) ?? null;
export const inParty = (s: Pick<PartyState, 'status'>): boolean => s.status === 'live' || s.status === 'reconnecting' || s.status === 'waiting' || s.status === 'connecting';

export { QUICK_CHAT, EMOTES };
