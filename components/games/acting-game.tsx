'use client';

// Acting mode — the delivery-scoring surface for ActingCore.
//
// HONEST BOUNDARY (see ActingCore header): this does NOT do speech
// recognition. It judges DELIVERY — timing against the cue, loudness vs the
// line's intensity band, and dynamic range — measured locally with the Web
// Audio API. Audio never leaves the device. If the mic is denied or missing
// we say so plainly rather than scoring silence as zero.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mic, MicOff, Play, RotateCcw, Star } from 'lucide-react';
import { ACTING_SCENES } from '@/lib/babylon/content/actingScenes';
import type { GameProps } from '@/components/games/game-shell';
import {
  scorePerformance,
  type Delivery,
  type Scene,
  type PerformanceResult,
  type LineIntensity,
} from '@/lib/babylon/core/ActingCore';

// Palette (design tokens).
const BG = '#050505';
const CYAN = '#00E5FF';
const RED = '#FF3366';
const GREEN = '#00FF9D';
const GOLD = '#FFD700';
const PURPLE = '#A855F7';

// RMS envelope sample rate while a line is being delivered. //TUNE(elijah)
const SAMPLE_HZ = 30;

type Phase = 'menu' | 'mic-denied' | 'unsupported' | 'ready' | 'performing' | 'results';

const INTENSITY_COLOR: Record<LineIntensity, string> = {
  whisper: PURPLE,
  calm: CYAN,
  raised: GOLD,
  shout: RED,
};

function supportsMic(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined';
}

