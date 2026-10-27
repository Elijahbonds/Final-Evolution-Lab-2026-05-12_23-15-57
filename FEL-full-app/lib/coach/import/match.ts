// lib/coach/import/match.ts — COACH-PARITY (2026-10-26): each imported line's exercise name matched to something FEL can
// prescribe: a row of the coach's OWN catalogue first (their words stay theirs), else the shared library through its own
// search (lib/library/search/engine.ts: abbreviations, plurals and typos folded — "SL RDL" finds Single-Leg Romanian
// Deadlift). Nothing is decided here: the review grid shows the match, its confidence and the next best, and an unmatched
// or doubtful line is flagged for the coach.
//
// CONFIDENCE (term sets from the library's own tokeniser, lib/library/search/text.ts terms):
//   exact  the names are the same once case, order, plurals and abbreviations are folded (nameKey), or an alias is;
//   high   every word typed is in the match, and the two overlap by 60% or more ("Back squat" → Barbell Back Squat;
//          "Bench" → Bench Dips is only low);
//   low    some overlap, or the search's best guess: shown, flagged "check this one";
//   none   nothing close: flagged; the coach picks, adds it as a new exercise of their own, or skips it.
// The search runs over the entries this coach may prescribe: drafts included and labelled (a coach may add a draft to
// their catalogue, lib/library/server.ts addLibraryToCatalogue), and adults-only entries left out for a youth client.
// Pure: the index and the catalogue are passed in.
import { search, type LibraryIndex } from '@/lib/library/search/engine';
import { terms } from '@/lib/library/search/text';
import type { LibraryExercise } from '@/lib/library/types';
import type { Confidence, ItemMatch, ParsedProgram, Suggestion } from './types';

export interface MatchContext {
  index: LibraryIndex;
  /** The coach's own catalogue rows. */
  catalogue: readonly { id: string; name: string }[];
  /** Youth rules for the program's client: adults-only library entries are left out. */
  youth: boolean;
}

/** The library's terms (lib/library/search/text.ts), with the plural its stemmer keeps on short words ("ups") folded too, on
 *  both sides — so "Push-ups" is the library's "Pushups" and "Chin-ups" its "Chin-Up". */
