'use client';

// MIRROR step 2 (plan #6, FAULT REPLAY): the top priority's worst rep, drawn as a skeleton on a blank canvas, with the
// joints the check reads ringed and its reference line drawn (the OnForm / Hudl drawn-angle pattern). No camera image,
// no video: only the one frozen frame of landmarks held in page memory (lib/screen/rep-memory.ts). It draws once, after the
// screen has ended, never during it; nothing is stored or sent (lib/screen/rep-memory.test.tsx).
import { useEffect, useRef } from 'react';
import type { FrozenRep } from '@/lib/assess/scoring';
import { REPLAY_NOTE, REPLAY_TITLE } from '@/lib/screen/copy';
import { drawSkeleton, fitToBox, metricFocus, SKELETON_COLOURS } from './skeleton';

const W = 240, H = 320;   // drawing size of the canvas (px), portrait like a standing body

export function FaultReplay({ rep }: { rep: FrozenRep }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const img = fitToBox(rep.image, rep.aspect, W, H);
    const focus = metricFocus(rep.metric, rep.side === 'left' || rep.side === 'right' ? rep.side : undefined, img);
    drawSkeleton(ctx, img, { colour: SKELETON_COLOURS.fault, mirror: true, highlight: focus.highlight, guides: focus.guides });
  }, [rep]);
  return (
    <figure data-fault-replay={rep.metric} className="mt-2 rounded-xl border border-white/10 bg-black/40 p-2">
      <canvas ref={ref} width={W} height={H} role="img" aria-label={REPLAY_TITLE} className="mx-auto block h-auto w-full max-w-[240px]" />
      <figcaption className="mt-1 text-center text-[16px] leading-snug text-white/70">
        <span className="block font-bold text-white/85">{REPLAY_TITLE}</span>
        {REPLAY_NOTE}
      </figcaption>
    </figure>
  );
}
