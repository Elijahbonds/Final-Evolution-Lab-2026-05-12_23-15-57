// lib/library/ask/answer.ts — EXERCISE-LIBRARY (2026-10-25): a question → real library entries, grounded.
//
// The order, every time:
//   1. parse (./parse.ts, deterministic, always on) → filters shown as chips;
//   2. SAFETY: a pain or injury question gets FEL's existing words — the coach disclosure (lib/coach/aiSystemPrompt.ts
//      AI_COACH_DISCLOSURE) and the pain check-in's own line (lib/health/painRule.ts PAIN_DECISION_COPY:
//      stop_see_clinician for an adult, stop_tell_adult for a minor) — plus general PREHAB entries only (each carries
//      "General prehab, not treatment."). No AI call, no relation, no other result;
//   3. retrieve: an easier / harder / instead-of relation walks the library's own links (regressionId, progressionId)
//      and the anchor's family, pattern and muscles; a warm-up or cool-down question builds a short plan by slots;
//      anything else is the search with the chips' filters. Empty → relax one filter at a time (never the person's
//      equipment or joint limits, never youth rules) and say which;
//   4. optionally the AI (./ai.ts): only when the switch is on and the caller allows it; it can only reorder the
//      candidates by id, add filters from the fixed lists, and write a screened "why these" line.
// Youth rules (owner decisions #6 and #20, lib/coach/taxonomy.ts youthRules) are applied by the search itself.
//
// Pure: the index, the model call and the clock are passed in.

import { AI_COACH_DISCLOSURE } from '@/lib/coach/aiSystemPrompt';
import { PAIN_DECISION_COPY } from '@/lib/health/painRule';
import { search, type FacetKey, type LibraryIndex, type SearchFilters, type SearchOptions, type SearchResponse } from '../search/engine';
import type { LibraryExercise } from '../types';
import { levelRank } from '../vocab';
import { aiCandidates, aiSystemPrompt, aiUserMessage, mergeFilters, parseAiReply } from './ai';
import { parseAsk, type AskChip, type ParsedAsk } from './parse';

export interface AskOptions {
  drafts?: boolean;
  /** Youth rules for this asker (server-decided). */
  youth?: boolean;
  /** The AI layer, when the switch is on and the caller is within its rate limit. */
  ai?: { call: (system: string, user: string) => Promise<string> } | null;
  limit?: number;
}

export interface PlanStep { slot: string; entry: LibraryExercise; minutes: number }

export interface AskAnswer {
  parsed: ParsedAsk;
  chips: AskChip[];
  results: LibraryExercise[];
  total: number;
  plan: PlanStep[] | null;
  /** The anchor an easier / harder / instead-of question was read against. */
  anchor: LibraryExercise | null;
  /** Shown above the results on a pain or injury question: FEL's existing words, never new safety copy. */
  safety: string[] | null;
  /** Filters dropped to find anything, in the order dropped. */
  relaxed: (FacetKey | 'lowLoad' | 'notCategory' | 'text')[];
  ai: { used: boolean; why: string | null };
  /** The filters the results were actually found with (the chips the UI shows as editable). */
  filters: SearchFilters;
  didYouMean: string | null;
}

/** Filters an answer may drop to find something, in order. Equipment limits, joint limits and youth rules are never dropped. */
const RELAXABLE: readonly (FacetKey | 'notCategory')[] = ['goal', 'category', 'muscle', 'level', 'sport', 'layer', 'pattern'];

function searchRelaxing(index: LibraryIndex, text: string, filters: SearchFilters, opts: SearchOptions): { r: SearchResponse; filters: SearchFilters; relaxed: AskAnswer['relaxed'] } {
  let f = { ...filters };
  const relaxed: AskAnswer['relaxed'] = [];
  let r = search(index, text, f, opts);
  // leftover words the library does not know go first: the chips are what the person can see and edit
  let q = text;
  if (r.total === 0 && q) { const r2 = search(index, '', f, opts); if (r2.total) { r = r2; q = ''; relaxed.push('text'); } }
  for (const k of RELAXABLE) {
    if (r.total > 0) break;
    if (!(f as Record<string, unknown>)[k]) continue;
    f = { ...f, [k]: undefined };
    relaxed.push(k);
    r = search(index, q, f, opts);
  }
  return { r, filters: f, relaxed };
}

