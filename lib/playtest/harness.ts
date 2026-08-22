/**
 * lib/playtest/harness.ts  (M12.9)
 * ================================
 * Self-playtest harness surface: a single `window.__felTest` object that lets a
 * human (or an automation script running in a real browser) drive ANY mounted
 * mode through one uniform contract:
 *
 *   window.__felTest.listModes()          -> ids of every mode that has
 *                                            registered a harness bridge
 *   window.__felTest.active()             -> the id of the currently mounted mode
 *   window.__felTest.getState()           -> a plain-object snapshot of the
 *                                            active mode's live state
 *   window.__felTest.sendInput(a, p?)     -> route an action (+ payload) into the
 *                                            active mode, exactly as a real key /
 *                                            tap / button would
 *   window.__felTest.getState(id) / sendInput on a specific id also supported.
 *
 * Modes register themselves on mount via registerFelMode() and clean up on
 * unmount. Registration (and the whole global) is only installed when PLAYTEST
 * mode is on, so it is inert in normal play and adds no attack surface.
 *
 * PLAYTEST mode is on when NEXT_PUBLIC_PLAYTEST_MODE === '1' OR the URL carries
 * ?playtest=1 (so it can be toggled per-session without a rebuild).
 */

export type FelModeBridge = {
  /** Snapshot the mode's live state as a plain, JSON-safe object. */
  getState: () => Record<string, unknown>;
  /** Route an action string (+ optional payload) into the mode. */
  sendInput: (action: string, payload?: unknown) => void;
};

type FelTestApi = {
  listModes: () => string[];
  active: () => string | null;
  getState: (id?: string) => Record<string, unknown> | null;
  sendInput: (action: string, payload?: unknown, id?: string) => boolean;
  _modes: Record<string, FelModeBridge>;
};

declare global {
  // eslint-disable-next-line no-var
  var __felTest: FelTestApi | undefined;
}

export function isPlaytestMode(): boolean {
  if (process.env.NEXT_PUBLIC_PLAYTEST_MODE === '1') return true;
  if (typeof window !== 'undefined') {
    try {
      return new URLSearchParams(window.location.search).get('playtest') === '1';
    } catch {
      return false;
    }
  }
  return false;
}

// Insertion order = mount order; the most-recently-registered mode is "active".
const order: string[] = [];

function ensureInstalled(): FelTestApi | null {
  if (typeof window === 'undefined') return null;
  if (!isPlaytestMode()) return null;
  if (!window.__felTest) {
    const api: FelTestApi = {
      _modes: {},
      listModes: () => Object.keys(api._modes),
      active: () => (order.length ? order[order.length - 1] : null),
      getState: (id) => {
        const key = id ?? api.active();
        if (!key) return null;
        const m = api._modes[key];
        return m ? m.getState() : null;
      },
      sendInput: (action, payload, id) => {
        const key = id ?? api.active();
        if (!key) return false;
        const m = api._modes[key];
        if (!m) return false;
        m.sendInput(action, payload);
        return true;
      },
    };
    window.__felTest = api;
    // eslint-disable-next-line no-console
    console.info('[felTest] playtest harness installed — window.__felTest ready');
  }
  return window.__felTest;
}

/** Register a mode's harness bridge. No-op unless PLAYTEST mode is on. */
export function registerFelMode(id: string, bridge: FelModeBridge): void {
  const api = ensureInstalled();
  if (!api) return;
  api._modes[id] = bridge;
  const i = order.indexOf(id);
  if (i !== -1) order.splice(i, 1);
  order.push(id);
}

/** Remove a mode's bridge on unmount. */
export function unregisterFelMode(id: string): void {
  if (typeof window === 'undefined' || !window.__felTest) return;
  delete window.__felTest._modes[id];
  const i = order.indexOf(id);
  if (i !== -1) order.splice(i, 1);
}
