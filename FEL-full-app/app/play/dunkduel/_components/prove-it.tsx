'use client';

// PROVE IT — the IRL head-to-head dunk contest. Real footage, measured on
// the device: the neuro-mirror MediaPipe pose pipeline watches the attempt,
// lib/irl/dunkTracker.ts turns the landmark stream into flight time /
// vertical / approach / family, the SAME judge panel as Flight Night scores
// it, PRQ-relative (the feat is read against YOUR measured level).
//
// PRIVACY (the neuro-mirror rule, unchanged): the camera feed and the pose
// stream never leave the browser. No video is recorded or uploaded — only
// the computed metrics exist, and they stay in the page.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, RotateCcw, Users, Trophy } from 'lucide-react';
import { MediaPipePoseAdapter } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { DunkTracker, scoreIrlDunk, type DunkMetrics } from '@/lib/irl/dunkTracker';
import { judgeDunk, type JudgeScore } from '@/lib/babylon/core/JudgePanel';

const BG = '#050505';
const CYAN = '#00E5FF';
const GOLD = '#FFD700';
const GREEN = '#00FF9D';
const PINK = '#FF2D95';
const RED = '#FF3366';

const DUNKS_EACH = 2;

type Stage =
  | 'consent' | 'camera-off' | 'loading-model' | 'prop-phone'
  | 'arm' | 'watching' | 'judged' | 'handoff' | 'final';

interface Attempt { metrics: DunkMetrics; scores: JudgeScore[]; total: number }

