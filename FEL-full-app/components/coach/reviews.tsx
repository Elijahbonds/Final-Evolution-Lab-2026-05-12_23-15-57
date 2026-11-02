'use client';
// COACH-DELIVERY COA-10 (2026-10-27): client reviews of a coach. ReviewForm sits on the coach's public page and shows ONLY to a
// verified adult whose package with this coach has ended (the server decides); CoachReviewsPanel is the coach's own list,
// text included, with hide/show. The public page shows the stars and the count (text stays with the coach until the shared
// text screen lands: lib/coach-business/reviews.ts REVIEW_TEXT_PUBLIC).
import { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { REVIEW_ERROR_COPY } from '@/lib/coach-business/reviewCopy';

export const REVIEWS_API = '/api/coach/reviews';

export function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`${n} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} style={{ width: size, height: size }} className={i <= Math.round(n) ? 'fill-[#FFD700] text-[#FFD700]' : 'text-white/25'} />)}
    </span>
  );
}

export function ReviewForm({ slug, api = REVIEWS_API }: { slug: string; api?: string }) {
  const [ctx, setCtx] = useState<{ eligible: boolean; mine: { stars: number; text: string | null } | null } | null>(null);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${api}?slug=${encodeURIComponent(slug)}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j?.available) { setCtx(j); if (j.mine) { setStars(j.mine.stars); setText(j.mine.text ?? ''); } }
    }).catch(() => null);
  }, [api, slug]);
  if (!ctx?.eligible) return null;
  const send = async () => {
    const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'review', slug, stars, text }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setMsg(r?.ok ? 'Thanks — your review is saved.' : REVIEW_ERROR_COPY[(j as { error?: string }).error ?? ''] ?? 'Not saved. Try again.');
  };
  return (
    <section className="mx-auto mt-6 max-w-3xl rounded-xl border border-white/10 p-4 text-white" data-review-form>
      <h2 className="text-sm font-bold">{ctx.mine ? 'Your review' : 'Review this coach'}</h2>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => <button key={i} type="button" aria-label={`${i} stars`} onClick={() => setStars(i)} className="min-h-10 min-w-10"><Star className={`h-6 w-6 ${i <= stars ? 'fill-[#FFD700] text-[#FFD700]' : 'text-white/30'}`} /></button>)}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={600} rows={3} placeholder="What was it like to train with them? (optional)" className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0d12] p-2 text-sm" />
      <button type="button" disabled={!stars} onClick={() => void send()} className="mt-2 min-h-10 rounded-lg bg-[#00E5FF]/15 px-4 text-sm text-[#00E5FF] disabled:opacity-40">Save review</button>
      {msg && <p className="mt-2 text-xs text-white/60">{msg}</p>}
    </section>
  );
}

interface Row { id: string; stars: number; text: string | null; status: string; name: string; updatedAt: string }

export function CoachReviewsPanel({ api = REVIEWS_API }: { api?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = useCallback(() => { fetch(api).then((r) => (r.ok ? r.json() : null)).then((j) => setRows(j?.available ? j.reviews : null)).catch(() => setRows(null)); }, [api]);
  useEffect(() => { load(); }, [load]);
  if (!rows?.length) return null;
  const avg = rows.filter((r) => r.status === 'shown').reduce((a, r, _i, all) => a + r.stars / all.length, 0);
  return (
    <details className="fel-card min-w-0 rounded-xl p-4" data-coach-reviews>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-white/40">Client reviews · {rows.length} <Stars n={avg} size={12} /></summary>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="min-w-0 rounded-lg border border-white/8 p-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-white"><Stars n={r.stars} size={12} /> {r.name}</span>
              <button type="button" className="min-h-9 rounded-md border border-white/15 px-2 text-white/60" onClick={() => void fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: r.status === 'shown' ? 'hide' : 'show', id: r.id }) }).then(load)}>{r.status === 'shown' ? 'Hide from my page' : 'Show on my page'}</button></div>
            {r.text && <p className="mt-1 break-words text-white/65">{r.text}</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}
