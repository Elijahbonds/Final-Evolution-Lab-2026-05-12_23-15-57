'use client';

// MIRROR step 2 (plan #6, FAULT REPLAY) and its follow-up: the top priority's worst rep, drawn as a skeleton on a blank
// canvas, with the joints the check reads ringed and its reference line drawn (the OnForm / Hudl drawn-angle pattern).
// When the grader kept the rep's frames (lib/assess/scoring.ts RepClip), Play/Pause and a scrub bar move through the
// rep, and the best rep of the same check plays beside it, in step. No camera image, no video: only landmarks held in
// page memory (lib/screen/rep-memory.ts). It draws after the screen has ended, never during it; it never starts on its
// own (so prefers-reduced-motion users see a still frame until they press Play); nothing is stored or sent
// (lib/screen/rep-memory.test.tsx, lib/screen/replay-clips.test.tsx).
import { useEffect, useRef, useState } from 'react';
import type { FrozenRep, RepClip } from '@/lib/assess/scoring';
import type { Lm } from '@/lib/pose/landmarks';
import { REPLAY_BEST, REPLAY_NOTE, REPLAY_PAUSE, REPLAY_PLAY, REPLAY_SCRUB, REPLAY_TITLE, REPLAY_WORST } from '@/lib/screen/copy';
import { drawSkeleton, fitToBox, metricFocus, SKELETON_COLOURS } from './skeleton';

const W = 240, H = 320;   // drawing size of each canvas (px), portrait like a standing body
const STEP_MS = 50;       // playback pace: one kept frame every 50 ms (UI pacing, grades nothing)

/** Frame `i` of `n` on the worst clip, as the same point of the best clip (the two reps play in step). */
export function stepFrame(i: number, n: number, m: number): number {
  if (m <= 1 || n <= 1) return 0;
  return Math.min(m - 1, Math.round((i / (n - 1)) * (m - 1)));
}

function Pane({ rep, image, colour, label }: { rep: FrozenRep; image: Lm[]; colour: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const img = fitToBox(image, rep.aspect, W, H);
    const focus = metricFocus(rep.metric, rep.side === 'left' || rep.side === 'right' ? rep.side : undefined, img);
    drawSkeleton(ctx, img, { colour, mirror: true, highlight: focus.highlight, guides: focus.guides });
  }, [rep, image, colour]);
  return (
    <div className="min-w-0 flex-1">
      <canvas ref={ref} width={W} height={H} role="img" aria-label={`${label}: ${REPLAY_TITLE}`} className="mx-auto block h-auto w-full max-w-[240px]" />
      <p className="mt-0.5 text-center text-[16px] font-bold text-white/80">{label}</p>
    </div>
  );
}

export function FaultReplay({ rep }: { rep: FrozenRep }) {
  const worst: RepClip | undefined = rep.worstClip?.frames.length ? rep.worstClip : undefined;
  const best: RepClip | undefined = rep.bestClip?.frames.length ? rep.bestClip : undefined;
  const n = worst?.frames.length ?? 0;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1 >= n ? 0 : x + 1)), STEP_MS);
    return () => clearInterval(t);
  }, [playing, n]);
  const wImg = worst ? worst.frames[Math.min(i, n - 1)] : rep.image;
  const bImg = best ? best.frames[stepFrame(i, n, best.frames.length)] : null;
  return (
    <figure data-fault-replay={rep.metric} data-replay-best={bImg ? 'yes' : 'no'} className="mt-2 rounded-xl border border-white/10 bg-black/40 p-2">
      <div className="flex gap-2">
        <Pane rep={rep} image={wImg} colour={SKELETON_COLOURS.fault} label={REPLAY_WORST} />
        {bImg ? <Pane rep={rep} image={bImg} colour={SKELETON_COLOURS.clean} label={REPLAY_BEST} /> : null}
      </div>
      {n > 1 ? (
        <div data-replay-controls className="mt-2 flex items-center gap-2">
          <button type="button" data-replay-play onClick={() => setPlaying((p) => !p)} aria-pressed={playing}
            className="min-h-12 min-w-12 rounded-full border border-white/20 px-4 text-[16px] font-bold">{playing ? REPLAY_PAUSE : REPLAY_PLAY}</button>
          <input type="range" data-replay-scrub aria-label={REPLAY_SCRUB} min={0} max={n - 1} step={1} value={Math.min(i, n - 1)}
            onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} className="min-h-12 flex-1" />
        </div>
      ) : null}
      <figcaption className="mt-1 text-center text-[16px] leading-snug text-white/70">
        <span className="block font-bold text-white/85">{REPLAY_TITLE}</span>
        {REPLAY_NOTE}
      </figcaption>
    </figure>
  );
}
