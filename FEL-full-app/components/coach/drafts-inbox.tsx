'use client';
// COACH-AI-DRAFT (2026-10-24): the coach's weekly Drafts inbox — one card per athlete, each change approved, edited or
// rejected on its own, and "approve all safe". Nothing here writes a program: every button posts a DECISION, and the
// server (lib/coach/weeklyDraft/approve.ts) runs every check before it writes through the program builder.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, ClipboardList, Loader2, Pencil, ShieldAlert, Sparkles, X } from 'lucide-react';
import { CONFIDENCE_LABEL, DECISION_LABEL, DRAFTS_COPY, SAFETY_LABEL } from '@/lib/coach/weeklyDraft/copy';
import { EFFORT_BANDS } from '@/lib/coach/taxonomy';
import type { DraftChange } from '@/lib/coach/weeklyDraft/types';
import {
  DRAFTS_API, DRAFTS_SAFE_API, draftErrorText, editRows, editsFrom, opLine, pendingCount, pendingSafe,
  type InboxAnswer, type InboxDraft,
} from '@/lib/coach/weeklyDraft/view';

type Decide = (d: InboxDraft, c: DraftChange, decision: 'approve' | 'reject' | 'edit', edits?: Record<string, unknown>[]) => Promise<boolean>;

const SAFETY_STYLE: Record<string, string> = {
  safe: 'border-[#39FF14]/40 text-[#39FF14]',
  review: 'border-[#FFD700]/50 text-[#FFD700]',
  unsafe: 'border-[#FF3366]/50 text-[#FF3366]',
};

