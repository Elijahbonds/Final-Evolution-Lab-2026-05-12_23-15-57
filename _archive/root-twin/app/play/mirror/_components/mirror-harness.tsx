'use client';

// Neuro-Mechanic Mirror (v1) harness.
//
// Wires a live camera <video> to the transparent Babylon overlay and the
// client-side pose/rule pipeline (lib/babylon/nexus/neuro-mirror). Everything
// runs in the browser — the camera stream is never uploaded.
//
// COPY RULE (brief §2.4): all wording here describes ESTIMATED / INFERRED
// engagement from movement, never "measured muscle activation" or clinical
// claims. No biomechanical statistics are fabricated — the only numbers shown
// are the ones the engine actually computes for this session.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NeuroMirror, ZONE_LABEL, ZONE_STATE_COLOR, ZONE_STATE_LABEL,
  PATTERN_ZONES, type MirrorRuntime, type SessionSummary, type ZoneId, type ZoneState,
} from '@/lib/babylon/nexus/neuro-mirror';

type Status = 'idle' | 'requesting' | 'loading-model' | 'live' | 'error';

export function MirrorHarness() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runtimeRef = useRef<MirrorRuntime | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<string>('hold');
  const [frameMs, setFrameMs] = useState<number>(0);
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState>>({
    posterior_chain: 'unavailable', lat_rhomboid: 'unavailable', upper_traps: 'unavailable',
    rib_thoracic: 'unavailable', lumbo_pelvic: 'unavailable',
  });
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  const stop = useCallback(() => {
    runtimeRef.current?.dispose();
    runtimeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => { stop(); }, [stop]);

  const start = useCallback(async () => {
    setError('');
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();

      setStatus('loading-model');
      const runtime = await NeuroMirror.session({
        video: v,
        overlayCanvas: canvasRef.current!,
        onReady: () => setStatus('live'),
        onFrame: ({ phase: p, frameMs: fm, zones }) => {
          setPhase(p);
          setFrameMs(fm);
          setZoneStates(zones);
        },
      });
      runtimeRef.current = runtime;
    } catch (e: any) {
      console.error('[FEL-MIRROR] start failed', e);
      setError(
        e?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access and try again.'
          : 'Camera unavailable in this browser/environment.');
      setStatus('error');
    }
  }, []);

  const endSession = useCallback(() => {
    const rt = runtimeRef.current;
    if (rt) setSummary(NeuroMirror.sessionSummary(rt));
    stop();
    setStatus('idle');
  }, [stop]);

  const secs = (ms: number) => (ms / 1000).toFixed(1);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-[#00E5FF]">Neuro-Mechanic Mirror</h1>
          <p className="text-sm text-white/70">
            Movement pattern: <span className="text-[#FFD700]">Split-stance press / row</span> (v1)
          </p>
        </header>

        {/* Accuracy disclaimer — estimated language, no clinical claims (brief §2.4) */}
        <div className="mb-4 rounded-xl border border-[#00E5FF]/25 bg-[#00E5FF]/5 px-4 py-3 text-xs leading-relaxed text-white/70">
          This overlay shows <strong className="text-white">estimated / inferred engagement</strong> from your
          movement, derived from joint kinematics only. It does <strong className="text-white">not</strong> measure
          actual muscle activation (no EMG). Everything runs in your browser — your camera feed is never uploaded.
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_260px]">
          {/* Video + transparent overlay */}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
            <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            {status !== 'live' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-center text-sm text-white/60">
                {status === 'requesting' ? 'Requesting camera…'
                  : status === 'loading-model' ? 'Loading pose model…'
                  : status === 'error' ? '—'
                  : 'Start a session to begin coaching.'}
              </div>
            )}
            {status === 'live' && (
              <div className="absolute left-2 top-2 rounded-lg bg-black/60 px-2 py-1 text-[11px] text-white/80">
                Phase: <span className="text-[#00E5FF]">{phase}</span> · {frameMs.toFixed(1)} ms/frame
                {frameMs > 50 && <span className="text-[#FFC24B]"> (over 50ms budget)</span>}
              </div>
            )}
          </div>

          {/* Zone legend + live states */}
          <aside className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <h2 className="mb-2 text-sm font-semibold text-white">Estimated engagement zones</h2>
              <ul className="space-y-2">
                {PATTERN_ZONES.map((id) => {
                  const st = zoneStates[id];
                  return (
                    <li key={id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: ZONE_STATE_COLOR[st] }} />
                        <span className="text-white/80">{ZONE_LABEL[id]}</span>
                      </span>
                      <span className="text-white/50">{ZONE_STATE_LABEL[st]}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/60">
              <div className="mb-1 font-semibold text-white/80">Legend</div>
              {(['stable', 'warning', 'fault', 'unavailable'] as ZoneState[]).map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ZONE_STATE_COLOR[s] }} />
                  <span>{ZONE_STATE_LABEL[s]}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {status === 'idle' || status === 'error' ? (
            <button onClick={start}
              className="rounded-xl bg-[#00E5FF] px-5 py-2.5 text-sm font-bold text-black transition hover:bg-[#33ecff]">
              Start session
            </button>
          ) : (
            <button onClick={endSession}
              className="rounded-xl bg-[#FF3366] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#ff4d7a]">
              End session
            </button>
          )}
        </div>

        {/* Session summary — real accumulated stats only (brief §4) */}
        {summary && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-2 text-sm font-semibold text-white">Session summary (estimated)</h2>
            <p className="mb-3 text-xs text-white/50">
              Duration {secs(summary.durationMs)}s · avg {summary.avgFrameMs.toFixed(1)} ms/frame
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-white/50">
                  <tr><th className="py-1 pr-4">Zone</th><th className="py-1 pr-4">Time estimated-stable</th><th className="py-1">Estimated faults</th></tr>
                </thead>
                <tbody className="text-white/80">
                  {PATTERN_ZONES.map((id) => (
                    <tr key={id} className="border-t border-white/5">
                      <td className="py-1 pr-4">{ZONE_LABEL[id]}</td>
                      <td className="py-1 pr-4">{secs(summary.timeInStableMs[id])}s</td>
                      <td className="py-1">{summary.faultCounts[id]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
