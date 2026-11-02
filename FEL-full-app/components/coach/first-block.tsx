'use client';
// FirstBlockDraft — COACH-DELIVERY COA-02 (2026-10-27): on a BLANK program, "Draft their first block": the coach answers two
// questions (days a week, equipment), FEL's rules pick a template and put the athlete's Mirror-screen correctives in Prep
// (lib/coach/weeklyDraft/firstBlock.ts), and every line shows with why it is there and a tick. "Add to <program>" writes the
// ticked lines in one step (the builder's import_program); "Undo" puts the blank weeks back in one step while nothing has
// been logged. The AI only adds a one-line summary, when it is on.
import { useState } from 'react';
import { Sparkles, Undo2 } from 'lucide-react';
import type { ProgramTree } from '@/lib/coach/loop';

export const FIRST_BLOCK_API = '/api/coach/first-block';

interface Line { id: string; name: string; why: string; section?: string | null; sets?: number | null; reps?: string | null; workSeconds?: number | null; [k: string]: unknown }
interface Draft { templateName: string; reasons: string[]; summary: string | null; unmatched: { title: string; wanted: string[] }[]; weeks: { label: string; days: { label: string; items: Line[] }[] }[] }

const ERRORS: Record<string, string> = {
  program_not_empty: 'This program already has work in it. A first block goes into a blank program.', not_your_client: 'This athlete is not on your roster.',
  facilitator_not_certified: 'First blocks are for certified coaches.', guardian_consent_required: 'A parent or guardian needs to approve coach training first.',
};

export function FirstBlockDraft({ program, blank, onTree }: { program: { id: string; name: string }; blank: boolean; onTree: (t: ProgramTree) => void }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(3);
  const [equipment, setEquipment] = useState<'bodyweight' | 'gym'>('gym');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [before, setBefore] = useState<{ weeks: number; sessionsPerWeek: number } | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`${FIRST_BLOCK_API}?programId=${encodeURIComponent(program.id)}&daysPerWeek=${days}&equipment=${equipment}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(ERRORS[j.error] ?? j.message ?? 'No draft right now.'); return; }
      setDraft(j.draft); setBefore(j.before); setOff(new Set());
    } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!draft) return;
    setBusy(true); setMsg(null);
    try {
      const weeks = draft.weeks.map((w) => ({ label: w.label, days: w.days.map((d) => ({ label: d.label, items: d.items.filter((l) => !off.has(l.id)).map(({ id: _i, name: _n, why: _w, ...item }) => item) })) }));
      const r = await fetch(`/api/coach/programs/${program.id}/exercises`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'import_program', weeks }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(ERRORS[j.error] ?? `Not added (${j.error ?? r.status}).`); return; }
      onTree(j.tree); setApplied(true); setMsg('Added. Every line is editable in the builder below.');
    } finally { setBusy(false); }
  };
  const undo = async () => {
    setBusy(true);
    try {
      const r = await fetch(FIRST_BLOCK_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'undo', programId: program.id, ...before }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.message ?? 'Could not undo.'); return; }
      const t = await fetch(`/api/coach/programs/${program.id}`).then((x) => x.json()).catch(() => null);
      if (t?.program?.tree) onTree(t.program.tree);
      setApplied(false); setMsg('Undone: the weeks are blank again.');
    } finally { setBusy(false); }
  };

  if (!open && !applied) {
    if (!blank) return null;
    return <button type="button" onClick={() => setOpen(true)} className="flex min-h-10 items-center gap-1 rounded-lg border border-[#00E5FF]/40 px-3 text-sm text-[#00E5FF]" data-first-block-open><Sparkles className="h-4 w-4" /> Draft their first block</button>;
  }
  return (
    <section className="min-w-0 space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3" data-first-block>
      {!applied && (
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="Days a week" value={days} onChange={(e) => setDays(Number(e.target.value))} className="min-h-10 rounded-lg border border-white/10 bg-[#0b0d12] px-2 text-sm text-white">
            {[2, 3, 4].map((d) => <option key={d} value={d}>{d} days a week</option>)}
          </select>
          <select aria-label="Equipment" value={equipment} onChange={(e) => setEquipment(e.target.value === 'gym' ? 'gym' : 'bodyweight')} className="min-h-10 rounded-lg border border-white/10 bg-[#0b0d12] px-2 text-sm text-white">
            <option value="gym">A gym</option><option value="bodyweight">Bodyweight only</option>
          </select>
          <button type="button" disabled={busy} onClick={() => void load()} className="col-span-2 min-h-10 rounded-lg bg-[#00E5FF]/15 text-sm text-[#00E5FF]">{draft ? 'Draft again' : 'Draft it'}</button>
        </div>
      )}
      {msg && <p className="text-xs text-white/65" data-first-block-msg>{msg}</p>}
      {draft && !applied && (
        <div className="space-y-2">
          <p className="text-sm text-white">{draft.templateName}</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-white/55">{draft.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {draft.summary && <p className="text-xs text-[#00E5FF]/80">{draft.summary}</p>}
          {draft.unmatched.length > 0 && <p className="text-xs text-[#FFD700]/80">No exercise in your catalogue for: {draft.unmatched.map((u) => u.title).join('; ')}.</p>}
          {draft.weeks.map((w) => (
            <details key={w.label} className="text-xs" open={w === draft.weeks[0]}>
              <summary className="cursor-pointer text-white/70">{w.label}</summary>
              {w.days.map((d) => (
                <div key={d.label} className="mt-1 space-y-0.5">
                  <div className="text-white/45">{d.label}</div>
                  {d.items.map((l) => (
                    <label key={l.id} className="flex min-w-0 items-start gap-2" title={l.why} data-first-block-line>
                      <input type="checkbox" className="mt-0.5" checked={!off.has(l.id)} onChange={() => setOff((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} />
                      <span className="min-w-0 break-words text-white/85">{l.name} <span className="text-white/45">{l.sets ?? ''}×{l.reps ?? (l.workSeconds ? `${l.workSeconds}s` : '')} · {l.section}</span>{l.section === 'prep' ? <span className="block text-[11px] text-[#FFD700]/70">{l.why}</span> : null}</span>
                    </label>
                  ))}
                </div>
              ))}
            </details>
          ))}
          <button type="button" disabled={busy} onClick={() => void apply()} className="min-h-10 w-full rounded-lg bg-[#00E5FF]/15 text-sm font-medium text-[#00E5FF]">Add to {program.name}</button>
        </div>
      )}
      {applied && <button type="button" disabled={busy} onClick={() => void undo()} className="flex min-h-10 items-center gap-1 rounded-lg border border-white/15 px-3 text-sm text-white/70" data-first-block-undo><Undo2 className="h-4 w-4" /> Undo the first block</button>}
    </section>
  );
}
