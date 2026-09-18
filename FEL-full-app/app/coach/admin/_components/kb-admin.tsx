'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Plus, Save, Trash2, ChevronDown, ChevronRight, BookOpen, Dumbbell,
  Eye, EyeOff, Loader2, FolderPlus, Video,
} from 'lucide-react';

const PHASES = [
  { n: 1, label: 'System Scan' },
  { n: 2, label: 'Hardware Calibration' },
  { n: 3, label: 'Physics of Flight' },
  { n: 4, label: 'Basketball Application' },
  { n: 5, label: 'System Integration' },
];
const LEVELS = ['foundation', 'intermediate', 'advanced', 'elite'];
const PRQ_STATS = ['strength', 'speed', 'endurance', 'agility', 'power', 'flexibility', 'recovery', 'mental'];

interface Category { id: string; name: string; description: string; sortOrder: number; _count?: { exercises: number } }
interface Exercise {
  id: string; name: string; slug: string; categoryId: string; phase: number; chapter: number;
  bounceLevel: string; coachingCues: string; commonMistakes: string; progressions: string;
  regressions: string; prerequisites: string; targetPrqStat: string; dosage: string;
  videoUrl: string; thumbnailUrl: string; published: boolean; sortOrder: number;
  category?: { id: string; name: string };
}

