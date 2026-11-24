// loadMarks — where a mode's load spends its time (lane/improve-hoops, phase 3 of docs/IMPROVE-10-PHASE-AUDIT.md, 2026-11-22).
//
// The audit measured the hoops modes' READY at 2.5–3.5× the tennis control's on the phone tier, almost all of it BEFORE the shader
// pre-warm, but the harness logged only the pre-warm. These marks split the rest: the harness's own steps (the mode's load begun and
// ended, the pre-warm) and a mode's stages inside its load (the venue, each body, the physics, the court dressing).
//
// One line per mark, on the console the probes already read (walk.mts keeps `[FEL-LOAD]` lines):
//   [FEL-LOAD] onevone bodies +8123 ms (@14567 ms)
// `+` is the time since the previous mark of the same load; `@` is performance.now() (milliseconds since navigation). The marks of
// the page's latest load are also kept on `window.__felLoadMarks`, so a probe can read them without parsing the console. Logging
// only: nothing here changes what loads or when. Never throws.

export interface LoadMark { stage: string; at: number; dt: number }

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class LoadMarks {
  readonly marks: LoadMark[] = [];
  private last: number;
  constructor(readonly modeId: string, private readonly clock: () => number = now, private readonly log: (s: string) => void = (s) => console.info(s)) {
    this.last = clock();
    publish(this);
  }
  /** One stage finished (or a step reached). Returns the milliseconds since the previous mark. */
  mark(stage: string): number {
    try {
      const at = this.clock();
      const dt = at - this.last;
      this.last = at;
      this.marks.push({ stage, at, dt });
      this.log(`[FEL-LOAD] ${this.modeId} ${stage} +${Math.round(dt)} ms (@${Math.round(at)} ms)`);
      try { performance.mark(`fel-load:${this.modeId}:${stage}`); } catch { /* no User Timing */ }
      return dt;
    } catch { return 0; }
  }
  /** The stages longest first, as "stage ms" pairs (the probe's summary). */
  longest(n = 6): [string, number][] {
    return [...this.marks].sort((a, b) => b.dt - a.dt).slice(0, n).map((m) => [m.stage, Math.round(m.dt)]);
  }
}

let current: LoadMarks | null = null;
function publish(m: LoadMarks): void {
  current = m;
  try { if (typeof window !== 'undefined') (window as unknown as { __felLoadMarks?: LoadMark[] }).__felLoadMarks = m.marks; } catch { /* no window */ }
}

/** The load in progress (the harness starts one per attempt): a mode marks its own stages on it. A no-op mark when none. */
export function loadMarks(): { mark(stage: string): number } {
  return current ?? { mark: () => 0 };
}

/** The harness: a new timeline for this mode's load attempt. */
export function beginLoadMarks(modeId: string): LoadMarks { return new LoadMarks(modeId); }
