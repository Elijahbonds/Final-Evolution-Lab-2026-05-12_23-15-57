// lib/session-player/model.ts — PLAT-P01 (2026-10-27): the session player's model. One engine, many adapters.
//
// Owner, 2026-10-27: "autoplay, no extra taps, never confusing". A session is a list of steps; the player (./machine.ts)
// walks it set by set on its own: the demo plays, the dose is one big number, Set done starts the rest, the rest counts
// itself down, the next set or exercise opens by itself, and a finish screen ends it.
//
// The engine knows nothing about where a session comes from. Each source has its own adapter that builds a Session:
//   · ./fromSignature.ts — a signature program's served session (lib/signature/serve.ts ServedSession), phase 1;
//   · fromCoachToday (phase 6) and fromLibrary (phase 8) come later.
// So nothing in this folder imports lib/signature/** except fromSignature.ts (tests/session-player/engine-scan.test.ts).
//
// Pure. Client-safe.

export interface Step {
  /** The exercise's library id (the device remembers which exercises the person has done: ./seen.ts). */
  exId: string;
  name: string;
  sets: number;
  /** The dose as written ("8", "6 each side", "20 m each hand", "20 s each side"); a timed step keeps its words here
   *  for the qualifier ("each side"), and its seconds in `workSeconds`. null: nothing written. */
  reps: string | null;
  /** A timed dose: seconds of work per set (the player counts them down by itself); null for a counted step. */
  workSeconds: number | null;
  /** Rest after each set, in seconds. */
  restSeconds: number;
  /** How to set up, in the source's words. Shown behind the "How to set up" sheet. */
  setup: string;
  /** One cue, in the source's words (cue-rewrite owns them), or null. */
  cue: string | null;
  /** The loop that IS this movement (lib/library/demo.ts demoFor), or null: the still start pose, "Demo coming". */
  clip: string | null;
  /** One line the source wants said about today's version of this step (a swap, an eased dose), or nothing. */
  note?: string;
}

export interface Session {
  id: string;
  title: string;
  steps: Step[];
}

/** Every set in the session. */
export const totalSets = (s: Pick<Session, 'steps'>): number => s.steps.reduce((n, st) => n + Math.max(1, st.sets), 0);

/** A step is timed when it has seconds of work and no counted reps. */
export const isTimed = (st: Pick<Step, 'workSeconds'>): boolean => typeof st.workSeconds === 'number' && st.workSeconds > 0;
