'use client';

// The coach's view of the client (COACH-LIVE, 2026-10-25): the client's camera video with their pose skeleton drawn
// over it, or — with no video (a teen's session, a client who chose pose only, video that stalled, the relay) — the
// skeleton alone on a dark stage. Voice plays either way.
//
// The video is the REMOTE stream in a plain <video srcObject>, not the self-view: this page never touches the pose
// service or its camera (components/games/bodyPlay.scan.test.ts holds the one self-view to SelfView). It is shown the
// way the client's camera sees them (not mirrored), so the landmarks, which are in the camera's own image
// coordinates, land on the body as they are.
//
// The skeleton is the Movement Screen's own 2-D drawer (app/play/mirror/assess/_components/skeleton.ts), redrawn on
// each animation frame from the newest pose frame.

import { useEffect, useRef, useState } from 'react';
import { drawSkeleton, SKELETON_COLOURS } from '@/app/play/mirror/assess/_components/skeleton';
import type { WirePose } from '@/lib/coach/live/wire';

export interface PoseStageProps {
  stream: MediaStream | null;
  showVideo: boolean;
  /** The newest pose frame (a ref, read on each animation frame: no React render per frame). */
  latest: React.MutableRefObject<WirePose | null>;
  /** Until when (performance.now ms) the skeleton is drawn in the fault colour: a flagged rep just closed. */
  flagUntil: React.MutableRefObject<number>;
  /** The client's camera shape (width / height), for the pose-only stage. */
  aspect: number;
  label: string;
}

export function PoseStage({ stream, showVideo, latest, flagUntil, aspect, label }: PoseStageProps) {
  const video = useRef<HTMLVideoElement | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const [vAspect, setVAspect] = useState<number | null>(null);

  useEffect(() => {
    if (video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
    if (audio.current && audio.current.srcObject !== stream) {
      audio.current.srcObject = stream;
      void audio.current.play().catch(() => { /* autoplay: the Start tap is the gesture */ });
    }
  }, [stream]);

  useEffect(() => {
    let raf = 0;
    let lastSeq = -1;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current, b = box.current;
      if (!c || !b) return;
      const W = Math.round(b.clientWidth * (window.devicePixelRatio || 1)), H = Math.round(b.clientHeight * (window.devicePixelRatio || 1));
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; lastSeq = -1; }
      const f = latest.current;
      const key = f ? f.seq + (performance.now() < flagUntil.current ? 100_000 : 0) : -2;
      if (key === lastSeq) return;
      lastSeq = key;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      if (!f || !f.present) return;
      const colour = performance.now() < flagUntil.current ? SKELETON_COLOURS.fault : SKELETON_COLOURS.clean;
      drawSkeleton(ctx, f.image, { colour, lineWidth: Math.max(3, W / 120) });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [latest, flagUntil]);

  const shape = showVideo && vAspect ? vAspect : aspect;
  const onShape = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.videoWidth && v.videoHeight) setVAspect(v.videoWidth / v.videoHeight);
  };
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-[#0b0f14]" data-live-stage={showVideo ? 'video' : 'pose'}>
      <div ref={box} className="relative mx-auto max-h-[62vh]" style={{ aspectRatio: String(shape), maxWidth: `calc(62vh * ${shape.toFixed(3)})` }}>
        <video ref={video} autoPlay playsInline muted data-live-video onLoadedMetadata={onShape} onResize={onShape}
          className={`absolute inset-0 h-full w-full object-contain ${showVideo ? '' : 'invisible'}`} />
        <canvas ref={canvas} data-live-skeleton className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
      <audio ref={audio} autoPlay data-live-audio className="hidden" />
      <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white/85">{label}</div>
    </div>
  );
}
