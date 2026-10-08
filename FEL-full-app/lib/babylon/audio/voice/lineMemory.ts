// lineMemory: which lines a voice has said lately, kept on this device (VOICEOVER, 2026-10-06).
//
// Owner: "too repetitive". The evidence: MicDirector kept a no-repeat ring per voice and moment, but only for one ModeMic, and a
// ModeMic lives one run; every new run (and every page load) started the ring empty, so the four `intro.court` lines and the
// eight `filler.banter` lines came round again from scratch: the same welcome two runs in a row was as likely as any other.
// The host rooms (Stoop, Okta) only promised "never the same line twice in a row" (hostVoice.pickHostLine).
//
// This is a SHUFFLE BAG per key (a voice and a moment): every line in the pool is said once before any line is said again, and
// the line that closed a round is never the first of the next. The bag is remembered across runs and page loads on this device
// (localStorage, small and capped), so the second run picks up where the first left off.
// Pure apart from `deviceLineMemory()` (a guarded localStorage read/write); the bag logic takes its random source.

import { noteThinPool } from './voiceGaps';

export interface LineMemoryState { v: 1; keys: Record<string, { used: string[]; t: number }> }

// TUNED (VOICEOVER 2026-10-06): 120 keys x 8 ids is ~25 KB of localStorage at most: the whole cast of one court (MC, sidekick,
// crowd, players) across every moment a run uses. A pool bigger than 9 becomes "no repeat within the last 8" instead of a full
// round, which no listener can tell apart.
export const MEMORY_KEYS = 120;
export const MEMORY_PER_KEY = 8;
export const LINE_MEMORY_KEY = 'fel-voice-lines';

export class LineMemory {
  private readonly keys = new Map<string, { used: string[]; t: number }>();
  private clock = 0;
  /** Called after every change (the device copy debounces its save on it). */
  onChange: (() => void) | null = null;

  constructor(state?: LineMemoryState | null, private readonly maxKeys = MEMORY_KEYS, private readonly perKey = MEMORY_PER_KEY) {
    if (state?.v === 1 && state.keys && typeof state.keys === 'object') {
      for (const [k, e] of Object.entries(state.keys)) {
        if (Array.isArray(e?.used)) { this.keys.set(k, { used: e.used.filter((x) => typeof x === 'string').slice(-perKey), t: Number(e.t) || 0 }); this.clock = Math.max(this.clock, Number(e.t) || 0); }
      }
    }
  }

  /** The next line for `key` from `pool`: one not yet said this round; a new round never opens with the line that closed the last. */
  pick<T extends { id: string }>(key: string, pool: readonly T[], rnd: () => number, weight?: (l: T) => number): T {
    if (!pool.length) throw new Error('LineMemory.pick: empty pool');
    noteThinPool(key, pool.length);
    const used = this.keys.get(key)?.used ?? [];
    let cands = pool.filter((l) => !used.includes(l.id));
    if (!cands.length) {
      const last = used[used.length - 1];
      cands = pool.length > 1 ? pool.filter((l) => l.id !== last) : [...pool];
      this.keys.set(key, { used: last ? [last] : [], t: this.clock });   // a new round, remembering only the line that closed the old one
    }
    const w = cands.map((l) => Math.max(0, weight ? weight(l) : 1));
    const total = w.reduce((a, b) => a + b, 0);
    let chosen = cands[cands.length - 1];
    if (total > 0) { let r = rnd() * total; for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) { chosen = cands[i]; break; } } }
    else chosen = cands[Math.floor(rnd() * cands.length) % cands.length];
    return chosen;
  }

  /** `id` was said for `key` (after a pick that was committed, or a prefetched line that was spoken). */
  mark(key: string, id: string): void {
    const e = this.keys.get(key) ?? { used: [], t: 0 };
    e.used = e.used.filter((x) => x !== id); e.used.push(id);
    while (e.used.length > this.perKey) e.used.shift();
    e.t = ++this.clock;
    this.keys.delete(key); this.keys.set(key, e);
    while (this.keys.size > this.maxKeys) {
      let oldest: string | null = null, ot = Infinity;
      for (const [k, v] of this.keys) if (v.t < ot) { ot = v.t; oldest = k; }
      if (oldest === null) break;
      this.keys.delete(oldest);
    }
    this.onChange?.();
  }

  /** Lines said this round for `key` (oldest first). */
  said(key: string): readonly string[] { return this.keys.get(key)?.used ?? []; }

  toJSON(): LineMemoryState {
    const keys: LineMemoryState['keys'] = {};
    for (const [k, v] of this.keys) keys[k] = { used: [...v.used], t: v.t };
    return { v: 1, keys };
  }
}

let device: LineMemory | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** The one memory on this device (loaded once; saved a moment after it changes). Never throws: a private window or a corrupt
 *  value is an empty memory that lasts the page. */
export function deviceLineMemory(): LineMemory {
  if (device) return device;
  let state: LineMemoryState | null = null;
  try { if (typeof localStorage !== 'undefined') state = JSON.parse(localStorage.getItem(LINE_MEMORY_KEY) ?? 'null') as LineMemoryState | null; }
  catch { state = null; }
  device = new LineMemory(state);
  device.onChange = () => {
    if (saveTimer || typeof localStorage === 'undefined') return;
    saveTimer = setTimeout(() => { saveTimer = null; saveLineMemory(); }, 1500);
  };
  return device;
}
/** Write the device memory now (a run ending). */
export function saveLineMemory(): void {
  if (!device) return;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LINE_MEMORY_KEY, JSON.stringify(device.toJSON())); }
  catch { /* quota or private mode: the memory lasts the page */ }
}
/** Tests only: forget the device copy. */
export function resetDeviceLineMemory(): void { device = null; if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } }
