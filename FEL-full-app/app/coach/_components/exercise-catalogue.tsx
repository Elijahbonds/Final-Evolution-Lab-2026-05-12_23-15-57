'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Loader2, Search, ChevronRight, Play, Dumbbell, Target, Zap, X, Check, Plus } from 'lucide-react';
import { ExerciseDemo } from '@/components/coach/exercise-demo';
import { CATALOGUE_ERROR_COPY, PATTERN_INFO, nameKey } from '@/lib/coach/catalogue';
import type { BraceMode, MovementPattern } from '@/public/_prisma/client';
import { MyCatalogue, TagRow } from './my-catalogue';

interface Category { id: string; name: string }
interface Exercise {
  id: string; name: string; slug: string; categoryId: string; phase: number; chapter: number;
  bounceLevel: string; coachingCues: string; commonMistakes: string; progressions: string;
  regressions: string; prerequisites: string; targetPrqStat: string; dosage: string;
  videoUrl: string; thumbnailUrl: string; sortOrder: number;
  category?: { id: string; name: string };
  /** MIRROR-COACH P2: FEL's tags for this KB item (lib/coach/kbTags.ts), added by GET /api/coach/catalogue. */
  tags?: { pattern: MovementPattern | null; braceMode: BraceMode | null; skillLayer: string | null; prescribable: boolean; why: string; copyName?: string };
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
  const [view, setView] = useState<'kb' | 'mine'>('kb');
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

  const switcher = coach && (
    <div className="flex gap-1 rounded-xl bg-[#0f0f13] p-1 mb-3 border border-white/6" role="tablist" aria-label="Exercise library">
      {([['kb', 'Knowledge base'], ['mine', `My catalogue${mineCount !== null ? ` (${mineCount})` : ''}`]] as const).map(([k, label]) => (
        <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
          className={`flex-1 rounded-lg py-2 text-xs font-medium ${view === k ? 'bg-[#00E5FF]/15 text-[#00E5FF]' : 'text-white/40 hover:text-white/70'}`}>{label}</button>
      ))}
    </div>
  );

  if (coach && view === 'mine') {
    return <div>{switcher}<MyCatalogue refreshKey={refreshMine} onChange={takeMine} onBrowseKb={() => setView('kb')} /></div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[#00E5FF]" />
      </div>
    );
  }

  return (
    <div>
      {switcher}
      {/* Search and filters */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises..."
            className="w-full rounded-xl bg-[#16161a] border border-white/10 pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00E5FF]/40 transition-colors"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterPhase(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!filterPhase ? 'bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30' : 'bg-[#16161a] text-white/40 border border-white/6 hover:text-white/60'}`}
          >
            All Phases
          </button>
          {[1, 2, 3, 4, 5].map((p) => (
            <button
              key={p}
              onClick={() => setFilterPhase(filterPhase === p ? null : p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterPhase === p ? 'bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30' : 'bg-[#16161a] text-white/40 border border-white/6 hover:text-white/60'}`}
            >
              P{p}
            </button>
          ))}
        </div>
        {categories.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterCat(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!filterCat ? 'bg-[#A855F7]/15 text-[#A855F7] border border-[#A855F7]/30' : 'bg-[#16161a] text-white/40 border border-white/6 hover:text-white/60'}`}
            >
              All Categories
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilterCat(filterCat === c.id ? null : c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterCat === c.id ? 'bg-[#A855F7]/15 text-[#A855F7] border border-[#A855F7]/30' : 'bg-[#16161a] text-white/40 border border-white/6 hover:text-white/60'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-white/30 mb-3">{filtered.length} exercise{filtered.length !== 1 ? 's' : ''}</p>

      {/* Exercise list grouped by phase */}
      <div className="space-y-4">
        {grouped.map(([phase, exs]) => (
          <div key={phase}>
            <h4 className="fel-heading text-sm text-[#00E5FF]/70 mb-2">
              Phase {phase}: {PHASE_LABELS[phase] ?? ''}
            </h4>
            <div className="space-y-2">
              {exs.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => setSelected(ex)}
                  className="w-full text-left fel-card rounded-xl p-3 hover:border-[#00E5FF]/20 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Dumbbell className="h-4 w-4 text-[#00E5FF] flex-shrink-0" />
                        <span className="text-sm font-medium text-white truncate">{ex.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ color: LEVEL_COLORS[ex.bounceLevel] || '#999', borderColor: (LEVEL_COLORS[ex.bounceLevel] || '#999') + '40' }}>
                          {ex.bounceLevel}
                        </span>
                        {ex.category?.name && (
                          <span className="text-[10px] text-white/30">{ex.category.name}</span>
                        )}
                        {ex.targetPrqStat && (
                          <span className="text-[10px] text-[#A855F7]/70 flex items-center gap-0.5">
                            <Target className="h-3 w-3" />{ex.targetPrqStat}
                          </span>
                        )}
                        {ex.tags?.pattern && <span className="text-[10px] text-[#00E5FF]/60">{PATTERN_INFO[ex.tags.pattern].label}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {coach && mineKeys.has(nameKey(copyNameOf(ex))) && <Check className="h-4 w-4 text-[#7BD389]" aria-label="in your catalogue" />}
                      {ex.videoUrl && <Play className="h-4 w-4 text-[#FF3366]/60" />}
                      <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/40 transition-colors" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-white/30 text-sm">
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
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors">
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-4 pr-8">
          <h3 className="fel-heading text-lg text-white mb-1">{ex.name}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: LEVEL_COLORS[ex.bounceLevel] || '#999', borderColor: (LEVEL_COLORS[ex.bounceLevel] || '#999') + '40' }}>
              {ex.bounceLevel}
            </span>
            <span className="text-xs text-white/30">
              Phase {ex.phase} · Ch{ex.chapter}
            </span>
            {ex.category?.name && (
              <span className="text-xs text-[#A855F7]/60">{ex.category.name}</span>
            )}
          </div>
          {ex.tags && (
            <div className="mt-2 space-y-1">
              <TagRow pattern={ex.tags.pattern} braceMode={ex.tags.braceMode} layer={ex.tags.skillLayer} />
              <p className="text-[11px] text-white/35">Why these tags: {ex.tags.why}</p>
            </div>
          )}
          {catalogue && (
            <div className="mt-3">
              {catalogue.inMine ? (
                <button onClick={catalogue.open} className="inline-flex items-center gap-1.5 rounded-lg border border-[#7BD389]/40 px-3 py-1.5 text-xs text-[#7BD389]"><Check className="h-3.5 w-3.5" /> In your catalogue · open it</button>
              ) : ex.tags && !ex.tags.prescribable ? (
                <p className="text-xs text-white/40">{CATALOGUE_ERROR_COPY.not_prescribable}</p>
              ) : (
                <button disabled={adding} onClick={async () => { setAdding(true); try { await catalogue.add(); } finally { setAdding(false); } }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-3 py-1.5 text-xs text-[#00E5FF] disabled:opacity-50">
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add to my catalogue
                </button>
              )}
            </div>
          )}
        </div>

        {/* Demo — YOUR AVATAR / COACH VIDEO tabs (never blank) */}
        <div className="mb-4">
          <ExerciseDemo
            exercise={{
              name: ex.name,
              videoUrl: ex.videoUrl,
              targetPrqStat: ex.targetPrqStat,
              dosage: ex.dosage,
            }}
          />
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
          <p className="text-xs text-white/30 text-center">
            Switch to the Coach tab to ask Elijah about this exercise
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 flex-shrink-0" style={{ color }} />
      <span className="text-xs text-white/40">{label}:</span>
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

