// Adapters: ControlEvent → the input path a mode already listens to.
//
// Controller Link stays engine-agnostic by never calling a mode directly. It
// hands events to one of these adapters instead. Two exist because this app
// genuinely runs two engines:
//
//   toInputBus   — Babylon modes (ModeHarness/InputBus). One adapter covers
//                  EVERY Babylon mode at once, because they all consume the
//                  same FelInput union.
//   toFelBridge  — the legacy react-three-fiber modes, which already expose a
//                  uniform sendInput() through lib/playtest/harness.
//
// A mode author writes neither: they add a registry entry and consume the input
// they already consume.

import type { InputBus, FelInput } from '../babylon/core/InputBus';
import type { ControlEvent } from './types';
import type { Dir } from './schemas/dpad';

/**
 * Babylon adapter. Maps the generic controller vocabulary onto FelInput so a
 * phone is indistinguishable from a gamepad as far as any mode is concerned.
 *
 * Convention:
 *   'A' | 'B' | 'X' | 'Y'      -> button press (and `:down`/`:up` for holds)
 *   'dpad' with {dir,pressed}  -> dpad event
 *   'charge' with number 0..1  -> right trigger value (the shot-meter path)
 *   anything else              -> passed through as a button of that name,
 *                                 which modes can pattern-match on.
 */
/** Matches InputBus's space-key analog ramp so a phone feels like a keyboard. */
const CHARGE_RAMP_MS = 1100;

export function toInputBus(bus: InputBus): (ev: ControlEvent) => void {
  // A held CHARGE button has to be ramped by SOMEBODY. On keyboard InputBus
  // does it (space depth over 1.1s); on the motion path the phone does it from
  // tilt. A held button has neither, so the bridge ramps it here — otherwise
  // the fallback is a single instant value and charge stops being analog.
  let chargeTimer: ReturnType<typeof setInterval> | null = null;
  // Held d-pad directions for the 'move' action, so up+right is a diagonal
  // rather than whichever arrow arrived last.
  const heldDirs = new Set<Dir>();
  const stopCharge = (): void => {
    if (chargeTimer) { clearInterval(chargeTimer); chargeTimer = null; }
  };

  return (ev: ControlEvent) => {
    const emit = (i: FelInput): void => bus.emit(i);

    // MOVEMENT. Modes read movement from a LEFT STICK event and nothing else —
    // LocalInputSource only looks at { t: 'stick', side: 'L' }. A d-pad event
    // moves no one. That is fine for a stationary mode like 3PT, and it makes a
    // mode like 3v3 unplayable from a phone: every verb would work except
    // walking. A schema opts in by naming its d-pad action 'move', which keeps
    // this away from modes where the d-pad means something else entirely — in
    // Dunk it picks the prop and arms mid-air tricks, and turning that into
    // movement would break it.
    if (ev.a === 'move') {
      const p = ev.p as { dir?: Dir; pressed?: boolean; x?: number; y?: number } | undefined;
      if (!p) return;
      if (typeof p.x === 'number' || typeof p.y === 'number') {
        emit({ t: 'stick', side: 'L', x: p.x ?? 0, y: p.y ?? 0 });
        return;
      }
      if (!p.dir) return;
      if (p.pressed) heldDirs.add(p.dir); else heldDirs.delete(p.dir);
      const x = (heldDirs.has('right') ? 1 : 0) - (heldDirs.has('left') ? 1 : 0);
      const y = (heldDirs.has('up') ? 1 : 0) - (heldDirs.has('down') ? 1 : 0);
      emit({ t: 'stick', side: 'L', x, y });
      return;
    }

    if (ev.a === 'dpad') {
      const p = ev.p as { dir: Dir; pressed: boolean } | undefined;
      if (p) emit({ t: 'dpad', dir: p.dir, pressed: p.pressed });
      return;
    }

    if (ev.a === 'charge') {
      const v = typeof ev.p === 'number' ? Math.min(1, Math.max(0, ev.p)) : 0;
      emit({ t: 'trigger', side: 'R', value: v });
      return;
    }

    // Hold buttons arrive as 'X:down' / 'X:up'.
    const holdMatch = /^([A-Za-z0-9_]+):(down|up)$/.exec(ev.a);
    if (holdMatch) {
      const [, name, edge] = holdMatch;
      // 'charge' is ANALOG everywhere else in this vocabulary, and a held button
      // is its fallback when a phone denies motion or is not in a secure
      // context. Without this branch it fell through to normalizeBtn(), which
      // maps every unknown action to 'A' — so on a phone with motion denied,
      // holding CHARGE fired SLAM instead. That is the silent-degradation shape
      // this project keeps getting bitten by: no error, just the wrong verb.
      if (name === 'charge') {
        stopCharge();
        if (edge === 'up') { emit({ t: 'trigger', side: 'R', value: 0 }); return; }
        const t0 = Date.now();
        emit({ t: 'trigger', side: 'R', value: 0.01 });
        chargeTimer = setInterval(() => {
          const v = Math.min(1, (Date.now() - t0) / CHARGE_RAMP_MS);
          emit({ t: 'trigger', side: 'R', value: v });
          if (v >= 1) stopCharge();
        }, 50);
        return;
      }
      emit({ t: 'button', btn: normalizeBtn(name), pressed: edge === 'down' });
      return;
    }

    // A plain tap is a press+release so modes that only watch for the release
    // edge (most timing mechanics) still fire.
    const btn = normalizeBtn(ev.a);
    emit({ t: 'button', btn, pressed: true });
    emit({ t: 'button', btn, pressed: false });
  };
}

/** Map a mode-vocabulary action onto the A/B/X/Y face buttons. */
function normalizeBtn(action: string): 'A' | 'B' | 'X' | 'Y' {
  const upper = action.toUpperCase();
  if (upper === 'A' || upper === 'B' || upper === 'X' || upper === 'Y') return upper;
  // 'shoot' is the primary verb in every mode that has one — put it on A, which
  // is what LocalInputSource and the touch overlay already treat as primary.
  return 'A';
}

/**
 * react-three-fiber adapter, via the existing playtest harness bridge.
 * Kept so the legacy 3D modes can be driven from a phone without being ported,
 * but new work should be Babylon.
 */
export function toFelBridge(modeId: string): (ev: ControlEvent) => void {
  return (ev: ControlEvent) => {
    const api = (globalThis as unknown as {
      __felTest?: { sendInput: (a: string, p?: unknown, id?: string) => boolean };
    }).__felTest;
    api?.sendInput(ev.a, ev.p, modeId);
  };
}
