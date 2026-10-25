'use client';
// CheckinsPanel — the coach's check-in forms (COACH-PARITY, 2026-10-26; server: lib/coach/checkins/server.ts).
//   · Build: a title, weekly or one-off, up to 12 questions (scale 1–10, yes/no, number, choice, free text), and "Add the
//     pain check" (FEL's own pain check-in, never a pain question). A health question is offered only while the owner's
//     switch is on; the builder says why otherwise.
//   · Assign: to one athlete on the roster or a team the coach runs.
//   · Read: pick a form → each athlete's answers by week, newest first, with a spark line per number question. Health
//     answers appear only from an adult who shares their health with this coach — the server leaves them out otherwise.
// Before the pending SQL is applied the API answers { available: false } and this says "coming soon".
import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Plus, Trash2, X } from 'lucide-react';
import { COMING_SOON_LINE, FORM_ERROR_COPY } from '@/lib/coach/checkins/copy';
import type { CheckinQuestion, QuestionKind } from '@/lib/coach/checkins/types';

export const COACH_CHECKINS_API = '/api/coach/checkins';

interface FormView { id: string; title: string; cadence: 'weekly' | 'once'; painCheck: boolean; questions: CheckinQuestion[]; line: string; assigned: { scope: 'athlete' | 'team'; scopeId: string; name: string }[]; reach: number; answeredNow: number }
interface Detail { formId: string; title: string; athletes: { id: string; name: string; healthShared: boolean; columns: { id: string; prompt: string; kind: QuestionKind; topic: string }[]; rows: { period: string; cells: Record<string, string> }[]; series: Record<string, { period: string; value: number }[]>; compliance: { answered: number; of: number } }[] }
interface Board { available: boolean; forms?: FormView[]; detail?: Detail | null; roster?: { id: string; name: string; adult: boolean }[]; teams?: { id: string; name: string; members: number }[]; healthEnabled?: boolean; lines?: { health: string; pain: string } }

const KINDS: { id: QuestionKind; label: string }[] = [
  { id: 'scale', label: 'Scale 1–10' }, { id: 'yesno', label: 'Yes / no' }, { id: 'number', label: 'Number' }, { id: 'choice', label: 'Choice' }, { id: 'text', label: 'Free text (adults)' },
];
interface Draft { kind: QuestionKind; prompt: string; health: boolean; unit: string; choices: string }
const blank = (): Draft => ({ kind: 'scale', prompt: '', health: false, unit: '', choices: '' });
const input = 'min-h-10 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-white';

