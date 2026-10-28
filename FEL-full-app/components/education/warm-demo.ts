// warm-demo — get the lesson's 3D demo ready before the tap that opens it (PLAT-P04, 2026-10-27).
//
// The demo is the library stage (components/library/exercise-stage.tsx, demo-loops' — read-only here): Babylon and the
// stage's code arrive on first use, which on a mid phone is most of the wait before the avatar moves. When Learn's
// Continue points at a lesson that opens on a demo, Learn loads that code while the phone is idle, so the lesson's demo
// starts from warm code. Only the code: no model, no scene, no GPU work. Skipped with 3D switched off or Save-Data on.

const threeDisabled = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1';

let warmed = false;

export function warmLessonDemo(): void {
  if (warmed || typeof window === 'undefined' || threeDisabled) return;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  warmed = true;
  const go = () => {
    void import('@/components/library/exercise-stage').catch(() => {});
    void import('@babylonjs/core').catch(() => {});
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(go, { timeout: 3000 });
  else setTimeout(go, 1500);
}
