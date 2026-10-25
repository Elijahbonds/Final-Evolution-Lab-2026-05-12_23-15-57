'use client';

// FormReviewQueue — the coach's side of camera-assisted review (COACH-VIDEO-REVIEW, 2026-10-24).
//
// TrueCoach, ATG and CoachNow make a coach watch every client video by hand. Here the camera already counted the reps and
// found the bad one, so the queue opens on THE FLAGGED REP: the reason in words ("Left knee caves on rep 4"), the set's
// score, and the trend for that movement, before anything is opened. Opening a set replays the flagged rep as a skeleton
// beside the athlete's own best rep (no video exists to watch: lib/coach/formReview/payload.ts). The coach answers with
// a preset cue from the catalogue and a short note, posted to the program's thread, or marks it reviewed.
//
// Unreviewed first, flagged first (the server's order: lib/coach/formReview/store.ts SQL.queue). Reviewed sets stay
// listed under their own tab for two weeks.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ChevronDown, Loader2, ScanLine, Send } from 'lucide-react';
import type { PoseTrack } from '@/lib/coach/formReview/payload';
import type { RepFlag, ScoredRep, SetSummary } from '@/lib/coach/formReview/score';
import type { ReviewMovement } from '@/lib/coach/formReview/movements';
import { MOVEMENT_SPECS } from '@/lib/coach/formReview/movements';
import type { ReplyPreset } from '@/lib/coach/formReview/reply';
import { REPLY_NOTE_MAX } from '@/lib/coach/formReview/reply';
import { ageLabel, repChips, replayPick } from '@/lib/coach/formReview/view';
import { PoseReplay } from './pose-replay';

export const FORM_REVIEW_QUEUE_API = '/api/coach/form-reviews';
/** The anchor the attention board's count links to. */
export const FORM_REVIEW_ANCHOR = 'form-reviews';

export interface QueueItemView {
  id: string; clientId: string; clientName: string; programId: string; exerciseName: string; movement: ReviewMovement;
  reps: number; read: number; setScore: number | null; flags: RepFlag[]; status: 'unreviewed' | 'reviewed';
  createdAt: string; reviewedAt: string | null; trend: { line: string; points: { at: string; setScore: number | null }[] };
}
interface Detail { review: { id: string; aspect: number; reps: ScoredRep[]; flags: RepFlag[]; set: SetSummary; tracks: PoseTrack[] | null }; presets: ReplyPreset[] }

const CHIP: Record<string, string> = {
  clean: 'border-[#00FF9D]/40 text-[#00FF9D]', flagged: 'border-[#FFB020]/60 bg-[#FFB020]/10 text-[#FFB020]',
  minor: 'border-white/25 text-white/75', unread: 'border-white/10 text-white/35',
};

/** The trend's last few scores as a tiny bar row (estimated; a sorting aid, like the scores). */
function TrendBars({ points }: { points: { setScore: number | null }[] }) {
  if (points.length < 2) return null;
  return (
    <span className="inline-flex h-4 items-end gap-0.5 align-middle" aria-hidden data-trend-bars>
      {points.map((p, i) => (
        <span key={i} className="w-1.5 rounded-sm bg-[#00E5FF]/60" style={{ height: `${Math.max(10, p.setScore ?? 0)}%` }} />
      ))}
    </span>
  );
}

function Opened({ item, api, onReviewed }: { item: QueueItemView; api: string; onReviewed: (id: string) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [focus, setFocus] = useState<number | null>(item.flags[0]?.rep ?? null);
  const [cueId, setCueId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`${api}/${item.id}`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setFailed(true));
  }, [api, item.id]);
  const groups = useMemo(() => {
    const m = new Map<string, ReplyPreset[]>();
    for (const p of d?.presets ?? []) (m.get(p.group) ?? m.set(p.group, []).get(p.group)!).push(p);
    return [...m.entries()];
  }, [d]);
  if (failed) return <p className="text-xs text-[#FF3366]">This set could not be opened.</p>;
  if (!d) return <div className="flex justify-center py-4 text-white/40"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  const pick = replayPick(d.review.reps, d.review.flags, focus);
  const reply = async (markOnly: boolean) => {
    setBusy(true);
    const r = await fetch(`${api}/${item.id}/reply`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(markOnly ? { markOnly: true } : { cueId: cueId || null, note, rep: focus }),
    }).catch(() => null);
    setBusy(false);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) { toast.success(markOnly ? 'Marked reviewed' : `Sent to ${item.clientName}'s thread`); onReviewed(item.id); return; }
    toast.error(j.error === 'already_reviewed' ? 'Already reviewed' : j.error === 'reply_required' ? 'Pick a cue or write a note' : 'Could not send');
  };
  return (
    <div className="space-y-3 pt-2" data-review-open={item.id}>
      <ol className="flex flex-wrap gap-1.5" aria-label="Reps">
        {repChips(item.movement, d.review.reps, d.review.flags).map((c) => (
          <li key={c.n}>
            <button type="button" title={c.title} aria-label={c.title} onClick={() => setFocus(c.n)} data-rep-chip={c.tone}
              className={`min-h-9 min-w-9 rounded-lg border px-2 text-sm font-bold ${CHIP[c.tone]} ${focus === c.n ? 'ring-2 ring-white/60' : ''}`}>{c.n}</button>
          </li>
        ))}
      </ol>
      {pick && d.review.tracks ? <PoseReplay tracks={d.review.tracks} aspect={d.review.aspect} rep={pick.rep} best={pick.best} />
        : <p className="text-xs text-white/45">No replay kept for this set (replays are kept 90 days).</p>}
      {d.review.flags.length > 1 && (
        <ul className="space-y-1 text-xs text-white/70">
          {d.review.flags.map((f) => (
            <li key={f.rep}><button type="button" onClick={() => setFocus(f.rep)} className="text-left hover:text-white">{f.reason}{f.worst ? ' · worst' : ''}</button></li>
          ))}
        </ul>
      )}
      {item.status === 'unreviewed' ? (
        <div className="space-y-2" data-reply>
          <label className="block text-[11px] uppercase tracking-wider text-white/40" htmlFor={`cue-${item.id}`}>Cue from the catalogue</label>
          <select id={`cue-${item.id}`} value={cueId} onChange={(e) => setCueId(e.target.value)} data-reply-cue
            className="w-full min-w-0 rounded-lg border border-white/10 bg-[#0f0f13] px-2 py-2 text-sm text-white">
            <option value="">No cue</option>
            {groups.map(([g, ps]) => (
              <optgroup key={g} label={g}>{ps.map((p) => <option key={p.id} value={p.id}>{p.text}</option>)}</optgroup>
            ))}
          </select>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, REPLY_NOTE_MAX))} rows={2} maxLength={REPLY_NOTE_MAX}
            placeholder="A short note (optional)" aria-label="Note to your athlete" data-reply-note
            className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || (!cueId && !note.trim())} onClick={() => void reply(false)} data-reply-send
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#00E5FF] px-3 text-sm font-bold text-black disabled:opacity-40">
              <Send className="h-4 w-4" /> Send to the thread
            </button>
            <button type="button" disabled={busy} onClick={() => void reply(true)} data-reply-mark
              className="min-h-11 rounded-lg border border-white/15 px-3 text-sm text-white/75 disabled:opacity-40">Mark reviewed</button>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-[#00FF9D]"><CheckCircle2 className="h-3.5 w-3.5" /> Reviewed {item.reviewedAt ? ageLabel(item.reviewedAt) : ''}</p>
      )}
    </div>
  );
}

