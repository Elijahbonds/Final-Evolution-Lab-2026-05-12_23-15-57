// lib/library/match.ts — LIBRARY-ANATOMY-2 (2026-10-25): which library entry a row from somewhere else IS, by its name.
//
// Owner decision (2026-10-25): the coach catalogue's rows show the library's stage (the athlete's avatar, demoFor's loop)
// where the row links to a library entry — a catalogue row copied from the library carries ProgramExercise.libraryExerciseId;
// a Blueprint knowledge-base exercise has no link, so it is matched by the name the library already answers to — and the
// cue card otherwise. Never a wrong movement: a match is the same words as an entry's name or one of its aliases (nameKey:
// any order, case and punctuation folded the way search folds them, lib/library/search/text.ts), and only when exactly
// one entry answers. Two entries answering is no answer (the cue card), never a guess; a near name ("Single-Leg Pogo Hops"
// against "Single-Leg Pogo") is not a match. Pure.
import { nameKey } from './search/text';
import type { LibraryExercise } from './types';

const KEYS = new WeakMap<readonly LibraryExercise[], Map<string, Set<string>>>();

function keysOf(docs: readonly LibraryExercise[]): Map<string, Set<string>> {
  let m = KEYS.get(docs);
  if (m) return m;
  m = new Map();
  for (const e of docs) {
    if (e.review.status === 'rejected') continue;
    for (const n of [e.name, ...(e.aliases ?? [])]) {
      const k = nameKey(n);
      if (!k) continue;
      const ids = m.get(k) ?? new Set<string>();
      ids.add(e.id);
      m.set(k, ids);
    }
  }
  KEYS.set(docs, m);
  return m;
}

/** The one library entry any of `names` names exactly, or null (none, or more than one). */
export function matchLibraryByName(docs: readonly LibraryExercise[], names: readonly (string | null | undefined)[]): LibraryExercise | null {
  const m = keysOf(docs);
  const ids = new Set<string>();
  for (const n of names) {
    const k = n ? nameKey(n) : '';
    for (const id of (k && m.get(k)) || []) ids.add(id);
  }
  if (ids.size !== 1) return null;
  const [id] = ids;
  return docs.find((e) => e.id === id) ?? null;
}
