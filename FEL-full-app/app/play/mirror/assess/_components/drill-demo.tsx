'use client';

// The drill demo on a Quick Screen priority card (plan #7, lib/screen/copy.ts DEMO_WATCH). EDU-LINKS (2026-10-07), owner
// decision (Mirror & coaching, 2026-10-07): "Drill demos: reuse the 3D ExerciseDemo" — no new assets. The slot said
// "Demo coming (20–30 s)" since SCREEN-SHIP.
//
// TAP TO OPEN. The 3D character is three.js plus a model download; a results screen on a mid-range device should not pay
// for that until somebody asks to watch. Until the tap, this is one button; after it, the ExerciseDemo's 3D character —
// components/coach/exercise-avatar-canvas.tsx, the canvas ExerciseDemo's "YOUR AVATAR" tab mounts, loaded the same way
// (next/dynamic, ssr:false). Not the whole ExerciseDemo: its other tab embeds a YouTube player, and nothing on the
// Quick Screen may load from off-site (lib/screen/offsite.test.ts, Cyber F3) — the guard caught the first version of
// this file importing it. The model is same-origin (/models/elijah.glb), so nothing new leaves the device.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Dumbbell, Play } from 'lucide-react';
import { DEMO_NOTE, DEMO_WATCH, SCREEN_TEST_NAMES } from '@/lib/screen/copy';

const ExerciseAvatarCanvas = dynamic(() => import('@/components/coach/exercise-avatar-canvas'), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-video w-full items-center justify-center bg-[#07070d] text-[14px] text-white/50">Loading the demo…</div>
  ),
});

/** ExerciseDemo's own switch: with 3D off, a still cue card instead of the canvas (never a blank box). */
const threeDisabled = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1';

type TestId = keyof typeof SCREEN_TEST_NAMES;

/** The demo's target quality, which picks its motion (exercise-avatar-canvas clipForStat): the jump is power. */
export const DEMO_STAT: Record<TestId, string> = { T1: 'strength', T2: 'mobility', T3: 'strength', T5: 'power' };

export function DrillDemo({ test, drill, initiallyOpen = false }: { test: TestId; drill: string; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  if (!open) {
    return (
      <button
        type="button" data-demo-watch onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-left text-[16px] font-bold text-white/85"
      >
        <Play aria-hidden className="h-4 w-4 shrink-0" /> {DEMO_WATCH}
      </button>
    );
  }
  return (
    <div data-demo-open={test}>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c0c11]" aria-label={`${SCREEN_TEST_NAMES[test]}: ${drill}`}>
        {threeDisabled ? (
          <div data-demo-still className="flex aspect-video w-full items-center justify-center bg-[#16161a]">
            <Dumbbell aria-hidden className="h-10 w-10 text-white/30" />
          </div>
        ) : (
          <ExerciseAvatarCanvas stat={DEMO_STAT[test]} />
        )}
      </div>
      <p className="mt-1.5 text-[14px] leading-snug text-white/60">{DEMO_NOTE}</p>
    </div>
  );
}
