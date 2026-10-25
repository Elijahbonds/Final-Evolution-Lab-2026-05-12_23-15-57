// lib/library/search/engine.ts — EXERCISE-LIBRARY (2026-10-25): library search people can actually use.
//
// Owner (2026-10-25): "Make sure people can search for what they need." No dependency, and fast over 5,000+ entries
// (scripts/library/bench-search.ts measures it). What it does:
//   · BM25 ranking over weighted fields — name ×4, aliases ×3, family/variation, equipment, muscles, pattern, goals,
//     category, sport, skill layer, and the cues/faults text at a low weight — from one inverted index;
//   · plural and suffix handling (text.ts stem), abbreviations folded on both sides (text.ts TOKEN_CANON: RDL, DB, KB…),
//     and a synonym map (synonyms.ts: hammy → hamstring, vert → vertical, bodyweight → no equipment…) at a lower weight;
//   · typo tolerance: a word the index does not know is matched to the nearest indexed words within 1–2 edits
//     (Damerau-Levenshtein), and the last word also matches as a prefix while someone is still typing;
//   · facets with counts (each facet counted with every OTHER filter applied, so a count says what clicking it gives);
//   · zero-result recovery: "did you mean" from the corrected words, any-term results when every term cannot match,
//     and, when the filters emptied the list, which ONE filter to relax and how many results that brings back.
//
// Pure: no Prisma, no DOM, no clock except the optional `now` used for tookMs. Server-side in the app (the library
// is ~2 MB of JSON); the test and the bench build it directly.

import { CATEGORIES, EQUIPMENT, GOALS, LEVELS, MUSCLES, NO_EQUIPMENT, PATTERNS, SPORT_TAGS, levelRank } from '../vocab';
import { PATTERN_INFO } from '@/lib/coach/catalogue';
import { SKILL_LAYERS } from '@/lib/coach/taxonomy';
import type { LibraryExercise } from '../types';
import { SYNONYM_GROUPS } from './synonyms';
import { editDistance, terms, typoBudget, words, STOP, stem } from './text';

// ── filters and facets ──────────────────────────────────────────────────────────────────────────────────────────────

export const FACET_KEYS = ['pattern', 'equipment', 'muscle', 'level', 'sport', 'layer', 'category', 'goal'] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export interface SearchFilters {
  pattern?: string[];
  equipment?: string[];
  muscle?: string[];
  level?: string[];
  sport?: string[];
  layer?: string[];
  category?: string[];
  goal?: string[];
  /** Joints the entry must keep the load low on ("knee-friendly" → ['knee']). Every one listed must be on the entry. */
  lowLoad?: string[];
  /** When true, `equipment` means "only what I have": the entry's kit must be a subset of it (plus a wall, a mat, a towel). */
  equipmentOnly?: boolean;
  /** Leave these categories out (the Ask parser's "no jumping"). */
  notCategory?: string[];
  /** Leave out entries that need any of this equipment ("without a machine"). */
  notEquipment?: string[];
  /** Restrict to these ids (the Ask layer's easier/harder relation). */
  ids?: string[];
}

export interface SearchOptions {
  /** Include drafts (coaches who opted in). Default: approved only. */
  drafts?: boolean;
  /** Youth rules: adults-only entries are left out (lib/coach/taxonomy.ts youthRules decides who). */
  youth?: boolean;
  offset?: number;
  limit?: number;
  /** Soft boosts: goals that raise an entry's score without filtering (the Ask parser's goal words). */
  boostGoals?: string[];
  /** Soft boost for entries whose PRIMARY muscles include these (a muscle filter matches secondary ones too). */
  boostPrimary?: string[];
  /** Soft boost toward a level (the Ask parser's "easier", "beginner"). */
  preferLevel?: string;
  now?: () => number;
}

export interface SearchHit { entry: LibraryExercise; score: number }

export interface FacetValue { value: string; label: string; count: number }

export interface Relaxation { filter: FacetKey | 'lowLoad'; count: number }

export interface SearchResponse {
  query: string;
  total: number;
  hits: SearchHit[];
  facets: Record<FacetKey, FacetValue[]>;
  /** The query with each unknown word replaced by its nearest indexed word, when that differs. */
  didYouMean: string | null;
  /** Typo corrections applied, word → indexed word. */
  corrected: Record<string, string>;
  /** 'any-term': no entry matched enough of the words, so these match at least one. */
  fallback: 'none' | 'any-term';
  /** When the filters emptied the list: dropping which single filter brings results back, and how many. */
  relaxations: Relaxation[];
  tookMs: number;
}