function Spark({ points }: { points: { period: string; value: number }[] }) {
  if (points.length < 2) return null;
  const vs = points.map((p) => p.value);
  const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(i / (points.length - 1)) * 60},${18 - ((p.value - lo) / span) * 16}`).join(' ');
  return <svg width="60" height="20" viewBox="0 0 60 20" aria-hidden className="inline-block align-middle"><path d={d} fill="none" stroke="#00E5FF" strokeWidth="1.5" /></svg>;
}

export function CheckinsPanel({ api = COACH_CHECKINS_API }: { api?: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [title, setTitle] = useState('Weekly check-in');
  const [cadence, setCadence] = useState<'weekly' | 'once'>('weekly');
  const [painCheck, setPainCheck] = useState(false);
  const [qs, setQs] = useState<Draft[]>([{ ...blank(), prompt: 'How hard did training feel this week?' }]);
  const [msg, setMsg] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});

  const load = useCallback((formId: string | null = open) => {
    fetch(`${api}${formId ? `?formId=${encodeURIComponent(formId)}` : ''}`).then((r) => (r.ok ? r.json() : { available: false })).then(setBoard).catch(() => setBoard({ available: false }));
  }, [api, open]);
  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    return { ok: !!r?.ok, j: j as Record<string, unknown> };
  };
  const save = async () => {
    setMsg(null);
    const questions = qs.map((q) => ({ kind: q.kind, prompt: q.prompt, topic: q.health ? 'health' : 'training', unit: q.unit || undefined, choices: q.kind === 'choice' ? q.choices.split(',').map((c) => c.trim()).filter(Boolean) : undefined }));
    const { ok, j } = await post({ action: 'create', title, cadence, painCheck, questions });
    if (!ok) { const e = String(j.error ?? ''); setMsg(`${FORM_ERROR_COPY[e as keyof typeof FORM_ERROR_COPY] ?? 'Not saved. Try again.'}${typeof j.at === 'number' ? ` (question ${j.at + 1})` : ''}`); return; }
    setBuilding(false); setQs([blank()]); setPainCheck(false); setMsg('Saved. Now assign it.'); load();
  };
  const assign = async (formId: string) => {
    const v = assignTo[formId]; if (!v) return;
    const [scope, scopeId] = v.split(':');
    const { ok } = await post({ action: 'assign', formId, scope, scopeId });
    setMsg(ok ? 'Assigned.' : 'Not assigned.'); load();
  };

  if (!board) return null;
  if (!board.available) return <div className="fel-card rounded-xl p-4 text-sm text-white/50" data-checkins-soon><ClipboardCheck className="mr-2 inline h-4 w-4" />{COMING_SOON_LINE}</div>;
  const forms = board.forms ?? [];
  const put = (i: number, patch: Partial<Draft>) => setQs((all) => all.map((q, k) => (k === i ? { ...q, ...patch } : q)));

  return (
    <section className="fel-card space-y-3 rounded-xl p-4" data-checkins-panel>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><ClipboardCheck className="h-3.5 w-3.5" /> Check-ins</div>
        {!building && <button type="button" onClick={() => setBuilding(true)} className="flex min-h-10 items-center gap-1 rounded-lg border border-[#00E5FF]/50 px-3 text-sm text-[#00E5FF]" data-checkin-new><Plus className="h-4 w-4" /> New</button>}
      </div>
      {msg && <p className="text-xs text-white/60" data-checkin-msg>{msg}</p>}

      {building && (
        <div className="space-y-3 rounded-lg bg-white/[0.03] p-3" data-checkin-builder>
          <input aria-label="Check-in name" value={title} onChange={(e) => setTitle(e.target.value)} className={input} maxLength={80} />
          <div className="flex gap-2">
            {(['weekly', 'once'] as const).map((c) => <button key={c} type="button" onClick={() => setCadence(c)} className={`min-h-10 flex-1 rounded-lg border text-sm ${cadence === c ? 'border-[#00E5FF]/50 bg-[#00E5FF]/10 text-[#00E5FF]' : 'border-white/10 text-white/60'}`}>{c === 'weekly' ? 'Every week' : 'Once'}</button>)}
          </div>
          {qs.map((q, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-white/8 p-2" data-checkin-question={i}>
              <div className="flex gap-2">
                <select aria-label={`Question ${i + 1} type`} value={q.kind} onChange={(e) => put(i, { kind: e.target.value as QuestionKind })} className="min-h-10 rounded-lg border border-white/10 bg-[#0b0d12] px-2 text-sm text-white">
                  {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                <button type="button" aria-label="Remove question" onClick={() => setQs((all) => all.filter((_, k) => k !== i))} className="ml-auto min-h-10 rounded-lg px-2 text-white/40"><Trash2 className="h-4 w-4" /></button>
              </div>
              <input aria-label={`Question ${i + 1}`} placeholder="The question" value={q.prompt} onChange={(e) => put(i, { prompt: e.target.value })} className={input} maxLength={140} />
              {q.kind === 'number' && <input aria-label="Unit" placeholder="Unit (optional): kg, min, shots" value={q.unit} onChange={(e) => put(i, { unit: e.target.value })} className={input} maxLength={12} />}
              {q.kind === 'choice' && <input aria-label="Choices" placeholder="Choices, comma separated" value={q.choices} onChange={(e) => put(i, { choices: e.target.value })} className={input} />}
              {board.healthEnabled && <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={q.health} onChange={(e) => put(i, { health: e.target.checked })} /> Health question (adults only)</label>}
            </div>
          ))}
          {qs.length < 12 && <button type="button" onClick={() => setQs((all) => [...all, blank()])} className="min-h-10 w-full rounded-lg border border-dashed border-white/15 text-sm text-white/60">Add a question</button>}
          <label className="flex items-start gap-2 text-sm text-white/80"><input type="checkbox" className="mt-1" checked={painCheck} onChange={(e) => setPainCheck(e.target.checked)} data-checkin-pain /> <span>Add the pain check <span className="block text-xs text-white/45">{board.lines?.pain}</span></span></label>
          <p className="text-xs text-white/45" data-checkin-health-note>{board.lines?.health}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} className="min-h-10 flex-1 rounded-lg bg-[#00E5FF]/15 text-sm font-semibold text-[#00E5FF]" data-checkin-save>Save check-in</button>
            <button type="button" onClick={() => setBuilding(false)} className="min-h-10 rounded-lg border border-white/10 px-3 text-sm text-white/60">Cancel</button>
          </div>
        </div>
      )}

      {!forms.length && !building && <p className="text-sm text-white/50">No check-ins yet. A weekly one takes a minute to build.</p>}
      <ul className="space-y-2">
        {forms.map((f) => (
          <li key={f.id} className="space-y-2 rounded-lg bg-white/[0.03] p-3" data-checkin-form={f.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{f.title}</div>
                <div className="text-xs text-white/45">{f.line} · {f.reach ? `${f.answeredNow} of ${f.reach} answered ${f.cadence === 'weekly' ? 'this week' : ''}` : 'not assigned yet'}</div>
              </div>
              <button type="button" onClick={() => { const next = open === f.id ? null : f.id; setOpen(next); load(next); }} className="min-h-10 shrink-0 rounded-lg border border-white/15 px-3 text-xs text-white/75" data-checkin-open>{open === f.id ? 'Close' : 'Answers'}</button>
            </div>
            {f.assigned.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {f.assigned.map((a) => (
                  <span key={`${a.scope}:${a.scopeId}`} className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-white/70">
                    {a.name}
                    <button type="button" aria-label={`Unassign ${a.name}`} onClick={() => void post({ action: 'unassign', formId: f.id, scope: a.scope, scopeId: a.scopeId }).then(() => load())}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <select aria-label={`Assign ${f.title}`} value={assignTo[f.id] ?? ''} onChange={(e) => setAssignTo((m) => ({ ...m, [f.id]: e.target.value }))} className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b0d12] px-2 text-sm text-white" data-checkin-assign-to>
                <option value="">Assign to…</option>
                {(board.teams ?? []).map((t) => <option key={t.id} value={`team:${t.id}`}>Team: {t.name} ({t.members})</option>)}
                {(board.roster ?? []).map((r) => <option key={r.id} value={`athlete:${r.id}`}>{r.name}</option>)}
              </select>
              <button type="button" onClick={() => void assign(f.id)} className="min-h-10 rounded-lg border border-[#00E5FF]/40 px-3 text-sm text-[#00E5FF]" data-checkin-assign>Assign</button>
            </div>
            {open === f.id && board.detail?.formId === f.id && (
              <div className="space-y-3" data-checkin-detail>
                {!board.detail.athletes.length && <p className="text-xs text-white/50">No answers yet.</p>}
                {board.detail.athletes.map((a) => (
                  <div key={a.id} className="space-y-1" data-checkin-athlete={a.id}>
                    <div className="flex items-baseline justify-between text-xs"><span className="font-semibold text-white">{a.name}</span><span className="text-white/45">{a.compliance.answered}/{a.compliance.of} {f.cadence === 'weekly' ? 'weeks' : ''}{a.healthShared ? '' : ' · health not shared'}</span></div>
                    {a.rows.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px] text-white/75">
                          <thead><tr><th className="pr-2 font-normal text-white/40">Week of</th>{a.columns.map((c) => <th key={c.id} className="max-w-[9rem] pr-2 font-normal text-white/40">{c.prompt} {a.series[c.id] && <Spark points={a.series[c.id]} />}</th>)}</tr></thead>
                          <tbody>{a.rows.map((r) => <tr key={r.period} className="border-t border-white/5"><td className="whitespace-nowrap pr-2 text-white/50">{r.period === 'once' ? '—' : r.period.slice(5)}</td>{a.columns.map((c) => <td key={c.id} className="pr-2 align-top">{r.cells[c.id]}</td>)}</tr>)}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => void post({ action: 'archive', id: f.id }).then(() => load())} className="text-[11px] text-white/35">Archive</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
