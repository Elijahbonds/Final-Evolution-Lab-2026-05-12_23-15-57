'use client';

/**
 * PHASE 9 / Handoff PART 8.2 — audio-latency calibration screen.
 *
 * AUDIO CLOCK LAW (Part 8.1): the beat clock is audioContext.currentTime ONLY.
 * Metronome clicks are scheduled ahead of time against that clock; every tap is
 * timestamped by reading audioContext.currentTime in the input handler. No
 * setTimeout / performance.now / render-loop timing is used for measurement.
 *
 * MUSIC-SUITE P2 (2026-09-25): taps are read as phases on the click grid (readCalibrationTaps) instead of being paired
 * with the nearest click — a steady Bluetooth player 300 ms late was read as early — and the saved offset keeps the time
 * it was measured, shown beside it. `returnTo` (a same-origin path, already checked by the page) puts "Back to the room"
 * on the screen once the offset is saved.
 *
 * MUSIC-SUITE P2 FIX PASS (2026-09-25): both rooms now APPLY the saved offset, so what this screen saves must be a reading:
 *   - a held SPACE filled the run with key repeats (onKey had no e.repeat check): about 0.5 s of holding sent all 16
 *     taps at the OS repeat rate, at phases that have nothing to do with the click — isCalibrationTapKey drops repeats;
 *   - SAVE was offered on a reading the screen itself called uneven — savePanelAction offers only Recalibrate then;
 *   - the click played on this page's own AudioContext, which on an iPhone obeys the silent switch (assumption, not tried
 *     on a device), so a silenced phone "calibrated" to a click nobody heard — the run claims the 'playback' audio
 *     session first (lib/audio/session.ts) and gives it back when the screen goes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Timer, Play, RotateCcw, Check, Minus, Plus } from 'lucide-react';
import { claimPlaybackSession } from '@/lib/audio/session';
import {
  CALIBRATION,
  BEAT_INTERVAL_S,
  readCalibrationTaps,
  nudgeOffset,
  loadAudioCalibration,
  saveAudioOffsetMs,
  calibrationAgeText,
  type StoredCalibration,
} from '@/lib/feel/rhythm-calibrate';

type Phase = 'idle' | 'running' | 'done';

// TUNE(elijah) — beats of silent lead-in before taps count, so the player locks the tempo.
const LEAD_IN_BEATS = 4;

/**
 * The done panel's main button: SAVE OFFSET until this reading is saved; then BACK TO THE ROOM when the screen was opened
 * from a room (?return=), or a SAVED badge. A nudge after saving is a new reading, so SAVE comes back. A run with no taps
 * offers nothing to save — saving its 0 would overwrite a good reading with no reading.
 */
export function savePanelAction(s: { taps: number; justSaved: boolean; savedOffsetMs: number; offsetMs: number; returnTo: string | null; steady?: boolean }): 'none' | 'save' | 'back' | 'saved' {
  if (s.taps <= 0) return 'none';
  // MUSIC-SUITE P2 FIX PASS: an uneven reading ("Your taps were uneven") is not saved — the rooms would apply it
  if (s.steady === false && !s.justSaved) return 'none';
  if (!s.justSaved || s.savedOffsetMs !== s.offsetMs) return 'save';
  return s.returnTo ? 'back' : 'saved';
}

/** MUSIC-SUITE P2 FIX PASS: a keydown that is a calibration tap — SPACE, and never an OS key repeat of a held SPACE. */
export function isCalibrationTapKey(e: { key: string; code?: string; repeat?: boolean }): boolean {
  return (e.code === 'Space' || e.key === ' ') && !e.repeat;
}

/** What the measured offset says about this device, in the player's words. */
export function offsetLine(ms: number): string {
  if (ms >= 150) return 'Your sound reaches you late on this device — usual with Bluetooth headphones or a TV.';
  if (ms > 0) return 'You tap slightly late on this device.';
  if (ms < 0) return 'You tap slightly early on this device.';
  return 'Dead on the beat.';
}