const AMBIENT = new Set(['wall', 'mat', 'towel']);

const labelMaps = {
  pattern: new Map<string, string>(PATTERNS.map((p) => [p, PATTERN_INFO[p].label])),
  equipment: new Map<string, string>([[NO_EQUIPMENT, 'No equipment'], ...EQUIPMENT.map((e) => [e.id, e.label] as [string, string])]),
  muscle: new Map(MUSCLES.map((m) => [m.id, m.label] as [string, string])),
  level: new Map(LEVELS.map((l) => [l.id, l.label] as [string, string])),
  sport: new Map(SPORT_TAGS.map((s) => [s.id, s.label] as [string, string])),
  layer: new Map<string, string>(SKILL_LAYERS.map((l) => [l.id, l.label])),
  category: new Map(CATEGORIES.map((c) => [c.id, c.label] as [string, string])),
  goal: new Map(GOALS.map((g) => [g.id, g.label] as [string, string])),
} satisfies Record<FacetKey, Map<string, string>>;

export const facetLabel = (key: FacetKey, value: string): string => labelMaps[key].get(value) ?? value;

function facetValues(e: LibraryExercise, key: FacetKey): string[] {
  switch (key) {
    case 'pattern': return [e.pattern];
    case 'equipment': return e.equipment.length ? e.equipment : [NO_EQUIPMENT];
    case 'muscle': return [...e.primaryMuscles, ...e.secondaryMuscles];
    case 'level': return [e.level];
    case 'sport': return e.sportTags;
    case 'layer': return e.skillLayer ? [e.skillLayer] : [];
    case 'category': return [e.category];
    case 'goal': return e.goals;
  }
}

// ── the index ───────────────────────────────────────────────────────────────────────────────────────────────────────

const WEIGHTS = { name: 4, alias: 3, family: 1.5, equipment: 1.5, muscle: 1.2, pattern: 1.2, goal: 1.2, category: 1, sport: 0.8, layer: 0.8, text: 0.3 } as const;

interface Posting { docs: number[]; tf: number[] }

export interface LibraryIndex {
  docs: LibraryExercise[];
  byId: Map<string, number>;
  postings: Map<string, Posting>;
  docLen: Float64Array;
  avgLen: number;
  /** Indexed terms, sorted, for prefix lookups. */
  vocab: string[];
  /** term → the word people would read (for "did you mean"). */
  surface: Map<string, string>;
  /** Names as their search terms in order, for the phrase boost. */
  names: string[];
  facetVals: Record<FacetKey, string[][]>;
  synonyms: Map<string, { terms: string[]; weight: number }[]>;
  builtMs: number;
}

/** Hits scoring under this share of the best hit are dropped (the cues-text long tail). */
export const SCORE_FLOOR = 0.15;
const BM25_K1 = 1.2;
const BM25_B = 0.6;

