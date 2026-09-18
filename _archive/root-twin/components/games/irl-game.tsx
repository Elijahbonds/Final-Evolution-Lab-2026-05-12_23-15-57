'use client';

// IRL mode — real vertical-jump measurement from device motion.
//
// HONEST BOUNDARY (see IRLCore header): this needs a real accelerometer, which
// on the web means a MOBILE browser with DeviceMotion permission. On desktop
// there is no sensor, so we say "PHONE REQUIRED" rather than showing a
// permanently empty counter. Height comes from measured airborne time, not
// integrated acceleration, and thrown-phone traces are rejected as cheating.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Smartphone, Activity, RotateCcw, Square } from 'lucide-react';
import {
  detectJumps,
  summarise,
  motionAvailability,
  type MotionSample,
  type IRLSession,
} from '@/lib/babylon/core/IRLCore';

const BG = '#050505';
const CYAN = '#00E5FF';
const RED = '#FF3366';
const GREEN = '#00FF9D';
const GOLD = '#FFD700';

type Phase = 'gate' | 'unsupported' | 'needs-permission' | 'live' | 'results';

type DME = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

export default function IrlGame() {
  const [phase, setPhase] = useState<Phase>('gate');
  const [jumpCount, setJumpCount] = useState(0);
  const [bestCm, setBestCm] = useState(0);
  const [session, setSession] = useState<IRLSession | null>(null);
  const [permError, setPermError] = useState<string | null>(null);

  const samplesRef = useRef<MotionSample[]>([]);
  const t0Ref = useRef(0);
  const handlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);

  // Decide the gate on mount (client only).
  useEffect(() => {
    const a = motionAvailability();
    if (a === 'unsupported') setPhase('unsupported');
    else if (a === 'needs-permission') setPhase('needs-permission');
    else setPhase('gate');
  }, []);

  const stopListening = useCallback(() => {
    if (handlerRef.current) {
      window.removeEventListener('devicemotion', handlerRef.current);
      handlerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  const startListening = useCallback(() => {
    samplesRef.current = [];
    t0Ref.current = performance.now();
    setJumpCount(0);
    setBestCm(0);
    setSession(null);
    const handler = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      const t = (performance.now() - t0Ref.current) / 1000;
      const buf = samplesRef.current;
      buf.push({ t, magnitude });
      // Live tally without freezing: re-scan the tail periodically.
      if (buf.length % 8 === 0) {
        const jumps = detectJumps(buf);
        if (jumps.length) {
          setJumpCount(jumps.length);
          setBestCm(Math.round(Math.max(...jumps.map((j) => j.height)) * 100));
        }
      }
    };
    handlerRef.current = handler;
    window.addEventListener('devicemotion', handler);
    setPhase('live');
  }, []);

  const requestPermission = useCallback(async () => {
    setPermError(null);
    const dme = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as DME | undefined;
    if (dme?.requestPermission) {
      try {
        const res = await dme.requestPermission();
        if (res !== 'granted') {
          setPermError('Motion access was denied. Enable it in your browser settings to measure jumps.');
          return;
        }
      } catch {
        setPermError('Could not request motion access on this device.');
        return;
      }
    }
    startListening();
  }, [startListening]);

  const finish = useCallback(() => {
    stopListening();
    const jumps = detectJumps(samplesRef.current);
    setSession(summarise(jumps));
    setPhase('results');
  }, [stopListening]);

  const reset = useCallback(() => {
    stopListening();
    setSession(null);
    const a = motionAvailability();
    setPhase(a === 'unsupported' ? 'unsupported' : a === 'needs-permission' ? 'needs-permission' : 'gate');
  }, [stopListening]);

  return (
    <div className="min-h-screen w-full" style={{ background: BG, color: '#fff' }}>
      <div className="mx-auto max-w-xl px-5 py-6">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/creator" className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Creator Hub
          </Link>
          <span className="text-xs font-semibold tracking-[0.3em]" style={{ color: GREEN }}>FEL · IRL</span>
        </div>

        {phase === 'unsupported' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <Smartphone className="mx-auto mb-4 h-12 w-12" style={{ color: RED }} />
            <h2 className="text-2xl font-bold">PHONE REQUIRED</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-white/60">
              IRL mode measures a real vertical jump from your phone&apos;s motion sensor. This device doesn&apos;t
              have one exposed to the browser — open this page on a phone and put it in your pocket to jump.
            </p>
          </div>
        )}

        {phase === 'gate' && (
          <IntroScreen onStart={startListening} />
        )}

        {phase === 'needs-permission' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <Activity className="mx-auto mb-4 h-12 w-12" style={{ color: CYAN }} />
            <h2 className="text-2xl font-bold">MOTION ACCESS</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-white/60">
              This phone requires your permission to read the motion sensor. Tap below, then allow access.
              Nothing is recorded or uploaded — samples stay on your device.
            </p>
            {permError && <p className="mt-3 text-sm" style={{ color: RED }}>{permError}</p>}
            <button onClick={requestPermission} className="mt-6 rounded-full px-8 py-3 text-sm font-bold text-black transition hover:scale-105" style={{ background: CYAN }}>
              Allow Motion &amp; Start
            </button>
          </div>
        )}

        {phase === 'live' && (
          <LiveScreen jumpCount={jumpCount} bestCm={bestCm} onFinish={finish} />
        )}

        {phase === 'results' && session && (
          <ResultsScreen session={session} onReplay={startListening} onMenu={reset} />
        )}
      </div>
    </div>
  );
}

