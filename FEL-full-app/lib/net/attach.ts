// FEL NETPLAY — the opt-in attachment point (2026-09-12).
//
// Follows the precedent already in OneVOneMode: `?agent=1` swaps the hero's ControlSource for an
// AgentControlSource and human play is untouched. Netplay is the same shape — `?net=<room>` swaps
// the OPPONENT's source from AI to the wire. With no flag present nothing here is constructed,
// nothing connects, and the mode behaves exactly as it does today.
//
//   /play/onevone?net=abc            join room "abc"
//   /play/onevone?net=abc&peer=bob   with an explicit peer id (default: random)
//
// lane/online-play (2026-11-21): ONE SHARED GAME. `handle.play` (lib/net/play.ts) decides which page runs the game and lets the
// others draw it; `seatSource` gives a body to whichever human holds its seat and to the AI when nobody does (so a seat nobody
// took, or a player who left, is simply the AI). The ids the party's "Start together" hands out are the seats: lib/net/seats.ts.

import { NetSession } from './NetSession';
import { NetdTransport, type NetStatus } from './NetdTransport';
import { NetPlay } from './play';
import { peerForLocal, SEAT_LAYOUTS, isWatcherPeer, canonicalOf } from './seats';
import type { ControlSource, Intent } from '../babylon/core/PlayerSlot';

const NEUTRAL: Intent = { moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false };

export interface NetplayHandle {
  session: NetSession;
  /** lane/online-play: the shared game (run or draw). */
  play: NetPlay;
  /** Hand this to a PlayerSlot in place of an AISource. A page asking for ITS OWN id (a 1v1 guest's page builds its rival slot
   *  as sourceFor('foe') too) gets the other seated human. */
  sourceFor(peerId: string): ControlSource;
  /** lane/online-play: the body this page spawned as `localKey` ('foe', 'mate0', 'foe2'…): the human on that seat while one is
   *  present, otherwise `ai` (or neutral). */
  seatSource(localKey: string, ai: ControlSource | null): ControlSource;
  /** Call once per frame with the local player's intent. */
  tick(localIntent: Intent): void;
  status: NetStatus | null;
  /** Round trip to netd, ms (null before the first). */
  rttMs(): number | null;
  dispose(): void;
}

/** Netplay is requested only when the URL says so; returns null otherwise. */
export function netplayRoom(search?: string): string | null {
  if (typeof window === 'undefined' && !search) return null;
  const q = new URLSearchParams(search ?? window.location.search);
  const room = q.get('net');
  return room && room.trim() ? room.trim() : null;
}

function randomPeerId(): string {
  return 'p' + Math.random().toString(36).slice(2, 10);
}

/**
 * Connect, or return null when netplay was not requested or is not configured.
 *
 * Returns null rather than throwing when NEXT_PUBLIC_NETD_URL is unset: a missing server must
 * degrade to the normal single-player mode, never break the page.
 */
export function attachNetplay(mode: string, search?: string): NetplayHandle | null {
  const room = netplayRoom(search);
  if (!room) return null;
  const url = process.env.NEXT_PUBLIC_NETD_URL;
  if (!url) { console.warn('[FEL-NET] ?net= given but NEXT_PUBLIC_NETD_URL is unset — staying single-player'); return null; }

  const q = new URLSearchParams(search ?? (typeof window === 'undefined' ? '' : window.location.search));
  const selfId = q.get('peer') || randomPeerId();

  /** A remote peer's intent, as this page reads it (null: not present / nothing yet). */
  const intentOf = (peer: string | null): Intent | null => (peer ? handle.session?.intentFor(peer) ?? null : null);
  const opponent = (): string | null => {
    for (const p of handle.session?.peers ?? []) if (p !== selfId && !isWatcherPeer(p) && (canonicalOf(mode, p) !== null || !SEAT_LAYOUTS[mode])) return p;
    return null;
  };

  const handle: NetplayHandle = {
    session: null as unknown as NetSession,
    play: null as unknown as NetPlay,
    status: null,
    sourceFor(peerId: string): ControlSource {
      return { poll: () => intentOf(peerId === selfId && handle.play?.enabled ? opponent() : peerId) ?? { ...NEUTRAL } };
    },
    seatSource(localKey: string, ai: ControlSource | null): ControlSource {
      // net.mirrorOn 0: exactly the old wiring (the seat's own id, nothing behind it)
      if (!handle.play?.enabled) return ai ?? handle.sourceFor(localKey);
      return {
        poll: (dt: number) => {
          const peer = SEAT_LAYOUTS[mode] ? peerForLocal(mode, selfId, localKey, handle.session?.peers ?? []) : null;
          const got = peer ? intentOf(peer) : null;
          if (got) return got;
          return ai ? ai.poll(dt) : { ...NEUTRAL };
        },
        dispose: () => ai?.dispose?.(),
      };
    },
    tick(localIntent: Intent): void {
      // shared play: a drawing page sends its intent from play.frame(), and the running page's own player is simulated right
      // there (nobody needs it); a watcher sends nothing. Without shared play (Karate, net.mirrorOn 0) every page sends, as before.
      if (handle.play?.enabled) return;
      if (isWatcherPeer(selfId)) return;
      handle.session?.sendLocalIntent(localIntent);
    },
    rttMs: () => transport.rttMs,
    dispose(): void { handle.play?.dispose(); handle.session?.dispose(); },
  };

  const transport = new NetdTransport({
    url, roomId: room, peerId: selfId, mode,
    onStatus: (s) => {
      handle.status = s;
      const sess = handle.session;
      if (s.kind === 'open') {
        sess?.notePeers(s.peers);
        // the server decides who runs the game first (the first page in); after that the shared game decides (play.ts)
        if (handle.play?.enabled) handle.play.opened(s.isAuthority, s.authority ?? null); else sess?.setAuthority(s.isAuthority);
      }
      if (s.kind === 'peer_join') sess?.peerJoined(s.peer);
      if (s.kind === 'peer_leave') {
        sess?.peerLeft(s.peer);
        if (handle.play?.enabled) handle.play.peerLeft(s.peer);
        else if (s.authorityChanged) sess?.setAuthority(s.authority === selfId);
      }
      if (s.kind === 'closed') handle.play?.closed();
      if (s.kind !== 'rtt') console.info('[FEL-NET]', s.kind, JSON.stringify(s));
    },
  });

  handle.session = new NetSession({ transport, selfId, isAuthority: false });
  handle.play = new NetPlay(handle.session, mode, undefined, room);
  // the rigs read this (scripts/probes/online-play): who runs the game, what is flowing, the round trip. Net runs only.
  if (typeof window !== 'undefined') (window as unknown as { __felNet?: unknown }).__felNet = {
    self: selfId, room, mode,
    get role() { return handle.play.role; },
    get runner() { return handle.play.runner; },
    get stats() { return { ...handle.play.stats }; },
    get peers() { return handle.session.peers; },
    get rttMs() { return transport.rttMs; },
    get status() { return handle.status?.kind ?? null; },
  };
  return handle;
}