/** Build the index once per library version (lib/library/server.ts caches it). */
export function buildIndex(entries: readonly LibraryExercise[], now: () => number = Date.now): LibraryIndex {
  const t0 = now();
  const docs = [...entries];
  const postings = new Map<string, Posting>();
  const docLen = new Float64Array(docs.length);
  const surface = new Map<string, { word: string; n: number }>();
  const layerLabel = new Map(SKILL_LAYERS.map((l) => [l.id, l.label]));

  docs.forEach((e, d) => {
    const tf = new Map<string, number>();
    const add = (text: string, w: number, keepSurface = false) => {
      for (const raw of words(text)) {
        if (STOP.has(raw)) continue;
        const t = stem(raw);
        tf.set(t, (tf.get(t) ?? 0) + w);
        docLen[d] += w;
        if (keepSurface) {
          const s = surface.get(t);
          if (!s) surface.set(t, { word: raw, n: 1 });
          else s.n++;
        }
      }
    };
    add(e.name, WEIGHTS.name, true);
    for (const a of e.aliases) add(a, WEIGHTS.alias, true);
    add(`${e.family.replace(/-/g, ' ')} ${e.variation.replace(/[-+]/g, ' ')}`, WEIGHTS.family);
    if (e.equipment.length === 0) add('bodyweight no equipment', WEIGHTS.equipment);
    for (const q of e.equipment) {
      const info = EQUIPMENT.find((x) => x.id === q);
      add(`${info?.label ?? q} ${(info?.aliases ?? []).join(' ')}`, WEIGHTS.equipment);
    }
    for (const m of e.primaryMuscles) add(`${MUSCLES.find((x) => x.id === m)?.label ?? m} ${m.replace(/-/g, ' ')}`, WEIGHTS.muscle);
    for (const m of e.secondaryMuscles) add(`${MUSCLES.find((x) => x.id === m)?.label ?? m}`, WEIGHTS.muscle / 2);
    add(PATTERN_INFO[e.pattern]?.label ?? e.pattern, WEIGHTS.pattern);
    for (const g of e.goals) add(GOALS.find((x) => x.id === g)?.label ?? g, WEIGHTS.goal);
    add(CATEGORIES.find((x) => x.id === e.category)?.label ?? e.category, WEIGHTS.category);
    for (const s of e.sportTags) if (s !== 'general') add(s, WEIGHTS.sport);
    if (e.skillLayer) add(layerLabel.get(e.skillLayer) ?? e.skillLayer, WEIGHTS.layer);
    add([e.setup, ...e.cues, ...e.faults.map((f) => `${f.fault} ${f.fix}`)].join(' '), WEIGHTS.text);
    for (const [t, w] of tf) {
      let p = postings.get(t);
      if (!p) { p = { docs: [], tf: [] }; postings.set(t, p); }
      p.docs.push(d);
      p.tf.push(w);
    }
  });

  const avgLen = docs.length ? docLen.reduce((a, b) => a + b, 0) / docs.length : 1;
  const synonyms = new Map<string, { terms: string[]; weight: number }[]>();
  for (const g of SYNONYM_GROUPS) {
    const phraseTerms = g.phrases.map((p) => terms(p)).filter((t) => t.length);
    for (const pt of phraseTerms) {
      if (pt.length !== 1) continue; // a query WORD expands; multi-word phrases are expansion targets
      const others = phraseTerms.filter((o) => o.join(' ') !== pt.join(' '));
      const list = synonyms.get(pt[0]) ?? [];
      for (const o of others) list.push({ terms: o, weight: g.weight });
      synonyms.set(pt[0], list);
    }
  }
  const facetVals = Object.fromEntries(FACET_KEYS.map((k) => [k, docs.map((e) => facetValues(e, k))])) as Record<FacetKey, string[][]>;
  return {
    docs, byId: new Map(docs.map((e, i) => [e.id, i])), postings, docLen, avgLen,
    vocab: [...postings.keys()].sort(), surface: new Map([...surface].map(([t, s]) => [t, s.word])),
    names: docs.map((e) => terms(e.name).join(' ')), facetVals, synonyms, builtMs: now() - t0,
  };
}

// ── the query ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** `cap`: an idf ceiling, so a synonym that lands on a rare word never outranks the word that was typed. */
interface Alt { terms: string[]; weight: number; cap?: number }
interface Group { word: string; alts: Alt[]; corrected: string | null }

/** Nearest indexed terms to an unknown one: smallest edit distance, then most documents. */
function fuzzy(index: LibraryIndex, t: string): string[] {
  const budget = typoBudget(t.length);
  if (!budget) return [];
  let best = budget + 1;
  let found: { term: string; df: number }[] = [];
  for (const v of index.vocab) {
    if (Math.abs(v.length - t.length) > budget || v.length < 3) continue;
    const d = editDistance(t, v, budget);
    if (d > budget || d > best) continue;
    const df = index.postings.get(v)!.docs.length;
    if (d < best) { best = d; found = [{ term: v, df }]; }
    else found.push({ term: v, df });
  }
  return found.sort((a, b) => b.df - a.df).slice(0, 3).map((f) => f.term);
}

function prefixMatches(index: LibraryIndex, t: string, max = 5): string[] {
  if (t.length < 3) return [];
  let lo = 0, hi = index.vocab.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (index.vocab[mid] < t) lo = mid + 1; else hi = mid; }
  const out: { term: string; df: number }[] = [];
  for (let i = lo; i < index.vocab.length && index.vocab[i].startsWith(t); i++) {
    if (index.vocab[i] !== t) out.push({ term: index.vocab[i], df: index.postings.get(index.vocab[i])!.docs.length });
  }
  return out.sort((a, b) => b.df - a.df).slice(0, max).map((x) => x.term);
}

