// lib/coach/inboxServed.ts — MIRROR-COACH P8 FIX (2026-09-30, code review): the coach's inbox line for a log on a slot
// the protocol gate swapped. Today serves a closed jump as its ladder's easier step on the SAME slot (the log lands where
// the coach prescribed it), and the log records what was done (ExerciseLog.servedExerciseId, lib/coach/todayServer.ts
// servedOnSlots). Without this line the inbox named the jump, so "Box Jump and Stick: 3 sets" read as landings done.
// Pure; the route resolves the name from the coach's own catalogue.

/** The words the inbox shows under a swapped slot's log. FEL's words; no reason is named (that is the client's data). */
export const servedWords = (served: string, prescribed: string): string =>
  `Did ${served} in place of ${prescribed} (FEL's jump checks).`;

/**
 * The line for one log, or null when it was done as written (no served id). A served id the coach's catalogue no longer
 * names (a deleted row) still says the jump was not done, without a name.
 */
export function servedLine(prescribed: string, servedExerciseId: string | null | undefined, names: ReadonlyMap<string, string>): string | null {
  if (typeof servedExerciseId !== 'string' || !servedExerciseId) return null;
  return servedWords(names.get(servedExerciseId) ?? 'an easier step', prescribed);
}
