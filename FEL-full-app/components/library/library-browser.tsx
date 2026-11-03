'use client';
// LibraryBrowser — EXERCISE-LIBRARY (2026-10-25): search and ask the shared exercise library.
//
// Owner (2026-10-25): "Make sure people can search for what they need, ask ai." One component for every door in:
//   · coaches on the /coach Exercises tab and inside the program builder ("Use in program"), with "Add to my
//     catalogue" and an opt-in to see drafts, labelled as drafts;
//   · athletes on /train/library, approved entries only.
// Two ways to look: SEARCH (typo-tolerant, synonyms, facets with counts, did-you-mean, relax-one-filter) and ASK (a
// plain-words question → the filters it read, shown as chips you can remove; a pain or injury question shows FEL's
// existing "see a professional" lines and general prehab only). The server does both (/api/library/search, /ask);
// this file only draws them. Batches 2–4 (5,000+ entries): a search hit is a BASE exercise; its matching variants
// ("Paused …", "… on the Move") fold under it as "+N variants", opened on demand, so one exercise never fills a page.
//
// PLAT-P08 (2026-11-02): search ON THE DEVICE as you type (use-device-library.ts: the viewer's slice of the library, indexed
// once; the server answers until it is in), one row of quick chips (goal, equipment, body area, sport — the facets the
// entries already carry, no new field), the results as a two-column grid of tiles, relevance first and then MOVING DEMOS
// first (lib/library/search/engine.ts demosFirst), and the one exercise sheet (components/library/exercise-sheet.tsx: the
// demo playing, the muscles, three cues, Try it).
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, MessageCircleQuestion, Play, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { DemoTab } from '@/components/library/library-demo';
import { ExerciseSheet } from '@/components/library/exercise-sheet';
import { LIB_LOOK as LL } from '@/components/library/look';
import type { LibraryCard } from '@/lib/library/server';
import { useDeviceLibrary } from './use-device-library';
import type { AskChip } from '@/lib/library/ask/parse';

type FacetKey = 'pattern' | 'equipment' | 'muscle' | 'level' | 'sport' | 'layer' | 'category' | 'goal';
interface FacetValue { value: string; label: string; count: number }
type Filters = Partial<Record<FacetKey | 'lowLoad' | 'notCategory' | 'notEquipment', string[]>> & { only?: boolean };

interface SearchPayload {
  /** total = matching entries; groups = matching base exercises (a base and its variants count once; paging walks these). */
  total: number; groups?: number; hits: LibraryCard[]; facets: Record<FacetKey, FacetValue[]>; didYouMean: string | null; corrected: Record<string, string>;
  fallback: 'none' | 'any-term'; relaxations: { filter: string; count: number }[]; tookMs: number;
  viewer: { coach: boolean; admin: boolean; drafts: boolean; youth: boolean };
  library: { total: number; approved: number; drafts: number; ready: boolean };
}
interface AskPayload {
  question: string; chips: AskChip[]; filters: Filters & { equipmentOnly?: boolean }; text: string; intent: string;
  results: LibraryCard[]; total: number; plan: { slot: string; minutes: number; entry: LibraryCard }[] | null;
  anchor: { id: string; name: string } | null; safety: string[] | null; relaxed: string[]; ai: { used: boolean; why: string | null }; didYouMean: string | null;
}

const FACET_TITLES: Record<FacetKey, string> = {
  category: 'Type', pattern: 'Pattern', equipment: 'Equipment', muscle: 'Muscle', level: 'Level', goal: 'Goal', sport: 'Sport', layer: 'Skill layer',
};
const FACET_ORDER: FacetKey[] = ['category', 'pattern', 'equipment', 'level', 'goal', 'muscle', 'sport', 'layer'];
/** PLAT-P08: the quick chips — the top values of four facets the entries already carry (goal, equipment, body area, sport). (new) */
const QUICK: { key: FacetKey; n: number }[] = [{ key: 'goal', n: 3 }, { key: 'equipment', n: 3 }, { key: 'muscle', n: 3 }, { key: 'sport', n: 2 }];
const ASK_EXAMPLES = ['knee-friendly vertical jump work with no equipment', 'something easier than a pistol squat', 'warm-up for basketball, 10 minutes'];

/** Keystroke → request, while the library is not yet on the device (PLAT-P08: was 180); on the device there is none. */
export const SEARCH_DEBOUNCE_MS = 120;