const mterms = (s: string): string[] => terms(s).map((t) => (t.length > 2 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
const key = (s: string): string => [...new Set(mterms(s))].sort().join(' ');
const set = (s: string) => new Set(mterms(s));
export const HIGH_OVERLAP = 0.6;
/** Words that make a VARIANT of a lift (stems, as mterms gives them). */
const MODIFIER = new Set(['chain', 'band', 'banded', 'paus', 'pause', 'paused', 'tempo', 'deficit', 'isometr', 'isometric', 'hold', 'eccentr', 'eccentric', 'interval', 'pry', 'against', 'clock']);

/** Every library entry by the folded key of its name and of each alias (built once per index). */
const exactCache = new WeakMap<LibraryIndex, Map<string, LibraryExercise[]>>();
function exactMap(index: LibraryIndex): Map<string, LibraryExercise[]> {
  let m = exactCache.get(index);
  if (m) return m;
  m = new Map();
  for (const e of index.docs) {
    for (const n of [e.name, ...e.aliases]) {
      const k = key(n);
      if (!k) continue;
      const list = m.get(k) ?? [];
      if (!list.includes(e)) list.push(e);
      m.set(k, list);
    }
  }
  exactCache.set(index, m);
  return m;
}
function overlap(q: Set<string>, c: Set<string>): { jaccard: number; allIn: boolean; shared: number } {
  let shared = 0;
  for (const t of q) if (c.has(t)) shared += 1;
  const union = new Set([...q, ...c]).size;
  return { jaccard: union ? shared / union : 0, allIn: q.size > 0 && shared === q.size, shared };
}

function grade(name: string, candidates: readonly string[]): { confidence: Confidence; sim: number } {
  const k = key(name);
  if (k && candidates.some((c) => key(c) === k)) return { confidence: 'exact', sim: 1 };
  const q = set(name);
  let best = { jaccard: 0, allIn: false, shared: 0 };
  for (const c of candidates) { const o = overlap(q, set(c)); if (o.jaccard > best.jaccard) best = o; }
  if (best.allIn && best.jaccard >= HIGH_OVERLAP) return { confidence: 'high', sim: best.jaccard };
  if (best.shared > 0) return { confidence: 'low', sim: best.jaccard };
  return { confidence: 'none', sim: 0 };
}

const RANK: Record<Confidence, number> = { exact: 3, high: 2, low: 1, none: 0 };
const libName = (e: LibraryExercise) => [e.name, ...e.aliases];
const sug = (e: LibraryExercise): Suggestion => ({ kind: 'library', id: e.id, name: e.name, level: e.level, status: e.review.status });

/** One name → its best match and the next few. */
export function matchName(name: string, ctx: MatchContext): ItemMatch {
  const empty: ItemMatch = { kind: 'none', id: null, name: null, confidence: 'none', suggestions: [] };
  if (!name.trim()) return empty;
  // the coach's own rows
  const own = ctx.catalogue.map((r) => ({ r, g: grade(name, [r.name]) })).filter((x) => x.g.confidence !== 'none')
    .sort((a, b) => RANK[b.g.confidence] - RANK[a.g.confidence] || b.g.sim - a.g.sim);
  // the library: the search's top hits, re-ranked by how well the NAME matches (a base above its variants, approved
  // above draft on a tie) — the search ranks for browsing, this ranks for "is this the same exercise"
  const hits = search(ctx.index, name, {}, { group: false, limit: 8, drafts: true, youth: ctx.youth }).hits.map((h) => h.entry);
  // the same name in the library, whatever the search ranked (a base and approved first)
  const same = (exactMap(ctx.index).get(key(name)) ?? []).filter((e) => e.review.status !== 'rejected' && (!ctx.youth || e.youthOk));
  const pool = [...same, ...hits.filter((e) => !same.includes(e))];
  const lib = pool.map((entry, i) => {
    const h = { entry };
    const g = grade(name, libName(h.entry));
    // a loading modifier the coach did not write ("with Chains", "Paused", "Isometric Hold") is a variant, not the lift
    const extra = mterms(h.entry.name).filter((t) => !set(name).has(t));
    const modifier = extra.some((t) => MODIFIER.has(t)) ? 0.08 : 0;
    const score = RANK[g.confidence] * 10 + g.sim - modifier - (h.entry.variantOf ? 0.05 : 0) + (h.entry.review.status === 'approved' ? 0.02 : 0) - i * 0.001;
    return { e: h.entry, g, score };
  }).sort((a, b) => b.score - a.score);
  const bestOwn = own[0];
  const bestLib = lib[0];
  const suggestions: Suggestion[] = [
    ...own.slice(0, 2).map((x) => ({ kind: 'catalogue' as const, id: x.r.id, name: x.r.name })),
    ...lib.slice(0, 4).map((x) => sug(x.e)),
  ].slice(0, 5);
  // own row wins a tie of confidence: the coach's words stay theirs
  if (bestOwn && (!bestLib || RANK[bestOwn.g.confidence] >= RANK[bestLib.g.confidence])) {
    return { kind: 'catalogue', id: bestOwn.r.id, name: bestOwn.r.name, confidence: bestOwn.g.confidence, suggestions };
  }
  if (bestLib) {
    // the search found it but no word lines up (a typo the search forgave): still a guess worth showing, flagged low
    const confidence: Confidence = bestLib.g.confidence === 'none' ? 'low' : bestLib.g.confidence;
    return { kind: 'library', id: bestLib.e.id, name: bestLib.e.name, confidence, suggestions };
  }
  return { ...empty, suggestions };
}

/** Every line of a parsed program, matched (one search per distinct name). */
export function matchProgram(p: ParsedProgram, ctx: MatchContext): { matches: ItemMatch[][][]; flagged: number; counts: Record<Confidence, number> } {
  const memo = new Map<string, ItemMatch>();
  const counts: Record<Confidence, number> = { exact: 0, high: 0, low: 0, none: 0 };
  const matches = p.weeks.map((w) => w.days.map((d) => d.items.map((it) => {
    const k = it.name.toLowerCase();
    const m = memo.get(k) ?? matchName(it.name, ctx);
    memo.set(k, m);
    counts[m.confidence] += 1;
    return m;
  })));
  return { matches, flagged: counts.low + counts.none, counts };
}

/** Does the review grid flag this match? */
export const flagged = (m: Pick<ItemMatch, 'confidence'>): boolean => m.confidence === 'low' || m.confidence === 'none';
