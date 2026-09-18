// FEL NETPLAY — the opt-in attachment point (2026-09-12).
//
// Follows the precedent already in OneVOneMode: `?agent=1` swaps the hero's ControlSource for an
// AgentControlSource and human play is untouched. Netplay is the same shape — `?net=<room>` swaps
// the OPPONENT's source from AI to the wire. With no flag present nothing here is constructed,
// nothing connects, and the mode behaves exactly as it does today.
//
//   /play/onevone?net=abc            join room "abc"
//   /play/onevone?net=abc&peer=bob   with an explicit peer id (default: random)

import { NetSession } from './NetSession';
import { NetdTransport, type NetStatus } from './NetdTransport';
import type { ControlSource, Intent } from '../babylon/core/PlayerSlot';

const NEUTRAL: Intent = { moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false };

export interface NetplayHandle {
  session: NetSession;
  /** Hand this to a PlayerSlot in place of an AISource. */
  sourceFor(peerId: string): ControlSource;
  /** Call once per frame with the local player's intent. */
  tick(localIntent: Intent): void;
  status: NetStatus | null;
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

  const handle: NetplayHandle = {
    session: null as unknown as NetSession,
    status: null,
    sourceFor(peerId: string): ControlSource {
      return {
        poll: () => handle.session?.intentFor(peerId) ?? { ...NEUTRAL },
      };
    },
    tick(localIntent: Intent): void {
      handle.session?.sendLocalIntent(localIntent);
    },
    dispose(): void { handle.session?.dispose(); },
  };

  const transport = new NetdTransport({
    url, roomId: room, peerId: selfId, mode,
    onStatus: (s) => {
      handle.status = s;
      // the server is the only thing that decides who simulates
      if (s.kind === 'open') handle.session?.setAuthority(s.isAuthority);
      if (s.kind === 'peer_leave' && s.authorityChanged) handle.session?.setAuthority(s.authority === selfId);
      console.info('[FEL-NET]', s.kind, JSON.stringify(s));
    },
  });

  handle.session = new NetSession({ transport, selfId, isAuthority: false });
  return handle;
}