/** The anchor for "easier than X": the best name match, by the search itself. */
function findAnchor(index: LibraryIndex, text: string, opts: SearchOptions): LibraryExercise | null {
  return search(index, text, {}, { ...opts, limit: 1 }).hits[0]?.entry ?? null;
}

function related(index: LibraryIndex, anchor: LibraryExercise, kind: 'easier' | 'harder' | 'alternative', filters: SearchFilters, opts: SearchOptions): LibraryExercise[] {
  const byId = (id: string | null) => (id ? index.docs[index.byId.get(id) ?? -1] ?? null : null);
  const chain: LibraryExercise[] = [];
  if (kind !== 'alternative') {
    // forward links (the anchor's own easier / harder), then the reverse: entries that name the anchor as THEIR
    // harder / easier version (a seed row gains neighbours that way without being edited)
    const step = (e: LibraryExercise): LibraryExercise[] => {
      const fwd = byId(kind === 'easier' ? e.regressionId : e.progressionId);
      const back = index.docs.filter((d) => (kind === 'easier' ? d.progressionId : d.regressionId) === e.id);
      return [...(fwd ? [fwd] : []), ...back];
    };
    let frontier = [anchor];
    for (let i = 0; i < 4 && frontier.length; i++) {
      const next: LibraryExercise[] = [];
      for (const e of frontier) for (const n of step(e)) if (n.id !== anchor.id && !chain.some((c) => c.id === n.id)) { chain.push(n); next.push(n); }
      frontier = next;
    }
  }
  const ar = levelRank(anchor.level);
  const shares = (e: LibraryExercise) => e.primaryMuscles.some((m) => anchor.primaryMuscles.includes(m));
  const fits = (e: LibraryExercise) => {
    if (e.id === anchor.id) return false;
    const r = levelRank(e.level);
    if (kind === 'easier') return r < ar;
    if (kind === 'harder') return r > ar;
    return Math.abs(r - ar) <= 1;
  };
  // the rest: same pattern, sharing a primary muscle, ranked by how much of the anchor they share (family, muscles,
  // goals, equipment) and how close the level is — by tags, not by the anchor's name
  const all = search(index, '', { ...filters, pattern: [anchor.pattern] }, { ...opts, limit: 100, offset: 0 });
  const pool = (all.total > 100 ? search(index, '', { ...filters, pattern: [anchor.pattern] }, { ...opts, limit: 100, boostGoals: anchor.goals, boostPrimary: anchor.primaryMuscles }) : all)
    .hits.map((h) => h.entry).filter((e) => fits(e) && shares(e) && !chain.some((c) => c.id === e.id));
  const sim = (e: LibraryExercise) => (e.family === anchor.family ? 3 : 0)
    + 2 * e.primaryMuscles.filter((m) => anchor.primaryMuscles.includes(m)).length
    + e.goals.filter((g) => anchor.goals.includes(g)).length
    + (e.equipment.some((x) => anchor.equipment.includes(x)) || (!e.equipment.length && !anchor.equipment.length) ? 1 : 0)
    - Math.abs(levelRank(e.level) - ar);
  pool.sort((x, y) => sim(y) - sim(x) || x.name.localeCompare(y.name));
  const pass = (e: LibraryExercise) => search(index, '', { ...filters, ids: [e.id] }, opts).total === 1;
  return [...chain.filter(pass), ...pool];
}

