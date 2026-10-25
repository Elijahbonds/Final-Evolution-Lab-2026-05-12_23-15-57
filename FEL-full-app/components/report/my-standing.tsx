'use client';

// SAFETY lane (SAF-05, 2026-10-25): the signed-in person's account standing on the support page — any warning, mute or
// ban, with its preset reason, when it ends, and the ONE appeal each allows. Preset fields only: never the report, a
// note, who reported or which admin decided. An appeal note box only for a verified adult (allowNote, from the page).
import { useEffect, useState } from 'react';
import { APPEAL_LABEL, APPEAL_REASONS, NOTE_MAX, REASON_LABEL, type AppealReason, type Standing } from '@/lib/safety/reportPresets';

const KIND_LABEL: Record<Standing['kind'], string> = { warn: 'Warning', mute: 'Muted', ban: 'Banned' };
const APPEAL_STATE: Record<Standing['appealStatus'], string> = { none: '', open: 'Appeal sent — we’ll look at it.', upheld: 'Appeal reviewed: the decision stands.', lifted: 'Appeal accepted: lifted.' };

export function MyStanding({ allowNote = false }: { allowNote?: boolean }) {
  const [rows, setRows] = useState<Standing[] | null>(null);
  const load = () => fetch('/api/report/appeal').then((r) => (r.ok ? r.json() : null)).then((b) => setRows(Array.isArray(b?.standing) ? b.standing : [])).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);
  if (!rows?.length) return null;
  return (
    <div className="mt-6 fel-panel rounded-xl p-5" data-testid="my-standing">
      <h2 className="fel-heading text-lg font-bold text-white">Your account</h2>
      <ul className="mt-3 space-y-3">
        {rows.map((s) => <StandingRow key={s.id} s={s} allowNote={allowNote} onDone={load} />)}
      </ul>
    </div>
  );
}

function StandingRow({ s, allowNote, onDone }: { s: Standing; allowNote: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AppealReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (!reason) return;
    const res = await fetch('/api/report/appeal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moderationId: s.id, reason, ...(allowNote && note.trim() ? { note: note.trim() } : {}) }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { setError(typeof out?.message === 'string' ? out.message : 'That didn’t send. Try again.'); return; }
    setOpen(false);
    onDone();
  };
  return (
    <li className="rounded-lg border border-white/10 bg-black/20 p-3" data-testid={`standing-${s.kind}`}>
      <p className="text-sm font-bold text-white">{KIND_LABEL[s.kind]} <span className="font-normal text-white/50">· {REASON_LABEL[s.reason]}</span></p>
      <p className="mt-0.5 text-xs text-white/50">
        {new Date(s.createdAt).toLocaleDateString()}
        {s.kind !== 'warn' && (s.active ? (s.endsAt ? ` · until ${new Date(s.endsAt).toLocaleDateString()}` : ' · until reviewed') : ' · no longer active')}
      </p>
      {s.appealStatus !== 'none' && <p className="mt-1 text-xs text-[#FFD700]">{APPEAL_STATE[s.appealStatus]}</p>}
      {s.canAppeal && !open && <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-bold text-[#00E5FF] underline underline-offset-2" data-testid="appeal-open">Appeal this</button>}
      {open && (
        <div className="mt-2" data-testid="appeal-form">
          <div className="flex flex-wrap gap-1.5">
            {APPEAL_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r}
                className={`rounded-full border px-2.5 py-1 text-[12px] ${reason === r ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-white' : 'border-white/15 text-white/70'}`}>{APPEAL_LABEL[r]}</button>
            ))}
          </div>
          {allowNote && <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} maxLength={NOTE_MAX} rows={2} placeholder="Anything to add? (optional)" className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-[13px] text-white outline-none" />}
          <button type="button" onClick={send} disabled={!reason} className="mt-2 rounded-lg bg-[#00E5FF] px-3 py-1.5 text-[12px] font-bold text-black disabled:opacity-50">Send appeal</button>
          {error && <p className="mt-1 text-[12px] text-[#FF3366]">{error}</p>}
        </div>
      )}
    </li>
  );
}