export function DraftsInbox({ api = DRAFTS_API, safeApi = DRAFTS_SAFE_API }: { api?: string; safeApi?: string }) {
  const [data, setData] = useState<InboxAnswer | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'hidden' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch(api, { cache: 'no-store' });
      if (r.status === 403 || r.status === 401) { setState('hidden'); return; }
      if (!r.ok) { setState('error'); return; }
      setData(await r.json());
      setState('ready');
    } catch { setState('error'); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const decide: Decide = async (d, c, decision, edits) => {
    if (!d.draftId) return false;
    setBusy(c.id);
    try {
      const note = notes[d.clientId]?.trim() || undefined;
      const r = await fetch(api, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draftId: d.draftId, changeId: c.id, decision, ...(edits ? { edits } : {}), ...(note && decision !== 'reject' ? { note } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(draftErrorText(j.error, j.why)); return false; }
      if (note && decision !== 'reject') setNotes((n) => ({ ...n, [d.clientId]: '' }));
      toast.success(decision === 'reject' ? 'Rejected' : `${d.name}: ${c.title}`);
      await load();
      return true;
    } finally { setBusy(null); }
  };

  const approveSafe = async (d: InboxDraft) => {
    if (!d.draftId) return;
    setBusy(`safe:${d.clientId}`);
    try {
      const note = notes[d.clientId]?.trim() || undefined;
      const r = await fetch(safeApi, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: d.draftId, ...(note ? { note } : {}) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(draftErrorText(j.error)); return; }
      setNotes((n) => ({ ...n, [d.clientId]: '' }));
      toast.success(`${d.name}: ${j.approved?.length ?? 0} approved${j.skipped?.length ? `, ${j.skipped.length} need a look` : ''}`);
      await load();
    } finally { setBusy(null); }
  };

  if (state === 'hidden') return null;
  if (state === 'loading') return <div className="fel-card rounded-xl p-4 text-sm text-white/50" data-testid="drafts-inbox"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />Drafting this week…</div>;
  if (state === 'error' || !data) return <div className="fel-card rounded-xl p-4 text-sm text-white/50" data-testid="drafts-inbox">This week’s drafts did not load. Reload to try again.</div>;
  return (
    <DraftsBoard
      data={data} busy={busy} notes={notes}
      onNote={(clientId, v) => setNotes((n) => ({ ...n, [clientId]: v }))}
      onDecide={decide} onApproveSafe={approveSafe}
    />
  );
}

/** The inbox as drawn from an answer (no fetching): what the tests and the rig render. */
export function DraftsBoard({ data, busy = null, notes = {}, onNote = () => {}, onDecide = async () => false, onApproveSafe = () => {} }: {
  data: InboxAnswer; busy?: string | null; notes?: Record<string, string>;
  onNote?: (clientId: string, v: string) => void; onDecide?: Decide; onApproveSafe?: (d: InboxDraft) => void;
}) {
  const withChanges = data.drafts.filter((d) => d.changes.length);
  const quiet = data.drafts.filter((d) => !d.changes.length);
  const pending = pendingCount(data.drafts);
  return (
    <section aria-labelledby="drafts-heading" className="fel-card rounded-xl p-4 space-y-3" data-testid="drafts-inbox">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="drafts-heading" className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" /> {DRAFTS_COPY.heading}
        </h2>
        <span className="text-xs text-[#FFD700]" data-pending={pending}>{pending} to decide · week of {data.weekKey}</span>
      </div>
      <p className="text-xs text-white/50">{DRAFTS_COPY.explainer}</p>
      {!data.approvals && <p className="rounded-lg border border-[#FFD700]/30 bg-[#FFD700]/5 px-3 py-2 text-xs text-[#FFD700]/90" data-testid="drafts-not-ready">{DRAFTS_COPY.notReady}</p>}
      {!withChanges.length && <p className="text-sm text-white/50">{DRAFTS_COPY.empty}</p>}
      {withChanges.map((d) => (
        <DraftCard key={`${d.clientId}:${d.programId}`} draft={d} approvals={data.approvals} busy={busy} note={notes[d.clientId] ?? ''}
          onNote={(v) => onNote(d.clientId, v)} onDecide={onDecide} onApproveSafe={() => onApproveSafe(d)} />
      ))}
      {quiet.length > 0 && (
        <details className="rounded-lg border border-white/6 px-3 py-2 text-xs text-white/50">
          <summary className="cursor-pointer select-none">{quiet.length} athlete{quiet.length === 1 ? '' : 's'} with nothing to draft</summary>
          <ul className="mt-2 space-y-1">
            {quiet.map((d) => <li key={d.clientId} data-quiet={d.status}><span className="text-white/80">{d.name}</span> · {d.skipReason ?? d.context[d.context.length > 1 ? 1 : 0] ?? DRAFTS_COPY.empty}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

export function DraftCard({ draft: d, approvals, busy, note, onNote, onDecide, onApproveSafe }: {
  draft: InboxDraft; approvals: boolean; busy: string | null; note: string;
  onNote: (v: string) => void; onDecide: Decide; onApproveSafe: () => void;
}) {
  const safe = pendingSafe(d);
  const canDecide = approvals && !!d.draftId;
  return (
    <article className="rounded-xl border border-white/8 bg-white/[0.02] p-3 space-y-3" data-draft={d.clientId} aria-label={`Draft for ${d.name}`}>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-white">{d.name}</h3>
          {d.band === 'teen' && <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">Under 18 · conservative</span>}
          {d.engine === 'rules+ai' && <span className="inline-flex items-center gap-1 rounded-full border border-[#00E5FF]/40 px-2 py-0.5 text-[10px] text-[#00E5FF]" title={DRAFTS_COPY.ai}><Sparkles className="h-3 w-3" aria-hidden="true" />AI wording</span>}
        </div>
        <p className="text-xs text-white/50">{d.context[0]}</p>
        {d.summary && <p className="text-sm italic text-white/70" data-ai-summary>{d.summary}</p>}
      </header>

      <ul className="space-y-2">
        {d.changes.map((c) => <ChangeRow key={c.id} draft={d} change={c} canDecide={canDecide} busy={busy === c.id} youth={d.band === 'teen'} onDecide={onDecide} />)}
      </ul>

      {canDecide && (
        <div className="space-y-2">
          <label className="block text-[11px] uppercase tracking-wider text-white/40" htmlFor={`note-${d.clientId}`}>{DRAFTS_COPY.noteLabel}</label>
          <input id={`note-${d.clientId}`} value={note} maxLength={280} onChange={(e) => onNote(e.target.value)} placeholder={DRAFTS_COPY.notePlaceholder}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30" />
          <button type="button" onClick={onApproveSafe} disabled={!safe.length || busy === `safe:${d.clientId}`} data-testid="approve-all-safe"
            className="min-h-11 w-full rounded-lg bg-[#39FF14]/15 px-3 text-sm font-semibold text-[#39FF14] disabled:opacity-40 sm:w-auto">
            {DRAFTS_COPY.approveAllSafe} ({safe.length})
          </button>
        </div>
      )}

      {d.held.length > 0 && (
        <details className="text-xs text-white/60" data-held={d.held.length}>
          <summary className="cursor-pointer select-none"><ShieldAlert className="mr-1 inline h-3.5 w-3.5 text-[#FF3366]" aria-hidden="true" />{DRAFTS_COPY.held} ({d.held.length})</summary>
          <ul className="mt-1 space-y-1 pl-5">{d.held.map((h, i) => <li key={i}><span className="text-white/80">{h.title}</span> — {h.why}</li>)}</ul>
        </details>
      )}
      <details className="text-xs text-white/50">
        <summary className="cursor-pointer select-none">{DRAFTS_COPY.context}</summary>
        <ul className="mt-1 space-y-0.5 pl-5">{d.context.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>
    </article>
  );
}

function ChangeRow({ draft, change: c, canDecide, busy, youth, onDecide }: { draft: InboxDraft; change: DraftChange; canDecide: boolean; busy: boolean; youth: boolean; onDecide: Decide }) {
  const decided = draft.decisions[c.id];
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => editRows(c));
  const bands = EFFORT_BANDS.filter((b) => b.id !== 'full' && (!youth || b.youthAllowed));
  return (
    <li className="rounded-lg border border-white/6 bg-black/20 p-3 space-y-1.5" data-change={c.kind} data-safety={c.safety} data-decided={decided?.decision ?? ''}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium text-white">{c.title}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SAFETY_STYLE[c.safety]}`}>{SAFETY_LABEL[c.safety]}</span>
          <span className="text-[10px] text-white/40">{CONFIDENCE_LABEL[c.confidence]}</span>
        </span>
      </div>
      <p className="text-xs text-white/70">{c.reason}</p>
      {c.aiNote && <p className="text-xs text-[#00E5FF]/85"><Sparkles className="mr-1 inline h-3 w-3" aria-hidden="true" />{c.aiNote}</p>}
      {(c.ops.length > 0 || c.evidence.length > 0 || c.method) && (
        <details className="text-[11px] text-white/50">
          <summary className="cursor-pointer select-none">The data and the edits</summary>
          <ul className="mt-1 space-y-0.5 pl-4">
            {c.ops.map((o, i) => <li key={`o${i}`} className="text-white/70">{opLine(o)}</li>)}
            {c.evidence.filter((e) => !c.ops.length || !e.includes(' → ')).map((e, i) => <li key={`e${i}`}>{e}</li>)}
            {c.method && <li className="italic">{c.method}</li>}
          </ul>
        </details>
      )}
      {decided ? (
        <p className="text-xs font-semibold text-white/60" data-decision={decided.decision}>{DECISION_LABEL[decided.decision as 'approved'] ?? decided.decision}</p>
      ) : canDecide && !editing ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={busy} onClick={() => void onDecide(draft, c, 'approve')} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-[#00E5FF]/15 px-3 text-sm font-semibold text-[#00E5FF] disabled:opacity-40"><Check className="h-4 w-4" aria-hidden="true" />{DRAFTS_COPY.approve}</button>
          {rows.length > 0 && <button type="button" disabled={busy} onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-white/15 px-3 text-sm text-white/80 disabled:opacity-40"><Pencil className="h-4 w-4" aria-hidden="true" />{DRAFTS_COPY.edit}</button>}
          <button type="button" disabled={busy} onClick={() => void onDecide(draft, c, 'reject')} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-white/15 px-3 text-sm text-white/60 disabled:opacity-40"><X className="h-4 w-4" aria-hidden="true" />{DRAFTS_COPY.reject}</button>
        </div>
      ) : canDecide && editing ? (
        <div className="space-y-2 pt-1" data-editing>
          {rows.map((r, i) => (
            <fieldset key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <legend className="col-span-full pb-1 text-[11px] text-white/50">{r.label}</legend>
              <label className="text-[10px] text-white/40">Sets<input inputMode="numeric" value={r.sets} onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, sets: e.target.value } : x)))} className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white" /></label>
              <label className="text-[10px] text-white/40">Reps<input value={r.reps} maxLength={24} onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, reps: e.target.value } : x)))} className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white" /></label>
              <label className="text-[10px] text-white/40">Load<input value={r.load} maxLength={24} onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, load: e.target.value } : x)))} className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white" /></label>
              <label className="text-[10px] text-white/40">Band<select value={r.effortBand} onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, effortBand: e.target.value } : x)))} className="mt-0.5 w-full rounded border border-white/10 bg-[#0f0f13] px-2 py-1.5 text-sm text-white"><option value="">None</option>{bands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={async () => { if (await onDecide(draft, c, 'edit', editsFrom(c, rows))) setEditing(false); }} className="min-h-11 rounded-lg bg-[#00E5FF]/15 px-3 text-sm font-semibold text-[#00E5FF] disabled:opacity-40">{DRAFTS_COPY.save}</button>
            <button type="button" onClick={() => { setRows(editRows(c)); setEditing(false); }} className="min-h-11 rounded-lg border border-white/15 px-3 text-sm text-white/60">{DRAFTS_COPY.cancel}</button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
