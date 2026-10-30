// RUNUP-STALL-1 (2026-10-30): the contest set never loads during a live dunk.
// AM's trace (fel-visual-qa-2026-10-29/runup-stall): startContestSet fired from finishAttempt while the landing was still
// live, and the rivals' GLBs, the props and the voice banks then arrived during the next run-up: ~5.2 s of long tasks
// (poseClip.ts:216 world-matrix walks, bodyMask.ts fitting). The set now waits for a quiet beat.
// PM (v2/v3): an ALLOW-list. Only these phases are quiet; approach is NOT (the run-up starts there), judging is NOT (the
// replay and the judges' reveal play there), and neither is the run, the flight or the landing. DunkMode has no replay phase: a replay is its `replaying` flag, so it counts as not quiet too.

/** The only phases a queued contest set (and its props, voice banks and walk-out) may start in. */
export const QUIET_DUNK_PHASES = ['rivalTurn', 'fieldCut', 'contestOver'] as const;

export function isQuietDunkPhase(phase: string): boolean {
  return (QUIET_DUNK_PHASES as readonly string[]).includes(phase);
}

/** A one-slot queue. ask() says whether the set may start now (a quiet beat) and otherwise queues it; tick() says when a
 *  queued set may start (the first quiet frame). */
export function createContestDefer() {
  let queued = false;
  return {
    ask(quiet: boolean): boolean { if (!quiet) { queued = true; return false; } queued = false; return true; },
    tick(quiet: boolean): boolean { if (!queued || !quiet) return false; queued = false; return true; },
    get queued(): boolean { return queued; },
    reset(): void { queued = false; },
  };
}

/** Resolves on the first quiet check (polled; a disposed scene resolves at once, and its caller bails). */
export function whenQuietBeat(quiet: () => boolean, disposed: () => boolean, everyMs = 120): Promise<void> {
  return new Promise((resolve) => {
    const check = () => { if (disposed() || quiet()) resolve(); else setTimeout(check, everyMs); };
    check();
  });
}
