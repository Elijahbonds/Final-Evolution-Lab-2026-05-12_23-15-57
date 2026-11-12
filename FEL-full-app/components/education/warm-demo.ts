// warm-demo — get the lesson's 3D demo ready before the tap that opens it (PLAT-P04, 2026-10-27).
//
// The demo is the library stage (components/library/exercise-stage.tsx, demo-loops' — read-only here): Babylon and the
// stage's code arrive on first use, which on a mid phone is most of the wait before the avatar moves. When Learn's
// Continue points at a lesson that opens on a demo, Learn starts it while the phone is idle, so the lesson's demo starts
// warm. Skipped with 3D switched off or Save-Data on.
//
// DEMO-SPEED-2 (coordinator 2026-10-28): through the demo's own warm-up (avatar-demo.tsx warmAvatarDemo) — the stage's
// code (which brings Babylon) AND the body's file (lib/library/demoWarm.ts: this player's body, the phone file on a phone,
// read off the main thread, skipped when this device fetched it before). It was the code only, so the body started
// downloading at the tap. One warm-up for every surface, once a page, with the same two skips.
import { warmAvatarDemo } from '@/components/library/avatar-demo';

export function warmLessonDemo(): void {
  warmAvatarDemo();
}
