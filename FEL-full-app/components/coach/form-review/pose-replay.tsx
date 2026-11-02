'use client';

// PoseReplay — a sent set's flagged rep, replayed as a skeleton (COACH-VIDEO-REVIEW, 2026-10-24).
//
// No video exists to show, by design (lib/coach/formReview/payload.ts): what the coach watches is the rep's keypoint
// track, drawn on a blank canvas with the Mirror's own skeleton painter (app/play/mirror/assess/_components/skeleton.ts —
// the Quick Screen's fault replay draws the same way), the joints the fault is read from ringed, and the set's best rep
// beside it in step, so the coach sees the fault against the athlete's own clean rep. It never starts on its own (a still
// frame until Play — the fault replay's reduced-motion rule) and it sends nothing.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lm } from '@/lib/pose/landmarks';
import { SIDE } from '@/lib/pose/landmarks';
import { decodeTrack, type PoseTrack } from '@/lib/coach/formReview/payload';
import type { FaultSide } from '@/lib/coach/formReview/movements';
import { drawSkeleton, fitToBox, SKELETON_COLOURS } from '@/app/play/mirror/assess/_components/skeleton';

const W = 240, H = 320;
/** Playback pace: one kept frame per step (the track's own dt). UI pacing only. */
const MIN_STEP_MS = 40;

/** The joints a fault is read from, for the rings (image indices; a sided fault rings its side). */
export function faultJoints(fault: string | null, side: FaultSide | null | undefined): number[] {
  const sides = side === 'both' ? [SIDE.left, SIDE.right] : [SIDE[side === 'right' ? 'right' : 'left']];
  const leg = sides.flatMap((s) => [s.hip, s.knee, s.ankle]);
  switch (fault) {
    case 'kneeValgus': case 'kneeIn': case 'wobble': return leg;
    case 'heelRise': return [SIDE.left.heel, SIDE.right.heel];
    case 'lateralShift': case 'hipDrop': return [23, 24];
    case 'armFall': case 'torsoDrift': return [11, 12];
    case 'dowelLine': case 'headLine': return [0, 11, 12, 23, 24];
    case 'hingeRatio': return [23, 24, 25, 26];
    case 'shinAngle': return [25, 26, 27, 28];
    case 'bodyLine': return [11, 12, 23, 24, 27, 28];
    case 'handSetup': return [11, 12, 15, 16];
    case 'depth': case 'shallow': return [11, 12, 13, 14, 23, 24, 25, 26];
    default: return [];
  }
}

function Pane({ image, aspect, colour, label, highlight }: { image: Lm[] | null; aspect: number; colour: string; label: string; highlight: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (!image) return;
    // drawn the way the athlete saw themselves on the phone (the Mirror's self-view is mirrored)
    drawSkeleton(ctx, fitToBox(image, aspect, W, H), { colour, mirror: true, highlight });
  }, [image, aspect, colour, highlight]);
  return (
    <div className="min-w-0 flex-1">
      <canvas ref={ref} width={W} height={H} role="img" aria-label={`${label}: skeleton replay`} data-replay-canvas={label}
        className="mx-auto block h-auto w-full max-w-[240px] rounded-lg bg-black/40" />
      <p className="mt-1 text-center text-xs font-semibold text-white/70">{label}</p>
    </div>
  );
}

export interface ReplayRep { n: number; label: string; fault: string | null; side: FaultSide | null }

/** `rep` is the flagged rep to show; `best` the clean comparison (optional). Tracks are the set's stored ones. */
export function PoseReplay({ tracks, aspect, rep, best }: { tracks: readonly PoseTrack[]; aspect: number; rep: ReplayRep; best?: ReplayRep | null }) {
  const main = useMemo(() => { const t = tracks.find((x) => x.rep === rep.n); return t ? { frames: decodeTrack(t), dt: t.dt } : null; }, [tracks, rep.n]);
  const cmp = useMemo(() => { const t = best ? tracks.find((x) => x.rep === best.n) : null; return t ? decodeTrack(t) : null; }, [tracks, best]);
  const n = main?.frames.length ?? 0;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setI(0); setPlaying(false); }, [rep.n]);
  useEffect(() => {
    if (!playing || n < 2 || !main) return;
    const t = setInterval(() => setI((x) => (x + 1 >= n ? 0 : x + 1)), Math.max(MIN_STEP_MS, main.dt));
    return () => clearInterval(t);
  }, [playing, n, main]);
  const ring = useMemo(() => faultJoints(rep.fault, rep.side), [rep.fault, rep.side]);
  const none = useMemo(() => [] as number[], []);
  if (!main || !n) {
    return <p className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/50" data-replay-missing>No replay kept for rep {rep.n} (replays are kept 90 days).</p>;
  }
  const frame = main.frames[Math.min(i, n - 1)];
  const cmpFrame = cmp && cmp.length ? cmp[Math.min(cmp.length - 1, Math.round((i / Math.max(1, n - 1)) * (cmp.length - 1)))] : null;
  return (
    <figure data-pose-replay={rep.n} className="rounded-xl border border-white/10 bg-black/30 p-2">
      <div className="flex gap-2">
        <Pane image={frame} aspect={aspect} colour={SKELETON_COLOURS.fault} label={rep.label} highlight={ring} />
        {cmpFrame && best ? <Pane image={cmpFrame} aspect={aspect} colour={SKELETON_COLOURS.clean} label={best.label} highlight={none} /> : null}
      </div>
      {n > 1 ? (
        <div className="mt-2 flex items-center gap-2">
          <button type="button" data-replay-play onClick={() => setPlaying((p) => !p)} aria-pressed={playing}
            className="min-h-11 min-w-16 rounded-full border border-white/20 px-4 text-sm font-semibold text-white">{playing ? 'Pause' : 'Play'}</button>
          <input type="range" aria-label="Scrub the rep" min={0} max={n - 1} step={1} value={Math.min(i, n - 1)}
            onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} className="min-h-11 min-w-0 flex-1" />
        </div>
      ) : null}
      <figcaption className="mt-1 text-center text-[11px] text-fel-dim">Skeleton from the camera&apos;s pose estimate — no video was sent.</figcaption>
    </figure>
  );
}