export function CalibrateClient({ returnTo = null }: { returnTo?: string | null } = {}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [saved, setSaved] = useState<StoredCalibration>({ offsetMs: 0, measuredAt: null, saved: false });
  const [offset, setOffset] = useState<number>(0);
  const [steady, setSteady] = useState<boolean>(true);
  const [heard, setHeard] = useState<number>(0);
  const [justSaved, setJustSaved] = useState<boolean>(false);
  const [tapCount, setTapCount] = useState<number>(0);
  const [beatPulse, setBeatPulse] = useState<number>(-1);

  const ctxRef = useRef<AudioContext | null>(null);
  const beatTimesRef = useRef<number[]>([]); // audio-clock times of the countable beats
  const gridRef = useRef<number>(0);         // the first click's audio-clock time: every click is on this grid
  const tapsRef = useRef<number[]>([]);      // raw tap times (audio clock)
  const measuredAtRef = useRef<number>(0);   // wall-clock ms the reading finished (stored with the offset)
  const rafRef = useRef<number | null>(null);
  const finishRef = useRef<() => void>(() => {});
  /** MUSIC-SUITE P2 FIX PASS: gives back the 'playback' audio session the first run claimed. */
  const releaseSessionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setSaved(loadAudioCalibration());
  }, []);

  const cleanup = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => () => {
    cleanup();
    ctxRef.current?.close().catch(() => {});
    releaseSessionRef.current?.();
    releaseSessionRef.current = null;
  }, [cleanup]);

  const finish = useCallback(() => {
    cleanup();
    const reading = readCalibrationTaps(tapsRef.current.slice(0, CALIBRATION.TAP_COUNT), gridRef.current, BEAT_INTERVAL_S);
    measuredAtRef.current = Date.now();
    setOffset(reading.offsetMs);
    setSteady(reading.steady);
    setHeard(reading.taps);
    setPhase('done');
  }, [cleanup]);
  finishRef.current = finish;

  const start = useCallback(() => {
    cleanup();
    tapsRef.current = [];
    setTapCount(0);
    setOffset(0);
    setJustSaved(false);
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
        if (!releaseSessionRef.current) releaseSessionRef.current = claimPlaybackSession();   // before the context exists
        ctx = new Ctx();
        ctxRef.current = ctx;
      }
      ctx.resume().catch(() => {});
    } catch {
      return; // audio construction blocked — stay on the running screen
    }

    const t0 = ctx.currentTime + 0.3; // small scheduling headroom
    gridRef.current = t0;
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
    if (beatTimesRef.current.length === 0) return;
    // the tap's audio-clock time, read on the click grid when the run finishes (no pairing with a nearest beat: a tap
    // 300 ms late at a 600 ms beat is as near the next click as its own)
    if (tapsRef.current.length < CALIBRATION.TAP_COUNT) {
      tapsRef.current.push(ctx.currentTime);
      setTapCount(tapsRef.current.length);
      if (tapsRef.current.length >= CALIBRATION.TAP_COUNT) finishRef.current();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (isCalibrationTapKey(e)) registerTap();   // MUSIC-SUITE P2 FIX PASS: a held SPACE is one tap, not 16
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
    const measuredAt = measuredAtRef.current || Date.now();
    saveAudioOffsetMs(offset, measuredAt);
    setSaved({ offsetMs: offset, measuredAt, saved: true });
    setJustSaved(true);
  }, [offset]);

  const pulseActive = phase === 'running' && beatPulse >= 0;
  const savedAge = calibrationAgeText(saved.measuredAt, Date.now());
  const action = savePanelAction({ taps: heard, justSaved, savedOffsetMs: saved.offsetMs, offsetMs: offset, returnTo, steady });

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
            <p className="mt-1 text-xs text-white/40">{offsetLine(offset)}</p>
            {heard === 0 ? (
              <p className="mt-1 text-xs text-[#FFD700]">No taps heard — press Recalibrate and tap on every click.</p>
            ) : !steady ? (
              <p className="mt-1 text-xs text-[#FFD700]">Your taps were uneven, so this reading may be off. Try once more.</p>
            ) : null}

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
              {action === 'back' && returnTo ? (
                <Link
                  href={returnTo}
                  className="fel-heading inline-flex items-center gap-2 rounded-xl bg-[#00FF9D] px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.03]"
                >
                  <Check className="h-4 w-4" /> SAVED · BACK TO THE ROOM
                </Link>
              ) : action === 'saved' ? (
                <span className="fel-heading inline-flex items-center gap-2 rounded-xl border border-[#00FF9D]/50 px-6 py-3 text-sm font-bold text-[#00FF9D]">
                  <Check className="h-4 w-4" /> SAVED
                </span>
              ) : action === 'save' ? (
                <button
                  onClick={commit}
                  className="fel-heading inline-flex items-center gap-2 rounded-xl bg-[#00FF9D] px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.03]"
                >
                  <Check className="h-4 w-4" /> SAVE OFFSET
                </button>
              ) : null}
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

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-white/45">
        <span>
          {saved.saved ? (
            <>
              Saved offset: <strong className="text-white/80">{saved.offsetMs > 0 ? '+' : ''}{saved.offsetMs} ms</strong>
              {savedAge ? <span> · measured {savedAge}</span> : null}
            </>
          ) : (
            <>No offset saved on this device yet.</>
          )}
        </span>
        <Link href={returnTo ?? '/modes'} className="shrink-0 text-[#00E5FF] hover:underline">
          {returnTo ? 'Back to the room' : 'Back to modes'}
        </Link>
      </div>
    </div>
  );
}
