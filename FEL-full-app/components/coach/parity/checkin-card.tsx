'use client';
// CheckinCard — the athlete's check-ins on Today (COACH-PARITY, 2026-10-26; server: lib/coach/checkins/server.ts).
// The server sends only the questions this athlete may be asked (a teen: training questions, no free text). Health
// questions sit in their own section with the draft line saying who sees them; without the health_data grant the section
// shows the app's existing consent step (components/coach/pain-checkin.tsx HealthConsentLockedNotice) — never a second
// consent wording. "Pain check" is FEL's own pain check-in (PainCheckInChip → /api/health/pain), not a question here.
// Nothing shows before the pending SQL is applied, or when no coach sent a check-in.
import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { HealthConsentLockedNotice, PainCheckInChip } from '@/components/coach/pain-checkin';
import { DONE_LINE, DONE_ONCE_LINE, DUE_LINE } from '@/lib/coach/checkins/copy';
import type { AnswerValue, CheckinQuestion } from '@/lib/coach/checkins/types';

export const MY_CHECKINS_API = '/api/coach/me/checkins';

interface FormView {
  id: string; title: string; cadence: 'weekly' | 'once'; coachName: string; due: boolean;
  questions: CheckinQuestion[]; health: { questions: CheckinQuestion[]; allowed: boolean; line: string; consentLine: string | null } | null;
  painCheck: boolean; answers: Record<string, AnswerValue>; healthAnswers: Record<string, AnswerValue>; lines: { seen: string; skipped: string | null };
}

function Field({ q, value, onChange }: { q: CheckinQuestion; value: AnswerValue | undefined; onChange: (v: AnswerValue | null) => void }) {
  const btn = (on: boolean) => `min-h-10 rounded-lg border text-sm ${on ? 'border-fel-cyan/60 bg-fel-cyan/15 text-fel-cyan' : 'border-white/10 text-white/70'}`;
  return (
    <fieldset className="space-y-1.5" data-checkin-field={q.id}>
      <legend className="text-sm text-white/85">{q.prompt}</legend>
      {q.kind === 'scale' && (
        <div className="grid grid-cols-10 gap-1">{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <button key={n} type="button" aria-label={`${n}`} aria-pressed={value === n} onClick={() => onChange(value === n ? null : n)} className={`${btn(value === n)} px-0 text-xs`}>{n}</button>)}</div>
      )}
      {q.kind === 'yesno' && (
        <div className="grid grid-cols-2 gap-2">{[true, false].map((b) => <button key={String(b)} type="button" aria-pressed={value === b} onClick={() => onChange(value === b ? null : b)} className={btn(value === b)}>{b ? 'Yes' : 'No'}</button>)}</div>
      )}
      {q.kind === 'number' && (
        <label className="flex items-center gap-2"><input inputMode="decimal" aria-label={q.prompt} value={value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className="min-h-10 w-28 rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-white" />{q.unit && <span className="text-sm text-white/50">{q.unit}</span>}</label>
      )}
      {q.kind === 'choice' && (
        <div className="flex flex-wrap gap-1.5">{(q.choices ?? []).map((c) => <button key={c} type="button" aria-pressed={value === c} onClick={() => onChange(value === c ? null : c)} className={`${btn(value === c)} px-3`}>{c}</button>)}</div>
      )}
      {q.kind === 'text' && (
        <textarea aria-label={q.prompt} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} maxLength={500} rows={2} className="w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white" />
      )}
    </fieldset>
  );
}

function OneForm({ f, api, onSent }: { f: FormView; api: string; onSent: () => void }) {
  const [a, setA] = useState<Record<string, AnswerValue>>(f.answers);
  const [h, setH] = useState<Record<string, AnswerValue>>(f.healthAnswers);
  const [open, setOpen] = useState(f.due);
  const [busy, setBusy] = useState(false);
  const set = (which: 'a' | 'h', id: string, v: AnswerValue | null) => (which === 'a' ? setA : setH)((m) => { const n = { ...m }; if (v === null || (typeof v === 'number' && !Number.isFinite(v))) delete n[id]; else n[id] = v; return n; });
  const send = async () => {
    setBusy(true);
    const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ formId: f.id, answers: a, ...(f.health?.allowed && Object.keys(h).length ? { health: h } : {}) }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) as { error?: string; message?: string } : {};
    setBusy(false);
    if (!r?.ok) { toast.error(j.message ?? (j.error === 'no_answers' ? 'Answer at least one question.' : 'Not sent. Try again.')); return; }
    toast.success(f.cadence === 'weekly' ? DONE_LINE : DONE_ONCE_LINE); setOpen(false); onSent();
  };
  return (
    <div className="space-y-3 rounded-lg bg-white/[0.03] p-3" data-checkin-card={f.id} data-due={f.due}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-2 text-left">
        <span className="text-sm text-white">{DUE_LINE(f.title, f.coachName)}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${f.due ? 'bg-[#FFB020]/15 text-[#FFB020]' : 'bg-fel-emerald/10 text-fel-emerald'}`}>{f.due ? 'Due' : 'Sent'}</span>
      </button>
      {open && (
        <div className="space-y-3">
          {f.questions.map((q) => <Field key={q.id} q={q} value={a[q.id]} onChange={(v) => set('a', q.id, v)} />)}
          <p className="text-[11px] text-fel-dim">{f.lines.seen}</p>
          {f.lines.skipped && <p className="text-[11px] text-fel-dim" data-checkin-skipped>{f.lines.skipped}</p>}
          {f.health && (
            <div className="space-y-3 rounded-lg border border-white/10 p-2" data-checkin-health>
              <p className="text-[11px] text-white/50">{f.health.line}</p>
              {f.health.allowed ? f.health.questions.map((q) => <Field key={q.id} q={q} value={h[q.id]} onChange={(v) => set('h', q.id, v)} />) : (
                <>
                  {f.health.consentLine && <p className="text-xs text-white/60">{f.health.consentLine}</p>}
                  <HealthConsentLockedNotice onGranted={onSent} />
                </>
              )}
            </div>
          )}
          {f.painCheck && <div className="rounded-lg border border-white/10 p-2" data-checkin-pain><PainCheckInChip exerciseName={`Check-in: ${f.title}`} kind="after" /></div>}
          {(f.questions.length > 0 || f.health?.allowed) && (
            <button type="button" disabled={busy} onClick={() => void send()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-fel-cyan/15 text-sm font-semibold text-fel-cyan" data-checkin-send>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {f.due ? 'Send to your coach' : 'Update answers'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CheckinCard({ api = MY_CHECKINS_API }: { api?: string }) {
  const [forms, setForms] = useState<FormView[] | null>(null);
  const load = useCallback(() => {
    fetch(api).then((r) => (r.ok ? r.json() : null)).then((j) => setForms(j?.available ? j.forms ?? [] : [])).catch(() => setForms([]));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  if (!forms) return null;
  if (!forms.length) return null;
  return (
    <section className="fel-card space-y-2 rounded-xl p-4" data-checkins-today>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-fel-dim"><ClipboardCheck className="h-3.5 w-3.5" /> Check-in</div>
      {forms.map((f) => <OneForm key={`${f.id}:${f.due}`} f={f} api={api} onSent={load} />)}
    </section>
  );
}
