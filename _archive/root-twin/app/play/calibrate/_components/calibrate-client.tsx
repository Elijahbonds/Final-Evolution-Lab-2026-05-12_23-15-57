'use client';

/**
 * PHASE 9 / Handoff PART 8.2 — audio-latency calibration screen.
 *
 * AUDIO CLOCK LAW (Part 8.1): the beat clock is audioContext.currentTime ONLY.
 * Metronome clicks are scheduled ahead of time against that clock; every tap is
 * timestamped by reading audioContext.currentTime in the input handler. No
 * setTimeout / performance.now / render-loop timing is used for measurement.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Timer, Play, RotateCcw, Check, Minus, Plus } from 'lucide-react';
import {
  CALIBRATION,
  BEAT_INTERVAL_S,
  computeOffsetMs,
  nudgeOffset,
  loadAudioOffsetMs,
  saveAudioOffsetMs,
} from '@/lib/feel/rhythm-calibrate';

type Phase = 'idle' | 'running' | 'done';

// TUNE(elijah) — beats of silent lead-in before taps count, so the player locks the tempo.
const LEAD_IN_BEATS = 4;

export function CalibrateClient() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [saved, setSaved] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);
  const [tapCount, setTapCount] = useState<number>(0);
  const [beatPulse, setBeatPulse] = useState<number>(-1);

  const ctxRef = useRef<AudioContext | null>(null);
  const beatTimesRef = useRef<number[]>([]); // audio-clock times of the countable beats
  const tapsRef = useRef<{ beat: number; tap: number }[]>([]);
  const rafRef = useRef<number | null>(null);
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    setSaved(loadAudioOffsetMs());
  }, []);

  const cleanup = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => () => {
    cleanup();
    ctxRef.current?.close().catch(() => {});
  }, [cleanup]);

  const finish = useCallback(() => {
    cleanup();
    const pairs = tapsRef.current.slice(0, CALIBRATION.TAP_COUNT);
    const expected = pairs.map((p) => p.beat);
    const taps = pairs.map((p) => p.tap);
    const result = computeOffsetMs(expected, taps);
    setOffset(result);
    setPhase('done');
  }, [cleanup]);
  finishRef.current = finish;

  const start = useCallback(() => {
    cleanup();
    tapsRef.current = [];
    setTapCount(0);
    setOffset(0);
    setBeatPulse(-1);
    beatTimesRef.current = [];
    // Flip the UI into the running state FIRST so the click always produces an
    // immediate, visible response — even if Web Audio is unavailable or the
    // browser blocks it until a gesture settles. Audio is then set up
    // defensively below; no audio exception can swallow the button press.
    setPhase('running');

    const Ctx =
      typeof window !== 'undefined'
        ? window.AudioContext || (window as any).webkitAudioContext
        : null;
    if (!Ctx) return; // no Web Audio in this environment — UI still responds

    let ctx = ctxRef.current;
    try {
      if (!ctx) {
        ctx = new Ctx();
        ctxRef.current = ctx;
      }
      ctx.resume().catch(() => {});
    } catch {
      return; // audio construction blocked — stay on the running screen
    }

    const t0 = ctx.currentTime + 0.3; // small scheduling headroom
    const totalBeats = LEAD_IN_BEATS + CALIBRATION.TAP_COUNT;
    const countable: number[] = [];

    for (let i = 0; i < totalBeats; i++) {
      const when = t0 + i * BEAT_INTERVAL_S;
      const isCountable = i >= LEAD_IN_BEATS;
      // schedule a short click; accent the lead-in so the player knows counting has begun
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = isCountable ? 1000 : 1500;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.6, when + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.06);
      if (isCountable) countable.push(when);
    }
    beatTimesRef.current = countable;

    setPhase('running');

    const endTime = t0 + totalBeats * BEAT_INTERVAL_S + 0.4;
    const tick = () => {
      const now = ctx!.currentTime;
      // drive the visual pulse off the audio clock
      const idx = Math.floor((now - t0) / BEAT_INTERVAL_S);
      setBeatPulse(idx);
      if (now >= endTime) {
        finishRef.current();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [cleanup]);

  const registerTap = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || phase !== 'running') return;
    const beats = beatTimesRef.current;
    if (beats.length === 0) return;
    const now = ctx.currentTime;
    // pair the tap with the nearest countable beat
    let nearest = beats[0];
    let best = Math.abs(now - beats[0]);
    for (let i = 1; i < beats.length; i++) {
      const d = Math.abs(now - beats[i]);
      if (d < best) {
        best = d;
        nearest = beats[i];
      }
    }
    if (tapsRef.current.length < CALIBRATION.TAP_COUNT) {
      tapsRef.current.push({ beat: nearest, tap: now });
      setTapCount(tapsRef.current.length);
      if (tapsRef.current.length >= CALIBRATION.TAP_COUNT) finishRef.current();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        registerTap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, registerTap]);

  const applyNudge = useCallback(
    (dir: number) => {
      setOffset((o) => nudgeOffset(o, dir));
    },
    [],
  );

  const commit = useCallback(() => {
    saveAudioOffsetMs(offset);
    setSaved(offset);
  }, [offset]);

  const pulseActive = phase === 'running' && beatPulse >= 0;

  return (
    <div className="mt-6">
      <div className="fel-card rounded-2xl p-6 text-center">
        <div className="mx-auto flex h-40 w-40 items-center justify-center">
          <div
            className="flex h-32 w-32 items-center justify-center rounded-full transition-all duration-100"
            style={{
              background: pulseActive ? 'rgba(0,229,255,0.18)' : 'rgba(255,255,255,0.04)',
              border: `2px solid ${pulseActive ? '#00E5FF' : 'rgba(255,255,255,0.15)'}`,
              boxShadow: pulseActive ? '0 0 32px rgba(0,229,255,0.35)' : 'none',
              transform: pulseActive ? 'scale(1.06)' : 'scale(1)',
            }}
          >
            <Timer className="h-12 w-12" style={{ color: pulseActive ? '#00E5FF' : 'rgba(255,255,255,0.4)' }} />
          </div>
        </div>

        {phase === 'idle' && (
          <>
            <p className="mt-4 text-sm text-white/60">
              Press start, listen for the click, then tap <strong className="text-white">SPACE</strong> or the
              button on every beat. {CALIBRATION.TAP_COUNT} taps at {CALIBRATION.BPM} BPM.
            </p>
            <button
              onClick={start}
              className="fel-heading mt-5 inline-flex items-center gap-2 rounded-xl bg-[#00E5FF] px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.03]"
            >
              <Play className="h-4 w-4" /> START CALIBRATION
            </button>
          </>
        )}

        {phase === 'running' && (
          <>
            <p className="mt-4 text-sm text-white/60">Tap on every click…</p>
            <p className="fel-heading mt-1 text-2xl font-bold text-white">
              {tapCount} / {CALIBRATION.TAP_COUNT}
            </p>
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                registerTap();
              }}
              className="fel-heading mt-5 inline-flex select-none items-center gap-2 rounded-xl bg-[#00FF9D] px-10 py-4 text-base font-bold text-black transition-transform active:scale-95"
            >
              TAP
            </button>
          </>
        )}

        {phase === 'done' && (
          <>
            <p className="mt-4 text-sm text-white/60">Measured offset</p>
            <p className="fel-heading mt-1 text-4xl font-bold" style={{ color: '#00E5FF' }}>
              {offset > 0 ? '+' : ''}
              {offset} ms
            </p>
            <p className="mt-1 text-xs text-white/40">
              {offset > 0
                ? 'You tap slightly late — windows shift later to match.'
                : offset < 0
                  ? 'You tap slightly early — windows shift earlier to match.'
                  : 'Dead on the beat.'}
            </p>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => applyNudge(-1)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-white transition-colors hover:border-[#00E5FF]/50"
                aria-label="Decrease offset"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[64px] text-xs text-white/50">{CALIBRATION.STEP_MS} ms steps</span>
              <button
                onClick={() => applyNudge(1)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-white transition-colors hover:border-[#00E5FF]/50"
                aria-label="Increase offset"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={commit}
                className="fel-heading inline-flex items-center gap-2 rounded-xl bg-[#00FF9D] px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.03]"
              >
                <Check className="h-4 w-4" /> SAVE OFFSET
              </button>
              <button
                onClick={start}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-white/30"
              >
                <RotateCcw className="h-4 w-4" /> Recalibrate
              </button>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-white/45">
        <span>
          Saved offset: <strong className="text-white/80">{saved > 0 ? '+' : ''}{saved} ms</strong>
        </span>
        <Link href="/modes" className="text-[#00E5FF] hover:underline">
          Back to modes
        </Link>
      </div>
    </div>
  );
}
