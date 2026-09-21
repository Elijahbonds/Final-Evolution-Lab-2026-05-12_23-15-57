// Matching a folder of filmed exercises to the drills in the Playbook.
//
// Extracted from scripts/education/ingest-films.ts (2026-09-21) so it can be tested and so the match can be run
// against a LIST OF NAMES as well as a real folder. The owner's films live in a Google Drive folder that is not
// mounted on this machine; deciding how to move ~30 videos is a lot easier once you know whether their names
// match the book at all, and that question only needs the names.
//
// It PRINTS WHAT IT IS UNSURE ABOUT rather than guessing quietly: a film attached to the wrong drill teaches
// somebody the wrong movement.

/** Confident enough to attach without a human looking at it. */
export const STRONG = 0.62;
/** Worth showing as a maybe. Below this it is not offered at all. */
export const WEAK = 0.4;

const NOISE = new Set(['the', 'and', 'for', 'with', 'your']);

/** The meaningful words in a filename or a drill title. */
export function words(s: string): string[] {
  return s.toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/\b(final|v\d+|copy|edit|export|render|clip|video|hd|4k|1080p?|720p?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NOISE.has(w));
}

/** Jaccard over meaningful words — robust to "Drill 2 - Pogo Progression FINAL.mov" vs "The Oscillatory Pogo…". */
export function score(file: string, drillTitle: string): number {
  const a = new Set(words(file));
  const b = new Set(words(drillTitle));
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / new Set([...a, ...b]).size;
}

export interface MatchDrill { key: string; title: string; chapter: number }
export interface FilmMatch { key: string; title: string; file: string; score: number }
export interface FilmMaybe { file: string; best: string; score: number }
export interface MatchResult {
  matched: FilmMatch[];
  unsure: FilmMaybe[];
  unmatched: string[];
  missing: MatchDrill[];
}

/**
 * Pair each film with at most one drill and each drill with at most one film, best pair first — so one strong
 * film is not stolen by an earlier weak match. `files` may be full paths or bare names; `label` decides what
 * text is matched on (the basename, normally).
 */
export function matchFilms(
  files: readonly string[], drills: readonly MatchDrill[],
  opts: { strong?: number; weak?: number; label?: (f: string) => string } = {},
): MatchResult {
  const strong = opts.strong ?? STRONG;
  const weak = opts.weak ?? WEAK;
  const label = opts.label ?? ((f: string) => f.slice(f.lastIndexOf('/') + 1));

  const pairs = files.flatMap((f) => drills.map((d) => ({ f, d, s: score(label(f), d.title) })));
  // Ties are broken by name so the same inputs always give the same answer — a matcher that shuffles between
  // runs makes "did my rename help?" unanswerable.
  pairs.sort((a, b) => b.s - a.s || a.f.localeCompare(b.f) || a.d.key.localeCompare(b.d.key));

  const matched: FilmMatch[] = [], unsure: FilmMaybe[] = [];
  const takenDrill = new Set<string>(), usedFile = new Set<string>();
  for (const { f, d, s } of pairs) {
    if (s < weak || takenDrill.has(d.key) || usedFile.has(f)) continue;
    if (s >= strong) { matched.push({ key: d.key, title: d.title, file: f, score: s }); takenDrill.add(d.key); usedFile.add(f); }
    else if (!unsure.some((u) => u.file === f)) unsure.push({ file: f, best: d.title, score: s });
  }
  const unmatched = files.filter((f) => !usedFile.has(f) && !unsure.some((u) => u.file === f));
  const missing = drills.filter((d) => !takenDrill.has(d.key));
  return { matched, unsure, unmatched, missing };
}
