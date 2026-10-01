'use client';
// DancePhonePad — THE CYPHER'S PHONE DANCE PAD (MUSIC-SUITE P9, 2026-09-29, owner decision #16: "dance gets a 4-move pad +
// song pick").
//
// Before this the dance room had no phone at all: its only controller entry (registry.ts `dance`, one TAP) was reachable
// from the TV stage (/host) alone, whose HostStage forwards input to nothing, and components/games/timing-babylon.tsx — the
// room's host — mounted no HostLobby. So "the phone as a dance pad" was a registry row no player could pair.
//
// Now the room offers the pad beside play: the shared pairing badge (HostLobby — QR, code, reconnect, the USB lesson),
// LAZY (no room is opened until the player taps the badge: a signaling poll per page view is what /try's lesson says not
// to do), collapsed while a song plays. The page it serves is registry.ts `dance_pad` — four move buttons (A / B / X / Y,
// hold buttons, P5's opt-in buzz) and the d-pad as the song pick — and everything a phone sends goes onto the room's
// own InputBus through modeBridge.toInputBus, the same adapter every other mode's phone uses: DanceMode reads a phone's
// A:down exactly as a pad's A (dance/freestyle.ts pressEdge), so the phone needs no case of its own anywhere in the judge.
//
// MUSIC-SUITE P9 FIX PASS (2026-09-29) — what the phase review found, and what changed here (dance/phonePadLink.ts has the
// measured why):
//   * a phone press was judged when it ARRIVED (one Wi-Fi hop late). Every phone event is now delivered through
//     phonePadLink.deliver with the paired phone's last measured round trip, and the room judges it half that trip earlier
//     in free play — the correction PERFORM makes (P6);
//   * the pick screen's 6 s auto-start fired while the player was pairing: touching the badge (or a phone joining) arms
//     phonePadLink, and the pick screen then waits for a press;
//   * the pad was offered in a STAKED run too, judged on arrival with no correction the Arena could trust: an Arena run
//     (`?arena=`) shows no pad badge at all — its presses come from a pad, the keyboard or touch, all judged as the rejudge
//     assumes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HostLobby } from '@/components/controller-link/host-lobby';
import { MODE_CONTROLLERS } from '@/lib/controller-link/schemas/registry';
import { toInputBus } from '@/lib/controller-link/modeBridge';
import type { ControlEvent, LobbyPeer } from '@/lib/controller-link/types';
import type { InputBus, FelInput } from '@/lib/babylon/core/InputBus';
import { phonePadLink } from '../phonePadLink';
import { arenaMatchFromQuery } from '../arenaDance';

/** The controller page the Cypher serves a phone (registry.ts). */
export const DANCE_PAD_CONFIG = MODE_CONTROLLERS.dance_pad;

/** MUSIC-SUITE P9 FIX PASS: the pad is never offered in an Arena run (see the header). Pure — the page's query string. */
export function dancePadOffered(search: string | null | undefined): boolean {
  return arenaMatchFromQuery(search) === null;
}

/** MUSIC-SUITE P9 FIX PASS: the round trip to correct a phone press by — the connected phone's last measured one. Pure. */
export function padRttMs(peers: readonly LobbyPeer[]): number | null {
  const p = peers.find((x) => x.connected && typeof x.rttMs === 'number' && Number.isFinite(x.rttMs));
  return p ? p.rttMs : null;
}

export function DancePhonePad({ bus, playing }: { bus: InputBus; playing: boolean }) {
  // read after mount (the server render, and the first client render, offer it — the same markup, so nothing mismatches)
  const [offered, setOffered] = useState(true);
  useEffect(() => { setOffered(dancePadOffered(window.location.search)); }, []);
  const rtt = useRef<number | null>(null);
  const sink = useMemo(() => toInputBus(bus), [bus]);
  const onInput = useCallback((ev: ControlEvent) => { phonePadLink.deliver(rtt.current, () => sink(ev)); }, [sink]);
  // a controller paired to the PHONE (the binary pad relay) arrives as canonical input: straight onto the bus — through the
  // phone's radio all the same, so it is a phone event too
  const onPadInput = useCallback((e: FelInput) => { phonePadLink.deliver(rtt.current, () => bus.emit(e)); }, [bus]);
  const onPeers = useCallback((peers: LobbyPeer[]) => {
    rtt.current = padRttMs(peers);
    if (peers.length) phonePadLink.arm();   // a phone joining is a player choosing: the pick screen waits
  }, []);
  useEffect(() => () => phonePadLink.disarm(), []);
  if (!offered) return null;
  return (
    // display: contents — no box of its own (HostLobby positions itself); it only hears the player reach for the badge
    <div style={{ display: 'contents' }} onPointerDownCapture={() => phonePadLink.arm()}>
      <HostLobby config={DANCE_PAD_CONFIG} onInput={onInput} onPadInput={onPadInput} onPeers={onPeers} collapsed={playing} lazy anchor="right-4 top-14" bus={bus} />
    </div>
  );
}