// Mounted through <GameShell> (app/play/acting/_components/loader.tsx), which
// owns the shared input contract and the progression choke point: reporting the
// finished scene via `onEnd` is what earns XP / shards / credits / PRQ and feeds
// the mastery ladder. The in-mode ResultsScreen still renders the per-line
// delivery breakdown underneath GameShell's reward recap.
export default function ActingGame({ onEnd }: GameProps) {
  const [phase, setPhase] = useState<Phase>('menu');
  const [scene, setScene] = useState<Scene>(ACTING_SCENES[0]);
  const [elapsed, setElapsed] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [holding, setHolding] = useState(false);
  const [liveLevel, setLiveLevel] = useState(0);
  const [result, setResult] = useState<PerformanceResult | null>(null);

  // Audio graph refs.
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const t0Ref = useRef(0);

  // Per-line capture state.
  const deliveriesRef = useRef<Record<string, Delivery>>({});
  const activeRef = useRef<{ lineId: string; startedAt: number; envelope: number[]; lastSample: number } | null>(null);
  const holdingRef = useRef(false);

  const cleanupAudio = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== 'closed') ctxRef.current.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => () => cleanupAudio(), [cleanupAudio]);

  const measureRms = useCallback((): number => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }, []);

  const loop = useCallback(() => {
    const now = performance.now();
    const t = (now - t0Ref.current) / 1000;
    setElapsed(t);
    const level = measureRms();
    setLiveLevel(level);
    const active = activeRef.current;
    if (active && holdingRef.current) {
      const interval = 1 / SAMPLE_HZ;
      if (t - active.lastSample >= interval) {
        active.envelope.push(level);
        active.lastSample = t;
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [measureRms]);

  const beginPerformance = useCallback(async () => {
    if (!supportsMic()) {
      setPhase('unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      analyserRef.current = analyser;
      deliveriesRef.current = {};
      activeRef.current = null;
      holdingRef.current = false;
      setResult(null);
      setCurrentIdx(0);
      setHolding(false);
      t0Ref.current = performance.now();
      setPhase('performing');
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      setPhase('mic-denied');
    }
  }, [loop]);

  const startHold = useCallback(() => {
    if (phase !== 'performing' || holdingRef.current) return;
    const idx = currentIdx;
    const line = scene.lines[idx];
    if (!line) return;
    const t = (performance.now() - t0Ref.current) / 1000;
    activeRef.current = { lineId: line.id, startedAt: t, envelope: [], lastSample: t };
    holdingRef.current = true;
    setHolding(true);
  }, [phase, currentIdx, scene]);

  const endHold = useCallback(() => {
    if (!holdingRef.current) return;
    const active = activeRef.current;
    holdingRef.current = false;
    setHolding(false);
    if (active) {
      const t = (performance.now() - t0Ref.current) / 1000;
      deliveriesRef.current[active.lineId] = {
        startedAt: active.startedAt,
        endedAt: t,
        envelope: active.envelope.length ? active.envelope : [0],
      };
      activeRef.current = null;
      setCurrentIdx((i) => i + 1);
    }
  }, []);

  const finish = useCallback(() => {
    const res = scorePerformance(scene, deliveriesRef.current);
    const duration = t0Ref.current ? (performance.now() - t0Ref.current) / 1000 : 0;
    setResult(res);
    cleanupAudio();
    setPhase('results');
    // Score is the delivery average on a 0-100 scale; 3+ stars is a clean take.
    onEnd({
      score: Math.round(res.average * 100),
      won: res.stars >= 3,
      duration,
      headline: res.stars >= 3 ? 'SCENE NAILED' : 'SCENE COMPLETE',
    });
  }, [scene, cleanupAudio, onEnd]);

  // Auto-finish once every line has been delivered.
  useEffect(() => {
    if (phase === 'performing' && currentIdx >= scene.lines.length) {
      const id = setTimeout(finish, 400);
      return () => clearTimeout(id);
    }
  }, [phase, currentIdx, scene.lines.length, finish]);

  const quit = useCallback(() => {
    cleanupAudio();
    setPhase('menu');
    setResult(null);
  }, [cleanupAudio]);

  return (
    <div className="min-h-screen w-full" style={{ background: BG, color: '#fff' }}>
      <div className="mx-auto max-w-3xl px-5 py-6">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/creator" className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Creator Hub
          </Link>
          <span className="text-xs font-semibold tracking-[0.3em]" style={{ color: RED }}>FEL · ACTING</span>
        </div>

        {phase === 'menu' && (
          <MenuScreen scene={scene} setScene={setScene} onStart={() => setPhase('ready')} />
        )}

        {phase === 'ready' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <Mic className="mx-auto mb-4 h-12 w-12" style={{ color: CYAN }} />
            <h2 className="text-2xl font-bold">{scene.title}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-white/60">
              You&apos;ll deliver {scene.lines.length} lines. Hold the button while you speak each one,
              hitting the cue and matching its intensity. The mic stays on your device — nothing is uploaded.
            </p>
            <button
              onClick={beginPerformance}
              className="mt-6 inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-bold text-black transition hover:scale-105"
              style={{ background: GREEN }}
            >
              <Play className="h-4 w-4" /> Enable Mic &amp; Start
            </button>
          </div>
        )}

        {phase === 'mic-denied' && (
          <StatusScreen
            icon={<MicOff className="mx-auto mb-4 h-12 w-12" style={{ color: RED }} />}
            title="MICROPHONE NEEDED"
            body="Acting mode scores your delivery from your microphone. Grant mic access in your browser and try again — the audio never leaves your device."
            actionLabel="Try Again"
            onAction={() => setPhase('ready')}
          />
        )}

        {phase === 'unsupported' && (
          <StatusScreen
            icon={<MicOff className="mx-auto mb-4 h-12 w-12" style={{ color: RED }} />}
            title="MIC NOT SUPPORTED"
            body="This browser doesn't expose microphone capture the way Acting mode needs. Try a current mobile or desktop browser."
            actionLabel="Back"
            onAction={quit}
          />
        )}

        {phase === 'performing' && (
          <PerformScreen
            scene={scene}
            elapsed={elapsed}
            currentIdx={currentIdx}
            holding={holding}
            liveLevel={liveLevel}
            onHoldStart={startHold}
            onHoldEnd={endHold}
            onFinish={finish}
          />
        )}

        {phase === 'results' && result && (
          <ResultsScreen scene={scene} result={result} onReplay={() => setPhase('ready')} onMenu={quit} />
        )}
      </div>
    </div>
  );
}

function MenuScreen({ scene, setScene, onStart }: { scene: Scene; setScene: (s: Scene) => void; onStart: () => void }) {
  return (
    <div>
      <h1 className="text-4xl font-black tracking-tight">THE READ</h1>
      <p className="mt-2 max-w-xl text-sm text-white/60">
        Original scenes. Hit the cue, match the intensity, and vary your delivery. Pick a scene:
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {ACTING_SCENES.map((s) => {
          const active = s.id === scene.id;
          return (
            <button
              key={s.id}
              onClick={() => setScene(s)}
              className="rounded-xl border p-4 text-left transition"
              style={{
                borderColor: active ? CYAN : 'rgba(255,255,255,0.1)',
                background: active ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.03)',
              }}
            >
              <div className="text-base font-bold">{s.title}</div>
              <div className="mt-1 text-xs text-white/50">{s.lines.length} lines</div>
            </button>
          );
        })}
      </div>
      <button
        onClick={onStart}
        className="mt-8 inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-bold text-black transition hover:scale-105"
        style={{ background: CYAN }}
      >
        <Play className="h-4 w-4" /> Rehearse {scene.title}
      </button>
    </div>
  );
}

function StatusScreen({
  icon, title, body, actionLabel, onAction,
}: { icon: React.ReactNode; title: string; body: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
      {icon}
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-white/60">{body}</p>
      <button onClick={onAction} className="mt-6 rounded-full border border-white/20 px-8 py-3 text-sm font-bold transition hover:bg-white/10">
        {actionLabel}
      </button>
    </div>
  );
}

function PerformScreen({
  scene, elapsed, currentIdx, holding, liveLevel, onHoldStart, onHoldEnd, onFinish,
}: {
  scene: Scene; elapsed: number; currentIdx: number; holding: boolean; liveLevel: number;
  onHoldStart: () => void; onHoldEnd: () => void; onFinish: () => void;
}) {
  const line = scene.lines[currentIdx];
  const done = currentIdx >= scene.lines.length;
  const meterPct = Math.min(100, Math.round(liveLevel * 180));
  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-xs text-white/50">
        <span>{scene.title}</span>
        <span>{elapsed.toFixed(1)}s</span>
      </div>
      <div className="space-y-2">
        {scene.lines.map((l, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming';
          return (
            <div
              key={l.id}
              className="rounded-lg border p-3 transition"
              style={{
                borderColor: state === 'current' ? INTENSITY_COLOR[l.intensity] : 'rgba(255,255,255,0.08)',
                opacity: state === 'upcoming' ? 0.4 : 1,
                background: state === 'current' ? 'rgba(255,255,255,0.05)' : 'transparent',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: INTENSITY_COLOR[l.intensity] }}>
                  {l.intensity} · cue {l.cueAt.toFixed(1)}s
                </span>
                {state === 'done' && <span className="text-[10px]" style={{ color: GREEN }}>✓</span>}
              </div>
              <div className="mt-1 text-lg font-semibold">{l.text}</div>
            </div>
          );
        })}
      </div>

      {!done && line && (
        <div className="mt-6">
          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all" style={{ width: `${meterPct}%`, background: holding ? GREEN : CYAN }} />
          </div>
          <button
            onMouseDown={onHoldStart}
            onMouseUp={onHoldEnd}
            onMouseLeave={() => holding && onHoldEnd()}
            onTouchStart={(e) => { e.preventDefault(); onHoldStart(); }}
            onTouchEnd={(e) => { e.preventDefault(); onHoldEnd(); }}
            className="w-full select-none rounded-2xl py-6 text-lg font-black text-black transition"
            style={{ background: holding ? GREEN : GOLD, transform: holding ? 'scale(0.98)' : 'scale(1)' }}
          >
            {holding ? 'DELIVERING… release when done' : `HOLD TO DELIVER LINE ${currentIdx + 1}`}
          </button>
        </div>
      )}

      <button onClick={onFinish} className="mt-4 w-full rounded-full border border-white/15 py-2 text-xs text-white/50 transition hover:text-white">
        Finish early &amp; score
      </button>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <div className="flex justify-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className="h-6 w-6" style={{ color: i <= n ? GOLD : 'rgba(255,255,255,0.15)', fill: i <= n ? GOLD : 'transparent' }} />
      ))}
    </div>
  );
}