export default function ProveIt() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const adapterRef = useRef<MediaPipePoseAdapter | null>(null);
  const trackerRef = useRef(new DunkTracker());
  const rafRef = useRef(0);
  const liveRef = useRef(false);

  const [stage, setStage] = useState<Stage>('consent');
  const [error, setError] = useState<string | null>(null);
  const [prq, setPrq] = useState(60);
  const [player, setPlayer] = useState<0 | 1>(0);
  const [attempts, setAttempts] = useState<[Attempt[], Attempt[]]>([[], []]);
  const [current, setCurrent] = useState<Attempt | null>(null);
  const [trackerState, setTrackerState] = useState('idle');

  useEffect(() => {
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (typeof j?.prq === 'number') setPrq(Math.round(j.prq));
    }).catch(() => {});
  }, []);

  const stopAll = useCallback(() => {
    liveRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => () => stopAll(), [stopAll]);

  const startCamera = useCallback(async () => {
    setError(null);
    setStage('loading-model');
    try {
      const adapter = new MediaPipePoseAdapter();
      await adapter.init();
      adapterRef.current = adapter;
      const stream = await navigator.mediaDevices.getUserMedia({
        // the environment camera watches the dunker; the phone is propped.
        // IDEAL, not hard — a hard 'environment' constraint rejects devices
        // that don't declare facing modes (measured: webcams/fake devices
        // refuse and the contest never starts)
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 }, height: { ideal: 540 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setStage('prop-phone');
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Camera access was denied. Prove It measures your dunk through the camera — allow it to play.'
        : 'No usable camera on this device. Prove It needs to see you.');
      setStage('camera-off');
    }
  }, []);

  // the pose loop — runs only while an attempt is armed
  const runLoop = useCallback(() => {
    const loop = () => {
      if (!liveRef.current) return;
      const v = videoRef.current;
      const adapter = adapterRef.current;
      if (v && adapter?.ready) {
        const frame = adapter.detect(v, performance.now());
        const got = trackerRef.current.feed(frame);
        setTrackerState(trackerRef.current.state);
        if (got) {
          const s = scoreIrlDunk(got, prq);
          const scores = judgeDunk(s.difficulty, s.execution, s.style);
          const total = scores.reduce((sum, j) => sum + j.score, 0);
          const attempt: Attempt = { metrics: got, scores, total };
          setCurrent(attempt);
          setAttempts((prev) => {
            const next: [Attempt[], Attempt[]] = [prev[0].slice(), prev[1].slice()] as [Attempt[], Attempt[]];
            next[player].push(attempt);
            return next as [Attempt[], Attempt[]];
          });
          liveRef.current = false;
          setStage('judged');
          return;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [player, prq]);

  const armAttempt = useCallback(() => {
    trackerRef.current.reset();
    setCurrent(null);
    setStage('watching');
    liveRef.current = true;
    runLoop();
  }, [runLoop]);

  const nextUp = useCallback(() => {
    const mine = attempts[player].length;
    const other = attempts[1 - player].length;
    const bothDone = attempts[0].length >= DUNKS_EACH && attempts[1].length >= DUNKS_EACH;
    if (bothDone) { setStage('final'); return; }
    // alternate; if the other player is behind, it's their turn
    if (mine > other || (mine >= DUNKS_EACH && other < DUNKS_EACH)) {
      setPlayer((1 - player) as 0 | 1);
      setStage('handoff');
    } else {
      setStage('arm');
    }
  }, [attempts, player]);

  const totals = [0, 1].map((i) => attempts[i].reduce((s, a) => s + a.total, 0));
  const winner = totals[0] === totals[1] ? null : totals[0] > totals[1] ? 0 : 1;

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 font-mono text-white">
      <div className="flex items-center gap-3">
        <Camera className="h-6 w-6" style={{ color: PINK }} />
        <h1 className="fel-heading text-3xl font-bold">PROVE <span style={{ color: PINK }}>IT</span></h1>
      </div>
      <p className="mt-1 max-w-2xl text-xs text-white/50">
        The real-life dunk contest. Two dunkers, one phone, real footage — the AI
        judges track your flight time, vertical, approach and difficulty, and score
        against your PRQ. Nothing is recorded or uploaded: the camera feed never
        leaves this device.
      </p>

      {/* scoreboard */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3">
        {[0, 1].map((i) => (
          <div key={i} className="text-center">
            <div className="text-[11px] tracking-wider text-white/40" style={{ color: i === player && stage !== 'final' ? CYAN : undefined }}>
              PLAYER {i + 1} {i === player && stage !== 'final' ? '· UP' : ''}
            </div>
            <div className="fel-heading text-3xl font-black" style={{ color: i === 0 ? CYAN : PINK }}>{totals[i]}</div>
            <div className="text-[10px] text-white/35">{attempts[i].length}/{DUNKS_EACH} dunks</div>
          </div>
        ))}
        <div className="text-center text-[11px] text-white/40">
          JUDGED VS PRQ <span className="text-white">{prq}</span>
        </div>
      </div>

      {/* the stage */}
      <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${stage === 'watching' || stage === 'prop-phone' || stage === 'arm' ? '' : 'opacity-0'}`}
        />

        {stage === 'consent' && (
          <Gate
            icon={<Camera className="h-8 w-8" style={{ color: CYAN }} />}
            title="READY WHEN YOU ARE"
            body="Prop the phone so it sees the whole approach and the rim, then take your run. The tracker reads takeoff and landing by itself — no button to hit mid-air."
            cta="SET UP THE CAMERA"
            onClick={startCamera}
          />
        )}
        {stage === 'camera-off' && (
          <Gate
            icon={<CameraOff className="h-8 w-8" style={{ color: RED }} />}
            title="NO CAMERA, NO CONTEST"
            body={error ?? 'Camera unavailable.'}
            cta="TRY AGAIN"
            onClick={startCamera}
          />
        )}
        {stage === 'loading-model' && (
          <Gate icon={<RotateCcw className="h-8 w-8 animate-spin" style={{ color: CYAN }} />} title="LOADING THE TRACKER" body="The pose model downloads once and runs entirely on this device." />
        )}
        {stage === 'prop-phone' && (
          <Gate
            icon={<Camera className="h-8 w-8" style={{ color: GOLD }} />}
            title="PROP IT. STEP BACK. STAND STILL."
            body="Full body in frame, feet visible. Hold still for a beat — the floor line calibrates itself."
            cta={`PLAYER ${player + 1} — START THE ATTEMPT`}
            onClick={armAttempt}
          />
        )}
        {stage === 'arm' && (
          <Gate
            icon={<Camera className="h-8 w-8" style={{ color: CYAN }} />}
            title={`PLAYER ${player + 1} — DUNK ${attempts[player].length + 1} OF ${DUNKS_EACH}`}
            body="Same spot. Run it, jump it, land it. The tracker knows."
            cta="START THE ATTEMPT"
            onClick={armAttempt}
          />
        )}
        {stage === 'watching' && (
          <div className="pointer-events-none absolute inset-x-0 top-3 text-center">
            <span className="fel-panel px-4 py-2 text-sm font-bold" style={{ color: trackerState === 'airborne' ? GOLD : CYAN }}>
              {trackerState === 'airborne' ? 'AIRBORNE' : trackerState === 'ready' ? 'TRACKING — GO WHEN READY' : trackerState === 'settling' ? 'LANDING…' : 'CALIBRATING — HOLD STILL'}
            </span>
          </div>
        )}
        {stage === 'judged' && current && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4">
            <div className="fel-heading text-xl font-bold" style={{ color: GOLD }}>
              READS AS: {current.metrics.family}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-white/70 sm:grid-cols-4">
              <span>FLIGHT <b className="text-white">{current.metrics.flightTimeMs}ms</b></span>
              <span>VERT <b className="text-white">{current.metrics.verticalCm}cm</b></span>
              <span>TAKEOFF <b className="text-white">{current.metrics.takeoff}</b></span>
              <span>LANDING <b className="text-white">{Math.round(current.metrics.landingStability * 100)}%</b></span>
            </div>
            <div className="flex items-end justify-center gap-1.5">
              {current.scores.map((j) => (
                <div key={j.name} className="fel-panel flex flex-col items-center px-2.5 py-1">
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: CYAN }}>{j.name}</span>
                  <span className="text-2xl font-black leading-none" style={{ color: GOLD }}>{j.score}</span>
                </div>
              ))}
              <div className="fel-panel ml-1 flex flex-col items-center px-3 py-1" style={{ borderColor: `${GOLD}66` }}>
                <span className="text-[9px] uppercase tracking-wider text-white/50">total</span>
                <span className="text-2xl font-black leading-none text-white">{current.total}</span>
              </div>
            </div>
            <div className="max-w-[85%] truncate text-[11px] text-white/60">{current.scores[current.scores.length - 1]?.line}</div>
            <button
              onClick={nextUp}
              className="mt-2 rounded-lg px-5 py-2.5 text-sm font-bold text-black transition-transform active:scale-95"
              style={{ background: GREEN }}
            >
              NEXT UP →
            </button>
          </div>
        )}
        {stage === 'handoff' && (
          <Gate
            icon={<Users className="h-8 w-8" style={{ color: PINK }} />}
            title={`PASS THE PHONE TO PLAYER ${player + 1}`}
            body="Same spot, same test. Their dunks, their judges."
            cta={`PLAYER ${player + 1} IS READY`}
            onClick={() => setStage('arm')}
          />
        )}
        {stage === 'final' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-4">
            <Trophy className="h-10 w-10" style={{ color: GOLD }} />
            <div className="fel-heading text-3xl font-black text-white">
              {winner === null ? 'DEAD HEAT' : `PLAYER ${winner + 1} PROVED IT`}
            </div>
            <div className="text-sm text-white/60">{totals[0]} — {totals[1]}</div>
            <button
              onClick={() => { setAttempts([[], []]); setPlayer(0); setCurrent(null); setStage('arm'); }}
              className="mt-2 rounded-lg px-5 py-2.5 text-sm font-bold text-black"
              style={{ background: CYAN }}
            >
              RUN IT BACK
            </button>
          </div>
        )}
      </div>

      {/* attempt log */}
      {attempts.some((a) => a.length > 0) && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="text-[11px] font-bold" style={{ color: i === 0 ? CYAN : PINK }}>PLAYER {i + 1}</div>
              {attempts[i].map((a, n) => (
                <div key={n} className="mt-1 flex justify-between text-[11px] text-white/60">
                  <span>{a.metrics.family} · {a.metrics.verticalCm}cm · {a.metrics.flightTimeMs}ms</span>
                  <b className="text-white">{a.total}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Gate(props: { icon: React.ReactNode; title: string; body: string; cta?: string; onClick?: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center">
      {props.icon}
      <div className="fel-heading text-xl font-bold text-white">{props.title}</div>
      <p className="max-w-md text-xs leading-relaxed text-white/60">{props.body}</p>
      {props.cta && props.onClick && (
        <button
          onClick={props.onClick}
          className="mt-2 rounded-lg px-5 py-2.5 text-sm font-bold text-black transition-transform active:scale-95"
          style={{ background: CYAN }}
        >
          {props.cta}
        </button>
      )}
    </div>
  );
}
