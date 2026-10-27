'use client';

// A drill's demo (owner decision 5, Mirror & coaching 2026-10-07: "Drill demos: reuse the 3D ExerciseDemo").
//
// The approach edu-links took for the Quick Screen's demo slot (app/play/mirror/assess/_components/drill-demo.tsx): the
// 3D character canvas ExerciseDemo's "YOUR AVATAR" tab mounts (components/coach/exercise-avatar-canvas.tsx), loaded the
// same way (next/dynamic, ssr:false), behind a tap — not the whole ExerciseDemo, whose other tab embeds a YouTube player:
// nothing on this page loads from off-site, and the model is same-origin (/models/elijah.glb). With 3D switched off
// (NEXT_PUBLIC_DISABLE_3D, ExerciseDemo's own switch) it is a still card, never a blank box.
//
// T-POSE (owner playtest 2026-10-27): the canvas below played elijah.glb's one unrelated 23.9 s capture for every drill
// (measured: the arms swung 12°–171° off hanging, the head off the canvas). It is the library stage now (AvatarDemo): the
// drill's own loop where there is one (lib/library/surfaceDemo.ts), else the start position, still, "Demo coming".
//
// WAS (kept for the record) — HONEST ABOUT WHAT IT IS. The shipped rig has no per-drill motion (edu-links measured: elijah.glb carries one clip), so
// the demo is your avatar moving, a motion cue — the drill itself is the chart's own lines and the Playbook's words,
// which the page shows beside it.

import { Dumbbell } from 'lucide-react';
import type { Drill } from '@/lib/drills/chart';
import { AvatarDemo } from '@/components/library/avatar-demo';
import { useAutoOpen } from '@/components/library/use-auto-open';
import { drillDemoLoop } from '@/lib/library/surfaceDemo';

const threeDisabled = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1';

export const DEMO_WATCH_LABEL = 'Watch the 3D demo';
export const DEMO_NOTE_LINE = 'Your avatar doing the drill where there is a loop for it; otherwise standing in the start position until one is made. The drill is the lines on this page, from the book.';


export function DrillDemo({ drill, initiallyOpen = false }: { drill: Drill; initiallyOpen?: boolean }) {
  const { ref, open } = useAutoOpen<HTMLDivElement>(initiallyOpen);
  if (!open) {
    // Autoplay: an empty stage box that opens itself when it scrolls into view (components/library/use-auto-open.ts).
    return <div ref={ref} data-drill-demo-watch aria-hidden className="flex aspect-video w-full items-center justify-center rounded-xl border border-white/10 bg-[#0c0c11]" />;
  }
  return (
    <div data-drill-demo-open={drill.id}>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c0c11]" aria-label={`${drill.name}: 3D demo`}>
        {threeDisabled ? (
          <div data-drill-demo-still className="flex aspect-video w-full items-center justify-center bg-[#16161a]">
            <Dumbbell aria-hidden className="h-10 w-10 text-white/30" />
          </div>
        ) : (
          <AvatarDemo clip={drillDemoLoop(drill.id)} />
        )}
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-white/55">{DEMO_NOTE_LINE}</p>
    </div>
  );
}
