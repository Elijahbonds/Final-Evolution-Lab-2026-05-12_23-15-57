'use client';

// CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06): the review queue's working surface. One list per view, one card open at
// a time: preview it (audio from the private bucket through short-lived links the server signs), write a note, decide.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { QueueItem, QueueView } from '@/lib/soundtrack/reviewQueue';
import { DISCIPLINES } from '@/lib/creator/creative-card-types';

const VIEWS: { id: QueueView; label: string }[] = [
  { id: 'pending', label: 'Waiting' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'rotation', label: 'In rotation' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

type Preview = { card: { art: Record<string, unknown> }; media: Record<string, string> };

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export function ReviewBoard() {
  const [view, setView] = useState<QueueView>('pending');
  const [discipline, setDiscipline] = useState<string>('');
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [approver, setApprover] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    const q = new URLSearchParams({ view, ...(discipline ? { discipline } : {}) });
    const res = await fetch(`/api/v1/creative-card/review-queue?${q}`);
    if (!res.ok) { toast.error(`Queue failed (${res.status})`); setItems([]); return; }
    const data = await res.json();
    setItems(data.items ?? []);
    setApprover(!!data.canApprove);
  }, [view, discipline]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" onClick={() => { setView(v.id); setOpen(null); }}
            className={`rounded-lg px-3 py-1.5 font-mono text-xs uppercase tracking-wider ${view === v.id ? 'bg-[#00E5FF] text-[#050505]' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>
            {v.label}
          </button>
        ))}
        <select aria-label="Discipline" value={discipline} onChange={(e) => setDiscipline(e.target.value)}
          className="ml-auto rounded-lg bg-white/5 px-2 py-1.5 font-mono text-xs text-white/80">
          <option value="">All disciplines</option>
          {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      {!approver && items && <p className="mt-3 text-xs text-amber-300/80">You can flag cards for the founder or an admin. Approving is theirs.</p>}

      <ul className="mt-4 flex flex-col gap-2">
        {items === null && <li className="text-sm text-white/40">Loading…</li>}
        {items?.length === 0 && <li className="text-sm text-white/40">Nothing here.</li>}
        {items?.map((it) => (
          <li key={it.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen(open === it.id ? null : it.id)}>
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-white/70">{it.primary}</span>
              <span className="font-semibold text-white">{it.title}</span>
              <span className="text-xs text-white/50">by {it.owner.name}</span>
              {it.staysPrivate && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">stays private: under 18 or age unknown</span>}
              {!it.staysPrivate && !it.wantsPublic && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">creator chose private</span>}
              {it.flags > 0 && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-200">{it.flags} flag{it.flags > 1 ? 's' : ''}</span>}
              {it.rotation && it.rotation !== 'pulled' && <span className="rounded bg-[#00E5FF]/20 px-1.5 py-0.5 text-[10px] text-[#9ff3ff]">{it.rotation === 'featured' ? 'featured' : 'in rotation'}</span>}
              {it.plays > 0 && <span className="text-[10px] text-white/40">{it.plays} plays</span>}
              <span className="ml-auto font-mono text-[10px] text-white/30">{new Date(it.createdAt).toLocaleString()}</span>
            </button>
            {open === it.id && <ReviewDetail item={it} approver={approver} onDone={() => { setOpen(null); void load(); }} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewDetail({ item, approver, onDone }: { item: QueueItem; approver: boolean; onDone: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [note, setNote] = useState('');
  const [rotation, setRotation] = useState<'none' | 'on' | 'featured'>(item.primary === 'music' ? 'on' : 'none');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/v1/creative-card/${encodeURIComponent(item.id)}?preview=1`)
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (live) setPreview(d); }).catch(() => {});
    return () => { live = false; };
  }, [item.id]);

  const act = async (url: string, body: unknown, done: string) => {
    setBusy(true);
    const { ok, data } = await post(url, body);
    setBusy(false);
    if (!ok) { toast.error(data?.error ?? 'Failed'); return; }
    toast.success(done);
    onDone();
  };
  const review = (decision: 'approved' | 'rejected' | 'flag') => act(
    `/api/v1/creative-card/${encodeURIComponent(item.id)}/review`,
    { decision, note, ...(decision === 'approved' && rotation !== 'none' ? { rotation } : {}) },
    decision === 'flag' ? 'Flagged for review' : decision === 'approved' ? 'Approved' : 'Rejected',
  );
  const rotate = (r: 'on' | 'featured' | 'pulled') => act(`/api/v1/creative-card/${encodeURIComponent(item.id)}/rotation`, { rotation: r },
    r === 'pulled' ? 'Pulled from rotation' : r === 'featured' ? 'Featured' : 'In rotation');

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      {item.review && <p className="mb-2 text-xs text-white/50">Last decision: {item.review.decision}{item.review.note ? ` — “${item.review.note}”` : ''}</p>}
      {item.lastFlag && <p className="mb-2 text-xs text-red-200/80">Flag: {item.lastFlag.note ?? '(no note)'}</p>}
      {preview ? <CardPreview art={preview.card.art} media={preview.media} /> : <p className="text-xs text-white/40">Loading preview…</p>}

      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2}
        placeholder="Note to the creator (shown to them, never public)"
        className="mt-3 w-full rounded-lg bg-white/5 p-2 text-sm text-white placeholder:text-white/30" />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {approver && item.reviewState !== 'approved' && (
          <>
            {item.primary === 'music' && (
              <select aria-label="Soundtrack rotation" value={rotation} onChange={(e) => setRotation(e.target.value as typeof rotation)}
                className="rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white/80">
                <option value="on">Add to rotation</option>
                <option value="featured">Feature in rotation</option>
                <option value="none">Approve without rotation</option>
              </select>
            )}
            <button type="button" disabled={busy} onClick={() => review('approved')} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-[#050505] disabled:opacity-50">Approve</button>
          </>
        )}
        {approver && item.reviewState !== 'rejected' && (
          <button type="button" disabled={busy} onClick={() => review('rejected')} className="rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
            {item.reviewState === 'approved' ? 'Take down (reject)' : 'Reject'}
          </button>
        )}
        {approver && item.primary === 'music' && item.reviewState === 'approved' && (
          <>
            {item.rotation !== 'featured' && <button type="button" disabled={busy} onClick={() => rotate('featured')} className="rounded-lg bg-[#00E5FF] px-3 py-1.5 text-xs font-bold text-[#050505] disabled:opacity-50">Feature in rotation</button>}
            {item.rotation !== 'on' && <button type="button" disabled={busy} onClick={() => rotate('on')} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white disabled:opacity-50">{item.rotation === 'featured' ? 'Unfeature' : 'Add to rotation'}</button>}
            {(item.rotation === 'on' || item.rotation === 'featured') && <button type="button" disabled={busy} onClick={() => rotate('pulled')} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white disabled:opacity-50">Pull from rotation</button>}
          </>
        )}
        <button type="button" disabled={busy} onClick={() => review('flag')} className="ml-auto rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/70 disabled:opacity-50">Flag</button>
      </div>
    </div>
  );
}

function CardPreview({ art, media }: { art: Record<string, unknown>; media: Record<string, string> }) {
  const src = (u: unknown) => (typeof u === 'string' && u ? media[u] ?? u : null);
  const audio = (u: unknown, label: string) => {
    const s = src(u);
    return s ? <div key={label} className="flex items-center gap-2 text-xs text-white/60">{label}<audio controls preload="none" src={s} className="h-8 max-w-full" /></div> : null;
  };
  switch (art.kind) {
    case 'music':
      return (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-white/60">{typeof art.bpm === 'number' ? `${art.bpm} BPM` : ''} {typeof art.durationSec === 'number' ? `· ${Math.round(art.durationSec as number)} s` : ''}</p>
          {audio(art.mixUrl, 'Mix')}
          {Array.isArray(art.stemUrls) && (art.stemUrls as string[]).map((u, i) => audio(u, `Stem ${i + 1}`))}
        </div>
      );
    case 'acting': return audio(art.performanceUrl, 'Line') ?? <p className="text-xs text-white/40">No audio.</p>;
    case 'art': {
      const s = src(art.canvasDataUrl);
      return s ? <img src={s} alt="Artwork" className="max-h-64 rounded-lg" /> : null;
    }
    case 'writing': return <p className="whitespace-pre-wrap text-sm text-white/80">{String(art.text ?? '')}</p>;
    case 'scene':
      return (
        <ol className="list-decimal pl-5 text-xs text-white/70">
          {((art.questions as { prompt: string; options: string[]; answer: number }[]) ?? []).map((q, i) => (
            <li key={i}>{q.prompt} — <span className="text-white/50">{q.options.map((o, k) => (k === q.answer ? `[${o}]` : o)).join(' / ')}</span></li>
          ))}
        </ol>
      );
    case 'cooking':
      return <p className="text-xs text-white/70">{((art.ingredients as string[]) ?? []).join(', ')} — {((art.steps as string[]) ?? []).length} steps</p>;
    default:
      return <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 text-[10px] text-white/60">{JSON.stringify(art, null, 1)}</pre>;
  }
}
