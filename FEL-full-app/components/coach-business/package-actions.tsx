'use client';
// COACH-BUSINESS: the Book / Apply buttons on a coach's public page. Book starts a Stripe Checkout (only offered while
// payments are live for this coach); Apply sends a short application. A minor (or an unknown age) gets the guardian path
// back from the server and nothing is stored about them.
import { useState } from 'react';
import { MARKET_GOALS } from '@/lib/coach-business/market';
import type { PackageAction } from '@/lib/coach-business/packages';
import { loginPath } from '@/lib/auth/safeNext';
import { BUYER_TERMS } from '@/lib/payments/terms';

export const BUSINESS_API = '/api/coach/business';

type Sent = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; text: string } | { kind: 'error'; text: string };

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let json: Record<string, unknown> = {};
  try { json = await r.json(); } catch { /* empty */ }
  return { ok: r.ok, status: r.status, json };
}

function signInFirst(slug: string): string {
  return loginPath(`/coach/${slug}`);
}

export function BookButton({ slug, packageId }: { slug: string; packageId: string }) {
  const [sent, setSent] = useState<Sent>({ kind: 'idle' });
  // PAYMENTS-READY: the buyer ticks the store terms before Stripe is called (the server checks the same version).
  const [agreed, setAgreed] = useState(false);
  const terms = BUYER_TERMS.coach_package;
  const book = async () => {
    if (!agreed) return;
    setSent({ kind: 'busy' });
    const r = await post(`${BUSINESS_API}/checkout`, { packageId, termsAccepted: true, termsVersion: terms.version });
    if (r.status === 401) { window.location.href = signInFirst(slug); return; }
    if (r.ok && typeof r.json.url === 'string') { window.location.href = r.json.url; return; }
    if (r.status === 409 && r.json.error === 'terms_required') {
      setAgreed(false);
      setSent({ kind: 'error', text: 'The store terms were updated. Reload the page and tick the box again.' });
      return;
    }
    setSent({ kind: 'error', text: typeof r.json.message === 'string' ? r.json.message : 'Checkout could not start. Try again.' });
  };
  return (
    <div>
      <label className="mb-2 flex items-start gap-2 text-xs text-white/70" data-buyer-terms>
        <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>I agree to the <a className="font-bold text-cyan-300 underline" href={terms.href} target="_blank" rel="noopener noreferrer">store terms</a>.</span>
      </label>
      <button type="button" onClick={book} disabled={sent.kind === 'busy' || !agreed} data-action="book"
        className="min-h-11 rounded-xl bg-cyan-300 px-4 text-sm font-bold text-black disabled:opacity-60">
        {sent.kind === 'busy' ? 'Opening checkout…' : 'Book'}
      </button>
      {sent.kind === 'error' ? <p role="alert" className="mt-2 text-sm text-amber-200">{sent.text}</p> : null}
    </div>
  );
}

export function ApplyForm({ slug, packageId, label = 'Apply' }: { slug: string; packageId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState<string>(MARKET_GOALS[0][0]);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState<Sent>({ kind: 'idle' });
  const send = async () => {
    setSent({ kind: 'busy' });
    const r = await post(`${BUSINESS_API}/apply`, { slug, goal, note, ...(packageId ? { packageId } : {}) });
    if (r.status === 401) { window.location.href = signInFirst(slug); return; }
    if (r.ok) { setSent({ kind: 'done', text: 'Sent. The coach will reply by email.' }); return; }
    setSent({ kind: 'error', text: typeof r.json.message === 'string' ? r.json.message : 'That did not send. Try again.' });
  };
  if (sent.kind === 'done') return <p role="status" className="text-sm font-bold text-emerald-300">{sent.text}</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-action="apply"
        className="min-h-11 rounded-xl border border-cyan-300/60 px-4 text-sm font-bold text-cyan-200">
        {label}
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3" data-apply-form>
      <label className="block text-xs font-bold uppercase tracking-wider text-white/50" htmlFor={`goal-${packageId ?? 'any'}`}>Your goal</label>
      <select id={`goal-${packageId ?? 'any'}`} value={goal} onChange={(e) => setGoal(e.target.value)}
        className="min-h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm text-white">
        {MARKET_GOALS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <label className="block text-xs font-bold uppercase tracking-wider text-white/50" htmlFor={`note-${packageId ?? 'any'}`}>A note for the coach (optional)</label>
      <textarea id={`note-${packageId ?? 'any'}`} value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm text-white" />
      <p className="text-xs text-white/50">The coach sees your name, email, goal and note.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={send} disabled={sent.kind === 'busy'} className="min-h-11 rounded-xl bg-cyan-300 px-4 text-sm font-bold text-black disabled:opacity-60">
          {sent.kind === 'busy' ? 'Sending…' : 'Send application'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl px-3 text-sm text-white/60">Cancel</button>
      </div>
      {sent.kind === 'error' ? <p role="alert" className="text-sm text-amber-200">{sent.text}</p> : null}
    </div>
  );
}

export function PackageCta({ slug, packageId, action }: { slug: string; packageId: string; action: PackageAction }) {
  if (action === 'full') return <p className="text-sm font-bold text-white/50">Full right now</p>;
  if (action === 'book') return <BookButton slug={slug} packageId={packageId} />;
  return <ApplyForm slug={slug} packageId={packageId} />;
}
