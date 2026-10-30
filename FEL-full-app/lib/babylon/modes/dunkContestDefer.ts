// RUNUP-STALL-1 (2026-10-30): the contest set never loads during a live dunk.
// AM's trace (fel-visual-qa-2026-10-29/runup-stall): startContestSet fired from finishAttempt while the landing was still
// live, and the rivals' GLBs, the props and the voice banks then arrived during the next run-up: ~5.2 s of long tasks
// (poseClip.ts:216 world-matrix walks, bodyMask.ts fitting). The set now waits for a quiet beat.
// PM (v2/v3): an ALLOW-list. Only these phases are quiet; approach is NOT (the run-up starts there), judging is NOT (the
// replay and the judges' reveal play there), and neither is the run, the flight or the landing. DunkMode has no replay phase: a replay is its `replaying` flag, so it counts as not quiet too.

/** RUNUP-STALL-2 (a): the feel knob `dunk.preloadSet`. 0 (default): the contest set loads between rounds, as in c9e199db.
 *  1: the six bodies (his body and the five onlookers) load and set up, and the landing and replay shaders compile, behind
 *  the contest intro on the first runway: the run is held until they are in (or PRELOAD_CAP_MS passes), so nothing loads in play. */
export const DUNK_PRELOAD_SET_ON = 0;
/** The longest the first runway is held for the preload; past it the night goes on and the set falls back to the between-rounds path. */
export const PRELOAD_CAP_MS = 20000;
/** The burst particles a landing and its replay draw (the landing's dust, the net, the slam's sparks and confetti), warmed under the court. */
export const PRELOAD_BURSTS = ['dust', 'net', 'sparks', 'confetti'] as const;

/** RUNUP-STALL-2b (knob dunk.preloadSet): the rivals who can walk out for the final in place of tonight's foe: every field
 *  dunker who is neither you nor him (the cut's `opp`, DunkMode.finishCut). Classic nights have no field: nobody. */
export function finalistCandidates(field: ReadonlyArray<{ id: string }>, foeId: string, playerId: string): string[] {
  return field.map((d) => d.id).filter((id, i, all) => id !== foeId && id !== playerId && all.indexOf(id) === i);
}

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
