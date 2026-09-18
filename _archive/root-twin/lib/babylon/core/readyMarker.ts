// readyMarker — the one line the smoke test waits for.
//
// Section 5A of the master brief flags this as a stub: "The app must set a
// DOM marker (e.g. #dunk-ready) when the dunk scene has loaded — the smoke
// test waits for it." This is that marker, generalized so every mode gets
// one instead of only dunk.
//
// It also encodes the distinction the smoke test actually needs: LOADED
// (geometry and characters exist) is not the same as PLAYABLE (the loop is
// running and accepting input). A smoke test that passes on "loaded" will
// happily green-light a mode that never starts.

export type ReadyState = 'loading' | 'loaded' | 'playing' | 'failed';

const NODE_ID = 'fel-ready';

interface ReadyDetail {
  modeId: string;
  state: ReadyState;
  at: number;
  error?: string;
}

function node(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById(NODE_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = NODE_ID;
    // invisible, zero-cost, never affects layout
    el.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Publish the mode's readiness. Sets:
 *   #fel-ready[data-mode][data-state]  — the general marker
 *   #<modeId>-ready                    — a per-mode id, so the brief's
 *                                        `#dunk-ready` selector works as-is
 * and dispatches a `fel:ready` CustomEvent for anything that prefers events.
 */
export function setReady(modeId: string, state: ReadyState, error?: string): void {
  const el = node();
  if (!el) return;

  el.dataset.mode = modeId;
  el.dataset.state = state;

  const perModeId = `${modeId}-ready`;
  const existing = document.getElementById(perModeId);
  if (state === 'loaded' || state === 'playing') {
    if (!existing) {
      const marker = document.createElement('div');
      marker.id = perModeId;
      marker.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
      marker.dataset.state = state;
      el.appendChild(marker);
    } else {
      existing.dataset.state = state;
    }
  } else if (existing) {
    existing.remove();                       // a reload must clear the marker
  }

  const detail: ReadyDetail = { modeId, state, at: Date.now(), error };
  window.dispatchEvent(new CustomEvent('fel:ready', { detail }));
  if (state === 'failed') console.error(`[FEL-READY] ${modeId} FAILED: ${error ?? 'unknown'}`);
  else console.info(`[FEL-READY] ${modeId} → ${state}`);
}

/** Clear everything on mode teardown so the next mode starts honest. */
export function clearReady(): void {
  const el = typeof document !== 'undefined' ? document.getElementById(NODE_ID) : null;
  el?.remove();
}

// WIRING — ModeHarness, three lines total:
//   at the start of a mode load:            setReady(mode.modeId, 'loading');
//   after load() resolves + first render:   setReady(mode.modeId, 'loaded');
//   when the update loop starts running:    setReady(mode.modeId, 'playing');
//   in the harness's error path:            setReady(mode.modeId, 'failed', msg);
//   on dispose:                             clearReady();