function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <div>
      <h1 className="text-4xl font-black tracking-tight">HANG TIME</h1>
      <p className="mt-2 max-w-md text-sm text-white/60">
        Measure your real vertical. Hold your phone securely (a zipped pocket is best), start the session,
        and jump. Height is calculated from your airborne time — <span className="text-white/80">g·t²/8</span>.
      </p>
      <ul className="mt-4 space-y-1 text-xs text-white/40">
        <li>• Land softly on the balls of your feet.</li>
        <li>• Thrown or dropped phones are rejected, not scored.</li>
        <li>• Everything is measured locally.</li>
      </ul>
      <button onClick={onStart} className="mt-8 rounded-full px-8 py-3 text-sm font-bold text-black transition hover:scale-105" style={{ background: GREEN }}>
        Start Session
      </button>
    </div>
  );
}

function LiveScreen({ jumpCount, bestCm, onFinish }: { jumpCount: number; bestCm: number; onFinish: () => void }) {
  return (
    <div className="text-center">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 text-xs" style={{ color: GREEN }}>
        <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: GREEN }} /> LIVE · jump now
      </div>
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <div className="text-7xl font-black tabular-nums" style={{ color: GOLD }}>{bestCm}</div>
        <div className="mt-1 text-sm text-white/50">best cm this session</div>
        <div className="mt-6 text-3xl font-bold tabular-nums" style={{ color: CYAN }}>{jumpCount}</div>
        <div className="mt-1 text-sm text-white/50">jumps detected</div>
      </div>
      <button onClick={onFinish} className="mt-8 inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-bold text-black transition hover:scale-105" style={{ background: RED }}>
        <Square className="h-4 w-4" /> End Session
      </button>
    </div>
  );
}

function ResultsScreen({ session, onReplay, onMenu }: { session: IRLSession; onReplay: () => void; onMenu: () => void }) {
  const bestCm = Math.round(session.best * 100);
  const avgCm = Math.round(session.average * 100);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
      <h2 className="text-3xl font-black">SESSION</h2>
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="best" value={`${bestCm}`} unit="cm" color={GOLD} />
        <Stat label="jumps" value={`${session.total}`} unit="" color={CYAN} />
        <Stat label="avg" value={`${avgCm}`} unit="cm" color={GREEN} />
      </div>
      {session.total === 0 && (
        <p className="mt-5 text-sm text-white/50">No clean jumps detected. Secure the phone and push off harder — a real jump needs measurable hang time.</p>
      )}
      <div className="mt-6 flex gap-3">
        <button onClick={onReplay} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-black" style={{ background: CYAN }}>
          <RotateCcw className="h-4 w-4" /> Go Again
        </button>
        <button onClick={onMenu} className="flex-1 rounded-full border border-white/20 py-3 text-sm font-bold transition hover:bg-white/10">
          Done
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <div className="text-3xl font-black tabular-nums" style={{ color }}>{value}<span className="text-base font-normal text-white/40">{unit}</span></div>
      <div className="mt-1 text-xs uppercase tracking-widest text-white/40">{label}</div>
    </div>
  );
}
