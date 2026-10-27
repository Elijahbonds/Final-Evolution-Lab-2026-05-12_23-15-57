'use client';

// The drill demo on a Quick Screen priority card (plan #7, lib/screen/copy.ts DEMO_WATCH). EDU-LINKS (2026-10-07), owner
// decision (Mirror & coaching, 2026-10-07): "Drill demos: reuse the 3D ExerciseDemo" — no new assets. The slot said
// "Demo coming (20–30 s)" since SCREEN-SHIP.
//
// TAP TO OPEN. Until the tap, this is one button; after it, the demo (below). Never the whole ExerciseDemo: its other tab
// embeds a YouTube player, and nothing on the Quick Screen may load from off-site (lib/screen/offsite.test.ts, Cyber F3).

// FITNESS-TPOSE (2026-10-26), PM option A: the 3D character is gone from the Quick Screen. The old canvas
// (exercise-avatar-canvas, /models/elijah.glb) had no squat or jump and fell back to one unrelated mocap over a T-pose;
// the library's exercise stage that replaced it elsewhere is Babylon, and the Quick Screen route loads nothing from
// Babylon (lib/assess/replay.test.ts). So opened, the demo is the still cue card: the drill named, the note under it.

import { useState } from 'react';
import { Dumbbell, Play } from 'lucide-react';
import { DEMO_NOTE, DEMO_WATCH, SCREEN_TEST_NAMES } from '@/lib/screen/copy';

type TestId = keyof typeof SCREEN_TEST_NAMES;

/** The demo's target quality for each check: the jump is power. */
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
        <div data-demo-still className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-[#16161a] px-4 text-center">
          <Dumbbell aria-hidden className="h-10 w-10 text-white/30" />
          <div className="text-[14px] font-bold text-white/80">{SCREEN_TEST_NAMES[test]}</div>
          <div className="text-[14px] text-white/60">{drill}</div>
        </div>
      </div>
      <p className="mt-1.5 text-[14px] leading-snug text-white/60">{DEMO_NOTE}</p>
    </div>
  );
}
