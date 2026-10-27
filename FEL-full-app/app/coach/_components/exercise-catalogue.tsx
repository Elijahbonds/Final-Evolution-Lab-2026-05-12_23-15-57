'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Loader2, Search, ChevronRight, Play, Dumbbell, Target, Zap, X, Check, Plus } from 'lucide-react';
// LIBRARY-ANATOMY-2 (owner, 2026-10-25): the KB detail shows the library's stage (the athlete's avatar, demoFor's loop) where
// the library has the exercise by name, and its cue card otherwise — not the old one-clip avatar (exercise-demo.tsx), which
// played the same baked clip for every exercise
import { LibraryDemo, videoSource } from '@/components/library/library-demo';
import type { LibraryCard } from '@/lib/library/server';
import { CATALOGUE_ERROR_COPY, PATTERN_INFO, nameKey } from '@/lib/coach/catalogue';
import type { BraceMode, MovementPattern } from '@/public/_prisma/client';
import { MyCatalogue, TagRow } from './my-catalogue';
// EXERCISE-LIBRARY (2026-10-25): the shared library, first on the tab for everyone
import { LibraryBrowser } from '@/components/library/library-browser';

interface Category { id: string; name: string }
interface Exercise {
  id: string; name: string; slug: string; categoryId: string; phase: number; chapter: number;
  bounceLevel: string; coachingCues: string; commonMistakes: string; progressions: string;
  regressions: string; prerequisites: string; targetPrqStat: string; dosage: string;
  videoUrl: string; thumbnailUrl: string; sortOrder: number;
  category?: { id: string; name: string };
  /** MIRROR-COACH P2: FEL's tags for this KB item (lib/coach/kbTags.ts), added by GET /api/coach/catalogue. */
  tags?: { pattern: MovementPattern | null; braceMode: BraceMode | null; skillLayer: string | null; prescribable: boolean; why: string; copyName?: string };
  /** LIBRARY-ANATOMY-2: the library entry this is, by name (GET /api/coach/catalogue, lib/library/match.ts), or null */
  library?: LibraryCard | null;
}

/**
 * The name this KB item takes in a coach's catalogue: FEL's name where the KB uses another method's label (owner
 * decision #8, MIRROR-COACH P2 review, 2026-09-26: "Hip CARs (90/90)" is copied as "Hip Circles (90/90)"), else its own.
 */
const copyNameOf = (ex: Exercise): string => ex.tags?.copyName ?? ex.name;

const PHASE_LABELS: Record<number, string> = {
  1: 'System Scan', 2: 'Hardware Calibration', 3: 'Physics of Flight',
  4: 'Basketball Application', 5: 'System Integration',
};
const LEVEL_COLORS: Record<string, string> = {
  foundation: '#00FF9D', intermediate: '#00E5FF', advanced: '#A855F7', elite: '#FFD700',
};

/**
 * The Exercises tab. Everyone gets the Blueprint knowledge base (read-only). A coach (certified, or coaching a program —
 * the same test coach-view uses for the Clients tab) also gets "My catalogue", the prescribable library the builder
 * draws from, and an "Add to my catalogue" button on every KB exercise (MIRROR-COACH P2, 2026-09-25: before this the
 * two libraries had no path between them, and the catalogue could not be filled from any served page at all).
 */