function toParams(q: string, f: Filters, drafts: boolean, offset = 0): string {
  const p = new URLSearchParams();
  if (q.trim()) p.set('q', q.trim());
  for (const [k, v] of Object.entries(f)) if (Array.isArray(v) && v.length) p.set(k, v.join(','));
  if (f.only) p.set('only', '1');
  if (drafts) p.set('drafts', '1');
  if (offset) p.set('offset', String(offset));
  return p.toString();
}

/** An Ask answer's filters as the search screen's filters (so a removed chip re-runs as a normal search). */
function askFiltersToFilters(a: AskPayload['filters']): Filters {
  const f: Filters = {};
  for (const k of [...FACET_ORDER, 'lowLoad', 'notCategory', 'notEquipment'] as const) {
    const v = (a as Record<string, unknown>)[k];
    if (Array.isArray(v) && v.length) f[k] = v as string[];
  }
  if (a.equipmentOnly) f.only = true;
  return f;
}

export function LibraryBrowser({ onUse, onAdded, canAdd = false, title }: {
  /** "Use in program": the builder passes this; it receives the entry the coach picked. */
  onUse?: (entry: LibraryCard) => Promise<void> | void;
  /** After "Add to my catalogue" succeeds (the catalogue tab reloads its list). */
  onAdded?: () => void;
  /** Show "Add to my catalogue" (coaches). */
  canAdd?: boolean;
  title?: ReactNode;
}) {
  const [mode, setMode] = useState<'search' | 'ask'>('search');
  const [q, setQ] = useState('');
  const [question, setQuestion] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [drafts, setDrafts] = useState(false);
  const [served, setData] = useState<SearchPayload | null>(null);
  const [ask, setAsk] = useState<AskPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<LibraryCard | null>(null);
  const [sheetTab, setSheetTab] = useState<DemoTab | undefined>(undefined);   // LIBRARY-ANATOMY: the card's quick links open the sheet on a tab
  const [more, setMore] = useState<LibraryCard[]>([]);
  const seq = useRef(0);

  const runSearch = useCallback(async (query: string, f: Filters, d: boolean) => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await fetch(`/api/library/search?${toParams(query, f, d)}`);
      const j = r.ok ? await r.json() as SearchPayload : null;
      if (n === seq.current) { setData(j); setMore([]); }
    } catch { if (n === seq.current) setData(null); }
    finally { if (n === seq.current) setLoading(false); }
  }, []);

  // PLAT-P08: search as you type ON THE DEVICE (use-device-library.ts): every keystroke, no round trip. The deferred
  // values let the box take the letter first and the results follow in the same frame or the next.
  const device = useDeviceLibrary(drafts);
  const dq = useDeferredValue(q);
  const df = useDeferredValue(filters);
  const local = useMemo(() => (mode === 'search' && device ? device(new URLSearchParams(toParams(dq, df, drafts))) as unknown as SearchPayload : null), [device, dq, df, drafts, mode]);
  const data = local ?? served;
  useEffect(() => { if (device) { seq.current++; setMore([]); setLoading(false); } }, [device, dq, df, drafts]);

  // …and until the library is on the device, the server answers (debounced); the Ask view keeps its own answer until a
  // chip is removed
  useEffect(() => {
    if (mode !== 'search' || device) return;
    const t = setTimeout(() => { void runSearch(q, filters, drafts); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, filters, drafts, mode, runSearch, device]);

  const runAsk = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const r = await fetch('/api/library/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: text, drafts }) });
      if (r.status === 429) { toast.error('That is a lot of questions in a minute. Try again shortly.'); return; }
      const j = r.ok ? await r.json() as AskPayload : null;
      setAsk(j);
    } catch { setAsk(null); }
    finally { setLoading(false); }
  };

  /** Remove one chip from an Ask answer: the rest become a normal search the person can keep editing. */
  const dropChip = (chip: AskChip) => {
    if (!ask) return;
    const f = askFiltersToFilters(ask.filters);
    if (chip.key === 'text') { setQ(''); }
    else if (chip.key === 'equipmentOnly') { delete f.only; delete f.equipment; }
    else if (chip.key in f) { const k = chip.key as keyof Filters; const list = (f[k] as string[] | undefined)?.filter((v) => v !== chip.value); if (list?.length) (f as Record<string, string[]>)[k] = list; else delete f[k]; }
    setFilters(f);
    if (chip.key !== 'text') setQ(ask.text);
    setMode('search');
    setAsk(null);
  };

  const toggle = (k: FacetKey, v: string) => setFilters((f) => {
    const cur = f[k] ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    const out = { ...f, [k]: next };
    if (!next.length) delete out[k];
    return out;
  });

  const loadMore = async () => {
    if (!data) return;
    if (local && device) { const j = device(new URLSearchParams(toParams(dq, df, drafts, data.hits.length + more.length))) as unknown as SearchPayload; setMore((m) => [...m, ...j.hits]); return; }
    const r = await fetch(`/api/library/search?${toParams(q, filters, drafts, data.hits.length + more.length)}`);
    const j = r.ok ? await r.json() as SearchPayload : null;
    if (j) setMore((m) => [...m, ...j.hits]);
  };

  const active = useMemo(() => Object.entries(filters).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => ({ k, v: x })) : [])), [filters]);
  const labelFor = (k: string, v: string) => data?.facets[k as FacetKey]?.find((x) => x.value === v)?.label ?? v.replace(/-/g, ' ');
  const results = mode === 'ask' && ask ? ask.results : [...(data?.hits ?? []), ...more];

  return (
    <div className="space-y-3" data-testid="library-browser">
      {title}
      {/* search ↔ ask */}
      {/* PLAT-P08: the toggle, Filters and Show more wear the chip look (one look for every small control on this screen) */}
      <div className="flex gap-2" role="tablist" aria-label="Search or ask">
        {([['search', 'Search', Search], ['ask', 'Ask', MessageCircleQuestion]] as const).map(([k, label, Icon]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
            className={`${LL.chip} flex-1 justify-center gap-1.5 ${mode === k ? LL.chipOn : ''}`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {mode === 'search' ? (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Squat, RDL, pogo, ankle…" aria-label="Search the exercise library" enterKeyHint="search"
            className={LL.search} />
          {loading && <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/40" />}
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void runAsk(question); }} className="space-y-2">
          <div className="flex gap-2">
            <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder="Ask in plain words…" aria-label="Ask the exercise library"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#16161a] px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-[#00E5FF]/40 focus:outline-none" />
            <button type="submit" disabled={loading || !question.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-3 text-xs font-medium text-[#00E5FF] disabled:opacity-40">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Ask
            </button>
          </div>
          {!ask && (
            <div className="flex flex-wrap gap-1.5">
              {ASK_EXAMPLES.map((x) => (
                <button key={x} type="button" onClick={() => { setQuestion(x); void runAsk(x); }} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/55 hover:border-[#00E5FF]/30 hover:text-white/80">{x}</button>
              ))}
            </div>
          )}
        </form>
      )}

      {/* what the library holds for this viewer, and the drafts opt-in */}
      {data && data.viewer.coach && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/40">
          <span data-testid="library-counts">{data.library.approved.toLocaleString()} approved{data.viewer.coach ? ` · ${data.library.drafts.toLocaleString()} drafts waiting for review` : ''}</span>
          <span className="flex items-center gap-3">
            {data.viewer.coach && (
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={drafts} onChange={(e) => setDrafts(e.target.checked)} className="accent-[#FFD700]" /> Show drafts
              </label>
            )}
            {data.viewer.admin && <Link href="/coach/admin/library" className="text-[#FFD700]/80 underline-offset-2 hover:underline">Review drafts</Link>}
          </span>
        </div>
      )}

      {/* ASK: the chips it read, the safety lines, the why-line */}
      {mode === 'ask' && ask && (
        <div className="space-y-2" data-testid="ask-answer">
          {ask.safety && (
            <div className="space-y-1 rounded-xl border border-[#FFD700]/30 bg-[#FFD700]/[0.06] p-3 text-xs text-white/80" role="note" data-testid="ask-safety">
              <AlertTriangle className="h-4 w-4 text-[#FFD700]" aria-hidden="true" />
              {ask.safety.map((s) => <p key={s}>{s}</p>)}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5" data-testid="ask-chips">
            <span className="text-[11px] text-white/40">Read as:</span>
            {ask.chips.map((c) => (
              <button key={`${c.key}:${c.value}`} onClick={() => dropChip(c)} aria-label={`Remove ${c.label}`}
                className="inline-flex items-center gap-1 rounded-full border border-[#00E5FF]/30 bg-[#00E5FF]/[0.07] px-2 py-0.5 text-[11px] text-[#00E5FF]/90 hover:border-[#FF3366]/50">
                {c.label}<X className="h-3 w-3" />
              </button>
            ))}
            {!ask.chips.length && <span className="text-[11px] text-white/40">nothing specific — showing the closest matches</span>}
          </div>
          {ask.anchor && <p className="text-[11px] text-white/50">Compared with <button className="text-white/80 underline-offset-2 hover:underline" onClick={() => void openById(ask.anchor!.id, setSelected)}>{ask.anchor.name}</button>.</p>}
          {ask.relaxed.length > 0 && <p className="text-[11px] text-[#FFD700]/80">Nothing matched everything, so this leaves out: {ask.relaxed.join(', ')}.</p>}
          {ask.ai.used && ask.ai.why && <p className="text-[11px] text-white/55"><Sparkles className="mr-1 inline h-3 w-3 text-[#A855F7]" />{ask.ai.why}</p>}
          {ask.plan && (
            <ol className="space-y-1.5" data-testid="ask-plan">
              {ask.plan.map((p, i) => (
                <li key={p.entry.id}>
                  <button onClick={() => setSelected(p.entry)} className="fel-card flex w-full items-center justify-between gap-2 rounded-xl p-2.5 text-left">
                    <span className="min-w-0">
                      <span className="block text-[10px] uppercase tracking-wider text-white/35">{i + 1}. {p.slot}</span>
                      <span className="block truncate text-sm text-white">{p.entry.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-[#00E5FF]/80">{p.minutes} min</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* SEARCH: active filters, the facet panel */}
      {mode === 'search' && (
        <>
          {/* PLAT-P08: one row of quick chips — goal, equipment, body area, sport (the facets' top values for this search) */}
          {data && (
            <div className={LL.chips} data-testid="library-quick-chips" aria-label="Quick filters">
              {QUICK.flatMap(({ key, n }) => (data.facets[key] ?? []).slice(0, n).map((v) => ({ key, v })))
                .concat(active.filter(({ k, v }) => QUICK.some((x) => x.key === k) && !QUICK.some(({ key, n }) => key === k && (data.facets[key] ?? []).slice(0, n).some((f) => f.value === v))).map(({ k, v }) => ({ key: k as FacetKey, v: { value: v, label: labelFor(k, v), count: 0 } })))
                .map(({ key, v }) => {
                  const on = (filters[key] ?? []).includes(v.value);
                  return <button key={`${key}:${v.value}`} type="button" onClick={() => toggle(key, v.value)} aria-pressed={on} className={`${LL.chip} ${on ? LL.chipOn : ''}`}>{v.label}</button>;
                })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}
              className={`${LL.chip} gap-1.5 ${showFilters || active.length ? LL.chipOn : ''}`}>
              <SlidersHorizontal className="h-3.5 w-3.5" /> Filters{active.length ? ` (${active.length})` : ''}
            </button>
            {filters.only && <Chip label="Only my equipment" onClear={() => setFilters((f) => { const o = { ...f }; delete o.only; return o; })} />}
            {active.filter(({ k }) => !QUICK.some((x) => x.key === k)).map(({ k, v }) => <Chip key={`${k}:${v}`} label={k === 'lowLoad' ? `Easy on the ${v}` : k === 'notCategory' ? `No ${v}` : k === 'notEquipment' ? `No ${v}` : labelFor(k, v)} onClear={() => setFilters((f) => { const list = (f[k as FacetKey] ?? []).filter((x) => x !== v); const o = { ...f, [k]: list }; if (!list.length) delete (o as Record<string, unknown>)[k]; return o; })} />)}
            {active.length > 0 && <button onClick={() => setFilters({})} className="text-[11px] text-white/40 hover:text-white/70">Clear all</button>}
          </div>
          {showFilters && data && (
            <div className="fel-card grid max-h-[50vh] grid-cols-1 gap-3 overflow-y-auto rounded-xl p-3 sm:grid-cols-2" data-testid="library-facets">
              {FACET_ORDER.map((k) => data.facets[k]?.length ? (
                <div key={k} className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">{FACET_TITLES[k]}</div>
                  <div className="flex flex-wrap gap-1">
                    {data.facets[k].slice(0, 14).map((v) => {
                      const on = (filters[k] ?? []).includes(v.value);
                      return (
                        <button key={v.value} onClick={() => toggle(k, v.value)} aria-pressed={on}
                          className={`rounded-md border px-1.5 py-0.5 text-[11px] ${on ? 'border-[#00E5FF]/40 bg-[#00E5FF]/15 text-[#00E5FF]' : 'border-white/8 text-white/60 hover:text-white/85'}`}>
                          {v.label} <span className="text-white/35">{v.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null)}
            </div>
          )}
          {data && (data.didYouMean || data.fallback === 'any-term' || (data.total === 0 && data.relaxations.length > 0)) && (
            <div className="space-y-1 text-[11px] text-white/55" data-testid="library-recovery">
              {data.didYouMean && <p>Showing results for <button className="text-[#00E5FF] underline-offset-2 hover:underline" onClick={() => setQ(data.didYouMean!)}>{data.didYouMean}</button>.</p>}
              {data.fallback === 'any-term' && <p>Nothing matched every word, so these match some of them.</p>}
              {data.total === 0 && data.relaxations.map((r) => (
                <button key={r.filter} onClick={() => setFilters((f) => { const o = { ...f }; delete (o as Record<string, unknown>)[r.filter]; if (r.filter === 'equipment') delete o.only; return o; })}
                  className="mr-1.5 rounded-lg border border-white/10 px-2 py-0.5 text-white/70 hover:border-[#00E5FF]/30">
                  Drop the {FACET_TITLES[r.filter as FacetKey]?.toLowerCase() ?? r.filter} filter: {r.count} results
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* results */}
      <div className={LL.grid} data-testid="library-results" data-results-for={(data as { query?: string } | null)?.query ?? ''} data-results-from={local ? 'device' : 'server'}>
        {results.map((e) => <ResultTile key={e.id} e={e} onOpen={() => { setSheetTab(undefined); setSelected(e); }} />)}
        {!loading && results.length === 0 && (mode === 'search' ? data : ask) && (
          <div className="col-span-2 py-8 text-center text-sm text-white/35">
            {mode === 'search' && data && data.library.approved === 0 && !drafts
              ? (data.viewer.coach ? 'Nothing is approved yet. Turn on "Show drafts" to browse the drafts.' : 'The library opens as the owner approves it. Check back soon.')
              : 'Nothing matches. Try fewer words or another filter.'}
          </div>
        )}
        {mode === 'search' && data && (data.groups ?? data.total) > results.length && (
          <button onClick={() => void loadMore()} className={`${LL.chip} col-span-2 w-full justify-center`}>Show more ({((data.groups ?? data.total) - results.length).toLocaleString()} more)</button>
        )}
      </div>

      {selected && <ExerciseSheet e={selected} tab={sheetTab} onClose={() => { setSelected(null); setSheetTab(undefined); }} onUse={onUse} canAdd={canAdd} onAdded={onAdded} onOpen={(id) => void openById(id, setSelected)} />}
    </div>
  );
}

async function openById(id: string, set: (e: LibraryCard) => void) {
  const r = await fetch(`/api/library/${encodeURIComponent(id)}`);
  if (!r.ok) { toast.error('That entry is not available.'); return; }
  const j = await r.json() as { entry: LibraryCard };
  set(j.entry);
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button onClick={onClear} aria-label={`Remove ${label}`} className="inline-flex items-center gap-1 rounded-full border border-[#00E5FF]/30 bg-[#00E5FF]/[0.07] px-2 py-0.5 text-[11px] text-[#00E5FF]/90">
      {label}<X className="h-3 w-3" />
    </button>
  );
}

/**
 * PLAT-P08: one result tile — the name, the level and the kit, and whether its demo MOVES (a faithful loop). A tile never
 * says "Demo coming": an entry without a loop opens on its cue card in the sheet. "+N" counts the variants grouped under it.
 */
function ResultTile({ e, onOpen }: { e: LibraryCard; onOpen: () => void }) {
  const variants = e.variants ?? [];
  return (
    <button type="button" onClick={onOpen} className={LL.tile} data-testid="library-card" data-moves={e.avatarClip ? '1' : '0'}>
      <span className={LL.tileName}>{e.name}</span>
      <span className="flex flex-col gap-1">
        {e.avatarClip ? <span className={LL.moves} data-tile-moves><Play aria-hidden className="h-3 w-3" />Demo</span> : null}
        <span className={LL.tileMeta}>
          {e.level}{e.review.status === 'draft' ? ' · draft' : ''}{variants.length ? ` · +${variants.length}` : ''}
        </span>
      </span>
    </button>
  );
}
