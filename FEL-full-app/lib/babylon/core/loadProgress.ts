// loadProgress — the load timer watches the DOWNLOAD, not the clock (FIRST-DUNK-BUDGET, 2026-10-17).
//
// THE PROBLEM (AM's phone run, 2026-10-17). The harness gave a mode's load() a flat 20 s (ModeHarness LOAD_WATCHDOG_MS) and then
// showed "Load timed out — check your connection and retry". On a phone on 4G with a slowed CPU the dunk was still pulling its
// ~25 MB when that fired, at about 34 s from the tap: a guest who was downloading fine was told the connection had failed, and
// never played.
//
// THE FIX. The watchdog now fires only when the load has STOPPED: LOAD_WATCHDOG_MS of waiting with nothing arriving. "Arriving" is
// any of: bytes of a Babylon file request (the XHR progress of every GLB, texture and environment file — Babylon makes those
// requests itself, so its WebRequest is where the bytes can be seen), a finished resource of any kind (a fetch, an audio file, a
// script chunk: the Resource Timing entry), or a loader step (a glTF parsed, a mesh, a texture or a material built). A slow
// download keeps the splash up for as long as it keeps moving; a dead one still reaches the error screen and its RETRY.
//
// THE CLOCK COUNTS WAITING, NOT BLOCKING. Each look adds the time since the last look, capped at `maxStepMs`: a main thread busy
// parsing a GLB for 10 s (a slow phone) makes the next look late, and that lateness is the CPU working, not the network stalling.
// A background tab's timers are throttled the same way, so a hidden load is not failed for the browser's own pause.

import { SceneLoader, WebRequest } from '@babylonjs/core';

let ticks = 0;

/** Something arrived: bytes of a file, a finished file, a loader step. A mode may call it for a step of its own. */
export function noteLoadProgress(): void { ticks++; }

/** How many things have arrived since the page loaded. Only its CHANGE means anything. */
export function loadProgressTicks(): number { return ticks; }

/** The glTF loader's own steps (GLTFFileLoader's observables), read off whatever plugin activates. */
type StepObservable = { add(cb: () => void): unknown };
const STEP_OBSERVABLES = ['onParsedObservable', 'onMeshLoadedObservable', 'onTextureLoadedObservable', 'onMaterialLoadedObservable', 'onCompleteObservable'] as const;

let installed = false;
/** Hook the three sources once per page. Safe to call on every load; a no-op outside a browser. */
export function installLoadProgress(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // 1. BYTES. Every GLB, texture and .env file goes through Babylon's WebRequest (fileTools RequestFile), and only the request itself
  //    reports progress — so its send() adds one more listener. Nothing else about the request changes.
  const send = WebRequest.prototype.send;
  WebRequest.prototype.send = function sendWithProgress(this: WebRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
    this.addEventListener('progress', noteLoadProgress);
    send.call(this, body);
  };
  // 2. FINISHED FILES of any kind: a fetch (the voice packs), an <audio>, a script chunk.
  try {
    if (typeof PerformanceObserver !== 'undefined') new PerformanceObserver((list) => { if (list.getEntries().length) noteLoadProgress(); }).observe({ type: 'resource' });
  } catch { /* no Resource Timing: the bytes and the steps still count */ }
  // 3. LOADER STEPS: a GLB parsed and its meshes, textures and materials built — the CPU half of a load, which sends no bytes.
  SceneLoader.OnPluginActivatedObservable.add((plugin) => {
    const p = plugin as unknown as Partial<Record<(typeof STEP_OBSERVABLES)[number], StepObservable>>;
    for (const k of STEP_OBSERVABLES) p[k]?.add(noteLoadProgress);
  });
}

/** One load's stall clock: true once `stallMs` of waiting has passed with nothing arriving. */
export class LoadStallClock {
  private idleMs = 0;
  private seen: number;
  private at: number;
  constructor(
    private readonly stallMs: number,
    /** The most one look may add: a look that comes late was the main thread busy (or a hidden tab), not the network. */
    private readonly maxStepMs = 2_000,
    private readonly read: () => number = loadProgressTicks,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.seen = read();
    this.at = now();
  }

  /** One look. Anything new since the last look starts the wait over. */
  stalled(): boolean {
    const t = this.now();
    const dt = Math.min(Math.max(0, t - this.at), this.maxStepMs);
    this.at = t;
    const n = this.read();
    if (n !== this.seen) { this.seen = n; this.idleMs = 0; return false; }
    this.idleMs += dt;
    return this.idleMs >= this.stallMs;
  }
}
