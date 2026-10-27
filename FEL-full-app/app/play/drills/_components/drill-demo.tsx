'use client';

// A drill's demo (owner decision 5, Mirror & coaching 2026-10-07: "Drill demos: reuse the 3D ExerciseDemo").
//
// The approach edu-links took for the Quick Screen's demo slot (app/play/mirror/assess/_components/drill-demo.tsx): the
// 3D character canvas ExerciseDemo's "YOUR AVATAR" tab mounts (components/coach/exercise-avatar-canvas.tsx), loaded the
// same way (next/dynamic, ssr:false), behind a tap — not the whole ExerciseDemo, whose other tab embeds a YouTube player:
// nothing on this page loads from off-site, and the model is same-origin (/models/elijah.glb). With 3D switched off
// (NEXT_PUBLIC_DISABLE_3D, ExerciseDemo's own switch) it is a still card, never a blank box.
//
// FITNESS-TPOSE (2026-10-26): the demo is now the exercise library's stage (components/library/exercise-stage.tsx: your
// own athlete, the authored exercise loops) playing the loop for the drill's own moves (demoClip). The old canvas
// (exercise-avatar-canvas, /models/elijah.glb) had no such loop and fell back to one unrelated mocap for every drill. A
// drill no loop shows, or a stage that cannot play its loop, is the still card — never a body in its bind pose.
//
// HONEST ABOUT WHAT IT IS. The shipped rig has no per-drill motion (edu-links measured: elijah.glb carries one clip), so
// the demo is your avatar moving, a motion cue — the drill itself is the chart's own lines and the Playbook's words,
// which the page shows beside it.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Dumbbell, Play } from 'lucide-react';
import type { MoveKind } from '@/lib/babylon/core/bodyTargets';
import type { Drill } from '@/lib/drills/chart';

const ExerciseStage = dynamic(() => import('@/components/library/exercise-stage'), {
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

/** The loop that shows a drill's moves, most telling first (a jump, then a squat, then a knee drive); null: none does. */
const CLIP_FOR_MOVE: readonly [MoveKind, string][] = [['jump', 'ex_jump'], ['land', 'ex_jump'], ['squat', 'ex_squat'], ['knee', 'ex_march']];
export function demoClip(d: Pick<Drill, 'phases'>): string | null {
  const moves = new Set(d.phases.flatMap((p) => p.targets.map((t) => t.move)));
  return CLIP_FOR_MOVE.find(([m]) => moves.has(m))?.[1] ?? null;
}

const NO_MUSCLES = { primary: [] as string[], secondary: [] as string[] };

export function DrillDemo({ drill, initiallyOpen = false }: { drill: Drill; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [still, setStill] = useState(false);   // the stage could not play its loop: the still card
  const clip = demoClip(drill);
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
        {threeDisabled || !clip || still ? (
          <div data-drill-demo-still className="flex aspect-video w-full items-center justify-center bg-[#16161a]">
            <Dumbbell aria-hidden className="h-10 w-10 text-white/30" />
          </div>
        ) : (
          <div className="aspect-video w-full bg-[#07070d]">
            <ExerciseStage view="demo" clip={clip} muscles={NO_MUSCLES} side="front" onState={(s) => { if (s !== 'ready' && s !== 'loading') setStill(true); }} />
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-white/55">{DEMO_NOTE_LINE}</p>
    </div>
  );
}
