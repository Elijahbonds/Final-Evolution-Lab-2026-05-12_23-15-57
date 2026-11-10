// RUNUP-STALL-1 v3 (2026-10-30): spread a batch of body loads over frames. AM's trace had the contest set's five rival
// bodies (the boardwalk onlookers) land and set up together: their pose-bind world-matrix walks (poseClip.ts:216) and
// body-mask fitting (bodyMask.ts) stacked into 400-800 ms tasks. Here each job starts only after the one before it has
// settled AND a frame has passed, so no two bodies' setup ever share a frame.

/**
 * Runs `jobs` one at a time: job k+1 is started on the frame after job k settles (resolved or rejected). `nextFrame`
 * schedules a callback for the next frame (scene.onBeforeRenderObservable.addOnce in the game); `stop` ends the queue
 * early (a disposed crowd). Resolves when the queue is done or stopped.
 */
export function onePerFrame(jobs: ReadonlyArray<() => Promise<unknown>>, nextFrame: (cb: () => void) => void, stop: () => boolean = () => false): Promise<void> {
  return new Promise((resolve) => {
    let k = 0;
    const run = (): void => {
      if (k >= jobs.length || stop()) { resolve(); return; }
      const job = jobs[k++];
      let p: Promise<unknown>;
      try { p = job(); } catch (e) { p = Promise.reject(e); }
      p.catch(() => undefined).then(() => nextFrame(run));
    };
    run();
  });
}
