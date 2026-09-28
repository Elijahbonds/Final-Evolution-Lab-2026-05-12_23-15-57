'use client';

import { useState } from 'react';

interface Option { value: string; label: string }
type Issue = { field: string; message: string };

const input = 'mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#F5C518]/70';

/** Posts to /api/creator/inquiry. The server re-validates everything; these checks are only for the user. */
export function InquiryForm({ budgets, profile, source }: { budgets: readonly Option[]; profile: string | null; source: string }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'busy') return;
    const form = new FormData(e.currentTarget);
    const payload = {
      brand: String(form.get('brand') ?? ''),
      contactName: String(form.get('contactName') ?? ''),
      email: String(form.get('email') ?? ''),
      budgetRange: String(form.get('budgetRange') ?? ''),
      dates: String(form.get('dates') ?? ''),
      deliverables: String(form.get('deliverables') ?? ''),
      message: String(form.get('message') ?? ''),
      consent: form.get('consent') === 'on',
      website: String(form.get('website') ?? ''),
      source,
      profile: profile ?? undefined,
    };
    setStatus('busy');
    setMessage(null);
    setIssues([]);
    try {
      const res = await fetch('/api/creator/inquiry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        setMessage(typeof body?.error === 'string' ? body.error : 'Could not send that.');
        if (Array.isArray(body?.issues)) setIssues(body.issues as Issue[]);
        return;
      }
      setStatus('done');
      setMessage('Thanks. We read every inquiry and reply from a real inbox. There is no automatic reply.');
    } catch {
      setStatus('error');
      setMessage('Could not send that.');
    }
  }

  const issueFor = (field: string) => issues.find((i) => i.field === field)?.message;

  if (status === 'done') return <p className="mt-4 rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">{message}</p>;

  return (
    <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
      <label className="text-xs text-white/60">Brand
        <input name="brand" required maxLength={120} className={input} />
        {issueFor('brand') ? <span className="text-[#ff8b8b]">{issueFor('brand')}</span> : null}
      </label>
      <label className="text-xs text-white/60">Contact name
        <input name="contactName" required maxLength={120} autoComplete="name" className={input} />
        {issueFor('contactName') ? <span className="text-[#ff8b8b]">{issueFor('contactName')}</span> : null}
      </label>
      <label className="text-xs text-white/60">Email
        <input name="email" type="email" required maxLength={200} autoComplete="email" className={input} />
        {issueFor('email') ? <span className="text-[#ff8b8b]">{issueFor('email')}</span> : null}
      </label>
      <label className="text-xs text-white/60">Budget range
        <select name="budgetRange" required defaultValue="" className={input}>
          <option value="" disabled>Choose one</option>
          {budgets.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        {issueFor('budgetRange') ? <span className="text-[#ff8b8b]">Choose a budget range.</span> : null}
      </label>
      <label className="text-xs text-white/60 sm:col-span-2">Dates
        <input name="dates" maxLength={200} placeholder="Campaign window, event date, or flexible" className={input} />
      </label>
      <label className="text-xs text-white/60 sm:col-span-2">Deliverables
        <textarea name="deliverables" required maxLength={1000} rows={3} placeholder="Reels, stories, appearance, usage rights…" className={input} />
        {issueFor('deliverables') ? <span className="text-[#ff8b8b]">{issueFor('deliverables')}</span> : null}
      </label>
      <label className="text-xs text-white/60 sm:col-span-2">Message
        <textarea name="message" maxLength={4000} rows={4} className={input} />
      </label>
      {/* Honeypot: hidden from people, filled by bots. A filled value is accepted and dropped. */}
      <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="flex items-start gap-2 text-xs text-white/70 sm:col-span-2">
        <input name="consent" type="checkbox" required className="mt-0.5" />
        <span>
          I agree that Final Evolution Lab may store these details to reply to this inquiry.
          {issueFor('consent') ? <span className="ml-1 text-[#ff8b8b]">{issueFor('consent')}</span> : null}
        </span>
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={status === 'busy'} className="rounded-md bg-[#F5C518] px-5 py-2 text-sm font-semibold text-black hover:bg-[#ffd84a] disabled:opacity-60">
          {status === 'busy' ? 'Sending…' : 'Send inquiry'}
        </button>
        {message ? <p className="mt-2 text-xs text-[#ff8b8b]">{message}</p> : null}
      </div>
    </form>
  );
}