export function parseQuery(index: LibraryIndex, q: string): Group[] {
  const ws = words(q).filter((w) => !STOP.has(w));
  const own = new Set(ws.map(stem));
  // a synonym never stands in for ANOTHER word of the same query ("crossover dribble": crossover is not a dribble hit)
  const usable = (s: Alt) => s.terms.every((x) => index.postings.has(x)) && !s.terms.every((x) => own.has(x));
  return ws.map((w, i) => {
    const t = stem(w);
    const alts: Alt[] = [];
    let corrected: string | null = null;
    const last = i === ws.length - 1;
    const prefixes = last ? prefixMatches(index, t) : [];
    const cap = index.postings.has(t) ? idf(index, t) : undefined;
    if (index.postings.has(t)) alts.push({ terms: [t], weight: 1 });
    for (const s of index.synonyms.get(t) ?? []) if (usable(s)) alts.push({ ...s, cap });
    // an unknown word: a prefix while typing the last word, else the nearest words within the typo budget
    if (!index.postings.has(t) && !prefixes.length) {
      const near = fuzzy(index, t);
      if (near.length) {
        corrected = index.surface.get(near[0]) ?? near[0];
        for (const n of near) {
          alts.push({ terms: [n], weight: 0.75 });
          for (const s of index.synonyms.get(n) ?? []) if (usable(s)) alts.push({ terms: s.terms, weight: s.weight * 0.75 });
        }
      }
    }
    for (const p of prefixes) alts.push({ terms: [p], weight: 0.6 });
    return { word: w, alts, corrected };
  });
}

function idf(index: LibraryIndex, t: string): number {
  const n = index.postings.get(t)?.docs.length ?? 0;
  return Math.log(1 + (index.docs.length - n + 0.5) / (n + 0.5));
}

/** Per-document score for one group: the best of its alternatives (a synonym never double-counts). */
function scoreGroup(index: LibraryIndex, g: Group, out: Float64Array, hit: Uint8Array): void {
  const best = new Map<number, number>();
  for (const a of g.alts) {
    // a multi-term alternative ("romanian deadlift") scores only where every term is present
    const per = new Map<number, number>();
    let first = true;
    for (const t of a.terms) {
      const p = index.postings.get(t);
      if (!p) { per.clear(); break; }
      const w = a.cap === undefined ? idf(index, t) : Math.min(a.cap, idf(index, t));
      const next = new Map<number, number>();
      for (let i = 0; i < p.docs.length; i++) {
        const d = p.docs[i];
        if (!first && !per.has(d)) continue;
        const tf = p.tf[i];
        const s = w * (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * index.docLen[d] / index.avgLen));
        next.set(d, (per.get(d) ?? 0) + s);
      }
      per.clear();
      for (const [d, s] of next) per.set(d, s);
      first = false;
    }
    for (const [d, s] of per) {
      const v = (s / a.terms.length) * a.weight;
      if (v > (best.get(d) ?? 0)) best.set(d, v);
    }
  }
  for (const [d, v] of best) { out[d] += v; hit[d]++; }
}

function passes(index: LibraryIndex, d: number, f: SearchFilters, opts: SearchOptions, skip?: FacetKey | 'lowLoad'): boolean {
  const e = index.docs[d];
  if (!opts.drafts && e.review.status !== 'approved') return false;
  if (e.review.status === 'rejected') return false;
  if (opts.youth && !e.youthOk) return false;
  if (f.ids && !f.ids.includes(e.id)) return false;
  if (f.notCategory?.includes(e.category)) return false;
  if (f.notEquipment?.length && e.equipment.some((x) => f.notEquipment!.includes(x))) return false;
  for (const k of FACET_KEYS) {
    if (k === skip) continue;
    const want = f[k];
    if (k === 'equipment' && f.equipmentOnly) {
      // "only what I have" — an empty list means bodyweight
      const have = new Set(want ?? []);
      if (!e.equipment.every((x) => have.has(x) || AMBIENT.has(x))) return false;
      continue;
    }
    if (!want || !want.length) continue;
    const vals = index.facetVals[k][d];
    if (!vals.some((v) => want.includes(v))) return false;
  }
  if (skip !== 'lowLoad' && f.lowLoad?.length && !f.lowLoad.every((j) => (e.lowLoad as string[]).includes(j))) return false;
  return true;
}

const emptyFacets = (): Record<FacetKey, FacetValue[]> => Object.fromEntries(FACET_KEYS.map((k) => [k, []])) as unknown as Record<FacetKey, FacetValue[]>;

