// THE FIRST-RUN WALKTHROUGH (CREATOR-PLAN phase 4d, 2026-10-06): about thirty seconds — place a part, paint a layer,
// save — shown once per device and skippable at any step. Pure state + a device-only memory (localStorage, never
// uploaded: a teen's device keeps it like everything else of theirs).
//
// Each step finishes when the player DOES the thing (a part appears in the doc, a layer appears, a save succeeds), not
// when they press Next — though Next is there too, so nobody is stuck on a step they do not want.

export const WALK_STEPS = ['part', 'paint', 'save'] as const;
export type WalkStep = typeof WALK_STEPS[number];

export interface WalkState {
  /** index into WALK_STEPS; WALK_STEPS.length when finished */
  step: number;
  /** finished or skipped: nothing shows */
  over: boolean;
  skipped: boolean;
}

export type WalkEvent = 'partAdded' | 'layerAdded' | 'saved' | 'next' | 'skip';

export const WALK_START: WalkState = { step: 0, over: false, skipped: false };
export const WALK_DONE: WalkState = { step: WALK_STEPS.length, over: true, skipped: false };

const STEP_EVENT: Record<WalkStep, WalkEvent> = { part: 'partAdded', paint: 'layerAdded', save: 'saved' };

/** The walkthrough after an event. Doing the current step (or Next) moves on; Skip ends it; anything else is ignored
 *  (painting while the part step shows does not skip the part step). */
export function walkReduce(s: WalkState, e: WalkEvent): WalkState {
  if (s.over) return s;
  if (e === 'skip') return { step: s.step, over: true, skipped: true };
  const cur = WALK_STEPS[s.step];
  if (e !== 'next' && STEP_EVENT[cur] !== e) return s;
  const step = s.step + 1;
  return step >= WALK_STEPS.length ? { ...WALK_DONE } : { ...s, step };
}

export const walkCurrent = (s: WalkState): WalkStep | null => (s.over ? null : WALK_STEPS[s.step] ?? null);

/** What each step says, and which editor tab it opens. */
export const WALK_COPY: Record<WalkStep, { title: string; body: string; tab: 'parts' | 'paint' | null }> = {
  part: { title: 'Place a part', body: 'Pick any shape in Parts — then drag its centre knob onto the body. It snaps to the nearest bone.', tab: 'parts' },
  paint: { title: 'Paint a layer', body: 'Add a fill, a pattern or a stamp in Paint. Tap the body to choose where it goes; drag a stamp to move it.', tab: 'paint' },
  save: { title: 'Save it', body: 'Save keeps this character in its slot (five slots). Undo, the history strip and Before/After have your back.', tab: null },
};

/** About how long the whole thing takes (s) — what the card promises. */
export const WALK_SECONDS = 30;

// ── per-device memory ────────────────────────────────────────────────────────────────────────────────────────────────

export const WALK_KEY = 'fel.studio.walkthrough.v1';

interface StoreLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

const storeOf = (s?: StoreLike | null): StoreLike | null => {
  if (s !== undefined) return s;
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
};

/** Has this device finished or skipped the walkthrough? (A storage that throws — private mode — counts as seen, so the
 *  walkthrough never nags on every visit there.) */
export function walkSeen(store?: StoreLike | null): boolean {
  const s = storeOf(store);
  if (!s) return true;
  try { return s.getItem(WALK_KEY) != null; } catch { return true; }
}

/** Remember that this device is done with it. */
export function rememberWalk(state: WalkState, store?: StoreLike | null): void {
  if (!state.over) return;
  const s = storeOf(store);
  try { s?.setItem(WALK_KEY, state.skipped ? 'skipped' : 'done'); } catch { /* private mode: nothing to keep */ }
}
