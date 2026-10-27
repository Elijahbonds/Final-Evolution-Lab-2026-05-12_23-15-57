'use client';
// SIGNATURE-PROGRAMS (2026-10-25): the owner's review of the four signature programs (/coach/admin/programs), the library
// review page's pattern (components/library/library-review.tsx): each program's status, its checks (lib/signature/check.ts),
// the library entries it uses that are still drafts, the gaps the books do not cover, and every item's exercise and dose
// to edit. Approve shows it to athletes; an edit or an approval with any problem is refused by the server (422) and the
// problems are listed. Writes answer 503 until the pending SQL is applied.
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ShieldCheck, XCircle } from 'lucide-react';
import type { ItemEdit, ProgramEdits } from '@/lib/signature/edits';
import type { ReviewRow } from '@/lib/signature/server';

interface Overview { ready: boolean; programs: ReviewRow[] }

const STATUS_STYLE: Record<string, string> = {
  approved: 'bg-[#00FF9D]/15 text-[#00FF9D]', draft: 'bg-[#FFD700]/15 text-[#FFD700]', rejected: 'bg-red-400/15 text-red-300',
};

function NumberBox({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <label className="flex flex-col text-[10.5px] text-white/45">
      {label}
      <input inputMode="numeric" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="mt-0.5 h-9 w-16 rounded-lg border border-white/10 bg-black/40 px-2 text-[13px] text-white" />
    </label>
  );
}

