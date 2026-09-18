'use client';
// THE PAD RELAY LOOP — a phone being a controller (mission Phase B).
//
// Mounted by the controller page. Polls whatever gamepad is attached to the PHONE, maps it through the
// Phase A profile layer, and streams canonical frames at display rate.
//
// Three decisions worth stating:
//
//   rAF, NOT setInterval. The pad has no render loop of its own to speak of, but rAF is still the right
//   clock: it is paused when the tab is hidden, which is exactly what should happen to a controller nobody
//   is looking at, and it matches the display rather than drifting against it.
//
//   THE PHONE OWNS THE MAPPING. A controller is paired to the phone, so the phone is the only device that
//   can see `gamepad.id` and know it is a Switch Pro. The host receives canonical buttons and never learns
//   what hardware is in the room — which is also why a host on an older build still works with a newer pad.
//
//   IT SENDS ONLY WHEN SOMETHING CHANGED, plus a keepalive. A resting pad at 60 Hz is 60 identical frames a
//   second saying nothing; skipping those is most of the bandwidth for free. The keepalive is what keeps
//   "idle" distinguishable from "gone".

import { useEffect, useRef, useState } from 'react';
import { PadSender, PadClock, type TouchState } from '@/lib/controller-link/padSampler';
import { profileFor, supportCheck, type PadLike } from '@/lib/input/profiles';
import type { ControllerClient } from '@/lib/controller-link/client';

export interface PadRelayState {
  /** The controller attached to this phone, if any. */
  padName: string | null;
  /** Set when the controller cannot work on this device (e.g. Switch 2 Pro over BT on iOS). */
  unsupported: string | null;
  /** How frames are travelling: the fast path, the fallback, or nowhere. */
  path: 'rtc' | 'socket' | 'dropped' | 'idle';
  framesSent: number;
}

/**
 * Stream this phone's controller (and/or touch layout) to the host.
 *
 * `touch` is read through a ref on every frame rather than passed as a dependency: the on-screen controls
 * change many times a second and re-subscribing the loop for each would be worse than pointless.
 */
export function usePadRelay(client: ControllerClient | null, touchRef: React.MutableRefObject<TouchState>): PadRelayState {
  const [state, setState] = useState<PadRelayState>({ padName: null, unsupported: null, path: 'idle', framesSent: 0 });
  const senderRef = useRef<PadSender | null>(null);
  const pathRef = useRef<PadRelayState['path']>('idle');

  useEffect(() => {
    if (!client) return;
    const clock = new PadClock();
    const sender = new PadSender((bytes) => { pathRef.current = client.sendFrame(bytes); });
    senderRef.current = sender;

    let raf = 0;
    let lastReport = 0;
    let lastPadId: string | null = null;

    const readPadNow = (): PadLike | null => {
      try {
        const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
        for (const p of pads) if (p && p.connected !== false) return p as unknown as PadLike;
      } catch { /* a permissions policy can deny the API outright */ }
      return null;
    };

    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const pad = readPadNow();
      const now = Date.now();
      sender.tick({ slot: client.slot, pad, touch: touchRef.current, t: clock.ms(now) }, now);

      // report to React at ~4 Hz: this is status text, not a game loop
      if (now - lastReport > 250) {
        lastReport = now;
        const id = pad?.id ?? null;
        if (id !== lastPadId) lastPadId = id;
        const profile = pad ? profileFor(pad) : null;
        const support = profile ? supportCheck(profile, navigator.userAgent) : { ok: true as const };
        setState({
          padName: profile?.name ?? null,
          unsupported: support.ok ? null : support.why,
          path: pathRef.current,
          framesSent: sender.sent,
        });
      }
    };
    raf = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(raf); senderRef.current = null; };
  }, [client, touchRef]);

  return state;
}
