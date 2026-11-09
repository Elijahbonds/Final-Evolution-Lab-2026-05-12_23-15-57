// DEMO-MODELS-1 item 3 (2026-11-09): tonight's rival's body FILE, fetched once your first dunk is in.
//
// AM's live audit (8:28 AM, 2026-11-09): the 24 forge rival files all answer 200, yet no guest Flight Night run downloaded one.
// The cause is DunkMode's own schedule, not the files. Since RUNUP-STALL-1 the contest set (which brings his body, bringRival) may
// only START on an allow-listed quiet phase (dunkContestDefer QUIET_DUNK_PHASES: rivalTurn, fieldCut, contestOver). finishAttempt
// asks for it after your dunk 1 in `resolve`, so it is queued; between your dunks the phases are only approach / charge /
// cinematic / resolve / judging, none of them quiet, so the queue never fires. His file is first asked for in rivalRound, after
// BOTH of your round-1 dunks (DUNKS_PER_ROUND = 2) and dunk 2's judging. A guest run that stops before that (one or two dunks, as
// in AM's runs) never requests a rival file. The preload (dunk.preloadSet) would fetch it, but that knob is off by default.
//
// The fix, behind DUNK_RIVAL_PREFETCH_ENABLED (off = exactly as live): when the set is queued, the file alone is fetched into the
// HTTP cache, at low priority, once per URL. Network only: nothing is parsed, spawned or set up, so it adds no main-thread work to
// the run-up (the RUNUP-STALL-1 long tasks were the GLB parse, the poses and the mask, all still waiting for the quiet beat). His
// turn then loads the body from the cache. The same HTTP-cache warm lib/library/demoWarm.ts does for the demo body.

const fetched = new Set<string>();

type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;

/**
 * Fetch `url` into the HTTP cache when `on`. Returns null when it does nothing (off, no URL, already asked for), otherwise a promise
 * of whether the file came back ok. Never throws, never rejects.
 */
export function prefetchRivalBody(url: string | null | undefined, on: boolean, fetchFn: FetchLike | undefined = (globalThis as { fetch?: FetchLike }).fetch): Promise<boolean> | null {
  if (!on || !url || fetched.has(url) || typeof fetchFn !== 'function') return null;
  fetched.add(url);
  try {
    return fetchFn(url, { credentials: 'same-origin', priority: 'low' } as RequestInit)
      .then(async (r) => { await r.arrayBuffer(); return r.ok; })   // read to the end, so the whole file is cached
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** The URLs asked for so far (tests). */
export function prefetchedRivalBodies(): string[] { return [...fetched]; }
/** Tests: forget what was asked for. */
export function resetRivalPrefetch(): void { fetched.clear(); }