/** The search. `q` may be empty (browse by filters). */
export function search(index: LibraryIndex, q: string, filters: SearchFilters = {}, opts: SearchOptions = {}): SearchResponse {
  const now = opts.now ?? Date.now;
  const t0 = now();
  const groups = parseQuery(index, q);
  const n = index.docs.length;
  const score = new Float64Array(n);
  const hitCount = new Uint8Array(n);
  let textMatch: Uint8Array | null = null;
  let fallback: SearchResponse['fallback'] = 'none';
  const corrected: Record<string, string> = {};
  for (const g of groups) if (g.corrected && g.corrected !== g.word) corrected[g.word] = g.corrected;

  const live = groups.filter((g) => g.alts.length);
  if (groups.length) {
    for (const g of live) scoreGroup(index, g, score, hitCount);
    // min-should-match over the words the index can read: all of them for one or two words, all but one beyond that
    const need = live.length <= 2 ? live.length : live.length - 1;
    textMatch = new Uint8Array(n);
    let any = 0;
    for (let d = 0; d < n; d++) if (need > 0 && hitCount[d] >= need) { textMatch[d] = 1; any++; }
    if (!any) {
      for (let d = 0; d < n; d++) if (hitCount[d] > 0) { textMatch[d] = 1; any++; }
      if (any) fallback = 'any-term';
    }
    // phrase boosts on the name
    const phrase = terms(q).join(' ');
    if (phrase.length >= 3) {
      for (let d = 0; d < n; d++) {
        if (!textMatch[d]) continue;
        const name = index.names[d];
        if (name === phrase) score[d] *= 3;
        else if (name.startsWith(phrase)) score[d] *= 1.6;
        else if (name.includes(phrase)) score[d] *= 1.3;
      }
    }
    // a query's long tail (one weak word in the cues text) is noise, not a result: keep hits within reach of the best
    let top = 0;
    for (let d = 0; d < n; d++) if (textMatch[d] && score[d] > top) top = score[d];
    for (let d = 0; d < n; d++) if (textMatch[d] && score[d] < top * SCORE_FLOOR) textMatch[d] = 0;
  }

  const boost = new Set(opts.boostGoals ?? []);
  const prefer = opts.preferLevel ? levelRank(opts.preferLevel) : null;
  const matched: number[] = [];
  for (let d = 0; d < n; d++) {
    if (textMatch && !textMatch[d]) continue;
    if (!passes(index, d, filters, opts)) continue;
    const e = index.docs[d];
    if (boost.size) score[d] += e.goals.filter((g) => boost.has(g)).length * 0.8;
    // the first primary muscle is what the entry is FOR; the others it trains too
    if (opts.boostPrimary?.length) score[d] += e.primaryMuscles.reduce((s, m, i) => s + (opts.boostPrimary!.includes(m) ? (i === 0 ? 1.5 : 0.6) : 0), 0);
    if (prefer !== null) score[d] -= Math.abs(levelRank(e.level) - prefer) * 0.5;
    matched.push(d);
  }
  const textless = !groups.length;
  matched.sort((a, b) => (textless && !boost.size && prefer === null && !opts.boostPrimary?.length
    ? levelRank(index.docs[a].level) - levelRank(index.docs[b].level) || index.docs[a].name.localeCompare(index.docs[b].name)
    : score[b] - score[a] || index.docs[a].name.length - index.docs[b].name.length || index.docs[a].id.localeCompare(index.docs[b].id)));

  // facets: each counted with every other filter applied
  const facets = emptyFacets();
  for (const k of FACET_KEYS) {
    const counts = new Map<string, number>();
    for (let d = 0; d < n; d++) {
      if (textMatch && !textMatch[d]) continue;
      if (!passes(index, d, filters, opts, k)) continue;
      for (const v of new Set(index.facetVals[k][d])) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    facets[k] = [...counts].map(([value, count]) => ({ value, label: facetLabel(k, value), count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  // zero-result recovery: which single filter to relax
  const relaxations: Relaxation[] = [];
  if (!matched.length) {
    for (const k of [...FACET_KEYS, 'lowLoad' as const]) {
      const active = k === 'lowLoad' ? filters.lowLoad?.length : k === 'equipment' && filters.equipmentOnly ? 1 : filters[k]?.length;
      if (!active) continue;
      let c = 0;
      for (let d = 0; d < n; d++) if ((!textMatch || textMatch[d]) && passes(index, d, filters, opts, k)) c++;
      if (c) relaxations.push({ filter: k, count: c });
    }
    relaxations.sort((a, b) => b.count - a.count);
  }

  const didYouMean = Object.keys(corrected).length
    ? words(q).map((w) => corrected[w] ?? w).join(' ')
    : null;
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 24));
  return {
    query: q, total: matched.length,
    hits: matched.slice(offset, offset + limit).map((d) => ({ entry: index.docs[d], score: Math.round(score[d] * 1000) / 1000 })),
    facets, didYouMean, corrected, fallback, relaxations, tookMs: now() - t0,
  };
}