/** Warm-up and cool-down slots: what each step is for, the filters that find it, and its share of the minutes. */
const WARMUP_SLOTS: readonly { slot: string; f: SearchFilters; text?: string; share: number }[] = [
  { slot: 'Breathe and open up', f: { category: ['mobility', 'recovery'], goal: ['mobility'] }, share: 0.2 },
  { slot: 'Moving range', f: { goal: ['warmup'], category: ['mobility'] }, share: 0.2 },
  { slot: 'Switch on', f: { category: ['prehab'] }, share: 0.15 },
  { slot: 'Rhythm and skips', f: { category: ['speed-agility'], goal: ['warmup'] }, share: 0.15 },
  { slot: 'Feet and landings', f: { category: ['plyometric'], level: ['beginner'] }, share: 0.15 },
  { slot: 'Game moves', f: { category: ['sport-skill', 'speed-agility'] }, share: 0.15 },
];
const COOLDOWN_SLOTS: readonly { slot: string; f: SearchFilters; share: number }[] = [
  { slot: 'Bring it down', f: { category: ['recovery'], pattern: ['breath'] }, share: 0.3 },
  { slot: 'Easy range', f: { category: ['mobility', 'recovery'], goal: ['cooldown'] }, share: 0.4 },
  { slot: 'Long exhales', f: { category: ['recovery'] }, share: 0.3 },
];

function buildPlan(index: LibraryIndex, p: ParsedAsk, opts: SearchOptions): PlanStep[] {
  const minutes = p.minutes ?? 10;
  const slots = p.intent === 'warmup' ? WARMUP_SLOTS : COOLDOWN_SLOTS;
  const used = new Set<string>();
  const steps: PlanStep[] = [];
  for (const s of slots) {
    const base: SearchFilters = { ...s.f, sport: p.filters.sport, lowLoad: p.filters.lowLoad, equipment: p.filters.equipment, equipmentOnly: p.filters.equipmentOnly, notCategory: p.filters.notCategory };
    if (s.slot === 'Game moves' && !p.filters.sport?.length) continue;
    let pick: LibraryExercise | undefined;
    for (const f of [base, { ...base, sport: undefined }, { ...base, goal: undefined, sport: undefined, level: undefined }]) {
      // beginner-friendly first: a warm-up is not the place for the hardest version
      pick = search(index, p.text, f, { ...opts, limit: 40, preferLevel: 'beginner', boostGoals: ['warmup', ...p.boostGoals] }).hits
        .map((h) => h.entry).find((e) => !used.has(e.id) && !used.has(e.family));
      if (pick) break;
    }
    if (!pick) continue;
    used.add(pick.id); used.add(pick.family);
    steps.push({ slot: s.slot, entry: pick, minutes: s.share });
  }
  // the minutes: each step's share of the slots actually filled, at least a minute each, adding up to what was asked
  const total = steps.reduce((a, s) => a + s.minutes, 0) || 1;
  const exact = steps.map((s) => (s.minutes / total) * minutes);
  const whole = exact.map((x) => Math.max(1, Math.floor(x)));
  let left = minutes - whole.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) whole[order[k].i]++;
  for (let i = whole.length - 1; left < 0 && i >= 0; i--) while (left < 0 && whole[i] > 1) { whole[i]--; left++; }
  steps.forEach((s, i) => { s.minutes = whole[i]; });
  return steps;
}

