'use client';
// LibraryReview — EXERCISE-LIBRARY (2026-10-25): the owner's review of the library's drafts, by batch, and the coach
// submission queue. Approve, edit or reject one; approve a whole batch; moderate a submission. Every write goes to
// /api/admin/library (admin role only), which validates an edit or a submission exactly as the CI validator does and
// answers with the issues instead of writing a line that breaks the cue policy. Until the pending SQL is applied the
// page reads and every write says why it is waiting.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import type { LibraryCard } from '@/lib/library/server';

interface Batch { batch: string; total: number; draft: number; approved: number; rejected: number }
interface Submission { id: string; coachName?: string | null; createdAt?: string; payload: { name: string; category: string; pattern: string | null; primaryCues: string[]; commonFaults: { fault: string; correctionCue: string }[]; equipment: string[] } }
interface Overview { ready: boolean; batches: Batch[]; total: number; entries: LibraryCard[]; queue: Submission[] }

const NOT_READY = 'Review decisions are saved once the library tables are applied (prisma/pending/2026-10-25-exercise-library.sql).';

export function LibraryReview() {
  const [batch, setBatch] = useState<string | null>(null);
  const [status, setStatus] = useState<'draft' | 'approved' | 'rejected' | 'all'>('draft');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Overview | null>(null);
  const [editing, setEditing] = useState<LibraryCard | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ status, offset: String(offset) });
    if (batch) p.set('batch', batch);
    const r = await fetch(`/api/admin/library?${p}`);
    setData(r.ok ? await r.json() : null);
  }, [batch, status, offset]);
  useEffect(() => { void load(); }, [load]);

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/library', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 503) { toast.message(NOT_READY); return false; }
      if (r.status === 422 && Array.isArray(j.issues)) { toast.error(`Not saved: ${j.issues.map((i: { detail: string }) => i.detail).slice(0, 2).join(' · ')}`); return false; }
      if (!r.ok) { toast.error('Could not save that. Try again.'); return false; }
      toast.success(done);
      await load();
      return true;
    } finally { setBusy(false); }
  };

  if (!data) return <div className="flex justify-center py-16 text-white/40"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const current = data.batches.find((b) => b.batch === batch);

  return (
    <main className="mx-auto max-w-[960px] space-y-4 px-4 py-6" data-testid="library-review">
      <header className="space-y-1">
        <h1 className="fel-heading text-xl text-white">Exercise library review</h1>
        <p className="text-xs text-white/50">Drafts are seed facts in FEL&apos;s words and FEL-authored entries. Nothing reaches a coach by default, or any athlete, until it is approved here.</p>
        {!data.ready && <p className="rounded-lg border border-[#FFD700]/30 bg-[#FFD700]/[0.06] px-3 py-2 text-xs text-[#FFD700]/90">{NOT_READY}</p>}
      </header>

      <section className="space-y-2">
        <h2 className="text-[11px] uppercase tracking-wider text-white/40">Batches</h2>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => { setBatch(null); setOffset(0); }} className={`rounded-lg border px-2 py-1 text-[11px] ${!batch ? 'border-[#00E5FF]/40 text-[#00E5FF]' : 'border-white/10 text-white/60'}`}>All</button>
          {data.batches.map((b) => (
            <button key={b.batch} onClick={() => { setBatch(b.batch); setOffset(0); }} className={`rounded-lg border px-2 py-1 text-[11px] ${batch === b.batch ? 'border-[#00E5FF]/40 text-[#00E5FF]' : 'border-white/10 text-white/60'}`}>
              {b.batch} <span className="text-white/35">{b.draft}/{b.total}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {(['draft', 'approved', 'rejected', 'all'] as const).map((s) => (
            <button key={s} onClick={() => { setStatus(s); setOffset(0); }} className={`rounded-md px-2 py-0.5 ${status === s ? 'bg-white/10 text-white' : 'text-white/45'}`}>{s}</button>
          ))}
          {current && current.draft > 0 && (
            <button disabled={busy} onClick={() => { if (confirm(`Approve all ${current.draft} drafts in ${current.batch}?`)) void act({ action: 'approve-batch', batch: current.batch }, `${current.batch} approved`); }}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[#7BD389]/40 px-2.5 py-1 text-[#7BD389] disabled:opacity-40" data-testid="approve-batch">
              <Check className="h-3.5 w-3.5" /> Approve batch ({current.draft})
            </button>
          )}
        </div>
      </section>

      {editing && <EditEntry e={editing} busy={busy} onCancel={() => setEditing(null)} onSave={async (entry, approve) => { if (await act({ action: 'edit', entry, approve }, approve ? 'Saved and approved' : 'Saved')) setEditing(null); }} />}

      <section className="space-y-2">
        <h2 className="text-[11px] uppercase tracking-wider text-white/40">{data.total.toLocaleString()} {status === 'all' ? '' : status} entries{batch ? ` in ${batch}` : ''}</h2>
        {data.entries.map((e) => (
          <div key={e.id} className="fel-card space-y-1 rounded-xl p-3" data-testid="review-row">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm text-white">{e.name} <span className="text-[10px] text-white/35">{e.level} · {e.pattern} · {e.equipment.join(', ') || 'no equipment'}</span></div>
                <div className="text-[11px] text-white/45">{e.setup}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button disabled={busy} onClick={() => void act({ action: 'approve', ids: [e.id] }, `${e.name} approved`)} aria-label={`Approve ${e.name}`} className="rounded-lg p-1.5 text-[#7BD389]/80 hover:text-[#7BD389]"><Check className="h-4 w-4" /></button>
                <button disabled={busy} onClick={() => setEditing(e)} aria-label={`Edit ${e.name}`} className="rounded-lg p-1.5 text-white/50 hover:text-white"><Pencil className="h-4 w-4" /></button>
                <button disabled={busy} onClick={() => void act({ action: 'reject', ids: [e.id] }, `${e.name} rejected`)} aria-label={`Reject ${e.name}`} className="rounded-lg p-1.5 text-white/40 hover:text-[#FF3366]"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <ul className="list-disc pl-4 text-[12px] text-white/65">{e.cues.map((c) => <li key={c}>{c}</li>)}</ul>
            <div className="text-[11px] text-white/45">{e.faults.map((f) => `${f.fault} → ${f.fix}`).join(' · ')}</div>
          </div>
        ))}
        <div className="flex justify-between text-xs">
          <button disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 50))} className="text-white/60 disabled:opacity-30">Previous</button>
          <button disabled={offset + 50 >= data.total} onClick={() => setOffset((o) => o + 50)} className="text-white/60 disabled:opacity-30">Next</button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-[11px] uppercase tracking-wider text-white/40">Coach submissions ({data.queue.length})</h2>
        {data.queue.length === 0 && <p className="text-xs text-white/35">Nothing waiting.</p>}
        {data.queue.map((s) => (
          <div key={s.id} className="fel-card space-y-1 rounded-xl p-3">
            <div className="text-sm text-white">{s.payload.name} <span className="text-[10px] text-white/35">from {s.coachName ?? 'a coach'} · {s.payload.pattern ?? 'no pattern'}</span></div>
            <ul className="list-disc pl-4 text-[12px] text-white/65">{s.payload.primaryCues.map((c) => <li key={c}>{c}</li>)}</ul>
            <div className="flex gap-2 pt-1">
              <button disabled={busy} onClick={() => void act({ action: 'moderate', submissionId: s.id, decision: 'approved' }, `${s.payload.name} added to the library`)} className="rounded-lg border border-[#7BD389]/40 px-2.5 py-1 text-xs text-[#7BD389]">Approve</button>
              <button disabled={busy} onClick={() => { const note = prompt('A note for the coach (optional)') ?? ''; void act({ action: 'moderate', submissionId: s.id, decision: 'rejected', note }, 'Sent back to the coach'); }} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/70">Send back</button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

function EditEntry({ e, busy, onCancel, onSave }: { e: LibraryCard; busy: boolean; onCancel: () => void; onSave: (entry: LibraryCard, approve: boolean) => void }) {
  const [name, setName] = useState(e.name);
  const [setup, setSetup] = useState(e.setup);
  const [cues, setCues] = useState(e.cues.join('\n'));
  const [faults, setFaults] = useState(e.faults.map((f) => `${f.fault} | ${f.fix}`).join('\n'));
  const [level, setLevel] = useState(e.level);
  const input = 'w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-[#00E5FF]/40 focus:outline-none';
  const build = (): LibraryCard => ({
    ...e, name: name.trim(), setup: setup.trim(), level,
    cues: cues.split('\n').map((c) => c.trim()).filter(Boolean).slice(0, 3),
    faults: faults.split('\n').map((l) => l.split('|')).filter((p) => p[0]?.trim()).map(([fault, fix]) => ({ fault: fault.trim(), fix: (fix ?? '').trim() })).slice(0, 4),
  });
  return (
    <div className="fel-card space-y-2 rounded-xl border border-[#00E5FF]/20 p-4" data-testid="review-edit">
      <div className="text-sm text-white">Edit {e.name}</div>
      <label className="block space-y-1 text-[11px] text-white/45">Name<input value={name} onChange={(x) => setName(x.target.value)} className={input} /></label>
      <label className="block space-y-1 text-[11px] text-white/45">Set-up<textarea value={setup} onChange={(x) => setSetup(x.target.value)} rows={2} className={input} /></label>
      <label className="block space-y-1 text-[11px] text-white/45">Cues (one per line, up to 3)<textarea value={cues} onChange={(x) => setCues(x.target.value)} rows={3} className={input} /></label>
      <label className="block space-y-1 text-[11px] text-white/45">Faults (fault | fix, one per line)<textarea value={faults} onChange={(x) => setFaults(x.target.value)} rows={3} className={input} /></label>
      <label className="block space-y-1 text-[11px] text-white/45">Level
        <select value={level} onChange={(x) => setLevel(x.target.value as LibraryCard['level'])} className={input}>
          {['beginner', 'intermediate', 'advanced'].map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70">Cancel</button>
        <button disabled={busy} onClick={() => onSave(build(), false)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80">Save</button>
        <button disabled={busy} onClick={() => onSave(build(), true)} className="rounded-lg border border-[#7BD389]/40 px-3 py-1.5 text-xs text-[#7BD389]">Save and approve</button>
      </div>
    </div>
  );
}
