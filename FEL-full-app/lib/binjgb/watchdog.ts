// lib/binjgb/watchdog.ts — BINJGB-SHELF-1 F4 (Cyber build review dcbbec16): the local player must never hang silently.
// From the moment the frame is mounted, the frame has START_TIMEOUT_MS to report `started`; otherwise the parent stops the
// player and shows SHELF_COPY.wasmFail. (The frame itself also reports `failed` on any throw — lib/binjgb/frameDoc.ts.)

export const START_TIMEOUT_MS = 10_000;

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

/** Arm the start watchdog. Returns the disarm function (call it on `started`, `failed`, stop or unmount). */
export function armStartWatchdog(onTimeout: () => void, timers: Timers = defaultTimers, ms: number = START_TIMEOUT_MS): () => void {
  let live = true;
  const handle = timers.setTimeout(() => {
    if (!live) return;
    live = false;
    onTimeout();
  }, ms);
  return () => {
    if (!live) return;
    live = false;
    timers.clearTimeout(handle);
  };
}
