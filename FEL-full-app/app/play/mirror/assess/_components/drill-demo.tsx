'use client';

// The drill demo on a Quick Screen priority card (plan #7, lib/screen/copy.ts DEMO_WATCH). EDU-LINKS (2026-10-07), owner
// decision (Mirror & coaching, 2026-10-07): "Drill demos: reuse the 3D ExerciseDemo" — no new assets. The slot said
// "Demo coming (20–30 s)" since SCREEN-SHIP.
//
// T-POSE (owner playtest 2026-10-27): the canvas named below played elijah.glb's one unrelated capture for every check (the
// arms swinging out, the head off the canvas). It is the library stage now (components/library/avatar-demo.tsx): the
// check's own loop where there is one (lib/library/surfaceDemo.ts — none of the four yet), else the start position,
// still, "Demo coming". Same-origin: the kit bodies and Babylon ship with the app.
//
// WAS — TAP TO OPEN. The 3D character is three.js plus a model download; a results screen on a mid-range device should not pay
// for that until somebody asks to watch. Until the tap, this is one button; after it, the ExerciseDemo's 3D character —
// components/coach/exercise-avatar-canvas.tsx, the canvas ExerciseDemo's "YOUR AVATAR" tab mounts, loaded the same way
// (next/dynamic, ssr:false). Not the whole ExerciseDemo: its other tab embeds a YouTube player, and nothing on the
// Quick Screen may load from off-site (lib/screen/offsite.test.ts, Cyber F3) — the guard caught the first version of
// this file importing it. The model is same-origin (/models/elijah.glb), so nothing new leaves the device.

import { Dumbbell } from 'lucide-react';
import { DEMO_NOTE, SCREEN_TEST_NAMES } from '@/lib/screen/copy';
import { AvatarDemo } from '@/components/library/avatar-demo';
import { useAutoOpen } from '@/components/library/use-auto-open';
import { SCREEN_DEMO_LOOPS } from '@/lib/library/surfaceDemo';

/** ExerciseDemo's own switch: with 3D off, a still cue card instead of the canvas (never a blank box). */
const threeDisabled = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1';

type TestId = keyof typeof SCREEN_TEST_NAMES;


export function DrillDemo({ test, drill, initiallyOpen = false }: { test: TestId; drill: string; initiallyOpen?: boolean }) {
  const { ref, open } = useAutoOpen<HTMLDivElement>(initiallyOpen);
  if (!open) {
    // Autoplay: an empty stage box that opens itself when it scrolls into view (components/library/use-auto-open.ts).
    return <div ref={ref} data-demo-watch aria-hidden className="flex aspect-video w-full items-center justify-center rounded-xl border border-white/10 bg-[#0c0c11]" />;
  }
  return (
    <div data-demo-open={test}>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c0c11]" aria-label={`${SCREEN_TEST_NAMES[test]}: ${drill}`}>
        {threeDisabled ? (
          <div data-demo-still className="flex aspect-video w-full items-center justify-center bg-[#16161a]">
            <Dumbbell aria-hidden className="h-10 w-10 text-white/30" />
          </div>
        ) : (
          <AvatarDemo clip={SCREEN_DEMO_LOOPS[test]} />
        )}
      </div>
      {/* SCREEN-EASY: 16 px like every other line on the result (the premium rule: ≤ 4 sizes on a screen) */}
      <p className="mt-1.5 text-[16px] leading-snug text-white/60">{DEMO_NOTE}</p>
    </div>
  );
}
