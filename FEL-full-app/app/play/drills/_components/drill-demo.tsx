'use client';

// A drill's demo (owner decision 5, Mirror & coaching 2026-10-07: "Drill demos: reuse the 3D ExerciseDemo").
//
// The approach edu-links took for the Quick Screen's demo slot (app/play/mirror/assess/_components/drill-demo.tsx): the
// 3D character canvas ExerciseDemo's "YOUR AVATAR" tab mounts (components/coach/exercise-avatar-canvas.tsx), loaded the
// same way (next/dynamic, ssr:false), behind a tap — not the whole ExerciseDemo, whose other tab embeds a YouTube player:
// nothing on this page loads from off-site, and the model is same-origin (/models/elijah.glb). With 3D switched off
// (NEXT_PUBLIC_DISABLE_3D, ExerciseDemo's own switch) it is a still card, never a blank box.
//
// HONEST ABOUT WHAT IT IS. The shipped rig has no per-drill motion (edu-links measured: elijah.glb carries one clip), so
// the demo is your avatar moving, a motion cue — the drill itself is the chart's own lines and the Playbook's words,
// which the page shows beside it.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Dumbbell, Play } from 'lucide-react';
import type { Drill } from '@/lib/drills/chart';

const ExerciseAvatarCanvas = dynamic(() => import('@/components/coach/exercise-avatar-canvas'), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-video w-full items-center justify-center bg-[#07070d] text-[14px] text-white/50">Loading the demo…</div>
  ),
});

const threeDisabled = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1';

export const DEMO_WATCH_LABEL = 'Watch the 3D demo';
export const DEMO_NOTE_LINE = 'Your avatar moving, as a motion cue. The drill is the lines on this page, from the book.';

/** The quality the demo's motion stands for (exercise-avatar-canvas clipForStat): a drill that jumps is power. */
export function demoStat(d: Pick<Drill, 'phases'>): string {
  return d.phases.some((p) => p.targets.some((t) => t.move === 'jump' || t.move === 'land')) ? 'power' : 'mobility';
}

export function DrillDemo({ drill, initiallyOpen = false }: { drill: Drill; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  if (!open) {
    return (
      <button
        type="button" data-drill-demo-watch onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-left text-[14px] font-bold text-white/80 hover:border-white/30"
      >
        <Play aria-hidden className="h-4 w-4 shrink-0" /> {DEMO_WATCH_LABEL}
      </button>
    );
  }
  return (
    <div data-drill-demo-open={drill.id}>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c0c11]" aria-label={`${drill.name}: 3D demo`}>
        {threeDisabled ? (
          <div data-drill-demo-still className="flex aspect-video w-full items-center justify-center bg-[#16161a]">
            <Dumbbell aria-hidden className="h-10 w-10 text-white/30" />
          </div>
        ) : (
          <ExerciseAvatarCanvas stat={demoStat(drill)} />
        )}
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-white/55">{DEMO_NOTE_LINE}</p>
    </div>
  );
}
