// Undo / redo for any editor draft (IMPROVE (2026-10-06), CREATOR-PLAN phase 1; research item 6). Pure and immutable:
// every call returns a new History, so it drops straight into React state.
//
// COALESCING. A slider drag or a colour-picker drag fires dozens of changes; undo should step back over the whole drag,
// not one pixel of it. A change pushed with the same `group` as the change before it REPLACES the present instead of
// adding a step. Any other change (or `group` omitted) is a new step.
//
// THE CAP. `limit` steps of past (default 100); the oldest falls off. Redo is cleared by any new change, as everywhere.

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** the group of the last push, for coalescing */
  group: string | null;
  limit: number;
}

export function createHistory<T>(present: T, limit = 100): History<T> {
  return { past: [], present, future: [], group: null, limit: Math.max(1, Math.floor(limit)) };
}

/** Record a change. `equal` decides "nothing changed" (default: JSON equality), which records nothing. */
export function pushHistory<T>(h: History<T>, next: T, group?: string, equal: (a: T, b: T) => boolean = jsonEqual): History<T> {
  if (equal(h.present, next)) return h;
  if (group && h.group === group && h.past.length) return { ...h, present: next, future: [] };
  const past = [...h.past, h.present];
  if (past.length > h.limit) past.splice(0, past.length - h.limit);
  return { ...h, past, present: next, future: [], group: group ?? null };
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const past = h.past.slice(0, -1);
  return { ...h, past, present: h.past[h.past.length - 1], future: [h.present, ...h.future], group: null };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  const [next, ...future] = h.future;
  return { ...h, past: [...h.past, h.present], present: next, future, group: null };
}

/** Start over from `present` (a load or a reset): no undo across it. */
export function resetHistory<T>(h: History<T>, present: T): History<T> {
  return createHistory(present, h.limit);
}

export const canUndo = (h: History<unknown>): boolean => h.past.length > 0;
export const canRedo = (h: History<unknown>): boolean => h.future.length > 0;

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}