export async function answerAsk(index: LibraryIndex, question: string, opts: AskOptions = {}): Promise<AskAnswer> {
  const parsed = parseAsk(question);
  const limit = Math.min(20, opts.limit ?? 10);
  const sOpts: SearchOptions = { drafts: opts.drafts, youth: opts.youth, limit: 50, boostGoals: parsed.boostGoals, boostPrimary: parsed.filters.muscle, preferLevel: parsed.preferLevel ?? undefined };
  const empty = (over: Partial<AskAnswer>): AskAnswer => ({
    parsed, chips: parsed.chips, results: [], total: 0, plan: null, anchor: null, safety: null, relaxed: [],
    ai: { used: false, why: null }, filters: parsed.filters, didYouMean: null, ...over,
  });

  // 2. pain or injury: the existing wording and general prehab only. Never the AI.
  if (parsed.injury.flagged) {
    const safety = [AI_COACH_DISCLOSURE, opts.youth ? PAIN_DECISION_COPY.stop_tell_adult : PAIN_DECISION_COPY.stop_see_clinician];
    const lowLoad = [...new Set([...(parsed.filters.lowLoad ?? []), ...(parsed.injury.joints.includes('back') ? ['back' as const] : [])])];
    const filters: SearchFilters = { category: ['prehab'], lowLoad: lowLoad.length ? lowLoad : undefined, equipment: parsed.filters.equipment, equipmentOnly: parsed.filters.equipmentOnly };
    const goals = parsed.injury.joints.filter((j) => ['knee', 'ankle', 'hip', 'shoulder'].includes(j));
    let r = search(index, '', { ...filters, goal: goals.length ? goals : undefined }, { ...sOpts, limit });
    if (!r.total) r = search(index, '', filters, { ...sOpts, limit });
    const chips: AskChip[] = [{ key: 'category', value: 'prehab', label: 'General prehab only' }, ...goals.map((g) => ({ key: 'goal' as const, value: g, label: `For the ${g === 'hip' ? 'hips' : `${g}s`}` }))];
    return empty({ chips, results: r.hits.map((h) => h.entry), total: r.total, safety, filters: { ...filters, goal: goals.length ? goals : undefined } });
  }

  // 3a. easier / harder / instead of
  if (parsed.relation) {
    const anchor = findAnchor(index, parsed.relation.anchorText, sOpts);
    if (anchor) {
      const list = related(index, anchor, parsed.relation.kind, { ...parsed.filters, goal: undefined }, sOpts);
      return finishWithAi(empty({ anchor, results: list.slice(0, limit), total: list.length, filters: parsed.filters }), list, question, opts, limit);
    }
  }

  // 3b. a warm-up or a cool-down: a plan by slots
  if (parsed.intent !== 'find') {
    const plan = buildPlan(index, parsed, sOpts);
    return empty({ plan, results: plan.map((s) => s.entry), total: plan.length, filters: parsed.filters });
  }

  // 3c. search with the chips
  const { r, filters, relaxed } = searchRelaxing(index, parsed.text, parsed.filters, sOpts);
  const list = r.hits.map((h) => h.entry);
  return finishWithAi(empty({ results: list.slice(0, limit), total: r.total, relaxed, filters, didYouMean: r.didYouMean }), list, question, opts, limit, index, parsed, sOpts);
}

/** 4. The optional AI pass: reorder the real candidates, maybe add filters, write the why-line. Fails closed. */
async function finishWithAi(
  a: AskAnswer, candidates: LibraryExercise[], question: string, opts: AskOptions, limit: number,
  index?: LibraryIndex, parsed?: ParsedAsk, sOpts?: SearchOptions,
): Promise<AskAnswer> {
  if (!opts.ai || !candidates.length) return a;
  const cands = aiCandidates(candidates);
  let reply: string;
  try { reply = await opts.ai.call(aiSystemPrompt(!!opts.youth), aiUserMessage(question, a.filters, cands)); } catch { return a; }
  const pick = parseAiReply(reply, cands);
  if (!pick) return a;
  let pool = candidates;
  let filters = a.filters;
  if (index && parsed && sOpts && Object.keys(pick.filters).length) {
    const merged = mergeFilters(a.filters, pick.filters);
    const again = search(index, parsed.text, merged, sOpts);
    if (again.total) { pool = again.hits.map((h) => h.entry); filters = merged; }
  }
  const byId = new Map(pool.map((e) => [e.id, e]));
  const first = pick.ids.map((id) => byId.get(id)).filter((e): e is LibraryExercise => !!e);
  const rest = pool.filter((e) => !first.includes(e));
  const results = [...first, ...rest].slice(0, limit);
  return { ...a, results, filters, total: Math.max(a.total, pool.length), ai: { used: true, why: pick.why } };
}