function ProgramCardReview({ row, onSaved }: { row: ReviewRow; onSaved: (o: Overview) => void }) {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<ProgramEdits>(row.edits);
  const [note, setNote] = useState(row.note ?? '');
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const setEdit = (key: string, patch: ItemEdit) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));
  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null); setProblems(null);
    try {
      const r = await fetch('/api/admin/signature-programs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: row.id, note, ...body }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 422) setProblems(j.problems ?? []);
      else if (r.status === 503) setMsg('Opens when prisma/pending/2026-10-25-signature-programs.sql is applied.');
      else if (!r.ok) setMsg('That did not save.');
      else {
        setMsg(`Saved: ${j.status}.`);
        const o = await fetch('/api/admin/signature-programs', { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
        if (o) onSaved(o);
      }
    } finally { setBusy(false); }
  };

  return (
    <li data-review={row.id} data-status={row.status} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="fel-heading text-[17px] font-black text-white">{row.title}</p>
        <span className={`rounded-lg px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${STATUS_STYLE[row.status]}`}>{row.status}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-white/60">
        {row.exercises} exercises · <span data-draft-count>{row.draftExercises.length} still drafts in the library</span> · {row.gaps.length} gaps · {Object.keys(row.edits).length} edits
      </p>
      {row.problems.length > 0
        ? <p data-problems className="mt-1 flex gap-1.5 text-[12.5px] text-red-300"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{row.problems.length} problems: {row.problems.slice(0, 3).join('; ')}</p>
        : <p data-checks-ok className="mt-1 flex gap-1.5 text-[12.5px] text-[#00FF9D]"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />Every check holds: library, doses, youth rules, contacts, length, copy.</p>}
      <details className="mt-2 text-[12px] text-[#FFD700]/80">
        <summary className="min-h-[44px] cursor-pointer py-3 font-bold">Gaps the books do not cover ({row.gaps.length})</summary>
        <ul className="grid list-disc gap-1 pb-2 pl-4">{row.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
      </details>
      {row.draftExercises.length > 0 && (
        <details className="text-[12px] text-white/55">
          <summary className="min-h-[44px] cursor-pointer py-3 font-bold">Library drafts it uses ({row.draftExercises.length}) — review them on the library page</summary>
          <p className="pb-2">{row.draftExercises.map((x) => row.names[x] ?? x).join(', ')}</p>
        </details>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-h-[44px] items-center gap-1 text-[12.5px] font-bold text-[#00E5FF]">
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /> {open ? 'Hide the sessions' : 'Edit the sessions'}
      </button>
      {open && (
        <div data-editor className="mt-1 grid gap-3">
          {row.program.phases.map((ph) => (
            <div key={ph.id}>
              <p className="text-[13px] font-bold text-white">{ph.label} <span className="font-normal text-white/45">· {ph.weeks.length} weeks</span></p>
              {ph.sessions.map((s) => (
                <div key={s.key} className="mt-2 rounded-xl border border-white/8 p-2.5">
                  <p className="text-[12.5px] font-bold text-white/80">{s.day} · {s.key} · {s.label}</p>
                  <ul className="mt-1.5 grid gap-2">
                    {s.items.map((it, i) => {
                      const key = `${ph.id}/${s.key}/${i}`;
                      const e = edits[key] ?? {};
                      return (
                        <li key={key} data-edit-item={key} className="flex flex-wrap items-end gap-2 border-t border-white/5 pt-2">
                          <label className="flex min-w-[180px] flex-1 flex-col text-[10.5px] text-white/45">
                            {it.section} · {row.names[e.ex ?? it.ex] ?? e.ex ?? it.ex}
                            <input value={e.ex ?? it.ex} onChange={(ev) => setEdit(key, { ex: ev.target.value.trim() })}
                              className="mt-0.5 h-9 rounded-lg border border-white/10 bg-black/40 px-2 font-mono text-[12px] text-white" />
                          </label>
                          <NumberBox label="Sets" value={e.sets ?? it.sets} onChange={(v) => setEdit(key, { sets: v })} />
                          <label className="flex flex-col text-[10.5px] text-white/45">
                            Reps
                            <input value={e.reps ?? it.reps ?? ''} onChange={(ev) => setEdit(key, { reps: ev.target.value })}
                              className="mt-0.5 h-9 w-28 rounded-lg border border-white/10 bg-black/40 px-2 text-[13px] text-white" />
                          </label>
                          <NumberBox label="Secs" value={e.secs === null ? undefined : e.secs ?? it.secs} onChange={(v) => setEdit(key, { secs: v ?? null })} />
                          <NumberBox label="Rest" value={e.rest ?? it.rest} onChange={(v) => setEdit(key, { rest: v })} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <label className="mt-3 flex flex-col text-[11px] text-white/45">
        Note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500}
          className="mt-1 rounded-lg border border-white/10 bg-black/40 p-2 text-[13px] text-white" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" data-save-edits disabled={busy} onClick={() => act({ action: 'edit', edits })} className="min-h-[44px] rounded-xl border border-white/15 px-4 text-[13px] font-bold text-white hover:bg-white/[0.05] disabled:opacity-50">Save edits</button>
        <button type="button" data-approve disabled={busy} onClick={() => act({ action: 'approve' })} className="min-h-[44px] rounded-xl bg-[#00FF9D] px-4 text-[13px] font-black text-black disabled:opacity-50">Approve</button>
        <button type="button" data-reject disabled={busy} onClick={() => act({ action: 'reject' })} className="min-h-[44px] rounded-xl border border-red-400/40 px-4 text-[13px] font-bold text-red-300 disabled:opacity-50">Reject</button>
        {row.status !== 'draft' && <button type="button" disabled={busy} onClick={() => act({ action: 'draft' })} className="min-h-[44px] rounded-xl border border-white/15 px-4 text-[13px] font-bold text-white/70 disabled:opacity-50">Back to draft</button>}
      </div>
      {msg && <p role="status" className="mt-2 text-[12.5px] text-white/70">{msg}</p>}
      {problems && <ul data-refused className="mt-2 grid list-disc gap-1 pl-4 text-[12px] text-red-300">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
    </li>
  );
}

export function ProgramReview({ initial }: { initial?: Overview | null }) {
  const [data, setData] = useState<Overview | null>(initial ?? null);
  const load = useCallback(async () => {
    const r = await fetch('/api/admin/signature-programs', { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setData(await r.json());
  }, []);
  useEffect(() => { if (!initial) void load(); }, [initial, load]);
  return (
    <div data-testid="signature-review" className="mx-auto max-w-[860px] px-5 pt-8">
      <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.22em] text-[#FFD700]"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Owner review</p>
      <h1 className="fel-heading mt-2 text-[28px] font-black text-white">Signature programs</h1>
      <p className="mt-2 max-w-xl text-[13px] text-white/50">The owner approved all four programs as drafted (2026-10-27), so each one is approved until you reject it or send it back to draft here. Only an approved program is shown to athletes. Edit any exercise (a library id) or dose; the checks run before anything saves.</p>
      {data && !data.ready && <p data-not-ready className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12.5px] text-white/60">The review tables are not applied yet (prisma/pending/2026-10-25-signature-programs.sql): you can read every program and its checks; approving and editing open once they are.</p>}
      {!data ? <p className="mt-6 text-white/50">Loading…</p> : (
        <ul className="mt-5 grid gap-4">{data.programs.map((p) => <ProgramCardReview key={p.id} row={p} onSaved={setData} />)}</ul>
      )}
    </div>
  );
}
