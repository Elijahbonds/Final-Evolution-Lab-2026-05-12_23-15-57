'use client';

// FrameReview — step through a jump's video frame by frame and set the take-off and landing frames by hand (JUMP-TESTS,
// 2026-10-25; the competitor teardown: My Jump 2's manual frame selection). Adults only (mounted inside the slow-mo
// reader and the jump tests, both adult-only).
//
// It starts on the app's own read (lib/jump/manualFrames.ts autoEdges); ◀ and ▶ move the edge being set by one frame.
// The picture is the video itself at that frame (an object URL of the file the person picked, in this page only,
// revoked when the review closes), with the pose drawn over it so the feet are easy to see; where the video cannot be
// shown, the pose alone. The height is worked out again from the two frames (g·T²/8). A jump whose frames were moved is
// "manual frames" and never verified (session.ts verifyJump 'manual'; an assumption, the owner's call).
//
// Nothing is saved or sent from here.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { autoEdges, changed, manualRead, nudge, type FrameEdges, type ManualRead } from '@/lib/jump/manualFrames';

const IN = 2.54;
const BONES: [number, number][] = [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32], [11, 13], [13, 15], [12, 14], [14, 16]];
const FEET = [27, 28, 29, 30, 31, 32];

export interface FrameReviewProps {
  /** The frames on the real clock, and the stretch the video was played at (file time = real time × stretch). */
  frames: readonly PoseFrame[];
  stretch: number;
  /** The file's own frame rate (the frame's middle is shown, as the decoder read it). */
  fileFps: number;
  /** The video, when the page still has it. */
  file: File | null;
  jump: { index: number; takeoffT: number; landT: number };
  aspect: number;
  onApply: (r: ManualRead | null) => void;
  onClose: () => void;
}

export function FrameReview({ frames, stretch, fileFps, file, jump, aspect, onApply, onClose }: FrameReviewProps) {
  const auto = useMemo(() => autoEdges(frames, jump), [frames, jump]);
  const [edges, setEdges] = useState<FrameEdges>(auto);
  const [which, setWhich] = useState<'takeoff' | 'land'>('takeoff');
  const [videoOk, setVideoOk] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const idx = which === 'takeoff' ? edges.takeoffIdx : edges.landIdx;
  const f = frames[idx];
  const read = manualRead(frames, edges);
  const moved = changed(edges, auto);

  // the video, in this page only
  useEffect(() => {
    if (!file || typeof URL === 'undefined' || !URL.createObjectURL) { setVideoOk(false); return; }
    let u: string | null = null;
    try { u = URL.createObjectURL(file); setUrl(u); } catch { setVideoOk(false); }
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [file]);
  // show the frame: the video seeked to its middle, and the pose over it
  useEffect(() => {
    const v = videoRef.current;
    if (v && f && videoOk) { try { v.currentTime = (f.t * stretch) / 1000 + 0.5 / Math.max(1, fileFps); } catch { /* not seekable yet */ } }
    const c = canvasRef.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!f?.present || f.image.length < 33) return;
    const P = (k: number) => [f.image[k].x * c.width, f.image[k].y * c.height] as const;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,229,255,0.9)';
    for (const [a, b] of BONES) { const [x1, y1] = P(a), [x2, y2] = P(b); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    ctx.fillStyle = '#FFB020';
    for (const k of FEET) { const [x, y] = P(k); ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
  }, [f, stretch, fileFps, videoOk]);

  const step = (d: number) => setEdges((e) => nudge(frames, e, which, d));
  const rel = f ? Math.round((f.t - frames[auto.takeoffIdx].t)) : 0;
  return (
    <section data-frame-review className="space-y-3 rounded-2xl border border-white/15 bg-black/40 p-4">
      <h3 className="text-[18px] font-black text-white">Check the frames: jump {jump.index}</h3>
      <p className="text-[16px] leading-snug text-white/75">
        Take-off is the first frame with both feet off the floor. Landing is the first frame with a foot back on it.
      </p>
      <div className="flex gap-2" role="tablist">
        {(['takeoff', 'land'] as const).map((w) => (
          <button key={w} type="button" role="tab" aria-selected={which === w} data-edge={w} onClick={() => setWhich(w)}
            className={`min-h-12 flex-1 rounded-full px-3 text-[16px] font-bold ${which === w ? 'bg-white text-black' : 'border border-white/20 text-white/85'}`}>
            {w === 'takeoff' ? 'Take-off' : 'Landing'}
          </button>
        ))}
      </div>
      <div className="relative w-full overflow-hidden rounded-xl bg-[#0b0f17]" style={{ aspectRatio: `${aspect}` }}>
        {url && videoOk ? (
          <video ref={videoRef} src={url} muted playsInline preload="auto" aria-hidden onError={() => setVideoOk(false)} className="absolute inset-0 h-full w-full object-contain" />
        ) : null}
        <canvas ref={canvasRef} width={480} height={Math.round(480 / aspect)} aria-hidden className="absolute inset-0 h-full w-full" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" data-step="-1" aria-label="One frame back" onClick={() => step(-1)} className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border border-white/20 text-white">
          <ChevronLeft aria-hidden className="h-6 w-6" />
        </button>
        <p data-frame-at className="text-center text-[16px] text-white/85">
          Frame {idx + 1} of {frames.length}<span className="block text-white/60">{rel >= 0 ? '+' : ''}{rel} ms from the app&apos;s take-off</span>
        </p>
        <button type="button" data-step="1" aria-label="One frame on" onClick={() => step(1)} className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border border-white/20 text-white">
          <ChevronRight aria-hidden className="h-6 w-6" />
        </button>
      </div>
      {read ? (
        <p data-manual-read className="text-center text-[16px] text-white">
          <span className="text-[24px] font-black">{(read.heightCm / IN).toFixed(1)} in</span>
          <span className="text-white/70"> ±{Math.max(0.1, read.plusMinusCm / IN).toFixed(1)} · {read.heightCm.toFixed(1)} cm · {(read.flightMs / 1000).toFixed(3)} s in the air</span>
        </p>
      ) : <p className="text-center text-[16px] text-[#FFB020]">The landing has to come after the take-off.</p>}
      <p className="text-[16px] leading-snug text-white/65">
        {moved ? 'Frames picked by hand are marked "manual frames" and are not verified.' : 'These are the app’s own frames.'}
      </p>
      <div className="flex gap-2">
        <button type="button" data-manual-apply disabled={!moved || !read} onClick={() => onApply(read)}
          className="min-h-12 flex-1 rounded-2xl bg-white px-4 text-[16px] font-black text-black disabled:opacity-40">Use these frames</button>
        <button type="button" data-manual-reset onClick={() => { setEdges(auto); onApply(null); }} className="min-h-12 flex-1 rounded-2xl border border-white/20 px-4 text-[16px] font-bold text-white/85">
          App&apos;s frames
        </button>
      </div>
      <button type="button" onClick={onClose} className="min-h-12 w-full text-[16px] font-bold text-white/80 underline">Close</button>
    </section>
  );
}
