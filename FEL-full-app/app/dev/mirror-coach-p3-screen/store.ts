// The dev process's stand-in for WorkoutScan (kind mirror_screen), shared by the two dev harnesses that need it
// (MIRROR-COACH P3 live proof, 2026-09-26): /dev/mirror-coach-p3-screen writes a screen the way POST /api/mirror/screen
// stores it, and /dev/coach-prescribe?case=live reads the newest one back the way GET /api/coach/prescribe reads the
// client's screens — so the coach panel in the live proof drafts from the screen the served harness just ran, not from
// fixture numbers. In memory, this process only, newest LAST. Development only: both routes 404 outside `next dev`.
export interface DevScreenRow {
  id: string;
  metrics: unknown;
  /** When the row was stored (the route's createdAt). */
  at: string;
}

const g = globalThis as unknown as { __felP3Screens?: DevScreenRow[] };

export function p3ScreenRows(): DevScreenRow[] {
  return (g.__felP3Screens ??= []);
}
