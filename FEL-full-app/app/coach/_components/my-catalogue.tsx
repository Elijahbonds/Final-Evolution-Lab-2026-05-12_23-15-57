'use client';
// My catalogue — the coach's prescribable exercise library, on the /coach Exercises tab (MIRROR-COACH P2, 2026-09-25).
//
// WHY IT EXISTS. The builder on the Clients tab prescribes only from this catalogue (ProgramExercise), and until this
// phase no page the app serves could add a row to it: the only form that could was ExerciseLibrary, mounted only in
// TrainingCoachDashboard, which no route renders (P1 baseline, lib/coach/loop-baseline.test.ts BASELINE 1). So a
// certified coach opened the builder to an empty dropdown, and the Mirror's screen prescriptions matched nothing. This
// is that form, mounted, with what the old one never had: edit, the three P2 tags (pattern, brace mode, skill layer
// from the owner's Playbook), set-up cues from FEL's pick-list, easier/harder links, and a way in from the knowledge
// base ("Add to my catalogue" on any KB exercise, one tab over). The rules are in lib/coach/catalogue.ts; this file
// only draws them.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { BookOpen, Loader2, Pencil, Play, Plus, Search, Trash2, X } from 'lucide-react';
import {
  BRACE_INFO, BRACE_MODES, CATALOGUE_CATEGORIES, CATALOGUE_ERROR_COPY, CATALOGUE_LIMITS, PATTERN_INFO, PATTERNS,
  type CommonFault,
} from '@/lib/coach/catalogue';
import { SKILL_LAYERS, setupCuesFor, skillLayer } from '@/lib/coach/taxonomy';
import type { BraceMode, MovementPattern } from '@/public/_prisma/client';

export interface CatalogueItem {
  id: string; name: string; category: string; demoVideoUrl: string | null; primaryCues: string[];
  commonFaults: CommonFault[] | null; equipment: string[]; defaultTempo: string;
  pattern: MovementPattern | null; braceMode: BraceMode | null; skillLayer: string | null;
  progressionOfId: string | null; regressionOfId: string | null;
}

interface Draft {
  name: string; category: string; pattern: string; braceMode: string; skillLayer: string;
  cues: string[]; faults: CommonFault[]; demoVideoUrl: string; equipment: string; defaultTempo: string;
  regressionOfId: string; progressionOfId: string;
}

const EMPTY: Draft = {
  name: '', category: 'general', pattern: '', braceMode: '', skillLayer: '', cues: ['', '', ''], faults: [{ fault: '', correctionCue: '' }],
  demoVideoUrl: '', equipment: '', defaultTempo: '3-1-1-0', regressionOfId: '', progressionOfId: '',
};

const toDraft = (it: CatalogueItem): Draft => ({
  name: it.name, category: it.category, pattern: it.pattern ?? '', braceMode: it.braceMode ?? '', skillLayer: it.skillLayer ?? '',
  cues: [...it.primaryCues, '', '', ''].slice(0, CATALOGUE_LIMITS.cues),
  faults: it.commonFaults?.length ? it.commonFaults.map((f) => ({ ...f })) : [{ fault: '', correctionCue: '' }],
  demoVideoUrl: it.demoVideoUrl ?? '', equipment: it.equipment.join(', '), defaultTempo: it.defaultTempo,
  regressionOfId: it.regressionOfId ?? '', progressionOfId: it.progressionOfId ?? '',
});

const toBody = (d: Draft) => ({
  name: d.name, category: d.category, pattern: d.pattern || null, braceMode: d.braceMode || null, skillLayer: d.skillLayer || null,
  primaryCues: d.cues.filter((c) => c.trim()), commonFaults: d.faults.filter((f) => f.fault.trim()),
  demoVideoUrl: d.demoVideoUrl || null, equipment: d.equipment, defaultTempo: d.defaultTempo,
  regressionOfId: d.regressionOfId || null, progressionOfId: d.progressionOfId || null,
});

const errorCopy = (e: string | undefined) => (e && e in CATALOGUE_ERROR_COPY ? CATALOGUE_ERROR_COPY[e as keyof typeof CATALOGUE_ERROR_COPY] : 'Could not save that. Try again.');

type Filter = 'all' | 'untagged' | MovementPattern;

