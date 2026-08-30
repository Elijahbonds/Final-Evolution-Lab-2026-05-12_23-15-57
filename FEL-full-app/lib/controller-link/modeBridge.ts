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
export function toInputBus(bus: InputBus): (ev: ControlEvent) => void {
  return (ev: ControlEvent) => {
    const emit = (i: FelInput): void => bus.emit(i);

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
