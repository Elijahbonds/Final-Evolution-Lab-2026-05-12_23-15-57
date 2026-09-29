'use client';
// The Today card's timer strip (MIRROR-COACH P2, 2026-09-25): Work / Hold / Rest buttons for whatever the prescription
// times, a clock with a progress bar, pause and stop. A finished — or stopped — WORK run hands its seconds to the card,
// which writes them into the next set row, so a timed set is logged by timing it. The arithmetic (what a run reads at
// an instant, when the 3-2-1 ticks fall, what a stopped run logs) is lib/coach/setTimer.ts and tested there; this file
// owns only requestAnimationFrame and two FEL sine blips (Web Audio, generated here, no sample file).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Square, Timer, Volume2, VolumeX } from 'lucide-react';
import {
  CUE_TONES, cueBetween, formatClock, pauseRun, resumeRun, runView, secondsWorked, startRun, type TimerRun, type TimerSpec,
} from '@/lib/coach/setTimer';

const SOUND_KEY = 'fel.timerSound';
const readSound = (): boolean => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } };
const writeSound = (on: boolean) => { try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* storage blocked: the switch still works this visit */ } };

type AudioCtor = typeof AudioContext;
function blip(ctx: AudioContext | null, tone: { hz: number; ms: number; gain: number }) {
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = tone.hz;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(tone.gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + tone.ms / 1000);
    osc.connect(g).connect(ctx.destination);
    osc.start(t); osc.stop(t + tone.ms / 1000 + 0.02);
  } catch { /* an audio device that refuses a node: the clock still runs */ }
}

export function SetTimer({ timers, onWorkLogged, testId }: { timers: readonly TimerSpec[]; onWorkLogged?: (seconds: number) => void; testId?: string }) {
  const [run, setRun] = useState<TimerRun | null>(null);
  const [now, setNow] = useState(0);
  const [sound, setSound] = useState(true);
  const ctx = useRef<AudioContext | null>(null);
  const last = useRef(0);
  const logged = useRef(false);
  useEffect(() => { setSound(readSound()); }, []);

  // the frame loop: advance the clock, play the cue that fell between this frame and the last, finish the run
  useEffect(() => {
    if (!run || run.pausedAt !== null) return;
    let raf = 0;
    const step = () => {
      const t = performance.now();
      const cue = cueBetween(run, last.current, t);
      last.current = t;
      if (cue && sound) blip(ctx.current, CUE_TONES[cue]);
      if (cue === 'end') { try { navigator.vibrate?.(200); } catch { /* not a phone */ } }
      setNow(t);
      if (runView(run, t).done) {
        if (run.kind === 'work' && !logged.current) { logged.current = true; onWorkLogged?.(run.seconds); }
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, sound, onWorkLogged]);

  const start = useCallback((spec: TimerSpec) => {
    // the AudioContext is made on the tap, the one moment a browser lets a page start sound
    if (!ctx.current) { try { const A = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext); ctx.current = A ? new A() : null; } catch { ctx.current = null; } }
    void ctx.current?.resume?.();
    const t = performance.now();
    last.current = t; logged.current = false;
    setNow(t); setRun(startRun(spec, t));
  }, []);
  const stop = () => {
    if (run && run.kind === 'work' && !logged.current) {
      const s = secondsWorked(run, performance.now());
      logged.current = true;
      if (s !== null) onWorkLogged?.(s);
    }
    setRun(null);
  };
  const togglePause = () => {
    if (!run) return;
    const t = performance.now();
    if (run.pausedAt === null) setRun(pauseRun(run, t));
    else { last.current = t; setRun(resumeRun(run, t)); }
  };

  if (!timers.length) return null;
  const view = run ? runView(run, run.pausedAt ?? now) : null;
  return (
    <div className="rounded-lg border border-white/8 bg-black/20 p-2 space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Timer className="h-3.5 w-3.5 text-white/40" aria-hidden="true" />
        {timers.map((t) => (
          <button key={t.kind} type="button" onClick={() => start(t)} data-timer={t.kind}
            className={`rounded-md border px-2 py-1 text-xs ${run?.kind === t.kind ? 'border-[#00E5FF]/50 bg-[#00E5FF]/10 text-[#00E5FF]' : 'border-white/10 text-white/70'}`}>
            {t.label}
          </button>
        ))}
        <button type="button" onClick={() => { const on = !sound; setSound(on); writeSound(on); }} aria-label={sound ? 'Mute the timer' : 'Unmute the timer'} className="ml-auto text-white/40 hover:text-white">
          {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </button>
      </div>
      {run && view && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider text-white/40">{run.kind}{view.done ? ' · done' : view.paused ? ' · paused' : ''}</div>
            <div className="font-mono text-2xl tabular-nums text-white" data-testid={testId ? `${testId}-clock` : undefined} aria-live="off">{formatClock(view.remaining)}</div>
            <div className="flex items-center gap-1">
              {!view.done && <button type="button" onClick={togglePause} aria-label={view.paused ? 'Resume' : 'Pause'} className="rounded-md border border-white/10 p-1.5 text-white/70">{view.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}</button>}
              <button type="button" onClick={stop} aria-label={view.done ? 'Close the timer' : run.kind === 'work' ? 'Stop and log the time' : 'Stop'} className="rounded-md border border-white/10 p-1.5 text-white/70"><Square className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full ${run.kind === 'rest' ? 'bg-white/40' : 'bg-[#00E5FF]'}`} style={{ width: `${Math.round(view.fraction * 100)}%` }} />
          </div>
          {run.kind === 'work' && <div className="text-[11px] text-white/40">{view.done ? 'Logged in the next set.' : 'Stop early and the seconds you worked go in the next set.'}</div>}
        </div>
      )}
    </div>
  );
}