export function FormReviewQueue({ api = FORM_REVIEW_QUEUE_API }: { api?: string }) {
  const [data, setData] = useState<{ available: boolean; items: QueueItemView[] } | null>(null);
  const [tab, setTab] = useState<'unreviewed' | 'reviewed'>('unreviewed');
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(api).then((r) => (r.ok ? r.json() : null)).then((j) => setData(j ? { available: !!j.available, items: j.items ?? [] } : { available: false, items: [] })).catch(() => setData({ available: false, items: [] }));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  const waiting = data.items.filter((i) => i.status === 'unreviewed');
  const shown = data.items.filter((i) => i.status === tab);
  const reviewed = (id: string) => {
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === id ? { ...i, status: 'reviewed' as const, reviewedAt: new Date().toISOString() } : i)) });
    setOpen(null);
  };
  return (
    <div id={FORM_REVIEW_ANCHOR} className="fel-card space-y-3 rounded-xl p-4" data-form-review-queue>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><ScanLine className="h-3.5 w-3.5" /> Form reviews</div>
        <div className="text-xs text-[#FFD700]" data-review-count>{waiting.length} to review</div>
      </div>
      {!data.available ? (
        <p className="text-sm text-white/50" data-review-not-ready>Clients can film a set from Today and read their flags now. Sending sets here opens soon.</p>
      ) : (
        <>
          <div className="flex gap-1 rounded-lg bg-white/[0.03] p-1 text-xs">
            {(['unreviewed', 'reviewed'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                className={`min-h-9 flex-1 rounded-md ${tab === t ? 'bg-[#00E5FF]/15 text-[#00E5FF]' : 'text-white/50'}`}>
                {t === 'unreviewed' ? `To review (${waiting.length})` : 'Reviewed'}
              </button>
            ))}
          </div>
          {shown.length === 0 && <p className="text-sm text-white/50">{tab === 'unreviewed' ? 'Nothing waiting. Sets your clients film from Today land here, the flagged rep first.' : 'No reviewed sets in the last two weeks.'}</p>}
          {shown.map((it) => {
            const top = it.flags[0];
            return (
              <div key={it.id} className="rounded-lg border border-white/6 bg-white/[0.03] p-3" data-review-item={it.id}>
                <button type="button" onClick={() => setOpen((o) => (o === it.id ? null : it.id))} aria-expanded={open === it.id} className="block w-full text-left">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-sm text-white"><span className="font-medium">{it.clientName}</span> <span className="text-white/45">· {it.exerciseName} · {ageLabel(it.createdAt)}</span></span>
                      <span className={`mt-0.5 block text-sm font-semibold ${top ? 'text-[#FFB020]' : 'text-[#00FF9D]'}`} data-review-flag>
                        {top ? top.reason : `${it.reps} reps, no flags`}{it.flags.length > 1 ? ` · +${it.flags.length - 1} more` : ''}
                      </span>
                      <span className="mt-0.5 block text-xs text-white/50">
                        {it.setScore !== null ? `Set ${it.setScore}/100 · ` : ''}{it.reps} reps · {MOVEMENT_SPECS[it.movement].label} · {it.trend.line} <TrendBars points={it.trend.points} />
                      </span>
                    </span>
                    <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-white/40 transition-transform ${open === it.id ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {open === it.id && <Opened item={it} api={api} onReviewed={reviewed} />}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
