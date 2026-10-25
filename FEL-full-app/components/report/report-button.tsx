'use client';

// SAFETY lane (SAF-05, 2026-10-25): the "Report" control mounted where people meet — a profile, a squad's feed, a
// challenge result. Preset reasons only; a short note box appears only when the page says both sides are verified
// adults (allowNote) — no free text from or about a minor. The answer is always the same thank-you, so the button says
// nothing about whether the report was new, a repeat or about someone who exists (lib/safety/reports.ts).
import { useState } from 'react';
import { Check, Flag, Loader2 } from 'lucide-react';
import { REASON_LABEL, REPORT_REASONS, NOTE_MAX, type ReportReason, type ReportTarget } from '@/lib/safety/reportPresets';

export function ReportButton({ target, refId, allowNote = false, label = 'Report' }: { target: ReportTarget; refId: string; allowNote?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!reason) return;
    setState('working');
    setError(null);
    try {
      const res = await fetch('/api/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, ref: refId, reason, ...(allowNote && note.trim() ? { note: note.trim() } : {}) }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 429 ? 'That’s a lot of reports in a short time. Try again later.' : res.status === 401 ? 'Sign in to report.' : typeof out?.message === 'string' ? out.message : 'That didn’t send. Try again.');
        setState('error');
        return;
      }
      setState('done');
    } catch {
      setError('No connection. Try again in a moment.');
      setState('error');
    }
  };

  if (state === 'done') {
    return <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#00FF9D]" data-testid="report-sent"><Check className="h-3.5 w-3.5" /> Thanks. Our team will look at it.</p>;
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/45 hover:text-white/80" data-testid="report-open">
        <Flag className="h-3.5 w-3.5" /> {label}
      </button>
    );
  }
  return (
    <div className="mt-2 w-full max-w-sm rounded-xl border border-white/10 bg-[#0b0b0b] p-3 text-left" data-testid="report-form">
      <p className="text-[13px] font-bold text-white">What’s wrong?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {REPORT_REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r}
            className={`rounded-full border px-2.5 py-1 text-[12px] ${reason === r ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-white' : 'border-white/15 text-white/70'}`}>
            {REASON_LABEL[r]}
          </button>
        ))}
      </div>
      {allowNote && (
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} maxLength={NOTE_MAX} rows={2}
          placeholder="Anything we should know? (optional)" className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-[13px] text-white outline-none" />
      )}
      <p className="mt-2 text-[11px] text-white/45">They won’t be told who reported them.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={send} disabled={!reason || state === 'working'} className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF3366] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">
          {state === 'working' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Send report
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-white/70">Cancel</button>
      </div>
      {error && <p className="mt-2 text-[12px] text-[#FF3366]">{error}</p>}
    </div>
  );
}
