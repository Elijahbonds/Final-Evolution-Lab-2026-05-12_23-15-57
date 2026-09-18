'use client';

// useStartWake — the 2-D start card's version of the READY gate rule (SHARED-START-UNSTICK, 2026-09-14): the first
// press, push or tap anywhere starts the game. See lib/babylon/core/StartWake.ts for the Babylon half.
//
// TIEBREAK's FIRST SERVE and TRAINING's CHALK UP were `<button onClick>` and nothing else. A key did nothing, a pad did
// nothing (GameShell's pad poller turns buttons into keys, and no key was listened for), a stick did nothing, and a
// tap on the card beside the pill did nothing — so a player who pressed what every other mode takes sat on the card
// indefinitely. The eye pass recorded both stuck after a 12 s tap/key/pad burst.
//
// Wakes on: any keydown that is not a modifier / Tab / Escape, a pointerdown on the card (the returned handler), and a
// pad button or stick past WAKE_STICK read straight off navigator.getGamepads() — the stick has to be read here
// because a scheme with no d-pad (tiebreak) never turns the stick into keys. A pad input already held when the card
// mounted must be let go first, so the A that picked the mode in the arena does not skip the card on arrival.
//
// `heldKey` is the KeyboardEvent.code that woke the card while it is still down (null once released): a game whose
// verb is a hold (training's lift) can carry that hold straight into play instead of making the player press twice.

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { WAKE_STICK } from '@/lib/babylon/core/StartWake';

const IGNORED_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape', 'CapsLock']);

export function useStartWake(active: boolean, onWake: () => void) {
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;
  const heldKey = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let done = false;
    const fire = () => { if (done) return; done = true; onWakeRef.current(); };

    const onKeyDown = (e: KeyboardEvent) => {
      if (IGNORED_KEYS.has(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();   // no page scroll on the wake
      heldKey.current = e.code;
      fire();
    };
    window.addEventListener('keydown', onKeyDown);

    // pad: buttons + left/right sticks, armed only once whatever was held at mount has been released
    const deflected = (p: Gamepad) => {
      const a = p.axes;
      return Math.hypot(a[0] ?? 0, a[1] ?? 0) >= WAKE_STICK || Math.hypot(a[2] ?? 0, a[3] ?? 0) >= WAKE_STICK;
    };
    const readPads = (): Gamepad[] => {
      try { return Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p); } catch { return []; }
    };
    const heldAtMount = new Set<string>();
    for (const p of readPads()) {
      p.buttons.forEach((b, i) => { if (b.pressed) heldAtMount.add(`${p.index}:${i}`); });
      if (deflected(p)) heldAtMount.add(`${p.index}:stick`);
    }
    let raf = 0;
    const poll = () => {
      if (done) return;
      for (const p of readPads()) {
        for (let i = 0; i < p.buttons.length; i++) {
          const id = `${p.index}:${i}`;
          if (!p.buttons[i].pressed) heldAtMount.delete(id);
          else if (!heldAtMount.has(id)) { fire(); return; }
        }
        const id = `${p.index}:stick`;
        if (!deflected(p)) heldAtMount.delete(id);
        else if (!heldAtMount.has(id)) { fire(); return; }
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [active]);

  // keep tracking the wake key's release after the card is gone, so `heldKey` goes null when the player lets go
  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => { if (heldKey.current === e.code) heldKey.current = null; };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (!active || !e.isPrimary) return;
    onWakeRef.current();
  }, [active]);

  return { onPointerDown, heldKey };
}