function ResultsScreen({
  scene, result, onReplay, onMenu,
}: { scene: Scene; result: PerformanceResult; onReplay: () => void; onMenu: () => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-center text-3xl font-black">{scene.title}</h2>
      <div className="my-4"><Stars n={result.stars} /></div>
      <div className="text-center text-sm text-white/60">Overall {(result.average * 100).toFixed(0)}%</div>
      <div className="mt-6 space-y-2">
        {result.perLine.map((ls) => {
          const line = scene.lines.find((l) => l.id === ls.lineId);
          return (
            <div key={ls.lineId} className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{line?.text}</span>
                <span className="text-sm font-bold" style={{ color: ls.total > 0.7 ? GREEN : ls.total > 0.4 ? GOLD : RED }}>
                  {(ls.total * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-white/45">
                <span>timing {(ls.timing * 100).toFixed(0)} · energy {(ls.energy * 100).toFixed(0)} · range {(ls.range * 100).toFixed(0)}</span>
                <span className="italic">{ls.note}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex gap-3">
        <button onClick={onReplay} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-black" style={{ background: CYAN }}>
          <RotateCcw className="h-4 w-4" /> Run It Again
        </button>
        <button onClick={onMenu} className="flex-1 rounded-full border border-white/20 py-3 text-sm font-bold transition hover:bg-white/10">
          Pick Scene
        </button>
      </div>
    </div>
  );
}