export function MyCatalogue({ onBrowseKb, onChange, refreshKey = 0 }: { onBrowseKb?: () => void; onChange?: (rows: readonly { name: string }[]) => void; refreshKey?: number }) {
  const [items, setItems] = useState<CatalogueItem[] | null>(null);
  const [editing, setEditing] = useState<CatalogueItem | 'new' | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/coach/programs/exercises');
      const j = r.ok ? await r.json() : [];
      const rows: CatalogueItem[] = Array.isArray(j) ? j : [];
      setItems(rows);
      onChange?.(rows);   // the tab label's count and the KB's "in your catalogue" ticks read the same list
    } catch { setItems([]); }
  }, [onChange]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const shown = useMemo(() => (items ?? []).filter((it) => {
    if (filter === 'untagged' && it.pattern) return false;
    if (filter !== 'all' && filter !== 'untagged' && it.pattern !== filter) return false;
    const q = search.trim().toLowerCase();
    return !q || it.name.toLowerCase().includes(q) || it.category.includes(q);
  }), [items, filter, search]);

  const remove = async (it: CatalogueItem) => {
    if (!confirm(`Delete "${it.name}" from your catalogue?`)) return;
    const r = await fetch(`/api/coach/programs/exercises/${it.id}`, { method: 'DELETE' });
    if (r.ok) { toast.success('Deleted'); void load(); return; }
    const j = await r.json().catch(() => ({}));
    toast.error(j.error === 'in_use' && j.count ? `${errorCopy('in_use')} (${j.count} ${j.count === 1 ? 'prescription' : 'prescriptions'})` : errorCopy(j.error));
  };

  if (!items) return <div className="flex justify-center py-16 text-white/40"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const untagged = items.filter((i) => !i.pattern).length;
  const byId = new Map(items.map((i) => [i.id, i]));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-white">My catalogue <span className="text-white/40">· {items.length} exercise{items.length === 1 ? '' : 's'}</span></div>
          <div className="text-xs text-white/40">What you can put in a program on the Clients tab.{untagged > 0 && <span className="text-[#FFD700]/80"> {untagged} without a pattern yet.</span>}</div>
        </div>
        {editing === null && (
          <button onClick={() => setEditing('new')} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-3 py-1.5 text-xs text-[#00E5FF]">
            <Plus className="h-3.5 w-3.5" /> New exercise
          </button>
        )}
      </div>

      {editing !== null && (
        <CatalogueEditor
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          others={items.filter((i) => editing === 'new' || i.id !== editing.id)}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}

      {items.length === 0 && editing === null ? (
        <div className="fel-card rounded-xl p-5 text-center space-y-3">
          <div className="text-sm text-white/70">Your catalogue is empty, so the builder has nothing to program yet.</div>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 rounded-lg border border-[#00E5FF]/40 px-3 py-1.5 text-xs text-[#00E5FF]"><Plus className="h-3.5 w-3.5" /> Write your own</button>
            {onBrowseKb && <button onClick={onBrowseKb} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80"><BookOpen className="h-3.5 w-3.5" /> Copy from the knowledge base</button>}
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your catalogue..." className="w-full rounded-xl bg-[#16161a] border border-white/10 pl-10 pr-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00E5FF]/40" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(['all', ...PATTERNS, 'untagged'] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded-lg text-[11px] border ${filter === f ? 'bg-[#00E5FF]/15 text-[#00E5FF] border-[#00E5FF]/30' : 'bg-[#16161a] text-white/40 border-white/6 hover:text-white/60'}`}>
                {f === 'all' ? 'All' : f === 'untagged' ? 'No pattern' : PATTERN_INFO[f].label}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {shown.map((it) => (
              <div key={it.id} className="fel-card rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{it.name}</span>
                      {it.demoVideoUrl && <Play className="h-3.5 w-3.5 shrink-0 text-[#FF3366]/70" aria-label="has a demo video" />}
                    </div>
                    <TagRow pattern={it.pattern} braceMode={it.braceMode} layer={it.skillLayer} category={it.category} />
                    <div className="mt-1 text-[11px] text-white/40">
                      {it.primaryCues.length} cue{it.primaryCues.length === 1 ? '' : 's'} · {(it.commonFaults ?? []).length} fault{(it.commonFaults ?? []).length === 1 ? '' : 's'}
                      {it.regressionOfId && byId.get(it.regressionOfId) && <> · easier: {byId.get(it.regressionOfId)!.name}</>}
                      {it.progressionOfId && byId.get(it.progressionOfId) && <> · harder: {byId.get(it.progressionOfId)!.name}</>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => setEditing(it)} aria-label={`Edit ${it.name}`} className="rounded-lg p-1.5 text-white/40 hover:text-white"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => void remove(it)} aria-label={`Delete ${it.name}`} className="rounded-lg p-1.5 text-white/30 hover:text-[#FF3366]"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))}
            {shown.length === 0 && <div className="py-8 text-center text-sm text-white/30">Nothing matches. Try another filter.</div>}
          </div>
        </>
      )}
    </div>
  );
}

/** The three tags plus the category, as chips. An untagged pattern says so in amber: it is the one tag later phases key on. */
export function TagRow({ pattern, braceMode, layer, category }: { pattern: MovementPattern | null; braceMode: BraceMode | null; layer: string | null; category?: string }) {
  const l = skillLayer(layer);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
      {pattern ? <span className="rounded-full border border-[#00E5FF]/30 px-2 py-0.5 text-[#00E5FF]/90">{PATTERN_INFO[pattern].label}</span>
        : <span className="rounded-full border border-[#FFD700]/30 px-2 py-0.5 text-[#FFD700]/80">no pattern</span>}
      {braceMode && <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/60">{BRACE_INFO[braceMode].label}</span>}
      {l && <span className="rounded-full border border-[#A855F7]/30 px-2 py-0.5 text-[#A855F7]/90">{l.label}</span>}
      {category && <span className="text-white/30">{category}</span>}
    </div>
  );
}

/** One labelled control. `group` for a field made of several inputs (cues, faults): a <label> may wrap only one. */
function Field({ label, hint, error, group, children }: { label: string; hint?: string; error?: string | null; group?: boolean; children: ReactNode }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="block space-y-1" {...(group ? { role: 'group', 'aria-label': label } : {})}>
      <span className="block text-[11px] uppercase tracking-wider text-white/40">{label}</span>
      {children}
      {error ? <span className="block text-xs text-[#FF3366]">{error}</span> : hint ? <span className="block text-[11px] text-white/35">{hint}</span> : null}
    </Tag>
  );
}

const input = 'w-full rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#00E5FF]/40';

function CatalogueEditor({ initial, others, onCancel, onSaved }: { initial: CatalogueItem | null; others: CatalogueItem[]; onCancel: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(() => (initial ? toDraft(initial) : EMPTY));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; message: string } | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const fieldErr = (f: string) => (err?.field === f ? err.message : null);

  const pattern = (PATTERNS as readonly string[]).includes(d.pattern) ? (d.pattern as MovementPattern) : null;
  // FEL's set-up cue pick-list (lib/coach/taxonomy.ts), the ones that fit this pattern. The schema keeps set-up cue
  // PICKS per prescription (SessionExercise.setupCues); here a coach can drop one into a cue slot as wording to start from.
  const suggestions = pattern ? setupCuesFor(pattern).filter((c) => c.patterns.includes(pattern)) : [];
  const freeSlot = d.cues.findIndex((c) => !c.trim());

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = JSON.stringify(toBody(d));
      const r = initial
        ? await fetch(`/api/coach/programs/exercises/${initial.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body })
        : await fetch('/api/coach/programs/exercises', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr({ field: j.field ?? (j.error === 'name_taken' ? 'name' : undefined), message: errorCopy(j.error) }); return; }
      if (Array.isArray(j.warnings) && j.warnings.length) {
        const words = [...new Set(j.warnings.map((w: { found: string }) => `"${w.found}"`))].join(', ');
        toast.warning(`Saved. Heads-up: ${words} reads as medical language. Your athlete sees these cues, so describe the movement instead.`);
      } else toast.success(initial ? 'Saved' : 'Added to your catalogue');
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <div className="fel-card rounded-xl p-4 space-y-3 border border-[#00E5FF]/20">
      <div className="flex items-center justify-between">
        <div className="text-sm text-white">{initial ? `Edit ${initial.name}` : 'New exercise'}</div>
        <button onClick={onCancel} aria-label="Close" className="text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name" error={fieldErr('name')}>
          <input value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={CATALOGUE_LIMITS.name} placeholder="e.g. Goblet Squat" className={input} />
        </Field>
        <Field label="Category" error={fieldErr('category')}>
          <select value={d.category} onChange={(e) => set('category', e.target.value)} className={input}>
            {!CATALOGUE_CATEGORIES.some((c) => c.id === d.category) && <option value={d.category}>{d.category}</option>}
            {CATALOGUE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Pattern" error={fieldErr('pattern')} hint={pattern ? PATTERN_INFO[pattern].hint : 'What movement it trains. Warm-ups and weekly checks read this.'}>
          <select value={d.pattern} onChange={(e) => set('pattern', e.target.value)} className={input}>
            <option value="">Not tagged</option>
            {PATTERNS.map((p) => <option key={p} value={p}>{PATTERN_INFO[p].label}</option>)}
          </select>
        </Field>
        <Field label="Brace" error={fieldErr('braceMode')} hint={d.braceMode ? BRACE_INFO[d.braceMode as BraceMode]?.hint : 'Built before the rep, or has to show up mid-play?'}>
          <select value={d.braceMode} onChange={(e) => set('braceMode', e.target.value)} className={input}>
            <option value="">Not tagged</option>
            {BRACE_MODES.map((b) => <option key={b} value={b}>{BRACE_INFO[b].label}</option>)}
          </select>
        </Field>
        <Field label="Skill layer" error={fieldErr('skillLayer')} hint={skillLayer(d.skillLayer)?.meaning ?? 'Which Playbook skill it builds.'}>
          <select value={d.skillLayer} onChange={(e) => set('skillLayer', e.target.value)} className={input}>
            <option value="">Not tagged</option>
            {SKILL_LAYERS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </Field>
      </div>

      <Field group label={`Cues (up to ${CATALOGUE_LIMITS.cues})`} error={fieldErr('primaryCues')} hint="Short, and about the floor, the bar, the wall, not a muscle. Your athlete sees these on Today.">
        <div className="space-y-1.5">
          {d.cues.map((c, i) => (
            <input key={i} value={c} onChange={(e) => set('cues', d.cues.map((x, j) => (j === i ? e.target.value : x)))} maxLength={CATALOGUE_LIMITS.cue} placeholder={`Cue ${i + 1}`} className={input} />
          ))}
        </div>
      </Field>
      {suggestions.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] text-white/35">Set-up cues for a {PATTERN_INFO[pattern!].label.toLowerCase()}{freeSlot < 0 ? ' (clear a cue slot to use one)' : ', tap to use as a cue'}:</div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s.id} type="button" disabled={freeSlot < 0 || d.cues.includes(s.text)}
                onClick={() => set('cues', d.cues.map((x, j) => (j === freeSlot ? s.text : x)))}
                className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/70 disabled:opacity-35 hover:border-[#00E5FF]/40">{s.text}</button>
            ))}
          </div>
        </div>
      )}

      <Field group label="Common faults" error={fieldErr('commonFaults')} hint="What goes wrong, and the cue that fixes the rep.">
        <div className="space-y-1.5">
          {d.faults.map((f, i) => (
            <div key={i} className="flex gap-1.5">
              <input value={f.fault} onChange={(e) => set('faults', d.faults.map((x, j) => (j === i ? { ...x, fault: e.target.value } : x)))} maxLength={CATALOGUE_LIMITS.fault} placeholder="Fault" className={`${input} flex-1`} />
              <input value={f.correctionCue} onChange={(e) => set('faults', d.faults.map((x, j) => (j === i ? { ...x, correctionCue: e.target.value } : x)))} maxLength={CATALOGUE_LIMITS.fault} placeholder="Cue for it" className={`${input} flex-1`} />
              <button type="button" onClick={() => set('faults', d.faults.length > 1 ? d.faults.filter((_, j) => j !== i) : [{ fault: '', correctionCue: '' }])} aria-label="Remove fault" className="text-white/30 hover:text-[#FF3366]"><X className="h-4 w-4" /></button>
            </div>
          ))}
          {d.faults.length < CATALOGUE_LIMITS.faults && (
            <button type="button" onClick={() => set('faults', [...d.faults, { fault: '', correctionCue: '' }])} className="text-xs text-[#00E5FF]/80">+ Add a fault</button>
          )}
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Demo video link" error={fieldErr('demoVideoUrl')} hint="A YouTube or cloud link, starting https://">
          <input value={d.demoVideoUrl} onChange={(e) => set('demoVideoUrl', e.target.value)} placeholder="https://..." className={input} />
        </Field>
        <Field label="Equipment" error={fieldErr('equipment')} hint="Comma-separated, e.g. kettlebell, box">
          <input value={d.equipment} onChange={(e) => set('equipment', e.target.value)} className={input} />
        </Field>
        <Field label="Default tempo" error={fieldErr('defaultTempo')} hint="Down-pause-up-pause in seconds. 0-0-0-0 when the dose is time or contacts.">
          <input value={d.defaultTempo} onChange={(e) => set('defaultTempo', e.target.value)} className={input} />
        </Field>
        <div className="hidden sm:block" />
        <Field label="Easier version (step down to)" error={fieldErr('regressionOfId')}>
          <select value={d.regressionOfId} onChange={(e) => set('regressionOfId', e.target.value)} className={input}>
            <option value="">None</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Harder version (step up to)" error={fieldErr('progressionOfId')}>
          <select value={d.progressionOfId} onChange={(e) => set('progressionOfId', e.target.value)} className={input}>
            <option value="">None</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
      </div>

      {err && !err.field && <div className="text-xs text-[#FF3366]">{err.message}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70">Cancel</button>
        <button onClick={() => void save()} disabled={busy || !d.name.trim()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-3 py-1.5 text-xs text-[#00E5FF] disabled:opacity-40">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{initial ? 'Save' : 'Add to catalogue'}
        </button>
      </div>
    </div>
  );
}