export function ExerciseCatalogue({ coach = false }: { coach?: boolean }) {
  const [view, setView] = useState<'library' | 'kb' | 'mine'>('library');
  const [mineKeys, setMineKeys] = useState<Set<string>>(new Set());   // names already in my catalogue, as nameKey()
  const [mineCount, setMineCount] = useState<number | null>(null);
  const [refreshMine, setRefreshMine] = useState(0);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPhase, setFilterPhase] = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [selected, setSelected] = useState<Exercise | null>(null);

  useEffect(() => {
    fetch('/api/coach/catalogue')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setExercises(d.exercises ?? []);
          setCategories(d.categories ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const takeMine = useCallback((rows: readonly { name: string }[]) => {
    setMineKeys(new Set(rows.map((x) => nameKey(x.name)))); setMineCount(rows.length);
  }, []);
  const loadMine = useCallback(() => {
    if (!coach) return;
    fetch('/api/coach/programs/exercises').then((r) => (r.ok ? r.json() : [])).then((j) => takeMine(Array.isArray(j) ? j : [])).catch(() => {});
  }, [coach, takeMine]);
  useEffect(() => { loadMine(); }, [loadMine]);

  const addToMine = async (ex: Exercise) => {
    const r = await fetch('/api/coach/programs/exercises/from-kb', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kbExerciseId: ex.id }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(CATALOGUE_ERROR_COPY[j.error as keyof typeof CATALOGUE_ERROR_COPY] ?? 'Could not add that. Try again.'); return; }
    const as = copyNameOf(ex);
    toast.success(j.already ? `${as} is already in your catalogue` : as === ex.name ? `${ex.name} added to your catalogue` : `${ex.name} added to your catalogue as ${as}`);
    loadMine(); setRefreshMine((n) => n + 1);
  };

  const filtered = useMemo(() => {
    return exercises.filter((e) => {
      if (filterPhase && e.phase !== filterPhase) return false;
      if (filterCat && e.categoryId !== filterCat) return false;
      if (search) {
        const q = search.toLowerCase();
        return e.name.toLowerCase().includes(q) || e.coachingCues?.toLowerCase().includes(q) || e.category?.name?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [exercises, filterPhase, filterCat, search]);

  const grouped = useMemo(() => {
    const map = new Map<number, Exercise[]>();
    for (const e of filtered) {
      const arr = map.get(e.phase) || [];
      arr.push(e);
      map.set(e.phase, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const views = [['library', 'Library'], ['kb', 'Knowledge base'], ...(coach ? [['mine', `My catalogue${mineCount !== null ? ` (${mineCount})` : ''}`]] : [])] as const;
  const switcher = (
    <div className="flex gap-1 rounded-xl bg-[#0f0f13] p-1 mb-3 border border-white/6" role="tablist" aria-label="Exercise library">
      {(views as readonly (readonly [string, string])[]).map(([k, label]) => (
        <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k as 'library' | 'kb' | 'mine')}
          className={`flex-1 rounded-lg py-2 text-xs font-medium ${view === k ? 'bg-fel-cyan/15 text-fel-cyan' : 'text-fel-dim hover:text-white/70'}`}>{label}</button>
      ))}
    </div>
  );

  if (view === 'library') {
    return <div>{switcher}<LibraryBrowser canAdd={coach} onAdded={() => { loadMine(); setRefreshMine((n) => n + 1); }} /></div>;
  }

  if (coach && view === 'mine') {
    return <div>{switcher}<MyCatalogue refreshKey={refreshMine} onChange={takeMine} onBrowseKb={() => setView('kb')} /></div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-fel-cyan" />
      </div>
    );
  }

  return (
    <div>
      {switcher}
      {/* Search and filters */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fel-quiet" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises..."
            className="w-full rounded-xl bg-[#16161a] border border-white/10 pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-fel-cyan/40 transition-colors"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterPhase(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!filterPhase ? 'bg-fel-cyan/15 text-fel-cyan border border-fel-cyan/30' : 'bg-[#16161a] text-fel-dim border border-white/6 hover:text-white/60'}`}
          >
            All Phases
          </button>
          {[1, 2, 3, 4, 5].map((p) => (
            <button
              key={p}
              onClick={() => setFilterPhase(filterPhase === p ? null : p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterPhase === p ? 'bg-fel-cyan/15 text-fel-cyan border border-fel-cyan/30' : 'bg-[#16161a] text-fel-dim border border-white/6 hover:text-white/60'}`}
            >
              P{p}
            </button>
          ))}
        </div>
        {categories.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterCat(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!filterCat ? 'bg-fel-violet/15 text-fel-violet border border-fel-violet/30' : 'bg-[#16161a] text-fel-dim border border-white/6 hover:text-white/60'}`}
            >
              All Categories
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilterCat(filterCat === c.id ? null : c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterCat === c.id ? 'bg-fel-violet/15 text-fel-violet border border-fel-violet/30' : 'bg-[#16161a] text-fel-dim border border-white/6 hover:text-white/60'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-fel-quiet mb-3">{filtered.length} exercise{filtered.length !== 1 ? 's' : ''}</p>

      {/* Exercise list grouped by phase */}
      <div className="space-y-4">
        {grouped.map(([phase, exs]) => (
          <div key={phase}>
            <h4 className="fel-heading text-sm text-fel-cyan/70 mb-2">
              Phase {phase}: {PHASE_LABELS[phase] ?? ''}
            </h4>
            <div className="space-y-2">
              {exs.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => setSelected(ex)}
                  className="w-full text-left fel-card rounded-xl p-3 hover:border-fel-cyan/20 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Dumbbell className="h-4 w-4 text-fel-cyan flex-shrink-0" />
                        <span className="text-sm font-medium text-white truncate">{ex.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ color: LEVEL_COLORS[ex.bounceLevel] || '#999', borderColor: (LEVEL_COLORS[ex.bounceLevel] || '#999') + '40' }}>
                          {ex.bounceLevel}
                        </span>
                        {ex.category?.name && (
                          <span className="text-[10px] text-fel-quiet">{ex.category.name}</span>
                        )}
                        {ex.targetPrqStat && (
                          <span className="text-[10px] text-fel-violet/70 flex items-center gap-0.5">
                            <Target className="h-3 w-3" />{ex.targetPrqStat}
                          </span>
                        )}
                        {ex.tags?.pattern && <span className="text-[10px] text-fel-cyan/60">{PATTERN_INFO[ex.tags.pattern].label}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {coach && mineKeys.has(nameKey(copyNameOf(ex))) && <Check className="h-4 w-4 text-[#7BD389]" aria-label="in your catalogue" />}
                      {ex.videoUrl && <Play className="h-4 w-4 text-fel-crimson/60" />}
                      <ChevronRight className="h-4 w-4 text-fel-quiet group-hover:text-white/40 transition-colors" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-fel-quiet text-sm">
          No exercises found. Try adjusting your filters.
        </div>
      )}

      {/* Exercise detail modal */}
      {selected && (
        <ExerciseDetail
          exercise={selected}
          onClose={() => setSelected(null)}
          catalogue={coach ? { inMine: mineKeys.has(nameKey(copyNameOf(selected))), add: () => addToMine(selected), open: () => { setSelected(null); setView('mine'); } } : null}
        />
      )}
    </div>
  );
}

interface CatalogueHook { inMine: boolean; add: () => Promise<void>; open: () => void }

function ExerciseDetail({ exercise: ex, onClose, catalogue }: { exercise: Exercise; onClose: () => void; catalogue: CatalogueHook | null }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f0f13] border border-white/10 p-5">
        {/* Close button */}
        <button onClick={onClose} className="absolute top-4 right-4 text-fel-dim hover:text-white transition-colors">
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-4 pr-8">
          <h3 className="fel-heading text-lg text-white mb-1">{ex.name}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: LEVEL_COLORS[ex.bounceLevel] || '#999', borderColor: (LEVEL_COLORS[ex.bounceLevel] || '#999') + '40' }}>
              {ex.bounceLevel}
            </span>
            <span className="text-xs text-fel-quiet">
              Phase {ex.phase} · Ch{ex.chapter}
            </span>
            {ex.category?.name && (
              <span className="text-xs text-fel-violet/60">{ex.category.name}</span>
            )}
          </div>
          {ex.tags && (
            <div className="mt-2 space-y-1">
              <TagRow pattern={ex.tags.pattern} braceMode={ex.tags.braceMode} layer={ex.tags.skillLayer} />
              <p className="text-[11px] text-fel-quiet">Why these tags: {ex.tags.why}</p>
            </div>
          )}
          {catalogue && (
            <div className="mt-3">
              {catalogue.inMine ? (
                <button onClick={catalogue.open} className="inline-flex items-center gap-1.5 rounded-lg border border-[#7BD389]/40 px-3 py-1.5 text-xs text-[#7BD389]"><Check className="h-3.5 w-3.5" /> In your catalogue · open it</button>
              ) : ex.tags && !ex.tags.prescribable ? (
                <p className="text-xs text-fel-dim">{CATALOGUE_ERROR_COPY.not_prescribable}</p>
              ) : (
                <button disabled={adding} onClick={async () => { setAdding(true); try { await catalogue.add(); } finally { setAdding(false); } }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-fel-cyan/40 bg-fel-cyan/10 px-3 py-1.5 text-xs text-fel-cyan disabled:opacity-50">
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add to my catalogue
                </button>
              )}
            </div>
          )}
        </div>

        {/* Demo — the library's stage where the library has this exercise; else the cue card (never a wrong movement) */}
        <div className="mb-4">
          {ex.library
            ? <LibraryDemo entry={{ ...ex.library, demo: { ...ex.library.demo, videoUrl: ex.library.demo.videoUrl ?? (ex.videoUrl || null) } }} />
            : <KbCueCard ex={ex} />}
        </div>

        {/* Details */}
        <div className="space-y-3">
          {ex.targetPrqStat && (
            <DetailRow icon={Target} label="Target" value={ex.targetPrqStat} color="#A855F7" />
          )}
          {ex.dosage && (
            <DetailRow icon={Zap} label="Dosage" value={ex.dosage} color="#FFD700" />
          )}
          {ex.coachingCues && (
            <DetailSection label="Coaching Cues" content={ex.coachingCues} />
          )}
          {ex.commonMistakes && (
            <DetailSection label="Common Mistakes" content={ex.commonMistakes} />
          )}
          {ex.progressions && (
            <DetailSection label="Progressions" content={ex.progressions} />
          )}
          {ex.regressions && (
            <DetailSection label="Regressions" content={ex.regressions} />
          )}
          {ex.prerequisites && (
            <DetailSection label="Prerequisites" content={ex.prerequisites} />
          )}
        </div>

        {/* Ask Coach button */}
        <div className="mt-4 pt-4 border-t border-white/6">
          <p className="text-xs text-fel-quiet text-center">
            Switch to the Coach tab to ask Elijah about this exercise
          </p>
        </div>
      </div>
    </div>
  );
}

/** A KB exercise the library does not have: its first cues, and its coach video when it has one (no 3D: no wrong movement). */
function KbCueCard({ ex }: { ex: Exercise }) {
  const [on, setOn] = useState(false);
  const video = videoSource(ex.videoUrl);
  const cues = (ex.coachingCues ?? '').split(/(?<=[.!?])\s+/).map((c) => c.trim()).filter(Boolean).slice(0, 2);
  return (
    <div className="space-y-2" data-testid="kb-cue-card">
      <div className="flex items-center gap-3 rounded-xl bg-[#16161a] p-4">
        <Dumbbell className="h-8 w-8 shrink-0 text-white/30" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-[12px] text-white/55">No 3D demo for this one. Follow the cues:</p>
          <ul className="space-y-0.5 text-[13px] text-white/85">{cues.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      </div>
      {video && (on || video.kind === 'file' ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          {video.kind === 'youtube'
            ? <iframe src={video.src} className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen title={`${ex.name} video`} />
            : <video src={video.src} className="h-full w-full" controls playsInline preload="metadata" title={`${ex.name} video`} />}
        </div>
      ) : (
        <button onClick={() => setOn(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#FF3366]/40 px-3 py-1.5 text-xs text-[#FF3366]">
          <Play className="h-3.5 w-3.5" aria-hidden /> Play the coach video
        </button>
      ))}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 flex-shrink-0" style={{ color }} />
      <span className="text-xs text-fel-dim">{label}:</span>
      <span className="text-sm text-white/80">{value}</span>
    </div>
  );
}

function DetailSection({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <h5 className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-1">{label}</h5>
      <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}

