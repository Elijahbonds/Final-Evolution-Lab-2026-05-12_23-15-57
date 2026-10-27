'use client';

// goSignal — "On your marks", "Set", Go, from this phone (SPRINT-SPEED, 2026-10-25).
//
// The calls are beeps (one short for marks, two for set, one long and high for Go) with the screen flashing the words,
// so it works in any language and over a field. The Go's time is taken from the AUDIO clock the beep is scheduled on,
// mapped onto performance.now() (the clock PoseFrame.t is on), plus the output delay the browser reports
// (AudioContext.outputLatency + baseLatency) — not from when a timer fired. With no audio, the visual Go's own time is
// used and the output delay is unknown (lib/sprint/start.ts then widens the ±).
import type { GoPlan } from '@/lib/sprint/start';

export type GoCall = 'marks' | 'set' | 'go';

export interface GoHandle {
  /** Resolves when the Go has sounded: when it left the phone (ms, performance.now()) and the output delay, if known. */
  done: Promise<{ goAt: number; outputLatencyMs: number | null }>;
  cancel(): void;
}

type Ctx = AudioContext & { outputLatency?: number };

export function playGo(plan: GoPlan, onCall: (c: GoCall) => void): GoHandle {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let ctx: Ctx | null = null;
  try {
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    ctx = AC ? (new AC() as Ctx) : null;
  } catch { ctx = null; }
  const t0Perf = performance.now();
  const t0Audio = ctx?.currentTime ?? 0;
  const beep = (atS: number, hz: number, durS: number) => {
    if (!ctx) return;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = hz; o.type = 'square';
      g.gain.setValueAtTime(0.0001, t0Audio + atS);
      g.gain.exponentialRampToValueAtTime(0.6, t0Audio + atS + 0.005);
      g.gain.setValueAtTime(0.6, t0Audio + atS + durS - 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0Audio + atS + durS);
      o.connect(g).connect(ctx.destination);
      o.start(t0Audio + atS); o.stop(t0Audio + atS + durS + 0.02);
    } catch { /* no sound: the screen still calls it */ }
  };
  beep(plan.marksS + 0.05, 660, 0.12);
  beep(plan.setS, 660, 0.1); beep(plan.setS + 0.18, 660, 0.1);
  beep(plan.goS, 1320, 0.35);
  const audioOk = !!ctx && ctx.state === 'running';
  let resolve!: (v: { goAt: number; outputLatencyMs: number | null }) => void;
  const done = new Promise<{ goAt: number; outputLatencyMs: number | null }>((r) => { resolve = r; });
  const at = (s: number, fn: () => void) => timers.push(setTimeout(fn, Math.max(0, t0Perf + s * 1000 - performance.now())));
  at(plan.marksS, () => onCall('marks'));
  at(plan.setS, () => onCall('set'));
  at(plan.goS, () => {
    onCall('go');
    if (audioOk && ctx) {
      // getOutputTimestamp pairs an audio time with the performance.now() it reaches the speaker at: the delay is in it
      const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
      if (ts && typeof ts.contextTime === 'number' && typeof ts.performanceTime === 'number' && ts.performanceTime > 0) {
        resolve({ goAt: ts.performanceTime + (t0Audio + plan.goS - ts.contextTime) * 1000, outputLatencyMs: 0 });
      } else {
        const lat = (ctx.outputLatency ?? 0) + (ctx.baseLatency ?? 0);
        resolve({ goAt: t0Perf + plan.goS * 1000, outputLatencyMs: ctx.outputLatency !== undefined ? lat * 1000 : null });
      }
    } else resolve({ goAt: performance.now(), outputLatencyMs: null });
    timers.push(setTimeout(() => { void ctx?.close().catch(() => {}); }, 800));
  });
  return {
    done,
    cancel() { for (const t of timers) clearTimeout(t); void ctx?.close().catch(() => {}); },
  };
}
