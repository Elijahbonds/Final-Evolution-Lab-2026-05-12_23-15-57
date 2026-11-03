// lib/session-player/fromLibrary.ts — PLAT-P08 (2026-11-02): the third adapter. One library entry → a one-step session,
// so "Try it" on the exercise sheet runs it in the phase-1 player (the demo, the dose as one big number, Set done, the
// rest counting itself down). Every word is the entry's own (cue-rewrite's lines); the loop is the one the library's own
// stage plays (lib/library/demo.ts demoFor, handed in as the card's avatarClip), or null: the still, "Demo coming".
//
// Pure. Client-safe.
import type { Session } from './model';

export interface LibraryEntryLike {
  id: string;
  name: string;
  setup: string;
  cues: readonly string[];
  dosage: { sets: number; reps?: string; seconds?: number; contacts?: number; meters?: number; restSec: number };
  avatarClip?: string | null;
}

/** The dose words the player splits into its big number ("8-10", "30 s", "10 contacts", "20 m"). */
function repsOf(d: LibraryEntryLike['dosage']): string | null {
  if (d.reps) return d.reps;
  if (d.seconds) return `${d.seconds} s`;
  if (d.contacts) return `${d.contacts} contacts`;
  if (d.meters) return `${d.meters} m`;
  return null;
}

export function fromLibrary(e: LibraryEntryLike): Session {
  const d = e.dosage;
  return {
    id: `library:${e.id}`,
    title: e.name,
    steps: [{
      exId: e.id,
      name: e.name,
      sets: Math.max(1, d.sets || 1),
      reps: repsOf(d),
      workSeconds: !d.reps && d.seconds ? d.seconds : null,
      restSeconds: Math.max(0, d.restSec || 0),
      setup: e.setup,
      cue: e.cues[0] ?? null,
      clip: e.avatarClip ?? null,
    }],
  };
}