export function KBAdmin() {
  const [cats, setCats] = useState<Category[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [openEx, setOpenEx] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');

  const load = useCallback(async () => {
    try {
      const [cRes, eRes] = await Promise.all([
        fetch('/api/coach/categories'),
        fetch('/api/coach/exercises'),
      ]);
      const cj = await cRes.json();
      const ej = await eRes.json();
      setCats(cj?.categories ?? []);
      setExercises(ej?.exercises ?? []);
    } catch { toast.error('Failed to load KB data'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const res = await fetch('/api/coach/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName.trim() }),
    });
    if (res.ok) { setNewCatName(''); load(); toast.success('Category created'); }
    else { const j = await res.json().catch(() => ({})); toast.error(j?.error ?? 'Failed'); }
  };

  const addExercise = async (categoryId: string) => {
    const res = await fetch('/api/coach/exercises', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Exercise', categoryId }),
    });
    if (res.ok) { const j = await res.json(); setOpenEx(j?.exercise?.id); load(); toast.success('Exercise created'); }
    else toast.error('Failed to create exercise');
  };

  const saveExercise = async (ex: Exercise) => {
    setSaving(ex.id);
    const res = await fetch(`/api/coach/exercises/${ex.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ex),
    });
    if (res.ok) { toast.success('Saved'); load(); }
    else toast.error('Failed to save');
    setSaving(null);
  };

  const deleteExercise = async (id: string) => {
    if (!confirm('Delete this exercise?')) return;
    await fetch(`/api/coach/exercises/${id}`, { method: 'DELETE' });
    setOpenEx(null);
    load();
    toast.success('Deleted');
  };

  const updateLocal = (id: string, field: string, value: any) => {
    setExercises(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" /></div>;

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-7 w-7 text-[#A855F7]" />
        <div>
          <h1 className="fel-heading text-3xl font-bold text-white">EXERCISE KNOWLEDGE BASE</h1>
          <p className="text-sm text-white/50">Author exercises for the Bonds Bounce Blueprint curriculum.</p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mt-4 flex flex-wrap gap-4 rounded-xl bg-white/5 px-4 py-3">
        <span className="font-mono text-xs text-white/60">{cats.length} categories</span>
        <span className="font-mono text-xs text-white/60">{exercises.length} exercises</span>
        <span className="font-mono text-xs text-[#00FF9D]">{exercises.filter(e => e.published).length} published</span>
        <span className="font-mono text-xs text-white/40">{exercises.filter(e => e.videoUrl).length} with video</span>
      </div>

      {/* Add Category */}
      <div className="mt-6 flex gap-2">
        <input
          value={newCatName}
          onChange={e => setNewCatName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCategory()}
          placeholder="New category name…"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#A855F7]/50 focus:outline-none"
        />
        <button onClick={addCategory} className="flex items-center gap-1.5 rounded-lg bg-[#A855F7] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#A855F7]/80">
          <FolderPlus className="h-4 w-4" /> Add Category
        </button>
      </div>

      {/* Categories + Exercises */}
      {cats.map(cat => {
        const catExercises = exercises.filter(e => e.categoryId === cat.id);
        return (
          <section key={cat.id} className="mt-6">
            <div className="flex items-center justify-between rounded-t-xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <h2 className="fel-heading text-lg font-bold text-white">{cat.name}</h2>
                <p className="text-xs text-white/40">{catExercises.length} exercises · {cat.description || 'No description'}</p>
              </div>
              <button onClick={() => addExercise(cat.id)} className="flex items-center gap-1 rounded-md border border-white/15 px-3 py-1.5 text-xs font-bold text-white/70 transition hover:border-[#00E5FF]/50 hover:text-[#00E5FF]">
                <Plus className="h-3.5 w-3.5" /> Exercise
              </button>
            </div>

            <div className="space-y-px">
              {catExercises.map(ex => {
                const isOpen = openEx === ex.id;
                return (
                  <div key={ex.id} className="border border-t-0 border-white/10 bg-[#0a0a0a]">
                    <button onClick={() => setOpenEx(isOpen ? null : ex.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-white/50" /> : <ChevronRight className="h-4 w-4 text-white/50" />}
                      <Dumbbell className="h-4 w-4 text-[#00E5FF]" />
                      <span className="flex-1 text-sm font-medium text-white/85">{ex.name || 'Untitled'}</span>
                      {ex.videoUrl && <Video className="h-3.5 w-3.5 text-[#FFD700]" />}
                      {ex.published ? <Eye className="h-3.5 w-3.5 text-[#00FF9D]" /> : <EyeOff className="h-3.5 w-3.5 text-white/30" />}
                      <span className="font-mono text-[10px] text-white/30">Ph{ex.phase} Ch{ex.chapter}</span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-white/5 px-4 py-4 space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Exercise Name" value={ex.name} onChange={v => updateLocal(ex.id, 'name', v)} />
                          <Field label="Slug" value={ex.slug} onChange={v => updateLocal(ex.id, 'slug', v)} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-4">
                          <Select label="Phase" value={String(ex.phase)} options={PHASES.map(p => ({ v: String(p.n), l: `${p.n} — ${p.label}` }))} onChange={v => updateLocal(ex.id, 'phase', Number(v))} />
                          <Field label="Chapter (1-20)" value={String(ex.chapter)} onChange={v => updateLocal(ex.id, 'chapter', v)} />
                          <Select label="Bounce Level" value={ex.bounceLevel} options={LEVELS.map(l => ({ v: l, l: l.charAt(0).toUpperCase() + l.slice(1) }))} onChange={v => updateLocal(ex.id, 'bounceLevel', v)} />
                          <Select label="Target PRQ Stat" value={ex.targetPrqStat} options={[{ v: '', l: '— Select —' }, ...PRQ_STATS.map(s => ({ v: s, l: s.charAt(0).toUpperCase() + s.slice(1) }))]} onChange={v => updateLocal(ex.id, 'targetPrqStat', v)} />
                        </div>
                        <TextArea label="Coaching Cues (what Elijah says)" value={ex.coachingCues} onChange={v => updateLocal(ex.id, 'coachingCues', v)} rows={3} />
                        <TextArea label="Common Mistakes" value={ex.commonMistakes} onChange={v => updateLocal(ex.id, 'commonMistakes', v)} rows={2} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <TextArea label="Progressions" value={ex.progressions} onChange={v => updateLocal(ex.id, 'progressions', v)} rows={2} />
                          <TextArea label="Regressions" value={ex.regressions} onChange={v => updateLocal(ex.id, 'regressions', v)} rows={2} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <TextArea label="Prerequisites" value={ex.prerequisites} onChange={v => updateLocal(ex.id, 'prerequisites', v)} rows={2} />
                          <Field label="Dosage (sets × reps, timing)" value={ex.dosage} onChange={v => updateLocal(ex.id, 'dosage', v)} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Video URL" value={ex.videoUrl} onChange={v => updateLocal(ex.id, 'videoUrl', v)} placeholder="https://youtu.be/..." />
                          <Field label="Thumbnail URL" value={ex.thumbnailUrl} onChange={v => updateLocal(ex.id, 'thumbnailUrl', v)} placeholder="https://img.magnific.com/free-vector/flat-abstract-sport-youtube-thumbnail_23-2148902659.jpg?semt=ais_hybrid&w=740&q=80" />
                        </div>
                        {ex.videoUrl && isYouTube(ex.videoUrl) && (
                          <div className="aspect-video w-full max-w-md overflow-hidden rounded-lg border border-white/10">
                            <iframe
                              src={`https://www.youtube.com/embed/${extractYTId(ex.videoUrl)}`}
                              className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm text-white/70">
                            <input type="checkbox" checked={ex.published} onChange={e => updateLocal(ex.id, 'published', e.target.checked)} className="accent-[#00FF9D]" />
                            Published (visible to learners)
                          </label>
                          <Field label="Sort Order" value={String(ex.sortOrder)} onChange={v => updateLocal(ex.id, 'sortOrder', v)} className="w-24" />
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button onClick={() => saveExercise(ex)} disabled={saving === ex.id} className="flex items-center gap-1.5 rounded-md bg-[#00E5FF] px-4 py-2 text-sm font-bold text-black transition hover:bg-[#00E5FF]/80 disabled:opacity-50">
                            {saving === ex.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                          </button>
                          <button onClick={() => deleteExercise(ex.id)} className="flex items-center gap-1.5 rounded-md border border-[#FF3366]/40 px-4 py-2 text-sm font-bold text-[#FF3366] transition hover:bg-[#FF3366]/10">
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {cats.length === 0 && (
        <p className="mt-12 text-center text-white/40">No categories yet. Create one above to start building the exercise catalogue.</p>
      )}
    </main>
  );
}

/* ── Small helpers ── */
function Field({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/25 focus:border-[#00E5FF]/50 focus:outline-none" />
    </div>
  );
}
function TextArea({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-[#00E5FF]/50 focus:outline-none" />
    </div>
  );
}
function Select({ label, value, options, onChange }: { label: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-[#00E5FF]/50 focus:outline-none">
        {options.map(o => <option key={o.v} value={o.v} className="bg-[#111]">{o.l}</option>)}
      </select>
    </div>
  );
}

function isYouTube(url: string) { return /youtu\.?be/i.test(url); }
function extractYTId(url: string): string {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return m?.[1] ?? '';
}
